/** Owner input provenance, NOT a language/approval classifier. Only the actual
 * authenticated prompt invocation may associate a short cloud credential with
 * the native inbox message it inserts. No history/text matching or replay. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { hostRuntimeVersion } from '../dsh-host-context.js';
import { exact, fail, plain, row } from './data.js';
const RUN_LEASE_MS = 120_000, RUN_HEARTBEAT_MS = 30_000;
const admissionDeadline = (proof) => proof.schema === 'human.owner.input.v2' ? proof.admissionExpiresAt : proof.expiresAt;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Only top-level user text is an instruction source. Attachments neither
 * participate in this digest nor grant instruction authority. */
export function privateInputTextDigest(content) {
    if (!Array.isArray(content))
        return;
    const text = [];
    for (const part of content)
        if (row(part) && part.type === 'text') {
            if (typeof part.text !== 'string')
                return;
            text.push(part.text);
        }
    if (!text.some(value => value.trim()) || Buffer.byteLength(JSON.stringify(text)) > 256 * 1024)
        return;
    return hash(text);
}
const unavailable = () => fail('private-input-unavailable', '本次消息缺少可核验的输入凭据，不能据此判断私人页面更新开关是否开启。可核对当前会话设置后重试发送，也可继续起草并使用原确认按钮；不需要固定确认词。');
const runtimeUnavailable = () => fail('private-input-unavailable', '当前宿主尚不能核对真实用户输入；可继续起草并使用原确认按钮。此状态不能通过反复开关权限解决。');
function proofOf(value, nodeId, scope, digest, now) {
    if (!row(value) || !['human.owner.input.v1', 'human.owner.input.v2'].includes(String(value.schema)))
        return;
    const deadline = value.schema === 'human.owner.input.v2' ? 'admissionExpiresAt' : 'expiresAt';
    if (!exact(value, ['schema', 'inputProof', 'inputId', 'contentDigest', 'scope', 'sessionGeneration', 'binding', deadline])
        || !plain(value.inputProof, 4096) || !plain(value.inputId, 128)
        || !digest || value.contentDigest !== digest || value.scope !== scope || !plain(value.sessionGeneration, 80)
        || !Number.isSafeInteger(value[deadline]) || Number(value[deadline]) <= now || Number(value[deadline]) > now + 605_000)
        return;
    const binding = value.binding;
    if (!row(binding) || !exact(binding, ['schema', 'nodeId', 'ownerSubject', 'accountInstance', 'generation'])
        || binding.schema !== 'human.node.binding.v1' || binding.nodeId !== nodeId
        || !['ownerSubject', 'accountInstance', 'generation'].every(key => plain(binding[key], 256)))
        return;
    return structuredClone(value);
}
function headerOf(session) {
    const h = session?.header;
    if (!h || h.id !== session.id || !Number.isSafeInteger(h.createdAt) || h.createdAt < 0
        || h.origin === 'subagent' || h.parentSessionId)
        throw unavailable();
    return hash([h.id, h.createdAt, h.cwd ?? null, h.origin ?? null, h.parentSessionId ?? null]);
}
function logOf(session) {
    const events = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events;
    if (!Array.isArray(events))
        throw unavailable();
    return events;
}
export class PrivateInputNative {
    host;
    nodeId;
    assertIdentity;
    now;
    options;
    admissions = new AsyncLocalStorage();
    dispatches = new AsyncLocalStorage();
    leases = new Map();
    epochs = new WeakMap();
    offs = [];
    stopped = false;
    constructor(host, nodeId, assertIdentity, now = Date.now, options = {}) {
        this.host = host;
        this.nodeId = nodeId;
        this.assertIdentity = assertIdentity;
        this.now = now;
        this.options = options;
        if (options.transport && options.transport.nodeId !== nodeId)
            throw unavailable();
        this.offs.push(host.on('agent/inbox/inserted', ({ agent, message }) => {
            this.invalidate(agent?.session);
            const entry = this.admissions.getStore();
            if (!entry?.open || entry.inserted || message?.source?.kind !== 'user')
                return;
            // Exactly one insertion can belong to an invocation. Even a duplicate or
            // unrelated second insertion cannot inherit its credential.
            entry.inserted = true;
            try {
                this.assertAgent(agent);
                const proof = entry.proof, session = agent.session;
                if (message.source.rpcId !== entry.rpcId || String(session.id) !== proof.scope || String(session.header.createdAt) !== proof.sessionGeneration
                    || privateInputTextDigest(message.content) !== proof.contentDigest || !plain(message.id, 256))
                    return;
                const lease = { proof, agent, session, messageId: message.id, epoch: this.epochs.get(session), header: headerOf(session) };
                entry.lease = lease;
                this.prune();
                if (this.leases.size >= 256)
                    return;
                this.leases.set(message.id, lease);
            }
            catch { /* Chat still works; unverified input is draft-only. */ }
        }));
        this.offs.push(host.on('agent/inbox/claimed', ({ agent, message, turn }) => {
            const lease = this.leases.get(message?.id);
            if (!lease || lease.agent !== agent || !Number.isSafeInteger(turn) || message?.source?.kind !== 'user')
                return;
            try {
                this.assertLease(lease);
                lease.turn = turn;
            }
            catch {
                this.release(lease);
            }
        }));
        this.offs.push(host.on('agent/inbox/discarded', ({ message }) => { const lease = this.leases.get(message?.id); if (lease)
            this.release(lease); }));
        this.offs.push(host.on('agent/pre-step', async (payload, next) => {
            const messages = Array.isArray(payload.messages) ? payload.messages : [];
            const candidates = messages.map((message) => this.leases.get(message.id)).filter(Boolean);
            const candidate = messages.length === 1 && candidates.length === 1 ? candidates[0] : undefined;
            if (candidate)
                candidate.entered = false;
            let decision;
            try {
                decision = await next();
            }
            catch (error) {
                if (candidate)
                    this.release(candidate);
                throw error;
            }
            if (candidate) {
                try {
                    this.assertLease(candidate);
                    const actual = Array.isArray(decision?.messages) ? decision.messages.filter((m) => m.source?.kind !== 'runtime-context') : [];
                    if (candidate.agent !== payload.agent || candidate.turn !== payload.turn || decision?.kind !== 'enter'
                        || actual.length !== 1 || actual[0].id !== candidate.messageId || actual[0].source?.kind !== 'user'
                        || privateInputTextDigest(actual[0].content) !== candidate.proof.contentDigest)
                        throw unavailable();
                    payload.signal.throwIfAborted();
                    candidate.entered = true;
                    candidate.signal = payload.signal;
                    const onAbort = () => this.release(candidate);
                    candidate.signal.addEventListener('abort', onAbort, { once: true });
                    candidate.removeAbort = () => candidate.signal.removeEventListener('abort', onAbort);
                    if (candidate.proof.schema === 'human.owner.input.v2')
                        await this.claim(candidate);
                }
                catch {
                    this.release(candidate);
                }
            }
            else if (messages.length)
                this.invalidate(payload.agent?.session);
            return decision;
        }));
        this.offs.push(host.on('session/event', (session, event) => {
            if (event?.type === 'turn/end')
                this.invalidate(session);
            if (event?.type === 'turn/start')
                for (const lease of this.leases.values())
                    if (lease.session === session && lease.entered && lease.turn !== event.data?.turn)
                        this.release(lease);
            if (event?.type === 'user/message') {
                // Modern DSH appends its separately typed runtime context after the
                // claimed input. It is neither a new owner input nor authority.
                if (event.data?.source?.kind === 'runtime-context')
                    return;
                const lease = this.leases.get(event.data?.id);
                if (lease?.session === session && lease.entered && lease.userSeq === undefined && event.data?.source?.kind === 'user'
                    && privateInputTextDigest(event.data.content) === lease.proof.contentDigest) {
                    lease.userSeq = event.seq;
                    if (lease.run)
                        this.scheduleRenewal(lease);
                }
                else
                    this.invalidate(session);
            }
        }, { global: true }));
        this.offs.push(host.on('workspace/session-stop', ({ sessionId }) => {
            for (const lease of this.leases.values())
                if (lease.proof.scope === sessionId)
                    this.invalidate(lease.session);
        }));
        this.offs.push(host.on('tools/execute', (exec, next) => {
            const candidates = [...this.leases.values()].filter(lease => lease.agent === exec.agent && lease.entered);
            if (candidates.length !== 1)
                return next();
            const lease = candidates[0];
            try {
                this.assertExecution(exec, lease);
            }
            catch {
                return next();
            }
            return this.dispatches.run({ token: exec.token, lease }, next);
        }));
    }
    supported() {
        try {
            this.assertIdentity();
            // Only the documented modern native inbox/tool contracts are admitted.
            // Missing/unknown host versions fail closed, not guessed from arity.
            const match = /^(\d+)\.(\d+)\./.exec(hostRuntimeVersion(this.host) ?? '');
            return !this.stopped && !!match && (Number(match[1]) > 0 || Number(match[2]) >= 2)
                && typeof this.host.get('agents')?.get === 'function' && typeof this.host.get('sessions')?.get === 'function'
                && typeof this.host.get('sessionController')?.inspect === 'function'
                && typeof this.host.get('tools')?.guard === 'function';
        }
        catch {
            return false;
        }
    }
    async describe(value, signal) {
        if (!this.supported() || !row(value) || !exact(value, ['sessionId']) || !plain(value.sessionId, 256))
            throw unavailable();
        signal.throwIfAborted();
        const inspected = await this.host.get('sessionController').inspect(value.sessionId, signal);
        const meta = inspected?.meta;
        const virtual = { id: value.sessionId, header: meta };
        headerOf(virtual);
        signal.throwIfAborted();
        this.assertIdentity();
        const live = this.host.get('sessions')?.get(value.sessionId);
        if (live && headerOf(live) !== headerOf(virtual))
            throw unavailable();
        return { nodeId: this.nodeId, scope: value.sessionId, sessionGeneration: String(meta.createdAt), supported: true,
            inputProofVersions: this.options.transport ? [1, 2] : [1] };
    }
    async run(payload, supplied, invoke, rpcId) {
        const scope = payload.sessionId, content = payload.content;
        const texts = Array.isArray(content) ? content.filter((p) => p?.type === 'text').map((p) => p.text) : [];
        // Slash commands have their own native path, not conversational authority.
        const proof = this.supported() && plain(scope, 256) && plain(rpcId, 256) && !texts.some((t) => typeof t === 'string' && t.trimStart().startsWith('/'))
            ? proofOf(supplied, this.nodeId, scope, privateInputTextDigest(content), this.now()) : undefined;
        if (!proof || proof.schema === 'human.owner.input.v2' && !this.options.transport)
            return invoke();
        const admission = { proof, rpcId, open: true, inserted: false };
        try {
            return await this.admissions.run(admission, invoke);
        }
        finally {
            admission.open = false;
        }
    }
    async ownerInput(exec, taskRef, draftRef) {
        if (!this.supported())
            throw runtimeUnavailable();
        const dispatch = this.dispatches.getStore();
        if (!dispatch || dispatch.token !== exec.token)
            throw unavailable();
        const lease = dispatch.lease;
        const assertCurrent = () => this.assertExecution(exec, lease);
        assertCurrent();
        const { inputProof, inputId, contentDigest } = lease.proof;
        return { inputProof, inputId, contentDigest, nativeMessageId: lease.messageId,
            ...(lease.run ? { runId: lease.run.runId } : {}),
            idempotencyKey: hash([lease.proof.binding, lease.proof.scope, lease.proof.sessionGeneration, inputId, lease.messageId, taskRef, draftRef]), assertCurrent };
    }
    async ownerInputStatus(exec) {
        if (!this.supported())
            return { schema: 'human.private.update.status.v1', state: 'unavailable', reason: '当前宿主尚不能核对真实用户输入，可继续起草并使用确认按钮。' };
        const dispatch = this.dispatches.getStore();
        try {
            if (!dispatch || dispatch.token !== exec.token)
                throw unavailable();
            this.assertExecution(exec, dispatch.lease);
            return { schema: 'human.private.update.status.v1', state: 'ready', expiresAt: dispatch.lease.run?.expiresAt ?? admissionDeadline(dispatch.lease.proof),
                reason: dispatch.lease.run
                    ? '当前真实对话轮次的凭据由系统自动维护；expiresAt 是内部短租约，不要求用户限时回复。是否执行仍取决于用户意图和云端即时权限校验。'
                    : '当前原生输入凭据可用；是否实际执行仍取决于用户意图和云端即时权限校验。' };
        }
        catch {
            return { schema: 'human.private.update.status.v1', state: 'no-current-input', reason: '本次消息缺少可核验的输入凭据，不代表私人页面更新开关关闭。可核对设置后重试发送，或使用原确认按钮；不要求固定确认词。' };
        }
    }
    assertAgent(agent) {
        if (!agent || agent.id !== agent.session?.id || this.host.get('agents')?.get(agent.id) !== agent
            || this.host.get('sessions')?.get(agent.id) !== agent.session)
            throw unavailable();
        headerOf(agent.session);
    }
    assertLocal(lease) {
        if (!this.supported())
            throw runtimeUnavailable();
        this.assertAgent(lease.agent);
        lease.signal?.throwIfAborted();
        if (lease.run?.ended || lease.session !== lease.agent.session || headerOf(lease.session) !== lease.header
            || this.epochs.get(lease.session) !== lease.epoch || this.leases.get(lease.messageId) !== lease)
            throw unavailable();
    }
    assertLease(lease) {
        this.assertLocal(lease);
        if ((lease.run?.expiresAt ?? admissionDeadline(lease.proof)) <= this.now())
            throw unavailable();
    }
    /** Validate an ongoing native turn independently of a particular tool call.
     * A heartbeat never admits historical input, a new turn, or a queued message. */
    assertCurrentTurn(lease) {
        this.assertLease(lease);
        if (!lease.entered || lease.userSeq === undefined)
            throw unavailable();
        let turn, source = false;
        for (const event of logOf(lease.session)) {
            if (event.type === 'turn/start') {
                turn = event.data?.turn;
                source = false;
            }
            if (event.type === 'turn/end') {
                turn = undefined;
                source = false;
            }
            if (event.type === 'user/message' && event.data?.source?.kind !== 'runtime-context')
                source = event.seq === lease.userSeq && event.data?.id === lease.messageId && event.data.source?.kind === 'user'
                    && privateInputTextDigest(event.data.content) === lease.proof.contentDigest;
        }
        if (!source || turn !== lease.turn)
            throw unavailable();
    }
    assertExecution(exec, lease) {
        this.assertCurrentTurn(lease);
        exec.signal.throwIfAborted();
        if (lease.proof.schema === 'human.owner.input.v2' && !lease.run?.expiresAt)
            throw unavailable();
        if (typeof exec.token !== 'symbol' || exec.agent !== lease.agent || !lease.entered || lease.userSeq === undefined
            || !plain(exec.callId, 256) || !plain(exec.rootCallId, 256))
            throw unavailable();
        const events = logOf(lease.session);
        let turn, root, source = false;
        for (const event of events) {
            if (event.type === 'turn/start') {
                turn = event.data?.turn;
                root = undefined;
                source = false;
            }
            if (event.type === 'turn/end') {
                turn = undefined;
                root = undefined;
                source = false;
            }
            if (event.type === 'user/message' && event.seq === lease.userSeq && event.data?.id === lease.messageId && event.data.source?.kind === 'user')
                source = true;
            if (event.type === 'tool/call' && event.data?.callId === exec.rootCallId)
                root = event;
        }
        if (!source || turn !== lease.turn || !root || root.data.turn !== turn || root.seq <= lease.userSeq
            || (exec.parent === undefined && (exec.callId !== exec.rootCallId || root.data.name !== exec.name)))
            throw unavailable();
    }
    runRequest(lease, operation, signal) {
        const { inputProof, inputId, contentDigest, scope, sessionGeneration } = lease.proof;
        if (!this.options.transport || !lease.run)
            throw unavailable();
        return this.options.transport.request('lifecycle', { audience: 'human.workflow.node.v1', operation,
            inputProof, inputId, contentDigest, scope, sessionGeneration, nativeMessageId: lease.messageId, runId: lease.run.runId }, signal);
    }
    runDeadline(lease, response, startedAt) {
        if (!row(response) || !exact(response, ['schema', 'state', 'runId', 'inputId', 'nativeMessageId', 'scope', 'sessionGeneration', 'leaseExpiresAt'], ['ok'])
            || response.ok !== undefined && response.ok !== true
            || response.schema !== 'human.owner.input.run.v1' || response.state !== 'active' || response.runId !== lease.run?.runId
            || response.inputId !== lease.proof.inputId || response.nativeMessageId !== lease.messageId
            || response.scope !== lease.proof.scope || response.sessionGeneration !== lease.proof.sessionGeneration
            || !Number.isSafeInteger(response.leaseExpiresAt) || Number(response.leaseExpiresAt) <= this.now()
            || Number(response.leaseExpiresAt) > this.now() + RUN_LEASE_MS + 5_000)
            throw unavailable();
        // Never locally extend beyond one short interval just because a remote
        // response or clock is ahead. The server independently enforces its lease.
        const deadline = Math.min(Number(response.leaseExpiresAt), startedAt + RUN_LEASE_MS);
        if (deadline <= this.now())
            throw unavailable();
        return deadline;
    }
    async claim(lease) {
        this.assertLease(lease);
        if (lease.run || !this.options.transport)
            throw unavailable();
        lease.run = { runId: randomBytes(16).toString('hex'), ended: false, controller: new AbortController() };
        const startedAt = this.now();
        try {
            const response = await this.runRequest(lease, 'private-input-claim', lease.run.controller.signal);
            // Claiming may race a stop, a replacement input, or profile teardown.
            // A late response must never put that input back into the active map.
            this.assertLocal(lease);
            lease.run.expiresAt = this.runDeadline(lease, response, startedAt);
        }
        catch {
            this.release(lease);
            // Also end after a late response: end-before-claim is terminal in v2,
            // while this second cleanup covers a lost or reordered first request.
            this.endRun(lease);
        }
    }
    scheduleRenewal(lease) {
        const run = lease.run;
        if (!run || run.ended || run.cancelTimer)
            return;
        const schedule = this.options.schedule ?? ((callback, milliseconds) => {
            const timer = setTimeout(callback, milliseconds);
            timer.unref();
            return () => clearTimeout(timer);
        });
        run.cancelTimer = schedule(() => {
            run.cancelTimer = undefined;
            void this.renew(lease);
        }, RUN_HEARTBEAT_MS);
    }
    async renew(lease) {
        const run = lease.run;
        if (!run)
            return;
        try {
            this.assertCurrentTurn(lease);
            if (!run.expiresAt)
                throw unavailable();
            const startedAt = this.now();
            const response = await this.runRequest(lease, 'private-input-renew', run.controller.signal);
            // Check the OLD deadline before accepting renewal. An expired or ended
            // local run cannot be resurrected by a slow response.
            this.assertCurrentTurn(lease);
            run.expiresAt = this.runDeadline(lease, response, startedAt);
            this.scheduleRenewal(lease);
        }
        catch {
            this.release(lease);
        }
    }
    endRun(lease) {
        if (!lease.run || !this.options.transport)
            return;
        // Cleanup is not tied to the aborted model turn. No user-visible tool,
        // retry loop, or persisted bearer token; a crash is bounded by cloud TTL.
        try {
            void this.runRequest(lease, 'private-input-end', AbortSignal.timeout(5_000)).catch(() => { });
        }
        catch { /* Best effort. */ }
    }
    release(lease) {
        if (this.leases.get(lease.messageId) === lease)
            this.leases.delete(lease.messageId);
        lease.removeAbort?.();
        lease.removeAbort = undefined;
        if (!lease.run || lease.run.ended)
            return;
        lease.run.ended = true;
        lease.run.cancelTimer?.();
        lease.run.cancelTimer = undefined;
        lease.run.controller.abort();
        this.endRun(lease);
    }
    invalidate(session) {
        if (!session)
            return;
        this.epochs.set(session, (this.epochs.get(session) ?? 0) + 1);
        for (const lease of this.leases.values())
            if (lease.session === session)
                this.release(lease);
    }
    prune() {
        for (const lease of this.leases.values())
            if ((lease.run?.expiresAt ?? admissionDeadline(lease.proof)) <= this.now())
                this.release(lease);
    }
    close() {
        if (this.stopped)
            return;
        this.stopped = true;
        for (const lease of this.leases.values())
            this.release(lease);
        for (const off of this.offs.splice(0).reverse())
            off();
        this.admissions.disable();
        this.dispatches.disable();
    }
}
