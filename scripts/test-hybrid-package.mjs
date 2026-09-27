/** Validate the actual dual-entry npm artifact, including the OLD update
 * reader. This is a package contract test, not a Desktop UI installation. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { pluginFromInstaller } from '../lib/update-download.js'

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const manifest = read('installer/package.json'), version = manifest.version
const artifact = path.resolve(process.argv[2] || `installer/dsh-wechat-remote-${version}.tgz`)
const bytes = fs.readFileSync(artifact), core = fs.readFileSync('installer/assets/plugin.tgz')
const release = read('installer/assets/release.json').catalog.releases[0]
release.npmInstaller = { version, url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${version}.tgz`,
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
assert.deepEqual(pluginFromInstaller(bytes, release), core)
if (process.env.HARNESS_LEGACY_PLUGIN_ROOT) {
  const old = await import(pathToFileURL(path.resolve(process.env.HARNESS_LEGACY_PLUGIN_ROOT, 'lib/update-download.js')))
  assert.deepEqual(old.pluginFromInstaller(bytes, release), core, 'old updater must accept the new npm fallback without relaxed limits')
}
const stage = fs.mkdtempSync(path.join(tmpdir(), 'dsh-hybrid-package-'))
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)])
try {
  execFileSync('tar', ['-xf', artifact, '-C', stage], { windowsHide: true, timeout: 30000 })
  const outer = path.join(stage, 'package'), native = path.join(outer, 'native')
  const outerMeta = read(path.join(outer, 'package.json')), nativeMeta = read(path.join(native, 'package.json'))
  assert.equal(outerMeta.dsh.bundle.patch, './cordis.patch.yml')
  assert.match(fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8'), /name: '\.\/native\/lib\/index\.js'/)
  assert.equal(nativeMeta.version, version)
  assert.equal(nativeMeta.name, '@harness-remote/dsh-wechat-remote')
  assert.equal(nativeMeta.dsh.client.platform, 'web')
  assert.equal(outerMeta.peerDependencies, undefined, 'npx must not resolve a DSH host peer tree')
  for (const hook of ['install', 'preinstall', 'postinstall']) assert.equal(outerMeta.scripts?.[hook], undefined)
  const resolver = createRequire(path.join(native, 'package.json'))
  for (const dependency of Object.keys(nativeMeta.dependencies)) assert(resolver.resolve(dependency))
  const embedded = path.join(stage, 'embedded')
  fs.mkdirSync(embedded)
  execFileSync('tar', ['-xf', path.join(outer, 'assets/plugin.tgz'), '-C', embedded], { windowsHide: true, timeout: 30000 })
  const source = path.join(embedded, 'package')
  assert.deepEqual(fs.readFileSync(path.join(native, 'package.json')), fs.readFileSync(path.join(source, 'package.json')))
  const paths = list(path.join(source, 'lib')).map(p => path.relative(path.join(source, 'lib'), p)).sort()
  assert.deepEqual(list(path.join(native, 'lib')).map(p => path.relative(path.join(native, 'lib'), p)).sort(), paths)
  for (const file of paths) assert.deepEqual(fs.readFileSync(path.join(native, 'lib', file)), fs.readFileSync(path.join(source, 'lib', file)), file)
  const help = execFileSync(process.execPath, [path.join(outer, 'bin/setup.mjs'), '--help'], {
    cwd: stage, encoding: 'utf8', windowsHide: true, timeout: 10000,
  })
  assert.match(help, /dsh-wechat-remote/)
  console.log(`PASS dual-entry artifact: ${paths.length} exact core files, native metadata, bundled dependencies, clean CLI --help, bounded npm recovery${process.env.HARNESS_LEGACY_PLUGIN_ROOT ? ' with legacy reader' : ''}; ${bytes.length} compressed bytes`)
} finally {
  assert.equal(path.dirname(stage), path.resolve(tmpdir()))
  assert(path.basename(stage).startsWith('dsh-hybrid-package-'))
  fs.rmSync(stage, { recursive: true, force: true })
}
