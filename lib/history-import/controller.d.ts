import { type HistorySource } from './source.js';
import { ImportReceipts } from './receipts.js';
import { type NativeImportRequest, type NativeImportIdentity, type NativeImportInspection } from './native.js';
import type { FeatureAuthorization, FeatureGrant } from '../feature-access.js';
import { type EncryptedCloudObjectDescriptor } from '../object-crypto.js';
type Row = Record<string, any>;
export interface ImportPorts {
    capabilities(): Promise<{
        supported: boolean;
        reason?: string;
        enabled?: boolean;
        access?: FeatureGrant;
    }>;
    authorize(signal: AbortSignal): Promise<FeatureAuthorization>;
    owner(signal: AbortSignal): Promise<string | undefined>;
    parse(data: Buffer, signal: AbortSignal): Promise<{
        source: HistorySource;
        bytes: number;
    }>;
    share(url: unknown, signal: AbortSignal): Promise<Buffer>;
    loadObject?(descriptor: EncryptedCloudObjectDescriptor, signal: AbortSignal): Promise<Uint8Array>;
    commit(request: NativeImportRequest, signal: AbortSignal, beforeCreate: () => void): Promise<unknown>;
    inspect(request: NativeImportIdentity, signal: AbortSignal): Promise<NativeImportInspection>;
    receipts: ImportReceipts;
    now?: () => number;
}
export declare function importError(error: unknown): {
    code: string;
    message: string;
};
/** Entirely demand-driven. Constructing this controller never reads native
 * sessions, starts a timer, connects to the web, or writes any file. */
export declare class HistoryImportController {
    private readonly ports;
    private readonly sources;
    private readonly previews;
    private readonly uploads;
    private readonly jobs;
    private readonly lifetime;
    private preparing;
    private readingBytes;
    private claiming;
    private inspection;
    private expiryTimer;
    constructor(ports: ImportPorts);
    private now;
    dispose(): void;
    private expireLater;
    private prune;
    private usage;
    private source;
    private catalog;
    private prepare;
    private preview;
    private receiptView;
    private sameIntent;
    private status;
    private commit;
    private run;
    control(action: string, input: unknown, signal: AbortSignal): Promise<Row>;
}
export {};
