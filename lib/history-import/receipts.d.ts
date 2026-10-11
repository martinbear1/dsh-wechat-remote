export type ImportState = 'pending' | 'succeeded' | 'uncertain' | 'failed';
export interface ImportReceipt {
    schema: 1;
    operationId: string;
    sessionId: string;
    workspaceId: string;
    presetId?: string;
    sourceHash: string;
    conversationId: string;
    branchId: string;
    state: ImportState;
    createdAt: number;
    ownerKey?: string;
    title?: string;
    message?: string;
}
export declare function operationIdentifier(value: unknown): string;
/** Only import intentions/receipts, never conversation bodies or host state.
 * A corrupt/incomplete intention is NOT permission to create the session again. */
export declare class ImportReceipts {
    private readonly directory;
    constructor(directory: string);
    private file;
    read(id: string): Promise<ImportReceipt | undefined>;
    claim(value: ImportReceipt): Promise<boolean>;
    save(value: ImportReceipt): Promise<void>;
}
