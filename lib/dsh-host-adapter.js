/**
 * Capability-selected DSH transport used by the WeChat gate.
 *
 * DSH 0.1.1 exposes the legacy dot-named API and two WebSocket downlinks.
 * DSH 0.1.2 exposes authenticated slash-named Remote RPC plus multiplexed
 * in-process streams.  This module is the only place that knows both shapes.
 * The mini program-facing contract remains the legacy one.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
const MAX_HTTP_BODY_BYTES = 64 * 1024 * 1024;
const MAX_EVENT_BYTES = 1024 * 1024;
const LEGACY_TIMEOUT_MS = 60_000;
/** One process-owned adapter. Capability selection is centralized and sticky. */
export class DshHostAdapterRuntime {
    modeValue = 'probing';
    modern = null;
    legacy;
    disposed = false;
    constructor(ctx, dshPort = 3080) {
        this.legacy = new LegacyDshAdapter(dshPort);
        try {
            ctx.inject(['connection'], (scope) => {
                if (this.disposed)
                    return;
                const connection = scope.connection;
                if (isModernConnection(connection)) {
                    this.modeValue = 'probing';
                    const modernFiber = ctx.inject(['typertGateway'], (gatewayScope) => {
                        const gateway = gatewayScope.typertGateway;
                        if (!isModernGateway(gateway) || this.disposed) {
                            this.modeValue = 'unavailable';
                            return;
                        }
                        const selected = new ModernDshAdapter(connection, gateway);
                        this.modern = selected;
                        this.modeValue = 'modern';
                        return () => {
                            if (this.modern === selected) {
                                selected.dispose();
                                this.modern = null;
                                if (!this.disposed)
                                    this.modeValue = 'probing';
                            }
                        };
                    });
                    return () => modernFiber.dispose();
                }
                if (isLegacyConnection(connection)) {
                    this.modeValue = 'legacy';
                    return () => {
                        if (!this.disposed && this.modeValue === 'legacy')
                            this.modeValue = 'probing';
                    };
                }
                this.modeValue = 'unavailable';
            });
        }
        catch {
            this.modeValue = 'unavailable';
        }
    }
    get mode() {
        return this.modeValue;
    }
    get usesModernTransport() {
        return this.modeValue === 'modern' && this.modern !== null;
    }
    dispose() {
        this.disposed = true;
        this.modern?.dispose();
        this.modern = null;
        this.modeValue = 'unavailable';
    }
    /** Invoke one legacy mini-program RPC through the selected official Host API. */
    call(method, payload, signal = new AbortController().signal, rpcId = `wechat-${randomUUID()}`) {
        if (this.modern)
            return this.modern.call(method, payload, signal, rpcId);
        if (this.modeValue === 'legacy')
            return this.legacy.call(method, payload, signal, rpcId);
        return Promise.resolve(unavailable('DSH Host API capability is not ready'));
    }
    /** Fetch-shaped carrier used by both the LAN door and public E2EE tunnel. */
    fetch(request) {
        if (this.modern)
            return this.modern.fetch(request);
        if (this.modeValue === 'legacy')
            return this.legacy.fetch(request);
        return Promise.resolve(Response.json({
            result: unavailable('DSH Host API capability is unavailable'),
        }, { status: 503 }));
    }
    /** Legacy events.host/events.mux stream, synthesized on modern DSH. */
    events(path, signal) {
        if (this.modern)
            return this.modern.events(path, signal);
        if (this.modeValue === 'legacy')
            return this.legacy.events(path, signal);
        throw new Error('DSH realtime capability is unavailable');
    }
}
/** 0.1.1 adapter: every old contract remains owned by the official loopback API. */
class LegacyDshAdapter {
    dshPort;
    constructor(dshPort) {
        this.dshPort = dshPort;
    }
    async call(method, payload, signal, rpcId) {
        const response = await this.fetch({
            path: `/api/${method}`,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify({
                type: 'client-request', rpcId, method, payload,
            })),
            signal,
        });
        if (response.status !== 200)
            return unavailable(`DSH API HTTP ${response.status}`);
        const body = await response.json();
        return body.result ?? unavailable('DSH API returned an invalid response');
    }
    fetch(request) {
        return nodeFetch(this.dshPort, request);
    }
    events(path, signal) {
        return websocketEvents(`ws://127.0.0.1:${this.dshPort}${path}`, signal);
    }
}
/** 0.1.2 adapter: official shared Fetch handler plus official Remote streams. */
class ModernDshAdapter {
    gateway;
    fetchHandler;
    eventsHub;
    constructor(connection, gateway) {
        this.gateway = gateway;
        this.fetchHandler = connection.createSharedFetchHandler('/api');
        this.eventsHub = new ModernLegacyEventHub(gateway, (endpoint, args, signal) => this.callModern(endpoint, args, signal, `wechat-event-${randomUUID()}`));
    }
    dispose() {
        this.eventsHub.dispose();
    }
    events(path, signal) {
        return this.eventsHub.subscribe(path, signal);
    }
    async fetch(request) {
        if (request.method.toUpperCase() === 'GET' || request.method.toUpperCase() === 'HEAD') {
            return this.fetchHandler.fetch(new Request(`http://dsh.internal${request.path}`, {
                method: request.method.toUpperCase(),
                headers: request.headers,
                signal: request.signal,
            }));
        }
        if (request.method.toUpperCase() !== 'POST') {
            return new Response('not found', { status: 404 });
        }
        const method = legacyMethodFromPath(request.path);
        if (!method)
            return new Response('not found', { status: 404 });
        let envelope;
        try {
            envelope = JSON.parse(Buffer.from(request.body ?? []).toString('utf8'));
        }
        catch {
            return new Response('body is not JSON', { status: 400 });
        }
        if (envelope?.type === 'client-response' && method === 'respond') {
            const result = await this.eventsHub.respond(String(envelope.rpcId || ''), envelope.result, request.signal);
            return Response.json(result);
        }
        if (envelope?.type !== 'client-request' || envelope.method !== method
            || typeof envelope.rpcId !== 'string' || !isRecord(envelope.payload)) {
            return new Response('invalid client-request message', { status: 400 });
        }
        const result = await this.call(method, envelope.payload, request.signal ?? new AbortController().signal, envelope.rpcId);
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result });
    }
    async call(method, payload, signal, rpcId) {
        try {
            if (method === 'host.describe') {
                return { ok: true, value: { cwd: process.cwd(), version: 'unknown' } };
            }
            if (method === 'workspace.list') {
                const frame = await firstStreamItem(this.gateway, 'workspace/follow', { args: {} }, signal);
                if (frame?.type !== 'baseline' || !isRecord(frame.value)) {
                    return unavailable('DSH workspace baseline is unavailable');
                }
                return { ok: true, value: frame.value };
            }
            if (method === 'session.history')
                return await this.history(payload, signal);
            if (method === 'session.models')
                return await this.models(payload, signal, rpcId);
            if (method === 'llm.providers' || method === 'llm.models') {
                return await this.legacyLlmDirectory(method, signal, rpcId);
            }
            if (method === 'host.openPath') {
                return await this.callModern('session/openWorkspacePath', { request: payload }, signal, rpcId);
            }
            const translated = translateLegacyCall(method, payload, rpcId);
            return await this.callModern(translated.endpoint, translated.args, signal, rpcId);
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason;
            return unavailable(messageOf(error));
        }
    }
    async callModern(endpoint, args, signal, rpcId) {
        const request = new Request(`http://dsh.internal/api/${endpoint}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                type: 'client-request', rpcId, method: endpoint, payload: { args },
            }),
            signal,
        });
        const response = await this.fetchHandler.fetch(request);
        if (response.status !== 200)
            return unavailable(`DSH Remote HTTP ${response.status}`);
        const body = await response.json();
        return body.result ?? unavailable('DSH Remote returned an invalid response');
    }
    async history(payload, signal) {
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
        if (!sessionId)
            return badRequest('session.history requires sessionId');
        const opening = await firstStreamItem(this.gateway, 'session/follow', { args: { request: {
                    address: { kind: 'session', sessionId },
                    ...(Number.isSafeInteger(payload.maxMessages)
                        ? { maxMessages: Number(payload.maxMessages) } : {}),
                } } }, signal);
        if (opening?.type !== 'snapshot' || !Number.isSafeInteger(opening.cursor)) {
            return unavailable('DSH Session follow snapshot is unavailable');
        }
        let records = opening.records;
        let hasMore = opening.hasMore === true;
        if (payload.beforeSeq !== undefined) {
            const beforeSeq = Number(payload.beforeSeq);
            if (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0)
                return badRequest('invalid history cursor');
            const page = await this.callModern('session/page', {
                request: {
                    address: { kind: 'session', sessionId },
                    throughSeq: opening.cursor,
                    beforeSeq,
                    ...(Number.isSafeInteger(payload.maxMessages)
                        ? { maxMessages: Number(payload.maxMessages) } : {}),
                },
            }, signal, `wechat-history-${randomUUID()}`);
            if (!page.ok)
                return page;
            records = page.value?.records;
            hasMore = page.value?.hasMore === true;
        }
        return {
            ok: true,
            value: {
                events: legacyHistoryEntries(records),
                hasMore,
                ...(payload.beforeSeq === undefined && isRecord(opening.projections)
                    ? { projections: opening.projections } : {}),
            },
        };
    }
    async models(payload, signal, rpcId) {
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
        if (!sessionId)
            return badRequest('session.models requires sessionId');
        const [catalog, opening] = await Promise.all([
            this.callModern('session/modelCatalog', {}, signal, rpcId),
            firstStreamItem(this.gateway, 'session/follow', { args: { request: { address: { kind: 'session', sessionId }, maxMessages: 1 } } }, signal),
        ]);
        if (!catalog.ok)
            return catalog;
        const value = catalog.value || {};
        const projection = opening?.projections?.values?.modelSelection;
        const current = projection?.next || projection?.lastUsed || value.default;
        return {
            ok: true,
            value: {
                current,
                routable: Boolean(current && Array.isArray(value.routableProviders)
                    && value.routableProviders.includes(current.provider)),
                groups: Array.isArray(value.groups) ? value.groups : [],
                failures: Array.isArray(value.failures) ? value.failures : [],
            },
        };
    }
    async legacyLlmDirectory(method, signal, rpcId) {
        const catalog = await this.callModern('session/modelCatalog', {}, signal, rpcId);
        if (!catalog.ok)
            return catalog;
        if (method === 'llm.providers') {
            return {
                ok: true,
                value: {
                    providers: (catalog.value?.groups || []).map((group) => ({
                        id: group.id, name: group.name,
                    })),
                },
            };
        }
        return { ok: true, value: catalog.value };
    }
}
/** Shared modern stream fan-out. One $events client prevents duplicate waterfalls. */
class ModernLegacyEventHub {
    gateway;
    callEndpoint;
    hostSubscribers = new Set();
    muxSubscribers = new Set();
    lifetime = new AbortController();
    pending = new Map();
    clientId = '';
    started = false;
    followedSessions = new Set();
    constructor(gateway, callEndpoint) {
        this.gateway = gateway;
        this.callEndpoint = callEndpoint;
    }
    dispose() {
        this.lifetime.abort(new Error('DSH modern compatibility bridge disposed'));
        for (const queue of this.hostSubscribers)
            queue.end();
        for (const queue of this.muxSubscribers)
            queue.end();
        this.hostSubscribers.clear();
        this.muxSubscribers.clear();
        this.pending.clear();
    }
    subscribe(path, signal) {
        const target = path.split('?', 1)[0];
        const subscribers = target === '/api/events.host'
            ? this.hostSubscribers
            : target === '/api/events.mux'
                ? this.muxSubscribers
                : null;
        if (!subscribers)
            throw new Error('Unsupported DSH realtime path');
        const queue = new AsyncFrameQueue();
        subscribers.add(queue);
        this.start();
        const close = () => {
            subscribers.delete(queue);
            queue.end();
        };
        signal.addEventListener('abort', close, { once: true });
        return queue.iterate(() => signal.removeEventListener('abort', close));
    }
    async respond(rpcId, result, signal) {
        const pending = this.pending.get(rpcId);
        if (!pending || !this.clientId || pending.clientId !== this.clientId) {
            return { accepted: false, reason: 'unknown-rpc-id' };
        }
        const modernOutcome = legacyResponseOutcome(pending.event, result);
        const response = await this.callEndpoint('$events/result', {
            clientId: pending.clientId,
            eventId: pending.eventId,
            outcome: modernOutcome,
        }, signal ?? new AbortController().signal);
        if (response.ok) {
            this.pending.delete(rpcId);
            if (pending.event === 'approval/request') {
                this.mux({
                    type: 'approval/resolved', sessionId: pending.sessionId,
                    approvalId: pending.eventId,
                    ...(isRecord(result) && isRecord(result.value)
                        ? { outcome: result.value.outcome } : {}),
                });
            }
            else if (pending.event === 'user-questions/request') {
                this.mux({
                    type: 'question/resolved', sessionId: pending.sessionId,
                    questionRpcId: rpcId,
                    ...(isRecord(result) && isRecord(result.value)
                        ? { outcome: result.value.answer } : {}),
                });
            }
        }
        return response.ok
            ? { accepted: true }
            : { accepted: false, reason: response.error?.code || 'rejected' };
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        void this.consumeRemoteEvents();
        void this.consumeWorkspace();
        void this.consumeControl();
        void this.consumeSessions();
    }
    async consumeRemoteEvents() {
        try {
            const stream = await openModernStream(this.gateway, '$events', { args: {} }, this.lifetime.signal);
            for await (const value of stream) {
                if (!isRecord(value))
                    continue;
                if (value.type === 'ready' && typeof value.clientId === 'string') {
                    this.clientId = value.clientId;
                    continue;
                }
                if (value.type === 'emit') {
                    this.consumeEmit(String(value.event || ''), Array.isArray(value.args) ? value.args : []);
                    continue;
                }
                if (value.type === 'waterfall')
                    this.consumeWaterfall(value);
                if (value.type === 'cancel' && typeof value.eventId === 'string') {
                    for (const [rpcId, pending] of this.pending) {
                        if (pending.eventId === value.eventId)
                            this.pending.delete(rpcId);
                    }
                }
            }
        }
        catch (error) {
            if (!this.lifetime.signal.aborted)
                this.broadcastError(error);
        }
    }
    consumeEmit(event, args) {
        if (event === 'api-session/added' && isRecord(args[0])) {
            const summary = args[0];
            this.host({ type: 'host/session-added', ...summary });
            this.followSession(String(summary.sessionId || ''));
        }
        else if (event === 'api-session/removed') {
            this.host({ type: 'host/session-removed', sessionId: args[0] });
        }
        else if (event === 'api-session/status') {
            this.host({ type: 'host/session-status', sessionId: args[0], running: args[1] });
        }
        else if (event === 'api-session/error') {
            this.host({ type: 'host/agent-error', sessionId: args[0], message: args[1] });
        }
        else {
            this.host({ type: 'host/remote-event', event, args });
        }
    }
    consumeWaterfall(frame) {
        if (typeof frame.clientId === 'string')
            this.clientId = frame.clientId;
        if (typeof frame.eventId !== 'string' || typeof frame.event !== 'string'
            || typeof frame.agentId !== 'string' || !isRecord(frame.request))
            return;
        const rpcId = frame.eventId;
        this.pending.set(rpcId, {
            clientId: this.clientId,
            eventId: frame.eventId,
            event: frame.event,
            sessionId: frame.agentId,
        });
        if (frame.event === 'approval/request') {
            this.mux({
                type: 'approval/requested',
                sessionId: frame.agentId,
                approvalId: frame.eventId,
                ...frame.request,
            }, rpcId);
        }
        else if (frame.event === 'user-questions/request') {
            this.mux({
                type: 'question/requested',
                sessionId: frame.agentId,
                questions: frame.request.questions,
            }, rpcId);
        }
    }
    async consumeWorkspace() {
        try {
            const stream = await openModernStream(this.gateway, 'workspace/follow', { args: {} }, this.lifetime.signal);
            for await (const value of stream) {
                if (!isRecord(value) || value.type === 'baseline')
                    continue;
                if (value.type === 'upsert')
                    this.host({ type: 'host/workspace-changed', workspace: value.workspace });
                else if (value.type === 'remove')
                    this.host({ type: 'host/workspace-removed', workspaceId: value.workspaceId });
                else if (value.type === 'order')
                    this.host({ type: 'host/workspace-order-changed', workspaceIds: value.workspaceIds });
                else if (value.type === 'archived')
                    this.host({ type: 'host/archived-sessions-changed', archivedSessionIds: value.archivedSessionIds });
            }
        }
        catch (error) {
            if (!this.lifetime.signal.aborted)
                this.broadcastError(error);
        }
    }
    async consumeControl() {
        try {
            const stream = await openModernStream(this.gateway, 'session/control', { args: {} }, this.lifetime.signal);
            for await (const value of stream) {
                if (!isRecord(value))
                    continue;
                if (value.type === 'baseline' && isRecord(value.value)) {
                    for (const [sessionId, items] of Object.entries(value.value.queues || {})) {
                        this.mux({ type: 'session/queue', sessionId, items });
                    }
                    for (const [sessionId, jobs] of Object.entries(value.value.jobs || {})) {
                        this.mux({ type: 'session/jobs', sessionId, jobs });
                    }
                    for (const [sessionId, projection] of Object.entries(value.value.projections || {})) {
                        if (!isRecord(projection) || !isRecord(projection.values))
                            continue;
                        for (const [key, projectionValue] of Object.entries(projection.values)) {
                            this.mux({ type: 'session/projection', sessionId, key, value: projectionValue, seq: projection.asOfSeq });
                        }
                    }
                }
                else if (value.type === 'queue') {
                    this.mux({ type: 'session/queue', sessionId: value.sessionId, items: value.items });
                }
                else if (value.type === 'jobs') {
                    this.mux({ type: 'session/jobs', sessionId: value.sessionId, jobs: value.jobs });
                }
                else if (value.type === 'projection') {
                    this.mux({ type: 'session/projection', sessionId: value.sessionId, key: value.key, value: value.value, seq: value.seq });
                }
            }
        }
        catch (error) {
            if (!this.lifetime.signal.aborted)
                this.broadcastError(error);
        }
    }
    async consumeSessions() {
        const result = await invokeModernRpc(this.gateway, 'session/list', { args: { _request: {} } }, this.lifetime.signal);
        if (!result.ok || !Array.isArray(result.value?.items))
            return;
        for (const item of result.value.items) {
            if (typeof item?.sessionId === 'string')
                this.followSession(item.sessionId);
        }
    }
    followSession(sessionId) {
        if (!sessionId || this.followedSessions.has(sessionId))
            return;
        this.followedSessions.add(sessionId);
        void (async () => {
            try {
                const stream = await openModernStream(this.gateway, 'session/follow', {
                    args: { request: { address: { kind: 'session', sessionId } } },
                }, this.lifetime.signal);
                let opened = false;
                for await (const value of stream) {
                    if (!isRecord(value))
                        continue;
                    if (!opened && value.type === 'snapshot') {
                        opened = true;
                        this.mux({ type: 'session/subscribed', sessionId, lastSeq: value.cursor });
                    }
                    else if (value.type === 'event' && isRecord(value.event)) {
                        this.mux({
                            type: 'session/event',
                            sessionId,
                            event: value.event,
                            ...(Object.hasOwn(value, 'view') ? { view: value.view } : {}),
                        });
                    }
                }
            }
            catch (error) {
                if (!this.lifetime.signal.aborted)
                    this.broadcastError(error);
            }
            finally {
                this.followedSessions.delete(sessionId);
            }
        })();
    }
    host(payload, rpcId) {
        this.broadcast(this.hostSubscribers, payload, rpcId);
    }
    mux(payload, rpcId) {
        this.broadcast(this.muxSubscribers, payload, rpcId);
    }
    broadcast(subscribers, payload, rpcId) {
        const bytes = Buffer.from(JSON.stringify({
            rpcId: rpcId || `push-${randomUUID()}`,
            payload,
        }));
        if (bytes.byteLength > MAX_EVENT_BYTES)
            return;
        for (const subscriber of subscribers)
            subscriber.push(bytes);
    }
    broadcastError(error) {
        const payload = {
            type: 'stream/error',
            error: { code: 'compatibility-stream', message: messageOf(error), details: {} },
        };
        this.host(payload);
        this.mux(payload);
    }
}
class AsyncFrameQueue {
    frames = [];
    waiter = null;
    ended = false;
    push(frame) {
        if (this.ended)
            return;
        this.frames.push(frame);
        this.waiter?.();
    }
    end() {
        this.ended = true;
        this.waiter?.();
    }
    async *iterate(cleanup) {
        try {
            while (!this.ended) {
                while (this.frames.length)
                    yield this.frames.shift();
                if (this.ended)
                    return;
                await new Promise(resolve => { this.waiter = resolve; });
                this.waiter = null;
            }
        }
        finally {
            cleanup();
            this.end();
        }
    }
}
function translateLegacyCall(method, payload, rpcId) {
    if (method.includes('/')) {
        return {
            endpoint: method,
            args: isRecord(payload.args) ? payload.args : payload,
        };
    }
    const dot = method.indexOf('.');
    if (dot <= 0 || dot === method.length - 1)
        return { endpoint: method, args: payload };
    let namespace = method.slice(0, dot);
    let action = method.slice(dot + 1);
    if (namespace === 'agentPreset')
        namespace = 'agentPresets';
    if (namespace === 'subagent') {
        namespace = 'subagents';
        if (action === 'interrupt')
            action = 'interruptByParent';
    }
    if (namespace === 'goal')
        namespace = 'goals';
    if (namespace === 'agentPresets' && action === 'select') {
        return {
            endpoint: 'agentPresets/select',
            args: {
                agentId: payload.sessionId,
                agentPreset: payload.agentPreset,
            },
        };
    }
    if (namespace === 'goals') {
        const common = {
            agentId: payload.sessionId,
            ...(isRecord(payload.ref) ? { ref: payload.ref } : {}),
        };
        if (action === 'create') {
            return {
                endpoint: 'goals/create',
                args: { agentId: payload.sessionId, request: { objective: payload.objective } },
            };
        }
        if (action === 'edit') {
            return {
                endpoint: 'goals/edit',
                args: { ...common, request: { objective: payload.objective } },
            };
        }
        return { endpoint: `goals/${action}`, args: common };
    }
    const requestDomains = new Set(['session', 'workspace']);
    if (namespace === 'session' && action === 'list') {
        return { endpoint: 'session/list', args: { _request: payload } };
    }
    const request = requestDomains.has(namespace)
        ? {
            ...payload,
            ...(namespace === 'session' && action === 'prompt' && !Object.hasOwn(payload, 'requestId')
                ? { requestId: rpcId } : {}),
        }
        : payload;
    return {
        endpoint: `${namespace}/${action}`,
        args: requestDomains.has(namespace) ? { request } : request,
    };
}
function legacyHistoryEntries(records) {
    if (!Array.isArray(records))
        return [];
    const entries = [];
    for (const record of records) {
        if (!isRecord(record) || !isRecord(record.event))
            continue;
        if (record.type !== 'chunks') {
            entries.push({
                event: record.event,
                ...(Object.hasOwn(record, 'view') ? { view: record.view } : {}),
            });
            continue;
        }
        for (const event of expandChunkRowEvent(record.event))
            entries.push({ event });
    }
    return entries;
}
/** Expand alpha's packed delta row back to the legacy raw event contract. */
function expandChunkRowEvent(event) {
    const type = String(event.type || '');
    const data = isRecord(event.data) ? event.data : null;
    if (!data || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.time))
        return [];
    const members = type === 'chunkrow/tool-call-chunks' ? data.args : data.texts;
    if (!Array.isArray(members) || !Array.isArray(data.dt))
        return [];
    const output = [];
    let time = event.time;
    for (let index = 0; index < members.length; index += 1) {
        if (index > 0)
            time += Number(data.dt[index - 1] || 0);
        let chunk;
        if (type === 'chunkrow/text-chunks') {
            chunk = { type: 'text-delta', index: data.index, text: members[index] };
        }
        else if (type === 'chunkrow/reasoning-chunks') {
            chunk = { type: 'reasoning-delta', index: data.index, text: members[index] };
        }
        else if (type === 'chunkrow/tool-call-chunks') {
            chunk = {
                type: 'tool-call-delta', index: data.index, id: data.id,
                ...(typeof data.name === 'string' ? { name: data.name } : {}),
                argumentsDelta: members[index],
            };
        }
        else
            return [];
        output.push({
            type: 'assistant/chunk', seq: event.seq + index, time,
            data: { turn: data.turn, step: data.step, chunk },
        });
    }
    return output;
}
function legacyResponseOutcome(event, result) {
    const response = isRecord(result) ? result : {};
    if (response.ok === false) {
        const error = isRecord(response.error) ? response.error : {};
        return {
            kind: 'rejected',
            error: {
                name: 'Error',
                message: typeof error.message === 'string' ? error.message : 'cancelled by client',
                ...(typeof error.code === 'string' ? { code: error.code } : {}),
            },
        };
    }
    const value = isRecord(response.value) ? response.value : {};
    if (event === 'approval/request')
        return { kind: 'result', value: value.outcome };
    if (event === 'user-questions/request')
        return { kind: 'result', value: value.answer };
    return { kind: 'next' };
}
async function invokeModernRpc(gateway, endpoint, payload, signal) {
    try {
        const stream = gateway.wireStream;
        const value = gateway.invoke;
        if (typeof value === 'function') {
            const slash = endpoint.indexOf('/');
            const args = isRecord(payload?.args) ? payload.args : {};
            const result = await value.call(gateway, {
                namespace: endpoint.slice(0, slash), method: endpoint.slice(slash + 1), args, signal,
            });
            return { ok: true, value: result };
        }
        void stream;
        return unavailable('DSH Remote invocation is unavailable');
    }
    catch (error) {
        return {
            ok: false,
            error: {
                code: typeof error?.failure?.code === 'string'
                    ? error.failure.code : 'internal',
                message: messageOf(error),
                details: isRecord(error?.failure?.details)
                    ? error.failure.details : {},
            },
        };
    }
}
async function openModernStream(gateway, endpoint, payload, signal) {
    return await gateway.wireStream.open(endpoint, payload, signal);
}
async function firstStreamItem(gateway, endpoint, payload, signal) {
    const local = new AbortController();
    const combined = AbortSignal.any([signal, local.signal]);
    const stream = await openModernStream(gateway, endpoint, payload, combined);
    try {
        for await (const item of stream)
            return item;
        throw new Error(`DSH Remote stream ${endpoint} ended before its baseline`);
    }
    finally {
        local.abort(new Error('baseline received'));
    }
}
function isModernConnection(value) {
    return isRecord(value)
        && typeof value.createSharedFetchHandler === 'function'
        && typeof value.requestRejection === 'function'
        && isRecord(value.fetch)
        && typeof value.fetch.register === 'function';
}
function isLegacyConnection(value) {
    return isRecord(value)
        && typeof value.createSharedFetchHandler === 'function'
        && !('requestRejection' in value);
}
function isModernGateway(value) {
    return isRecord(value)
        && isRecord(value.wireStream)
        && typeof value.wireStream.open === 'function'
        && typeof value.invoke === 'function';
}
function legacyMethodFromPath(path) {
    const parsed = new URL(path, 'http://dsh.internal');
    if (!parsed.pathname.startsWith('/api/'))
        return null;
    const method = parsed.pathname.slice('/api/'.length);
    return /^[A-Za-z0-9_$.-]+(?:\/[A-Za-z0-9_$.-]+)?$/.test(method) ? method : null;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function unavailable(message) {
    return { ok: false, error: { code: 'service-unavailable', message, details: {} } };
}
function badRequest(message) {
    return { ok: false, error: { code: 'bad-request', message, details: {} } };
}
function messageOf(error) {
    const failure = isRecord(error?.failure) ? error.failure : null;
    if (typeof failure?.message === 'string')
        return failure.message;
    return error instanceof Error && error.message ? error.message : String(error || 'DSH operation failed');
}
function nodeFetch(port, input) {
    return new Promise((resolve, reject) => {
        const signal = input.signal ?? new AbortController().signal;
        const request = http.request({
            host: '127.0.0.1', port, path: input.path,
            method: input.method,
            headers: {
                accept: 'application/json', 'accept-encoding': 'identity',
                'user-agent': 'HarnessRemote-DshAdapter/1',
                ...(input.headers || {}),
            },
            timeout: LEGACY_TIMEOUT_MS,
        }, response => {
            const chunks = [];
            let bytes = 0;
            response.on('data', (chunk) => {
                bytes += chunk.byteLength;
                if (bytes > MAX_HTTP_BODY_BYTES) {
                    response.destroy(new Error('DSH response exceeds adapter limit'));
                }
                else
                    chunks.push(Buffer.from(chunk));
            });
            response.on('end', () => {
                const headers = new Headers();
                copyResponseHeaders(response.headers, headers);
                resolve(new Response(Buffer.concat(chunks), {
                    status: response.statusCode || 502,
                    headers,
                }));
            });
            response.on('error', reject);
        });
        const abort = () => {
            request.destroy(signal.reason instanceof Error
                ? signal.reason : new Error('DSH adapter request aborted'));
        };
        signal.addEventListener('abort', abort, { once: true });
        request.on('timeout', () => request.destroy(new Error('DSH adapter request timed out')));
        request.on('error', reject);
        request.on('close', () => signal.removeEventListener('abort', abort));
        if (input.body && input.body.byteLength > MAX_HTTP_BODY_BYTES) {
            request.destroy(new Error('DSH request exceeds adapter limit'));
            return;
        }
        request.end(input.body);
    });
}
function copyResponseHeaders(source, target) {
    const blocked = new Set(['connection', 'transfer-encoding', 'set-cookie', 'content-encoding']);
    for (const [key, value] of Object.entries(source)) {
        if (blocked.has(key) || value === undefined)
            continue;
        if (Array.isArray(value))
            value.forEach(item => target.append(key, item));
        else
            target.set(key, String(value));
    }
}
async function* websocketEvents(url, signal) {
    const socket = new WebSocket(url, {
        headers: { 'user-agent': 'HarnessRemote-DshAdapter/1' },
        maxPayload: MAX_EVENT_BYTES,
        perMessageDeflate: false,
    });
    const queue = new AsyncFrameQueue();
    socket.on('message', (data) => {
        const bytes = Buffer.isBuffer(data)
            ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(new Uint8Array(data));
        queue.push(bytes);
    });
    socket.on('close', () => queue.end());
    socket.on('error', () => queue.end());
    const abort = () => socket.terminate();
    signal.addEventListener('abort', abort, { once: true });
    try {
        yield* queue.iterate(() => { });
    }
    finally {
        signal.removeEventListener('abort', abort);
        socket.terminate();
    }
}
