import type { Context } from '@deepseek-ai/cordis';
export declare const name = "wechat-resource-library";
export declare const inject: string[];
/** One native main-bundle component owns all resource preset registrations.
 * Disabling it disposes those registrations, without deleting any local data. */
export declare function apply(ctx: Context): void;
