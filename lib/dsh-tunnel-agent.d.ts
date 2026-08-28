type ByteArray = Uint8Array<ArrayBufferLike>;
export interface DshTunnelAgentOptions {
    readonly send: (frame: ByteArray) => void | Promise<void>;
    readonly dshPort?: number;
    readonly maxStreams?: number;
    /**
     * Public-E2EE-only route bootstrap. It is handled inside this virtual tunnel
     * and is never forwarded to DSH/WebUI or exposed on the LAN HTTP door.
     */
    readonly issueLanCredential?: (rotate?: boolean) => {
        readonly baseUrl: string;
        readonly token: string;
    };
    readonly materializeAttachment?: (descriptor: unknown, signal: AbortSignal) => Promise<{
        readonly descriptor: {
            readonly mediaType: string;
            readonly name?: string;
        };
        readonly data: ByteArray;
    }>;
    readonly fetchDsh?: (request: {
        readonly path: string;
        readonly method: string;
        readonly headers?: Readonly<Record<string, string>>;
        readonly body?: Uint8Array;
        readonly signal?: AbortSignal;
    }) => Promise<Response>;
    readonly openDshEvents?: (path: string, signal: AbortSignal) => AsyncIterable<Uint8Array>;
}
export declare class DshTunnelAgent {
    private readonly sendCallback;
    private readonly dshPort;
    private readonly maxStreams;
    private readonly issueLanCredential?;
    private readonly materializeAttachment?;
    private readonly fetchDsh?;
    private readonly openDshEvents?;
    private readonly streams;
    private sendChain;
    private pendingSendBytes;
    private closed;
    constructor(options: DshTunnelAgentOptions);
    receive(rawFrame: ByteArray): void;
    close(): void;
    private open;
    private openLanCredential;
    private openHttp;
    private openWebSocket;
    private sendWebSocketMessage;
    private flushEventBatch;
    private data;
    private end;
    private forwardAdapterHttp;
    private forwardRemotePrompt;
    private cancel;
    private fail;
    private sendError;
    private queue;
    private resumeSources;
}
export {};
