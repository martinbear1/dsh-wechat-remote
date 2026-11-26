import { type HistorySource, type HistoryConversation } from './source.js';
export declare function normalizeV3Conversation(value: unknown, expectedId: string): HistoryConversation;
/** Catalog only for v3: don't retain every conversation or image in RAM. */
export declare function parseArchiveCatalog(file: string | Buffer): Promise<{
    source: HistorySource;
    bytes: number;
}>;
export declare function readArchiveConversation(file: string, id: string): Promise<HistoryConversation>;
export declare function readArchiveImage(file: string, entry: string): Promise<Buffer>;
