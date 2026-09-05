/** Release gate, read-only. Run AFTER publishing assets and BEFORE serving the
 * new catalog. Never infers compatibility from GitHub release notes. */
import fs from 'node:fs'
import { validateCatalog } from '../lib/update-policy.js'
import { downloadRelease } from '../lib/update-download.js'
const catalog = validateCatalog(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
if (catalog.expiresAt <= Date.now() || catalog.issuedAt > Date.now() + 300000) throw new Error('Catalog is not current')
const verified = []
for (const release of catalog.releases) {
  const response = await fetch(`https://api.github.com/repos/martinbear1/dsh-wechat-remote/releases/tags/v${release.version}`, {
    headers: { accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Release v${release.version} is not publicly available`)
  const github = await response.json()
  if (github.draft || github.tag_name !== `v${release.version}` || Boolean(github.prerelease) !== (release.channel === 'preview')) throw new Error('Release channel does not match the catalog')
  if (release.asset) {
    const asset = github.assets.find(a => a.browser_download_url === release.asset.url)
    if (!asset || asset.size !== release.asset.bytes || asset.state !== 'uploaded') throw new Error('Release asset mismatch')
    await downloadRelease(release)
  }
  verified.push({ version: release.version, channel: release.channel, assetVerified: Boolean(release.asset) })
}
console.log(JSON.stringify({ revision: catalog.revision, verified, ok: true }, null, 2))
