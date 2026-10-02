import { type WorkflowDataStore, type WorkflowScope } from './data.js';
import type { WorkflowTransport } from './transport.js';
export declare const REPLICA_MAX_BYTES: number;
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
    private fresh;
    private constructor();
    static open(store: WorkflowDataStore, transport: WorkflowTransport, now?: () => number): Promise<WorkflowReplica>;
    start(): void;
    discover(): void;
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
