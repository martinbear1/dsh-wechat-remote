import { ATTEMPT_ID, HUMAN_ACTION, HUMAN_MEMBERS_ACTION, HUMAN_REMIND_ACTION, HUMAN_ID, humanSurface, humanTaskRef, humanSelectionRef, humanMemberRefs, humanReminderTitle, humanReceiptData, sameTaskRef, sameSelectionRef, object, text } from './protocol.js';
export const HUMAN_MAX_RECORDS = 128;
export const HUMAN_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const HUMAN_CONTEXT_LIMIT = 8;
const MAX_ATTEMPTS = 4;
const error = (code, message) => Object.assign(new Error(message), { code });
const clone = (value) => structuredClone(value);
function validOrigin(origin) {
    return object(origin) && text(origin.scope, 256) && text(origin.generation, 80) && text(origin.callId, 256) && text(origin.rootCallId, 256);
}
function validateLedger(value) {
    if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > HUMAN_MAX_RECORDS)
        throw error('human-store-invalid', '测试卡片存储格式不受支持');
    const ids = new Set();
    for (const record of value.records) {
        if (!object(record) || !humanSurface(record.surface) || !validOrigin(record.origin)
            || !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 0
            || !Array.isArray(record.attempts) || record.attempts.length > MAX_ATTEMPTS)
            throw error('human-store-invalid', '测试卡片记录无效');
        const surface = record.surface;
        if (ids.has(surface.id))
            throw error('human-store-invalid', '测试卡片标识重复');
        ids.add(surface.id);
        const attempts = new Set();
        for (const attempt of record.attempts) {
            if (!object(attempt) || typeof attempt.id !== 'string' || !ATTEMPT_ID.test(attempt.id) || attempts.has(attempt.id))
                throw error('human-store-invalid', '测试卡片动作无效');
            attempts.add(attempt.id);
            const receipt = attempt.receipt;
            if (receipt !== undefined && (!object(receipt) || receipt.schema !== 'human.action.receipt.v1'
                || receipt.surfaceId !== surface.id || receipt.attemptId !== attempt.id
                || typeof receipt.receiptId !== 'string' || !HUMAN_ID.test(receipt.receiptId)
                || !['success', 'cancelled', 'failed', 'unknown'].includes(String(receipt.outcome))
                || !humanReceiptData(surface, receipt)
                || !['recorded', 'pending', 'dispatching', 'queued', 'uncertain'].includes(String(receipt.delivery))))
                throw error('human-store-invalid', '测试卡片回执无效');
        }
    }
    return clone(value);
}
export class HumanToolsCore {
    store;
    randomId;
    now;
    ledger = { schemaVersion: 1, records: [] };
    tail = Promise.resolve();
    stopped = false;
    constructor(store, randomId, now) {
        this.store = store;
        this.randomId = randomId;
        this.now = now;
    }
    static async open(store, randomId, now = Date.now) {
        const core = new HumanToolsCore(store, randomId, now);
        core.ledger = validateLedger(await store.load());
        return core;
    }
    /** Stop admission immediately; callers must await the already-started write
     * before another instance opens this ledger during a plugin reload. */
    close() { this.stopped = true; return this.tail.then(() => { }); }
    available() { if (this.stopped)
        throw error('human-tools-disabled', '测试卡片功能已关闭'); }
    serial(work) {
        const result = this.tail.then(() => { this.available(); return work(); });
        this.tail = result.catch(() => { });
        return result;
    }
    async commit(next) {
        this.available();
        try {
            await this.store.save(next);
        }
        catch (cause) {
            this.stopped = true;
            throw cause;
        }
        this.ledger = next;
        // A completed write stays durable even when disposal happened during I/O,
        // but that disposed caller must not receive a fresh execution permission.
        this.available();
    }
    record(ledger, scope, surfaceId) {
        if (!text(scope, 256) || typeof surfaceId !== 'string' || !HUMAN_ID.test(surfaceId))
            throw error('human-action-invalid', '卡片参数无效');
        const record = ledger.records.find(row => row.surface.id === surfaceId && row.origin.scope === scope);
        if (!record || record.createdAt + HUMAN_RETENTION_MS <= this.now())
            throw error('human-surface-unavailable', '测试卡片已过期或不属于此会话');
        return record;
    }
    request(ledger, request) {
        if (!object(request) || request.revision !== 1
            || typeof request.attemptId !== 'string' || !ATTEMPT_ID.test(request.attemptId))
            throw error('human-action-invalid', '卡片动作版本或参数无效');
        const record = this.record(ledger, request.scope, request.surfaceId);
        if (request.actionId !== record.surface.actions[0].id)
            throw error('human-action-invalid', '卡片动作与已保存记录不符');
        return record;
    }
    /** Adapter check only: generation comes from the actual host, never the RPC.
     * Delayed ACKs may still reconcile their old ledger without waking an Agent. */
    assertGeneration(scope, surfaceId, generation) {
        this.available();
        if (this.record(this.ledger, scope, surfaceId).origin.generation !== generation)
            throw error('human-origin-conflict', '会话身份已变化，不能打开旧测试卡片');
    }
    create(origin, title, body, signal, sourceSurfaceId) {
        return this.createAction(origin, signal, () => ({ title, body,
            ...(sourceSurfaceId !== undefined ? { targetTaskRef: this.publishedSource(origin, sourceSurfaceId).taskRef } : {}), actions: [{ ...HUMAN_ACTION }] }));
    }
    source(origin, sourceSurfaceId, actionId) {
        const source = this.record(this.ledger, origin.scope, sourceSurfaceId);
        if (source.origin.generation !== origin.generation)
            throw error('human-origin-conflict', '会话身份已变化，不能复用旧卡片');
        if (source.surface.actions[0].id !== actionId)
            throw error('human-source-unavailable', '来源卡片类型不符');
        return source;
    }
    publishedSource(origin, sourceSurfaceId) {
        const record = this.source(origin, sourceSurfaceId, 'share');
        const taskRef = record.attempts.slice().reverse().find(attempt => attempt.receipt?.outcome === 'success' && attempt.receipt.taskRef)?.receipt?.taskRef;
        if (!taskRef)
            throw error('human-source-unavailable', '此卡片尚无可复用的成功发布记录');
        return { record, taskRef: clone(taskRef) };
    }
    createMembers(origin, sourceSurfaceId, signal) {
        return this.createAction(origin, signal, () => {
            const { record, taskRef } = this.publishedSource(origin, sourceSurfaceId);
            return { title: record.surface.title, body: `为任务“${record.surface.title}”选择提醒成员。仅用于之后经主人批准的提醒，不授予私密内容或电脑访问权限。\n任务说明：${record.surface.body}`.slice(0, 1000),
                targetTaskRef: taskRef, actions: [{ ...HUMAN_MEMBERS_ACTION }] };
        });
    }
    createReminder(origin, sourceSurfaceId, title, signal, memberRefs) {
        return this.createAction(origin, signal, () => {
            if (!humanReminderTitle(title) || memberRefs !== undefined && !humanMemberRefs(memberRefs))
                throw error('human-surface-invalid', '提醒标题或成员范围无效');
            const source = this.source(origin, sourceSurfaceId, 'select-members');
            const selected = source.attempts.slice().reverse().find(attempt => attempt.receipt?.outcome === 'success' && attempt.receipt.selectionRef)?.receipt?.selectionRef;
            if (!selected)
                throw error('human-source-unavailable', '此卡片尚无明确选择成员的成功记录');
            // Until the UI can show a trustworthy named subset approval, only the
            // owner's entire native selection is executable. Preserve its ordering.
            if (memberRefs !== undefined && (memberRefs.length !== selected.memberRefs.length || memberRefs.some(id => !selected.memberRefs.includes(id))))
                throw error('human-members-invalid', '只能提醒本任务已选定的全部成员；如需更小范围，请先重新选择成员');
            const selectionRef = clone(selected);
            return { title: source.surface.title, body: `提醒内容：${title}\n提醒范围：你已为本任务选定的全部${selectionRef.memberRefs.length}位成员中尚未确认者。\n点击可能直接发送，不保证另有微信确认。若只提醒其中一部分，请先重新选择成员；不会自动重试。`,
                targetTaskRef: { schema: 'human.task.ref.v1', taskId: selected.taskId, deliveryId: selected.deliveryId },
                selectionRef, reminder: { title, type: 'complete' }, actions: [{ ...HUMAN_REMIND_ACTION }] };
        });
    }
    createAction(origin, signal, prepare) {
        return this.serial(async () => {
            signal.throwIfAborted();
            if (!validOrigin(origin))
                throw error('human-surface-invalid', '卡片会话身份无效');
            const prepared = prepare();
            if (!text(prepared.title, 80) || !text(prepared.body, 1000))
                throw error('human-surface-invalid', '卡片名称或说明无效');
            // One surface per root invocation also covers native Code Mode subcalls.
            const existing = this.ledger.records.find(row => row.origin.scope === origin.scope && row.origin.rootCallId === origin.rootCallId);
            if (existing && existing.origin.generation !== origin.generation)
                throw error('human-origin-conflict', '会话身份已变化，不能复用旧测试卡片');
            if (existing && (!sameTaskRef(existing.surface.targetTaskRef, prepared.targetTaskRef)
                || existing.surface.actions[0].id !== prepared.actions[0].id
                || !sameSelectionRef(existing.surface.selectionRef, prepared.selectionRef)
                || existing.surface.reminder?.title !== prepared.reminder?.title))
                throw error('human-target-conflict', '此工具调用已有不同目标或动作，未覆盖原卡片');
            if (existing)
                return clone(this.record(this.ledger, origin.scope, existing.surface.id).surface);
            const next = clone(this.ledger);
            next.records = next.records.filter(row => row.createdAt + HUMAN_RETENTION_MS > this.now());
            if (next.records.length >= HUMAN_MAX_RECORDS)
                throw error('human-surface-capacity', '测试卡片数量已达上限，请等待旧卡片过期');
            const surface = { schemaVersion: 1, kind: 'human.surface', id: this.randomId(), revision: 1, ...clone(prepared) };
            if (!humanSurface(surface) || next.records.some(row => row.surface.id === surface.id))
                throw error('human-id-invalid', '卡片标识生成失败');
            next.records.push({ surface, origin: clone(origin), createdAt: this.now(), attempts: [] });
            signal.throwIfAborted();
            await this.commit(next);
            return clone(surface);
        });
    }
    /** Read-only host presentation. Never trust model text or another tool's metadata. */
    forResult(scope, callId, generation) {
        if (this.stopped)
            return;
        const record = this.ledger.records.find(row => row.origin.scope === scope && row.origin.rootCallId === callId);
        return record && (generation === undefined || record.origin.generation === generation)
            && record.createdAt + HUMAN_RETENTION_MS > this.now() ? clone(record.surface) : undefined;
    }
    /** Latest receipt per surface from authoritative state, not user/model text.
     * Bounded, read-only and generation-scoped: prompt assembly performs no I/O,
     * writes, queue operations or model wakeup. No titles/bodies are included. */
    contextSnapshot(scope, generation) {
        if (this.stopped || !text(scope, 256) || !text(generation, 80))
            return [];
        return this.ledger.records.filter(row => row.origin.scope === scope && row.origin.generation === generation
            && row.createdAt + HUMAN_RETENTION_MS > this.now())
            .map(row => row.attempts.slice().reverse().find(attempt => attempt.receipt)?.receipt)
            .filter((receipt) => Boolean(receipt))
            .slice(-HUMAN_CONTEXT_LIMIT).map(clone);
    }
    claim(request, signal) {
        return this.serial(async () => {
            signal.throwIfAborted();
            const next = clone(this.ledger), record = this.request(next, request);
            if (!record.attempts.some(attempt => attempt.id === request.attemptId)) {
                if (record.attempts.some(attempt => !attempt.receipt))
                    throw error('human-action-in-progress', '已有分享操作待确认，请先返回原页面');
                if (record.attempts.length >= MAX_ATTEMPTS)
                    throw error('human-action-capacity', '此测试卡片已达到操作次数上限');
                record.attempts.push({ id: request.attemptId });
                await this.commit(next);
            }
            return { schema: 'human.action.claim.v1', surface: clone(record.surface), attemptId: request.attemptId, action: { ...record.surface.actions[0] } };
        });
    }
    ack(request, signal) {
        return this.serial(async () => {
            signal.throwIfAborted();
            if (!['success', 'cancelled', 'failed', 'unknown'].includes(request?.outcome))
                throw error('human-action-invalid', '分享回执状态无效');
            const taskRef = humanTaskRef(request.taskRef);
            const next = clone(this.ledger), record = this.request(next, request);
            if (!humanReceiptData(record.surface, request))
                throw error('human-action-invalid', '回执引用或原因与已保存动作不符');
            const selectionRef = humanSelectionRef(request.selectionRef), reason = request.reason;
            const attempt = record.attempts.find(row => row.id === request.attemptId);
            if (!attempt)
                throw error('human-action-not-claimed', '请先打开此卡片的分享操作');
            if (attempt.receipt && (attempt.receipt.outcome !== request.outcome || !sameTaskRef(attempt.receipt.taskRef, taskRef)
                || !sameSelectionRef(attempt.receipt.selectionRef, selectionRef) || attempt.receipt.reason !== reason))
                throw error('human-receipt-conflict', '此操作已有不同回执，未覆盖原记录');
            if (!attempt.receipt) {
                attempt.receipt = { schema: 'human.action.receipt.v1', surfaceId: request.surfaceId, attemptId: request.attemptId,
                    receiptId: this.randomId(), outcome: request.outcome, delivery: 'recorded', ...(taskRef ? { taskRef: clone(taskRef) } : {}),
                    ...(selectionRef ? { selectionRef: clone(selectionRef) } : {}), ...(reason ? { reason } : {}) };
            }
            else if (attempt.receipt.delivery === 'pending') {
                // COMPAT(human-inbox-m0): an old not-yet-delivered receipt can now be
                // finalized without requiring a live Agent. Never append/replay Inbox.
                attempt.receipt = { ...attempt.receipt, delivery: 'recorded' };
            }
            else {
                // Legacy dispatch ambiguity remains inspectable, but never triggers send.
                return { ...clone(attempt.receipt), delivery: attempt.receipt.delivery === 'dispatching' ? 'uncertain' : attempt.receipt.delivery };
            }
            // Last changed receipt first in recency, without another timestamp/index
            // or altering expiry. A fresh ACK for an old card must not be omitted by
            // the bounded context. Duplicate ACKs do not reorder or rewrite state.
            next.records.splice(next.records.indexOf(record), 1);
            next.records.push(record);
            await this.commit(next);
            return clone(attempt.receipt);
        });
    }
    status(scope, surfaceId) {
        this.available();
        const record = this.record(this.ledger, scope, surfaceId);
        return { schema: 'human.surface.status.v1', surface: clone(record.surface), receipts: record.attempts
                .filter(attempt => attempt.receipt).map(attempt => ({ ...clone(attempt.receipt),
                delivery: attempt.receipt.delivery === 'dispatching' ? 'uncertain' : attempt.receipt.delivery })) };
    }
}
