import { randomBytes } from 'node:crypto';
import { humanTaskRef, humanWorkflowDraftRef, sameTaskRef } from '../human-tools/protocol.js';
import { assertScope, bounded, copy, exact, fail, identifier, plain, revision, row, sameScope, scopeValid, StateQueue, version } from './data.js';
import { canonicalSubmission, sha256 } from './submission-crypto.js';
import { WORKFLOW_LONG_TERM_BYTES } from './archive-store.js';
const digest = (value) => sha256(canonicalSubmission(value));
const taskKey = (scope, taskRef) => digest([scope, taskRef]);
const signalNone = () => new AbortController().signal;
const runStates = ['queued', 'dispatching', 'running', 'succeeded', 'failed', 'cancelled', 'unknown'];
function denied(cause) { return /revoked|forbidden|not_found|not-found|generation|scope|identity|account|unauthori|binding|permission|recipients-invalid|authority-changed/.test(String(cause?.code ?? '')); }
export function automationConfig(value) {
    if (!row(value) || !exact(value, ['trigger', 'roundId', 'instructions', 'existing', 'allowSessionResume', 'maxRuns', 'timeoutSeconds', 'concurrency'], ['recipientRefs'])
        || !['manual', 'per-submission', 'all-recipients'].includes(String(value.trigger)) || !identifier(value.roundId) || !plain(value.instructions, 4000)
        || !['new-only', 'include-existing'].includes(String(value.existing)) || typeof value.allowSessionResume !== 'boolean'
        || !version(value.maxRuns) || value.maxRuns > 100 || !version(value.timeoutSeconds) || value.timeoutSeconds < 30 || value.timeoutSeconds > 600
        || value.concurrency !== 1)
        throw fail('automation-config-invalid', '处理规则无效；请选择手动、逐份或指定名单到齐，并发固定为 1');
    if (value.trigger === 'all-recipients') {
        if (!Array.isArray(value.recipientRefs) || !value.recipientRefs.length || value.recipientRefs.length > 100
            || value.recipientRefs.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{24,96}$/.test(id)) || new Set(value.recipientRefs).size !== value.recipientRefs.length
            || value.maxRuns < value.recipientRefs.length)
            throw fail('automation-config-invalid', '名单须为 1..100 个已知参与者；处理次数须覆盖完整名单');
    }
    else if (value.recipientRefs !== undefined)
        throw fail('automation-config-invalid', '只有名单到齐规则可携带指定名单');
    return copy(value);
}
function processorValid(value) {
    return row(value) && exact(value, ['presetId', 'presetDigest', 'provider', 'model', 'permissionPreset', 'fingerprint'], ['reasoningEffort'])
        && ['presetId', 'provider', 'model', 'permissionPreset'].every(key => plain(value[key], 256))
        && ['presetDigest', 'fingerprint'].every(key => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]))
        && (value.reasoningEffort === undefined || plain(value.reasoningEffort, 128));
}
function scopeTask(value, nodeId) { return scopeValid(value.scope) && value.scope.nodeId === nodeId && !!humanTaskRef(value.taskRef); }
const policyKeys = ['schema', 'scope', 'taskRef', 'revision', 'policyVersion', 'state', 'config', 'processor', 'approvedAt', 'updatedAt', 'usedRuns', 'bindingKey', 'acceptanceCutoff', 'sessionSeq'];
function validateLedger(raw, nodeId) {
    const bad = () => fail('automation-store-invalid', '自动处理账本损坏；已停止自动运行，原手动能力不受影响');
    if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'policies', 'previews', 'runs'], ['proposals']) || raw.schema !== 'human.automation.ledger.v1' || raw.nodeId !== nodeId
        || !Array.isArray(raw.policies) || raw.policies.length > 128 || !Array.isArray(raw.previews) || raw.previews.length > 128 || !Array.isArray(raw.runs) || raw.runs.length > 10000)
        throw bad();
    const policies = new Set(), ids = new Set(), runIds = new Set();
    for (const p of raw.policies) {
        if (!row(p) || !exact(p, policyKeys, ['reason', 'batch']) || p.schema !== 'human.automation.policy.v1' || !scopeTask(p, nodeId)
            || !version(p.revision) || !version(p.policyVersion) || !['active', 'paused', 'exhausted', 'blocked'].includes(String(p.state)) || !processorValid(p.processor)
            || ![p.approvedAt, p.updatedAt, p.usedRuns, p.acceptanceCutoff, p.sessionSeq].every(revision) || !/^[a-f0-9]{64}$/.test(String(p.bindingKey))
            || p.reason !== undefined && !plain(p.reason, 256))
            throw bad();
        const config = automationConfig(p.config);
        if (p.batch !== undefined && (!row(p.batch) || !exact(p.batch, ['formedAt', 'selections']) || !revision(p.batch.formedAt)
            || config.trigger !== 'all-recipients' || !Array.isArray(p.batch.selections) || p.batch.selections.length !== config.recipientRefs.length
            || p.batch.selections.some(s => !row(s) || !exact(s, ['submissionId', 'submissionVersion', 'participantRef']) || !identifier(s.submissionId)
                || !version(s.submissionVersion) || typeof s.participantRef !== 'string' || !config.recipientRefs.includes(s.participantRef))
            || new Set(p.batch.selections.map(s => s.participantRef)).size !== p.batch.selections.length))
            throw bad();
        const key = taskKey(p.scope, p.taskRef);
        if (policies.has(key))
            throw bad();
        policies.add(key);
    }
    for (const r of raw.runs) {
        if (!row(r) || !exact(r, ['id', 'scope', 'taskRef', 'submissionId', 'submissionVersion', 'roundId', 'policyVersion', 'state', 'createdAt', 'updatedAt'], ['messageId', 'turn', 'reason', 'analysisRevision', 'draftRef'])
            || !scopeTask(r, nodeId) || !/^[a-f0-9]{32}$/.test(String(r.id)) || !identifier(r.submissionId) || !identifier(r.roundId) || !version(r.submissionVersion) || !version(r.policyVersion)
            || !runStates.includes(String(r.state)) || !revision(r.createdAt) || !revision(r.updatedAt) || r.messageId !== undefined && !plain(r.messageId, 256)
            || r.turn !== undefined && !revision(r.turn) || r.reason !== undefined && !plain(r.reason, 256) || r.analysisRevision !== undefined && !version(r.analysisRevision)
            || r.draftRef !== undefined && humanWorkflowDraftRef(r.draftRef)?.kind !== 'review')
            throw bad();
        const key = digest([r.scope, r.taskRef, r.submissionId, r.submissionVersion]);
        if (ids.has(key))
            throw bad();
        ids.add(key);
        if (runIds.has(String(r.id)) || !policies.has(taskKey(r.scope, r.taskRef)))
            throw bad();
        runIds.add(String(r.id));
    }
    // Previews are not execution authority. Validate them nevertheless; restart
    // discards them so a stale browser cannot approve an old native fingerprint.
    for (const p of raw.previews)
        if (!row(p) || p.schema !== 'human.automation.preview.v1' || !scopeTask(p, nodeId) || !plain(p.previewId, 64)
            || !/^[a-f0-9]{64}$/.test(String(p.digest)) || !revision(p.expiresAt))
            throw bad();
    if (raw.proposals !== undefined) {
        if (!Array.isArray(raw.proposals) || raw.proposals.length > 128)
            throw bad();
        for (const p of raw.proposals) {
            if (!row(p) || !exact(p, ['proposalId', 'digest', 'scope', 'taskRef', 'expectedRevision', 'createdAt', 'config']) || !scopeTask(p, nodeId)
                || !/^[a-f0-9]{32}$/.test(String(p.proposalId)) || !revision(p.createdAt) || !revision(p.expectedRevision))
                throw bad();
            automationConfig(p.config);
            const { digest: expected, ...payload } = p;
            if (expected !== digest(payload))
                throw bad();
        }
    }
    bounded(raw, WORKFLOW_LONG_TERM_BYTES);
    return copy(raw);
}
export function automationPolicyView(policy) {
    if (!policy)
        return null;
    const { scope, bindingKey, acceptanceCutoff, sessionSeq, ...value } = policy;
    return copy(value);
}
export function automationPreviewView(preview) {
    const { scope, bindingKey, ...value } = preview;
    return copy(value);
}
/** One node/profile writer and one execution slot. No model call is retried.
 * A crash after dispatch intent is conservatively unknown until native log
 * evidence proves settlement; absence of a log entry is not proof of no call. */
