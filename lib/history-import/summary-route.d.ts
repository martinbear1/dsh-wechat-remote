type Row = Record<string, any>;
export interface SummaryRoute {
    provider: string;
    model: string;
}
/** Use the last model that actually answered, as native compaction does on
 * alpha.1. A rejected new route may not accept the existing conversation.
 * Read through the public observation API instead of another owner's private
 * projection. Imported provider labels describe archives, not runnable models.
 */
export declare function conversationSummaryRoute(ctx: Row, agent: Row, signal?: AbortSignal, pendingRoute?: Row): Promise<SummaryRoute | undefined>;
export {};
