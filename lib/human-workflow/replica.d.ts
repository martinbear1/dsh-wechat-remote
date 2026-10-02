import { type WorkflowDataStore, type WorkflowScope } from './data.js';
import type { WorkflowTransport } from './transport.js';
export declare const REPLICA_MAX_BYTES: number;
export declare const WORKFLOW_SOURCE_GRANT_TTL_MS: number;
export declare const WORKFLOW_DRAFT_TTL_MS: number;
/** Cloud participant facts are replicated independently of chat history. No
 * task-level pollers, automatic model wakeup or mutation of upstream facts. */
export declare class WorkflowReplica {
    private readonly store;
    private readonly transport;
    private readonly now;
    private state;
    private tail;
    private readonly lifetime;
    private timer?;
    private retry;
    private discoveryUntil;
    private started;
    private fresh;
    private synchronized?;
    private constructor();
    static open(store: WorkflowDataStore, transport: WorkflowTransport, now?: () => number): Promise<WorkflowReplica>;
    start(): void;
    onSynchronized(listener: (binding: unknown, tasks: readonly Record<string, unknown>[]) => void): () => void;
    discover(): void;
    /** Persist BEFORE returning a source grant or acknowledging an uncertain
     * share. Expiry alone never proves that no task was published while offline.
     * Only a complete authoritative sync beyond this server-time horizon does. */
    keepDiscovering(until: number, signal: AbortSignal): Promise<void>;
    private needsDiscovery;
    private schedule;
    close(): Promise<void>;
    validateReferences(scope: WorkflowScope, refs: readonly {
        kind: string;
        id: string;
        version: number;
    }[]): void;
    private save;
    private clear;
    refresh(signal: AbortSignal): Promise<void>;
    private snapshot;
    private events;
    query(scope: WorkflowScope, input: {
        taskId?: string;
        participants?: boolean;
        offset?: number;
        limit?: number;
    }, signal: AbortSignal): Promise<unknown>;
}
