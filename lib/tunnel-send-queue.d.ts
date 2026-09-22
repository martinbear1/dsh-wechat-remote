/** Bounded, fair scheduling BEFORE encryption. Frames within a stream stay FIFO. */
type Bytes = Uint8Array<ArrayBufferLike>;
type Priority = 'interactive' | 'bulk';
export declare class TunnelSendQueue {
    private readonly options;
    private readonly streams;
    private readonly waiters;
    private pumping;
    private closed;
    private queuedBytes;
    private inFlightBytes;
    private interactiveBurst;
    private lastStream;
    constructor(options: {
        send: (frame: Bytes) => void | Promise<void>;
        onFailure: () => void;
        onOverflow: (streamId: number) => void;
        onDrain?: () => void;
        maxBytes?: number;
        maxStreamBytes?: number;
        highWaterBytes?: number;
    });
    get bytes(): number;
    get highWaterBytes(): number;
    enqueue(id: number, priority: Priority, frame: Bytes, terminal?: boolean): void;
    discard(id: number): void;
    close(): void;
    waitForCapacity(signal: AbortSignal): Promise<void>;
    private drained;
    private next;
    private pump;
}
export {};
