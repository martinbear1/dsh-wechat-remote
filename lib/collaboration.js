/** Native preset-plane component. The host gate supplies shared services but
 * never contributes these tools, skills or prompts to unrelated native modes. */
export const name = 'wechat-collaboration';
export const inject = ['humanTools', 'tools', 'systemPrompt', 'skills'];
export async function apply(ctx) {
    const service = ctx.get('humanTools');
    return service.mountCapabilities(ctx);
}
export default { name, inject, apply };
