/** Optional, isolated observer. Never answers questions, grants approval, or opens $events. */
import { createHash, randomBytes, sign } from 'node:crypto';
const terminal = new Set(['accepted', 'unknown', 'failed', 'cancelled', 'expired']);
// Current native Session exposes snapshotEvents(), not a mutable events property.
// The property fallback keeps older native adapters/test fixtures readable without modifying them.
function events(session, fromSeq = 0) {
    const value = typeof session.snapshotEvents === 'function' ? session.snapshotEvents(fromSeq) : session.events;
    if (!Array.isArray(value))
        throw new Error('当前节点尚未提供可验证的任务通知事件');
    return fromSeq && !session.snapshotEvents ? value.filter(e => e.seq >= fromSeq) : value;
}
// Read only the native logged title, never a prompt or tool/approval body.
// A bounded value is sent with observations, not retained in the relay database.
export function notificationSessionTitle(session) {
    const snapshot = events(session);
    for (let i = snapshot.length - 1; i >= 0; i--) {
        if (snapshot[i].type !== 'session/title')
            continue;
        const value = snapshot[i].data?.title;
        if (typeof value !== 'string')
            return undefined;
        const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!clean)
            return undefined;
        if (clean.length <= 20)
            return clean;
        let prefix = '';
        for (const char of clean) {
            if (prefix.length + char.length > 19)
                break;
            prefix += char;
        }
        return prefix + '…';
    }
    return undefined;
}
export function currentTurn(session) {
    const snapshot = events(session);
    for (let i = snapshot.length - 1; i >= 0; i--) {
        const event = snapshot[i];
        if (event.type === 'turn/end')
            return null;
        if (event.type === 'turn/start')
            return Number.isSafeInteger(event.data?.turn) ? event.data.turn : null;
    }
    return null;
}
/** Body-bound proof, distinct domain from the legacy object API. */
export function notificationProof(path, node, time, nonce, body) {
    return Buffer.from(`task-notification-v1\nPOST\n${path}\n${node}\n${time}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`);
}
export class NotificationRelayClient {
    origin;
    identity;
    fetchImpl;
    constructor(origin, identity, fetchImpl = fetch) {
        this.origin = origin;
        this.identity = identity;
        this.fetchImpl = fetchImpl;
    }
    async call(action, values) {
        const identity = this.identity(), time = Date.now(), nonce = randomBytes(18).toString('base64url');
        const path = `/v1/agents/${identity.nodeId}/task-notifications/${action}`;
        const body = JSON.stringify(values);
        const response = await this.fetchImpl(this.origin + path, { method: 'POST', redirect: 'error',
            headers: { 'content-type': 'application/json', 'x-hr-node-id': identity.nodeId, 'x-hr-timestamp': String(time),
                'x-hr-nonce': nonce, 'x-hr-signature': sign(null, notificationProof(path, identity.nodeId, time, nonce, body), identity.privateKeyPem).toString('base64url') },
            body, signal: AbortSignal.timeout(8000) });
        if (!response.ok)
            throw new Error('提醒服务暂不可用，未改变任务状态');
        return response.json();
    }
}
export class TaskNotifications {
    ctx;
    relay;
    now;
    watches = new Map();
    questions = new Map();
    presence = new Map();
    disposers = [];
    timer;
    pumping = false;
    disposed = false;
    clientEpoch = randomBytes(12).toString('base64url');
    cursor = 0;
    constructor(ctx, relay, now = () => Date.now()) {
        this.ctx = ctx;
        this.relay = relay;
        this.now = now;
    }
    start() {
        // Native around-dispatch metric seam: next is invoked EXACTLY once; result,
        // exception and signal are preserved. No network/IO is awaited by the tool.
        this.disposers.push(this.ctx.on('tools/execute', (exec, next) => {
            if (exec.name !== 'ask_user_question')
                return next();
            let key = '';
            try {
                const session = this.ctx.get('sessions')?.get?.(exec.agent?.id);
                const roots = this.ctx.get('agents')?.roots?.();
                if (typeof exec.callId === 'string' && exec.callId && session && roots?.includes(exec.agent) && !exec.signal?.aborted) {
                    const turn = currentTurn(session);
                    if (turn !== null && this.questions.size < 128) {
                        key = `${session.id}:${String(exec.callId)}`;
                        this.questions.set(key, { session, turn, signal: exec.signal });
                    }
                }
            }
            catch { /* observation must not affect dispatch */ }
            let result;
            try {
                result = next();
            }
            catch (error) {
                if (key)
                    this.questions.delete(key);
                throw error;
            }
            if (!key)
                return result;
            return result.finally(() => { this.questions.delete(key); });
        }));
        this.timer = setInterval(() => { void this.tick(); }, 3000);
        this.timer.unref?.();
    }
    session(id) {
        if (typeof id !== 'string' || id.length > 128)
            throw new Error('请选择正在运行的会话');
        const session = this.ctx.get('sessions')?.get?.(id);
        // Gate on native event-log capability, not guessed version numbers.
        if (!session || (typeof session.snapshotEvents !== 'function' && !Array.isArray(session.events)) || !Number.isSafeInteger(session.firstLiveSeq)) {
            throw new Error('当前节点尚未提供可验证的任务通知事件');
        }
        return session;
    }
    async request(args) {
        if (this.disposed)
            throw new Error('提醒服务已停止');
        const session = this.session(args.sessionId);
        if (args.action === 'presence') {
            for (const [id, expires] of this.presence)
                if (expires <= this.now())
                    this.presence.delete(id);
            if (!this.presence.has(session.id) && this.presence.size >= 128)
                this.presence.delete(this.presence.keys().next().value);
            if (args.visible === true)
                this.presence.set(session.id, this.now() + 25000);
            else
                this.presence.delete(session.id);
            return { ok: true };
        }
        if (args.action !== 'prepare' || args.kind !== 'next')
            throw new Error('请更新通知研发版后重试');
        const turn = currentTurn(session);
        if (turn === null)
            throw new Error('请先开始任务，再订阅本轮提醒');
        if (args.turn !== undefined && args.turn !== turn)
            throw new Error('任务已切换，请重新确认提醒');
        // Repeated prepares/transport retries must not create extra watches or subscriptions.
        const existing = [...this.watches.values()].find(w => w.session === session && w.turn === turn && w.expiresAt > this.now());
        if (existing)
            return this.prepareWatch(existing);
        if (this.pending(session, turn).length)
            throw new Error('请先处理当前问答或授权，任务继续后可再次订阅');
        if (this.watches.size >= 16)
            throw new Error('待处理提醒过多，请稍后再试');
        const watch = { id: randomBytes(18).toString('base64url'), session, turn,
            baseline: events(session).at(-1)?.seq ?? -1,
            expiresAt: this.now() + 86400000 };
        this.watches.set(watch.id, watch); // Capture completion even during the consent round trip.
        return this.prepareWatch(watch);
    }
    prepareWatch(watch) {
        if (watch.preparing)
            return watch.preparing;
        watch.preparing = this.relay.call('prepare', { id: watch.id, epoch: this.clientEpoch,
            sessionId: watch.session.id, turn: watch.turn, kind: 'next', baseline: watch.baseline }).then(prepared => {
            if (prepared.id !== watch.id) {
                this.watches.delete(watch.id);
                watch.id = prepared.id;
                this.watches.set(watch.id, watch);
            }
            if (terminal.has(prepared.status))
                this.watches.delete(watch.id);
            return { ...prepared, relayOrigin: this.relay.origin };
        }).finally(() => { watch.preparing = undefined; });
        // On an ambiguous HTTP result retain this SAME reservation and observer for retry.
        return watch.preparing;
    }
    pending(session, turn) {
        const approvals = new Map();
        let active = null;
        for (const event of events(session)) {
            if (event.type === 'turn/start')
                active = event.data.turn;
            if (event.type === 'turn/end')
                active = null;
            if (active !== turn)
                continue;
            if (event.type === 'approval/asked' && typeof event.data.id === 'string') {
                approvals.set(event.data.id, { id: 'approval:' + event.data.id, type: 'approval' });
            }
            if (event.type === 'approval/decided')
                approvals.delete(event.data.id);
        }
        const questions = [...this.questions.entries()].filter(([, q]) => q.session === session && q.turn === turn && !q.signal?.aborted)
            .map(([id]) => ({ id: 'question:' + id, type: 'question' }));
        return [...approvals.values(), ...questions];
    }
    /** Exported pure-ish snapshot is also used by deterministic race tests. */
    snapshot(watch) {
        const live = this.ctx.get('sessions')?.get?.(watch.session.id);
        if (live !== watch.session)
            return { state: 'cancelled' }; // Dispose/reload is NOT completion.
        const end = events(watch.session, watch.baseline + 1).find(e => e.type === 'turn/end' && e.data.turn === watch.turn);
        if (end)
            return end.data.reason?.kind === 'completed'
                ? { state: 'complete', eventKey: `end:${end.seq}` } : { state: 'cancelled' };
        if (currentTurn(watch.session) !== watch.turn)
            return { state: 'cancelled' };
        {
            const items = this.pending(watch.session, watch.turn);
            if (items.length)
                return { state: 'pending', eventKey: createHash('sha256').update(items.map(i => i.id).sort().join('\n')).digest('hex'),
                    pendingType: items.every(i => i.type === 'approval') ? 'approval' : items.every(i => i.type === 'question') ? 'question' : 'mixed' };
        }
        return { state: 'running' };
    }
    async tick() {
        if (this.pumping || this.disposed)
            return;
        this.pumping = true;
        try {
            for (const [id, expires] of this.presence)
                if (expires <= this.now())
                    this.presence.delete(id);
            for (const watch of this.watches.values())
                if (watch.expiresAt <= this.now())
                    this.watches.delete(watch.id);
            const all = [...this.watches.values()];
            // At most four independent observations per tick: no slow watch blocks all others,
            // and background preparations cannot flood the isolated relay's request allowance.
            const batch = Array.from({ length: Math.min(all.length, 4) }, (_, i) => all[(this.cursor + i) % all.length]);
            this.cursor = all.length ? (this.cursor + batch.length) % all.length : 0;
            await Promise.all(batch.map(async (watch) => {
                if (this.disposed || watch.preparing)
                    return;
                try {
                    const observation = this.snapshot(watch);
                    const result = await this.relay.call('observe', { id: watch.id, epoch: this.clientEpoch,
                        ...observation, ...(observation.state === 'complete' || observation.state === 'pending'
                            ? { sessionTitle: notificationSessionTitle(watch.session) } : {}),
                        visible: (this.presence.get(watch.session.id) || 0) > this.now() });
                    if (terminal.has(result.status))
                        this.watches.delete(watch.id);
                }
                catch { /* No host failure and no optimistic 'sent'. Retry observation, not the WeChat send. */ }
            }));
        }
        finally {
            this.pumping = false;
        }
    }
    dispose() {
        this.disposed = true;
        if (this.timer)
            clearInterval(this.timer);
        for (const off of this.disposers)
            off();
        this.watches.clear();
        this.questions.clear();
        this.presence.clear();
    }
}
