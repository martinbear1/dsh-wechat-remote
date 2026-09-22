/** Process-local frames must never consume durable Session sequence numbers. */
type Row = Record<string, any>;
/** Lossless compact runs stay native; only a portable visible prefix leaves. */
export declare function assistantAttemptPresentation(event: Row): Row | undefined;
/** The chat pane uses the settled message (or an interrupted attempt's visible
 * prefix), not the retained token-by-token stream. Derive that prefix before
 * removing the redundant samples. History and live delivery share this step;
 * native records, timing evidence and provider data on the host stay intact. */
export declare function assistantRecordPresentation<T extends Row>(entry: T): T;
/** First actual token's original timestamp, without expanding compact runs. */
export declare function firstCompactTokenTime(stream: unknown): number | undefined;
export declare class AssistantStreamCompatibility {
    private readonly emit;
    private revision;
    private attempt;
    private index;
    private blocks;
    constructor(emit: (event: Row) => void);
    private reset;
    private chunk;
    baseline(value?: Row): void;
    follow(frame: Row): void;
}
export {};
