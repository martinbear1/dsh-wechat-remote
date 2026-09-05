/** Shared host/cloud policy evaluator. Never shipped to the mini-program.
 * Compatibility is positive evidence (explicit versions), not guessed semver
 * intervals: prereleases between two tested RCs are NOT implicitly supported.
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
  asset?: { url: string; sha256: string; bytes: number }
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
        || !strings(r.dsh) || !r.dsh.length || !r.dsh.every(validVersion)
        || !strings(r.platforms, 3) || !r.platforms.length || !r.platforms.every(p => ['windows', 'macos', 'linux'].includes(p))
        || !strings(r.architectures, 4) || !r.architectures.length || !r.architectures.every(a => ['x64', 'arm64'].includes(a))
        || (r.asset && !trustedReleaseAsset(r.asset, r.version))) throw new Error('Invalid release entry')
    versions.add(r.version)
  }
  for (const b of c.blocked) if (!b || !validVersion(b.pluginVersion)
    || typeof b.reason !== 'string' || !b.reason || b.reason.length > 240
    || (b.dsh && !strings(b.dsh)) || (b.platforms && !strings(b.platforms, 3))) throw new Error('Invalid blocked entry')
  if (!c.retiredDsh.every(validVersion)) throw new Error('Invalid retired DSH')
  if (c.manualUpgradePlugins && (!strings(c.manualUpgradePlugins) || !c.manualUpgradePlugins.every(validVersion))) throw new Error('Invalid manual-upgrade plugins')
  return c
}
export function releaseMatches(r: Release, current: RuntimeVersion): boolean {
  return r.dsh.includes(current.agentVersion) && r.platforms.includes(current.platform)
    && (!current.arch || r.architectures.includes(current.arch))
}
export function assessUpdate(raw: unknown, current: RuntimeVersion, now = Date.now(), preview = false): UpdateAdvice {
  const base: UpdateAdvice = { schemaVersion: 1, revision: '', checkedAt: now, expiresAt: now,
    severity: 'unknown', component: 'none', code: 'unavailable', label: '暂未完成检查',
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
  const target = c.releases.filter(r => (r.channel === 'stable' || preview) && releaseMatches(r, current)
    && !blocked(r.version) && compareVersions(r.version, current.pluginVersion) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  const issue = blocked(current.pluginVersion)
  if (target) {
    const manual = c.manualUpgradePlugins?.includes(current.pluginVersion) ? {
      manualUpdate: `此旧插件没有检查更新和一键更新功能。首次需在节点所在电脑，按目标版本 ${target.version} 的发布说明手工升级插件，并使用原来的 DSH_HOME 和 profile 重启。不要删除节点或重新配对；升级后才可使用一键更新。`,
    } : {}
    if (!current.arch) return { ...base, ...manual, severity: 'recommended', component: 'plugin', code: 'plugin-check-host', label: '插件可更新',
      message: `插件 ${target.version} 的版本条件与当前 DSH 匹配，但旧节点未上报主机架构。请到此主机 WebUI 检查确认后更新插件；无需先更新 DSH。`,
      targetVersion: target.version, releaseUrl: `${RELEASE_REPOSITORY}/releases/tag/v${target.version}` }
    // Known incompatible/withdrawn pair => required; lack of evidence alone is not a hard failure.
    const required = Boolean(issue || (own && !compatible))
    return { ...base, ...manual, severity: required ? 'required' : compatible ? 'info' : 'recommended', component: 'plugin',
      code: required ? 'plugin-required' : 'plugin-available', label: required ? '必须更新插件' : '插件可更新',
      message: (issue?.reason || (required ? '当前插件不在此 DSH / 主机组合的支持范围内。' : compatible ? '当前组合受支持。' : '当前插件组合尚未验证。'))
        + `插件 ${target.version} 已支持当前 DSH；仅更新插件，无需更新 DSH。`,
      targetVersion: target.version, releaseUrl: `${RELEASE_REPOSITORY}/releases/tag/v${target.version}` }
  }
  if (issue) return { ...base, severity: 'required', component: 'plugin', code: 'blocked-no-target', label: '插件需处理',
    message: `${issue.reason}暂无可安全自动安装的匹配版本，请查看发布说明；不会自动升级或降级 DSH。`, releaseUrl: `${RELEASE_REPOSITORY}/releases` }
  if (compatible) return { ...base, severity: 'none', code: 'compatible', label: '当前组合受支持', message: '当前组合在兼容清单内，暂未发现适用的更新。' }
  if (c.retiredDsh.includes(current.agentVersion)) return { ...base, severity: 'required', component: 'agent', code: 'agent-retired', label: '需要更新 DSH',
    message: '此 DSH 版本已停止支持。请在主机上按兼容发布说明升级 DSH 和连接插件；不会自动修改 DSH。', releaseUrl: `${RELEASE_REPOSITORY}/releases` }
  return { ...base, code: 'unverified', label: '此组合尚未验证',
    message: '没有足够的兼容证据或匹配的正式更新。这不等于节点离线，也不表示必须升级或降级 DSH。', releaseUrl: `${RELEASE_REPOSITORY}/releases` }
}
