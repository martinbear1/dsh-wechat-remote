/**
 * 微信小程序专用的只读 Host 元信息。
 *
 * DSH 原生 host.describe 当前没有电脑名称字段，因此不能把客户端需要的
 * 字段伪造进官方契约。这个独立 Typert Remote 只暴露微信端连接诊断所需的
 * 最小信息；它沿用 DSH Remote 网关与微信 gate 的 Bearer 鉴权，不修改
 * DSH/WebUI 的设置、会话或目录能力。
 */
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export interface WechatHostDescribeRequest {}

export interface WechatHostDescribeValue {
  readonly computerName: string
  readonly pluginVersion: string
}

export type WechatHostDescribeResult = {
  readonly ok: true
  readonly value: WechatHostDescribeValue
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    wechatHost: WechatHostInfoService
  }
}

function installedPluginVersion(): string {
  try {
    const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { readonly version?: unknown }
    return typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown'
  } catch (error) {
    return 'unknown'
  }
}

/** Host-only, authenticated, read-only metadata for the WeChat client. */
export class WechatHostInfoService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'wechatHost')
  }

  @Remote('describe')
  async describe(
    request: WechatHostDescribeRequest,
    signal: AbortSignal,
  ): Promise<WechatHostDescribeResult> {
    void request
    signal.throwIfAborted()
    return {
      ok: true,
      value: {
        computerName: hostname(),
        pluginVersion: installedPluginVersion(),
      },
    }
  }
}

export default WechatHostInfoService
