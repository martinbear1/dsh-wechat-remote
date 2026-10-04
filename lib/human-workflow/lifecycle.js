import { humanTaskRef, humanWorkflowDraftRef, humanReminderTitle, sameTaskRef } from '../human-tools/protocol.js';
import { assertScope, bounded, copy, exact, fail, plain, revision, row, sameScope, scopeValid, StateQueue, version } from './data.js';
import { workflowErrorMessage } from './transport.js';
import { randomBytes } from 'node:crypto';
import { canonicalSubmission, sha256 } from './submission-crypto.js';
import { WORKFLOW_LONG_TERM_BYTES } from './archive-store.js';
import { HUMAN_ROUND_MAX_BYTES, HUMAN_SURFACE_MAX_BYTES, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES } from '../human-tools/capacity.js';
import { lifecycleCoverValid, humanCardAsset } from '../human-tools/card-cover.js';
export function receiverBinding(value, nodeId) {
    if (!row(value) || value.schema !== 'human.node.binding.v1' || value.nodeId !== nodeId
        || !plain(value.ownerSubject, 256) || !plain(value.accountInstance, 256) || !plain(value.generation, 256))
        throw fail('lifecycle-binding-invalid', '任务授权绑定无效');
    const binding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: value.ownerSubject, accountInstance: value.accountInstance, generation: value.generation };
    return { binding, bindingKey: sha256(JSON.stringify(binding)) };
}
/** Request data only. Actual audience membership and current eligibility are
 * resolved by the authenticated server without creating participant records. */
export function lifecycleReminderContent(value) {
    if (!row(value) || !plain(value.roundId, 128) || !humanReminderTitle(value.title))
        return;
    if (Object.hasOwn(value, 'recipientSource')) {
        if (!exact(value, ['roundId', 'title', 'condition', 'recipientSource'])
            || value.recipientSource !== 'task-audience' || value.condition !== 'pending-submission')
            return;
    }
    else if (!exact(value, ['roundId', 'title', 'condition', 'participantRefs'])
        || !['pending-submission', 'result-published'].includes(String(value.condition))
        || !Array.isArray(value.participantRefs) || value.participantRefs.length < 1 || value.participantRefs.length > 20
        || new Set(value.participantRefs).size !== value.participantRefs.length
        || !value.participantRefs.every(ref => typeof ref === 'string' && /^[A-Za-z0-9_-]{24,64}(?![\s\S])/.test(ref)))
        return;
    return copy(value);
}
const receiptBlockedCodes = new Set(['download_ticket_expired', 'attachment_download_quota', 'usage_ledger_capacity', 'metering_unavailable', 'receiver-capacity']);
export const RECEIVER_SYNC_MAX_FILES = 4;
export const RECEIVER_SYNC_TIMEOUT_MS = 120_000;
function lifecycleDraft(value) {
    if (!row(value) || !humanWorkflowDraftRef(value.draftRef) || !humanTaskRef(value.taskRef) || !revision(value.expectedRevision)
        || !row(value.content) || !Number.isSafeInteger(value.expiresAt) || !['draft', 'published'].includes(String(value.state)))
        throw fail('lifecycle-response-invalid', '任务方案格式无效');
    bounded(value, HUMAN_SURFACE_MAX_BYTES);
    const ref = humanWorkflowDraftRef(value.draftRef);
    if (ref.kind === 'reminder' && Object.hasOwn(value.content, 'recipientSource') && !lifecycleReminderContent(value.content))
        throw fail('lifecycle-response-invalid', '提醒对象来源无效');
    if (!lifecycleCoverValid(ref.kind, value.content))
        throw fail('lifecycle-response-invalid', '任务方案封面范围或格式无效');
    if (ref.digest !== sha256(canonicalSubmission({ taskRef: value.taskRef, kind: ref.kind, expectedRevision: value.expectedRevision, content: value.content })))
        throw fail('lifecycle-response-invalid', '任务方案摘要不匹配');
    if (value.context !== undefined && (!row(value.context) || !exact(value.context, ['taskTitle'], ['roundTitle', 'submissionCreatedAt', 'reminderTargetCount'])
        || !plain(value.context.taskTitle, 80) || value.context.roundTitle !== undefined && !plain(value.context.roundTitle, 80)
        || value.context.submissionCreatedAt !== undefined && !revision(value.context.submissionCreatedAt)
        || value.context.reminderTargetCount !== undefined && (ref.kind !== 'reminder'
            || !Number.isSafeInteger(value.context.reminderTargetCount) || Number(value.context.reminderTargetCount) < 0 || Number(value.context.reminderTargetCount) > 20)))
        throw fail('lifecycle-response-invalid', '任务说明来源无效');
    if (value.execution !== undefined) {
        const execution = value.execution, result = value.result;
        if (ref.kind !== 'reminder' || value.state !== 'published' || !row(execution) || !row(result)
            || !exact(execution, ['operationId', 'phase', 'outcome', 'reason']) || !plain(execution.operationId, 80)
            || execution.operationId !== result.operationId || result.taskId !== value.taskRef.taskId
            || result.deliveryId !== value.taskRef.deliveryId
            || !['prepared', 'invoked', 'settled'].includes(String(execution.phase))
            || (execution.phase === 'settled' ? !['success', 'failed', 'cancelled', 'unknown'].includes(String(execution.outcome)) : execution.outcome !== null)
            || execution.reason !== null && !plain(execution.reason, 80))
            throw fail('lifecycle-response-invalid', '提醒执行结果不匹配');
    }
    return copy(value);
}
function draftEffects(draft) {
    const published = draft.state === 'published', kind = draft.draftRef.kind, execution = draft.execution;
    let notificationState = 'not-requested-by-this-action';
    if (kind === 'reminder') {
        notificationState = !published ? 'not-started' : !execution ? 'unknown'
            : execution.phase === 'prepared' ? 'not-started' : execution.phase === 'invoked' ? 'pending'
                : execution.reason === 'no_pending_members' ? 'not-needed'
                    : ({ success: 'succeeded', failed: 'failed', cancelled: 'cancelled', unknown: 'unknown' }[execution.outcome || ''] || 'unknown');
    }
    return { contentState: !published ? 'not-published' : kind === 'review' ? 'private-feedback-visible'
            : kind === 'round' ? 'existing-task-updated' : 'unchanged',
        groupCardState: 'not-sent-by-this-action', notificationState };
}
/** Local receiver and draft tools never approve. Only the authenticated owner
 * WeChat endpoint can publish a draft. No Agent restoration or execution here. */
