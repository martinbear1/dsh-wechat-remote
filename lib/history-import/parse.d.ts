import type { HistorySource } from './source.js';
export declare function parseImportSource(data: Buffer, signal: AbortSignal): Promise<{
    source: HistorySource;
    bytes: number;
}>;
