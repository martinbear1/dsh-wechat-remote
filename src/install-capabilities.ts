/** The native shutdown/save contract, not a frozen list of DSH releases.
 * This probe is read-only. Actual idle checks, flush, backup, restart, health
 * and rollback remain mandatory inside the installation transaction.
 */
export interface NativeUpdateContext {
  get(name: string): unknown
  root?: NativeUpdateContext
  fiber?: { dispose?: unknown }
}
export function assertNativeUpdateCapabilities(context: NativeUpdateContext): void {
  const ctx = context.root || context
  const web = ctx.get('webServer') as { server?: Record<string, unknown> } | undefined
  const sessions = ctx.get('sessions') as Record<string, unknown> | undefined
  const missing: string[] = []
  for (const name of ['on', 'listeners', 'removeAllListeners', 'removeListener']) {
    if (typeof web?.server?.[name] !== 'function') missing.push('webServer.' + name)
  }
  for (const name of ['get', 'list', 'flush']) {
    if (typeof sessions?.[name] !== 'function') missing.push('sessions.' + name)
  }
  if (typeof ctx.fiber?.dispose !== 'function') missing.push('lifecycle.dispose')
  if (missing.length) throw new Error('当前宿主缺少安全更新所需能力，未停止节点：' + missing.join(', '))
}
