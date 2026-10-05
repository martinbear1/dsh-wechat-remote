import { type HumanTaskRef, type HumanWorkflowDraftRef, type HumanSelectionRef, type HumanReminderPreview, type HumanRecipientRef } from '../human-tools/protocol.js';
import { type WorkflowDataStore, type WorkflowScope } from './data.js';
import { type WorkflowTransport } from './transport.js';
import { ReceiverKeyring } from './receiver-keyring.js';
import { SubmissionReceiver } from './receiver.js';
import type { AutomationSnapshot, AutomationSubmission } from './automation-types.js';
import { type HumanCardAsset } from '../human-tools/card-cover.js';
import type { WorkspaceTaskAccess } from './workspace-directory.js';
export interface NodeBinding {
    schema: 'human.node.binding.v1';
    nodeId: string;
    ownerSubject: string;
    accountInstance: string;
    generation: string;
}
export declare function receiverBinding(value: unknown, nodeId: string): {
    binding: NodeBinding;
    bindingKey: string;
};
export interface LifecycleDraft {
    draftRef: HumanWorkflowDraftRef;
    taskRef: HumanTaskRef;
    expectedRevision: number;
    content: Record<string, unknown>;
    expiresAt: number;
    state: 'draft' | 'published';
    result?: unknown;
    currentRevision?: number;
    approvalStatus?: 'ready' | 'published' | 'stale' | 'expired';
    context?: {
        taskTitle: string;
        roundTitle?: string;
        submissionCreatedAt?: number;
        reminderTargetCount?: number;
    };
    execution?: {
        operationId: string;
        phase: 'prepared' | 'invoked' | 'settled';
        outcome: string | null;
        reason: string | null;
    };
}
/** Host-derived input authority; never a model tool parameter or tool output. */
export interface PrivatePublishInput {
    inputProof: string;
    inputId: string;
    contentDigest: string;
    nativeMessageId: string;
    idempotencyKey: string;
    assertCurrent(): void;
}
export type LifecycleReminderContent = {
    roundId: string | null;
    title: string;
} & ({
    condition: 'pending-submission' | 'result-published';
    participantRefs: string[];
    recipientSource?: never;
} | {
    condition: 'pending-submission';
    recipientSource: 'task-audience';
    participantRefs?: never;
} | {
    condition: 'pending-submission';
    recipientSource: 'selected-members';
    selectionRef: HumanSelectionRef;
    participantRefs?: never;
} | {
    condition: 'none';
    recipientSource: 'exact-references';
    recipientRefs: HumanRecipientRef[];
    type: 'complete' | 'participate';
    participantRefs?: never;
});
/** Request data only. Actual audience membership and current eligibility are
 * resolved by the authenticated server without creating participant records. */
export declare function lifecycleReminderContent(value: unknown): LifecycleReminderContent | undefined;
/** Derived from the checked immutable cloud draft, never supplied by the model. */
export declare function lifecycleReminderPreview(draft: LifecycleDraft): HumanReminderPreview | undefined;
interface Analysis {
    scope: WorkflowScope;
    taskRef: HumanTaskRef;
    submissionId: string;
    submissionVersion: number;
    revision: number;
    text: string;
    updatedAt: number;
}
export interface LifecycleOptions {
    transport: WorkflowTransport;
    keys: ReceiverKeyring;
    receiver?: SubmissionReceiver;
    store: WorkflowDataStore;
    now?: () => number;
    coverAuthority?(scope: WorkflowScope, asset: HumanCardAsset): void;
    workspaceAccess?(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal): Promise<WorkspaceTaskAccess | undefined>;
}
export declare const RECEIVER_SYNC_MAX_FILES = 4;
export declare const RECEIVER_SYNC_TIMEOUT_MS = 120000;
/** Drafts and reception remain separate from the narrowly scoped private
 * publication path. That path requires trusted host input plus cloud grants;
 * no Agent restoration, model invocation, public sharing or notification here. */
