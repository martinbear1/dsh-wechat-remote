export declare function archiveHistoryJson(payloadJson: string): Uint8Array;
/** Runtime path: compression and checksum must not monopolize DSH's event loop. */
export declare function archiveHistoryJsonAsync(payloadJson: string, signal: AbortSignal): Promise<Uint8Array>;
export declare const HISTORY_ARCHIVE_ENTRY = "history.json";