export class WorkflowLifecycle {
    options;
    state;
    lifetime = new AbortController();
    registered = new Set();
    offsets = new Map();
    background = Promise.resolve();
    syncing = false;
    cursor = 0;
    available = false;
    constructor(options, state) {
        this.options = options;
        this.state = state;
    }
    static async open(options) {
        const raw = await options.store.load(), nodeId = options.transport.nodeId;
        let ledger = { schema: 'human.lifecycle.local.v1', nodeId, analyses: [] };
        if (raw !== undefined) {
            if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'analyses'], ['receipts']) || raw.schema !== ledger.schema || raw.nodeId !== nodeId
                || !Array.isArray(raw.analyses) || raw.analyses.length > 2048)
                throw fail('lifecycle-store-invalid', '任务处理账本无效');
            const ids = new Set();
            for (const entry of raw.analyses) {
                if (!row(entry) || !exact(entry, ['scope', 'taskRef', 'submissionId', 'submissionVersion', 'revision', 'text', 'updatedAt'])
                    || !scopeValid(entry.scope) || entry.scope.nodeId !== nodeId || !humanTaskRef(entry.taskRef) || !plain(entry.submissionId, 128)
                    || !version(entry.submissionVersion) || !version(entry.revision) || !plain(entry.text, 8000) || !revision(entry.updatedAt))
                    throw fail('lifecycle-store-invalid', '任务分析记录无效');
                const key = canonicalSubmission([entry.scope, entry.submissionId]);
                if (ids.has(key))
                    throw fail('lifecycle-store-invalid', '任务分析记录重复');
                ids.add(key);
            }
            ledger = copy(raw);
            if (raw.receipts !== undefined) {
                if (!Array.isArray(raw.receipts) || raw.receipts.length > 4096)
                    throw fail('lifecycle-store-invalid', '收件意图账本无效');
                const receipts = new Set();
                for (const r of raw.receipts) {
                    if (!row(r) || !exact(r, ['scope', 'taskRef', 'submissionId', 'submissionVersion', 'revision', 'requestId', 'state', 'updatedAt'], ['errorCode'])
                        || !scopeValid(r.scope) || r.scope.nodeId !== nodeId || !humanTaskRef(r.taskRef) || !plain(r.submissionId, 128) || !version(r.submissionVersion)
                        || !version(r.revision) || !/^[a-f0-9]{64}$/.test(String(r.requestId)) || !['pending', 'received', 'blocked'].includes(String(r.state))
                        || !revision(r.updatedAt) || r.errorCode !== undefined && !receiptBlockedCodes.has(String(r.errorCode)))
                        throw fail('lifecycle-store-invalid', '收件意图账本无效');
                    const key = canonicalSubmission([r.scope, r.taskRef, r.submissionId, r.submissionVersion]);
                    if (receipts.has(key))
                        throw fail('lifecycle-store-invalid', '收件意图重复');
                    receipts.add(key);
                }
            }
        }
        bounded(ledger, WORKFLOW_LONG_TERM_BYTES);
        return new WorkflowLifecycle(options, new StateQueue(options.store, ledger, WORKFLOW_LONG_TERM_BYTES));
    }
    active(signal) { this.options.transport.assertIdentity(); this.lifetime.signal.throwIfAborted(); return AbortSignal.any([signal, this.lifetime.signal]); }
    async prepareInitial(signal, requiresImage) {
        const active = this.active(signal);
        if (requiresImage && !this.options.receiver)
            throw fail('receiver-unavailable', '此宿主尚不能可靠接收和验证图片');
        // Before the first task exists, discover only the node's current binding.
        // This creates no Agent/session and does not turn the snapshot into facts.
        const page = await this.options.transport.request('sync', { mode: 'snapshot', limit: 1 }, active);
        if (!row(page) || page.schema !== 'human.workflow.sync.v1')
            throw fail('lifecycle-binding-invalid', '无法核对首轮接收节点');
        await this.registerKey(page.binding, active);
        this.available = true;
    }
    async registerKey(binding, signal) {
        const { bindingKey } = receiverBinding(binding, this.options.transport.nodeId);
        if (this.registered.has(bindingKey))
            return bindingKey;
        const key = await this.options.keys.ensure(bindingKey, signal);
        const result = await this.options.transport.request('receiver-key', { key }, signal);
        if (!row(result) || result.bindingKey !== bindingKey || receiverBinding(result.binding, this.options.transport.nodeId).bindingKey !== bindingKey
            || canonicalSubmission(result.key) !== canonicalSubmission(key))
            throw fail('lifecycle-binding-invalid', '接收公钥登记绑定不符');
        this.options.transport.assertIdentity();
        signal.throwIfAborted();
        this.registered.add(bindingKey);
        return bindingKey;
    }
    async get(scope, taskRef, signal, extra = {}) {
        assertScope(scope, this.options.transport.nodeId);
        if (!humanTaskRef(taskRef))
            throw fail('lifecycle-query-invalid', '任务引用无效');
        const active = this.active(signal);
        const result = await this.options.transport.request('lifecycle', { operation: 'get', scope: scope.sessionId,
            sessionGeneration: scope.sessionGeneration, taskRef, ...extra }, active);
        this.options.transport.assertIdentity();
        active.throwIfAborted();
        if (!row(result) || !sameTaskRef(humanTaskRef(result.taskRef), taskRef) || !row(result.origin)
            || result.origin.scope !== scope.sessionId || result.origin.sessionGeneration !== scope.sessionGeneration || !revision(result.revision)
            || !Array.isArray(result.rounds) || !Array.isArray(result.submissions) || !Array.isArray(result.drafts) || !Array.isArray(result.participants)
            || !result.submissions.every(row) || result.submissions.length > 20 || result.rounds.length > 100 || result.drafts.length > 100 || result.participants.length > 1000
            || result.nextOffset !== null && !revision(result.nextOffset))
            throw fail('lifecycle-response-invalid', '任务生命周期响应无效');
        bounded(result, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES);
        const bindingKey = await this.registerKey(result.binding, active);
        if (result.bindingKey !== bindingKey)
            throw fail('lifecycle-binding-invalid', '任务接收绑定不符');
        this.available = true;
        return result;
    }
    async query(scope, taskRef, signal, offset = 0, roundId) {
        if (!revision(offset) || roundId !== undefined && !plain(roundId, 128))
            throw fail('lifecycle-query-invalid', '任务分页或轮次引用无效');
        const page = await this.get(scope, taskRef, signal, { offset, limit: 20 });
        const rounds = page.rounds.filter(row), selectedRounds = roundId === undefined ? rounds.slice(-1) : rounds.filter(item => item.id === roundId);
        if (roundId !== undefined && !selectedRounds.length)
            throw fail('lifecycle-query-invalid', '此任务没有指定轮次');
        const submissions = [];
        let bytes = 0;
        for (const item of page.submissions) {
            const size = Buffer.byteLength(JSON.stringify(item));
            if (bytes + size > 40 * 1024)
                break;
            submissions.push(item);
            bytes += size;
        }
        // No owner/account identity, receiver key or bearer download ticket in tool output.
        return { schema: 'human.lifecycle.query.v1', taskRef, revision: page.revision, rounds: copy(selectedRounds),
            roundRefs: rounds.map(item => ({ id: item.id, number: item.number, title: item.title })), submissions: copy(submissions),
            participants: copy(page.participants), drafts: page.drafts.map(value => {
                const draft = lifecycleDraft(value);
                return { draftRef: draft.draftRef, state: draft.state, expiresAt: draft.expiresAt,
                    effects: draftEffects(draft) };
            }), nextOffset: submissions.length < page.submissions.length ? offset + submissions.length : page.nextOffset, asOf: (this.options.now ?? Date.now)() };
    }
    async prepare(scope, taskRef, kind, expectedRevision, content, idempotencyKey, signal) {
        const active = this.active(signal);
        if (!['round', 'review', 'reminder'].includes(kind) || !revision(expectedRevision) || !row(content) || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey))
            throw fail('lifecycle-draft-invalid', '任务方案参数无效');
        bounded(content, HUMAN_ROUND_MAX_BYTES);
        if (!lifecycleCoverValid(kind, content))
            throw fail('lifecycle-cover-invalid', '封面仅适用于公开新轮次，不能用于定向轮次、私密反馈或订正');
        if (kind === 'reminder' && !lifecycleReminderContent(content))
            throw fail('lifecycle-reminder-invalid', '提醒内容或对象来源无效');
        if (content.cover !== undefined) {
            if (!this.options.coverAuthority)
                throw fail('lifecycle-cover-unavailable', '此节点不能核对封面图片来源');
            this.options.coverAuthority(scope, humanCardAsset(content.cover));
        }
        const current = await this.get(scope, taskRef, active);
        if (current.revision !== expectedRevision)
            throw fail('lifecycle-version-conflict', '任务已变化，请重新查询后准备方案');
        if (kind === 'reminder' && content.recipientSource === 'task-audience') {
            const round = current.rounds.find(value => row(value) && value.id === content.roundId);
            if (!row(round) || round.recipientRefs !== null)
                throw fail('lifecycle-reminder-invalid', '只能复用此任务公开提交要求的固定指定名单进行提醒');
        }
        const result = await this.options.transport.request('lifecycle', { operation: `${kind}-draft`, scope: scope.sessionId,
            sessionGeneration: scope.sessionGeneration, taskRef, expectedRevision, content, idempotencyKey }, active);
        this.options.transport.assertIdentity();
        active.throwIfAborted();
        if (!row(result))
            throw fail('lifecycle-response-invalid', '任务方案响应无效');
        const draft = lifecycleDraft(result.draft);
        if (!sameTaskRef(draft.taskRef, taskRef) || draft.draftRef.kind !== kind || draft.expectedRevision !== expectedRevision
            || canonicalSubmission(draft.content) !== canonicalSubmission(content))
            throw fail('lifecycle-response-invalid', '任务方案与所请求内容不一致');
        return draft;
    }
    async preview(scope, taskRef, ref, signal) {
        if (!humanWorkflowDraftRef(ref))
            throw fail('lifecycle-draft-invalid', '任务方案引用无效');
        const page = await this.get(scope, taskRef, signal, { draftId: ref.draftId });
        const draft = page.drafts.map(lifecycleDraft).find(item => canonicalSubmission(item.draftRef) === canonicalSubmission(ref));
        if (!draft)
            throw fail('lifecycle-draft-unavailable', '原任务方案已不可用；不能替换成其他版本');
        return { schema: 'human.workflow.preview.v1', ref: copy(ref), taskRef: copy(taskRef), draft };
    }
    receipt(scope, taskRef, submissionId, submissionVersion) {
        return this.state.current().receipts?.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef)
            && r.submissionId === submissionId && r.submissionVersion === submissionVersion);
    }
    async receiptStatus(scope, taskRef, signal, offset = 0) {
        if (!revision(offset) || offset > 10000)
            throw fail('lifecycle-query-invalid', '收件分页位置无效');
        const active = this.active(signal), page = await this.get(scope, taskRef, active, { offset, limit: 20 });
        const items = [];
        for (const item of page.submissions) {
            if (!plain(item.id, 128) || !version(item.version) || !plain(item.roundId, 128))
                throw fail('lifecycle-response-invalid', '收件列表无效');
            const r = this.receipt(scope, taskRef, item.id, item.version);
            let state = item.delivery === 'not-required' ? 'not-required' : item.delivery === 'expired' ? 'blocked' : r?.state ?? 'pending', errorCode = r?.errorCode;
            if (item.delivery === 'expired')
                errorCode = 'submission-expired';
            if (item.delivery === 'received') {
                try {
                    const original = await this.options.receiver?.read(scope, item.id, String(page.bindingKey), active);
                    if (!original || original.manifest.context.version !== item.version || !sameTaskRef(original.manifest.context.taskRef, taskRef))
                        throw fail('submission-not-received', '收件不可用');
                    state = 'received';
                    errorCode = undefined;
                }
                catch {
                    this.active(active);
                    state = 'blocked';
                    errorCode = 'submission-not-received';
                }
            }
            items.push({ submissionId: item.id, submissionVersion: item.version, roundId: item.roundId, state, revision: r?.revision ?? 0,
                ...(errorCode ? { errorCode, message: workflowErrorMessage(errorCode) } : {}), retryable: state === 'blocked' && item.delivery === 'pending' && !!errorCode && receiptBlockedCodes.has(errorCode) });
        }
        return { schema: 'human.workflow.receipts.v1', taskRef: copy(taskRef), asOf: page.asOf, items, nextOffset: page.nextOffset };
    }
    async retryReceipt(scope, taskRef, input, signal) {
        const active = this.active(signal);
        if (!plain(input.submissionId, 128) || !version(input.submissionVersion) || !revision(input.expectedRevision))
            throw fail('lifecycle-query-invalid', '收件重试引用无效');
        const page = await this.get(scope, taskRef, active, { submissionId: input.submissionId });
        const item = page.submissions.find(s => s.id === input.submissionId && s.version === input.submissionVersion);
        if (!item || item.state !== 'accepted' || item.delivery !== 'pending')
            throw fail('receipt-retry-unavailable', '该提交无需或不能重新申请下载；请核对原始收件');
        return this.state.update(next => {
            this.active(active);
            const r = next.receipts?.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.submissionId === input.submissionId && r.submissionVersion === input.submissionVersion);
            if (!r || r.revision !== input.expectedRevision || r.state !== 'blocked' || !r.errorCode || !receiptBlockedCodes.has(r.errorCode))
                throw fail('receipt-version-conflict', '收件状态已变化；请先刷新核对，不会重复申请下载');
            r.requestId = randomBytes(32).toString('hex');
            r.revision++;
            r.state = 'pending';
            delete r.errorCode;
            r.updatedAt = (this.options.now ?? Date.now)();
            return { schema: 'human.workflow.receipt-retry.v1', taskRef: copy(taskRef), submissionId: r.submissionId, submissionVersion: r.submissionVersion, revision: r.revision, state: 'pending' };
        }, active);
    }
    /** One hook on the existing node sync loop. Bounded round-robin scan, not a
     * task poller. Failed receivers remain retryable; neither events nor ACKs
     * call a model, create sessions or restore stopped Agents. */
    synced(binding, tasks, signal) {
        if (this.syncing)
            return this.background;
        this.syncing = true;
        const operation = this.background.then(async () => {
            const budget = AbortSignal.timeout(RECEIVER_SYNC_TIMEOUT_MS), now = this.options.now ?? Date.now;
            const deadline = now() + RECEIVER_SYNC_TIMEOUT_MS;
            const ownerSignal = this.active(signal), active = AbortSignal.any([ownerSignal, budget]);
            const outOfBudget = () => budget.aborted || now() >= deadline;
            let attempts = 0;
            await this.registerKey(binding, active);
            if (!this.options.receiver)
                return;
            const candidates = tasks.filter(task => Number(task.lifecycleRevision) > 0 && row(task.origin) && humanTaskRef(task.taskRef));
            for (let count = 0; count < Math.min(8, candidates.length); count++) {
                ownerSignal.throwIfAborted();
                if (outOfBudget() || attempts >= RECEIVER_SYNC_MAX_FILES)
                    break;
                const task = candidates[(this.cursor++) % candidates.length], origin = task.origin, taskRef = humanTaskRef(task.taskRef);
                const scope = { nodeId: this.options.transport.nodeId, sessionId: String(origin.scope), sessionGeneration: String(origin.sessionGeneration) };
                try {
                    const offset = this.offsets.get(taskRef.taskId) ?? 0;
                    const page = await this.get(scope, taskRef, active, { offset, limit: 20 });
                    const items = page.submissions.slice(0, 20);
                    for (const [index, item] of items.entries()) {
                        ownerSignal.throwIfAborted();
                        if (outOfBudget() || attempts >= RECEIVER_SYNC_MAX_FILES)
                            return;
                        // Resume the next item, not the next page, when this tick's finite
                        // budget is exhausted. Failed items are revisited on the next lap.
                        this.offsets.set(taskRef.taskId, index + 1 === items.length ? (typeof page.nextOffset === 'number' ? page.nextOffset : 0) : offset + index + 1);
                        if (!plain(item.id, 128) || !version(item.version) || !(item.state === 'accepted' && item.delivery === 'pending' || item.state === 'expired' && item.delivery === 'expired'))
                            continue;
                        let intent = this.receipt(scope, taskRef, item.id, item.version);
                        if (intent?.state === 'blocked')
                            continue;
                        if (!intent)
                            intent = await this.state.update(next => {
                                this.active(active);
                                next.receipts ??= [];
                                if (next.receipts.length >= 4096)
                                    throw fail('lifecycle-capacity', '收件意图已达容量上限，未删除旧记录');
                                const r = { scope: copy(scope), taskRef: copy(taskRef), submissionId: String(item.id), submissionVersion: Number(item.version), revision: 1,
                                    requestId: sha256(canonicalSubmission([scope, taskRef, item.id])), state: 'pending', updatedAt: now() };
                                next.receipts.push(r);
                                return r;
                            }, active);
                        attempts++;
                        try {
                            const claim = (receipt) => this.options.transport.request('objects/claim', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration,
                                taskRef, submissionId: item.id, requestId: intent.requestId, ...(receipt ? { receipt } : {}) }, active);
                            const recovered = typeof this.options.receiver.recoverReceipt === 'function' && await this.options.receiver.recoverReceipt(scope, taskRef, String(page.bindingKey), item.id, item.version, claim, active);
                            if (!recovered) {
                                if (item.delivery === 'expired')
                                    continue; // only durable-original ACK may recover an expired object
                                const claimed = await claim();
                                if (!row(claimed))
                                    throw fail('receiver-claim-invalid', '收件租约响应无效');
                                await this.options.receiver.receive(scope, taskRef, String(page.bindingKey), claimed.delivery, active);
                            }
                            await this.state.update(next => { const r = next.receipts.find(r => r.requestId === intent.requestId); r.state = 'received'; r.updatedAt = now(); }, active);
                        }
                        catch (cause) {
                            const code = String(cause?.code ?? '');
                            if (receiptBlockedCodes.has(code))
                                await this.state.update(next => {
                                    const r = next.receipts.find(r => r.requestId === intent.requestId);
                                    r.state = 'blocked';
                                    r.errorCode = code;
                                    r.revision++;
                                    r.updatedAt = now();
                                }, active);
                            else
                                throw cause;
                        }
                    }
                    if (!items.length)
                        this.offsets.set(taskRef.taskId, typeof page.nextOffset === 'number' ? page.nextOffset : 0);
                }
                catch {
                    ownerSignal.throwIfAborted();
                    this.options.transport.assertIdentity();
                    if (outOfBudget())
                        return; /* deadline is not a task failure; next sync resumes */
                    /* retry boundedly on next sync */
                }
            }
        });
        const finished = operation.finally(() => { this.syncing = false; });
        this.background = finished.catch(() => { });
        return finished;
    }
    async readImage(scope, taskRef, submissionId, signal) {
        if (!this.options.receiver)
            throw fail('receiver-unavailable', '此宿主不支持原生图片接收');
        const page = await this.get(scope, taskRef, signal, { submissionId });
        const item = page.submissions.find(item => item.id === submissionId);
        if (!item)
            throw fail('submission-unavailable', '提交不属于此会话任务');
        const result = await this.options.receiver.read(scope, submissionId, String(page.bindingKey), this.active(signal));
        if (!sameTaskRef(result.manifest.context.taskRef, taskRef) || item.version !== result.manifest.context.version)
            throw fail('submission-unavailable', '提交版本已变化');
        return result;
    }
    /** Fresh signed authority for automatic work. This is intentionally not the
     * local replica and not a timestamp supplied by the phone or workstation. */
    async inspectAutomation(scope, taskRef, signal, extra = {}) {
        const page = await this.get(scope, taskRef, signal, { ...extra, limit: 20 });
        if (!revision(page.asOf) || !plain(page.bindingKey, 64))
            throw fail('automation-authority-unavailable', '服务端尚不提供新鲜自动处理授权时间');
        const submissions = page.submissions.map(s => {
            if (!plain(s.id, 128) || !plain(s.roundId, 128) || !version(s.version) || !plain(s.state, 32) || !plain(s.delivery, 32)
                || s.acceptedAt !== null && !revision(s.acceptedAt) || !row(s.values))
                throw fail('automation-authority-invalid', '提交授权记录无效');
            return copy(s);
        });
        return { bindingKey: String(page.bindingKey), asOf: page.asOf, revision: Number(page.revision), rounds: copy(page.rounds), submissions,
            participants: page.participants.filter(p => plain(p.participantRef, 128)).map(p => ({ participantRef: String(p.participantRef) })), nextOffset: page.nextOffset };
    }
    async readyAutomation(scope, taskRef, submission, signal) {
        if (submission.state !== 'accepted')
            return false;
        if (submission.delivery === 'not-required')
            return true;
        if (submission.delivery !== 'received')
            return false;
        const received = await this.readImage(scope, taskRef, submission.id, signal);
        return received.manifest.context.version === submission.version && received.manifest.context.roundId === submission.roundId;
    }
    async saveAnalysis(scope, taskRef, input, signal) {
        const active = this.active(signal);
        if (!plain(input.text, 8000) || !version(input.submissionVersion) || !revision(input.expectedRevision))
            throw fail('lifecycle-analysis-invalid', '分析内容或版本无效');
        const page = await this.get(scope, taskRef, active, { submissionId: input.submissionId });
        const submission = page.submissions.find(item => item.id === input.submissionId && item.version === input.submissionVersion);
        if (!submission)
            throw fail('submission-unavailable', '分析引用的提交不存在');
        if (submission.delivery !== 'not-required')
            await this.readImage(scope, taskRef, input.submissionId, active);
        return this.state.update(ledger => {
            this.options.transport.assertIdentity();
            const previous = ledger.analyses.find(entry => sameScope(entry.scope, scope) && entry.submissionId === input.submissionId);
            if ((previous?.revision ?? 0) !== input.expectedRevision)
                throw fail('lifecycle-version-conflict', '分析版本已变化');
            if (!previous && ledger.analyses.length >= 2048)
                throw fail('lifecycle-capacity', '本地分析和归档已达到 2048 份上限；不会自动删除历史');
            const next = { scope: copy(scope), taskRef: copy(taskRef), submissionId: input.submissionId, submissionVersion: input.submissionVersion,
                revision: input.expectedRevision + 1, text: input.text, updatedAt: (this.options.now ?? Date.now)() };
            if (previous)
                ledger.analyses[ledger.analyses.indexOf(previous)] = next;
            else
                ledger.analyses.push(next);
            return next;
        }, active);
    }
    analyses(scope, taskRef) {
        this.active(new AbortController().signal);
        assertScope(scope, this.options.transport.nodeId);
        return copy(this.state.current().analyses.filter(item => sameScope(item.scope, scope) && sameTaskRef(item.taskRef, taskRef)));
    }
    async close() { this.lifetime.abort(); await this.state.close(); await this.background; }
}
