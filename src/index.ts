import type { Context } from '@deepseek-ai/cordis'

import { mountWechatGate } from './gate-runtime.js'

export const name = 'gate'

/**
 * Inert DSH/Cordis entry point. All mutable resources are created by the
 * mounted runtime and are released with this plugin fiber.
 */
export const apply = (ctx: Context): void | (() => void) => {
  try {
    return mountWechatGate(ctx)
  } catch (error) {
    // Harness Remote is an optional client adapter. A damaged local config or
    // platform edge case must disable this plugin, never the DSH host itself.
    const detail = error instanceof Error ? error.message : String(error)
    console.error(
      `[wechat-gate] plugin initialization failed; DSH continues without Harness Remote: ${detail}`,
    )
  }
}
