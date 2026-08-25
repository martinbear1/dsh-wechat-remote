type ByteArray = Uint8Array<ArrayBufferLike>;
export interface DshTunnelAgentOptions {
    readonly send: (frame: ByteArray) => void | Promise<void>;
    readonly dshPort?: number;
    readonly maxStreams?: number;
}
export declare class DshTunnelAgent {
    private readonly sendCallback;
    private readonly dshPort;
    private readonly maxStreams;
    private readonly streams;
    private sendChain;
    private closed;
    constructor(options: DshTunnelAgentOptions);
    receive(rawFrame: ByteArray): void;
    close(): void;
    private open;
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
