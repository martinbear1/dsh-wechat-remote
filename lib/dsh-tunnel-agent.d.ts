import type { DshCompatibilityTransport } from './dsh-compatibility-api.js';
type ByteArray = Uint8Array<ArrayBufferLike>;
export interface DshTunnelAgentOptions {
    readonly send: (frame: ByteArray) => void | Promise<void>;
    readonly dshPort?: number;
    readonly maxStreams?: number;
    /** Authenticated in-process dispatch for post-0.1.2 DSH. */
    readonly compatibilityApi?: DshCompatibilityTransport;
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
}
export declare class DshTunnelAgent {
    private readonly sendCallback;
    private readonly dshPort;
    private readonly maxStreams;
    private readonly compatibilityApi?;
    private readonly issueLanCredential?;
    private readonly materializeAttachment?;
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
    private openCompatibilityEvents;
    private sendWebSocketMessage;
    private flushEventBatch;
    private data;
    private end;
    private forwardRemotePrompt;
    private cancel;
    private fail;
    private sendError;
    private queue;
    private resumeSources;
    private forwardCompatibilityHttp;
}
export {};
