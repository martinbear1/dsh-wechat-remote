import { HISTORY_ARCHIVE_ENTRY } from './history-archive.js';
declare const ENCRYPTION_SCHEME = "xsalsa20-poly1305-chunks-v1";
declare const ENCRYPTION_CHUNK_BYTES: number;
export interface HistorySnapshotDescriptor extends Record<string, unknown> {
    readonly v: 1;
    readonly scheme: typeof ENCRYPTION_SCHEME;
    readonly objectId: string;
    readonly key: string;
    readonly noncePrefix: string;
    readonly plainBytes: number;
    readonly cipherBytes: number;
    readonly chunkBytes: typeof ENCRYPTION_CHUNK_BYTES;
    readonly contentKind: 'history-json';
    readonly contentEncoding: 'zip';
    readonly archiveEntry: typeof HISTORY_ARCHIVE_ENTRY;
    readonly originalBytes: number;
    readonly expiresAt: number;
}
export interface HistorySnapshotCacheOptions {
    readonly file?: string;
    readonly now?: () => number;
    readonly onDiagnostic?: (level: 'info' | 'warn', message: string) => void;
}
export declare class HistorySnapshotCache {
    private readonly entries;
    private readonly file?;
    private readonly now;
    private readonly onDiagnostic?;
    private persistenceEnabled;
    constructor(options?: HistorySnapshotCacheOptions);
    get(digest: string): HistorySnapshotDescriptor | undefined;
    set(digest: string, rawDescriptor: unknown): HistorySnapshotDescriptor;
    get size(): number;
    private restore;
    private prune;
    private persist;
}
export declare function validateHistorySnapshotDescriptor(raw: unknown, now?: number): HistorySnapshotDescriptor;
export default HistorySnapshotCache;
