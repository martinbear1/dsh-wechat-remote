import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { NativeUpdateService, supportsNativeUpdates } from '../lib/native-update-service.js'
import { Context, Service } from '@deepseek-ai/cordis'

const fixture = (t, overrides = {}) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-native-update-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const releases = { advice: { revision: 'test', component: 'plugin', targetVersion: '1.8.0', current: { pluginVersion: '1.7.12' } }, channel: 'stable', release: {
    version: '1.8.0', asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.8.0/plugin.tgz', bytes: 1, sha256: 'a'.repeat(64) },
    npmInstaller: { version: '1.8.0', url: 'https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-1.8.0.tgz', bytes: 1, sha256: 'b'.repeat(64) } } }
  const state = { owner: 'dsh-wechat-remote', version: '1.7.12', running: false, enabled: true, installs: [] }
  const manager = { listBundles: async () => [{ name: state.owner, version: state.version, enabled: state.enabled, installed: true }],
    installBundle: async (spec, options) => { state.installs.push({ spec, options }); state.version = '1.8.0'; return { application: 'restart-required', bundle: state.owner } } }
  const options = { home, scope: 'desktop', runningVersion: '1.7.12', manager: () => manager,
    sessions: () => ({ list: async () => ({ items: [{ running: state.running }] }) }),
    release: async () => structuredClone(releases), ...overrides }
  const service = new NativeUpdateService(options)
  t.after(() => service.dispose())
  return { home, state, manager, service, options, releases }
}
const finish = async service => { for (let i = 0; i < 100 && service.isBusy(); i++) await new Promise(resolve => setTimeout(resolve, 2)); assert.equal(service.isBusy(), false); return service.status() }

