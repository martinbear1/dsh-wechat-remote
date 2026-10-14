import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as cordis from '@deepseek-ai/cordis'
import { NativeUpdateService, nativeReleaseFixture, mockArtifactFetch } from './native-update-fixture.mjs'

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-native-refusal-'))
  const state = { version: '1.7.14-rc.68', name: 'dsh-wechat-remote', calls: 0, response: { application: 'failed', error: { code: 'already-installed' } } }
  const artifacts = nativeReleaseFixture()
  const release = { advice: { revision: 'test', component: 'plugin', targetVersion: '1.8.0' }, channel: 'stable', release: artifacts.release }
  const downloads = mockArtifactFetch(t, artifacts)
  const provider = () => ({ listBundles: async () => [{ name: state.name, version: state.version, enabled: true, installed: true }],
    installBundle: async () => { state.calls++; return state.response },
    inspect() { assert.fail('inspect is not an update capability on old hosts') },
    removeBundle() { assert.fail('must not unload the executing plugin') } })
  let manager = provider()
  const options = { home, scope: 'desktop', runningVersion: state.version, manager: () => manager,
    sessions: () => ({ list: async () => ({ items: [] }) }), release: async () => structuredClone(release) }
  const service = new NativeUpdateService(options)
  t.after(() => { service.dispose(); assert(path.dirname(home) === os.tmpdir()); fs.rmSync(home, { recursive: true, force: true }) })
  return { service, state, release, options, provider, artifacts, downloads, replace(value = provider()) { manager = value } }
}
async function finish(service) {
  for (let i = 0; i < 200 && service.isBusy(); i++) await new Promise(resolve => setTimeout(resolve, 2))
  assert.equal(service.isBusy(), false)
  return service.status()
}
async function refused(f) {
  const first = await f.service.check()
  assert.equal(first.canInstall, true, 'unknown host still receives its native adjudication')
  f.service.start(first.ticket)
  const status = await finish(f.service)
  assert.equal(status.phase, 'failed')
  assert.equal(status.message, '当前 DSH 不支持通过此方式覆盖更新，现有插件未改动。')
  assert.equal(f.state.calls, 1)
  assert.deepEqual(f.downloads, [f.release.release.npmInstaller.url], 'native refusal follows exactly one audited immutable download')
  return first
}

test('definite already-installed refusal disables only the proved update, with no retry/uninstall', async t => {
  const f = fixture(t), first = await refused(f)
  for (let i = 0; i < 3; i++) {
    const checked = await f.service.check()
    assert.equal(checked.canInstall, false)
    assert.equal(checked.ticket, '')
    assert.match(checked.reason, /不支持通过此方式覆盖更新.*现有插件未改动/)
  }
  assert.throws(() => f.service.start(first.ticket), /过期/)
  assert.equal(f.state.calls, 1)
  assert.equal(f.state.version, '1.7.14-rc.68')
})

test('new provider, new target, and new installation identity invalidate/refine only local evidence', async t => {
  for (const change of ['provider', 'target', 'source', 'owner']) {
    await t.test(change, async t => {
      const f = fixture(t)
      await refused(f)
      if (change === 'provider') f.replace()
      if (change === 'target') {
        Object.assign(f.artifacts, nativeReleaseFixture('1.8.1'))
        f.release.release = f.artifacts.release
        f.release.advice.targetVersion = '1.8.1'
      }
      if (change === 'source') f.release.release.npmInstaller.sha256 = 'c'.repeat(64)
      if (change === 'owner') {
        f.state.name = '@harness-remote/dsh-wechat-remote'
      }
      const check = await f.service.check()
      assert.equal(check.canInstall, true)
      assert(check.ticket)
      assert.equal(f.state.calls, 1, 'a new check never auto-installs')
    })
  }
})

test('same actual Cordis provider remains refused despite fresh traceable proxies', async t => {
  const f = fixture(t), ctx = new cordis.Context(), manager = f.provider()
  await ctx.plugin({ name: 'refusal-provider', apply(owner) {
    class Manager extends cordis.Service {
      constructor() { super(owner, 'pluginManager') }
      listBundles() { return manager.listBundles() }
      installBundle(...args) { return manager.installBundle(...args) }
    }
    new Manager()
  } })
  t.after(() => ctx.fiber.dispose())
  f.options.manager = () => ctx.get('pluginManager')
  assert.notEqual(f.options.manager(), f.options.manager())
  await refused(f)
  assert.equal((await f.service.check()).canInstall, false)
  assert.equal(f.state.calls, 1)
})

test('other native failures stay retryable by explicit confirmation; network uncertainty does not become unsupported', async t => {
  for (const response of [{ application: 'failed', error: { code: 'incompatible-version' } },
    { application: 'failed', pendingBuilds: ['test'] },
    { application: 'failed', error: { code: 'package-failed' }, packageResult: { kind: 'network' } }]) {
    const f = fixture(t)
    f.state.response = response
    f.service.start((await f.service.check()).ticket)
    const status = await finish(f.service)
    assert.equal(status.phase, 'failed')
    assert.doesNotMatch(status.message, /不支持通过此方式/)
    assert.equal((await f.service.check()).canInstall, true)
    assert.equal(f.state.calls, 1)
  }
})

test('a restarted service does not inherit unsupported capability from a previous runtime', async t => {
  const f = fixture(t)
  await refused(f)
  f.service.dispose()
  const reopened = new NativeUpdateService(f.options)
  t.after(() => reopened.dispose())
  assert.equal((await reopened.check()).canInstall, true)
  assert.equal(f.state.calls, 1, 'journal recovery never retries an install')
})
