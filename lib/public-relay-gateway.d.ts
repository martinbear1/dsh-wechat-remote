import type { DshCompatibilityTransport } from './dsh-compatibility-api.js';
import { PublicRelayAgent, type AgentStatus, type PublicRelayConfig } from './public-relay-agent.js';
import type { AgentCapability } from './agent-metadata.js';
import type { WechatAttachmentObjectDescriptor } from './attachment-service.js';
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
    readonly compatibilityApi?: DshCompatibilityTransport;
    readonly maxClients?: number;
    readonly maxStreamsPerClient?: number;
    readonly issueLanCredential?: (rotate?: boolean) => {
        readonly baseUrl: string;
        readonly token: string;
    };
    readonly onStatus?: (status: AgentStatus) => void;
    readonly fetchImpl?: typeof fetch;
    readonly identityPath?: string;
    readonly historyCachePath?: string;
    readonly onDiagnostic?: (level: 'info' | 'warn', message: string) => void;
}
export declare class PublicRelayGateway {
    readonly agent: PublicRelayAgent;
    private readonly clients;
    private readonly dshPort;
    private readonly compatibilityApi?;
    private readonly maxClients;
    private readonly maxStreamsPerClient;
    private readonly issueLanCredential?;
    private readonly objectClient;
    private readonly historySnapshots;
    private readonly pendingHistorySnapshots;
    private readonly attachmentObjects;
    private readonly pendingAttachmentObjects;
    constructor(config: PublicRelayConfig, options: PublicRelayGatewayOptions);
    start(): Promise<void>;
    stop(): void;
    snapshot(): AgentStatus;
    prepareHistorySnapshot(payloadJson: string): Promise<Record<string, unknown>>;
    uploadAttachmentObject(data: Uint8Array, metadata: {
        readonly attachmentId: string;
        readonly mediaType: string;
        readonly name?: string;
    }, signal?: AbortSignal): Promise<WechatAttachmentObjectDescriptor>;
    ensurePairingStatus(): Promise<AgentStatus>;
    private receive;
    private disconnect;
    private disconnectAll;
}
export default PublicRelayGateway;
