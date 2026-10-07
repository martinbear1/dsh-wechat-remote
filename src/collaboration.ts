import type { Context } from '@deepseek-ai/cordis'
import type { HumanToolsService } from './human-tools/service.js'

/** Native preset-plane component. The host gate supplies shared services but
 * never contributes these tools, skills or prompts to unrelated native modes. */
export const name = 'wechat-collaboration'
export const inject = ['humanTools', 'tools', 'systemPrompt', 'skills']
export async function apply(ctx: Context): Promise<() => void> {
  const service = ctx.get('humanTools') as HumanToolsService
  return service.mountCapabilities(ctx)
}
export default { name, inject, apply }
