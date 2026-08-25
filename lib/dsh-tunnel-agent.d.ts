type ByteArray = Uint8Array<ArrayBufferLike>;
export interface DshTunnelAgentOptions {
    readonly send: (frame: ByteArray) => void | Promise<void>;
    readonly dshPort?: number;
    readonly maxStreams?: number;
    /**
     * Public-E2EE-only route bootstrap. It is handled inside this virtual tunnel
     * and is never forwarded to DSH/WebUI or exposed on the LAN HTTP door.
     */
    readonly issueLanCredential?: () => {
        readonly baseUrl: string;
        readonly token: string;
    };
}
export declare class DshTunnelAgent {
    private readonly sendCallback;
    private readonly dshPort;
    private readonly maxStreams;
    private readonly issueLanCredential?;
    private readonly streams;
    private sendChain;
    private closed;
    constructor(options: DshTunnelAgentOptions);
    receive(rawFrame: ByteArray): void;
    close(): void;
    private open;
    private openLanCredential;
    private openHttp;
    private openWebSocket;
    private data;
    private end;
    private cancel;
    private fail;
    private sendError;
    private queue;
}
export {};
