/** Read only the current live session through the host's public observation API.
 * Never open another chat, cold persistence, or a cross-session search index. */
type Row = Record<string, any>;
export type ChatObservation = Row & {
    [Symbol.dispose](): void;
};
export declare function observeChatSession(ctx: Row, agent: Row, signal?: AbortSignal): Promise<ChatObservation>;
export declare function importedSession(ctx: Row, agent: Row, signal?: AbortSignal): Promise<boolean>;
export {};
