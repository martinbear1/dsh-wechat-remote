type Row = Record<string, any>;
type NativeEngine = new (...args: any[]) => {
    ctx: Row;
    config: Row;
};
/** Separate authored data from native configuration. Native defaults and
 * exact-route model policies still go through the installed engine's strict
 * validator; no unknown resource field is silently accepted by this wrapper. */
export declare function chatCompactionConfig(value: unknown): {
    instruction: string;
    native: Row;
};
/** Modules are supplied by the host, not bundled private copies. The factory
 * also allows contract tests without a live model or real session. */
export declare function createChatCompactionPlugin(native: {
    BasicCompactionEngine: NativeEngine;
}, llm: Row, instruction: string): {
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
export default function chatCompaction(ctx: Row, config: unknown): Promise<void>;
export {};
