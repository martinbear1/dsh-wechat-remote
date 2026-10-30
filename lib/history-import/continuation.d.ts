/** Imported Chat sessions only. Use the host's public hooks and compactRegion;
 * never write headers, usage, summary events, or replacement surfaces here. */
type Row = Record<string, any>;
/** Set only while a bounded native transaction is running. Other Chat sessions
 * retain their existing summary request and all native configuration defaults. */
export declare function installImportedContinuation(ctx: Row, engine: Row, instruction: string): WeakMap<object, {
    maxTokens: number;
    instruction: string;
    target: Row;
}>;
export {};
