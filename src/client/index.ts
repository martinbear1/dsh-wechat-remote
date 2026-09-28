/**
 * Harness Remote browser surface. The plugin contributes one lazy page to the
 * official Settings section ledger. Pairing uses the owning Host's native
 * authenticated channel, retaining the described local door on older Web hosts.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the canonical Settings slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CompanionPanel } from './CompanionPanel.tsx'
import type { CallPairingManagement } from './pairing-client.js'
import { RemotePageStore } from './remote-page-store.js'
import { WechatShortcut } from './WechatShortcut.tsx'
import { openPluginPage } from './page-navigation.js'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'plugins.bundle.activation': { kind: 'keyed'; scope: 'root'; owner: { readonly packageName: string; readonly onDismiss: () => void; readonly onOpenDetails: () => void } }
    'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: { readonly view: 'summary' | 'page' } }
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
  }
}
import {
  HarnessRemoteSettings,
  type HarnessRemoteHostDescription,
} from './HarnessRemoteSettings.tsx'

/** Required services for the slot registration. */
export const inject = ['slots', 'connection']

type HarnessRemoteClientContext = Context & {
  connection: ConnectionHandle
}

interface WechatHostDescribeResult {
  ok: true
  value: HarnessRemoteHostDescription
}

/**
 * Register a feature-owned page inside the official Settings shell.
 * `slots.inject` follows late declaration/redeclaration of the section and
 * ensures the registration is disposed with this Cordis fiber.
 * @param ctx - client root context.
 */
export function apply(ctx: HarnessRemoteClientContext): void {
  const callManagement: CallPairingManagement = async (endpoint, payload): Promise<unknown> => {
    const response = await ctx.connection.rpc.call('/wechat-remote-management', endpoint, payload ?? {})
    if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code })
    return response.value
  }
  const describeHost = async (): Promise<HarnessRemoteHostDescription> => {
    const response = await ctx.connection.rpc.call(
      '/api',
      'wechatHost/describe',
      { args: { request: {} } },
    )
    if (!response.ok) {
      throw new Error(`wechatHost/describe: ${response.error.code}`)
    }
    const result = response.value as WechatHostDescribeResult
    if (result?.ok !== true || result.value === undefined) {
      throw new Error('wechatHost/describe returned an invalid result')
    }
    return result.value
  }

  const store = new RemotePageStore(describeHost, callManagement)
  ctx.effect(() => () => store.dispose(), 'wechat shared page')
  const openPlugin = () => openPluginPage(name => ctx.get(name))
  const injected = () => ({ describeHost, callManagement, store })
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'harness-remote',
        order: 30,
        label: '微信连接',
        inject: injected,
      },
      HarnessRemoteSettings,
    ),
  )
  for (const name of ['plugins.bundle.activation', 'plugins.bundle.config'] as const) {
    // Native GUI installs use the wrapper name; the Web one-line installer
    // registers the embedded core. Both owners use the same component/API.
    ctx.slots.inject(name, () => {
      const disposers = ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote'].map(key =>
        ctx.slots.register({ name, key, inject: injected }, name === 'plugins.bundle.activation' ? CompanionPanel : HarnessRemoteSettings))
      return () => disposers.forEach(dispose => dispose())
    })
  }
  // No third page or takeover of the shell-owned settings launcher. The
  // shortcut exists only while the native navigation provider is available.
  ctx.inject(['pluginNavigation', 'remote.pluginManager'], () => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'harness-remote', order: 30, label: '微信连接',
    inject: () => ({ openPlugin }),
  }, WechatShortcut)))
}
