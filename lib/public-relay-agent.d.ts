import { type AgentCapability } from './agent-metadata.js';
import type { HostPlatformDescriptor } from './host-platform.js';
export declare const DEFAULT_PUBLIC_RELAY_ORIGIN = "https://relay.xyxfood.xyz";
export interface PublicRelayConfig {
    readonly enabled: boolean;
    readonly relayOrigin: string;
}
export interface AgentIdentity {
    readonly nodeId: string;
    readonly publicKeyPem: string;
    readonly privateKeyPem: string;
}
export type RemoteAccessState = 'active' | 'pending' | 'expired' | 'suspended' | 'not_entitled';
export interface RemoteAccessStatus {
    readonly status: RemoteAccessState;
    readonly validUntil?: number | null;
}
export interface AgentStatus {
    readonly enabled: boolean;
    readonly state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline';
    readonly nodeId?: string;
    readonly identityPublicKey?: string;
    readonly relayOrigin?: string;
    readonly pairingTicket?: string;
    readonly pairingExpiresAt?: number;
    readonly lastError?: string;
    readonly hostId?: string;
    readonly agentInstanceId?: string;
    readonly hostName?: string;
    readonly agentKind?: string;
    readonly agentName?: string;
    readonly agentVersion?: string;
    readonly adapterVersion?: string;
    readonly hostPlatform?: HostPlatformDescriptor;
    readonly capabilities?: readonly AgentCapability[];
    readonly remoteAccess?: RemoteAccessStatus;
}
export interface RelayClientFrame {
    readonly clientId: string;
    readonly payload: Buffer;
    reply(payload: Uint8Array): Promise<void>;
}
export interface PublicRelayAgentOptions {
    readonly agentVersion: string;
    readonly adapterVersion?: string;
    readonly hostId?: string;
    readonly agentInstanceId?: string;
    readonly agentKind?: string;
    readonly agentName?: string;
    readonly hostName?: string;
    readonly hostPlatform?: HostPlatformDescriptor;
    readonly capabilities?: readonly AgentCapability[];
    readonly displayName?: string;
    readonly onFrame: (frame: RelayClientFrame) => void | Promise<void>;
    readonly onStatus?: (status: AgentStatus) => void;
    readonly onClientDisconnect?: (clientId: string) => void;
    readonly onClientError?: (clientId: string, error: unknown) => void;
    /** The physical Agent socket was lost; all relay client ids are now stale. */
    readonly onTransportDisconnect?: () => void;
    readonly fetchImpl?: typeof fetch;
    /** Test/portable profile override; production defaults to ~/.dsh. */
    readonly identityPath?: string;
    /** Transport-test timing overrides; no client protocol or user settings change. */
    readonly transportTiming?: {
        readonly pingIntervalMs?: number;
        readonly pongTimeoutMs?: number;
        readonly handshakeTimeoutMs?: number;
    };
}
export declare function agentNodeIdForPublicKey(publicKeyPem: string): string;
export declare function loadPublicRelayConfig(configPath?: string): PublicRelayConfig | null;
export declare function loadOrCreateAgentIdentity(identityPath?: string): AgentIdentity;
export declare class PublicRelayAgent {
    readonly config: PublicRelayConfig;
    identity: AgentIdentity;
    readonly options: PublicRelayAgentOptions;
    readonly fetchImpl: typeof fetch;
    private readonly identityPath;
    private socket;
    private stopped;
    private reconnectAttempt;
    private reconnectTimer;
    private clearHeartbeat;
    private lifecycleRevision;
    private enrollment;
    private status;
    constructor(config: PublicRelayConfig, options: PublicRelayAgentOptions);
    snapshot(): AgentStatus;
    start(): Promise<void>;
    /** Ensure a desktop pairing surface never serves an expired cloud ticket. */
    ensurePairingTicket(minValidityMs?: number): Promise<AgentStatus>;
    stop(): void;
    private enrollAndConnect;
    private enrollWithIdentityRecovery;
    private rotateRevokedIdentity;
    private enroll;
    private connect;
    private scheduleReconnect;
    private dispatchFrame;
    private sendRouted;
    private update;
}
export declare function publicPairingPayload(status: AgentStatus): string | null;
