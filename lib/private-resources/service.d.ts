import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type ResourceAssistantProvider } from './library.js';
import { type DeliverySource } from './source.js';
import type { ResourceRequest, ResourceResult } from './protocol.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatResources: WechatResourcesService;
        wechatResourceSource: DeliverySource;
        wechatResourceAssistants: ResourceAssistantProvider;
    }
}
/** Host-authenticated resource management only; not a model-callable tool. */
export declare class WechatResourcesService extends TypertRemoteService {
    private readonly lifetime;
    private readonly controller;
    private readonly ready;
    private settled;
    constructor(ctx: Context);
    private restore;
    control(request: ResourceRequest, signal: AbortSignal): Promise<ResourceResult>;
}
