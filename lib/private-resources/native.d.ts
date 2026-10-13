import { type NativePresetCodec } from '../assistant-presets/native-adapter.js';
import { type AssistantDefinition } from '../assistant-presets/definition.js';
import { type ResourcePreset } from './contract.js';
export interface ResourceHost {
    get(name: string): any;
}
export interface NativeResourceOptions {
    codec?: NativePresetCodec;
    promptModule?: string;
    collaborationModule?: string;
}
/** Trusted shipped helper, not cloud code. Native interpolation is single-pass:
 * variable values containing {{...}} remain literal rather than being evaluated. */
export default class ResourcePromptData {
    static inject: string[];
    constructor(ctx: any, config: {
        text: string;
        assistant?: AssistantDefinition;
    });
}
export declare class NativeResourceRegistry {
    private readonly host;
    private readonly options;
    private readonly owned;
    private readonly expected;
    private readonly groups;
    private groupLifetime;
    private readonly lifetime;
    private closing?;
    constructor(host: ResourceHost, options?: NativeResourceOptions);
    /** Native diagnostics can await the global Loader, including our own unload.
     * Stop waiting when this owner closes; never put that wait back on disposal.
     * A native registration may finish later and still needs its own disposer. */
    private wait;
    private registry;
    groupAvailable(): boolean;
    private featureAccess;
    /** Cancel before queuing reconciliation: a native diagnostic can be waiting
     * for the very gate that is unloading. Ordinary resources never join it. */
    suspendGroups(): Promise<void>;
    register(resource: ResourcePreset): Promise<void>;
    groupReady(resource: ResourcePreset, signal: AbortSignal): Promise<boolean>;
    close(): Promise<void>;
    unregister(resource: Pick<ResourcePreset, 'resourceId' | 'version'>): Promise<void>;
}
