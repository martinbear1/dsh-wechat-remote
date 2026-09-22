/** Bound host history work before allocating native pages or ZIP buffers.
 * A cancelled queued reader never starts. An active reader keeps its slot
 * until its actual work settles, even if a native provider ignores abort. */
export declare class HistoryReadBudget {
    private readonly concurrency;
    private readonly maxWaiting;
    private active;
    private readonly waiting;
    constructor(concurrency?: number, maxWaiting?: number);
    acquire(signal: AbortSignal): Promise<() => void>;
    private claim;
}
