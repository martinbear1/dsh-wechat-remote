import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ScheduledChanged, ScheduledRequest, ScheduledResult } from './protocol.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        wechatSchedules: WechatSchedulesService;
    }
    interface Events {
        /** Official Schedule changed or mounted/unmounted. Invalidation only.
         * @mode emit */
        'wechatSchedules/changed'(value: ScheduledChanged): void;
    }
}
/** Only mounted behind the existing owner-authenticated Host transport. This
 * service never enables the official plugin or installs a second scheduler. */
export declare class WechatSchedulesService extends TypertRemoteService {
    private readonly adapter;
    private readonly lifetime;
    constructor(ctx: Context);
    control(request: ScheduledRequest, signal: AbortSignal): Promise<ScheduledResult>;
}
