/** Launcher-owned facts, not a runtime router. No I/O except reading the
 * running host's package manifest; no sockets, discovery or background work. */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

export interface HostContext { get(name: string): unknown }
export interface DshProfileFacts {
  readonly name: string
  readonly home: string
  readonly dir: string
  readonly installAnchor: string
}
const profiles = new WeakMap<object, DshProfileFacts>()
const versions = new WeakMap<DshProfileFacts, string>()
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/

/** DSH supplies this service before mounting profile plugins. Missing is the
 * legacy compatibility case; malformed is NOT permission to use Web's state.
 * Retire absence fallback only when pre-profileContext hosts leave support. */
export function dshProfileFacts(ctx?: HostContext): DshProfileFacts | undefined {
  const value = ctx?.get('profileContext')
  if (value === undefined || value === null) {
    if (process.versions.electron) throw new Error('桌面宿主未提供运行实例信息，未使用 Web 配置')
    return
  }
  if (typeof value !== 'object') throw new Error('DSH 运行实例信息无效，未使用其他实例的配置')
  const cached = profiles.get(value)
  if (cached) return cached
  const row = value as Record<string, unknown>
  if (typeof row.name !== 'string' || !row.name || row.name.length > 80
      || /[\\/\u0000-\u001f]/.test(row.name) || ['.', '..', 'node_modules'].includes(row.name)
      || !['home', 'dir', 'installAnchor'].every(key => typeof row[key] === 'string'
        && path.isAbsolute(row[key] as string) && !(row[key] as string).includes('\0'))) {
    throw new Error('DSH 运行实例信息不完整，未使用其他实例的配置')
  }
  const facts = Object.freeze({ name: row.name, home: path.normalize(row.home as string),
    dir: path.normalize(row.dir as string), installAnchor: path.normalize(row.installAnchor as string) })
  profiles.set(value, facts)
  return facts
}

/** The Desktop launcher, not a CLI worker, owns its install/restart lifecycle. */
export function desktopOwnsLifecycle(ctx?: HostContext): boolean {
  return Boolean(process.versions.electron) || dshProfileFacts(ctx)?.name === 'desktop'
}

/** Prefer the actual bundled runtime. Never search PATH: another CLI on this
 * computer can have a different protocol from the running Desktop host. */
export function hostRuntimeVersion(ctx?: HostContext, entry = process.argv[1]): string | undefined {
  const profile = dshProfileFacts(ctx)
  if (profile) {
    const cached = versions.get(profile)
    if (cached) return cached
    let manifest: { name?: unknown; version?: unknown }
    try { manifest = JSON.parse(readFileSync(profile.installAnchor, 'utf8')) }
    catch { throw new Error('无法读取当前 DSH 的运行版本，未使用其他安装版本代替') }
    if (manifest.name !== '@deepseek-ai/dsh' || typeof manifest.version !== 'string'
        || !versionPattern.test(manifest.version)) throw new Error('当前 DSH 的运行版本信息无效')
    versions.set(profile, manifest.version)
    return manifest.version
  }
  // COMPAT: old CLI/source compositions do not expose profileContext. Retain
  // the running-entry ancestor lookup, without scanning other installations.
  if (!entry) return
  let directory: string
  try { directory = path.dirname(realpathSync(entry)) } catch { return }
  for (let depth = 0; depth < 8; depth++) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
      if (manifest.name === '@deepseek-ai/dsh') {
        if (typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) {
          throw new Error('invalid host version')
        }
        return manifest.version
      }
    } catch { /* old entry ancestor may not be a package */ }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
}
