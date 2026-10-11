import { type NativePresetCodec } from '../assistant-presets/native-adapter.js';
import { type ResourcePreset } from './contract.js';
export interface ResourceHost {
    get(name: string): any;
}
export interface NativeResourceOptions {
    codec?: NativePresetCodec;
    promptModule?: string;
}
/** Trusted shipped helper, not cloud code. Native interpolation is single-pass:
 * variable values containing {{...}} remain literal rather than being evaluated. */
export default class ResourcePromptData {
    static inject: string[];
    constructor(ctx: any, config: {
        text: string;
    });
}
export declare class NativeResourceRegistry {
    private readonly host;
    private readonly options;
    private readonly owned;
    private readonly lifetime;
    private closing?;
    constructor(host: ResourceHost, options?: NativeResourceOptions);
    /** Native diagnostics can await the global Loader, including our own unload.
     * Stop waiting when this owner closes; never put that wait back on disposal.
     * A native registration may finish later and still needs its own disposer. */
    private wait;
    private registry;
    register(resource: ResourcePreset): Promise<void>;
    close(): Promise<void>;
    unregister(resource: Pick<ResourcePreset, 'resourceId' | 'version'>): Promise<void>;
}
