/** Adaptation of Tencent/openclaw-weixin. See THIRD-PARTY-NOTICES/clawbot.txt. */
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
    media?: ILinkMedia[];
    unsupported?: boolean;
    unsupportedReason?: string;
}
/** Private provider reference: never expose download credentials to a model or UI. */
export interface ILinkMedia {
    kind: 'image' | 'file' | 'voice' | 'video';
    name: string;
    url: string;
    aesKey?: string;
    bytes?: number;
    md5?: string;
}
export interface ILinkMediaInput {
    userId: string;
    kind: 'image' | 'file' | 'voice' | 'video';
    name: string;
    data: Uint8Array;
}
/** Private uploaded reference bound to the account and recipient that prepared it. */
export interface ILinkPreparedMedia {
    kind: 'image' | 'file' | 'video';
    name: string;
    bytes: number;
    cipherBytes: number;
    query: string;
    aesKey: string;
    accountId: string;
    userId: string;
}
export interface ILinkMediaSend {
    userId: string;
    contextToken: string;
    clientId: string;
    media: ILinkPreparedMedia;
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