export class WorkflowAutomation {
    options;
    state;
    lifetime = new AbortController();
    halted = new Set();
    offsets = new Map();
    drivePromise;
    activeRun;
    operations = new Set();
    unsubscribe = () => { };
    constructor(options, state) {
        this.options = options;
        this.state = state;
    }
    static async open(options) {
        if (!identifier(options.nodeId))
            throw fail('automation-node-invalid', '自动处理节点无效');
        const raw = await options.store.load(), ledger = raw === undefined ? { schema: 'human.automation.ledger.v1', nodeId: options.nodeId, policies: [], previews: [], runs: [] } : validateLedger(raw, options.nodeId);
        ledger.previews = [];
        for (const run of ledger.runs)
            if (['dispatching', 'running'].includes(run.state)) {
                run.state = 'unknown';
                run.reason = '执行中断，需按原生历史核对；不会重新调用模型';
                const p = ledger.policies.find(p => sameScope(p.scope, run.scope) && sameTaskRef(p.taskRef, run.taskRef));
                if (p?.state === 'active') {
                    p.state = 'paused';
                    p.reason = run.reason;
                    p.revision++;
                }
            }
        const runtime = new WorkflowAutomation(options, new StateQueue(options.store, ledger, WORKFLOW_LONG_TERM_BYTES));
        // Commit the recovery disposition before subscribing to native events.
        if (raw !== undefined)
            await options.store.save(ledger);
        runtime.unsubscribe = options.native.onStop(sessionId => {
            const work = runtime.stopSession(sessionId).catch(() => { });
            runtime.operations.add(work);
            void work.finally(() => runtime.operations.delete(work));
        });
        return runtime;
    }
    now() { return (this.options.now ?? Date.now)(); }
    id() { return (this.options.randomId ?? (() => randomBytes(16).toString('hex')))(); }
    active(signal) { this.lifetime.signal.throwIfAborted(); this.options.authority.assertIdentity(); return AbortSignal.any([signal, this.lifetime.signal]); }
    policy(scope, taskRef) { return this.state.current().policies.find(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef)); }
    capability() {
        try {
            this.lifetime.signal.throwIfAborted();
            this.state.current();
            return this.options.native.probe();
        }
        catch {
            return { supported: false, reason: '自动处理账本已关闭或不可用；手动群任务仍可使用' };
        }
    }
    policies(scope) { this.active(signalNone()); assertScope(scope, this.options.nodeId); return copy(this.state.current().policies.filter(p => sameScope(p.scope, scope))); }
    validateRecipients(config, snapshot) {
        if (config.trigger === 'all-recipients' && config.recipientRefs.some(ref => !snapshot.participants?.some(p => p.participantRef === ref)))
            throw fail('automation-recipients-invalid', '名单必须来自当前任务真实参与者；不能猜测成员或使用其他任务名单');
    }
    async propose(scope, taskRef, input, signal) {
        const active = this.active(signal);
        assertScope(scope, this.options.nodeId);
        if (!humanTaskRef(taskRef) || !revision(input.expectedRevision))
            throw fail('automation-input-invalid', '处理规则引用无效');
        const config = automationConfig(input.config), snapshot = await this.options.authority.inspect(scope, taskRef, active);
        this.validateRecipients(config, snapshot);
        if (!snapshot.rounds.some(r => r.id === config.roundId))
            throw fail('automation-unavailable', '当前任务没有指定轮次');
        const payload = { proposalId: this.id(), scope: copy(scope), taskRef: copy(taskRef), config, expectedRevision: input.expectedRevision, createdAt: this.now() };
        const proposal = { ...payload, digest: digest(payload) };
        return this.state.update(next => {
            this.active(active);
            if ((this.policy(scope, taskRef)?.revision ?? 0) !== input.expectedRevision)
                throw fail('automation-version-conflict', '当前规则已变化，请先读取');
            next.proposals = (next.proposals ?? []).filter(p => !sameScope(p.scope, scope) || !sameTaskRef(p.taskRef, taskRef)).slice(-127);
            next.proposals.push(proposal);
            const { scope: _scope, taskRef: _task, ...view } = proposal;
            return { schema: 'human.automation.proposal.v1', ...view, message: '仅为待审核规则；请主人在当前会话群任务管理中预览批准。尚未启用或暂停任何自动处理。' };
        }, active);
    }
    async proposals(scope, taskRef, signal) {
        const active = this.active(signal);
        await this.options.authority.inspect(scope, taskRef, active);
        this.active(active);
        return { schema: 'human.automation.proposals.v1', proposals: copy((this.state.current().proposals ?? [])
                .filter(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef)).map(({ scope, taskRef, ...view }) => view)) };
    }
    async preview(scope, taskRef, input, signal) {
        const active = this.active(signal);
        assertScope(scope, this.options.nodeId);
        if (!humanTaskRef(taskRef) || !revision(input.expectedRevision))
            throw fail('automation-input-invalid', '自动处理任务或版本无效');
        const config = automationConfig(input.config), capability = this.capability();
        if (!capability.supported)
            throw fail('automation-unsupported', capability.reason || '宿主不支持受控自动处理');
        const [snapshot, native] = await Promise.all([this.options.authority.inspect(scope, taskRef, active), this.options.native.inspect(scope, active)]);
        this.validateRecipients(config, snapshot);
        if (native.archived || !processorValid(native.processor) || !snapshot.rounds.some(r => r.id === config.roundId))
            throw fail('automation-unavailable', '指定轮次或原生会话不可用');
        const payload = { schema: 'human.automation.preview.v1', previewId: this.id(), expectedRevision: input.expectedRevision, expiresAt: this.now() + 300_000,
            scope: copy(scope), taskRef: copy(taskRef), config, processor: native.processor, capability, warnings: ['自动处理只生成本地分析和待审核反馈，不自动发布、订正或催交。',
                '次数和协作式超时不是 token 或费用上限；取消后已发生费用不撤销。',
                ...(config.trigger === 'all-recipients' ? ['指定名单到齐且收件完成后，一次冻结各人最新版本并逐份处理；不是跨成员一次模型汇总，后续重交不会再触发。'] : []),
                ...(config.trigger === 'manual' ? ['此规则批准后关闭自动处理，等待手动操作。'] : []),
                ...(config.allowSessionResume ? ['批准后可通过原生接口恢复冷会话；手工停止仍会暂停策略。'] : ['会话不在运行环境时等待主人打开；不会自动恢复。'])], asOf: snapshot.asOf, bindingKey: snapshot.bindingKey };
        const preview = { ...payload, digest: digest(payload) };
        return this.state.update(next => {
            if ((this.policy(scope, taskRef)?.revision ?? 0) !== input.expectedRevision)
                throw fail('automation-version-conflict', '策略已变化，请重新预览');
            next.previews = next.previews.filter(p => p.expiresAt > this.now() && !(sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef))).slice(-127);
            next.previews.push(preview);
            return preview;
        }, active);
    }
    async approve(scope, taskRef, input, signal) {
        const active = this.active(signal), preview = this.state.current().previews.find(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef) && p.previewId === input.previewId);
        if (!preview || preview.digest !== input.digest || preview.expectedRevision !== input.expectedRevision || preview.expiresAt <= this.now())
            throw fail('automation-preview-expired', '自动处理预览已失效，请重新核对');
        const [snapshot, native] = await Promise.all([this.options.authority.inspect(scope, taskRef, active), this.options.native.inspect(scope, active)]);
        this.validateRecipients(preview.config, snapshot);
        if (snapshot.bindingKey !== preview.bindingKey || native.processor.fingerprint !== preview.processor.fingerprint || native.archived
            || !snapshot.rounds.some(r => r.id === preview.config.roundId) || !revision(snapshot.asOf))
            throw fail('automation-preview-changed', '任务授权或原生配置已变化，请重新预览');
        const policy = await this.state.update(next => {
            const previous = next.policies.find(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef));
            if ((previous?.revision ?? 0) !== input.expectedRevision || !next.previews.some(p => p.previewId === input.previewId) || preview.expiresAt <= this.now())
                throw fail('automation-version-conflict', '策略已变化，请重新预览');
            if (!previous && next.policies.length >= 128)
                throw fail('automation-capacity', '自动处理策略数量已达上限');
            const value = { schema: 'human.automation.policy.v1', scope: copy(scope), taskRef: copy(taskRef), revision: input.expectedRevision + 1,
                policyVersion: (previous?.policyVersion ?? 0) + 1, state: preview.config.trigger === 'manual' ? 'paused' : 'active', config: copy(preview.config), processor: copy(preview.processor), approvedAt: this.now(), updatedAt: this.now(),
                usedRuns: 0, bindingKey: snapshot.bindingKey, acceptanceCutoff: snapshot.asOf, sessionSeq: native.sessionSeq };
            if (previous)
                next.policies[next.policies.indexOf(previous)] = value;
            else
                next.policies.push(value);
            next.previews = next.previews.filter(p => p.previewId !== input.previewId);
            next.proposals = next.proposals?.filter(p => !sameScope(p.scope, scope) || !sameTaskRef(p.taskRef, taskRef));
            for (const run of next.runs)
                if (sameScope(run.scope, scope) && sameTaskRef(run.taskRef, taskRef) && run.state === 'queued') {
                    run.state = 'cancelled';
                    run.reason = '策略版本已替换';
                    run.updatedAt = this.now();
                }
            return value;
        }, active);
        this.halted.delete(taskKey(scope, taskRef));
        if (policy.config.trigger === 'manual' && this.activeRun?.key === taskKey(scope, taskRef))
            this.activeRun.abort.abort(fail('automation-paused', '主人已批准手动规则'));
        return policy;
    }
    async eligible(policy, initial, signal) {
        const matches = (s) => s.state === 'accepted' && s.roundId === policy.config.roundId && s.acceptedAt !== null
            && (policy.config.existing === 'include-existing' || s.acceptedAt > policy.acceptanceCutoff);
        if (policy.config.trigger === 'manual')
            return [];
        if (policy.config.trigger === 'per-submission')
            return initial.submissions.filter(matches);
        const active = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
        this.validateRecipients(policy.config, initial);
        if (policy.batch) {
            const selected = [];
            for (const selection of policy.batch.selections) {
                const snapshot = await this.options.authority.inspect(policy.scope, policy.taskRef, active, { submissionId: selection.submissionId });
                if (snapshot.bindingKey !== policy.bindingKey)
                    throw fail('automation-authority-changed', '名单授权已变化');
                const s = snapshot.submissions.find(s => s.id === selection.submissionId && s.version === selection.submissionVersion && s.participantRef === selection.participantRef && matches(s));
                if (!s)
                    throw fail('automation-authority-changed', '已冻结的提交版本不再可用；不会用新提交替换');
                selected.push(s);
            }
            return selected;
        }
        // A complete, stable-revision snapshot is required. Partial pages, a
        // concurrent submission, or a time/size bound never mean "everyone in".
        let page = initial;
        const submissions = [...initial.submissions], offsets = new Set();
        while (page.nextOffset !== null) {
            if (!revision(page.nextOffset) || offsets.has(page.nextOffset) || submissions.length >= 1000)
                throw fail('automation-roster-incomplete', '无法在有界查询内核对全部名单，未触发处理');
            offsets.add(page.nextOffset);
            page = await this.options.authority.inspect(policy.scope, policy.taskRef, active, { offset: page.nextOffset });
            if (page.revision !== initial.revision || page.bindingKey !== initial.bindingKey)
                return [];
            submissions.push(...page.submissions);
        }
        const selected = [];
        for (const ref of policy.config.recipientRefs) {
            const latest = submissions.filter(s => s.participantRef === ref && matches(s)).sort((a, b) => b.version - a.version)[0];
            if (!latest || !await this.options.authority.ready(policy.scope, policy.taskRef, latest, active))
                return [];
            selected.push(latest);
        }
        await this.state.update(next => {
            const p = next.policies.find(p => sameScope(p.scope, policy.scope) && sameTaskRef(p.taskRef, policy.taskRef));
            if (p.state !== 'active' || p.policyVersion !== policy.policyVersion || p.bindingKey !== policy.bindingKey || p.batch)
                throw fail('automation-version-conflict', '规则在核对名单期间变化');
            p.batch = { formedAt: initial.asOf, selections: selected.map(s => ({ submissionId: s.id, submissionVersion: s.version, participantRef: s.participantRef })) };
        }, active);
        return selected;
    }
    async pause(scope, taskRef, expectedRevision, signal) {
        const active = this.active(signal), key = taskKey(scope, taskRef);
        const result = await this.state.update(next => {
            const p = next.policies.find(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef));
            if (!p || p.revision !== expectedRevision)
                throw fail('automation-version-conflict', '策略已变化，请刷新后再暂停');
            p.state = 'paused';
            p.reason = '主人已暂停';
            p.revision++;
            p.updatedAt = this.now();
            return p;
        }, active);
        this.halted.add(key);
        if (this.activeRun?.key === key)
            this.activeRun.abort.abort(fail('automation-paused', '主人已暂停自动处理'));
        return result;
    }
    async stopSession(sessionId) {
        if (this.lifetime.signal.aborted)
            return;
        for (const p of this.state.current().policies.filter(p => p.scope.sessionId === sessionId))
            this.halted.add(taskKey(p.scope, p.taskRef));
        if (this.activeRun && this.state.current().policies.some(p => p.scope.sessionId === sessionId && taskKey(p.scope, p.taskRef) === this.activeRun?.key))
            this.activeRun.abort.abort();
        await this.state.update(next => {
            for (const p of next.policies)
                if (p.scope.sessionId === sessionId && p.state === 'active') {
                    p.state = 'paused';
                    p.reason = '原生会话已手工停止或归档，请重新预览批准';
                    p.revision++;
                    p.updatedAt = this.now();
                }
        }, this.lifetime.signal);
    }
    async block(scope, taskRef, reason) {
        this.halted.add(taskKey(scope, taskRef));
        await this.state.update(next => { const p = next.policies.find(p => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef)); if (p && p.state === 'active') {
            p.state = 'blocked';
            p.reason = reason;
            p.revision++;
            p.updatedAt = this.now();
        } }, this.lifetime.signal);
    }
    /** Invoke only after the existing successful sync/receiver tick or explicit
     * owner approval. Coalesces callers; never adds a polling timer. */
    drive(signal = signalNone()) {
        if (this.drivePromise)
            return this.drivePromise;
        const active = this.active(signal);
        this.drivePromise = this.driveOnce(active).finally(() => { this.drivePromise = undefined; });
        return this.drivePromise;
    }
    async driveOnce(signal) {
        let dispatched = 0;
        for (const original of this.state.current().policies.slice()) {
            signal.throwIfAborted();
            if (dispatched >= 4)
                break;
            const { scope, taskRef } = original, key = taskKey(scope, taskRef), p = this.policy(scope, taskRef);
            if (p.state !== 'active' || this.halted.has(key))
                continue;
            try {
                const snapshot = await this.options.authority.inspect(scope, taskRef, signal, { offset: p.config.trigger === 'all-recipients' ? 0 : this.offsets.get(key) ?? 0 });
                if (snapshot.bindingKey !== p.bindingKey) {
                    await this.block(scope, taskRef, '任务账号绑定已变化，旧策略不再有效');
                    continue;
                }
                const native = await this.options.native.inspect(scope, signal);
                if (native.archived || native.stoppedAtSeq > p.sessionSeq || native.processor.fingerprint !== p.processor.fingerprint) {
                    await this.block(scope, taskRef, '原生会话、模型、预设或权限已变化，请重新批准');
                    continue;
                }
                this.offsets.set(key, snapshot.nextOffset ?? 0);
                const eligible = await this.eligible(p, snapshot, signal);
                for (const submission of eligible) {
                    const previous = this.state.current().runs.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.submissionId === submission.id && r.submissionVersion === submission.version);
                    if (previous && (previous.state !== 'cancelled' || previous.messageId !== undefined))
                        continue;
                    if (!await this.options.authority.ready(scope, taskRef, submission, signal))
                        continue;
                    await this.state.update(next => {
                        const currentPolicy = next.policies.find(v => sameScope(v.scope, scope) && sameTaskRef(v.taskRef, taskRef));
                        if (!currentPolicy || currentPolicy.state !== 'active' || currentPolicy.policyVersion !== p.policyVersion || currentPolicy.bindingKey !== p.bindingKey)
                            return;
                        if (previous) {
                            const r = next.runs.find(r => r.id === previous.id);
                            if (r.state === 'cancelled' && r.messageId === undefined) {
                                r.state = 'queued';
                                r.policyVersion = p.policyVersion;
                                delete r.reason;
                                r.updatedAt = this.now();
                            }
                            return;
                        }
                        if (next.runs.length >= 10000)
                            throw fail('automation-capacity', '自动处理执行与归档已达 10000 条上限；不会删除防重依据或重试未知执行');
                        next.runs.push({ id: this.id(), scope: copy(scope), taskRef: copy(taskRef), submissionId: submission.id, submissionVersion: submission.version,
                            roundId: submission.roundId, policyVersion: p.policyVersion, state: 'queued', createdAt: this.now(), updatedAt: this.now() });
                    }, signal);
                }
                if (native.busy || !native.live && !p.config.allowSessionResume)
                    continue;
                const queued = this.state.current().runs.filter(r => r.state === 'queued' && sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.policyVersion === p.policyVersion);
                for (const run of queued) {
                    if (dispatched >= 4 || this.halted.has(key) || this.policy(scope, taskRef)?.state !== 'active')
                        break;
                    await this.execute(copy(run), copy(this.policy(scope, taskRef)), signal);
                    dispatched++;
                }
                if (p.config.trigger === 'all-recipients')
                    await this.state.update(next => {
                        const current = next.policies.find(v => sameScope(v.scope, scope) && sameTaskRef(v.taskRef, taskRef));
                        if (current.policyVersion === p.policyVersion && current.state === 'active' && current.batch && current.batch.selections.every(s => next.runs.some(r => sameScope(r.scope, scope)
                            && sameTaskRef(r.taskRef, taskRef) && r.submissionId === s.submissionId && r.submissionVersion === s.submissionVersion
                            && r.messageId !== undefined && ['succeeded', 'failed', 'cancelled'].includes(r.state)))) {
                            current.state = 'exhausted';
                            current.reason = '本次名单到齐批次已处理；后续提交须重新预览批准';
                            current.revision++;
                            current.updatedAt = this.now();
                        }
                    }, signal);
            }
            catch (cause) {
                signal.throwIfAborted();
                this.options.authority.assertIdentity();
                const code = cause?.code ?? '';
                if (denied(cause) || /capacity|processor/.test(code))
                    await this.block(scope, taskRef, '任务授权、会话或预算已不可用，请核对后重新批准');
                // Offline/query errors leave undispatched work parked until a later
                // successful standard sync. There is no immediate retry loop.
            }
        }
    }
    async authorize(run, policy, signal) {
        this.active(signal);
        const p = this.policy(run.scope, run.taskRef);
        if (!p || p.state !== 'active' || p.policyVersion !== policy.policyVersion || this.halted.has(taskKey(run.scope, run.taskRef)))
            throw fail('automation-paused', '此自动处理授权已停止');
        const [snapshot, native] = await Promise.all([this.options.authority.inspect(run.scope, run.taskRef, signal, { submissionId: run.submissionId }), this.options.native.inspect(run.scope, signal)]);
        const submission = snapshot.submissions.find(s => s.id === run.submissionId && s.version === run.submissionVersion && s.roundId === run.roundId && s.state === 'accepted');
        if (policy.config.trigger === 'manual' || policy.config.trigger === 'all-recipients' && !policy.batch?.selections.some(s => s.submissionId === run.submissionId
            && s.submissionVersion === run.submissionVersion && s.participantRef === submission?.participantRef))
            throw fail('automation-authority-changed', '提交不属于本次已批准并冻结的批次');
        if (snapshot.bindingKey !== policy.bindingKey || !submission || native.archived || native.stoppedAtSeq > policy.sessionSeq || native.processor.fingerprint !== policy.processor.fingerprint)
            throw fail('automation-authority-changed', '当前任务、提交版本或原生配置与批准内容不符');
        if (!await this.options.authority.ready(run.scope, run.taskRef, submission, signal))
            throw fail('automation-receipt-missing', '提交尚无完整持久收件');
        this.active(signal);
        const after = this.policy(run.scope, run.taskRef);
        if (this.halted.has(taskKey(run.scope, run.taskRef)) || !after || after.state !== 'active' || after.policyVersion !== policy.policyVersion
            || after.bindingKey !== policy.bindingKey || digest(after.config) !== digest(policy.config) || after.processor.fingerprint !== policy.processor.fingerprint)
            throw fail('automation-paused', '策略已暂停或在核对期间变化');
    }
    async execute(run, policy, parent) {
        await this.authorize(run, policy, parent);
        const controller = new AbortController(), timeout = AbortSignal.timeout(policy.config.timeoutSeconds * 1000);
        const signal = AbortSignal.any([parent, controller.signal, timeout]);
        this.activeRun = { key: taskKey(run.scope, run.taskRef), abort: controller };
        try {
            const message = this.options.native.createMessage(run, policy);
            const admitted = await this.state.update(next => {
                const p = next.policies.find(p => sameScope(p.scope, run.scope) && sameTaskRef(p.taskRef, run.taskRef)), r = next.runs.find(r => r.id === run.id);
                if (p.state !== 'active' || p.policyVersion !== policy.policyVersion || r.policyVersion !== policy.policyVersion || r.state !== 'queued'
                    || p.bindingKey !== policy.bindingKey || p.processor.fingerprint !== policy.processor.fingerprint || digest(p.config) !== digest(policy.config)
                    || this.halted.has(taskKey(run.scope, run.taskRef)))
                    return false;
                if (p.usedRuns >= p.config.maxRuns) {
                    p.state = 'exhausted';
                    p.reason = '批准的处理次数已用完';
                    p.revision++;
                    return false;
                }
                p.usedRuns++;
                p.updatedAt = this.now();
                r.state = 'dispatching';
                r.messageId = message.id;
                r.updatedAt = this.now();
                return true;
            }, signal);
            if (!admitted)
                return;
            run.messageId = message.id;
            run.state = 'dispatching';
            const authorize = (s) => this.authorize(run, policy, s);
            const tools = this.options.tools(run, policy, authorize, async (value) => {
                await this.state.update(next => { const r = next.runs.find(r => r.id === run.id); r.analysisRevision = value.analysisRevision; r.draftRef = copy(value.draftRef); r.updatedAt = this.now(); }, signal);
            });
            let result;
            try {
                result = await this.options.native.run({ run, policy, message: message.message, authorize, tools, claimed: async (turn) => {
                        await this.state.update(next => { const r = next.runs.find(r => r.id === run.id); r.state = 'running'; r.turn = turn; r.updatedAt = this.now(); }, signal);
                    } }, signal);
            }
            catch {
                result = { state: 'unknown', reason: '原生执行没有可靠回执；不会重新调用模型' };
            }
            // Persist even when timeout/owner cancellation fired. Close drains this
            // write before releasing the profile ledger to a replacement instance.
            await this.state.update(next => {
                const r = next.runs.find(r => r.id === run.id);
                Object.assign(r, result, { updatedAt: this.now() });
                if (r.state === 'succeeded' && (!r.analysisRevision || !r.draftRef)) {
                    r.state = 'failed';
                    r.reason = '原生回合结束，但未完整保存分析和待审核反馈';
                }
                const p = next.policies.find(p => sameScope(p.scope, run.scope) && sameTaskRef(p.taskRef, run.taskRef));
                if (p.policyVersion === run.policyVersion && ['unknown', 'cancelled'].includes(r.state) && p.state === 'active') {
                    p.state = 'paused';
                    p.reason = r.reason || '执行已停止，请核对';
                    p.revision++;
                }
                if (p.policyVersion === run.policyVersion && p.usedRuns >= p.config.maxRuns && p.state === 'active') {
                    p.state = 'exhausted';
                    p.reason = '批准的处理次数已用完';
                    p.revision++;
                }
            }, signalNone());
        }
        finally {
            this.activeRun = undefined;
        }
    }
    async status(scope, taskRef, signal, cursor = '0') {
        const active = this.active(signal);
        assertScope(scope, this.options.nodeId);
        if (!/^(0|[1-9][0-9]{0,4})$/.test(cursor) || Number(cursor) > 10000)
            throw fail('automation-cursor-invalid', '执行历史游标无效');
        let freshness = 'online', asOf = this.now();
        try {
            const snapshot = await this.options.authority.inspect(scope, taskRef, active);
            asOf = snapshot.asOf;
            const policy = this.policy(scope, taskRef);
            if (policy && policy.bindingKey !== snapshot.bindingKey) {
                await this.block(scope, taskRef, '账号绑定已变化');
                throw fail('automation-binding-changed', '旧策略不属于当前账号绑定');
            }
        }
        catch (cause) {
            active.throwIfAborted();
            this.options.authority.assertIdentity();
            if (denied(cause)) {
                await this.block(scope, taskRef, '任务授权已不可用');
                throw cause;
            }
            freshness = 'cached';
        }
        for (const run of this.state.current().runs.filter(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.state === 'unknown').slice(-20)) {
            const result = await this.options.native.reconcile(copy(run), active);
            if (result.state !== 'unknown')
                await this.state.update(next => { const r = next.runs.find(r => r.id === run.id); Object.assign(r, result, { updatedAt: this.now() }); if (r.state === 'succeeded' && (!r.analysisRevision || !r.draftRef))
                    r.state = 'failed'; }, active);
        }
        const all = this.state.current().runs.filter(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef)).reverse(), offset = Number(cursor);
        return { schema: 'human.automation.status.v1', capability: this.capability(), asOf, freshness, policy: automationPolicyView(this.policy(scope, taskRef) ?? null),
            runs: copy(all.slice(offset, offset + 20).map(({ scope, taskRef, messageId, ...view }) => view)), nextCursor: offset + 20 < all.length ? String(offset + 20) : null };
    }
    async close() {
        this.lifetime.abort();
        this.activeRun?.abort.abort();
        this.unsubscribe();
        await this.drivePromise?.catch(() => { });
        await Promise.allSettled([...this.operations]);
        await this.options.native.close();
        await this.state.close();
    }
}
