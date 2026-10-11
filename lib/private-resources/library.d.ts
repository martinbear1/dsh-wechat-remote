import { type ResourceRelease } from './contract.js';
import { type NativeResourceOptions, type ResourceHost } from './native.js';
export interface ResourceLibraryEntry extends ResourceRelease {
    presetId: string;
    name: string;
    description: string;
    basePreset: string;
    enabled: boolean;
    status: 'installed' | 'disabled' | 'unavailable';
    message?: string;
}
/** Offline local library. Account entitlements admit downloads outside this
 * class; they never revoke an already installed preset or stop an Agent. */
export declare class PrivateResourceLibrary {
    private readonly storage;
    private readonly native;
    private readonly entries;
    private problems;
    private tail;
    private started;
    private closed;
    private closing?;
    constructor(host: ResourceHost, directory: string, options?: NativeResourceOptions);
    private queue;
    start(): Promise<void>;
    list(): ResourceLibraryEntry[];
    issues(): string[];
    private activate;
    install(bytes: Uint8Array, expected: ResourceRelease): Promise<ResourceLibraryEntry>;
    setEnabled(resourceId: string, version: string, enabled: boolean): Promise<ResourceLibraryEntry>;
    close(): Promise<void>;
}
