import { PublicRelayAgent, type AgentStatus, type PublicRelayConfig } from './public-relay-agent.js';
export interface PublicRelayGatewayOptions {
    readonly agentVersion: string;
    readonly displayName?: string;
    readonly dshPort?: number;
    readonly maxClients?: number;
    readonly maxStreamsPerClient?: number;
    readonly issueLanCredential?: () => {
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
    constructor(config: PublicRelayConfig, options: PublicRelayGatewayOptions);
    start(): Promise<void>;
    stop(): void;
    snapshot(): AgentStatus;
    ensurePairingStatus(): Promise<AgentStatus>;
    private receive;
    private disconnect;
    private disconnectAll;
}
export default PublicRelayGateway;
