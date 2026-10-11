import { WechatResourcesService } from './private-resources/service.js';
export const name = 'wechat-resource-library';
export const inject = ['typertGateway', 'profileContext', 'agentPresets'];
/** One native main-bundle component owns all resource preset registrations.
 * Disabling it disposes those registrations, without deleting any local data. */
export function apply(ctx) { ctx.plugin(WechatResourcesService); }
