/** Text-only adaptation of Tencent/openclaw-weixin. See THIRD-PARTY-NOTICES/clawbot.txt. */
export interface ILinkCredentials {
    token: string;
    baseUrl: string;
    accountId: string;
    userId: string;
}
export interface ILinkMessage {
    id: string;
    userId: string;
    contextToken: string;
    text: string;
    unsupported?: boolean;
}
export interface ILinkQrResult {
    status: string;
    credentials?: ILinkCredentials;
    message?: string;
}
export interface ILinkUpdates {
    cursor: string;
    messages: ILinkMessage[];
}
export interface ILinkText {
    userId: string;
    contextToken: string;
    text: string;
    clientId: string;
}
export type ILinkErrorCode = 'clawbot-auth-expired' | 'clawbot-api-error' | 'clawbot-http-error' | 'clawbot-invalid-response' | 'clawbot-invalid-input' | 'clawbot-untrusted-url' | 'clawbot-response-too-large' | 'clawbot-timeout' | 'clawbot-network-error';
/** Error messages deliberately exclude remote response bodies, credentials and URLs. */
export declare class ILinkError extends Error {
    readonly code: ILinkErrorCode;
    readonly apiCode?: number | undefined;
    readonly httpStatus?: number | undefined;
    constructor(code: ILinkErrorCode, message: string, apiCode?: number | undefined, httpStatus?: number | undefined);
}
