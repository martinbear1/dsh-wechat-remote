export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
    [key: string]: JsonValue;
}
export interface HistoryFile {
    id?: string;
    name: string;
    size?: number;
    isImage?: boolean;
    metadata: JsonObject;
    exportPath?: string;
    imageRef?: JsonObject;
}
export interface HistoryFragment {
    type: string;
    content?: string;
    files?: HistoryFile[];
    data: JsonObject;
}
export interface HistoryMessage {
    id: string;
    parentId: string | null;
    role: 'user' | 'assistant' | 'unknown';
    text: string;
    reasoning: string;
    model?: string;
    createdAt?: string;
    fragments: HistoryFragment[];
    metadata: JsonObject;
    warnings: string[];
    importFailure?: string;
}
export interface HistoryConversation {
    id: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
    modelType?: string;
    messages: HistoryMessage[];
    leafIds: string[];
    warnings: string[];
    metadata?: JsonObject;
    publishedOrder?: {
        schema: 1;
        missingParents: number;
        nonAdjacentParents: number;
        unavailableParents: number;
        roots: number;
    };
    archiveEntry?: string;
    catalogMessages?: number;
    currentMessageId?: string;
    exportFormatVersion?: 3;
}
export interface HistorySource {
    kind: 'share' | 'export';
    sourceHash: string;
    conversations: HistoryConversation[];
}
export declare class HistorySourceError extends Error {
    readonly code: string;
    readonly actualBytes?: number | undefined;
    readonly limitBytes?: number | undefined;
    diagnostic?: {
        messagePosition: number;
        messageCount: number;
        field: 'message' | 'message_id' | 'parent_id' | 'fragments';
    };
    constructor(code: string, actualBytes?: number | undefined, limitBytes?: number | undefined);
}
export declare function validateNesting(value: unknown): void;
export declare function normalizeHistoryMessage(value: Record<string, unknown>, id: string, parentId: string | null, share: boolean): HistoryMessage;
export declare function validateHistoryGraph(conversation: HistoryConversation): HistoryConversation;
/** Pure source normalization. No networking, credentials, model calls, filesystem writes or host mutation. */
export declare function parseHistorySource(input: Buffer | string | unknown, sourceKind?: 'share', expandedArchive?: boolean): Promise<HistorySource>;
/** Count one selected path, independent of export mapping order. Each user
 * message starts a turn; a leading assistant-only group is retained as a turn.
 * Unknown roles have no trustworthy count and must never be guessed from size. */
export declare function countHistoryTurns(messages: readonly HistoryMessage[]): number | undefined;
/** Preserve the branch graph in the catalog; require an explicit leaf whenever alternatives exist. */
export declare function selectHistoryBranch(conversation: HistoryConversation, leafId?: string): HistoryConversation;
