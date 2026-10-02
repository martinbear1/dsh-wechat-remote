import { type WorkflowDataStore } from './data.js';
export declare const WORKFLOW_LONG_TERM_BYTES: number;
export declare const WORKFLOW_ARCHIVE_MAX_RECORDS = 10000;
/** Bounded immutable originals, with a small atomic hot index. This is physical
 * archival, not deletion: load reconstructs the exact authoritative ledger so
 * CAS and submission dedupe remain unchanged. Unknown/running jobs stay hot.
 * A crash before index commit may leave an orphan; it still counts toward quota.
 * No original, tombstone or received attachment is automatically deleted. */
export declare class WorkflowArchiveStore implements WorkflowDataStore {
    private index;
    private root;
    private nodeId;
    private kind;
    private files;
    private maxBytes;
    private readonly verified;
    private constructor();
    static open(options: {
        index: WorkflowDataStore;
        root: string;
        nodeId: string;
        kind: 'analyses' | 'runs';
        maxBytes?: number;
    }): Promise<WorkflowArchiveStore>;
    private checkRoot;
    private read;
    load(): Promise<unknown>;
    save(value: unknown): Promise<void>;
}
