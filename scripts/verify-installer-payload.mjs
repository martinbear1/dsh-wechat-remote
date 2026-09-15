/** Read-only release gate. Compare the packed installer to the immutable,
 * already-published plugin; do not infer payload identity from version labels. */
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const [installer, stable] = process.argv.slice(2)
assert(installer && stable, 'Pass packed installer and exact published plugin tarball')
const extract = (archive, file) => execFileSync('tar', ['-xOf', archive, file], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
const pkg = JSON.parse(extract(installer, 'package/package.json'))
const payload = extract(installer, 'package/assets/plugin.tgz')
const stableBytes = fs.readFileSync(stable)
assert(payload.equals(stableBytes), 'Embedded payload must equal the immutable stable artifact byte for byte')
assert.equal(pkg.name, 'dsh-wechat-remote')
assert.equal(pkg.version, '1.7.6')
const release = JSON.parse(extract(installer, 'package/assets/release.json'))
assert.equal(release.version, '1.7.5')
assert.equal(release.catalog.releases.length, 1)
const entry = release.catalog.releases[0]
assert.equal(entry.channel, 'stable')
assert.equal(entry.version, '1.7.5')
assert.equal(entry.asset.bytes, payload.length)
const sha = createHash('sha256').update(payload).digest('hex')
assert.equal(sha, 'd5545651e80242d1782fb04e86aece5d0460db80bdf1cec7688429e2abaf9e6e')
assert.equal(entry.asset.sha256, sha)
assert.equal(entry.asset.url, 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.5/harness-remote-dsh-wechat-remote-1.7.5.tgz')
for (const file of ['bin/dsh-discovery.mjs', 'bin/setup.mjs', 'bin/native-control.mjs']) assert(extract(installer, 'package/' + file).length)
assert.deepEqual(pkg.bundleDependencies, ['pnpm', 'yaml'])
console.log(JSON.stringify({ installer: pkg.version, plugin: entry.version, payloadByteIdentical: true, payloadSha256: sha,
  installerSha256: createHash('sha256').update(fs.readFileSync(installer)).digest('hex') }, null, 2))
