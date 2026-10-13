import type { HarnessRemoteHostDescription } from './pairing-client.js'

export interface InstallationState {
  phase: 'ready' | 'restart-required' | 'disabled' | 'incomplete' | 'unknown'
  scope?: 'desktop' | 'web'
  installedVersion?: string
  runningVersion?: string
}
interface Bundle {
  name: string; installed: boolean; enabled: boolean; version?: string; error?: unknown
  rows: Array<{ entryId?: string }>
}
interface Plugin { entryId: string; enabled: boolean; fiberPhase: string | null }
interface Manager {
  listBundles(): Promise<{ ok: boolean; value?: Bundle[] }>
  listPlugins(): Promise<{ ok: boolean; value?: Plugin[] }>
}
const owners = ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']
const version = (value: unknown): string | undefined => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value) ? value : undefined

/** Activation-only read of the current native manager. No catalog, filesystem,
 * install, restart, peer discovery or background polling. A new client can read
 * the old host's running version without invoking new updater operations. */
export async function readInstallationState(get: (name: string) => unknown,
  describe: () => Promise<HarnessRemoteHostDescription>, packageName: string): Promise<InstallationState> {
  if (!owners.includes(packageName)) return { phase: 'unknown' }
  const manager = get('remote.pluginManager') as Manager | undefined
  const [host, bundles, plugins] = await Promise.all([
    describe().catch(() => undefined),
    manager?.listBundles?.().catch(() => undefined),
    manager?.listPlugins?.().catch(() => undefined),
  ])
  const scope = host?.gate?.profileScope
  const state: InstallationState = { phase: 'unknown',
    ...(scope === 'desktop' || scope === 'web' ? { scope } : {}), runningVersion: version(host?.pluginVersion) }
  if (!bundles?.ok || !Array.isArray(bundles.value)) return state
  const installed = bundles.value.filter(row => owners.includes(row.name) && row.installed)
  if (installed.length !== 1 || installed[0].name !== packageName) return state
  const own = installed[0]
  state.installedVersion = version(own.version)
  if (!own.enabled) return { ...state, phase: 'disabled' }
  if (state.runningVersion && state.installedVersion && state.runningVersion !== state.installedVersion) return { ...state, phase: 'restart-required' }
  if (own.error) return { ...state, phase: 'incomplete' }
  if (!plugins?.ok || !Array.isArray(plugins.value) || !own.rows?.length) return state
  const entries = own.rows.map(row => plugins.value!.find(entry => entry.entryId === row.entryId))
  if (entries.some(entry => !entry || (entry.enabled && entry.fiberPhase !== 'active'))) return { ...state, phase: 'incomplete' }
  return state.runningVersion && state.runningVersion === state.installedVersion ? { ...state, phase: 'ready' } : state
}

export function manualRestartInstruction(scope?: string): string {
  if (scope === 'desktop') return '任务结束后，选择「应用 → 退出」，再重新打开 DSH Desktop。仅关闭窗口可能不会退出应用。'
  if (scope === 'web') return '任务结束后，通过原来的启动方式停止并重新启动 DSH Web 服务。仅关闭标签页或刷新网页不会生效。'
  return '任务结束后，正常退出并重新打开当前 DSH；Web 需要重启实际服务，仅刷新网页不会生效。'
}