function coreArchive(version, name = '@harness-remote/dsh-wechat-remote') {
  const chunks = []
  const files = [['package/package.json', JSON.stringify({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } })],
    ['package/lib/index.js', ''], ['package/lib/client.js', ''], ['package/cordis.patch.yml', '[]']]
  for (const [entry, content] of files) {
    const data = Buffer.from(content), header = Buffer.alloc(512)
    header.write(entry); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('0', 156)
    header.fill(32, 148, 156); header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
function coreFixture(f, bytes = coreArchive('1.8.0')) {
  f.state.owner = '@harness-remote/dsh-wechat-remote'
  Object.assign(f.releases.release.asset, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  return bytes
}

test('native capability requires the actual manager methods and supported scope, without querying the host', () => {
  const manager = { listBundles() { assert.fail('discovery must not query installed packages') },
    installBundle() { assert.fail('discovery must never install') } }
  for (const scope of ['web', 'desktop']) {
    assert.equal(supportsNativeUpdates(manager, scope), true)
    for (const missing of [undefined, null, {}, { listBundles: manager.listBundles }, { installBundle: manager.installBundle }, { listBundles: true, installBundle: true }]) {
      assert.equal(supportsNativeUpdates(missing, scope), false)
    }
  }
  for (const scope of ['', 'default', 'other', '../desktop']) assert.equal(supportsNativeUpdates(manager, scope), false)
})

test('actual gate snapshot only advertises native updates with authenticated management and a live capable manager', () => {
  // Execute the compiled snapshot closure without mounting unrelated gate
  // listeners, credentials, or a real user's profile.
  const source = ts.createSourceFile('gate-runtime.js', fs.readFileSync(new URL('../lib/gate-runtime.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let snapshot
  const visit = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'gateRuntimeSnapshot') snapshot = node; ts.forEachChild(node, visit) }
  visit(source)
  assert(snapshot)
  const manager = { listBundles() { assert.fail('view discovery must not query inventory') }, installBundle() { assert.fail('view discovery must not install') } }
  for (const profileScope of ['web', 'desktop', 'custom']) for (const management of ['authenticated-rpc', 'loopback', 'unavailable']) {
    let provider
    const read = vm.runInNewContext(`(${snapshot.getText(source)})`, { supportsNativeUpdates, management,
      ctx: { get(name) { assert.equal(name, 'pluginManager'); return provider } },
      doorRuntime: { profileScope, source: 'fixture', publicDoor: {}, localDoor: {} } })
    assert.equal(read().updates, undefined)
    provider = manager
    assert.equal(read().updates, management === 'authenticated-rpc' && profileScope !== 'custom' ? 'native-v1' : undefined)
    assert.equal(read().diagnostics, management === 'authenticated-rpc' ? 'read-only-v1' : undefined)
    provider = undefined
    assert.equal(read().updates, undefined, 'provider removal is reflected without cached capability')
  }
})

test('missing or late manager is confined to update availability and explains upgrading DSH first', async t => {
  for (const scope of ['web', 'desktop']) {
    const f = fixture(t, { scope, manager: () => undefined })
    const unavailable = await f.service.check()
    assert.equal(unavailable.canInstall, false)
    assert.equal(unavailable.ticket, '')
    assert.equal(unavailable.status.phase, 'idle')
    assert.match(unavailable.reason, /先将 DSH 更新到提供该能力的版本/)
    assert.equal(fs.existsSync(path.join(f.home, 'harness-remote-updates')), false)
    f.options.manager = () => f.manager
    const available = await f.service.check()
    assert.equal(available.canInstall, true, 'late host capability works on the next explicit check')
    assert.equal(available.reason, '')
    assert.equal(f.state.installs.length, 0)
  }
})

test('native-manager external install without our journal is shown as installed but not activated', async t => {
  const f = fixture(t)
  f.state.version = '1.8.0'
  const value = await f.service.check()
  assert.equal(value.status.phase, 'restart-required')
  assert.equal(value.status.previousVersion, '1.7.12')
  assert.equal(value.status.targetVersion, '1.8.0')
  assert.equal(value.canInstall, false)
  assert.equal(f.state.installs.length, 0)
})

test('real Cordis traceable proxies do not veto same native provider; actual provider replacement does', async t => {
  for (const replace of [false, true]) {
    const f = fixture(t), ctx = new Context()
    let provider
    const provide = async () => {
      provider = ctx.plugin({ name: `native-manager-${replace}-${Math.random()}`, apply(owner) {
        class Manager extends Service {
          constructor() { super(owner, 'pluginManager') }
          listBundles() { return f.manager.listBundles() }
          installBundle(spec, options) { return f.manager.installBundle(spec, options) }
        }
        new Manager()
      } })
      await provider
    }
    await provide()
    f.options.manager = () => ctx.get('pluginManager')
    assert.notEqual(f.options.manager(), f.options.manager(), 'real framework produces fresh proxies')
    let inspected = false
    f.options.sessions = () => ({ list: async () => {
      if (replace && !inspected) { inspected = true; await provider.dispose(); await provide() }
      return { items: [] }
    } })
    try {
      f.service.start((await f.service.check()).ticket)
      assert.equal((await finish(f.service)).phase, replace ? 'failed' : 'restart-required')
      assert.equal(f.state.installs.length, replace ? 0 : 1)
    } finally { await ctx.fiber.dispose() }
  }
})
test('check is read-only; exact single-use confirmation installs once through the native owner, then restart proof', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Desktop must not pre-download outside the native manager'))
  const f = fixture(t)
  const [first, same] = await Promise.all([f.service.check(), f.service.check()])
  assert.equal(first.ticket, same.ticket); assert.equal(first.canInstall, true)
  assert.equal(f.state.installs.length, 0)
  assert.throws(() => f.service.start('b'.repeat(48)), /过期/)
  const accepted = f.service.start(first.ticket)
  assert.equal(accepted.phase, 'preparing'); assert.throws(() => f.service.start(first.ticket))
  assert.equal((await finish(f.service)).phase, 'restart-required')
  assert.equal(f.state.installs.length, 1)
  const installation = f.state.installs[0]
  assert.equal(installation.spec, 'dsh-wechat-remote@1.8.0')
  assert.deepEqual(fs.readdirSync(path.join(f.home, 'harness-remote-updates', 'native-desktop')), ['status.json'], 'no plugin-owned archive or profile edits')
  assert.deepEqual(installation.options, { enabled: true, requestId: accepted.jobId })
  assert.equal((await f.service.check()).canInstall, false)
  f.service.dispose()
  const restarted = new NativeUpdateService({ ...f.options, runningVersion: '1.8.0' })
  t.after(() => restarted.dispose())
  assert.equal((await restarted.status()).phase, 'complete')
  assert.equal(f.state.installs.length, 1, 'restart must never repeat install')
})
test('busy tasks before and after preparation never install or end a task', async t => {
  for (const when of ['before', 'after']) {
    const f = fixture(t)
    if (when === 'before') f.state.running = true
    else {
      const release = f.options.release
      let reads = 0
      f.options.release = async () => { if (++reads === 2) f.state.running = true; return release() }
    }
    f.service.start((await f.service.check()).ticket)
    assert.equal((await finish(f.service)).phase, 'failed')
    assert.equal(f.state.installs.length, 0); assert.equal(f.state.running, true)
  }
})

test('native updates ignore peer data refreshes and keep each profile result independent', async t => {
  // Models peer writes at deterministic await boundaries, not real Desktop
  // execution or GUI acceptance. Only the current host's native manager runs.
  for (const scope of ['web', 'desktop']) for (const owner of ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']) {
    await t.test(`${scope}/${owner}`, async t => {
      const f = fixture(t, { scope })
      const peer = scope === 'web' ? 'desktop' : 'web'
      const directory = path.join(f.home, 'harness-remote/instances', peer)
      const journalDirectory = path.join(f.home, 'harness-remote-updates', `native-${peer}`)
      fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(journalDirectory, { recursive: true })
      const facts = path.join(directory, 'human-workflow-fixture-facts.json')
      const journal = path.join(journalDirectory, 'status.json')
      fs.writeFileSync(facts, JSON.stringify({ asOf: 1000, records: [] }))
      const peerJournal = JSON.stringify({ phase: 'installing', jobId: 'a'.repeat(32), targetVersion: '2.0.0' })
      fs.writeFileSync(journal, peerJournal)
      const bytes = owner.startsWith('@') ? coreFixture(f) : null
      t.mock.method(globalThis, 'fetch', async () => { assert(bytes); return new Response(bytes) })
      const nativeInstall = f.manager.installBundle
      f.manager.installBundle = async (...args) => {
        fs.writeFileSync(facts, JSON.stringify({ asOf: 2000, records: [] }))
        return nativeInstall(...args)
      }
      f.service.start((await f.service.check()).ticket)
      assert.equal((await finish(f.service)).phase, 'restart-required')
      assert.equal(f.state.installs.length, 1)
      f.service.dispose()
      const restarted = new NativeUpdateService({ ...f.options, runningVersion: '1.8.0' })
      t.after(() => restarted.dispose())
      assert.equal((await restarted.status()).phase, 'complete')
      assert.equal(JSON.parse(fs.readFileSync(facts, 'utf8')).asOf, 2000)
      assert.equal(fs.readFileSync(journal, 'utf8'), peerJournal, 'peer result is never read as our result or rewritten')
      assert.equal(f.state.installs.length, 1, 'recovery never repeats an install')
    })
  }
})
test('changed catalog, disabled owner, mixed owner, missing manager and unsupported scope refuse safely', async t => {
  for (const scenario of ['catalog', 'disabled', 'mixed', 'missing', 'scope', 'owner']) {
    const f = fixture(t, scenario === 'scope' ? { scope: '../desktop' } : {})
    const check = await f.service.check()
    if (scenario === 'scope') { assert.equal(check.canInstall, false); continue }
    if (scenario === 'catalog') f.releases.advice.revision = 'different'
    if (scenario === 'disabled') f.state.enabled = false
    if (scenario === 'mixed') f.manager.listBundles = async () => [{ name: 'dsh-wechat-remote', installed: true, enabled: true }, { name: '@harness-remote/dsh-wechat-remote', installed: true }]
    if (scenario === 'missing') f.options.manager = () => undefined
    if (scenario === 'owner') f.state.owner = '@harness-remote/dsh-wechat-remote'
    f.service.start(check.ticket)
    assert.equal((await finish(f.service)).phase, 'failed')
    assert.equal(f.state.installs.length, 0)
  }
})
test('native approvals/compatibility refusals are displayed, never bypassed or falsely marked successful', async t => {
  for (const result of [{ application: 'failed', pendingBuilds: ['native-code'] }, { application: 'failed', error: { code: 'incompatible-version' } }]) {
    const f = fixture(t)
    f.manager.installBundle = async (_spec, options) => { f.state.installs.push(options); return result }
    f.service.start((await f.service.check()).ticket)
    const status = await finish(f.service)
    assert.equal(status.phase, 'failed'); assert.match(status.message, /审批|不兼容/)
    assert.equal(f.state.installs.length, 1); assert.equal('approvedBuilds' in f.state.installs[0], false)
  }
})

test('manual install during the final idle query cannot be overwritten or downgraded', async t => {
  const f = fixture(t)
  let reads = 0
  f.options.sessions = () => ({ list: async () => {
    if (++reads === 1) f.state.version = '2.0.0'
    return { items: [] }
  } })
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'failed')
  assert.equal(f.state.installs.length, 0)
  assert.equal(f.state.version, '2.0.0')
})

test('Web and Desktop update each single native owner in place from 1.7.10 and 1.7.13', async t => {
  for (const scope of ['web', 'desktop']) for (const owner of ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']) for (const previous of ['1.7.10', '1.7.13']) {
    await t.test(`${scope}/${owner}/${previous}`, async t => {
      const f = fixture(t, { scope, runningVersion: previous })
      f.state.version = previous
      let downloadCount = 0, taskChecks = 0
      const bytes = owner.startsWith('@') ? coreFixture(f) : null
      t.mock.method(globalThis, 'fetch', async url => {
        assert(bytes, 'outer updates delegate downloads to the native manager')
        assert.equal(url, f.releases.release.asset.url)
        downloadCount++
        return new Response(bytes)
      })
      f.options.sessions = () => ({ list: async () => { taskChecks++; return { items: [] } } })
      const check = await f.service.check()
      assert.equal(check.canInstall, true)
      assert.equal(downloadCount, 0, 'checking alone never downloads')
      f.service.start(check.ticket)
      assert.equal((await finish(f.service)).phase, 'restart-required')
      assert.equal(taskChecks, 1, 'one final live task check, not two identical serial reads')
      assert.equal(f.state.installs.length, 1)
      const installation = f.state.installs[0]
      if (bytes) {
        assert.equal(downloadCount, 1)
        assert.equal(path.dirname(installation.spec), path.join(f.home, 'harness-remote-updates', `native-${scope}`))
        assert.deepEqual(fs.readFileSync(installation.spec), bytes, 'retain immutable file referenced by native pnpm')
      } else assert.equal(installation.spec, 'dsh-wechat-remote@1.8.0')
      assert.equal((await f.manager.listBundles()).length, 1)
      assert.equal((await f.manager.listBundles())[0].name, owner)
      const restarted = new NativeUpdateService({ ...f.options, runningVersion: '1.8.0' })
      t.after(() => restarted.dispose())
      assert.equal((await restarted.status()).phase, 'complete')
      assert.equal((await restarted.check()).canInstall, false)
      assert.equal(f.state.installs.length, 1)
    })
  }
})

test('core download checks hash, identity and version before native installation', async t => {
  for (const kind of ['hash', 'identity', 'version', 'untrusted']) {
    await t.test(kind, async t => {
      const f = fixture(t, { scope: 'web' })
      const bytes = coreFixture(f, coreArchive(kind === 'version' ? '1.9.0' : '1.8.0', kind === 'identity' ? 'other' : undefined))
      if (kind === 'hash') f.releases.release.asset.sha256 = 'c'.repeat(64)
      if (kind === 'untrusted') f.releases.release.asset.url = 'https://example.com/plugin.tgz'
      let downloads = 0
      t.mock.method(globalThis, 'fetch', async () => { downloads++; return new Response(bytes) })
      const check = await f.service.check()
      if (kind === 'untrusted') assert.equal(check.canInstall, false)
      else {
        f.service.start(check.ticket)
        assert.equal((await finish(f.service)).phase, 'failed')
      }
      assert.equal(downloads, kind === 'untrusted' ? 0 : 1)
      assert.equal(f.state.installs.length, 0)
      assert.equal(f.state.version, '1.7.12')
    })
  }
})

test('core task check occurs after download; activity starting during preparation is preserved', async t => {
  const f = fixture(t, { scope: 'web' }), bytes = coreFixture(f)
  t.mock.method(globalThis, 'fetch', async () => { f.state.running = true; return new Response(bytes) })
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'failed')
  assert.equal(f.state.installs.length, 0)
  assert.equal(f.state.running, true)
})

