import { assertScope, bounded, copy, fail, plain, revision, row } from './data.js';
export const REPLICA_MAX_BYTES = 96 * 1024 * 1024; // 5,000 bounded facts of at most 16 KiB plus JSON/index overhead.
const empty = (nodeId) => ({ schema: 'human.replica.v1', nodeId, binding: null, cursor: 0, asOf: 0, records: [] });
const equalBinding = (a, b) => !!a && a.schema === b.schema && a.nodeId === b.nodeId
    && a.ownerSubject === b.ownerSubject && a.accountInstance === b.accountInstance && a.generation === b.generation;
function binding(value, nodeId) {
    if (!row(value) || value.schema !== 'human.node.binding.v1' || value.nodeId !== nodeId || !plain(value.ownerSubject, 256)
        || !plain(value.accountInstance, 256) || !plain(value.generation, 256))
        throw fail('workflow-response-invalid', '节点同步身份无效');
    return copy(value);
}
function fact(value) {
    if (!row(value) || !['task', 'participant'].includes(String(value.kind)) || !plain(value.key, 300) || !row(value.value))
        throw fail('workflow-response-invalid', '任务事实格式无效');
    const data = value.value;
    if (!row(data.taskRef) || data.taskRef.schema !== 'human.task.ref.v1' || !plain(data.taskRef.taskId, 128)
        || !plain(data.taskRef.deliveryId, 128))
        throw fail('workflow-response-invalid', '任务引用无效');
    if (value.kind === 'task' && (!row(data.origin) || !plain(data.origin.scope, 256) || !plain(data.origin.sessionGeneration, 80)))
        throw fail('workflow-response-invalid', '任务来源无效');
    if (value.kind === 'participant' && (!plain(data.participantRef, 128) || !['owner', 'participant'].includes(String(data.role))))
        throw fail('workflow-response-invalid', '参与事实无效');
    bounded(value, 16_384);
    return copy(value);
}
function scopedFact(value, owner) {
    const result = fact(value);
    if (result.kind === 'task' && !equalBinding(binding(result.value.binding, owner.nodeId), owner))
        throw fail('workflow-response-invalid', '任务不属于当前授权代次');
    return result;
}
function page(value, nodeId) {
    if (!row(value) || value.schema !== 'human.workflow.sync.v1' || !revision(value.watermark) || !revision(value.cursor)
        || !revision(value.asOf) || typeof value.hasMore !== 'boolean' || value.cursor > value.watermark)
        throw fail('workflow-response-invalid', '任务同步页无效');
    return { ...value, binding: binding(value.binding, nodeId) };
}
/** Cloud participant facts are replicated independently of chat history. No
 * task-level pollers, automatic model wakeup or mutation of upstream facts. */
