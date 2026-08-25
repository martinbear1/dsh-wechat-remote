export interface PublicRelayConfig {
    readonly enabled: boolean;
    readonly relayOrigin: string;
}
export interface AgentIdentity {
    readonly nodeId: string;
    readonly publicKeyPem: string;
    readonly privateKeyPem: string;
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
}
export interface RelayClientFrame {
    readonly clientId: string;
    readonly payload: Buffer;
    reply(payload: Uint8Array): void;
}
export interface PublicRelayAgentOptions {
    readonly agentVersion: string;
    readonly displayName?: string;
    readonly onFrame: (frame: RelayClientFrame) => void | Promise<void>;
    readonly onStatus?: (status: AgentStatus) => void;
    readonly fetchImpl?: typeof fetch;
}
export declare function agentNodeIdForPublicKey(publicKeyPem: string): string;
export declare function loadPublicRelayConfig(configPath?: string): PublicRelayConfig | null;
export declare function loadOrCreateAgentIdentity(identityPath?: string): AgentIdentity;
export declare class PublicRelayAgent {
    readonly config: PublicRelayConfig;
    readonly identity: AgentIdentity;
    readonly options: PublicRelayAgentOptions;
    readonly fetchImpl: typeof fetch;
    private socket;
    private stopped;
    private reconnectAttempt;
    private reconnectTimer;
    private status;
    constructor(config: PublicRelayConfig, options: PublicRelayAgentOptions);
    snapshot(): AgentStatus;
    start(): Promise<void>;
    stop(): void;
    private enrollAndConnect;
    private connect;
    private scheduleReconnect;
    private update;
}
export declare function publicPairingPayload(status: AgentStatus): string | null;
