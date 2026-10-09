import type { ILinkCredentials, ILinkMedia, ILinkMediaInput, ILinkMediaSend, ILinkPreparedMedia, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js';
export { ILinkError } from './ilink-types.js';
export { validatePreparedMedia } from './ilink-media.js';
export type { ILinkCredentials, ILinkMedia, ILinkMediaInput, ILinkMediaSend, ILinkMessage, ILinkPreparedMedia, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js';
export declare class ILinkClient {
    private readonly fetchImpl;
    private readonly qrStates;
    private nextPollTimeout;
    constructor(options?: {
        fetch?: typeof fetch;
    });
    /** Provider-only download; no token forwarding, filesystem writes or retries. */
    downloadMedia(media: ILinkMedia, signal?: AbortSignal): Promise<{
        name: string;
        data: Uint8Array;
    }>;
    /** Upload only; runtime records the result before a separate, single send. */
    prepareMedia(auth: ILinkCredentials, input: ILinkMediaInput, signal?: AbortSignal, check?: () => void): Promise<ILinkPreparedMedia>;
    sendMedia(auth: ILinkCredentials, input: ILinkMediaSend, signal?: AbortSignal): Promise<void>;
    private request;
    getQr(signal?: AbortSignal, localTokens?: string[]): Promise<{
        qrcode: string;
        url: string;
    }>;
    pollQr(qrcode: string, signal?: AbortSignal, verifyCode?: string): Promise<ILinkQrResult>;
    /** Forget an ended local attempt; never calls an account-unbind endpoint. */
    forgetQr(qrcode: string): void;
    getUpdates(auth: ILinkCredentials, cursor: string, signal?: AbortSignal): Promise<ILinkUpdates>;
    sendText(auth: ILinkCredentials, text: ILinkText, signal?: AbortSignal): Promise<void>;
}
