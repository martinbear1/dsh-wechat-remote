import { type HumanTaskRef, type HumanWorkflowDraftRef } from '../human-tools/protocol.js';
import { type WorkflowDataStore, type WorkflowScope } from './data.js';
import { type WorkflowTransport } from './transport.js';
import { ReceiverKeyring } from './receiver-keyring.js';
import { SubmissionReceiver } from './receiver.js';
import type { AutomationSnapshot, AutomationSubmission } from './automation-types.js';
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
}
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
}
export declare const RECEIVER_SYNC_MAX_FILES = 4;
export declare const RECEIVER_SYNC_TIMEOUT_MS = 120000;
/** Local receiver and draft tools never approve. Only the authenticated owner
 * WeChat endpoint can publish a draft. No Agent restoration or execution here. */
export declare class WorkflowLifecycle {
    private readonly options;
    private readonly state;
    private readonly lifetime;
    private readonly registered;
    private readonly offsets;
    private background;
    private syncing;
    private cursor;
    available: boolean;
    private constructor();
    static open(options: LifecycleOptions): Promise<WorkflowLifecycle>;
    private active;
    prepareInitial(signal: AbortSignal, requiresImage: boolean): Promise<void>;
    private registerKey;
    private get;
    query(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, offset?: number, roundId?: string): Promise<unknown>;
    prepare(scope: WorkflowScope, taskRef: HumanTaskRef, kind: HumanWorkflowDraftRef['kind'], expectedRevision: number, content: Record<string, unknown>, idempotencyKey: string, signal: AbortSignal): Promise<LifecycleDraft>;
    preview(scope: WorkflowScope, taskRef: HumanTaskRef, ref: HumanWorkflowDraftRef, signal: AbortSignal): Promise<unknown>;
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
    readImage(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal): Promise<{
        artifactRef: string;
        receivedAt: number;
        manifest: import("./submission-crypto.js").SubmissionManifest;
        image: Uint8Array;
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
