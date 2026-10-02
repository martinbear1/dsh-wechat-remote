import { type HumanTaskRef } from '../human-tools/protocol.js';
import { type WorkflowScope } from './data.js';
import type { AutomationConfig, AutomationOptions, AutomationPolicy, AutomationPreview } from './automation-types.js';
export type * from './automation-types.js';
export declare function automationConfig(value: unknown): AutomationConfig;
export declare function automationPolicyView(policy: AutomationPolicy | null): unknown;
export declare function automationPreviewView(preview: AutomationPreview): unknown;
/** One node/profile writer and one execution slot. No model call is retried.
 * A crash after dispatch intent is conservatively unknown until native log
 * evidence proves settlement; absence of a log entry is not proof of no call. */
export declare class WorkflowAutomation {
    private readonly options;
    private readonly state;
    private readonly lifetime;
    private readonly halted;
    private readonly offsets;
    private drivePromise;
    private activeRun?;
    private readonly operations;
    private unsubscribe;
    private constructor();
    static open(options: AutomationOptions): Promise<WorkflowAutomation>;
    private now;
    private id;
    private active;
    private policy;
    capability(): import("./automation-types.js").AutomationCapability;
    policies(scope: WorkflowScope): AutomationPolicy[];
    preview(scope: WorkflowScope, taskRef: HumanTaskRef, input: {
        config: unknown;
        expectedRevision: number;
    }, signal: AbortSignal): Promise<AutomationPreview>;
    approve(scope: WorkflowScope, taskRef: HumanTaskRef, input: {
        previewId: string;
        digest: string;
        expectedRevision: number;
    }, signal: AbortSignal): Promise<AutomationPolicy>;
    pause(scope: WorkflowScope, taskRef: HumanTaskRef, expectedRevision: number, signal: AbortSignal): Promise<AutomationPolicy>;
    private stopSession;
    private block;
    /** Invoke only after the existing successful sync/receiver tick or explicit
     * owner approval. Coalesces callers; never adds a polling timer. */
    drive(signal?: AbortSignal): Promise<void>;
    private driveOnce;
    private authorize;
    private execute;
    status(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, cursor?: string): Promise<{
        schema: string;
        capability: import("./automation-types.js").AutomationCapability;
        asOf: number;
        freshness: "online" | "cached";
        policy: unknown;
        runs: {
            id: string;
            submissionId: string;
            submissionVersion: number;
            roundId: string;
            policyVersion: number;
            state: import("./automation-types.js").AutomationRunState;
            createdAt: number;
            updatedAt: number;
            reason?: string;
            turn?: number;
            analysisRevision?: number;
            draftRef?: import("../human-tools/protocol.js").HumanWorkflowDraftRef;
        }[];
        nextCursor: string | null;
    }>;
    close(): Promise<void>;
}
