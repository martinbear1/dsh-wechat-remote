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
import { agentDshHome, agentProfileScope, loadAgentDescriptor, startupDirectory, type AgentCapability } from './agent-metadata.js'
import type { HostPlatformDescriptor } from './host-platform.js'
import { PLUGIN_VERSION } from './plugin-version.js'
import { readOtherEndpointInfo, type OtherEndpointInfo } from './other-endpoint-info.js'
import type { ScheduledStatus } from './scheduled-tasks/protocol.js'
export type { OtherEndpointInfo } from './other-endpoint-info.js'

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
  readonly management?: 'authenticated-rpc' | 'loopback' | 'unavailable'
  readonly diagnostics?: 'read-only-v1'
  readonly updates?: 'native-v1'
  readonly source: 'legacy-default' | 'profile-derived' | 'environment-override'
  readonly publicDoor: WechatGateDoorInfo
  readonly localDoor: WechatGateDoorInfo
}

export interface WechatHostInfoConfig {
  readonly gateRuntime?: () => WechatGateRuntimeInfo
  readonly privateUpdatesReady?: () => boolean
}

export interface WechatHostDescribeValue {
  readonly startupDirectory: { path: string; usable: boolean }
  readonly computerName: string
  readonly pluginVersion: string
  readonly installedPluginVersion?: string
  readonly hostArch: string
  readonly updateProtocolVersion: 1
  /** Additive v1 Agent-host identity; legacy clients safely ignore these fields. */
  readonly descriptorVersion: 1
  readonly hostId: string
  readonly agentInstanceId: string
  readonly agentKind: 'deepseek-harness'
  readonly agentName: string
  readonly agentVersion: string
  readonly hostPlatform: HostPlatformDescriptor
  readonly capabilities: readonly AgentCapability[]
  /** Optional, synchronous snapshot of the native Schedule service switch.
   * Omitted on older adapters; clients keep their existing status fallback. */
  readonly schedules?: ScheduledStatus
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
  private readonly privateUpdatesReady?: WechatHostInfoConfig['privateUpdatesReady']

  constructor(ctx: Context, config: WechatHostInfoConfig = {}) {
    super(ctx, 'wechatHost')
    this.gateRuntime = config.gateRuntime
    this.privateUpdatesReady = config.privateUpdatesReady
  }

  /** Explicit, optional read via the existing authenticated DSH channel only. */
  @Remote('otherEndpoint')
  async otherEndpoint(request: WechatHostDescribeRequest, signal: AbortSignal): Promise<OtherEndpointInfo> {
    void request
    return readOtherEndpointInfo({ home: agentDshHome(this.ctx), scope: agentProfileScope(this.ctx), signal })
  }

  @Remote('describe')
  async describe(
    request: WechatHostDescribeRequest,
    signal: AbortSignal,
  ): Promise<WechatHostDescribeResult> {
    void request
    signal.throwIfAborted()
    const descriptor = loadAgentDescriptor(this.ctx)
    const schedulesService = this.ctx.get('wechatSchedules')
    let schedules: ScheduledStatus | undefined
    // Auxiliary UI metadata must never block an otherwise healthy connection.
    // This local accessor does not touch tasks, storage or another endpoint.
    try { schedules = schedulesService?.status?.() } catch { /* fall back to the optional status RPC */ }
    return {
      ok: true,
      value: {
        startupDirectory: startupDirectory(this.ctx),
        computerName: hostname(),
        pluginVersion: PLUGIN_VERSION,
        installedPluginVersion: installedPluginVersion(),
        hostArch: process.arch,
        updateProtocolVersion: 1,
        descriptorVersion: descriptor.schemaVersion,
        hostId: descriptor.hostId,
        agentInstanceId: descriptor.agentInstanceId,
        agentKind: descriptor.agentKind,
        agentName: descriptor.agentName,
        agentVersion: descriptor.agentVersion,
        hostPlatform: descriptor.hostPlatform,
        capabilities: [...descriptor.capabilities, ...(this.privateUpdatesReady?.() ? [{ id: 'human.private-updates', version: 1 }] : []),
          ...((this.ctx.get('wechatClawbot') as { available?: () => boolean } | undefined)?.available?.() ? [{ id: 'wechat.clawbot', version: 1 }] : []),
          // Availability of our client adapter is separate from the native
          // automation plugin's switch, carried in the lightweight snapshot.
          ...(schedulesService ? [{ id: 'dsh.schedules', version: 1 }] : [])],
        ...(schedules ? { schedules } : {}),
        ...(this.gateRuntime ? { gate: this.gateRuntime() } : {}),
      },
    }
  }
}

export default WechatHostInfoService
