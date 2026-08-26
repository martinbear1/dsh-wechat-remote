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
import { loadAgentDescriptor, type AgentCapability } from './agent-metadata.js'
import type { HostPlatformDescriptor } from './host-platform.js'

export interface WechatHostDescribeRequest {}

export interface WechatGateDoorInfo {
  readonly bind: string
  readonly port: number
  readonly state: 'starting' | 'listening' | 'unavailable' | 'stopped'
  readonly errorCode: string | null
  readonly message: string | null
}

export interface WechatGateRuntimeInfo {
  readonly profileScope: string
  readonly source: 'legacy-default' | 'profile-derived' | 'environment-override'
  readonly publicDoor: WechatGateDoorInfo
  readonly localDoor: WechatGateDoorInfo
}

export interface WechatHostInfoConfig {
  readonly gateRuntime?: () => WechatGateRuntimeInfo
}

export interface WechatHostDescribeValue {
  readonly computerName: string
  readonly pluginVersion: string
  /** Additive v1 Agent-host identity; legacy clients safely ignore these fields. */
  readonly descriptorVersion: 1
  readonly hostId: string
  readonly agentInstanceId: string
  readonly agentKind: 'deepseek-harness'
  readonly agentName: 'DeepSeek Harness'
  readonly agentVersion: string
  readonly hostPlatform: HostPlatformDescriptor
  readonly capabilities: readonly AgentCapability[]
  /** Actual ports selected for this DSH profile; never assume 3092/3093. */
  readonly gate?: WechatGateRuntimeInfo
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
  private readonly gateRuntime?: WechatHostInfoConfig['gateRuntime']

  constructor(ctx: Context, config: WechatHostInfoConfig = {}) {
    super(ctx, 'wechatHost')
    this.gateRuntime = config.gateRuntime
  }

  @Remote('describe')
  async describe(
    request: WechatHostDescribeRequest,
    signal: AbortSignal,
  ): Promise<WechatHostDescribeResult> {
    void request
    signal.throwIfAborted()
    const descriptor = loadAgentDescriptor()
    return {
      ok: true,
      value: {
        computerName: hostname(),
        pluginVersion: installedPluginVersion(),
        descriptorVersion: descriptor.schemaVersion,
        hostId: descriptor.hostId,
        agentInstanceId: descriptor.agentInstanceId,
        agentKind: descriptor.agentKind,
        agentName: descriptor.agentName,
        agentVersion: descriptor.agentVersion,
        hostPlatform: descriptor.hostPlatform,
        capabilities: descriptor.capabilities,
        ...(this.gateRuntime ? { gate: this.gateRuntime() } : {}),
      },
    }
  }
}

export default WechatHostInfoService
