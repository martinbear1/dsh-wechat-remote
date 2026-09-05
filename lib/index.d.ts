import type { Context } from '@deepseek-ai/cordis';
export declare const name = "gate";
/** The adapter must learn the actual bound Web port before opening its doors. */
export declare const inject: string[];
/**
 * Inert DSH/Cordis entry point. All mutable resources are created by the
 * mounted runtime and are released with this plugin fiber.
 */
export declare const apply: (ctx: Context) => void | (() => void);
