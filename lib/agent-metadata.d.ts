import { type HostPlatformDescriptor } from './host-platform.js';
import { type HostContext } from './dsh-host-context.js';
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
    readonly agentName: string;
    readonly agentVersion: string;
    readonly hostPlatform: HostPlatformDescriptor;
    readonly capabilities: readonly AgentCapability[];
}
export declare const AGENT_CAPABILITIES: readonly AgentCapability[];
/** Installed DSH profile name without exposing its filesystem path. */
export declare function agentDshHome(ctx?: HostContext): string;
export declare function agentProfileScope(ctx?: HostContext): string;
export declare function resolveAgentProfileScope(modulePath: string, argv: readonly string[], dshHome: string): string;
/**
 * Every node has one scoped authority. prepareNodeStorage migrates the Web
 * legacy files before runtime use; web/default are the historical same node.
 */
export declare function gateStatePathForProfile(profileScope: string, homeDirectory?: string, dshHome?: string): string;
export declare function defaultGateStatePath(ctx?: HostContext): string;
/** Display metadata only: never change nodeId or deduplicate by this label. */
export declare function agentDisplayName(ctx?: HostContext): string;
export declare function defaultAgentIdentityPath(ctx?: HostContext): string;
export declare function defaultRelayConfigPath(ctx?: HostContext): string;
/** DSH CLI version, not the plugin adapter version and not host.describe's protocol version. */
export declare function installedDshVersion(ctx?: HostContext): string;
export declare function loadAgentDescriptor(ctx?: HostContext): AgentDescriptor;
