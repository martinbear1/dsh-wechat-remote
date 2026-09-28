import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NativeUpdateService } from '../lib/native-update-service.js'
import { Context, Service } from '@deepseek-ai/cordis'

const fixture = (t, overrides = {}) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-native-update-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const releases = { advice: { revision: 'test', component: 'plugin', targetVersion: '1.8.0', current: { pluginVersion: '1.7.12' } }, channel: 'stable', release: {
    version: '1.8.0', asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.8.0/plugin.tgz', bytes: 1, sha256: 'a'.repeat(64) },
    npmInstaller: { version: '1.8.0', url: 'https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-1.8.0.tgz', bytes: 1, sha256: 'b'.repeat(64) } } }
  const state = { version: '1.7.12', running: false, enabled: true, installs: [] }
  const manager = { listBundles: async () => [{ name: 'dsh-wechat-remote', version: state.version, enabled: state.enabled, installed: true }],
    installBundle: async (spec, options) => { state.installs.push({ spec, options }); state.version = '1.8.0'; return { application: 'restart-required', bundle: 'dsh-wechat-remote' } } }
  const options = { home, scope: 'desktop', runningVersion: '1.7.12', manager: () => manager,
    sessions: () => ({ list: async () => ({ items: [{ running: state.running }] }) }),
    release: async () => structuredClone(releases), ...overrides }
  const service = new NativeUpdateService(options)
  t.after(() => service.dispose())
  return { home, state, manager, service, options, releases }
}
const finish = async service => { for (let i = 0; i < 100 && service.isBusy(); i++) await new Promise(resolve => setTimeout(resolve, 2)); assert.equal(service.isBusy(), false); return service.status() }

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
      let reads = 0
      f.options.sessions = () => ({ list: async () => {
        if (++reads === 2) f.state.running = true
        return { items: [{ running: f.state.running }] }
      } })
    }
    f.service.start((await f.service.check()).ticket)
    assert.equal((await finish(f.service)).phase, 'failed')
    assert.equal(f.state.installs.length, 0); assert.equal(f.state.running, true)
  }
})
test('changed catalog, disabled owner, mixed owner, missing manager and non-Desktop refuse safely', async t => {
  for (const scenario of ['catalog', 'disabled', 'mixed', 'missing', 'web']) {
    const f = fixture(t, scenario === 'web' ? { scope: 'web' } : {})
    const check = await f.service.check()
    if (scenario === 'web') { assert.equal(check.canInstall, false); continue }
    if (scenario === 'catalog') f.releases.advice.revision = 'different'
    if (scenario === 'disabled') f.state.enabled = false
    if (scenario === 'mixed') f.manager.listBundles = async () => [{ name: 'dsh-wechat-remote', installed: true, enabled: true }, { name: '@harness-remote/dsh-wechat-remote' }]
    if (scenario === 'missing') f.options.manager = () => undefined
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
    if (++reads === 2) f.state.version = '2.0.0'
    return { items: [] }
  } })
  f.service.start((await f.service.check()).ticket)
  assert.equal((await finish(f.service)).phase, 'failed')
  assert.equal(f.state.installs.length, 0)
  assert.equal(f.state.version, '2.0.0')
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
