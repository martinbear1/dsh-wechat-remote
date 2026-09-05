import { type HostPlatformDescriptor } from './host-platform.js';
export interface AgentCapability {
    readonly id: string;
    readonly version: number;
}
export interface AgentDescriptor {
    readonly schemaVersion: 1;
    readonly hostId: string;
    readonly agentInstanceId: string;
    readonly hostName: string;
    readonly agentKind: 'deepseek-harness';
    readonly agentName: 'DeepSeek Harness';
    readonly agentVersion: string;
    readonly hostPlatform: HostPlatformDescriptor;
    readonly capabilities: readonly AgentCapability[];
}
export declare const AGENT_CAPABILITIES: readonly AgentCapability[];
/** Installed DSH profile name without exposing its filesystem path. */
export declare function agentProfileScope(): string;
export declare function resolveAgentProfileScope(modulePath: string, argv: readonly string[], dshHome: string): string;
/**
 * Keep the historic web/default credential path so an upgrade never unpairs
 * existing users. Every additional DSH profile gets an isolated state file;
 * otherwise installing a test profile can silently rotate the production
 * profile's LAN token and WeChat binding.
 */
export declare function gateStatePathForProfile(profileScope: string, homeDirectory?: string, dshHome?: string): string;
export declare function defaultGateStatePath(): string;
export declare function defaultAgentIdentityPath(): string;
/** DSH CLI version, not the plugin adapter version and not host.describe's protocol version. */
export declare function installedDshVersion(): string;
export declare function loadAgentDescriptor(): AgentDescriptor;
