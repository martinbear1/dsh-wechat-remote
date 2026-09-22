import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { selectInstallTarget } from '../installer/bin/release-selection.mjs'
import { selectRelease } from '../installer/bin/setup.mjs'
import { assessUpdate, releaseMatches, validateCatalog } from '../installer/lib/update-policy.js'

const now = Date.now()
const release = (version = '1.7.2', extra = {}) => ({ version, channel: 'stable',
  dsh: ['0.1.5-rc.1'], platforms: ['windows', 'macos', 'linux'], architectures: ['x64'],
  asset: { url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/plugin.tgz`,
    sha256: 'a'.repeat(64), bytes: 1 }, ...extra })
const catalog = (releases = [release()], extra = {}) => ({ schemaVersion: 1, revision: 'installer-test',
  issuedAt: now - 1000, expiresAt: now + 60000, releases, blocked: [], retiredDsh: [], ...extra })
const pinned = { version: '1.7.2', catalog: catalog() }
const current = { agentKind: 'dsh', agentVersion: '0.1.5-rc.2', pluginVersion: '0.0.0', platform: 'windows', arch: 'x64' }
let cases = 0
const test = async (name, fn) => { await fn(); cases++; console.log('PASS ' + name) }

await test('pending preview can install without inventing hardware evidence or bypassing safeguards', () => {
  const r = release('1.7.9-rc.7', { channel: 'preview', dsh: [], platforms: [], architectures: [] })
  const local = { version: r.version, catalog: catalog([r]) }
  assert.equal(selectInstallTarget(local, undefined, current, now).version, r.version)
  assert.equal(releaseMatches(r, current), false)
  assert.equal(assessUpdate(local.catalog, current, now).targetVersion, undefined)
  for (const extra of [{ dsh: ['0.1.5-rc.1'] }, { platforms: ['macos'] }, { architectures: ['x64'] },
    { version: '1.7.9', channel: 'stable', asset: undefined }, { targets: [] },
    { asset: { ...r.asset, sha256: 'invalid' } }]) {
    assert.throws(() => validateCatalog(catalog([{ ...r, ...extra }])))
  }
  assert.throws(() => selectInstallTarget(local, catalog([], {
    blocked: [{ pluginVersion: r.version, reason: 'withdrawn preview' }],
  }), current, now), /withdrawn preview/)
})

await test('actual generated installer metadata and bundled bytes pass offline installation selection', async () => {
  const assets = new URL('../installer/assets/', import.meta.url)
  const metadata = JSON.parse(fs.readFileSync(new URL('release.json', assets), 'utf8'))
  const selected = await selectRelease({ dshVersion: '0.1.5-rc.1', pluginVersion: '0.0.0', platform: 'darwin', arch: 'x64' },
    fileURLToPath(assets), false, async () => { throw Error('offline fixture') })
  assert.equal(selected.release.version, metadata.version)
  assert.equal(createHash('sha256').update(selected.archive).digest('hex'), metadata.catalog.releases[0].asset.sha256)
})

await test('explicit installation accepts unlisted RC, alpha, old and future hosts on x64/ARM64', () => {
  for (const platform of ['windows', 'macos', 'linux']) for (const arch of ['x64', 'arm64', 'riscv64', 'arm', 'futurecpu']) {
    for (const agentVersion of ['0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-alpha.2', '0.1.0', '0.2.0-rc.1', '1.0.0-dev.1']) {
      assert.equal(selectInstallTarget(pinned, undefined, { ...current, platform, arch, agentVersion }, now).version, '1.7.2')
    }
  }
})
await test('automatic updates also allow untested hosts without claiming verified compatibility', () => {
  const advice = assessUpdate(pinned.catalog, { ...current, pluginVersion: '1.7.1' }, now)
  assert.equal(advice.targetVersion, '1.7.2')
  assert.doesNotMatch(advice.message, /已验证|已支持当前/)
})
await test('latest trusted stable target selected without host-version filtering', () => {
  const remote = catalog([release('1.7.1'), release('1.7.3'), release('1.7.4-beta.1', { channel: 'preview' })])
  assert.equal(selectInstallTarget(pinned, remote, current, now).version, '1.7.3')
})
await test('explicit RC installer uses its own preview; stable installer never opts into remote previews', () => {
  const rc = release('1.7.6-rc.1', { channel: 'preview' })
  const preview = { version: rc.version, catalog: catalog([rc]) }
  assert.equal(selectInstallTarget(preview, catalog([release('1.7.5')]), current, now).version, rc.version)
  assert.equal(selectInstallTarget(pinned, catalog([rc]), current, now).version, pinned.version)
  assert.equal(selectInstallTarget(preview, catalog([release('1.7.6')]), current, now).version, '1.7.6')
})
await test('installer never falls back below its bundled version', () => {
  assert.equal(selectInstallTarget(pinned, catalog([release('1.7.1')]), current, now).version, '1.7.2')
  assert.throws(() => selectInstallTarget(pinned, catalog([release('1.7.1')], {
    blocked: [{ pluginVersion: '1.7.2', reason: 'withdrawn target' }],
  }), current, now), /withdrawn target/)
})
await test('known incompatible combinations are still blocked, unrelated combinations are not', () => {
  const block = { pluginVersion: '1.7.2', dsh: ['0.1.5-rc.2'], platforms: ['windows'], reason: 'known startup failure' }
  assert.throws(() => selectInstallTarget(pinned, catalog([], { blocked: [block] }), current, now), /known startup failure/)
  assert.equal(selectInstallTarget(pinned, catalog([], { blocked: [block] }), { ...current, platform: 'linux' }, now).version, '1.7.2')
  assert.equal(selectInstallTarget(pinned, catalog([], { blocked: [block] }), { ...current, agentVersion: '0.1.6-alpha.1' }, now).version, '1.7.2')
  const localBlocked = { ...pinned, catalog: catalog([release()], { blocked: [block] }) }
  assert.throws(() => selectInstallTarget(localBlocked, catalog(), current, now), /known startup failure/)
  assert.equal(selectInstallTarget(localBlocked, catalog([release('1.7.3')]), current, now).version, '1.7.3')
})
await test('stale, future-dated, malformed or unavailable catalog does not block bundled install', () => {
  for (const remote of [undefined, {}, catalog([], { issuedAt: now - 10000, expiresAt: now - 1 }),
    catalog([], { issuedAt: now + 300001, expiresAt: now + 600000 }),
    catalog([release('1.7.3', { asset: { url: 'https://untrusted.invalid/plugin.tgz', sha256: 'a'.repeat(64), bytes: 1 } })])]) {
    assert.equal(selectInstallTarget(pinned, remote, current, now).version, '1.7.2')
  }
})
await test('missing remote artifact is skipped and pinned artifact cannot be replaced by same-version metadata', () => {
  assert.equal(selectInstallTarget(pinned, catalog([release('1.7.3', { asset: undefined })]), current, now).version, '1.7.2')
  const remoteSame = release('1.7.2', { asset: { ...release().asset, sha256: 'b'.repeat(64) } })
  assert.equal(selectInstallTarget(pinned, catalog([remoteSame]), current, now).asset.sha256, pinned.catalog.releases[0].asset.sha256)
  assert.throws(() => selectInstallTarget({ ...pinned, version: '1.7.9' }, undefined, current, now), /安装包信息不完整/)
  assert.throws(() => selectInstallTarget({ ...pinned, catalog: catalog([release('1.7.2', { asset: undefined })]) }, undefined, current, now), /安装包信息不完整/)
})

function archiveFor(version) {
  const files = [['package/package.json', JSON.stringify({ name: '@harness-remote/dsh-wechat-remote', version })],
    ['package/lib/index.js', 'export {}'], ['package/lib/client.js', 'export {}']]
  const chunks = []
  for (const [name, content] of files) {
    const data = Buffer.from(content), header = Buffer.alloc(512)
    header.write(name); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156)
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'installer-selection-proof-')))
try {
  const archive = archiveFor('1.7.2')
  const local = structuredClone(pinned)
  Object.assign(local.catalog.releases[0].asset, { bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex') })
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(local))
  fs.writeFileSync(path.join(root, 'plugin.tgz'), archive)
  const host = { dshVersion: '0.1.5-rc.2', pluginVersion: '0.0.0', platform: 'win32', arch: 'x64' }
  const offline = async () => { throw Error('offline fixture') }
  await test('real installer selection audits the package and emits no unverified warnings', async () => {
    const messages = [], oldLog = console.log, oldWarn = console.warn
    try {
      console.log = console.warn = (...args) => messages.push(args)
      for (const arch of ['x64', 'arm64']) {
        const selected = await selectRelease({ ...host, arch }, root, false, offline)
        assert.equal(selected.release.version, '1.7.2'); assert.deepEqual(selected.archive, archive)
      }
    } finally { console.log = oldLog; console.warn = oldWarn }
    assert.deepEqual(messages, [])
  })
  await test('already installed and newer plugins remain untouched; repair cannot downgrade', async () => {
    for (const [version, repair, changed] of [['1.7.2', false, false], ['1.7.2', true, true], ['1.7.3', false, false], ['1.7.3', true, false]]) {
      const selected = await selectRelease({ ...host, pluginVersion: version }, root, repair, offline)
      assert.equal(Boolean(selected.archive), changed)
    }
  })
  await test('unavailable newer release reuses the eligible bundle for new install and same-version repair', async () => {
    const remote = catalog([release('1.7.4')])
    const fetchCatalog = async () => Buffer.from(JSON.stringify(remote))
    const unavailable = async () => { throw new TypeError('offline fixture') }
    for (const [version, repair, changed] of [['0.0.0',false,true],['1.7.1',false,true],['1.7.2',false,false],['1.7.2',true,true]]) {
      const selected = await selectRelease({...host,pluginVersion:version},root,repair,fetchCatalog,unavailable)
      assert.equal(selected.release.version,'1.7.2'); assert.equal(Boolean(selected.archive),changed)
      if (changed) assert.deepEqual(selected.archive,archive)
    }
    for (const repair of [false,true]) await assert.rejects(selectRelease({...host,pluginVersion:'1.7.3'},root,repair,fetchCatalog,unavailable),/无法下载/)
  })
  await test('download fallback retains online withdrawals and never bypasses integrity errors', async () => {
    const blocked = catalog([release('1.7.4')],{blocked:[{pluginVersion:'1.7.2',reason:'withdrawn bundled target'}]})
    await assert.rejects(selectRelease(host,root,true,async()=>Buffer.from(JSON.stringify(blocked)),async()=>{throw Error('offline')}),/withdrawn bundled target/)
    const expiring = {...blocked,expiresAt:Date.now()+40}
    await assert.rejects(selectRelease(host,root,true,async()=>Buffer.from(JSON.stringify(expiring)),async()=>{
      await new Promise(resolve=>setTimeout(resolve,80)); throw Error('late offline')
    }),/withdrawn bundled target/)
    const newer = catalog([release('1.7.4')])
    await assert.rejects(selectRelease(host,root,true,async()=>Buffer.from(JSON.stringify(newer)),async()=>new Response('x')),/校验失败/)
  })
  await test('real selector rejects known incompatibility before reading a missing archive', async () => {
    fs.unlinkSync(path.join(root, 'plugin.tgz'))
    const remote = catalog([], { blocked: [{ pluginVersion: '1.7.2', reason: 'known failure fixture' }] })
    await assert.rejects(selectRelease(host, root, false, async () => Buffer.from(JSON.stringify(remote))), /known failure fixture/)
  })
  await test('removing admission restrictions does not bypass archive integrity', async () => {
    fs.writeFileSync(path.join(root, 'plugin.tgz'), Buffer.from('damaged archive'))
    await assert.rejects(selectRelease(host, root, false, offline), /更新包校验失败/)
  })
} finally {
  assert(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('installer-selection-proof-'))
  fs.rmSync(root, { recursive: true })
}
console.log(JSON.stringify({ ok: true, cases, note: 'Policy simulations, not ARM64 runtime verification.' }))
