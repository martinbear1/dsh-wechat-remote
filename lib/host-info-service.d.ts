import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
export interface WechatHostDescribeRequest {
}
export interface WechatHostDescribeValue {
    readonly computerName: string;
    readonly pluginVersion: string;
}
export type WechatHostDescribeResult = {
    readonly ok: true;
    readonly value: WechatHostDescribeValue;
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatHost: WechatHostInfoService;
    }
}
/** Host-only, authenticated, read-only metadata for the WeChat client. */
export declare class WechatHostInfoService extends TypertRemoteService {
    constructor(ctx: Context);
    describe(request: WechatHostDescribeRequest, signal: AbortSignal): Promise<WechatHostDescribeResult>;
}
export default WechatHostInfoService;
