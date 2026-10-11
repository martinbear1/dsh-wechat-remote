import { type HistorySource } from './source.js';
import { ImportReceipts } from './receipts.js';
import { type NativeImportRequest, type NativeImportIdentity, type NativeImportInspection } from './native.js';
type Row = Record<string, any>;
export interface ImportPorts {
    capabilities(): Promise<{
        supported: boolean;
        reason?: string;
    }>;
    parse(data: Buffer, signal: AbortSignal): Promise<{
        source: HistorySource;
        bytes: number;
    }>;
    share(url: unknown, signal: AbortSignal): Promise<Buffer>;
    commit(request: NativeImportRequest, signal: AbortSignal): Promise<unknown>;
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