export declare class WorkflowLifecycle {
    private readonly options;
    private readonly state;
    private readonly lifetime;
    private readonly registered;
    private readonly fileRegistered;
    private readonly offsets;
    private background;
    private syncing;
    private cursor;
    available: boolean;
    private constructor();
    static open(options: LifecycleOptions): Promise<WorkflowLifecycle>;
    private active;
    prepareInitial(signal: AbortSignal, requiresAttachment: boolean, requiresFile?: boolean): Promise<void>;
    private registerKey;
    private get;
    reshare(scope: WorkflowScope, taskRef: HumanTaskRef, roundId: string | null, signal: AbortSignal): Promise<{
        title: string;
        body: string;
    }>;
    query(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, offset?: number, roundId?: string): Promise<unknown>;
    recipients(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, roundId?: string | null, offset?: number, snapshot?: string): Promise<{
        schema: string;
        taskRef: HumanTaskRef;
        roundId: string | null;
        asOf: number;
        revision: number;
        snapshot: string;
        nextOffset: unknown;
        coverage: Record<string, unknown>;
        recipients: {
            identity: {
                schema: "human.member.identity.v1";
                groupRef: string;
                memberRef: string;
            };
            recipientRef: HumanRecipientRef;
            participantRef: unknown;
            sources: any[];
            observedAt: unknown;
            confirmedAt: unknown;
            identityVerifiedAt: unknown;
            canTarget: boolean;
            unavailableReason: unknown;
            submissionFacts: unknown;
        }[];
    }>;
    prepare(scope: WorkflowScope, taskRef: HumanTaskRef, kind: HumanWorkflowDraftRef['kind'], expectedRevision: number, content: Record<string, unknown>, idempotencyKey: string, signal: AbortSignal): Promise<LifecycleDraft>;
    preview(scope: WorkflowScope, taskRef: HumanTaskRef, ref: HumanWorkflowDraftRef, signal: AbortSignal): Promise<unknown>;
    publishPrivate(scope: WorkflowScope, taskRef: HumanTaskRef, ref: HumanWorkflowDraftRef, input: PrivatePublishInput, signal: AbortSignal): Promise<{
        schema: string;
        taskRef: HumanTaskRef;
        draftRef: HumanWorkflowDraftRef;
        state: string;
        effects: {
            contentState: string;
            groupCardState: string;
            notificationState: string;
        };
        alreadyPublished: boolean;
        operationId?: undefined;
        result?: undefined;
    } | {
        schema: string;
        taskRef: HumanTaskRef;
        draftRef: HumanWorkflowDraftRef;
        state: string;
        operationId: string;
        result: Record<string, unknown>;
        effects: {
            contentState: string;
            groupCardState: string;
            notificationState: string;
        };
        alreadyPublished?: undefined;
    }>;
    private receipt;
    receiptStatus(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, offset?: number): Promise<{
        schema: string;
        taskRef: HumanTaskRef;
        asOf: unknown;
        items: {
            retryable: boolean;
            errorCode?: string | undefined;
            message?: string | undefined;
            submissionId: string;
            submissionVersion: number;
            roundId: string;
            state: string;
            revision: number;
        }[];
        nextOffset: unknown;
    }>;
    retryReceipt(scope: WorkflowScope, taskRef: HumanTaskRef, input: {
        submissionId: string;
        submissionVersion: number;
        expectedRevision: number;
    }, signal: AbortSignal): Promise<{
        schema: string;
        taskRef: HumanTaskRef;
        submissionId: string;
        submissionVersion: number;
        revision: number;
        state: string;
    }>;
    /** One hook on the existing node sync loop. Bounded round-robin scan, not a
     * task poller. Failed receivers remain retryable; neither events nor ACKs
     * call a model, create sessions or restore stopped Agents. */
    synced(binding: unknown, tasks: readonly Record<string, unknown>[], signal: AbortSignal): Promise<void>;
    private readAttachment;
    readImage(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal): Promise<{
        manifest: {
            file: {
                mediaType: import("./submission-file-contract.js").SubmissionImageType;
                plainBytes: number;
                plainDigest: string;
            } | {
                mediaType: import("./submission-file-contract.js").SubmissionImageType;
                plainBytes: number;
                plainDigest: string;
                displayName: string;
            };
            schema: "human.submission.manifest.v1";
            context: import("./submission-crypto.js").SubmissionContext;
            answers: import("./submission-crypto.js").SubmissionAnswers;
        } | {
            file: {
                mediaType: import("./submission-file-contract.js").SubmissionImageType;
                plainBytes: number;
                plainDigest: string;
            } | {
                mediaType: import("./submission-file-contract.js").SubmissionImageType;
                plainBytes: number;
                plainDigest: string;
                displayName: string;
            };
            schema: "human.submission.manifest.v2";
            context: import("./submission-crypto.js").SubmissionContext;
            answers: import("./submission-crypto.js").SubmissionAnswers;
        };
        artifactRef: string;
        receivedAt: number;
        data: Uint8Array;
        image: Uint8Array;
    }>;
    exportFile(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal): Promise<{
        path: string;
        displayName: string;
        mediaType: "image/png" | "image/jpeg" | "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "text/plain" | "text/csv";
        bytes: number;
        sha256: string;
        manifest: import("./submission-crypto.js").SubmissionManifest;
        receivedAt: number;
        artifactRef: string;
    }>;
    /** Fresh signed authority for automatic work. This is intentionally not the
     * local replica and not a timestamp supplied by the phone or workstation. */
    inspectAutomation(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, extra?: {
        offset?: number;
        submissionId?: string;
    }): Promise<AutomationSnapshot>;
    readyAutomation(scope: WorkflowScope, taskRef: HumanTaskRef, submission: AutomationSubmission, signal: AbortSignal): Promise<boolean>;
    saveAnalysis(scope: WorkflowScope, taskRef: HumanTaskRef, input: {
        submissionId: string;
        submissionVersion: number;
        expectedRevision: number;
        text: string;
    }, signal: AbortSignal): Promise<Analysis>;
    analyses(scope: WorkflowScope, taskRef: HumanTaskRef): Analysis[];
    close(): Promise<void>;
}
export {};
