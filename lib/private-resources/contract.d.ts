export declare const RESOURCE_MAX_BYTES: number;
export declare const RESOURCE_PROMPT_MAX_BYTES: number;
export interface ResourcePreset {
    schemaVersion: 1;
    kind: 'preset';
    resourceId: string;
    version: string;
    name: string;
    description: string;
    basePreset: string;
    systemPrompt: string;
}
export interface ResourceRelease {
    resourceId: string;
    version: string;
    sha256: string;
    bytes: number;
}
export declare class ResourceError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare const resourceError: (code: string, message: string) => ResourceError;
export declare const resourceSha256: (bytes: Uint8Array | string) => string;
export declare const resourceIdValid: (value: unknown) => value is string;
export declare function resourceVersionValid(value: unknown): value is string;
export declare function validateResourceRelease(value: ResourceRelease): ResourceRelease;
/** Strict data schema. No module names, executable expressions or tool scripts
 * can enter the native composition through this transport. Prompt text is data. */
export declare function parseResourcePreset(bytes: Uint8Array, expected?: ResourceRelease): ResourcePreset;
export declare const resourceKey: (value: Pick<ResourcePreset, "resourceId" | "version">) => string;
export declare const resourcePresetId: (value: Pick<ResourcePreset, "resourceId" | "version">) => string;
