import { randomBytes } from 'node:crypto';
import { humanTaskRef, humanWorkflowDraftRef, sameTaskRef } from '../human-tools/protocol.js';
import { assertScope, bounded, copy, exact, fail, identifier, plain, revision, row, sameScope, scopeValid, StateQueue, version } from './data.js';
import { canonicalSubmission, sha256 } from './submission-crypto.js';
const digest = (value) => sha256(canonicalSubmission(value));
const taskKey = (scope, taskRef) => digest([scope, taskRef]);
const signalNone = () => new AbortController().signal;
const runStates = ['queued', 'dispatching', 'running', 'succeeded', 'failed', 'cancelled', 'unknown'];
function denied(cause) { return /revoked|forbidden|not_found|not-found|generation|scope|identity|account|unauthori|binding|permission/.test(String(cause?.code ?? '')); }
export function automationConfig(value) {
    if (!row(value) || !exact(value, ['trigger', 'roundId', 'instructions', 'existing', 'allowSessionResume', 'maxRuns', 'timeoutSeconds', 'concurrency'])
        || value.trigger !== 'per-submission' || !identifier(value.roundId) || !plain(value.instructions, 4000)
        || !['new-only', 'include-existing'].includes(String(value.existing)) || typeof value.allowSessionResume !== 'boolean'
        || !version(value.maxRuns) || value.maxRuns > 100 || !version(value.timeoutSeconds) || value.timeoutSeconds < 30 || value.timeoutSeconds > 600
        || value.concurrency !== 1)
        throw fail('automation-config-invalid', '自动处理配置无效；仅支持指定轮次、逐份处理、并发 1');
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
    if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'policies', 'previews', 'runs']) || raw.schema !== 'human.automation.ledger.v1' || raw.nodeId !== nodeId
        || !Array.isArray(raw.policies) || raw.policies.length > 128 || !Array.isArray(raw.previews) || raw.previews.length > 128 || !Array.isArray(raw.runs) || raw.runs.length > 1000)
        throw bad();
    const policies = new Set(), ids = new Set(), runIds = new Set();
    for (const p of raw.policies) {
        if (!row(p) || !exact(p, policyKeys, ['reason']) || p.schema !== 'human.automation.policy.v1' || !scopeTask(p, nodeId)
            || !version(p.revision) || !version(p.policyVersion) || !['active', 'paused', 'exhausted', 'blocked'].includes(String(p.state)) || !processorValid(p.processor)
            || ![p.approvedAt, p.updatedAt, p.usedRuns, p.acceptanceCutoff, p.sessionSeq].every(revision) || !/^[a-f0-9]{64}$/.test(String(p.bindingKey))
            || p.reason !== undefined && !plain(p.reason, 256))
            throw bad();
        automationConfig(p.config);
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
    bounded(raw);
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
        const runtime = new WorkflowAutomation(options, new StateQueue(options.store, ledger));
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
    async preview(scope, taskRef, input, signal) {
        const active = this.active(signal);
        assertScope(scope, this.options.nodeId);
        if (!humanTaskRef(taskRef) || !revision(input.expectedRevision))
            throw fail('automation-input-invalid', '自动处理任务或版本无效');
        const config = automationConfig(input.config), capability = this.capability();
        if (!capability.supported)
            throw fail('automation-unsupported', capability.reason || '宿主不支持受控自动处理');
        const [snapshot, native] = await Promise.all([this.options.authority.inspect(scope, taskRef, active), this.options.native.inspect(scope, active)]);
        if (native.archived || !processorValid(native.processor) || !snapshot.rounds.some(r => r.id === config.roundId))
            throw fail('automation-unavailable', '指定轮次或原生会话不可用');
        const payload = { schema: 'human.automation.preview.v1', previewId: this.id(), expectedRevision: input.expectedRevision, expiresAt: this.now() + 300_000,
            scope: copy(scope), taskRef: copy(taskRef), config, processor: native.processor, capability, warnings: ['自动处理只生成本地分析和待审核反馈，不自动发布、订正或催交。',
                '次数和协作式超时不是 token 或费用上限；取消后已发生费用不撤销。', ...(config.allowSessionResume ? ['批准后可通过原生接口恢复冷会话；手工停止仍会暂停策略。'] : ['会话不在运行环境时等待主人打开；不会自动恢复。'])], asOf: snapshot.asOf, bindingKey: snapshot.bindingKey };
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
                policyVersion: (previous?.policyVersion ?? 0) + 1, state: 'active', config: copy(preview.config), processor: copy(preview.processor), approvedAt: this.now(), updatedAt: this.now(),
                usedRuns: 0, bindingKey: snapshot.bindingKey, acceptanceCutoff: snapshot.asOf, sessionSeq: native.sessionSeq };
            if (previous)
                next.policies[next.policies.indexOf(previous)] = value;
            else
                next.policies.push(value);
            next.previews = next.previews.filter(p => p.previewId !== input.previewId);
            for (const run of next.runs)
                if (sameScope(run.scope, scope) && sameTaskRef(run.taskRef, taskRef) && run.state === 'queued') {
                    run.state = 'cancelled';
                    run.reason = '策略版本已替换';
                    run.updatedAt = this.now();
                }
            return value;
        }, active);
        this.halted.delete(taskKey(scope, taskRef));
        return policy;
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
                const snapshot = await this.options.authority.inspect(scope, taskRef, signal, { offset: this.offsets.get(key) ?? 0 });
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
                const eligible = snapshot.submissions.filter(s => s.state === 'accepted' && s.roundId === p.config.roundId && s.acceptedAt !== null
                    && (p.config.existing === 'include-existing' || s.acceptedAt > p.acceptanceCutoff));
                for (const submission of eligible) {
                    const previous = this.state.current().runs.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.submissionId === submission.id && r.submissionVersion === submission.version);
                    if (previous && (previous.state !== 'cancelled' || previous.messageId !== undefined))
                        continue;
                    if (!await this.options.authority.ready(scope, taskRef, submission, signal))
                        continue;
                    await this.state.update(next => {
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
                        if (next.runs.length >= 1000)
                            throw fail('automation-capacity', '自动处理执行账本已达上限');
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
