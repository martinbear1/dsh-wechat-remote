import type { HumanTaskRef, HumanWorkflowDraftRef } from '../human-tools/protocol.js';
import type { WorkflowDataStore, WorkflowScope } from './data.js';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { SubmissionAnswers } from './submission-crypto.js';
export interface AutomationConfig {
    trigger: 'manual' | 'per-submission' | 'all-recipients';
    roundId: string;
    instructions: string;
    existing: 'new-only' | 'include-existing';
    allowSessionResume: boolean;
    maxRuns: number;
    timeoutSeconds: number;
    concurrency: 1;
    recipientRefs?: string[];
}
export interface AutomationCapability {
    supported: boolean;
    reason?: string;
}
export interface AutomationProcessor {
    presetId: string;
    presetDigest: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
    permissionPreset: string;
    fingerprint: string;
}
export interface AutomationInspection {
    processor: AutomationProcessor;
    sessionSeq: number;
    stoppedAtSeq: number;
    archived: boolean;
    busy: boolean;
    live: boolean;
}
export interface AutomationSubmission {
    id: string;
    version: number;
    roundId: string;
    state: string;
    delivery: string;
    acceptedAt: number | null;
    values: SubmissionAnswers;
    participantRef?: string;
}
export interface AutomationSnapshot {
    bindingKey: string;
    asOf: number;
    revision: number;
    rounds: Record<string, unknown>[];
    submissions: AutomationSubmission[];
    nextOffset: number | null;
    participants?: {
        participantRef: string;
    }[];
}
/** All calls recheck current signed cloud authority. ready also verifies the
 * exact local committed ciphertext before any image job is admitted. */
export interface AutomationAuthority {
    assertIdentity(): void;
    inspect(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, extra?: {
        offset?: number;
        submissionId?: string;
    }): Promise<AutomationSnapshot>;
    ready(scope: WorkflowScope, taskRef: HumanTaskRef, submission: AutomationSubmission, signal: AbortSignal): Promise<boolean>;
}
export interface AutomationPolicy {
    schema: 'human.automation.policy.v1';
    scope: WorkflowScope;
    taskRef: HumanTaskRef;
    revision: number;
    policyVersion: number;
    state: 'active' | 'paused' | 'exhausted' | 'blocked';
    config: AutomationConfig;
    processor: AutomationProcessor;
    approvedAt: number;
    updatedAt: number;
    reason?: string;
    usedRuns: number;
    bindingKey: string;
    acceptanceCutoff: number;
    sessionSeq: number;
    batch?: {
        formedAt: number;
        selections: {
            submissionId: string;
            submissionVersion: number;
            participantRef: string;
        }[];
    };
}
export interface AutomationProposal {
    proposalId: string;
    digest: string;
    scope: WorkflowScope;
    taskRef: HumanTaskRef;
    expectedRevision: number;
    createdAt: number;
    config: AutomationConfig;
}
export interface AutomationPreview {
    schema: 'human.automation.preview.v1';
    previewId: string;
    digest: string;
    expectedRevision: number;
    expiresAt: number;
    scope: WorkflowScope;
    taskRef: HumanTaskRef;
    config: AutomationConfig;
    processor: AutomationProcessor;
    capability: AutomationCapability;
    warnings: string[];
    asOf: number;
    bindingKey: string;
}
export type AutomationRunState = 'queued' | 'dispatching' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
export interface AutomationRun {
    id: string;
    scope: WorkflowScope;
    taskRef: HumanTaskRef;
    submissionId: string;
    submissionVersion: number;
    roundId: string;
    policyVersion: number;
    state: AutomationRunState;
    createdAt: number;
    updatedAt: number;
    reason?: string;
    messageId?: string;
    turn?: number;
    analysisRevision?: number;
    draftRef?: HumanWorkflowDraftRef;
}
export interface AutomationRunResult {
    state: 'succeeded' | 'failed' | 'cancelled' | 'unknown';
    reason?: string;
    turn?: number;
    analysisRevision?: number;
    draftRef?: HumanWorkflowDraftRef;
}
export interface AutomationRunRequest {
    run: AutomationRun;
    policy: AutomationPolicy;
    message: unknown;
    /** Runs before EVERY step and every authorized tool body, not just enqueue. */
    authorize(signal: AbortSignal): Promise<void>;
    tools: ToolDefinition[];
    claimed(turn: number): Promise<void>;
}
export interface NativeAutomationAdapter {
    probe(): AutomationCapability;
    inspect(scope: WorkflowScope, signal: AbortSignal): Promise<AutomationInspection>;
    createMessage(run: AutomationRun, policy: AutomationPolicy): {
        id: string;
        message: unknown;
    };
    run(request: AutomationRunRequest, signal: AbortSignal): Promise<AutomationRunResult>;
    /** Read-only reconciliation; it MUST NOT restore, enqueue or call a model. */
    reconcile(run: AutomationRun, signal: AbortSignal): Promise<AutomationRunResult>;
    onStop(listener: (sessionId: string) => void): () => void;
    close(): Promise<void>;
}
export interface AutomationOptions {
    nodeId: string;
    store: WorkflowDataStore;
    authority: AutomationAuthority;
    native: NativeAutomationAdapter;
    tools(run: AutomationRun, policy: AutomationPolicy, authorize: (signal: AbortSignal) => Promise<void>, saved: (value: {
        analysisRevision: number;
        draftRef: HumanWorkflowDraftRef;
    }) => Promise<void>): ToolDefinition[];
    now?: () => number;
    randomId?: () => string;
}
