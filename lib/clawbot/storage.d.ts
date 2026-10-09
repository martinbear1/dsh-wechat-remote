import type { ILinkCredentials, ILinkMedia, ILinkPreparedMedia } from './ilink-types.js';
import type { ClawbotSession } from './contracts.js';
export interface Receipt {
    id: string;
    userId: string;
    contextToken: string;
    input: string;
    media?: ILinkMedia[];
    target: ClawbotSession | null;
    revision: number;
    createdAt: number;
    state: 'pending' | 'running' | 'ready' | 'sending' | 'done' | 'uncertain';
    output?: string;
    parts?: (string | ILinkPreparedMedia)[];
    sentParts?: number;
    /** Legacy RC32 question notice; retired once on upgrade, never recreated. */
    parentId?: string;
}
export interface ClawbotData {
    version: 1;
    revision: number;
    enabled: boolean;
    credentials: ILinkCredentials | null;
    /** Entitlement owner only; never a Tencent credential or a phone claim. */
    accessBinding?: {
        nodeId: string;
        accountInstance: string;
    };
    /** Preserve the identity and pending ledger when Tencent rejects its token. */
    authExpired?: boolean;
    target: ClawbotSession | null;
    cursor: string;
    receipts: Receipt[];
}
export interface ClawbotStorage {
    read(): ClawbotData;
    write(data: ClawbotData): void;
    close(): void;
}
export declare const emptyClawbotData: () => ClawbotData;
export declare function validateClawbotData(data: ClawbotData): void;
/** One owner per native profile. Exact generation filenames make crashed-owner
 * recovery safe against two contenders; no host process is stopped. */
export declare class FileClawbotStorage implements ClawbotStorage {
    private readonly file;
    private readonly lock;
    private readonly owner;
    private closed;
    constructor(directory: string);
    read(): ClawbotData;
    write(data: ClawbotData): void;
    close(): void;
}
