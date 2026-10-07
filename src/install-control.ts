/** Compatibility boundary for old temporary installer plugins.
 * No private HTTP server, root disposal, shutdown or worker launch is allowed. */
import type { Context } from '@deepseek-ai/cordis'
import { desktopOwnsLifecycle } from './dsh-host-context.js'
import { legacyUpdateError } from './install-capabilities.js'
export { legacyUpdateError } from './install-capabilities.js'

export interface InstallControlConfig { directory: string; token: string; pnpm: string }
/** Read-only diagnostic; not an installation admission or host lifecycle hook. */
export async function nativeInstallSessions(ctx: Context, signal: AbortSignal): Promise<any> {
  const controller = ctx.get('sessionController') as { list?: (request: object, signal: AbortSignal) => Promise<any> } | undefined
  if (typeof controller?.list !== 'function') throw new Error('DSH 原生会话检查不可用，未停止节点。')
  signal.throwIfAborted()
  const value = await controller.list({}, signal)
  signal.throwIfAborted()
  if (!Array.isArray(value?.items) || value.items.some((s: any) => typeof s.sessionId !== 'string'
    || !s.sessionId || typeof s.running !== 'boolean')
    || new Set(value.items.map((s: any) => s.sessionId)).size !== value.items.length) {
    throw new Error('DSH 原生会话状态不完整，未停止节点。')
  }
  return value
}
export async function quiesceNativeHost(_ctx: Context, _read: (method: string) => Promise<any>, _disposing: () => void): Promise<never> {
  throw legacyUpdateError()
}
export async function createInstallControl(context: Context, _config: InstallControlConfig): Promise<{ origin: string; close(): void }> {
  if (desktopOwnsLifecycle(context.root || context)) throw new Error('请通过 DSH 桌面应用的插件管理页更新，未停止节点。')
  throw legacyUpdateError()
}
/** Old HMR callers fail before any host resource is acquired. */
export const apply = async (ctx: Context, config: InstallControlConfig): Promise<void> => {
  await createInstallControl(ctx, config)
}
