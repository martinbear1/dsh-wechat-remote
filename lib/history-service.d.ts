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
    readonly storeSnapshot?: (payloadJson: string) => Promise<Readonly<Record<string, unknown>>>;
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
    private readonly storeSnapshot?;
    constructor(ctx: Context, config?: WechatHistoryConfig);
    window(request: WechatHistoryWindowRequest, signal: AbortSignal): Promise<WechatHistoryWindowResult>;
    private fetchNativePage;
}
/** Exported pure coordinator for deterministic plugin regression tests. */
export declare function buildHistoryWindow(request: WechatHistoryWindowRequest, fetchPage: FetchPage, signal: AbortSignal): Promise<BuildHistoryWindowResult>;
export default WechatHistoryService;
