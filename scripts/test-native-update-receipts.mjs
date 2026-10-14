import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NativeUpdateService } from '../lib/native-update-service.js'

const target = '1.8.0', previous = '1.7.14-rc.68', bundle = 'dsh-wechat-remote'
const id = 'a'.repeat(32)
const pending = { phase: 'installing', jobId: id, targetVersion: target, previousVersion: previous, bundle, message: 'installing' }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(t, initial = pending, runningVersion = target) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'native-receipt-'))
  const journal = path.join(home, 'harness-remote-updates/native-desktop/status.json')
  fs.mkdirSync(path.dirname(journal), { recursive: true }); fs.writeFileSync(journal, JSON.stringify(initial))
  let resolve, waits = 0, version = target
  const result = new Promise(done => { resolve = done })
  const manager = { listBundles: async () => [{ name: bundle, installed: true, enabled: true, version }],
    installBundle() { assert.fail('status recovery must not install') },
    waitForInstall(requestId) { assert.equal(requestId, id); waits++; return result } }
  const options = { home, scope: 'desktop', runningVersion, manager: () => manager,
    sessions: () => { assert.fail('read-only recovery must not inspect running tasks') },
    release: async () => ({ channel: 'stable', advice: { revision: 'fixture', component: 'plugin', targetVersion: '1.9.0' },
      release: { version: '1.9.0', asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.9.0/plugin.tgz', bytes: 1, sha256: 'a'.repeat(64) },
        npmInstaller: { version: '1.9.0', url: 'https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-1.9.0.tgz', bytes: 1, sha256: 'b'.repeat(64) } } }) }
  const service = new NativeUpdateService(options)
  t.after(() => { service.dispose(); fs.rmSync(home, { recursive: true, force: true }) })
  return { service, manager, options, journal, resolve, waits: () => waits, version: value => { version = value } }
}

test('new gate does not declare completion while native activation is still pending', async t => {
  const f = fixture(t)
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.service.status()).phase, 'installing')
    assert.equal((await f.service.check()).canInstall, false)
  }
  assert.equal(f.waits(), 1)
  f.resolve({ application: 'applied', bundle, changed: true })
  await tick()
  assert.equal((await f.service.status()).phase, 'complete')
  assert.equal(JSON.parse(fs.readFileSync(f.journal)).nativeResult.application, 'applied')
})

test('new gate alive + later sibling activation failure stays partial, not complete or automatic rollback', async t => {
  const f = fixture(t)
  await f.service.status()
  f.resolve({ application: 'failed', bundle, changed: true, error: { code: 'activation-failed' } })
  await tick()
  const status = await f.service.status()
  assert.equal(status.phase, 'failed'); assert.match(status.message, /安装文件已改变.*未自动回退/)
  assert.equal((await f.service.check()).canInstall, true, 'a healthy target gate can explicitly install a newer repair release')
  const reopened = new NativeUpdateService(f.options)
  t.after(() => reopened.dispose())
  assert.equal((await reopened.status()).phase, 'failed')
})

test('null native lookup after process exit or receipt loss never proves success', async t => {
  const f = fixture(t)
  await f.service.status(); f.resolve(null); await tick()
  assert.equal((await f.service.status()).phase, 'unknown')
  const check = await f.service.check()
  assert.equal(check.status.phase, 'unknown', 'a new ticket does not manufacture the old result')
  assert.equal(check.canInstall, true, 'only a distinct future release is permitted after an explicit absent native job reply')
  assert.equal(f.waits(), 1, 'no repeated wait loop after an absent active job')
})

test('late native observer cannot overwrite a newer job journal', async t => {
  const f = fixture(t)
  await f.service.status()
  const newer = { ...pending, jobId: 'b'.repeat(32), targetVersion: '1.9.0' }
  fs.writeFileSync(f.journal, JSON.stringify(newer))
  f.resolve({ application: 'failed', changed: true, bundle }); await tick()
  assert.deepEqual(JSON.parse(fs.readFileSync(f.journal)), newer)
})

test('late progress/duplicate outcome cannot replace an already recorded native terminal receipt', async t => {
  const f = fixture(t)
  await f.service.status()
  const final = { ...pending, phase: 'unknown', message: 'partial', nativeResult: { application: 'failed', changed: true, bundle } }
  fs.writeFileSync(f.journal, JSON.stringify(final))
  f.resolve({ application: 'applied', bundle }); await tick()
  assert.deepEqual(JSON.parse(fs.readFileSync(f.journal)), final)
  assert.equal((await f.service.status()).phase, 'failed')
})

