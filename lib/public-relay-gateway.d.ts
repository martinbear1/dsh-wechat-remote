import { PublicRelayAgent, type AgentStatus, type PublicRelayConfig } from './public-relay-agent.js';
import type { AgentCapability } from './agent-metadata.js';
import type { HostPlatformDescriptor } from './host-platform.js';
export interface PublicRelayGatewayOptions {
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
    readonly dshPort?: number;
    readonly maxClients?: number;
    readonly maxStreamsPerClient?: number;
    readonly issueLanCredential?: (rotate?: boolean) => {
        readonly baseUrl: string;
        readonly token: string;
    };
    readonly onStatus?: (status: AgentStatus) => void;
    readonly fetchImpl?: typeof fetch;
    readonly identityPath?: string;
}
export declare class PublicRelayGateway {
    readonly agent: PublicRelayAgent;
    private readonly clients;
    private readonly dshPort;
    private readonly maxClients;
    private readonly maxStreamsPerClient;
    private readonly issueLanCredential?;
    private readonly objectClient;
    private readonly historySnapshots;
    private readonly pendingHistorySnapshots;
    constructor(config: PublicRelayConfig, options: PublicRelayGatewayOptions);
    start(): Promise<void>;
    stop(): void;
    snapshot(): AgentStatus;
    uploadHistorySnapshot(payloadJson: string): Promise<Record<string, unknown>>;
    ensurePairingStatus(): Promise<AgentStatus>;
    private receive;
    private disconnect;
    private disconnectAll;
}
export default PublicRelayGateway;
