import { type ILinkCredentials, type ILinkMedia, type ILinkMediaInput, type ILinkPreparedMedia } from './ilink-types.js';
export declare const MEDIA_MAX_BYTES: number;
export declare const MEDIA_MAX_ITEMS = 6;
/** Validate persisted refs as well as fresh provider input before any download. */
export declare function validateMedia(value: unknown): value is ILinkMedia;
/** Outbox validation rejects oversized, cross-shape and malformed persisted references. */
export declare function validatePreparedMedia(value: unknown): value is ILinkPreparedMedia;
/** Tencent's getuploadurl -> AES/PKCS7 -> CDN protocol, without local file access. */
export declare function prepareMedia(auth: ILinkCredentials, input: ILinkMediaInput, fetchImpl: typeof fetch, getUploadUrl: (body: Record<string, unknown>) => Promise<Record<string, unknown>>, signal?: AbortSignal, check?: () => void): Promise<ILinkPreparedMedia>;
/** Decode only native direct media fields. Quotes/stickers are not fabricated. */
export declare function mediaFromItem(item: Record<string, unknown>): ILinkMedia;
export declare function downloadMedia(media: ILinkMedia, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{
    name: string;
    data: Uint8Array;
}>;
