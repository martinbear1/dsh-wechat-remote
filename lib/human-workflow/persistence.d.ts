import { type WorkflowDataStore } from './data.js';
/** Pass a file inside the actual node/profile directory. The registry also
 * checks the persisted node id so a misconfigured path cannot borrow another node. */
export declare class WorkflowFileStore implements WorkflowDataStore {
    private readonly file;
    private readonly maxBytes;
    constructor(file: string, maxBytes?: number);
    load(): Promise<unknown>;
    save(value: unknown): Promise<void>;
}
