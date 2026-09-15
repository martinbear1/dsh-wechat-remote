import { validateCatalog, compareVersions, trustedReleaseAsset } from '../lib/update-policy.js'

/** Explicit CLI installation is not an automatic-update recommendation.
 * Tested DSH/platform/architecture lists describe evidence, not admission.
 * Keep trusted artifacts, explicit withdrawals and the no-downgrade floor.
 */
export function selectInstallTarget(pinned, remote, current, now = Date.now()) {
  const local = validateCatalog(pinned.catalog)
  // Choosing an explicit prerelease installer authorizes its exact embedded
  // preview, not arbitrary remote previews or a change to stable recommendations.
  const channel = pinned.version.includes('-') ? 'preview' : 'stable'
  const bundled = local.releases.find(r => r.version === pinned.version && r.channel === channel)
  if (!bundled || !trustedReleaseAsset(bundled.asset, bundled.version)) {
    throw new Error('安装包信息不完整，请重新获取官方安装器。')
  }
  let online
  try {
    const candidate = validateCatalog(remote)
    if (candidate.issuedAt <= now + 300000 && candidate.expiresAt > now) online = candidate
  } catch { /* The authenticated npm package remains usable without the catalog. */ }

  // An installer never silently substitutes an older plugin than its own bundle.
  // Keep the bundled bytes/hash for the same version even if remote metadata differs.
  const candidates = [bundled, ...(online?.releases || []).filter(r => r.channel === 'stable'
    && compareVersions(r.version, bundled.version) > 0 && trustedReleaseAsset(r.asset, r.version))]
    .sort((a, b) => compareVersions(b.version, a.version))
  const rules = [...local.blocked, ...(online?.blocked || [])]
  const blocked = release => rules.find(b => b.pluginVersion === release.version
    && (!b.dsh || b.dsh.includes(current.agentVersion))
    && (!b.platforms || b.platforms.includes(current.platform)))
  const release = candidates.find(r => !blocked(r))
  if (!release) {
    throw new Error(`当前插件存在已知不兼容问题：${blocked(bundled).reason}；未替换现有插件。`)
  }
  return release
}
