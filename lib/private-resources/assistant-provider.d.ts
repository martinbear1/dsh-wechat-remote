import { type AssistantDefinition } from '../assistant-presets/definition.js';
import { type ResourcePreset } from './contract.js';
export interface ResourceAssistantDefinition {
    id: string;
    version: number;
    digest: string;
    definition: AssistantDefinition;
    presetId: string;
    source: 'resource';
}
export interface ResourceAssistantStatus extends ResourceAssistantDefinition {
    state: 'installed' | 'unknown';
    nativeState: 'installed' | 'disabled' | 'unknown';
    reason?: string;
}
export interface ResourceAssistantProvider {
    definitions(signal: AbortSignal): Promise<ResourceAssistantDefinition[]>;
    list(signal: AbortSignal, options?: {
        waitForReady?: boolean;
    }): Promise<ResourceAssistantStatus[]>;
}
export declare function resourceAssistantDefinition(resource: ResourcePreset): ResourceAssistantDefinition | undefined;
/** No native registry, network, profile edit or registration. Historic work
 * records remain readable while the resource component itself is disabled. */
export declare function readResourceAssistantDefinitions(host: {
    get(name: string): any;
}, signal: AbortSignal): Promise<ResourceAssistantDefinition[]>;
