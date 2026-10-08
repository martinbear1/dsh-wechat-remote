import { WechatClawbotService } from './clawbot/service.js';
export const name = 'wechat-clawbot';
export const inject = ['typertGateway', 'profileContext', 'wechatFeatures'];
/** Own native component; transport stays disabled until its owner enables it. */
export function apply(ctx) {
    ctx.plugin(WechatClawbotService);
}
