import type { Context } from '@deepseek-ai/cordis';
import type { WechatHistoryService } from './history-service.js';
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
}
export interface HistorySnapshotPrewarmerBindingOptions extends Omit<HistorySnapshotPrewarmerOptions, 'warm'> {
    readonly warm: (service: WechatHistoryService, sessionId: string, signal: AbortSignal) => Promise<'inline' | 'object'>;
}
/**
 * Own the prewarmer under Cordis' native service-injection lifecycle.
 *
 * A plugin child context must not read `ctx.wechatHistory` later from a socket
 * callback: Cordis deliberately rejects service properties outside an inject
 * scope. Capture the concrete service once inside `ctx.inject()` and let that
 * child fiber stop the observer whenever the service or parent plugin unloads.
 */
export declare function bindHistorySnapshotPrewarmer(ctx: Context, options: HistorySnapshotPrewarmerBindingOptions): import("@deepseek-ai/cordis").Fiber & PromiseLike<import("@deepseek-ai/cordis").Fiber>;
export declare class HistorySnapshotPrewarmer {
    private readonly dshPort;
    private readonly warmCallback;
    private readonly socketFactory;
    private readonly settleDelayMs;
    private readonly retryDelayMs;
    private readonly maxQueue;
    private readonly onDiagnostic?;
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
    private diagnostic;
}
export default HistorySnapshotPrewarmer;
