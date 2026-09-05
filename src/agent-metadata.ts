import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js'
import { hostPlatformDescriptor, type HostPlatformDescriptor } from './host-platform.js'
import { adapterDshHome } from './dsh-runtime.js'

export interface AgentCapability {
  readonly id: string
  readonly version: number
}

export interface AgentDescriptor {
  readonly schemaVersion: 1
  readonly hostId: string
  readonly agentInstanceId: string
  readonly hostName: string
  readonly agentKind: 'deepseek-harness'
  readonly agentName: 'DeepSeek Harness'
  readonly agentVersion: string
  readonly hostPlatform: HostPlatformDescriptor
  readonly capabilities: readonly AgentCapability[]
}

interface StableMetadata {
  readonly version: 1
  readonly id: string
}

const ROOT = path.join(adapterDshHome(), 'harness-remote')
const HOST_PATH = path.join(ROOT, 'host.json')
let cachedDescriptor: AgentDescriptor | null = null

export const AGENT_CAPABILITIES: readonly AgentCapability[] = Object.freeze([
  Object.freeze({ id: 'dsh.rpc', version: 1 }),
  Object.freeze({ id: 'dsh.realtime', version: 1 }),
  Object.freeze({ id: 'wechat.directory', version: 1 }),
  Object.freeze({ id: 'wechat.history-window', version: 1 }),
  Object.freeze({ id: 'wechat.attachment-object', version: 1 }),
  Object.freeze({ id: 'harness.public-relay-e2ee', version: 1 }),
  Object.freeze({ id: 'harness.lan-bootstrap', version: 1 }),
  Object.freeze({ id: 'harness.host-platform', version: 1 }),
  Object.freeze({ id: 'harness.oss-e2ee-objects', version: 1 }),
])

function stableId(file: string): string {
  if (existsSync(file)) {
    const stored = readPrivateJson<StableMetadata>(file)
    if (stored.version !== 1 || !/^[A-Za-z0-9_-]{20,64}$/.test(stored.id)) {
      throw new Error(`Harness Remote metadata is invalid: ${path.basename(file)}`)
    }
    return stored.id
  }
  const id = randomBytes(18).toString('base64url')
  writePrivateJsonAtomic(file, { version: 1, id })
  return id
}

/** Installed DSH profile name without exposing its filesystem path. */
export function agentProfileScope(): string {
  return resolveAgentProfileScope(fileURLToPath(import.meta.url), process.argv, adapterDshHome())
}

export function resolveAgentProfileScope(modulePath: string, argv: readonly string[], dshHome: string): string {
  const valid = (value: string | undefined): value is string => Boolean(value)
    && value!.length <= 80 && !/[\\/\u0000-\u001f]/.test(value!)
    && value !== '.' && value !== '..' && value !== 'node_modules'
  // Explicit launch arguments also cover linked packages whose real module
  // path lives outside the profile's pnpm tree.
  for (let index = 2; index < argv.length && argv[index] !== '--'; index++) {
    const arg = argv[index]
    const candidate = arg === '--profile' ? argv[index + 1]
      : arg.startsWith('--profile=') ? arg.slice('--profile='.length) : undefined
    if (valid(candidate)) return candidate
  }
  const relative = path.relative(path.join(dshHome, 'profiles'), modulePath)
  const parts = relative.split(/[\\/]/)
  if (valid(parts[0]) && parts[1] === 'node_modules') return parts[0]
  if (argv[2] === 'web') return 'web'
  return 'default'
}

function instanceStorageKey(profileScope = agentProfileScope()): string {
  return createHash('sha256')
    .update(`deepseek-harness\0${profileScope}`)
    .digest('hex')
    .slice(0, 24)
}

/**
 * Keep the historic web/default credential path so an upgrade never unpairs
 * existing users. Every additional DSH profile gets an isolated state file;
 * otherwise installing a test profile can silently rotate the production
 * profile's LAN token and WeChat binding.
 */
export function gateStatePathForProfile(
  profileScope: string,
  homeDirectory = homedir(),
  dshHome = path.join(homeDirectory, '.dsh'),
): string {
  const normalized = profileScope.trim().toLowerCase()
  if (normalized === 'web' || normalized === 'default') {
    return path.join(dshHome, 'gate-wechat-state.json')
  }
  return path.join(
    dshHome,
    'harness-remote',
    'instances',
    instanceStorageKey(profileScope),
    'gate-wechat-state.json',
  )
}

export function defaultGateStatePath(): string {
  return gateStatePathForProfile(agentProfileScope(), homedir(), adapterDshHome())
}

export function defaultAgentIdentityPath(): string {
  const scope = agentProfileScope()
  // Preserve an existing default web nodeId and its cloud ownership.
  if (scope === 'web' || scope === 'default') {
    return path.join(adapterDshHome(), 'harness-remote-public-identity.json')
  }
  return path.join(ROOT, 'instances', instanceStorageKey(scope), 'identity.json')
}

function packageVersionFromAncestors(start: string): string | null {
  let current = path.resolve(start)
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = path.join(current, 'package.json')
    try {
      const value = JSON.parse(readFileSync(manifest, 'utf8')) as {
        readonly name?: unknown
        readonly version?: unknown
      }
      if (value.name === '@deepseek-ai/dsh' && typeof value.version === 'string' && value.version) {
        return value.version
      }
    } catch { /* continue walking */ }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/** DSH CLI version, not the plugin adapter version and not host.describe's protocol version. */
export function installedDshVersion(): string {
  const override = process.env.DSH_RUNTIME_VERSION
  if (override && /^[A-Za-z0-9._+-]{1,64}$/.test(override)) return override
  const argvEntry = process.argv[1]
  if (argvEntry) {
    let resolvedEntry = argvEntry
    try { resolvedEntry = realpathSync(argvEntry) } catch { /* use argv path */ }
    const found = packageVersionFromAncestors(path.dirname(resolvedEntry))
    if (found) return found
  }
  for (const entry of String(process.env.PATH || '').split(path.delimiter)) {
    if (!entry) continue
    try {
      const command = path.join(entry, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
      const found = packageVersionFromAncestors(path.dirname(realpathSync(command)))
      if (found) return found
    } catch { /* keep searching */ }
    try {
      const value = JSON.parse(readFileSync(
        path.join(entry, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
        'utf8',
      )) as { readonly name?: unknown; readonly version?: unknown }
      if (value.name === '@deepseek-ai/dsh' && typeof value.version === 'string' && value.version) {
        return value.version
      }
    } catch { /* keep searching */ }
  }
  return 'unknown'
}

export function loadAgentDescriptor(): AgentDescriptor {
  if (cachedDescriptor) return cachedDescriptor
  const instancePath = path.join(ROOT, 'instances', instanceStorageKey(), 'agent.json')
  cachedDescriptor = {
    schemaVersion: 1,
    hostId: stableId(HOST_PATH),
    agentInstanceId: stableId(instancePath),
    hostName: hostname(),
    agentKind: 'deepseek-harness',
    agentName: 'DeepSeek Harness',
    agentVersion: installedDshVersion(),
    hostPlatform: hostPlatformDescriptor(),
    capabilities: AGENT_CAPABILITIES,
  }
  return cachedDescriptor
}
