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
  for (const file of list(outer)) assert.doesNotMatch(file, /(?:companion-updates|CompanionPanel|CompanionUpdateCard)\.(?:js|d\.ts)$/, 'retired update code must not ship in either entry style')
  assert.doesNotMatch(fs.readFileSync(path.join(native, 'lib/client.js'), 'utf8'), /微信连接 · 联动更新|确认并等待空闲后更新|当前节点可独立使用，不会自动安装另一端/)
  const outerMeta = read(path.join(outer, 'package.json')), nativeMeta = read(path.join(native, 'package.json'))
  const expectedIcon = fs.readFileSync('lib/assets/wechat.svg')
  assert.equal(createHash('sha256').update(expectedIcon).digest('hex'), 'd1c1c296796b3c4cbdce5b896c30815d3376a3766a4254bc1086ab70804f1e72')
  assert.match(expectedIcon.toString(), /viewBox="0 0 40 33"/)
  assert.doesNotMatch(expectedIcon.toString(), /<(?:rect|image|script|foreignObject)\b|stroke=|background|(?:href|style)=/i, 'transparent native artwork has no background, border, remote content or active markup')
  for (const [directory, meta] of [[outer, outerMeta], [native, nativeMeta]]) {
    assert.equal(meta.icon, directory === outer ? './native/lib/assets/wechat.svg' : './lib/assets/wechat.svg')
    assert.deepEqual(fs.readFileSync(path.resolve(directory, meta.icon)), expectedIcon, 'both native installation paths carry the same local vector artwork')
    assert(expectedIcon.length < 256 * 1024)
    assert.equal(meta.description, '连接微信小程序，随时与电脑上的助手协作。')
  }
  assert(fs.readFileSync(path.join(native, 'THIRD-PARTY-NOTICES/wechat-artwork.txt'), 'utf8').includes('https://pc.weixin.qq.com/'))
  const selfResources = createRequire(path.join(outer, 'package.json'))
  assert.equal(read(selfResources.resolve('dsh-wechat-remote/locale/zh.json')).meta.description, outerMeta.description)
  for (const [entry, file] of [['group-assistants', 'group-assistants-component.js'], ['resource-library', 'resource-library-component.js'], ['private-resource-prompt', 'private-resources/native.js'], ['history-import/compaction', 'history-import/continuation-compaction.js']]) {
    assert.equal(outerMeta.exports[`./${entry}`], `./native/lib/${file}`)
    assert.equal(nativeMeta.exports[`./${entry}`].default, `./lib/${file}`)
    assert.equal(selfResources.resolve(`dsh-wechat-remote/${entry}`), path.join(native, 'lib', file))
  }
  assert(fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8').includes("name: 'dsh-wechat-remote/resource-library'"))
  for (const language of ['en', 'zh']) {
    const file = selfResources.resolve(`dsh-wechat-remote/resource-library/locale/${language}.json`)
    assert(file.startsWith(native + path.sep)); assert.equal(typeof read(file).meta.title, 'string')
  }
  assert.equal(outerMeta.exports['./clawbot'], './native/lib/clawbot-component.js')
  assert.equal(nativeMeta.exports['./clawbot'].default, './lib/clawbot-component.js')
  assert.equal(createRequire(path.join(outer, 'package.json')).resolve('dsh-wechat-remote/clawbot'), path.join(native, 'lib/clawbot-component.js'))
  assert(fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8').includes("name: 'dsh-wechat-remote/clawbot'"))
  assert(fs.readFileSync(path.join(native, 'THIRD-PARTY-NOTICES/clawbot.txt'), 'utf8').includes('Copyright (C) 2026 Tencent'))
  assert.equal(outerMeta.exports['./collaboration'], './native/lib/collaboration.js')
  assert.equal(nativeMeta.exports['./collaboration'].default, './lib/collaboration.js')
  assert(fs.existsSync(path.join(native, 'lib/human-tools/scoped-capabilities.js')))
  assert.equal(createRequire(path.join(outer, 'package.json')).resolve('dsh-wechat-remote/collaboration'), path.join(native, 'lib/collaboration.js'))
  assert(!fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8').includes('/collaboration'), 'collaboration must not appear in the global Desktop bundle patch')
  assert.equal(outerMeta.dsh.bundle.patch, './cordis.patch.yml')
  assert.match(fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8'), /name: '\.\/native\/index\.js'/)
  assert.equal(outerMeta.exports['.'], undefined, 'the Loader path must retain nested core ownership of its client half')
  assert.deepEqual(fs.readFileSync(path.join(native, 'index.js')), fs.readFileSync('installer/native-entry.mjs'))
  for (const component of ['teacher', 'project', 'customizer']) {
    assert(!fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8').includes(`dsh-wechat-remote/assistant-${component}`), 'individual presets are not top-level bundle components')
    assert(fs.existsSync(path.join(native, `lib/assistant-presets/builtin-${component}.js`)))
    assert.equal(nativeMeta.exports[`./assistant-${component}`].default, `./lib/assistant-presets/builtin-${component}.js`)
    assert.equal(outerMeta.exports[`./assistant-${component}`], `./native/lib/assistant-presets/builtin-${component}.js`)
    const self = createRequire(path.join(outer, 'package.json'))
    assert.equal(self.resolve(`dsh-wechat-remote/assistant-${component}`), path.join(native, `lib/assistant-presets/builtin-${component}.js`))
    for (const language of ['en', 'zh']) {
      const resource = self.resolve(`dsh-wechat-remote/assistant-${component}/locale/${language}.json`)
      assert(resource.startsWith(native + path.sep)); assert.equal(typeof read(resource).meta.title, 'string')
    }
  }
  assert.match(fs.readFileSync(path.join(outer, 'cordis.patch.yml'), 'utf8'), /dsh-wechat-remote\/group-assistants/)
  for (const language of ['en', 'zh']) {
    const resource = selfResources.resolve(`dsh-wechat-remote/group-assistants/locale/${language}.json`)
    assert.equal(typeof read(resource).meta.title, 'string')
  }
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
  assert(!fs.readFileSync(path.join(source, 'cordis.patch.yml'), 'utf8').includes('/collaboration'), 'collaboration must not appear in the global CLI bundle patch')
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
