import { type DetailPart } from './history-record-presentation.js';
type Row = Record<string, any>;
export declare const HISTORY_RECORD_BYTES: number;
export declare const HISTORY_DETAIL_CHUNK_BYTES: number;
export interface HistoryDetailReference {
    readonly schema: 'agent.history-detail.v1';
    readonly reference: string;
    readonly seq: number;
    readonly bytes: number;
    readonly format: 'parts';
}
export interface HistoryDetailRequest {
    readonly sessionId: string;
    readonly reference: string;
    readonly part?: number;
    readonly offset?: number;
}
export interface HistoryDetailPage extends DetailPart {
    readonly schema: 'agent.history-detail.v1';
    readonly seq: number;
    readonly part: number;
    readonly partCount: number;
    readonly offset: number;
    readonly nextOffset: number;
    readonly bytes: number;
    readonly eof: boolean;
}
/** Node-local readonly references. Session, sequence, matching call and the
 * entire presentation snapshot are pinned. No arbitrary path or native call. */
export declare class HistoryRecords {
    private readonly secret;
    private readonly cache;
    private cachedBytes;
    clear(): void;
    private remember;
    present(sessionId: string, entry: Row, displayed?: Row, call?: Row): Row;
    read(request: HistoryDetailRequest, load: (seq: number) => Promise<Row | undefined>, signal: AbortSignal): Promise<HistoryDetailPage>;
}
export {};
