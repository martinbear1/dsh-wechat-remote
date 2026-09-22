import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { turnDetails } from './turn-presentation.js';
import { type HistoryTurnFacets } from './history-turn-evidence.js';
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
    /** Additive capability: an inline retry may return the existing ZIP descriptor. */
    readonly acceptInlineArchive?: boolean;
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
}
export interface WechatHistoryWindowError {
    readonly code: 'invalid-history-request' | 'history-unavailable' | 'history-pagination-invalid' | 'history-busy' | 'history-detail-unavailable' | 'invocation-unavailable';
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
    readonly storeSnapshot?: (payloadJson: string, archive: Uint8Array, signal: AbortSignal) => Promise<Readonly<Record<string, unknown>>>;
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
    private readonly reads;
    private readonly records;
    private readonly turnEvidence;
    private readonly hostContext;
    private readonly dshPort;
    private readonly timeoutMs;
    private readonly snapshotThresholdBytes;
    private readonly storeSnapshot?;
    constructor(ctx: Context, config?: WechatHistoryConfig);
    /** Host-only presentation shared by history and realtime peers.
     * Not a Remote: identity is issued here, and detail() rechecks access. */
    presentRecord(sessionId: string, original: HistoryEntry, displayed?: HistoryEntry, call?: HistoryEntry): HistoryEntry;
    /** New clients explicitly opt into a bounded page contract. This endpoint
     * never uploads history to OSS or recursively completes a partial turn. */
    page(request: WechatHistoryWindowRequest, signal: AbortSignal): Promise<WechatHistoryWindowResult>;
    detail(request: {
        readonly sessionId: string;
        readonly reference: string;
        readonly part?: number;
        readonly offset?: number;
    }, signal: AbortSignal): Promise<WechatHistoryWindowResult>;
    window(request: WechatHistoryWindowRequest, signal: AbortSignal): Promise<WechatHistoryWindowResult>;
    private createPageReader;
    private fetchNativePage;
}
/** Exported pure coordinator for deterministic plugin regression tests. */
export declare function buildHistoryWindow(request: WechatHistoryWindowRequest, fetchPage: FetchPage, signal: AbortSignal, usageFold?: Parameters<typeof turnDetails>[1]): Promise<BuildHistoryWindowResult>;
/** One native read followed by a contiguous, byte-bounded presentation suffix.
 * Native data stays intact. Large records have explicit readonly detail refs.
 * Transcript append-source groups are indivisible; model-context replacements
 * retain their references without pulling older context into a display page. */
export declare function buildBoundedHistoryWindow(request: WechatHistoryWindowRequest, fetchPage: FetchPage, signal: AbortSignal, usageFold?: Parameters<typeof turnDetails>[1], present?: (original: HistoryEntry, displayed: HistoryEntry, call?: HistoryEntry) => HistoryEntry, metadata?: (entries: readonly HistoryEntry[]) => HistoryTurnFacets): Promise<BuildHistoryWindowResult>;
export default WechatHistoryService;
