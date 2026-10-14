import { Service } from '@deepseek-ai/cordis';
export declare const HISTORY_CONTINUATION_ID = "harness-web-continuation";
/** Task-neutral guidance, not a reconstruction of the consumer website's
 * undisclosed system prompt. Source messages retain their original roles. */
export declare const CONTINUATION_PERSONA: string;
/** Standalone native composition: no inheritance from coding presets, no
 * group tools, filesystem instructions or modification of the host default. */
export declare function historyContinuationDefinition(options?: {
    compactionModule?: string;
}): {
    id: string;
    name: string;
    description: string;
    order: number;
    plugins: ({
        id: string;
        name: string;
        config: {
            prefix: string;
            suffix: string;
            complete: boolean;
            fetch?: undefined;
            searchTimeoutMs?: undefined;
        };
        group?: undefined;
        isolate?: undefined;
    } | {
        id: string;
        name: string;
        config: {
            fetch: boolean;
            searchTimeoutMs: number;
            prefix?: undefined;
            suffix?: undefined;
            complete?: undefined;
        };
        group?: undefined;
        isolate?: undefined;
    } | {
        id: string;
        name: string;
        group: boolean;
        isolate: {
            compaction: boolean;
            toolResultPruner: boolean;
        };
        config: {
            id: string;
            name: string;
        }[];
    })[];
};
/** Native registry owns activation/diagnostics and cold-session composition.
 * This child belongs to the import service and unregisters on parent unload. */
export default class HistoryContinuationPreset {
    private readonly ctx;
    static inject: string[];
    constructor(ctx: {
        get(name: string): any;
    });
    [Service.init](): AsyncGenerator<any, void, unknown>;
}
