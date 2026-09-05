import { resolveTypertGateway } from './dsh-protocol-compat.js';
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const MAX_SESSION_SUBSCRIPTIONS = 64;
function recordOf(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function stringOf(value) {
    return typeof value === 'string' ? value : '';
}
/** Convert one new Host event into the released mini-program vocabulary. */
export function legacyHostPayload(frame) {
    if (frame.type !== 'emit')
        return null;
    const args = Array.isArray(frame.args) ? frame.args : [];
    switch (frame.event) {
        case 'api-session/added':
            return { type: 'host/session-added', session: args[0] };
        case 'api-session/removed':
            return { type: 'host/session-removed', sessionId: args[0] };
        case 'api-session/status':
            return { type: 'host/session-status', sessionId: args[0], running: args[1] === true };
        case 'api-session/error':
            return { type: 'host/agent-error', sessionId: args[0], message: args[1] };
        case 'commands/change':
        case 'agent-preset/selected':
        case 'llm/adapters-updated':
        case 'settings/document-updated':
            return { type: 'host/remote-event', event: frame.event, args };
        default:
            return null;
    }
}
/**
 * One process-local adapter for the two pre-0.1.2 downlinks. It consumes the
 * new reconnect-safe streams but emits only the long-lived client contract.
 */
export class DshRealtimeCompatibility {
    ctx;
    sockets = new Set();
    knownSessions = new Map();
    pending = new Map();
    remoteOwner;
    disposed = false;
    constructor(ctx) {
        this.ctx = ctx;
    }
    attach(path, socket) {
        const detach = this.connect(path, socket);
        socket.once('close', detach);
        socket.once('error', detach);
        socket.on('message', () => socket.close(1003, 'downlink only'));
    }
    connect(path, socket) {
        if (this.disposed) {
            socket.close(1012, 'adapter stopping');
            return () => { };
        }
        const state = {
            socket,
            kind: path.endsWith('.mux') ? 'mux' : 'host',
            lifetime: new AbortController(),
            sessionLifetimes: new Map(),
        };
        this.sockets.add(state);
        if (state.kind === 'host')
            this.run(state, () => this.followWorkspace(state));
        else {
            this.run(state, () => this.followControl(state));
            for (const sessionId of this.knownSessions.keys())
                this.startSession(state, sessionId);
            for (const [eventId, values] of this.pending) {
                const pending = values[0];
                if (pending)
                    this.send(state, pending.payload, eventId);
            }
        }
        this.ensureRemoteEvents();
        return () => this.remove(state);
    }
    subscribeSession(sessionId) {
        if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256)
            return;
        this.knownSessions.delete(sessionId);
        this.knownSessions.set(sessionId, Date.now());
        while (this.knownSessions.size > MAX_SESSION_SUBSCRIPTIONS) {
            const oldest = this.knownSessions.keys().next().value;
            if (!oldest)
                break;
            this.knownSessions.delete(oldest);
            for (const state of this.sockets) {
                state.sessionLifetimes.get(oldest)?.abort(new Error('subscription evicted'));
                state.sessionLifetimes.delete(oldest);
            }
        }
        for (const state of this.sockets) {
            if (state.kind === 'mux')
                this.startSession(state, sessionId);
        }
    }
    async respond(value) {
        const body = recordOf(value);
        const rpcId = stringOf(body?.rpcId);
        if (body?.type !== 'client-response' || !rpcId) {
            return { accepted: false, reason: 'invalid client response' };
        }
        const candidates = this.pending.get(rpcId);
        const target = candidates?.find(candidate => [...this.sockets].some(state => state.clientId === candidate.clientId));
        if (!target)
            return { accepted: false, reason: 'request is no longer pending' };
        const result = recordOf(body.result);
        let outcome;
        if (result?.ok === true) {
            const legacyValue = recordOf(result.value);
            const valueForHost = target.event === 'approval/request'
                ? legacyValue?.outcome
                : legacyValue?.answer;
            outcome = valueForHost === undefined
                ? { kind: 'result' }
                : { kind: 'result', value: valueForHost };
        }
        else {
            const failure = recordOf(result?.error);
            outcome = {
                kind: 'rejected',
                error: {
                    name: 'Error',
                    message: stringOf(failure?.message) || 'client cancelled',
                    ...(stringOf(failure?.code) ? { code: failure?.code } : {}),
                    ...failure && Object.hasOwn(failure, 'details') ? { details: failure.details } : {},
                },
            };
        }
        try {
            const reply = await this.dispatchRemoteEventResult({
                clientId: target.clientId,
                eventId: target.eventId,
                outcome,
            });
            if (!reply.ok)
                return { accepted: false, reason: reply.message };
            return { accepted: true };
        }
        catch (error) {
            return {
                accepted: false,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const state of [...this.sockets]) {
            this.remove(state);
            try {
                state.socket.close(1001, 'adapter disposed');
            }
            catch { /* best effort */ }
        }
        this.pending.clear();
    }
    gateway() {
        const gateway = resolveTypertGateway(this.ctx);
        if (!gateway)
            throw new Error('DSH Typert Gateway is unavailable');
        return gateway;
    }
    run(state, task, signal = state.lifetime.signal) {
        void task().then(() => {
            if (!signal.aborted && !this.disposed)
                throw new Error('DSH event source ended unexpectedly');
        }).catch((error) => {
            if (signal.aborted || state.lifetime.signal.aborted || this.disposed)
                return;
            console.warn('[wechat-gate] legacy realtime adapter failed:', error instanceof Error ? error.message : String(error));
            this.remove(state);
            try {
                state.socket.close(1011, 'DSH realtime unavailable');
            }
            catch { /* best effort */ }
        });
    }
    ensureRemoteEvents() {
        if (this.remoteOwner || this.disposed)
            return;
        const state = this.sockets.values().next().value;
        if (!state)
            return;
        this.remoteOwner = state;
        this.run(state, () => this.followRemoteEvents(state));
    }
    remove(state) {
        if (!this.sockets.delete(state))
            return;
        state.lifetime.abort(new Error('socket closed'));
        for (const controller of state.sessionLifetimes.values()) {
            controller.abort(new Error('socket closed'));
        }
        state.sessionLifetimes.clear();
        if (state.clientId) {
            for (const [eventId, values] of this.pending) {
                const next = values.filter(value => value.clientId !== state.clientId);
                if (next.length)
                    this.pending.set(eventId, next);
                else
                    this.pending.delete(eventId);
            }
        }
        if (this.remoteOwner === state) {
            this.remoteOwner = undefined;
            this.ensureRemoteEvents();
        }
    }
    send(state, payload, rpcId) {
        if (state.socket.readyState !== 1)
            return;
        if (state.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
            this.remove(state);
            state.socket.close(1009, 'realtime consumer is too slow');
            return;
        }
        state.socket.send(JSON.stringify({
            type: 'server-event',
            ...(rpcId ? { rpcId } : {}),
            payload,
        }));
    }
    async followWorkspace(state) {
        const iterable = await this.gateway().stream({
            namespace: 'workspace', method: 'follow', args: {}, signal: state.lifetime.signal,
        });
        for await (const raw of iterable) {
            const frame = recordOf(raw);
            if (!frame || frame.type === 'baseline')
                continue;
            if (frame.type === 'upsert')
                this.send(state, { type: 'host/workspace-changed', workspace: frame.workspace });
            else if (frame.type === 'remove')
                this.send(state, { type: 'host/workspace-removed', workspaceId: frame.workspaceId });
            else if (frame.type === 'order')
                this.send(state, { type: 'host/workspace-order-changed', workspaceIds: frame.workspaceIds });
            else if (frame.type === 'archived')
                this.send(state, { type: 'host/archived-sessions-changed', archivedSessionIds: frame.archivedSessionIds });
        }
    }
    async followControl(state) {
        const iterable = await this.gateway().stream({
            namespace: 'session', method: 'control', args: {}, signal: state.lifetime.signal,
        });
        for await (const raw of iterable)
            this.controlFrame(state, recordOf(raw));
    }
    controlFrame(state, frame) {
        if (!frame)
            return;
        if (frame.type === 'baseline') {
            const value = recordOf(frame.value);
            const queues = recordOf(value?.queues) ?? {};
            for (const [sessionId, items] of Object.entries(queues)) {
                this.send(state, { type: 'session/queue', sessionId, items });
            }
            const projections = recordOf(value?.projections) ?? {};
            for (const [sessionId, rawBlock] of Object.entries(projections)) {
                const block = recordOf(rawBlock);
                const values = recordOf(block?.values) ?? {};
                for (const [key, value] of Object.entries(values)) {
                    this.send(state, {
                        type: 'session/projection', sessionId, key, value,
                        seq: Number.isSafeInteger(block?.asOfSeq) ? block?.asOfSeq : 0,
                    });
                }
            }
            return;
        }
        if (frame.type === 'queue') {
            this.send(state, {
                type: 'session/queue', sessionId: frame.sessionId, items: frame.items,
            });
        }
        else if (frame.type === 'projection') {
            this.send(state, {
                type: 'session/projection', sessionId: frame.sessionId,
                key: frame.key, value: frame.value, seq: frame.seq,
            });
        }
    }
    startSession(state, sessionId) {
        if (state.sessionLifetimes.has(sessionId))
            return;
        const controller = new AbortController();
        const combined = AbortSignal.any([state.lifetime.signal, controller.signal]);
        state.sessionLifetimes.set(sessionId, controller);
        this.run(state, async () => {
            try {
                const iterable = await this.gateway().stream({
                    namespace: 'session',
                    method: 'follow',
                    args: { request: { address: { kind: 'session', sessionId }, maxMessages: 1 } },
                    signal: combined,
                });
                for await (const raw of iterable) {
                    const frame = recordOf(raw);
                    if (frame?.type === 'snapshot') {
                        this.send(state, {
                            type: 'session/subscribed', sessionId,
                            lastSeq: Number.isSafeInteger(frame.cursor) ? frame.cursor : -1,
                        });
                    }
                    else if (frame?.type === 'event' && recordOf(frame.event)) {
                        this.send(state, { type: 'session/event', sessionId, event: frame.event });
                    }
                }
            }
            finally {
                if (state.sessionLifetimes.get(sessionId) === controller) {
                    state.sessionLifetimes.delete(sessionId);
                }
            }
        }, combined);
    }
    async followRemoteEvents(state) {
        const wire = this.gateway().wireStream;
        if (!wire)
            throw new Error('DSH Remote Event stream is unavailable');
        const iterable = await wire.open('$events', { args: {} }, state.lifetime.signal);
        for await (const raw of iterable) {
            if (state.lifetime.signal.aborted)
                return;
            const frame = recordOf(raw);
            if (!frame)
                continue;
            if (frame.type === 'ready') {
                state.clientId = stringOf(frame.clientId);
                continue;
            }
            const host = legacyHostPayload(frame);
            if (host) {
                for (const target of this.sockets) {
                    if (target.kind === 'host')
                        this.send(target, host);
                }
                continue;
            }
            if (frame.type === 'waterfall')
                this.pendingWaterfall(state, frame);
            else if (frame.type === 'cancel')
                this.cancelPending(stringOf(frame.eventId));
        }
    }
    pendingWaterfall(state, frame) {
        const event = frame.event;
        if (event !== 'approval/request' && event !== 'user-questions/request')
            return;
        const eventId = stringOf(frame.eventId);
        const clientId = state.clientId || '';
        const sessionId = stringOf(frame.agentId);
        const request = recordOf(frame.request) ?? {};
        if (!eventId || !clientId || !sessionId)
            return;
        const approvalId = event === 'approval/request'
            ? stringOf(request.callId) || eventId
            : undefined;
        const payload = event === 'approval/request'
            ? {
                type: 'approval/requested', sessionId, approvalId,
                toolName: request.toolName, reason: request.reason,
            }
            : { type: 'question/requested', sessionId, questions: request.questions };
        const pending = {
            clientId, eventId, event, sessionId,
            payload,
            ...(approvalId ? { approvalId } : {}),
        };
        const values = this.pending.get(eventId) ?? [];
        values.push(pending);
        this.pending.set(eventId, values);
        for (const target of this.sockets) {
            if (target.kind === 'mux')
                this.send(target, payload, eventId);
        }
    }
    cancelPending(eventId) {
        const values = this.pending.get(eventId);
        if (!values)
            return;
        this.pending.delete(eventId);
        const seen = new Set();
        for (const pending of values) {
            const key = `${pending.event}\0${pending.sessionId}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            for (const state of this.sockets) {
                if (state.kind !== 'mux')
                    continue;
                this.send(state, pending.event === 'approval/request'
                    ? { type: 'approval/resolved', sessionId: pending.sessionId, approvalId: pending.approvalId }
                    : { type: 'question/resolved', sessionId: pending.sessionId, questionRpcId: eventId }, eventId);
            }
        }
    }
    async dispatchRemoteEventResult(args) {
        const connection = this.ctx.get('connection');
        const handler = connection?.createSharedFetchHandler?.('/api');
        if (!handler)
            throw new Error('DSH Connection RPC bridge is unavailable');
        const rpcId = `wechat-response-${Date.now().toString(36)}`;
        const response = await handler.fetch(new Request('http://dsh.local/api/$events/result', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                type: 'client-request', rpcId, method: '$events/result', payload: { args },
            }),
        }));
        if (response.status !== 200)
            return { ok: false, message: `DSH response HTTP ${response.status}` };
        const body = recordOf(await response.json());
        const result = recordOf(body?.result);
        if (result?.ok === true)
            return { ok: true };
        const error = recordOf(result?.error);
        return { ok: false, message: stringOf(error?.message) || 'DSH rejected the response' };
    }
}
