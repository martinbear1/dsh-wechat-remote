import type { Context } from '@deepseek-ai/cordis';
/**
 * Mount one isolated Harness Remote runtime into the supplied Cordis fiber.
 *
 * Importing the package is intentionally inert: credentials, files, sockets,
 * timers and listening ports are created only after Cordis applies this plugin
 * and are therefore scoped to this exact plugin instance.
 */
export declare function mountWechatGate(ctx: Context): () => void;
