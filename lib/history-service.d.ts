import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
interface HistoryEntry {
    readonly event?: {
        readonly type?: unknown;
        readonly seq?: unknown;
        readonly data?: Record<string, unknown>;
    };
    readonly [key: string]: unknown;
}
interface NativeHistoryValue {
    readonly events?: readonly HistoryEntry[];
    readonly hasMore?: unknown;
    readonly [key: string]: unknown;
}
interface NativeHistoryResponse {
    readonly ok: boolean;
    readonly value?: NativeHistoryValue;
    readonly error?: {
        readonly code?: unknown;
        readonly message?: unknown;
    };
}
export interface WechatHistoryWindowRequest {
    readonly sessionId: string;
    readonly beforeSeq?: number;
    readonly maxMessages?: number;
    /** Force compact JSON inline when the client's object data plane is unavailable. */
    readonly delivery?: 'auto' | 'inline';
}
export interface WechatHistoryWindowValue extends NativeHistoryValue {
    readonly events: readonly HistoryEntry[];
    readonly hasMore: boolean;
    readonly historyStartSeq?: number;
    readonly historyEndSeq?: number;
    readonly pages: number;
    readonly rawEvents: number;
}
export interface WechatHistoryRemoteValue {
    /** JSON keeps the Typert boundary constrained while preserving native views. */
    readonly payloadJson?: string;
    /** Large windows may use an encrypted, expiring OSS transport descriptor. */
    readonly snapshotJson?: string;
    /** Observable acceleration only; DSH remains the source of truth. */
    readonly cache?: 'memory';
}
export interface WechatHistoryWindowError {
    readonly code: 'invalid-history-request' | 'history-unavailable' | 'history-pagination-invalid';
    readonly message: string;
}
export type WechatHistoryWindowResult = {
    readonly ok: true;
    readonly value: WechatHistoryRemoteValue;
} | {
    readonly ok: false;
    readonly error: WechatHistoryWindowError;
};
export type BuildHistoryWindowResult = {
    readonly ok: true;
    readonly value: WechatHistoryWindowValue;
} | {
    readonly ok: false;
    readonly error: WechatHistoryWindowError;
};
export interface WechatHistoryConfig {
    readonly dshPort?: number;
    readonly timeoutMs?: number;
    readonly snapshotThresholdBytes?: number;
    readonly prepareSnapshot?: (payloadJson: string) => Promise<Readonly<Record<string, unknown>>>;
}
export interface LatestHistoryWindowCacheToken {
    readonly epoch: number;
    readonly revision: number;
}
/**
 * Process-local, event-coherent cache for the latest semantic window.
 *
 * It is deliberately disabled until the native Host event stream is live.
 * Any event for a Session invalidates that Session; any monitor gap clears the
 * whole cache. Clear history never leaves memory and older cursor pages are
 * never cached.
 */
export declare class LatestHistoryWindowCache {
    private readonly maxEntries;
    private readonly maxBytes;
    private readonly maxEntryBytes;
    private readonly entries;
    private readonly revisions;
    private tracking;
    private epoch;
    private totalBytes;
    constructor(options?: {
        readonly maxEntries?: number;
        readonly maxBytes?: number;
        readonly maxEntryBytes?: number;
    });
    setTracking(ready: boolean): void;
    invalidateSession(sessionId: string): void;
    capture(request: WechatHistoryWindowRequest): LatestHistoryWindowCacheToken | null;
    read(request: WechatHistoryWindowRequest): string | null;
    write(request: WechatHistoryWindowRequest, payloadJson: string, token: LatestHistoryWindowCacheToken | null): boolean;
    private clear;
    private remove;
}
type FetchPage = (payload: {
    readonly sessionId: string;
    readonly maxMessages: number;
    readonly beforeSeq?: number;
}, signal: AbortSignal) => Promise<NativeHistoryResponse>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatHistory: WechatHistoryService;
    }
}
export declare class WechatHistoryService extends TypertRemoteService {
    private readonly dshPort;
    private readonly timeoutMs;
    private readonly snapshotThresholdBytes;
    private readonly prepareSnapshot?;
    private readonly latestCache;
    constructor(ctx: Context, config?: WechatHistoryConfig);
    window(request: WechatHistoryWindowRequest, signal: AbortSignal): Promise<WechatHistoryWindowResult>;
    /** Enable cache reads only while the native Host monitor is continuous. */
    setCacheTracking(ready: boolean): void;
    /** Invalidate before processing every native event for this Session. */
    invalidateSession(sessionId: string): void;
    private deliver;
    private fetchNativePage;
}
/**
 * Populate the gateway's content-addressed history cache after a native DSH
 * turn finishes. This is deliberately a host helper rather than a Typert
 * Remote, so clients cannot invoke background work or discover a second API.
 */
export declare function prewarmLatestHistory(service: WechatHistoryService, sessionId: string, signal: AbortSignal): Promise<'inline' | 'object'>;
/** Exported pure coordinator for deterministic plugin regression tests. */
export declare function buildHistoryWindow(request: WechatHistoryWindowRequest, fetchPage: FetchPage, signal: AbortSignal): Promise<BuildHistoryWindowResult>;
export default WechatHistoryService;
