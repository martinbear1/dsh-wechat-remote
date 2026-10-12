import { mountWechatGate } from './gate-runtime.js';
import { legacyUpdateHandoff } from './update-legacy-handoff.js';
export const name = 'gate';
/** The adapter must learn the actual bound Web port before opening its doors. */
export const inject = ['webServer'];
/**
 * Inert DSH/Cordis entry point. All mutable resources are created by the
 * mounted runtime and are released with this plugin fiber.
 */
export const apply = (ctx) => {
    const failed = (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[wechat-gate] plugin initialization failed; DSH continues without Harness Remote: ${detail}`);
    };
    try {
        const handoff = legacyUpdateHandoff(ctx, startup => mountWechatGate(ctx, startup));
        if (handoff)
            return handoff.catch(failed);
        return mountWechatGate(ctx);
    }
    catch (error) {
        // Harness Remote is an optional client adapter. A damaged local config or
        // platform edge case must disable this plugin, never the DSH host itself.
        failed(error);
    }
};
