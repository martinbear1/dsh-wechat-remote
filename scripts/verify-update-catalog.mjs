/** Release gate, read-only. Run AFTER publishing assets and BEFORE serving the
 * new catalog. Never infers compatibility from GitHub release notes. */
import fs from 'node:fs'
import { validateCatalog } from '../lib/update-policy.js'
import { downloadRelease, downloadNpmRelease } from '../lib/update-download.js'
const catalog = validateCatalog(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
if (catalog.expiresAt <= Date.now() || catalog.issuedAt > Date.now() + 300000) throw new Error('Catalog is not current')
const verified = []
for (const release of catalog.releases) {
  // Local research previews may have pending evidence. Do not serve that shape
  // to legacy catalog readers, which require nonempty evidence. This is a
  // publication gate, NEVER an OS/CPU admission rule for installing the plugin.
  if (!release.dsh.length || !release.platforms.length || !release.architectures.length) throw new Error('Record actual test evidence before publishing the catalog; unverified research metadata is local only')
  const response = await fetch(`https://api.github.com/repos/martinbear1/dsh-wechat-remote/releases/tags/v${release.version}`, {
    headers: { accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Release v${release.version} is not publicly available`)
  const github = await response.json()
  if (github.draft || github.tag_name !== `v${release.version}` || Boolean(github.prerelease) !== (release.channel === 'preview')) throw new Error('Release channel does not match the catalog')
  if (release.asset) {
    const asset = github.assets.find(a => a.browser_download_url === release.asset.url)
    if (!asset || asset.size !== release.asset.bytes || asset.state !== 'uploaded') throw new Error('Release asset mismatch')
    // Check EACH published source. Automatic fallback must not hide a broken
    // GitHub asset from legacy clients before this catalog goes live.
    await downloadRelease({ ...release, npmInstaller: undefined })
    if (release.npmInstaller) await downloadNpmRelease(release)
  }
  verified.push({ version: release.version, channel: release.channel, assetVerified: Boolean(release.asset), npmVerified: Boolean(release.npmInstaller) })
}
console.log(JSON.stringify({ revision: catalog.revision, verified, ok: true }, null, 2))
