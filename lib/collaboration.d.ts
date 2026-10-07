import type { Context } from '@deepseek-ai/cordis';
/** Native preset-plane component. The host gate supplies shared services but
 * never contributes these tools, skills or prompts to unrelated native modes. */
export declare const name = "wechat-collaboration";
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<() => void>;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
