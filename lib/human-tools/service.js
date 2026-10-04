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
import { object, humanTaskRef } from './protocol.js';
import { createCapabilityManifest } from '../human-workflow/capabilities.js';
import { WorkflowFileStore } from '../human-workflow/persistence.js';
import { WorkflowArchiveStore, WORKFLOW_LONG_TERM_BYTES } from '../human-workflow/archive-store.js';
import { ModeRegistry } from '../human-workflow/mode-package.js';
import { WorkflowRecords } from '../human-workflow/workflow-records.js';
import { humanWorkflowTools, registerHumanWorkflowContext } from '../human-workflow/dsh-tools.js';
import { WorkflowReplica, REPLICA_MAX_BYTES, WORKFLOW_DRAFT_TTL_MS, WORKFLOW_SOURCE_GRANT_TTL_MS } from '../human-workflow/replica.js';
import { workflowQueryTools } from '../human-workflow/query-tools.js';
import { fail, row } from '../human-workflow/data.js';
import { registerHumanWorkflowSkill } from '../human-workflow/dsh-skill.js';
import { AssistantRegistry } from '../assistant-presets/registry.js';
import { createNativeAssistantAdapter } from '../assistant-presets/native-adapter.js';
import { AssistantSessionIntents } from '../assistant-presets/session-intents.js';
import { AssistantBusinessRecords } from '../assistant-presets/business.js';
import { assistantTools, registerAssistantContext, nativeComposedPreset } from '../assistant-presets/tools.js';
import { ReceiverKeyring, ReceiverKeyFileStore } from '../human-workflow/receiver-keyring.js';
import { SubmissionReceiver } from '../human-workflow/receiver.js';
import { downloadSubmission } from '../human-workflow/receiver-download.js';
import { WorkflowLifecycle } from '../human-workflow/lifecycle.js';
import { lifecycleTools } from '../human-workflow/lifecycle-tools.js';
import { WorkflowAutomation, automationPolicyView, automationPreviewView } from '../human-workflow/automation-engine.js';
import { createNativeAutomationAdapter, installNativeAutomationGate } from '../human-workflow/automation-native.js';
import { automationTools } from '../human-workflow/automation-tools.js';
import { automationProposalTools } from '../human-workflow/automation-proposal-tools.js';
import { CardCoverAssets, CARD_COVER_LEDGER_MAX_BYTES } from './card-cover-assets.js';
import { humanCardAsset } from './card-cover.js';
import { cardCoverTool } from './card-cover-tools.js';
import { uploadCardCover } from './card-cover-upload.js';
import { normalizeCardCoverImage } from './card-cover-renderer.js';
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
let HumanToolsService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _automationList_decorators;
    let _workflowReceiptStatus_decorators;
    let _automationProposals_decorators;
    let _workflowReceiptRetry_decorators;
    let _automationPreview_decorators;
    let _automationApprove_decorators;
    let _automationPause_decorators;
    let _automationStatus_decorators;
    let _workflowDraft_decorators;
    let _coverPreview_decorators;
    let _assistantCatalog_decorators;
    let _assistantDraft_decorators;
    let _assistantPreview_decorators;
    let _assistantInstall_decorators;
    let _assistantStatus_decorators;
    let _assistantSessionPrepare_decorators;
    let _assistantSessionStatus_decorators;
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
            _automationList_decorators = [Remote('automationList')];
            _workflowReceiptStatus_decorators = [Remote('workflowReceiptStatus')];
            _automationProposals_decorators = [Remote('automationProposals')];
            _workflowReceiptRetry_decorators = [Remote('workflowReceiptRetry')];
            _automationPreview_decorators = [Remote('automationPreview')];
            _automationApprove_decorators = [Remote('automationApprove')];
            _automationPause_decorators = [Remote('automationPause')];
            _automationStatus_decorators = [Remote('automationStatus')];
            _workflowDraft_decorators = [Remote('workflowDraft')];
            _coverPreview_decorators = [Remote('coverPreview')];
            _assistantCatalog_decorators = [Remote('assistantCatalog')];
            _assistantDraft_decorators = [Remote('assistantDraft')];
            _assistantPreview_decorators = [Remote('assistantPreview')];
            _assistantInstall_decorators = [Remote('assistantInstall')];
            _assistantStatus_decorators = [Remote('assistantStatus')];
            _assistantSessionPrepare_decorators = [Remote('assistantSessionPrepare')];
            _assistantSessionStatus_decorators = [Remote('assistantSessionStatus')];
            _capabilities_decorators = [Remote('capabilities')];
            _sourceGrant_decorators = [Remote('sourceGrant')];
            _modeList_decorators = [Remote('modeList')];
            _modePreview_decorators = [Remote('modePreview')];
            _modeApprove_decorators = [Remote('modeApprove')];
            _modeRollback_decorators = [Remote('modeRollback')];
            _claim_decorators = [Remote('claim')];
            _ack_decorators = [Remote('ack')];
            _status_decorators = [Remote('status')];
            __esDecorate(this, null, _automationList_decorators, { kind: "method", name: "automationList", static: false, private: false, access: { has: obj => "automationList" in obj, get: obj => obj.automationList }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _workflowReceiptStatus_decorators, { kind: "method", name: "workflowReceiptStatus", static: false, private: false, access: { has: obj => "workflowReceiptStatus" in obj, get: obj => obj.workflowReceiptStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _automationProposals_decorators, { kind: "method", name: "automationProposals", static: false, private: false, access: { has: obj => "automationProposals" in obj, get: obj => obj.automationProposals }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _workflowReceiptRetry_decorators, { kind: "method", name: "workflowReceiptRetry", static: false, private: false, access: { has: obj => "workflowReceiptRetry" in obj, get: obj => obj.workflowReceiptRetry }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _automationPreview_decorators, { kind: "method", name: "automationPreview", static: false, private: false, access: { has: obj => "automationPreview" in obj, get: obj => obj.automationPreview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _automationApprove_decorators, { kind: "method", name: "automationApprove", static: false, private: false, access: { has: obj => "automationApprove" in obj, get: obj => obj.automationApprove }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _automationPause_decorators, { kind: "method", name: "automationPause", static: false, private: false, access: { has: obj => "automationPause" in obj, get: obj => obj.automationPause }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _automationStatus_decorators, { kind: "method", name: "automationStatus", static: false, private: false, access: { has: obj => "automationStatus" in obj, get: obj => obj.automationStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _workflowDraft_decorators, { kind: "method", name: "workflowDraft", static: false, private: false, access: { has: obj => "workflowDraft" in obj, get: obj => obj.workflowDraft }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _coverPreview_decorators, { kind: "method", name: "coverPreview", static: false, private: false, access: { has: obj => "coverPreview" in obj, get: obj => obj.coverPreview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantCatalog_decorators, { kind: "method", name: "assistantCatalog", static: false, private: false, access: { has: obj => "assistantCatalog" in obj, get: obj => obj.assistantCatalog }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantDraft_decorators, { kind: "method", name: "assistantDraft", static: false, private: false, access: { has: obj => "assistantDraft" in obj, get: obj => obj.assistantDraft }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantPreview_decorators, { kind: "method", name: "assistantPreview", static: false, private: false, access: { has: obj => "assistantPreview" in obj, get: obj => obj.assistantPreview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantInstall_decorators, { kind: "method", name: "assistantInstall", static: false, private: false, access: { has: obj => "assistantInstall" in obj, get: obj => obj.assistantInstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantStatus_decorators, { kind: "method", name: "assistantStatus", static: false, private: false, access: { has: obj => "assistantStatus" in obj, get: obj => obj.assistantStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantSessionPrepare_decorators, { kind: "method", name: "assistantSessionPrepare", static: false, private: false, access: { has: obj => "assistantSessionPrepare" in obj, get: obj => obj.assistantSessionPrepare }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _assistantSessionStatus_decorators, { kind: "method", name: "assistantSessionStatus", static: false, private: false, access: { has: obj => "assistantSessionStatus" in obj, get: obj => obj.assistantSessionStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
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
        assistants;
        lifecycle;
        automation;
        covers;
        automationReason = '宿主尚不支持受控原生自动处理；手动群任务仍可使用';
        constructor(host, config = {}) {
            super(host, 'humanTools');
            this.host = host;
            // Installed before optional/async initialization and retained when disabled:
            // persisted plugin inbox input is never ambient permission to run again.
            const removeAutomationGate = installNativeAutomationGate(host);
            host.effect(() => async () => {
                this.lifetime.abort(disabled());
                const drained = this.core?.close();
                try {
                    this.unregister?.();
                }
                finally {
                    try {
                        // Once lifecycle mounted, an automation store may still be opening.
                        // Drain its aborted initializer before a replacement fiber can load.
                        // A pending initial action read has no mounted writer and retains
                        // the existing non-blocking disabled/late-disposed host behavior.
                        if (this.lifecycle)
                            await this.ready?.catch(() => { });
                        await Promise.all([drained, this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close(), this.closeAssistants(), this.closeLifecycle(), this.covers?.close()]);
                    }
                    finally {
                        removeAutomationGate();
                    }
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
            const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'), Date.now, (origin, asset) => {
                if (!this.covers || !this.workflow)
                    throw fail('cover-unavailable', '此节点尚不能准备封面图片');
                this.covers.assertAsset({ nodeId: this.workflow.transport.nodeId, sessionId: origin.scope, sessionGeneration: origin.generation }, asset);
            });
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
                    const file = (kind) => new WorkflowFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-${kind}.json`), kind === 'facts' ? REPLICA_MAX_BYTES : ['automation', 'lifecycle'].includes(kind) ? WORKFLOW_LONG_TERM_BYTES : undefined);
                    const archival = (kind) => WorkflowArchiveStore.open({ index: file(kind),
                        root: path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-${kind}-archive`),
                        nodeId: transport.nodeId, kind: kind === 'automation' ? 'runs' : 'analyses' });
                    const replica = await WorkflowReplica.open(config.workflow.replicaStore || file('facts'), transport);
                    let modes, records;
                    try {
                        const capabilities = () => {
                            transport.assertIdentity();
                            const automation = this.automation?.capability();
                            return createCapabilityManifest(transport.nodeId, { 'task.query': { status: 'available' },
                                'surface.cover-image': this.covers ? { status: 'available' } : { status: 'blocked', reason: '封面资产服务未就绪；旧无封面群卡仍可使用。' },
                                'automation.run': automation?.supported ? { status: 'available' } : { status: 'blocked', reason: automation?.reason || this.automationReason },
                                ...(this.lifecycle ? { 'surface.form-collection': { status: 'available' }, 'task.audience-select': { status: 'available' }, 'task.audience-known': { status: 'available' }, 'task.lifecycle': { status: 'available' },
                                    'recipient.query': { status: 'available' }, 'result.private': { status: 'available' },
                                    ...(this.lifecycle.receiver ? { 'submission.receive': { status: 'available' } } : {}) } : {}) });
                        };
                        modes = await ModeRegistry.open(config.workflow.modeStore || file('modes'), { nodeId: transport.nodeId, capabilities, randomId: () => randomBytes(16).toString('hex') });
                        records = await WorkflowRecords.open(config.workflow.recordStore || file('records'), { nodeId: transport.nodeId, modes, randomId: () => randomBytes(16).toString('hex'), validateReferences: (scope, refs) => replica.validateReferences(scope, refs) });
                        this.lifetime.signal.throwIfAborted();
                        transport.assertIdentity();
                        this.workflow = { transport, modes, records, replica };
                        try {
                            this.covers = await CardCoverAssets.open({ transport,
                                store: config.workflow.coverStore || new WorkflowFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-covers.json`), CARD_COVER_LEDGER_MAX_BYTES),
                                upload: uploadCardCover,
                                read: async (scope, source, signal) => {
                                    let data, mediaType;
                                    if (source.kind === 'attachment') {
                                        const reader = this.host.get('wechatAttachment');
                                        if (!reader?.readSessionImage)
                                            throw fail('cover-source-unavailable', '此宿主暂不能核对会话图片');
                                        const value = await reader.readSessionImage(scope.sessionId, source.attachmentId, signal);
                                        data = value.data;
                                        mediaType = value.mediaType;
                                    }
                                    else {
                                        const reader = this.host.get('agentResources');
                                        if (!reader?.readWorkspaceFile)
                                            throw fail('cover-source-unavailable', '此宿主暂不能核对工作区文件');
                                        const value = await reader.readWorkspaceFile(scope.sessionId, source.reference, signal);
                                        data = value.data;
                                        // Detect encoded raster header; never trust the filename.
                                        mediaType = data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 ? 'image/png'
                                            : data[0] === 255 && data[1] === 216 ? 'image/jpeg' : '';
                                    }
                                    if (mediaType !== 'image/png' && mediaType !== 'image/jpeg')
                                        throw fail('cover-source-invalid', '封面仅接受真实PNG或JPEG图片');
                                    return normalizeCardCoverImage(data, mediaType, signal);
                                } });
                            this.lifetime.signal.throwIfAborted();
                            transport.assertIdentity();
                            unregisterTools.push(this.host.get('tools').register(cardCoverTool(transport.nodeId, this.covers, exec => {
                                this.lifetime.signal.throwIfAborted();
                                transport.assertIdentity();
                                if (!exec.agent || this.host.get('agents')?.get(String(exec.agent.id)) !== exec.agent)
                                    throw fail('cover-scope-invalid', '不是当前原生Agent');
                            })));
                        }
                        catch {
                            await this.covers?.close();
                            this.covers = undefined;
                            this.lifetime.signal.throwIfAborted();
                            transport.assertIdentity();
                        }
                        const keyFile = path.join(path.dirname(defaultGateStatePath(this.host)), `human-workflow-${transport.nodeId}-receiver-keys.json`);
                        const keys = await ReceiverKeyring.open(config.workflow.receiverKeyStore || new ReceiverKeyFileStore(keyFile), transport.nodeId);
                        let receiver, runtime;
                        try {
                            const attachments = this.host.get('attachments');
                            if (typeof attachments?.validateImage === 'function' && typeof attachments?.saveImage === 'function') {
                                receiver = await SubmissionReceiver.open({ root: config.workflow.receiverRoot || path.join(path.dirname(keyFile), `human-workflow-${transport.nodeId}-received`),
                                    nodeId: transport.nodeId, keys, assertIdentity: () => transport.assertIdentity(), download: downloadSubmission,
                                    validateImage: (image, mediaType) => attachments.validateImage({ data: image, mediaType }),
                                    ack: (origin, taskRef, delivery, signal) => transport.request('objects/ack', { scope: origin.sessionId, sessionGeneration: origin.sessionGeneration,
                                        taskRef, submissionId: delivery.submissionId, claimId: delivery.claimId, version: delivery.version,
                                        manifestDigest: delivery.envelope.manifestDigest, cipherDigest: delivery.envelope.cipherDigest }, signal) });
                            }
                            runtime = await WorkflowLifecycle.open({ transport, keys, receiver, store: config.workflow.lifecycleStore || await archival('lifecycle'),
                                coverAuthority: (scope, asset) => { if (!this.covers)
                                    throw fail('cover-unavailable', '封面资产不可用'); this.covers.assertAsset(scope, asset); } });
                            this.lifetime.signal.throwIfAborted();
                            transport.assertIdentity();
                            const current = runtime;
                            this.lifecycle = { runtime, keys, receiver, unsubscribe: replica.onSynchronized((binding, tasks) => {
                                    void current.synced(binding, tasks, this.lifetime.signal).then(() => this.automation?.drive(this.lifetime.signal)).catch(() => { });
                                }) };
                            const nativeAutomation = config.workflow.automationNative || createNativeAutomationAdapter(this.host);
                            let automation;
                            const unregisterAutomation = [];
                            try {
                                // Keep the ledger/adapter alive even if optional native services
                                // are still starting (or an old host never supplies them).
                                // capability/preview/dispatch recheck the actual APIs; opening
                                // this ledger does not approve, resume, or run an Agent.
                                automation = await WorkflowAutomation.open({ nodeId: transport.nodeId, store: config.workflow.automationStore || await archival('automation'), native: nativeAutomation,
                                    authority: { assertIdentity: () => transport.assertIdentity(), inspect: (scope, task, signal, extra) => current.inspectAutomation(scope, task, signal, extra),
                                        ready: (scope, task, submission, signal) => current.readyAutomation(scope, task, submission, signal) },
                                    tools: (run, policy, authorize, saved) => automationTools({ lifecycle: current, core, run, policy, authorize, saved,
                                        ...(receiver && attachments ? { saveImage: (data, mediaType) => attachments.saveImage({ data, mediaType }) } : {}) }) });
                                this.lifetime.signal.throwIfAborted();
                                transport.assertIdentity();
                                for (const tool of automationProposalTools({ nodeId: transport.nodeId, runtime: automation, assertAgent: exec => {
                                        this.lifetime.signal.throwIfAborted();
                                        transport.assertIdentity();
                                        if (!exec.agent || this.host.get('agents')?.get(String(exec.agent.id)) !== exec.agent)
                                            throw fail('workflow-scope-invalid', '不是当前原生 Agent');
                                    } }))
                                    unregisterAutomation.push(this.host.get('tools').register(tool));
                                this.automation = automation;
                                unregisterTools.push(...unregisterAutomation);
                            }
                            catch {
                                unregisterAutomation.reverse().forEach(remove => remove());
                                this.automationReason = '自动处理账本或原生适配不可用；已停止自动运行，手动群任务仍可使用';
                                if (automation)
                                    await automation.close();
                                else
                                    await nativeAutomation.close();
                                this.lifetime.signal.throwIfAborted();
                                transport.assertIdentity();
                            }
                            for (const tool of lifecycleTools({ nodeId: transport.nodeId, lifecycle: runtime, core,
                                assertAgent: exec => {
                                    this.lifetime.signal.throwIfAborted();
                                    transport.assertIdentity();
                                    const agents = this.host.get('agents');
                                    if (!exec.agent || agents?.get(String(exec.agent.id)) !== exec.agent)
                                        throw fail('workflow-scope-invalid', '调用者不是当前真实Agent');
                                }, ...(receiver && attachments ? { saveImage: (data, mediaType) => attachments.saveImage({ data, mediaType }) } : {}) }))
                                unregisterTools.push(this.host.get('tools').register(tool));
                        }
                        catch (cause) {
                            await Promise.all([runtime?.close(), receiver?.close()]);
                            await keys.close();
                            throw cause;
                        }
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
                        if (config.assistants !== false) {
                            const assistantConfig = config.assistants || {}, native = assistantConfig.native || createNativeAssistantAdapter(this.host);
                            let registry, business;
                            try {
                                registry = await AssistantRegistry.open(assistantConfig.registryStore || file('assistants'), {
                                    nodeId: transport.nodeId, native, assertIdentity: () => transport.assertIdentity(),
                                });
                                business = await AssistantBusinessRecords.open(assistantConfig.businessStore || file('assistant-work'), {
                                    nodeId: transport.nodeId, registry, assertIdentity: () => transport.assertIdentity(),
                                });
                                this.lifetime.signal.throwIfAborted();
                                transport.assertIdentity();
                                this.assistants = { registry, business, native };
                                // Isolate optional launch-journal failure from existing assistant
                                // tools. The special launch entry then fails closed, not native UI.
                                try {
                                    const get = (name) => this.host.get(name);
                                    this.assistants.sessionIntents = await AssistantSessionIntents.open({ nodeId: transport.nodeId,
                                        store: assistantConfig.sessionIntentStore || file('assistant-session-intents'), assertIdentity: () => transport.assertIdentity(),
                                        installed: async (presetId) => {
                                            if (registry.installedForPreset(presetId))
                                                return true;
                                            const presets = get('agentPresets');
                                            if (presets?.defaultId !== presetId || typeof presets?.resolve !== 'function')
                                                return false;
                                            const resolved = await presets.resolve(presetId);
                                            return row(resolved) && resolved.id === presetId && resolved.broken === undefined && presets.defaultId === presetId;
                                        },
                                        supported: () => typeof get('sessionController')?.inspect === 'function' && typeof get('sessionController')?.create === 'function'
                                            && typeof get('agentPresets')?.readDocument === 'function',
                                        inspect: (id, signal) => get('sessionController').inspect(id, signal), workspace: id => get('workspaceRegistry')?.get(id) });
                                }
                                catch { /* Never fall back to unjournaled automatic creation. */ }
                                this.lifetime.signal.throwIfAborted();
                                transport.assertIdentity();
                                const assistantOptions = { nodeId: transport.nodeId, registry, business, assertIdentity: () => transport.assertIdentity(),
                                    composedPreset: (agent) => nativeComposedPreset(this.host, agent) };
                                for (const tool of assistantTools(assistantOptions))
                                    unregisterTools.push(this.host.get('tools').register(tool));
                                unregisterTools.push(registerAssistantContext(this.host, assistantOptions));
                            }
                            catch (cause) {
                                await native.close();
                                await Promise.all([registry?.close(), business?.close()]);
                                throw cause;
                            }
                        }
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
                await Promise.all([core.close(), this.workflow?.modes.close(), this.workflow?.records.close(), this.workflow?.replica.close(), this.closeAssistants(), this.closeLifecycle(), this.covers?.close()]);
                this.core = undefined;
                this.workflow = undefined;
                throw cause;
            }
        }
        async closeLifecycle() {
            const current = this.lifecycle;
            if (!current)
                return;
            current.unsubscribe();
            await this.automation?.close();
            await Promise.all([current.runtime.close(), current.receiver?.close()]);
            await current.keys.close();
        }
        async automationScope(request, signal) {
            const scope = await this.workflowScope(request.scope, signal);
            if (!humanTaskRef(request.taskRef))
                throw fail('automation-task-invalid', '自动处理任务引用无效');
            if (!this.automation)
                throw fail('automation-unsupported', this.automationReason);
            return { scope, runtime: this.automation, active: AbortSignal.any([signal, this.lifetime.signal]) };
        }
        async automationList(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal), active = AbortSignal.any([signal, this.lifetime.signal]);
                if (request.offset !== undefined && (!Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset > 10000))
                    throw fail('automation-offset-invalid', '任务分页位置无效');
                const page = await this.workflow.replica.query(scope, { limit: 20, offset: request.offset ?? 0 }, active);
                if (!row(page) || !Array.isArray(page.records) || !row(page.freshness))
                    throw fail('automation-list-invalid', '任务列表不可用');
                const tasks = [];
                let fresh = !!page.freshness.fresh;
                for (const value of page.records) {
                    if (!row(value) || !humanTaskRef(value.taskRef))
                        continue;
                    let rounds = [];
                    if (this.lifecycle) {
                        try {
                            const current = await this.lifecycle.runtime.inspectAutomation(scope, value.taskRef, active);
                            rounds = current.rounds.map(r => ({ id: r.id, title: r.title, closesAt: r.closesAt }));
                        }
                        catch (cause) {
                            if (/revoked|forbidden|account|generation|unauthori|binding/.test(String(cause?.code)))
                                throw cause;
                            active.throwIfAborted();
                            fresh = false;
                        }
                    }
                    const policy = this.automation?.policies(scope).find(p => p.taskRef.taskId === value.taskRef.taskId);
                    tasks.push({ taskRef: value.taskRef, title: value.title, rounds, policy: automationPolicyView(policy ?? null) });
                }
                return { schema: 'human.automation.list.v1', capability: this.automation?.capability() || { supported: false, reason: this.automationReason },
                    asOf: page.freshness.asOf, freshness: fresh ? 'online' : 'cached', tasks, nextOffset: page.nextOffset };
            });
        }
        async workflowReceiptStatus(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal);
                if (!this.lifecycle)
                    throw fail('receiver-unavailable', '此节点尚未提供持久收件');
                return this.lifecycle.runtime.receiptStatus(scope, request.taskRef, AbortSignal.any([signal, this.lifetime.signal]), request.offset);
            });
        }
        async automationProposals(request, signal) {
            return this.result(async () => {
                const { scope, runtime, active } = await this.automationScope(request, signal);
                return runtime.proposals(scope, request.taskRef, active);
            });
        }
        async workflowReceiptRetry(request, signal) {
            return this.result(async () => {
                const scope = await this.workflowScope(request.scope, signal);
                if (!this.lifecycle)
                    throw fail('receiver-unavailable', '此节点尚未提供持久收件');
                return this.lifecycle.runtime.retryReceipt(scope, request.taskRef, request, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async automationPreview(request, signal) {
            return this.result(async () => {
                const { scope, runtime, active } = await this.automationScope(request, signal);
                return automationPreviewView(await runtime.preview(scope, request.taskRef, request, active));
            });
        }
        async automationApprove(request, signal) {
            return this.result(async () => {
                const { scope, runtime, active } = await this.automationScope(request, signal);
                const policy = await runtime.approve(scope, request.taskRef, request, active);
                void runtime.drive(this.lifetime.signal).catch(() => { });
                return automationPolicyView(policy);
            });
        }
        async automationPause(request, signal) {
            return this.result(async () => {
                const { scope, runtime, active } = await this.automationScope(request, signal);
                return automationPolicyView(await runtime.pause(scope, request.taskRef, request.expectedRevision, active));
            });
        }
        async automationStatus(request, signal) {
            return this.result(async () => {
                const { scope, runtime, active } = await this.automationScope(request, signal);
                return runtime.status(scope, request.taskRef, active, request.cursor);
            });
        }
        async workflowDraft(request, signal) {
            return this.result(async () => {
                const active = AbortSignal.any([signal, this.lifetime.signal]), core = await this.use(active);
                if (!this.lifecycle)
                    throw fail('lifecycle-unavailable', '此节点尚未提供任务生命周期');
                const source = core.grantSource(request), generation = await this.claimGeneration(request.scope, active);
                core.assertGeneration(request.scope, request.surfaceId, generation);
                if (source.surface.actions[0].id !== 'workflow-approve' || !source.surface.workflowRef || !source.surface.targetTaskRef)
                    throw fail('lifecycle-draft-invalid', '此按钮不是工作流审核入口');
                return this.lifecycle.runtime.preview({ nodeId: this.workflow.transport.nodeId, sessionId: source.origin.scope, sessionGeneration: generation }, source.surface.targetTaskRef, source.surface.workflowRef, active);
            });
        }
        /** Owner-only read preview; never claims an action or approves publication.
         * Resolve the asset from the durable Surface / exact cloud draft, not input. */
        async coverPreview(request, signal) {
            return this.result(async () => {
                const active = AbortSignal.any([signal, this.lifetime.signal]), core = await this.use(active);
                if (!row(request) || request.revision !== 1 || !this.covers || !this.workflow)
                    throw fail('cover-preview-invalid', '封面预览不可用');
                const scope = await this.workflowScope(request.scope, active);
                core.assertGeneration(request.scope, request.surfaceId, scope.sessionGeneration);
                const status = core.status(request.scope, request.surfaceId), surface = status.surface;
                let asset;
                if (surface.actions[0].id === 'share')
                    asset = humanCardAsset(surface.cover);
                else if (surface.actions[0].id === 'workflow-approve' && surface.workflowRef?.kind === 'round' && surface.targetTaskRef && this.lifecycle) {
                    const preview = await this.lifecycle.runtime.preview(scope, surface.targetTaskRef, surface.workflowRef, active);
                    if (row(preview) && row(preview.draft) && row(preview.draft.content))
                        asset = humanCardAsset(preview.draft.content.cover);
                }
                if (!asset)
                    throw fail('cover-preview-invalid', '此卡没有可公开预览的封面资产');
                const result = await this.covers.preview(scope, asset, request.requestId, active);
                core.assertGeneration(request.scope, request.surfaceId, await this.claimGeneration(request.scope, active));
                return result;
            });
        }
        async closeAssistants() {
            const assistants = this.assistants;
            if (!assistants)
                return;
            await Promise.all([assistants.native.close(), assistants.registry.close(), assistants.business.close(), assistants.sessionIntents?.close()]);
        }
        async assistantRegistry(signal) {
            await this.use(signal);
            if (!this.assistants)
                throw fail('assistant-unavailable', '此节点尚未提供助手管理能力');
            return this.assistants.registry;
        }
        async assistantCatalog(request, signal) {
            return this.result(async () => (await this.assistantRegistry(signal)).catalog(AbortSignal.any([signal, this.lifetime.signal])));
        }
        async assistantDraft(request, signal) {
            return this.result(async () => {
                const registry = await this.assistantRegistry(signal), { definitionJson, ...input } = request;
                if (definitionJson !== undefined && (typeof definitionJson !== 'string' || Buffer.byteLength(definitionJson) > 24 * 1024))
                    throw fail('assistant-definition-invalid', '助手定义过大或无效');
                return registry.draft({ ...input, ...(definitionJson === undefined ? {} : { definition: JSON.parse(definitionJson) }) }, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async assistantPreview(request, signal) {
            return this.result(async () => (await this.assistantRegistry(signal)).preview(request, AbortSignal.any([signal, this.lifetime.signal])));
        }
        async assistantInstall(request, signal) {
            return this.result(async () => (await this.assistantRegistry(signal)).install(request, AbortSignal.any([signal, this.lifetime.signal])));
        }
        async assistantStatus(request, signal) {
            return this.result(async () => (await this.assistantRegistry(signal)).status(request, AbortSignal.any([signal, this.lifetime.signal])));
        }
        async assistantSessionPrepare(request, signal) {
            return this.result(async () => {
                await this.assistantRegistry(signal);
                if (!this.assistants?.sessionIntents)
                    throw fail('assistant-session-unavailable', '此节点无法持久核对新建会话；请使用 DSH 原生新会话入口');
                return this.assistants.sessionIntents.prepare(request, AbortSignal.any([signal, this.lifetime.signal]));
            });
        }
        async assistantSessionStatus(request, signal) {
            return this.result(async () => {
                await this.assistantRegistry(signal);
                if (!this.assistants?.sessionIntents)
                    throw fail('assistant-session-unavailable', '此节点无法持久核对新建会话；请使用 DSH 原生会话列表');
                return this.assistants.sessionIntents.status(request, AbortSignal.any([signal, this.lifetime.signal]));
            });
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
                await this.workflow.replica.keepDiscovering(Number(grant.expiresAt) + WORKFLOW_DRAFT_TTL_MS, active);
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
            return this.result(async () => {
                const active = AbortSignal.any([signal, this.lifetime.signal]), receipt = await (await this.use(active)).ack(request, active);
                if (this.workflow && request.actionId === 'share' && ['success', 'unknown'].includes(receipt.outcome)) {
                    // Also cover a late native result and pre-upgrade ledgers which never
                    // retained a grant intent. This is only read-only discovery, not replay.
                    // Authoritative sync time, never this local clock, decides retirement.
                    await this.workflow.replica.keepDiscovering(Date.now() + WORKFLOW_SOURCE_GRANT_TTL_MS + WORKFLOW_DRAFT_TTL_MS, active);
                }
                return receipt;
            });
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
