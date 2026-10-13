import { type ResourceRelease } from './contract.js';
import { type ResourceAssistantDefinition, type ResourceAssistantStatus } from './assistant-provider.js';
export type { ResourceAssistantDefinition, ResourceAssistantStatus, ResourceAssistantProvider } from './assistant-provider.js';
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
/** Offline local library. Delivery grants admit downloads outside this class;
 * installed data is retained. Explicit group capabilities separately follow
 * the current feature authority and never grant access merely by installation. */
export declare class PrivateResourceLibrary {
    private readonly storage;
    private readonly native;
    private readonly entries;
    private readonly records;
    private prepared?;
    private groupSuspended;
    private problems;
    private tail;
    private started;
    private closed;
    private closing?;
    constructor(host: ResourceHost, directory: string, options?: NativeResourceOptions);
    private queue;
    /** Only bounded local files are read here. Business history validation may
     * await this phase while HumanTools and the native Loader are still starting. */
    prepare(): Promise<void>;
    start(): Promise<void>;
    list(): ResourceLibraryEntry[];
    issues(): string[];
    private entry;
    private activate;
    definitions(signal: AbortSignal): Promise<ResourceAssistantDefinition[]>;
    assistantStatus(signal: AbortSignal, options?: {
        waitForReady?: boolean;
    }): Promise<ResourceAssistantStatus[]>;
    /** Called by the optional feature-service lifetime, not by catalog queries.
     * It cannot change saved user choices or reactivate a disabled resource. */
    setGroupAvailable(available: boolean): Promise<void>;
    install(bytes: Uint8Array, expected: ResourceRelease): Promise<ResourceLibraryEntry>;
    setEnabled(resourceId: string, version: string, enabled: boolean): Promise<ResourceLibraryEntry>;
    close(): Promise<void>;
}
