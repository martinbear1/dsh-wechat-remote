import type { HistorySource, HistoryConversation } from './source.js';
export declare function parseImportSource(data: Buffer, signal: AbortSignal, sourceKind?: 'share'): Promise<{
    source: HistorySource;
    bytes: number;
}>;
export declare function parseImportArchive(file: string, signal: AbortSignal): Promise<{
    source: HistorySource;
    bytes: number;
}>;
export declare function parseImportConversation(file: string, id: string, signal: AbortSignal): Promise<HistoryConversation>;
export declare function parseImportImage(file: string, entry: string, signal: AbortSignal): Promise<Uint8Array>;
