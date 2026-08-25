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
    readonly capabilities: readonly AgentCapability[];
}
export declare const AGENT_CAPABILITIES: readonly AgentCapability[];
/** Installed DSH profile name without exposing its filesystem path. */
export declare function agentProfileScope(): string;
export declare function defaultAgentIdentityPath(): string;
/** DSH CLI version, not the plugin adapter version and not host.describe's protocol version. */
export declare function installedDshVersion(): string;
export declare function loadAgentDescriptor(): AgentDescriptor;
