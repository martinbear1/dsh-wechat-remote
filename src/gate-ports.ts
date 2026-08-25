import { createHash } from 'node:crypto'

const LEGACY_PUBLIC_PORT = 3092
const LEGACY_LOCAL_PORT = 3093
const DYNAMIC_PORT_BASE = 32_000
const DYNAMIC_PORT_PAIRS = 4_000

export interface GatePortEnvironment {
  readonly WECHAT_GATE_PORT?: string
  readonly WECHAT_GATE_LOCAL_PORT?: string
}

export interface GatePorts {
  readonly profileScope: string
  readonly publicPort: number
  readonly localPort: number
  readonly source: 'legacy-default' | 'profile-derived' | 'environment-override'
  readonly warnings: readonly string[]
}

export interface GateListenFailure {
  readonly code: string
  readonly message: string
}

function validPort(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  if (!/^\d{1,5}$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : null
}

function isLegacyProfile(profileScope: string): boolean {
  const normalized = profileScope.trim().toLowerCase()
  return normalized === 'web' || normalized === 'default'
}

/**
 * Select the two loopback/LAN gateway ports without probing or binding.
 *
 * The historic web/default profile remains exactly 3092/3093. Additional DSH
 * profiles get a stable even/odd pair in 32000..39999, derived from both their
 * profile scope and durable Agent instance id. This stays below Windows'
 * default dynamic/ephemeral range (normally beginning at 49152). Explicit
 * environment variables always win independently.
 */
export function deriveGatePorts(
  profileScope: string,
  agentInstanceId: string,
  environment: GatePortEnvironment = process.env,
): GatePorts {
  const warnings: string[] = []
  const legacy = isLegacyProfile(profileScope)
  const digest = createHash('sha256')
    .update(`harness-remote-gate-v1\0${profileScope}\0${agentInstanceId}`)
    .digest()
  const pair = digest.readUInt32BE(0) % DYNAMIC_PORT_PAIRS
  const derivedPublic = legacy ? LEGACY_PUBLIC_PORT : DYNAMIC_PORT_BASE + pair * 2
  const derivedLocal = legacy ? LEGACY_LOCAL_PORT : derivedPublic + 1

  const publicOverride = validPort(environment.WECHAT_GATE_PORT)
  const localOverride = validPort(environment.WECHAT_GATE_LOCAL_PORT)
  if (environment.WECHAT_GATE_PORT && publicOverride === null) {
    warnings.push(`忽略无效的 WECHAT_GATE_PORT=${environment.WECHAT_GATE_PORT}`)
  }
  if (environment.WECHAT_GATE_LOCAL_PORT && localOverride === null) {
    warnings.push(`忽略无效的 WECHAT_GATE_LOCAL_PORT=${environment.WECHAT_GATE_LOCAL_PORT}`)
  }

  const publicPort = publicOverride ?? derivedPublic
  const localPort = localOverride ?? derivedLocal
  if (publicPort === localPort) {
    warnings.push(`公网门与本地门都配置为 ${publicPort}；其中一扇门将无法监听`)
  }
  return {
    profileScope,
    publicPort,
    localPort,
    source: publicOverride !== null || localOverride !== null
      ? 'environment-override'
      : legacy ? 'legacy-default' : 'profile-derived',
    warnings,
  }
}

/** Stable, user-actionable diagnostics for a door-level listen failure. */
export function describeGateListenFailure(
  role: 'public' | 'local',
  bind: string,
  port: number,
  error: { readonly code?: unknown; readonly message?: unknown } | unknown,
): GateListenFailure {
  const value = error && typeof error === 'object'
    ? error as { readonly code?: unknown; readonly message?: unknown }
    : {}
  const code = typeof value.code === 'string' ? value.code : 'LISTEN_FAILED'
  const label = role === 'local' ? '本机配对门' : '局域网门'
  const override = role === 'local' ? 'WECHAT_GATE_LOCAL_PORT' : 'WECHAT_GATE_PORT'
  if (code === 'EADDRINUSE') {
    return {
      code,
      message: `${bind}:${port} 已被其他进程或 DSH profile 占用；当前 Agent 的${label}已停用。可设置 ${override} 后重启 DSH。`,
    }
  }
  if (code === 'EACCES') {
    return { code, message: `${bind}:${port} 无监听权限；当前 Agent 的${label}已停用。` }
  }
  const detail = typeof value.message === 'string' && value.message ? value.message : String(error)
  return { code, message: `${bind}:${port} 监听失败：${detail}` }
}
