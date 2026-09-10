/** Process-local frames must never consume durable Session sequence numbers. */
type Row = Record<string, any>;
/** Lossless compact runs stay native; only a portable visible prefix leaves. */
export declare function assistantAttemptPresentation(event: Row): Row | undefined;
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
