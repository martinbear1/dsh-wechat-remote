import { type ResourcePreset } from './contract.js';
/** Only shipped local code can supply native runtime capabilities. A resource
 * supplies literal authored prompts, never executable modules or templates. */
export declare function nativeChatCompactionModule(): string;
/** No standalone preset or base identity: the resource library owns the whole
 * composition and its lifecycle, exactly as it owns every delivered preset. */
export declare function resourceChatComposition(resource: Extract<ResourcePreset, {
    schemaVersion: 3;
}>, modules: {
    prompt: string;
    compaction: string;
}, promptVariable: string): ({
    id: string;
    name: string;
    config: {
        prefix: string;
        suffix: string;
        complete: boolean;
        text?: undefined;
        fetch?: undefined;
        searchTimeoutMs?: undefined;
    };
    group?: undefined;
    isolate?: undefined;
} | {
    id: string;
    name: string;
    config: {
        text: string;
        prefix?: undefined;
        suffix?: undefined;
        complete?: undefined;
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
        text?: undefined;
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
    config: ({
        id: string;
        name: string;
        config: {
            instruction: string;
        };
    } | {
        id: string;
        name: string;
        config?: undefined;
    })[];
})[];
