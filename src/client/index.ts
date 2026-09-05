/**
 * Harness Remote browser surface. The plugin contributes one lazy page to the
 * official Web Settings section ledger. Pairing remains owned by the
 * WeChat gate's loopback-only door; this client page only presents status and
 * requests a short-lived QR code when the user explicitly asks for one.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the canonical Settings slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
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

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'harness-remote',
        order: 30,
        label: '微信连接',
        inject: () => ({ describeHost }),
      },
      HarnessRemoteSettings,
    ),
  )
}
