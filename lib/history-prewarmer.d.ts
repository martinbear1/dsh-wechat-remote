interface SocketLike {
    on(event: string, listener: (...args: any[]) => void): this;
    close(): void;
    terminate?(): void;
}
export interface HistorySnapshotPrewarmerOptions {
    readonly dshPort?: number;
    readonly warm: (sessionId: string, signal: AbortSignal) => Promise<'inline' | 'object'>;
    readonly socketFactory?: (url: string) => SocketLike;
    readonly settleDelayMs?: number;
    readonly retryDelayMs?: number;
    readonly maxQueue?: number;
    readonly onDiagnostic?: (level: 'info' | 'warn', message: string) => void;
    readonly onTrackingState?: (ready: boolean) => void;
    readonly onSessionChanged?: (sessionId: string) => void;
}
export declare class HistorySnapshotPrewarmer {
    private readonly dshPort;
    private readonly warmCallback;
    private readonly socketFactory;
    private readonly settleDelayMs;
    private readonly retryDelayMs;
    private readonly maxQueue;
    private readonly onDiagnostic?;
    private readonly onTrackingState?;
    private readonly onSessionChanged?;
    private readonly running;
    private readonly settleTimers;
    private readonly queued;
    private readonly rerun;
    private readonly queue;
    private socket;
    private reconnectTimer;
    private reconnectDelayMs;
    private active;
    private stopped;
    private tracking;
    constructor(options: HistorySnapshotPrewarmerOptions);
    start(): void;
    stop(): void;
    private connect;
    private scheduleReconnect;
    private observe;
    private settle;
    private enqueue;
    private pump;
    private forget;
    private setTracking;
}
export default HistorySnapshotPrewarmer;
