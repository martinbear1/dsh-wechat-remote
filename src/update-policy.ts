/** Shared host/cloud policy evaluator. Never shipped to the mini-program.
 * Tested DSH/OS/CPU combinations are evidence, NOT installation admission rules.
 * Offer newer releases independently of that evidence; the host checks actual
 * save/install/restart capabilities before mutation. Only explicit known failures
 * or withdrawn releases exclude a target. Never guess failures from missing tests.
 */
export const UPDATE_SCHEMA = 1
export const RELEASE_REPOSITORY = 'https://github.com/martinbear1/dsh-wechat-remote'
export type Severity = 'none' | 'info' | 'recommended' | 'required' | 'unknown'
export interface RuntimeVersion {
  agentKind: string; agentVersion: string; pluginVersion: string; platform: string; arch?: string
}
export interface Release {
  version: string
  channel: 'stable' | 'preview'
  dsh: string[]
  platforms: string[]
  architectures: string[]
  // Optional precise evidence for display/auditing ONLY, never an update allowlist.
  // Older records use the Cartesian product above to describe tested combinations.
  // A preview awaiting hardware tests may leave all three evidence lists empty.
  targets?: { platform: string; arch: string; dsh: string[] }[]
  asset?: { url: string; sha256: string; bytes: number }
  // COMPAT(updater <= 1.7.8): keep asset as the canonical GitHub plugin.
  // Old readers ignore this optional source; remove the legacy assumption only
  // after those updaters are retired. Installer-only releases may differ in version.
  npmInstaller?: { version: string; url: string; sha256: string; bytes: number }
}
export interface UpdateCatalog {
  schemaVersion: 1; revision: string; issuedAt: number; expiresAt: number
  releases: Release[]
  blocked: { pluginVersion: string; dsh?: string[]; platforms?: string[]; reason: string }[]
  // Explicitly retired DSHs only; an unknown future DSH is never "too old".
  retiredDsh: string[]
  // Published plugins that predate the local updater. Evaluated here, not in clients.
  manualUpgradePlugins?: string[]
}
export interface UpdateAdvice {
  schemaVersion: 1; revision: string; checkedAt: number; expiresAt: number
  severity: Severity; component: 'plugin' | 'agent' | 'none'; code: string
  label: string; message: string; targetVersion?: string
  current: RuntimeVersion
  releaseUrl?: string
  manualUpdate?: string
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/
function validVersion(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false
  const match = versionPattern.exec(value)
  return Boolean(match && !(match[4] || '').split('.').some(p => /^0\d+$/.test(p))
    && (!value.includes('+') || /^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(value.split('+')[1])))
}
export function compareVersions(a: string, b: string): number {
  if (!validVersion(a) || !validVersion(b)) throw new Error('Invalid version')
  const x = versionPattern.exec(a), y = versionPattern.exec(b)
  if (!x || !y) throw new Error('Invalid version')
  for (let i = 1; i <= 3; i++) if (x[i] !== y[i]) return BigInt(x[i]) > BigInt(y[i]) ? 1 : -1
  if (!x[4] || !y[4]) return x[4] === y[4] ? 0 : !x[4] ? 1 : -1
  const xp = x[4].split('.'), yp = y[4].split('.')
  for (let i = 0; i < Math.max(xp.length, yp.length); i++) {
    if (xp[i] === yp[i]) continue
    if (xp[i] === undefined || yp[i] === undefined) return xp[i] === undefined ? -1 : 1
    const xn = /^\d+$/.test(xp[i]), yn = /^\d+$/.test(yp[i])
    if (xn && yn) return BigInt(xp[i]) > BigInt(yp[i]) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return xp[i] > yp[i] ? 1 : -1
  }
  return 0
}
export function trustedReleaseAsset(asset: Release['asset'], version: string): boolean {
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes)
      || asset.bytes < 1 || asset.bytes > 32 * 1024 * 1024) return false
  try {
    const u = new URL(asset.url)
    return u.origin === 'https://github.com' && !u.username && !u.password && !u.search && !u.hash
      && u.pathname.startsWith(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`)
      && /^[-A-Za-z0-9_.]+\.tgz$/.test(u.pathname.slice(`/martinbear1/dsh-wechat-remote/releases/download/v${version}/`.length))
  } catch { return false }
}
export function trustedNpmInstaller(source: Release['npmInstaller']): boolean {
  if (!source || !validVersion(source.version) || !/^[a-f0-9]{64}$/.test(source.sha256)
      || !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 32 * 1024 * 1024) return false
  // Exact immutable package/version, never a dist-tag, user URL or arbitrary mirror.
  return source.url === `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${source.version}.tgz`
}
export function validateCatalog(value: unknown): UpdateCatalog {
  const c = value as UpdateCatalog
  const strings = (v: unknown, max = 100): v is string[] => Array.isArray(v) && v.length <= max
    && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 100)
  if (!c || c.schemaVersion !== 1 || typeof c.revision !== 'string' || !/^[\w.-]{1,80}$/.test(c.revision)
      || !Number.isSafeInteger(c.issuedAt) || !Number.isSafeInteger(c.expiresAt)
      || c.expiresAt <= c.issuedAt || c.expiresAt - c.issuedAt > 32 * 86400000
      || !Array.isArray(c.releases) || c.releases.length > 100
      || !Array.isArray(c.blocked) || c.blocked.length > 100 || !strings(c.retiredDsh)) throw new Error('Invalid update catalog')
  const versions = new Set<string>()
  for (const r of c.releases) {
    if (!r || !validVersion(r.version) || versions.has(r.version)
        || !['stable', 'preview'].includes(r.channel) || (r.channel === 'stable' && versionPattern.exec(r.version)![4])
        || !strings(r.dsh) || !r.dsh.every(validVersion)
        || !strings(r.platforms, 3) || !r.platforms.every(p => ['windows', 'macos', 'linux'].includes(p))
        || !strings(r.architectures, 32) || !r.architectures.every(a => /^[a-z0-9_-]{1,32}$/.test(a))
        || (r.asset && !trustedReleaseAsset(r.asset, r.version))
        || (r.npmInstaller !== undefined && (!r.asset || !trustedNpmInstaller(r.npmInstaller)))) throw new Error('Invalid release entry')
    const hasEvidence = r.dsh.length > 0 && r.platforms.length > 0 && r.architectures.length > 0
    const pendingPreview = r.channel === 'preview' && Boolean(versionPattern.exec(r.version)![4])
      && r.dsh.length === 0 && r.platforms.length === 0 && r.architectures.length === 0
    if (!hasEvidence && !pendingPreview) throw new Error('Invalid release evidence')
    versions.add(r.version)
    if (r.targets !== undefined) {
      if (!Array.isArray(r.targets) || !r.targets.length || r.targets.length > 12) throw new Error('Invalid release targets')
      const seen = new Set<string>()
      for (const target of r.targets) {
        const key = `${target?.platform}:${target?.arch}`
        if (!target || !r.platforms.includes(target.platform) || !r.architectures.includes(target.arch)
            || !strings(target.dsh) || !target.dsh.length || !target.dsh.every(v => r.dsh.includes(v))
            || seen.has(key)) throw new Error('Invalid release target')
        seen.add(key)
      }
    }
  }
  for (const b of c.blocked) if (!b || !validVersion(b.pluginVersion)
    || typeof b.reason !== 'string' || !b.reason || b.reason.length > 240
    || (b.dsh && !strings(b.dsh)) || (b.platforms && !strings(b.platforms, 3))) throw new Error('Invalid blocked entry')
  if (!c.retiredDsh.every(validVersion)) throw new Error('Invalid retired DSH')
  if (c.manualUpgradePlugins && (!strings(c.manualUpgradePlugins) || !c.manualUpgradePlugins.every(validVersion))) throw new Error('Invalid manual-upgrade plugins')
  return c
}
export function releaseMatches(r: Release, current: RuntimeVersion): boolean {
  // Evidence lookup only. Do not call this when selecting or authorizing an update.
  return r.dsh.includes(current.agentVersion) && r.platforms.includes(current.platform)
    && Boolean(current.arch && r.architectures.includes(current.arch))
    && (!r.targets || r.targets.some(t => t.platform === current.platform
      && (!current.arch || t.arch === current.arch) && t.dsh.includes(current.agentVersion)))
}
export function assessUpdate(raw: unknown, current: RuntimeVersion, now = Date.now(), preview = false): UpdateAdvice {
  const base: UpdateAdvice = { schemaVersion: 1, revision: '', checkedAt: now, expiresAt: now,
    severity: 'unknown', component: 'none', code: 'unavailable', label: '暂时无法检查更新',
    message: '兼容信息暂不可用，不影响现有连接；请稍后重试。', current }
  let c: UpdateCatalog
  try { c = validateCatalog(raw) } catch { return base }
  base.revision = c.revision; base.expiresAt = c.expiresAt
  if (c.expiresAt <= now || c.issuedAt > now + 300000) return { ...base, code: 'stale', label: '检查信息已过期' }
  if (!['dsh', 'deepseek-harness'].includes(current.agentKind)) return { ...base, code: 'unknown-agent', label: '尚未提供兼容信息' }
  if (!validVersion(current.agentVersion) || !validVersion(current.pluginVersion)
      || !['windows', 'macos', 'linux'].includes(current.platform)) return { ...base, code: 'missing-version', label: '版本信息不完整' }
  const blocked = (version: string) => c.blocked.find(b => b.pluginVersion === version
    && (!b.dsh || b.dsh.includes(current.agentVersion)) && (!b.platforms || b.platforms.includes(current.platform)))
  const own = c.releases.find(r => r.version === current.pluginVersion)
  const compatible = Boolean(current.arch && own && releaseMatches(own, current) && !blocked(own.version))
  if (c.retiredDsh.includes(current.agentVersion)) return { ...base, severity: 'required', component: 'agent', code: 'agent-retired', label: '需要更新 DSH',
    message: '此 DSH 版本已停止支持。请在主机上按发布说明升级 DSH；不会自动修改 DSH。', releaseUrl: `${RELEASE_REPOSITORY}/releases` }
  const target = c.releases.filter(r => (r.channel === 'stable' || preview)
    && !blocked(r.version) && compareVersions(r.version, current.pluginVersion) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  const issue = blocked(current.pluginVersion)
  if (target) {
    const manual = c.manualUpgradePlugins?.includes(current.pluginVersion) ? {
      manualUpdate: `此旧插件没有检查更新和一键更新功能。首次需在节点所在电脑，按目标版本 ${target.version} 的发布说明手工升级插件，并使用原来的 DSH_HOME 和 profile 重启。不要删除节点或重新配对；升级后才可使用一键更新。`,
    } : {}
    // Known incompatible/withdrawn pair => required; lack of evidence alone is not a hard failure.
    // A positive compatibility list is not a complete list of failures. Only
    // explicit withdrawn/broken combinations justify a mandatory update.
    const required = Boolean(issue)
    return { ...base, ...manual, severity: required ? 'required' : compatible ? 'info' : 'recommended', component: 'plugin',
      code: required ? 'plugin-required' : 'plugin-available', label: required ? '必须更新插件' : '插件可更新',
      message: (issue ? issue.reason + '。' : '')
        + `可更新至插件 ${target.version}；更新前会检查当前主机的安装与重启条件，不会更换 DSH 本体。`,
      targetVersion: target.version, releaseUrl: `${RELEASE_REPOSITORY}/releases/tag/v${target.version}` }
  }
  if (issue) return { ...base, severity: 'required', component: 'plugin', code: 'blocked-no-target', label: '插件需处理',
    message: `${issue.reason}暂无可安全自动安装的匹配版本，请查看发布说明；不会自动升级或降级 DSH。`, releaseUrl: `${RELEASE_REPOSITORY}/releases` }
  if (compatible) return { ...base, severity: 'none', code: 'compatible', label: '暂无可用更新', message: '当前组合已验证，暂未发现适用于此 DSH 和主机的更新。' }
  return { ...base, severity: 'none', code: 'no-update', label: '暂无可用更新',
    message: '当前通道暂无更高版本，不影响继续使用。', releaseUrl: `${RELEASE_REPOSITORY}/releases` }
}
