/** Read-only release gate. Compare both final artifacts byte for byte. */
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const [installer, pluginArchive, expectedVersion] = process.argv.slice(2)
assert(installer && pluginArchive && expectedVersion,
  'Pass packed installer, exact plugin tarball and expected release version')
assert(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(expectedVersion), 'Invalid expected release version')
const extract = (archive, file) => execFileSync('tar', ['-xOf', archive, file], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
const pkg = JSON.parse(extract(installer, 'package/package.json'))
const payload = extract(installer, 'package/assets/plugin.tgz')
const pluginBytes = fs.readFileSync(pluginArchive)
const plugin = JSON.parse(extract(pluginArchive, 'package/package.json'))
assert.equal(plugin.name, '@harness-remote/dsh-wechat-remote')
assert(payload.equals(pluginBytes), 'Embedded payload must equal the release artifact byte for byte')
assert.equal(pkg.name, 'dsh-wechat-remote')
assert.equal(pkg.version, expectedVersion)
assert.equal(plugin.version, pkg.version)
const release = JSON.parse(extract(installer, 'package/assets/release.json'))
assert.equal(release.version, plugin.version)
assert.equal(release.catalog.releases.length, 1)
const entry = release.catalog.releases[0]
assert.equal(entry.channel, expectedVersion.includes('-') ? 'preview' : 'stable')
assert.equal(entry.version, plugin.version)
assert.equal(entry.asset.bytes, payload.length)
const sha = createHash('sha256').update(payload).digest('hex')
assert.equal(entry.asset.sha256, sha)
assert.equal(entry.asset.url, `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${plugin.version}/harness-remote-dsh-wechat-remote-${plugin.version}.tgz`)
for (const file of ['bin/dsh-discovery.mjs', 'bin/setup.mjs', 'bin/native-control.mjs', 'lib/native-recovery.js']) assert(extract(installer, 'package/' + file).length)
// The hybrid package also hosts the native plugin. Its runtime closure must
// ship in the outer package, not depend on pnpm resolving host peers online.
assert.deepEqual([...pkg.bundleDependencies].sort(), [...new Set(['yaml', ...Object.keys(plugin.dependencies)])].sort())
assert.deepEqual(Object.keys(pkg.dependencies).sort(), [...pkg.bundleDependencies].sort())
for (const dependency of pkg.bundleDependencies) assert(extract(installer, `package/node_modules/${dependency}/package.json`).length)
console.log(JSON.stringify({ installer: pkg.version, plugin: entry.version, payloadByteIdentical: true, payloadSha256: sha,
  installerSha256: createHash('sha256').update(fs.readFileSync(installer)).digest('hex') }, null, 2))
