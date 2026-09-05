import type { Context } from '@deepseek-ai/cordis';
type JsonRecord = Record<string, unknown>;
export interface TypertGatewayLike {
    readonly wireStream?: {
        open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    };
    invoke(request: {
        readonly namespace: string;
        readonly method: string;
        readonly args: Readonly<JsonRecord>;
        readonly signal?: AbortSignal;
    }): Promise<unknown>;
    stream(request: {
        readonly namespace: string;
        readonly method: string;
        readonly args: Readonly<JsonRecord>;
        readonly signal?: AbortSignal;
    }): Promise<AsyncIterable<unknown>>;
}
export interface LegacyClientRequest {
    readonly type: 'client-request';
    readonly rpcId: string;
    readonly method: string;
    readonly payload: JsonRecord;
}
export interface LegacyRpcError {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
}
export type LegacyRpcResult = {
    readonly ok: true;
    readonly value: unknown;
} | {
    readonly ok: false;
    readonly error: LegacyRpcError;
};
export interface LegacyServerResponse {
    readonly type: 'server-response';
    readonly rpcId: string;
    readonly result: LegacyRpcResult;
}
type InvocationPlan = {
    readonly kind: 'invoke';
    readonly namespace: string;
    readonly method: string;
    readonly args: JsonRecord;
    readonly transform?: (value: unknown) => unknown;
} | {
    readonly kind: 'host-describe';
} | {
    readonly kind: 'workspace-list';
} | {
    readonly kind: 'session-models';
    readonly request: JsonRecord;
} | {
    readonly kind: 'session-history';
    readonly request: JsonRecord;
} | {
    readonly kind: 'permission-command';
    readonly sessionId: string;
    readonly line: string;
    readonly preset?: string;
};
/**
 * Translate the stable mini-program RPC vocabulary into the post-0.1.2
 * Typert Remote vocabulary. This table deliberately lives on the Host: a
 * published mini program never needs a DSH-version switch or another review.
 */
export declare function planLegacyRpc(request: LegacyClientRequest): InvocationPlan;
/** Feature detection keeps the same package loadable on pre-Gateway DSH. */
export declare function resolveTypertGateway(ctx: Context): TypertGatewayLike | null;
/** Expand 0.1.2 packed history rows back into the stable event vocabulary. */
export declare function unpackChunkRow(event: JsonRecord): JsonRecord[];
/** The 0.1.1 Gateway has invoke but no stream; retain its native history API. */
export declare function invokeLegacyPermissionRpc(gateway: Pick<TypertGatewayLike, 'invoke'>, request: LegacyClientRequest, signal: AbortSignal, readHistory: (sessionId: string, signal: AbortSignal) => Promise<unknown>, flushPermission?: (sessionId: string) => Promise<void>): Promise<LegacyServerResponse | null>;
/** Execute one stable request and restore the pre-0.1.2 HTTP envelope. */
export declare function invokeLegacyRpc(gateway: TypertGatewayLike, request: LegacyClientRequest, options: {
    readonly signal: AbortSignal;
    readonly describeHost: () => unknown;
    readonly flushPermission?: (sessionId: string) => Promise<void>;
}): Promise<LegacyServerResponse>;
/** Reject carrier smuggling and malformed JSON before a Host call executes. */
export declare function parseLegacyClientRequest(pathMethod: string, value: unknown): LegacyClientRequest;
export {};
