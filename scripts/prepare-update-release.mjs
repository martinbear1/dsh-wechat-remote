/** Offline release gate. Input FINAL npm-packed artifacts; emit metadata only
 * after proving the installer embeds exactly the standalone plugin. The npm
 * descriptor stays outside the installer to avoid a self-referential hash.
 * Usage: node scripts/prepare-update-release.mjs plugin.tgz installer.tgz out.json
 * Publishing still requires verify-update-catalog.mjs against both live sources. */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { auditArchive, pluginFromInstaller } from '../lib/update-download.js'
import { validateCatalog } from '../lib/update-policy.js'

const [pluginPath, installerPath, outputPath] = process.argv.slice(2)
if (!pluginPath || !installerPath || !outputPath) throw Error('Provide plugin, installer and output paths')
const field = (archive, name) => JSON.parse(execFileSync('tar', ['-xOf', archive, `package/${name}`], {
  encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024,
}))
const metadata = field(installerPath, 'assets/release.json')
const installer = field(installerPath, 'package.json')
const catalog = validateCatalog(metadata.catalog)
const release = catalog.releases.find(r => r.version === metadata.version)
if (!release) throw Error('Missing embedded release')
const plugin = fs.readFileSync(pluginPath), outer = fs.readFileSync(installerPath)
auditArchive(plugin, release)
release.npmInstaller = {
  version: installer.version,
  url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${installer.version}.tgz`,
  bytes: outer.length, sha256: createHash('sha256').update(outer).digest('hex'),
}
validateCatalog(catalog)
if (!pluginFromInstaller(outer, release).equals(plugin)) throw Error('Installer and standalone plugin differ')
fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ok: true, pluginVersion: release.version, installerVersion: installer.version,
  pluginBytes: plugin.length, installerBytes: outer.length, publicSourcesVerified: false }))
