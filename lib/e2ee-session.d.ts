export interface AgentE2EEOptions {
    readonly nodeId: string;
    readonly identityPrivateKeyPem: string;
    readonly randomSecret?: Uint8Array;
    readonly randomPrefix?: Uint8Array;
}
export interface E2EEResult {
    readonly outbound?: readonly Uint8Array[];
    readonly ready?: boolean;
    readonly data?: Uint8Array;
}
export declare class AgentE2EESession {
    private readonly nodeId;
    private readonly identityPrivateKeyPem;
    private readonly keyPair;
    private readonly sendPrefix;
    private receivePrefix;
    private txKey;
    private rxKey;
    private transcript;
    private state;
    private txCounter;
    private rxCounter;
    constructor(options: AgentE2EEOptions);
    receive(rawPacket: Uint8Array): E2EEResult;
    seal(data: Uint8Array): Uint8Array;
    private receiveClientHello;
    private sealClear;
    private openPacket;
}