test('same live gate re-reads original writer receipt after reconnect', async t => {
  const f = fixture(t)
  await f.service.status(); f.resolve(null); await tick()
  assert.equal((await f.service.status()).phase, 'unknown')
  fs.writeFileSync(f.journal, JSON.stringify({ ...pending, phase: 'restart-required', nativeResult: { application: 'applied', bundle } }))
  assert.equal((await f.service.status()).phase, 'complete')
  assert.equal((await f.service.check()).canInstall, true)
})

test('legacy confirmed restart receipt remains compatible; interrupted legacy journal does not gain false proof', async t => {
  for (const phase of ['restart-required', 'complete']) {
    const f = fixture(t, { ...pending, phase })
    assert.equal((await f.service.status()).phase, 'complete')
    assert.equal(f.waits(), 0)
  }
  const f = fixture(t)
  delete f.manager.waitForInstall
  assert.equal((await f.service.status()).phase, 'unknown')
})

test('confirmed installation without activation remains restart-required and never repeats installation', async t => {
  const f = fixture(t, { ...pending, phase: 'restart-required', nativeResult: { application: 'restart-required', bundle } }, previous)
  assert.equal((await f.service.status()).phase, 'restart-required')
  assert.equal((await f.service.check()).canInstall, false)
})

test('missing/wrong owner and wrong installed version cannot turn a native receipt into a false success', async t => {
  const wrongOwner = fixture(t, { ...pending, phase: 'restart-required', nativeResult: { application: 'applied', bundle: 'other' } })
  assert.equal((await wrongOwner.service.status()).phase, 'unknown')
  const wrongVersion = fixture(t, { ...pending, phase: 'restart-required', nativeResult: { application: 'applied', bundle } })
  wrongVersion.version(previous)
  assert.equal((await wrongVersion.service.status()).phase, 'unknown')
})

test('corrupt receipt refuses read-only recovery and issues no new ticket', async t => {
  const f = fixture(t, { ...pending, nativeResult: { application: 'made-up-success' } })
  assert.equal((await f.service.status()).phase, 'unknown')
  assert.equal((await f.service.check()).canInstall, false)
})

test('absent observation can finish during check without a second manual refresh', async t => {
  const f = fixture(t)
  f.resolve(null)
  const result = await f.service.check()
  assert.equal(result.status.phase, 'unknown')
  assert.equal(result.canInstall, true)
  assert.equal(f.waits(), 1)
})

test('unknown old update is never retried at the same target, even when it is absent', async t => {
  const f = fixture(t, { ...pending, targetVersion: '1.9.0' })
  f.resolve(null)
  const result = await f.service.check()
  assert.equal(result.status.phase, 'unknown')
  assert.equal(result.canInstall, false)
  assert.equal(result.ticket, '')
})

test('missing native observation, lookup error, or mismatched running files cannot authorize an unknown update', async t => {
  for (const variant of ['missing', 'error', 'mismatched']) {
    const f = fixture(t)
    if (variant === 'missing') delete f.manager.waitForInstall
    if (variant === 'error') f.manager.waitForInstall = async () => { throw Error('lookup unavailable') }
    if (variant === 'mismatched') { f.version(previous); f.resolve(null) }
    const result = await f.service.check()
    assert.equal(result.canInstall, false, variant)
    assert.notEqual(result.status.phase, 'complete', variant)
  }
})

test('historical fields and native diagnostics are not exposed by the public status', async t => {
  const f = fixture(t, { ...pending, phase: 'complete', secret: 'private fixture',
    nativeResult: { application: 'failed', bundle, changed: true, diagnostic: 'private native fixture', packageKind: 'timeout', errorCode: 'network', extra: 'private' } })
  const status = await f.service.status()
  assert.equal(status.phase, 'failed', 'a definite failure cannot keep a stale success label')
  assert.equal(status.nativeResult.changed, true)
  assert.equal(status.nativeResult.packageKind, 'timeout')
  assert.equal(status.nativeResult.errorCode, 'network')
  assert.equal(status.secret, undefined)
  assert.equal(status.nativeResult.diagnostic, undefined)
  assert.equal(status.nativeResult.extra, undefined)
})

test('a historical native failure does not allow a second install of the same already installed version', async t => {
  const f = fixture(t, { ...pending, phase: 'unknown', nativeResult: { application: 'failed', changed: true, bundle } }, '1.9.0')
  f.version('1.9.0')
  const result = await f.service.check()
  assert.equal(result.status.phase, 'failed')
  assert.equal(result.canInstall, false)
})