test('core cache is immutable and reusable after a native refusal; other bundle results remain unknown', async t => {
  const f = fixture(t, { scope: 'web' }), bytes = coreFixture(f)
  let downloads = 0
  t.mock.method(globalThis, 'fetch', async () => { downloads++; return new Response(bytes) })
  f.manager.installBundle = async (spec, options) => {
    f.state.installs.push({ spec, options })
    return { application: 'failed', error: { code: 'incompatible-version' } }
  }
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'failed')
  const archive = f.state.installs[0].spec
  f.manager.installBundle = async (spec, options) => {
    f.state.installs.push({ spec, options }); f.state.version = '1.8.0'
    return { application: 'restart-required', bundle: 'other' }
  }
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'unknown')
  assert.equal(f.state.installs[1].spec, archive)
  assert.deepEqual(fs.readFileSync(archive), bytes)
  assert.equal(downloads, 1, 'retry revalidates the retained artifact without downloading again')
  assert.equal((await f.service.check()).canInstall, false)
})

test('profile journals are isolated and old Desktop outer-owner records still recover', async t => {
  const f = fixture(t)
  const directory = path.join(f.home, 'harness-remote-updates', 'native-desktop')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'status.json'), JSON.stringify({
    phase: 'restart-required', jobId: 'a'.repeat(32), targetVersion: '1.8.0', previousVersion: '1.7.12',
  }))
  const desktop = new NativeUpdateService(f.options)
  t.after(() => desktop.dispose())
  f.state.version = '1.8.0'
  assert.equal((await desktop.status()).phase, 'restart-required')
  const web = new NativeUpdateService({ ...f.options, scope: 'web', runningVersion: '1.8.0' })
  t.after(() => web.dispose())
  assert.equal((await web.status()).phase, 'idle', 'Web never recovers another profile update')
  assert.equal(fs.existsSync(path.join(f.home, 'harness-remote-updates', 'native-web')), false, 'read-only recovery creates no files')
  f.state.owner = '@harness-remote/dsh-wechat-remote'
  assert.equal((await desktop.status()).phase, 'unknown', 'another owner cannot satisfy an old update receipt')
})

