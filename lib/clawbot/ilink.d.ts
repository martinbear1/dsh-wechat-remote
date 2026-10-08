import type { ILinkCredentials, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js';
export { ILinkError } from './ilink-types.js';
export type { ILinkCredentials, ILinkMessage, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js';
export declare class ILinkClient {
    private readonly fetchImpl;
    private readonly qrStates;
    private nextPollTimeout;
    constructor(options?: {
        fetch?: typeof fetch;
    });
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
