import { type WorkflowDataStore } from './data.js';
export interface ReceiverPublicKey {
    schema: 'human.receiver.key.v1';
    keyId: string;
    algorithm: 'nacl-box-v1';
    publicKey: string;
}
export declare class ReceiverKeyFileStore implements WorkflowDataStore {
    private readonly filename;
    private readonly store;
    constructor(filename: string);
    private guard;
    load(): Promise<unknown>;
    save(value: unknown): Promise<void>;
}
/** Store inside the real profile, outside the package. Upgrade/uninstall must
 * preserve this file and received objects; no silent reset on corrupt keys. */
export declare class ReceiverKeyring {
    private readonly state;
    readonly nodeId: string;
    private constructor();
    static open(store: WorkflowDataStore, nodeId: string): Promise<ReceiverKeyring>;
    ensure(bindingKey: string, signal: AbortSignal): Promise<ReceiverPublicKey>;
    secret(keyId: string, bindingKey: string): Uint8Array;
    close(): Promise<void>;
}
