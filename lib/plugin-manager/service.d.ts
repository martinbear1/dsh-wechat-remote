import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { PluginRequest, PluginResult, PluginStatus } from './protocol.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatPlugins: WechatPluginsService;
    }
}
/** Mounted on the existing authenticated owner transport; no additional endpoint or credentials. */
export declare class WechatPluginsService extends TypertRemoteService {
    private readonly adapter;
    private readonly lifetime;
    constructor(ctx: Context);
    status(): PluginStatus;
    control(request: PluginRequest, signal: AbortSignal): Promise<PluginResult>;
}
