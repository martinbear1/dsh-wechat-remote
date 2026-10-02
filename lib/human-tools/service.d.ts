import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type HumanStore } from './core.js';
import { type HumanTaskRef, type HumanAckWireRequest, type HumanActionRequest, type HumanSurface } from './protocol.js';
import { type WorkflowDataStore } from '../human-workflow/data.js';
import type { WorkflowTransport } from '../human-workflow/transport.js';
import type { NativeAssistantAdapter } from '../assistant-presets/types.js';
import type { AutomationConfig, NativeAutomationAdapter } from '../human-workflow/automation-types.js';
export interface HumanToolsConfig {
    readonly enabled?: boolean;
    readonly store?: HumanStore;
    readonly assistants?: false | {
        native?: NativeAssistantAdapter;
        registryStore?: WorkflowDataStore;
        businessStore?: WorkflowDataStore;
        sessionIntentStore?: WorkflowDataStore;
    };
    readonly workflow?: {
        transport: WorkflowTransport;
        modeStore?: WorkflowDataStore;
        recordStore?: WorkflowDataStore;
        replicaStore?: WorkflowDataStore;
        lifecycleStore?: WorkflowDataStore;
        receiverKeyStore?: WorkflowDataStore;
        receiverRoot?: string;
        automationStore?: WorkflowDataStore;
        automationNative?: NativeAutomationAdapter;
        coverStore?: WorkflowDataStore;
    };
}
export interface CoverPreviewRequest {
    scope: string;
    surfaceId: string;
    revision: 1;
    requestId: string;
}
export interface AutomationTaskRequest {
    scope: string;
    taskRef: HumanTaskRef;
}
export interface AutomationPreviewRequest extends AutomationTaskRequest {
    config: AutomationConfig;
    expectedRevision: number;
}
export interface AutomationApproveRequest extends AutomationTaskRequest {
    previewId: string;
    digest: string;
    expectedRevision: number;
}
export interface AutomationPauseRequest extends AutomationTaskRequest {
    expectedRevision: number;
}
export interface AutomationStatusRequest extends AutomationTaskRequest {
    cursor?: string;
}
export interface ModeVersionRequest {
    scope: string;
    id: string;
    version: number;
}
export interface ModeApprovalRequest extends ModeVersionRequest {
    digest: string;
    previewId: string;
    expectedActivationVersion: number;
}
export interface AssistantVersionRequest {
    id: string;
    version: number;
}
export interface AssistantInstallRequest extends AssistantVersionRequest {
    digest: string;
    previewId: string;
}
export interface AssistantDraftRequest {
    templateId?: string;
    definitionJson?: string;
    id?: string;
    expectedVersion?: number;
}
export interface HumanResult {
    readonly ok: boolean;
    readonly valueJson?: string;
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
}
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
export declare class HumanToolsService extends TypertRemoteService {
    private readonly host;
    static inject: string[];
    private core?;
    private ready?;
    private readonly lifetime;
    private unregister?;
    private workflow?;
    private assistants?;
    private lifecycle?;
    private automation?;
    private covers?;
    private automationReason;
    constructor(host: Context, config?: HumanToolsConfig);
    private initialize;
    private closeLifecycle;
    private automationScope;
    automationList(request: {
        scope: string;
        offset?: number;
    }, signal: AbortSignal): Promise<HumanResult>;
    workflowReceiptStatus(request: AutomationTaskRequest & {
        offset?: number;
    }, signal: AbortSignal): Promise<HumanResult>;
    automationProposals(request: AutomationTaskRequest, signal: AbortSignal): Promise<HumanResult>;
    workflowReceiptRetry(request: AutomationTaskRequest & {
        submissionId: string;
        submissionVersion: number;
        expectedRevision: number;
    }, signal: AbortSignal): Promise<HumanResult>;
    automationPreview(request: AutomationPreviewRequest, signal: AbortSignal): Promise<HumanResult>;
    automationApprove(request: AutomationApproveRequest, signal: AbortSignal): Promise<HumanResult>;
    automationPause(request: AutomationPauseRequest, signal: AbortSignal): Promise<HumanResult>;
    automationStatus(request: AutomationStatusRequest, signal: AbortSignal): Promise<HumanResult>;
    workflowDraft(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult>;
    /** Owner-only read preview; never claims an action or approves publication.
     * Resolve the asset from the durable Surface / exact cloud draft, not input. */
    coverPreview(request: CoverPreviewRequest, signal: AbortSignal): Promise<HumanResult>;
    private closeAssistants;
    private assistantRegistry;
    assistantCatalog(request: {}, signal: AbortSignal): Promise<HumanResult>;
    assistantDraft(request: AssistantDraftRequest, signal: AbortSignal): Promise<HumanResult>;
    assistantPreview(request: AssistantVersionRequest, signal: AbortSignal): Promise<HumanResult>;
    assistantInstall(request: AssistantInstallRequest, signal: AbortSignal): Promise<HumanResult>;
    assistantStatus(request: AssistantVersionRequest, signal: AbortSignal): Promise<HumanResult>;
    assistantSessionPrepare(request: {
        presetId: string;
        workspaceId?: string;
        previousAttemptId?: string;
    }, signal: AbortSignal): Promise<HumanResult>;
    assistantSessionStatus(request: {
        attemptId: string;
    } | {
        presetId: string;
        workspaceId?: string;
    }, signal: AbortSignal): Promise<HumanResult>;
    private use;
    private result;
    /** Synchronous bounded lookup used identically by history and live projection. */
    present(scope: string, callId: string): HumanSurface | undefined;
    /** Host-only cold-history barrier. Shares the one ledger load; cancelling a
     * reader never cancels initialization or another reader. Optional failure
     * must not hide the ordinary history, and adds no retry or polling. */
    prepareProjection(signal: AbortSignal): Promise<boolean>;
    capabilities(request: {
        scope: string;
    }, signal: AbortSignal): Promise<HumanResult>;
    sourceGrant(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult>;
    private workflowScope;
    modeList(request: {
        scope: string;
    }, signal: AbortSignal): Promise<HumanResult>;
    modePreview(request: ModeVersionRequest, signal: AbortSignal): Promise<HumanResult>;
    modeApprove(request: ModeApprovalRequest, signal: AbortSignal): Promise<HumanResult>;
    modeRollback(request: ModeApprovalRequest, signal: AbortSignal): Promise<HumanResult>;
    claim(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult>;
    /** A missing live Session is not evidence that its durable generation still
     * exists. Query headers only; never acquire a Session/Agent writer to claim. */
    private claimGeneration;
    ack(request: HumanAckWireRequest, signal: AbortSignal): Promise<HumanResult>;
    status(request: {
        scope: string;
        surfaceId: string;
    }, signal: AbortSignal): Promise<HumanResult>;
}