export class WorkflowReplica {
    store;
    transport;
    now;
    state;
    tail = Promise.resolve();
    lifetime = new AbortController();
    timer;
    retry = 30_000;
    discoveryUntil = 0;
    fresh = false;
    constructor(store, transport, now) {
        this.store = store;
        this.transport = transport;
        this.now = now;
        this.state = empty(transport.nodeId);
    }
    static async open(store, transport, now = Date.now) {
        const replica = new WorkflowReplica(store, transport, now), loaded = await store.load();
        if (loaded !== undefined) {
            if (!row(loaded) || loaded.schema !== 'human.replica.v1' || loaded.nodeId !== transport.nodeId || !revision(loaded.cursor)
                || !revision(loaded.asOf) || !Array.isArray(loaded.records) || loaded.records.length > 5000)
                throw fail('workflow-store-invalid', '任务缓存身份或格式无效');
            replica.state = { schema: 'human.replica.v1', nodeId: transport.nodeId, cursor: loaded.cursor, asOf: loaded.asOf,
                binding: loaded.binding === null ? null : binding(loaded.binding, transport.nodeId), records: loaded.records.map(fact) };
            if (!replica.state.binding && replica.state.records.length)
                throw fail('workflow-store-invalid', '任务缓存缺少授权');
            if (replica.state.binding)
                replica.state.records.forEach(r => scopedFact(r, replica.state.binding));
            if (new Set(replica.state.records.map(r => `${r.kind}:${r.key}`)).size !== replica.state.records.length)
                throw fail('workflow-store-invalid', '任务缓存记录重复');
            bounded(replica.state, REPLICA_MAX_BYTES);
        }
        return replica;
    }
    start() { if (this.state.records.length)
        this.schedule(); }
    discover() { this.discoveryUntil = this.now() + 5 * 60_000; this.schedule(1000); }
    schedule(delay = this.retry) {
        if (this.lifetime.signal.aborted || this.timer || (!this.state.records.length && this.discoveryUntil <= this.now()))
            return;
        this.timer = setTimeout(() => { this.timer = undefined; void this.refresh(this.lifetime.signal).catch(() => { }).finally(() => this.schedule()); }, delay);
        this.timer.unref?.();
    }
    close() {
        this.lifetime.abort();
        if (this.timer)
            clearTimeout(this.timer);
        return this.tail.then(() => { });
    }
    validateReferences(scope, refs) {
        assertScope(scope, this.transport.nodeId);
        this.transport.assertIdentity();
        this.lifetime.signal.throwIfAborted();
        if (!this.fresh || !this.state.binding || this.state.asOf + 120_000 < this.now())
            throw fail('workflow-reference-unavailable', '请先查询并同步当前会话的任务事实');
        for (const ref of refs) {
            const found = ref.kind === 'task' && this.state.records.some(r => r.kind === 'task' && row(r.value.origin) && row(r.value.taskRef)
                && r.value.taskRef.taskId === ref.id && r.value.revision === ref.version
                && r.value.origin.scope === scope.sessionId && r.value.origin.sessionGeneration === scope.sessionGeneration);
            if (!found)
                throw fail('workflow-reference-unavailable', '引用不属于当前会话或版本已变化');
        }
    }
    async save(next) {
        bounded(next, REPLICA_MAX_BYTES);
        this.lifetime.signal.throwIfAborted();
        this.transport.assertIdentity();
        try {
            await this.store.save(next);
        }
        catch (cause) {
            this.state = empty(this.transport.nodeId);
            this.lifetime.abort();
            throw cause;
        }
        this.state = next;
        this.lifetime.signal.throwIfAborted();
        this.transport.assertIdentity();
    }
    async clear() {
        this.fresh = false;
        this.state = empty(this.transport.nodeId);
        // Clear memory before I/O, so a failed disk write cannot expose revoked data.
        try {
            await this.store.save(this.state);
        }
        catch (cause) {
            this.lifetime.abort();
            throw cause;
        }
    }
    refresh(signal) {
        const result = this.tail.then(async () => {
            const active = AbortSignal.any([signal, this.lifetime.signal]);
            active.throwIfAborted();
            this.fresh = false;
            try {
                this.transport.assertIdentity();
                if (!this.state.binding)
                    await this.snapshot(active);
                else {
                    try {
                        await this.events(active);
                    }
                    catch (cause) {
                        if (cause.code !== 'snapshot_required')
                            throw cause;
                        await this.clear();
                        await this.snapshot(active);
                    }
                }
                active.throwIfAborted();
                this.transport.assertIdentity();
                this.fresh = true;
                this.retry = 30_000;
            }
            catch (cause) {
                this.retry = Math.min(this.retry * 2, 120_000);
                if (cause.code === 'binding_revoked') {
                    await this.clear();
                    this.discoveryUntil = 0;
                }
                throw cause;
            }
        });
        this.tail = result.catch(() => { });
        return result;
    }
    async snapshot(signal) {
        let request = { mode: 'snapshot', limit: 100 }, first;
        const records = new Map();
        for (let count = 0; count < 60; count++) {
            const p = page(await this.transport.request('sync', request, signal), this.transport.nodeId);
            if (p.mode !== 'snapshot' || !plain(p.snapshotId, 128) || !Array.isArray(p.records) || p.records.length > 100
                || !revision(p.expiresAt) || p.expiresAt <= this.now())
                throw fail('workflow-response-invalid', '任务快照无效或已过期');
            if (first && (first.snapshotId !== p.snapshotId || first.watermark !== p.watermark || !equalBinding(first.binding, p.binding)))
                throw fail('workflow-response-invalid', '任务快照在分页中变化');
            first ??= p;
            for (const raw of p.records) {
                const r = scopedFact(raw, p.binding), key = `${r.kind}:${r.key}`;
                if (records.has(key))
                    throw fail('workflow-response-invalid', '任务快照记录重复');
                records.set(key, r);
            }
            if (records.size > 5000)
                throw fail('workflow-capacity', '任务缓存容量不足');
            if (!p.hasMore) {
                if (p.nextOffset !== null || p.cursor !== p.watermark)
                    throw fail('workflow-response-invalid', '任务快照结束位置无效');
                await this.save({ schema: 'human.replica.v1', nodeId: this.transport.nodeId, binding: p.binding, cursor: p.watermark,
                    asOf: p.asOf, records: [...records.values()] });
                return;
            }
            if (!revision(p.nextOffset) || p.nextOffset !== records.size || !p.records.length)
                throw fail('workflow-response-invalid', '任务快照分页位置无效');
            request = { mode: 'snapshot', snapshotId: p.snapshotId, offset: p.nextOffset, limit: 100 };
        }
        throw fail('workflow-capacity', '任务快照分页过多');
    }
    async events(signal) {
        for (let count = 0; count < 20; count++) {
            const p = page(await this.transport.request('sync', { mode: 'events', cursor: this.state.cursor, limit: 100 }, signal), this.transport.nodeId);
            if (!equalBinding(this.state.binding, p.binding)) {
                await this.clear();
                await this.snapshot(signal);
                return;
            }
            if (p.mode !== 'events' || !Array.isArray(p.events) || p.events.length > 100 || p.cursor < this.state.cursor)
                throw fail('workflow-response-invalid', '任务事件页无效');
            const next = copy(this.state), records = new Map(next.records.map(r => [`${r.kind}:${r.key}`, r]));
            let cursor = this.state.cursor;
            for (const event of p.events) {
                if (!row(event) || event.schema !== 'human.workflow.event.v1' || !revision(event.cursor) || event.cursor <= cursor
                    || event.cursor > p.cursor || !revision(event.aggregateVersion) || !plain(event.eventId, 128))
                    throw fail('workflow-response-invalid', '任务事件游标无效');
                const r = scopedFact(event.record, p.binding);
                const prior = records.get(`${r.kind}:${r.key}`);
                if (r.kind === 'task' && (r.value.revision !== event.aggregateVersion || typeof r.value.revision !== 'number'
                    || prior && Number(prior.value.revision) >= r.value.revision))
                    throw fail('workflow-response-invalid', '任务事实版本倒退');
                records.set(`${r.kind}:${r.key}`, r);
                cursor = event.cursor;
            }
            if ((p.hasMore && (!p.events.length || p.cursor !== cursor)) || (!p.hasMore && p.cursor !== p.watermark) || records.size > 5000)
                throw fail('workflow-response-invalid', '任务事件分页结束位置无效');
            next.records = [...records.values()];
            next.cursor = p.cursor;
            next.asOf = p.asOf;
            await this.save(next);
            if (!p.hasMore)
                return;
        }
        throw fail('workflow-catching-up', '任务缓存仍在追赶最新状态，请稍后查询');
    }
    async query(scope, input, signal) {
        assertScope(scope, this.transport.nodeId);
        try {
            await this.refresh(signal);
        }
        catch (cause) {
            signal.throwIfAborted();
            this.lifetime.signal.throwIfAborted();
            this.transport.assertIdentity();
            if (!this.state.binding || cause.code === 'binding_revoked')
                throw cause;
        }
        this.transport.assertIdentity();
        this.lifetime.signal.throwIfAborted();
        const tasks = this.state.records.filter(r => r.kind === 'task' && row(r.value.origin)
            && r.value.origin.scope === scope.sessionId && r.value.origin.sessionGeneration === scope.sessionGeneration
            && (!input.taskId || r.value.taskRef.taskId === input.taskId));
        const ids = new Set(tasks.map(r => r.value.taskRef.taskId));
        const values = input.participants ? this.state.records.filter(r => r.kind === 'participant' && r.value.role !== 'owner'
            && ids.has(r.value.taskRef.taskId)) : tasks;
        const offset = input.offset ?? 0, limit = input.limit ?? 20;
        if (!revision(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
            throw fail('workflow-query-invalid', '查询分页无效');
        const selected = [];
        let bytes = 0;
        for (const item of values.slice(offset, offset + limit)) {
            const size = Buffer.byteLength(JSON.stringify(item.value));
            if (selected.length && bytes + size > 31 * 1024)
                break; // Reserve 1 KiB for the response envelope and separators.
            selected.push(item.value);
            bytes += size;
        }
        return { schema: 'human.workflow.query.v1', freshness: { fresh: this.fresh, asOf: this.state.asOf, cursor: this.state.cursor },
            coverage: 'observed-only', expectedCount: null, records: copy(selected),
            nextOffset: values.length > offset + selected.length ? offset + selected.length : null };
    }
}