test('interrupted preparation can be retried; interrupted installation requires proof, never a blind retry', async t => {
  for (const phase of ['preparing', 'installing']) {
    const f = fixture(t, { scope: 'web' })
    const directory = path.join(f.home, 'harness-remote-updates', 'native-web')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'status.json'), JSON.stringify({ phase, jobId: 'a'.repeat(32),
      bundle: 'dsh-wechat-remote', targetVersion: '1.8.0', previousVersion: '1.7.12' }))
    const reopened = new NativeUpdateService(f.options)
    t.after(() => reopened.dispose())
    assert.equal((await reopened.status()).phase, phase === 'preparing' ? 'failed' : 'unknown')
    assert.equal((await reopened.check()).canInstall, phase === 'preparing')
    assert.equal(f.state.installs.length, 0)
  }
})

test('confirmed old receipt cannot block a later manually upgraded and restarted plugin; unknown receipts stay unknown', async t => {
  for (const phase of ['complete', 'restart-required', 'unknown', 'installing']) {
    const f = fixture(t, { runningVersion: '1.9.0' })
    f.state.version = '1.9.0'
    const directory = path.join(f.home, 'harness-remote-updates', 'native-desktop')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'status.json'), JSON.stringify({ phase, jobId: 'b'.repeat(32),
      bundle: 'dsh-wechat-remote', targetVersion: '1.8.0', previousVersion: '1.7.13' }))
    const reopened = new NativeUpdateService(f.options)
    t.after(() => reopened.dispose())
    assert.equal((await reopened.status()).phase, ['complete', 'restart-required'].includes(phase) ? 'idle' : 'unknown')
    assert.equal(f.state.installs.length, 0)
  }
})
test('lost installation response persists uncertainty across reopening; no automatic retry', async t => {
  const f = fixture(t)
  f.manager.installBundle = async () => { f.state.installs.push({}); f.state.version = '1.8.0'; throw Error('offline') }
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'unknown')
  assert.equal((await f.service.check()).canInstall, false)
  f.service.dispose()
  const reopened = new NativeUpdateService(f.options); t.after(() => reopened.dispose())
  assert.equal((await reopened.status()).phase, 'unknown')
  assert.equal((await reopened.check()).canInstall, false)
  assert.equal(f.state.installs.length, 1)
})
test('disposal during preparation and missing wrapper release never invoke the native manager', async t => {
  const f = fixture(t)
  f.releases.release.npmInstaller = undefined
  assert.equal((await f.service.check()).canInstall, false)
  const g = fixture(t)
  g.options.sessions = () => ({ list: async () => { g.service.dispose(); return { items: [] } } })
  g.service.start((await g.service.check()).ticket)
  assert.equal((await finish(g.service)).phase, 'failed')
  assert.equal(g.state.installs.length, 0)
})

