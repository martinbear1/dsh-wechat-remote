import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export interface WechatAttachmentInput {
    readonly attachmentId: string;
    readonly mediaType?: string;
    readonly name?: string;
}
export interface WechatAttachmentBatchRequest {
    readonly sessionId: string;
    readonly attachments: readonly WechatAttachmentInput[];
}
export interface PreparedWechatAttachment {
    readonly attachmentId: string;
    readonly descriptor: WechatAttachmentObjectDescriptor;
}
export interface WechatAttachmentObjectDescriptor {
    readonly v: 1;
    readonly scheme: 'xsalsa20-poly1305-chunks-v1';
    readonly objectId: string;
    readonly key: string;
    readonly noncePrefix: string;
    readonly plainBytes: number;
    readonly cipherBytes: number;
    readonly chunkBytes: number;
    readonly contentKind: 'image';
    readonly mediaType: string;
    readonly name?: string;
    readonly expiresAt: number;
}
export interface WechatAttachmentError {
    readonly code: 'invalid-attachment-request' | 'attachment-unavailable' | 'attachment-object-unavailable';
    readonly message: string;
}
export type WechatAttachmentBatchResult = {
    readonly ok: true;
    readonly value: {
        readonly descriptors: readonly PreparedWechatAttachment[];
    };
} | {
    readonly ok: false;
    readonly error: WechatAttachmentError;
};
interface NativeAttachmentRef {
    readonly attachmentId?: unknown;
    readonly mediaType?: unknown;
    readonly bytes?: unknown;
    readonly name?: unknown;
}
interface NativeAttachmentResponse {
    readonly ok: boolean;
    readonly value?: {
        readonly attachment?: NativeAttachmentRef;
        readonly data?: unknown;
    };
    readonly error?: {
        readonly message?: unknown;
    };
}
export interface WechatAttachmentConfig {
    readonly dshPort?: number;
    readonly timeoutMs?: number;
    readonly storeAttachment?: (data: Uint8Array, attachment: {
        readonly attachmentId: string;
        readonly mediaType: string;
        readonly name?: string;
    }, signal: AbortSignal) => Promise<WechatAttachmentObjectDescriptor>;
    /** Pure-test seam; production always uses the native loopback API. */
    readonly readAttachment?: (sessionId: string, attachmentId: string, signal: AbortSignal) => Promise<NativeAttachmentResponse>;
    readonly callDsh?: (method: string, payload: Record<string, unknown>, signal: AbortSignal) => Promise<NativeAttachmentResponse>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatAttachment: WechatAttachmentService;
    }
}
export declare class WechatAttachmentService extends TypertRemoteService {
    private readonly dshPort;
    private readonly timeoutMs;
    private readonly storeAttachment?;
    private readonly readAttachmentOverride?;
    private readonly callDsh?;
    private readonly cache;
    private readonly pending;
    constructor(ctx: Context, config?: WechatAttachmentConfig);
    prepareBatch(request: WechatAttachmentBatchRequest, signal: AbortSignal): Promise<WechatAttachmentBatchResult>;
    private prepareOne;
    private prepareFresh;
    private fetchNativeAttachment;
}
/** Pure native-contract validator used by regression tests. */
export declare function decodeNativeAttachment(response: NativeAttachmentResponse, requested: WechatAttachmentInput): {
    readonly data: Uint8Array;
    readonly attachment: {
        readonly attachmentId: string;
        readonly mediaType: string;
        readonly name?: string;
    };
};
export default WechatAttachmentService;
