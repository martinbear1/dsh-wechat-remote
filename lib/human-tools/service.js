var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { defaultGateStatePath } from '../agent-metadata.js';
import { HumanToolsCore } from './core.js';
import { HumanFileStore } from './store.js';
import { registerHumanContext, dshHumanToolsAvailable, humanShareTool, humanMembersTool, humanRemindTool } from './dsh.js';
import { object } from './protocol.js';
import { createCapabilityManifest } from '../human-workflow/capabilities.js';
import { WorkflowFileStore } from '../human-workflow/persistence.js';
import { ModeRegistry } from '../human-workflow/mode-package.js';
import { WorkflowRecords } from '../human-workflow/workflow-records.js';
import { humanWorkflowTools, registerHumanWorkflowContext } from '../human-workflow/dsh-tools.js';
import { WorkflowReplica, REPLICA_MAX_BYTES } from '../human-workflow/replica.js';
import { workflowQueryTools } from '../human-workflow/query-tools.js';
import { fail, row } from '../human-workflow/data.js';
import { registerHumanWorkflowSkill } from '../human-workflow/dsh-skill.js';
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
let HumanToolsService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _capabilities_decorators;
    let _sourceGrant_decorators;
    let _modeList_decorators;
    let _modePreview_decorators;
    let _modeApprove_decorators;
    let _modeRollback_decorators;
    let _claim_decorators;
    let _ack_decorators;
    let _status_decorators;
    return class HumanToolsService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _capabilities_decorators = [Remote('capabilities')];
            _sourceGrant_decorators = [Remote('sourceGrant')];
            _modeList_decorators = [Remote('modeList')];
            _modePreview_decorators = [Remote('modePreview')];
            _modeApprove_decorators = [Remote('modeApprove')];
            _modeRollback_decorators = [Remote('modeRollback')];
            _claim_decorators = [Remote('claim')];
            _ack_decorators = [Remote('ack')];
            _status_decorators = [Remote('status')];
            __esDecorate(this, null, _capabilities_decorators, { kind: "method", name: "capabilities", static: false, private: false, access: { has: obj => "capabilities" in obj, get: obj => obj.capabilities }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sourceGrant_decorators, { kind: "method", name: "sourceGrant", static: false, private: false, access: { has: obj => "sourceGrant" in obj, get: obj => obj.sourceGrant }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _modeList_decorators, { kind: "method", name: "modeList", static: false, private: false, access: { has: obj => "modeList" in obj, get: obj => obj.modeList }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _modePreview_decorators, { kind: "method", name: "modePreview", static: false, private: false, access: { has: obj => "modePreview" in obj, get: obj => obj.modePreview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _modeApprove_decorators, { kind: "method", name: "modeApprove", static: false, private: false, access: { has: obj => "modeApprove" in obj, get: obj => obj.modeApprove }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _modeRollback_decorators, { kind: "method", name: "modeRollback", static: false, private: false, access: { has: obj => "modeRollback" in obj, get: obj => obj.modeRollback }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _claim_decorators, { kind: "method", name: "claim", static: false, private: false, access: { has: obj => "claim" in obj, get: obj => obj.claim }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ack_decorators, { kind: "method", name: "ack", static: false, private: false, access: { has: obj => "ack" in obj, get: obj => obj.ack }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        static inject = ['tools', 'agents', 'sessions', 'systemPrompt'];
        core;
        ready;
        lifetime = new AbortController();
        unregister;
        workflow;
        constructor(host, config = {}) {
            super(host, 'humanTools');
            this.host = host;
            host.effect(() => async () => {
                this.lifetime.abort(disabled());
                const drained = this.core?.close();
                try {
                    this.unregister?.();
                }
                finally {
                    await Promise.all([drained, this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close()]);
                }
            });
            if (!config.enabled)
                return;
            this.ready = this.initialize(config);
            // Failure disables this optional experiment, never the mature gate/host.
            void this.ready.catch(cause => console.warn('[human-tools] unavailable:', cause instanceof Error ? cause.message : String(cause)));
        }
        async initialize(config) {
            if (!dshHumanToolsAvailable(this.host))
                throw new Error('此DSH不支持原生工具/会话上下文');
            // Resolve the actual host profile, including linked/native installations.
            // Web and Desktop must never share one action ledger on the same computer.
            const store = config.store || new HumanFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), 'human-tools-v1.json'));
            const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'));
            if (this.lifetime.signal.aborted) {
                core.close();
                return;
            }
            this.core = core;
            const unregisterTools = [];
            try {
                if (config.workflow) {
                    const { transport } = config.workflow;
                    transport.assertIdentity();
                    if (!/^[A-Za-z0-9_-]{16,128}$/.test(transport.nodeId))
                        throw fail('workflow-node-invalid', '节点身份无效');
                    const file = (kind) => new WorkflowFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-${kind}.json`), kind === 'facts' ? REPLICA_MAX_BYTES : undefined);
                    const replica = await WorkflowReplica.open(config.workflow.replicaStore || file('facts'), transport);
                    let modes, records;
                    try {
                        const capabilities = () => { transport.assertIdentity(); return createCapabilityManifest(transport.nodeId, { 'task.query': { status: 'available' } }); };
                        modes = await ModeRegistry.open(config.workflow.modeStore || file('modes'), { nodeId: transport.nodeId, capabilities, randomId: () => randomBytes(16).toString('hex') });
                        records = await WorkflowRecords.open(config.workflow.recordStore || file('records'), { nodeId: transport.nodeId, modes, randomId: () => randomBytes(16).toString('hex'), validateReferences: (scope, refs) => replica.validateReferences(scope, refs) });
                        this.lifetime.signal.throwIfAborted();
                        transport.assertIdentity();
                        this.workflow = { transport, modes, records, replica };
                        const options = { nodeId: transport.nodeId, modes, records, capabilities,
                            prepareCard: (input, signal) => {
                                transport.assertIdentity();
                                return core.create({ scope: input.scope.sessionId, generation: input.scope.sessionGeneration, callId: input.callId,
                                    rootCallId: input.rootCallId }, input.title, input.body, signal, input.sourceSurfaceId);
                            } };
                        for (const tool of [...humanWorkflowTools(options), ...workflowQueryTools(transport.nodeId, replica)]) {
                            const execute = tool.execute;
                            unregisterTools.push(this.host.get('tools').register({ ...tool, async execute(args, exec) {
                                    transport.assertIdentity();
                                    const result = await execute(args, exec);
                                    transport.assertIdentity();
                                    return result;
                                } }));
                        }
                        unregisterTools.push(registerHumanWorkflowContext(this.host, options));
                        const unregisterSkill = registerHumanWorkflowSkill(this.host);
                        if (unregisterSkill)
                            unregisterTools.push(unregisterSkill);
                        replica.start();
                    }
                    catch (cause) {
                        await Promise.all([replica.close(), modes?.close(), records?.close()]);
                        this.workflow = undefined;
                        throw cause;
                    }
                }
                for (const tool of [humanShareTool(core), humanMembersTool(core), humanRemindTool(core)])
                    unregisterTools.push(this.host.get('tools').register(tool));
                const unregisterContext = registerHumanContext(this.host, core);
                this.unregister = () => { unregisterContext(); unregisterTools.reverse().forEach(remove => remove()); };
            }
            catch (cause) {
                unregisterTools.reverse().forEach(remove => remove());
                await Promise.all([core.close(), this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close()]);
                this.core = undefined;
                this.workflow = undefined;
                throw cause;
            }
        }
        async use(signal) {
            signal.throwIfAborted();
            if (!this.ready || this.lifetime.signal.aborted)
                throw disabled();
            await waitForReady(this.ready, AbortSignal.any([signal, this.lifetime.signal]));
            signal.throwIfAborted();
            if (this.lifetime.signal.aborted || !this.core)
                throw disabled();
            this.workflow?.transport.assertIdentity();
            return this.core;
        }
        async result(operation) {
            try {
                const value = await operation();
                this.lifetime.signal.throwIfAborted();
                this.workflow?.transport.assertIdentity();
                return { ok: true, valueJson: JSON.stringify(value) };
            }
            catch (cause) {
                return { ok: false, error: { code: typeof cause?.code === 'string'
                            ? cause.code : 'human-tools-unavailable', message: cause instanceof Error ? cause.message : '测试卡片不可用' } };
            }
        }
        /** Synchronous bounded lookup used identically by history and live projection. */
        present(scope, callId) {
            const session = this.host.get('sessions')?.get(scope);
            return this.core?.forResult(scope, callId, session ? String(session.header.createdAt) : undefined);
        }
        /** Host-only cold-history barrier. Shares the one ledger load; cancelling a
         * reader never cancels initialization or another reader. Optional failure
         * must not hide the ordinary history, and adds no retry or polling. */
        async prepareProjection(signal) {
            try {
                await this.use(signal);
                return true;
            }
            catch {
                signal.throwIfAborted();
                return false;
            }
        }
        async capabilities(request, signal) {
            return this.result(async () => {
                await this.use(signal);
                return { schema: 'human.tools.v1', enabled: true, shareTest: true, members: true, remind: true,
                    ...(this.workflow ? { workflow: this.workflow.modes.manifest() } : {}) };
            });
        }
        async sourceGrant(request, signal) {
            return this.result(async () => {
                const active = AbortSignal.any([signal, this.lifetime.signal]), core = await this.use(active);
                if (!this.workflow)
                    throw fail('workflow-unavailable', '此节点尚未连接群任务服务');
                const source = core.grantSource(request), generation = await this.claimGeneration(request.scope, active);
                core.assertGeneration(request.scope, request.surfaceId, generation);
                const grant = await this.workflow.transport.request('grant', { scope: source.origin.scope, sessionGeneration: generation,
                    surfaceId: request.surfaceId, attemptId: request.attemptId, surface: source.surface }, active);
                active.throwIfAborted();
                this.workflow.transport.assertIdentity();
                if (!row(grant) || grant.schema !== 'human.source.grant.v1' || typeof grant.sourceGrant !== 'string' || grant.sourceGrant.length > 4096
                    || !Number.isSafeInteger(grant.expiresAt) || Number(grant.expiresAt) <= Date.now())
                    throw fail('workflow-response-invalid', '任务来源凭证无效');
                this.workflow.replica.discover();
                return grant;
            });
        }
        async workflowScope(scope, signal) {
            await this.use(signal);
            if (!this.workflow)
                throw fail('workflow-unavailable', '此节点尚未启用群任务模式');
            if (typeof scope !== 'string' || !scope.trim() || scope.length > 256)
                throw originUnavailable();
            const sessionGeneration = await this.claimGeneration(scope, signal);
            this.workflow.transport.assertIdentity();
            signal.throwIfAborted();
            this.lifetime.signal.throwIfAborted();
            return { nodeId: this.workflow.transport.nodeId, sessionId: scope, sessionGeneration };
        }
        async modeList(request, signal) {
            return this.result(async () => { const scope = await this.workflowScope(request.scope, signal); return this.workflow.modes.list(scope); });
        }
        async modePreview(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal);
                return this.workflow.modes.preview(scope, { id: request.id, version: request.version }, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async modeApprove(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal), { scope: _scope, ...approval } = request;
                return this.workflow.modes.approve(scope, approval, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async modeRollback(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal), { scope: _scope, ...approval } = request;
                return this.workflow.modes.rollback(scope, approval, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async claim(request, signal) {
            return this.result(async () => {
                const claimSignal = AbortSignal.any([signal, this.lifetime.signal]);
                const core = await this.use(claimSignal);
                // Check our own bounded scope first, before querying any host directory.
                core.status(request.scope, request.surfaceId);
                const generation = await this.claimGeneration(request.scope, claimSignal);
                claimSignal.throwIfAborted();
                core.assertGeneration(request.scope, request.surfaceId, generation);
                return core.claim(request, claimSignal);
            });
        }
        /** A missing live Session is not evidence that its durable generation still
         * exists. Query headers only; never acquire a Session/Agent writer to claim. */
        async claimGeneration(scope, signal) {
            try {
                signal.throwIfAborted();
                const sessions = this.host.get('sessions');
                const session = sessions?.get(scope);
                if (session)
                    return headerGeneration(session.header, scope);
                // These optional public APIs return SessionRecord[] with a cloned header.
                // Older hosts keep working for live sessions without a new SDK import.
                const query = this.host.get('sessionQuery');
                let pending;
                if (typeof query?.filterSessions === 'function')
                    pending = query.filterSessions([{ kind: 'id', values: [scope] }], signal);
                else if (typeof query?.listSessions === 'function')
                    pending = query.listSessions(signal);
                else
                    throw originUnavailable();
                const rows = await waitForReady(Promise.resolve(pending), signal);
                signal.throwIfAborted();
                if (!Array.isArray(rows) || rows.some(row => !object(row) || !object(row.header) || typeof row.header.id !== 'string'))
                    throw originUnavailable();
                const matches = rows.filter(row => row.header.id === scope);
                if (matches.length !== 1)
                    throw originUnavailable();
                const generation = headerGeneration(matches[0].header, scope);
                // A native activation during the read must agree with the observed header.
                const current = sessions?.get(scope);
                if (current && headerGeneration(current.header, scope) !== generation)
                    throw originUnavailable();
                return generation;
            }
            catch {
                signal.throwIfAborted();
                throw originUnavailable();
            }
        }
        async ack(request, signal) {
            return this.result(async () => (await this.use(signal)).ack(request, signal));
        }
        async status(request, signal) {
            return this.result(async () => (await this.use(signal)).status(request.scope, request.surfaceId));
        }
    };
})();
export { HumanToolsService };
function disabled() {
    return Object.assign(new Error('此节点尚未启用测试卡片功能'), { code: 'human-tools-disabled' });
}
function originUnavailable() {
    return Object.assign(new Error('无法确认原会话身份，请在电脑端确认会话仍然存在后重试'), { code: 'human-origin-unavailable' });
}
function headerGeneration(header, scope) {
    if (!object(header) || header.id !== scope || !Number.isSafeInteger(header.createdAt) || Number(header.createdAt) < 0)
        throw originUnavailable();
    return String(header.createdAt);
}
function waitForReady(ready, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const cleanup = () => signal.removeEventListener('abort', abort);
        const abort = () => { cleanup(); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        ready.then(value => { cleanup(); resolve(value); }, cause => { cleanup(); reject(cause); });
        if (signal.aborted)
            abort();
    });
}
