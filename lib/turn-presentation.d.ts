type Value = Record<string, any>;
type UsageFold = (events: readonly Value[]) => Value | undefined;
/** Resolve the running host's public contract, never another bundled DSH version.
 * Older hosts have no export: omit exact usage rather than inventing accounting. */
export declare function nativeTurnUsage(): Promise<UsageFold | undefined>;
/** Optional portable per-turn facet, attached to the final textual reply.
 * Read BEFORE transport compaction: retry usage and token timing need chunks.
 * Partial pages/running turns are intentionally not disclosed as complete. */
export declare function turnDetails(entries: readonly unknown[], usageFold?: UsageFold, firstTokens?: ReadonlyMap<number, number>): Value[];
export {};