test('native transport can outlast sixty seconds; no plugin timeout, fetch, forced retry or registry override', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  t.mock.method(globalThis, 'fetch', () => assert.fail('native transport owns download'))
  const f = fixture(t)
  let finishNative, began
  const started = new Promise(resolve => { began = resolve })
  f.manager.installBundle = async (spec, options) => {
    f.state.installs.push({ spec, options }); began()
    await new Promise(resolve => { finishNative = resolve })
    f.state.version = '1.8.0'
    return { application: 'restart-required', bundle: 'dsh-wechat-remote' }
  }
  f.service.start((await f.service.check()).ticket)
  await started
  t.mock.timers.tick(610000)
  assert.equal((await f.service.status()).phase, 'installing')
  assert.equal(f.state.installs.length, 1)
  assert.deepEqual(Object.keys(f.state.installs[0].options).sort(), ['enabled', 'requestId'])
  finishNative()
  for (let i = 0; i < 20 && f.service.isBusy(); i++) await Promise.resolve()
  assert.equal(f.service.isBusy(), false)
  assert.equal((await f.service.status()).phase, 'restart-required')
})

test('native download failure stays failed and installed version mismatch stays unknown, never a false success', async t => {
  for (const kind of ['network', 'timeout', 'wrong-version']) {
    const f = fixture(t)
    f.manager.installBundle = async (spec, options) => {
      f.state.installs.push({ spec, options })
      return kind === 'wrong-version'
        ? { application: 'restart-required', bundle: 'dsh-wechat-remote' }
        : { application: 'failed', error: { code: 'package-failed' }, packageResult: { kind } }
    }
    f.service.start((await f.service.check()).ticket)
    const status = await finish(f.service)
    assert.equal(status.phase, kind === 'wrong-version' ? 'unknown' : 'failed')
    assert.match(status.message, kind === 'wrong-version' ? /未确认/ : /下载未完成/)
    assert.equal(f.state.installs.length, 1)
  }
})

test('exact preview targets remain preview specs; malformed, different-package and mutable sources are refused', async t => {
  const f = fixture(t)
  const target = '1.8.0-rc.9'
  f.releases.advice.targetVersion = f.releases.release.version = f.releases.release.npmInstaller.version = target
  f.releases.release.npmInstaller.url = `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${target}.tgz`
  f.manager.installBundle = async (spec, options) => {
    f.state.installs.push({ spec, options }); f.state.version = target
    return { application: 'restart-required', bundle: 'dsh-wechat-remote' }
  }
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'restart-required')
  assert.equal(f.state.installs[0].spec, `dsh-wechat-remote@${target}`)
  for (const version of ['latest', '^1.8.0', '1.8.0 --unsafe']) {
    const g = fixture(t)
    g.releases.advice.targetVersion = g.releases.release.version = g.releases.release.npmInstaller.version = version
    assert.equal((await g.service.check()).canInstall, false)
    assert.equal(g.state.installs.length, 0)
  }
  const g = fixture(t)
  g.releases.release.npmInstaller.url = 'https://registry.npmjs.org/other/-/other-1.8.0.tgz'
  assert.equal((await g.service.check()).canInstall, false)
})
