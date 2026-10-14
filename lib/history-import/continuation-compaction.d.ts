/** Native BasicCompactionEngine extension: only the documented summarize hook
 * changes. Region selection, pricing, cancellation, checkpoints, retention,
 * overflow recovery and persistence remain owned by the installed DSH. */
type Row = Record<string, any>;
type NativeEngine = new (...args: any[]) => {
    ctx: Row;
    config: Row;
};
export declare const CONTINUATION_COMPACTION_INSTRUCTION: string;
/** Modules are supplied by the host, not bundled private copies. The factory
 * also allows contract tests without a live model or real session. */
export declare function createContinuationCompactionPlugin(native: {
    BasicCompactionEngine: NativeEngine;
}, llm: Row): {
    new (...args: any[]): {
        summarize(input: {
            messages: readonly Row[];
            tools?: readonly Row[];
        }, agent: Row, signal?: AbortSignal): Promise<{
            usage?: any;
            summary: Row[];
            rawOutput: Row[];
            llmStreamCall: true;
            provider: any;
            model: any;
            maxTokens: any;
        }>;
        ctx: Row;
        config: Row;
    };
};
export default function continuationCompaction(ctx: Row, config?: Row): Promise<void>;
export {};
