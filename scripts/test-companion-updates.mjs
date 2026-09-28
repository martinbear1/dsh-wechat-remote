import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { companionTarget, offerCompanionUpdate as propose, decideCompanionOffer, applyNativeCompanion, mountCompanionUpdates, webInstallerRuntime } from '../lib/companion-updates.js'

// The existing transaction tests start after the operator confirmation. Tests
// below exercise the new unapproved/deferred boundary independently.
function offerCompanionUpdate(...args) {
  const offer = propose(...args)
  if (offer) decideCompanionOffer(args[0], offer, 'approve')
  return offer
}

const native = 'dsh-wechat-remote', core = '@harness-remote/dsh-wechat-remote', next = '1.7.12-rc.4'
function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-companion-')))
  t.after(() => { assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir())); assert(path.basename(home).startsWith('dsh-companion-')); fs.rmSync(home, { recursive: true, force: true }) })
  const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
  function target(scope, owner = native, version = '1.7.10', enabled = [owner]) {
    const dir = path.join(home, 'profiles', scope)
    put(path.join(dir, 'package.json'), { dependencies: { [owner]: version }, dsh: { profile: { bundles: enabled } } })
    put(path.join(dir, 'node_modules', owner, 'package.json'), { name: owner, version })
  }
  const source = path.join(home, 'installer'), bytes = Buffer.from('fixture-only-core')
  put(path.join(source, 'package.json'), { name: native, version: next, dsh: { bundle: { patch: './cordis.patch.yml' } } })
  put(path.join(source, 'assets/release.json'), { version: next, catalog: { releases: [{ version: next, asset: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }] } })
  fs.writeFileSync(path.join(source, 'assets/plugin.tgz'), bytes)
  return { home, source, target, put }
}

test('offers only update an existing enabled peer, never install/enable/downgrade', t => {
  const f = fixture(t)
  assert.equal(offerCompanionUpdate(f.home, 'web', f.source, next), undefined)
  for (const [version, enabled] of [['1.7.10', []], [next, [native]], ['1.8.0', [native]]]) {
    f.target('desktop', native, version, enabled)
    assert.equal(offerCompanionUpdate(f.home, 'web', f.source, next), undefined)
  }
  f.target('desktop', native)
  const offer = offerCompanionUpdate(f.home, 'web', f.source, next)
  assert.equal(offer.to, 'desktop')
  assert.equal(offerCompanionUpdate(f.home, 'web', f.source, next).id, offer.id)
  f.put(path.join(f.home, 'profiles/desktop/package.json'), { dependencies: { [core]: '1.7.10', [native]: '1.7.10' }, dsh: { profile: { bundles: [core, native] } } })
  assert.equal(companionTarget(f.home, 'desktop'), undefined)
})

for (const from of ['web', 'desktop']) {
  const to = from === 'web' ? 'desktop' : 'web'
  for (const scenario of ['host-absent', 'host-without-plugin', 'disabled-plugin', 'same-version', 'newer-version', 'mixed-owners', 'old-enabled-plugin']) {
    test(`${from} first install, peer ${scenario}: one package never installs or enables an unsolicited peer`, t => {
      const f = fixture(t), owner = to === 'desktop' ? native : core
      const peerProfile = path.join(f.home, 'profiles', to)
      if (scenario === 'host-without-plugin') f.put(path.join(peerProfile, 'package.json'), { dependencies: {}, dsh: { profile: { bundles: [] } } })
      else if (scenario !== 'host-absent') {
        f.target(to, owner, scenario === 'same-version' ? next : scenario === 'newer-version' ? '9.0.0' : '1.7.10', scenario === 'disabled-plugin' ? [] : [owner])
        if (scenario === 'mixed-owners') f.put(path.join(peerProfile, 'package.json'), { dependencies: { [core]: '1.7.10', [native]: '1.7.10' }, dsh: { profile: { bundles: [core, native] } } })
      }
      const manifest = path.join(peerProfile, 'package.json')
      const before = fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null
      const offer = propose(f.home, from, f.source, next)
      assert.equal(Boolean(offer), scenario === 'old-enabled-plugin')
      assert.equal(fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null, before)
      assert.equal(fs.existsSync(path.join(f.home, `harness-remote/installation-offers/decision-${to}.json`)), false, 'offering is not approving')
      if (offer) { assert.equal(offer.schema, 2); assert.equal(offer.previous, '1.7.10'); assert.equal(companionTarget(f.home, to).version, '1.7.10') }
    })
  }
  test(`${from} without another host mounts independently without a false aligned/upgrade status`, async t => {
    const f = fixture(t)
    const ctx = { get: key => key === 'profileContext' ? { name: from, home: f.home, dir: path.join(f.home, 'profiles', from), installAnchor: path.join(f.home, 'runtime/package.json') } : undefined }
    const coordinator = mountCompanionUpdates(ctx, next)
    t.after(() => coordinator.dispose())
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(coordinator.status().state, 'idle')
    assert.equal(fs.existsSync(path.join(f.home, 'profiles', to)), false)
  })
}

test('native update uses a staged archive, then reports restart rather than running', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = offerCompanionUpdate(f.home, 'web', f.source, next)
  const calls = [], archive = path.join(f.home, 'immutable.tgz')
  const services = { list: async () => ({ items: [{ running: false }] }),
    stage: async () => { calls.push('stage'); return archive },
    install: async spec => { calls.push(spec); f.target('desktop', native, next); return { application: 'restart-required', bundle: native } },
  }
  assert.equal((await applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, services)).state, 'restart-required')
  assert.deepEqual(calls, ['stage', archive])
  assert.equal((await applyNativeCompanion(f.home, 'desktop', next, offer, services)).state, 'complete')
  assert.equal(calls.length, 2)
})

test('busy peer is untouched and activity starting during packing defers installation', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = offerCompanionUpdate(f.home, 'web', f.source, next)
  const services = { list: async () => ({ items: [{ running: true }] }), stage: async () => assert.fail(), install: async () => assert.fail() }
  assert.equal((await applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, services)).state, 'busy')
  let reads = 0
  services.list = async () => ({ items: [{ running: ++reads > 1 }] })
  services.stage = async () => path.join(f.home, 'package.tgz')
  assert.equal((await applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, services)).state, 'busy')
})

test('native rejection/build approval cannot be bypassed or retried under another owner', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = offerCompanionUpdate(f.home, 'web', '', next)
  let calls = 0
  await assert.rejects(applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, {
    list: async () => ({ items: [] }), install: async spec => { calls++; assert.equal(spec, `${native}@${next}`); return { application: 'failed', error: { code: 'stale-approval' } } },
  }), /审批/)
  assert.equal(calls, 1)
  assert.equal(companionTarget(f.home, 'desktop').version, '1.7.10')
})

test('manual downgrade, removal or disable invalidates pending upgrade', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = offerCompanionUpdate(f.home, 'web', '', next)
  const services = { list: async () => assert.fail(), install: async () => assert.fail() }
  f.target('desktop', native, '1.7.9')
  await assert.rejects(applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, services), /已变化/)
  f.target('desktop', native, '1.7.10', [])
  await assert.rejects(applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, services), /已变化/)
  f.target('desktop', native, '1.7.10')
  await assert.rejects(applyNativeCompanion(f.home, 'desktop', next, offer, services), /磁盘安装已变化/)
})

test('Web core can notify Desktop without carrying or modifying its native package', async t => {
  const f = fixture(t); f.target('desktop')
  const ctx = { get: key => key === 'profileContext' ? { name: 'web', home: f.home,
    dir: path.join(f.home, 'profiles/web'), installAnchor: path.join(f.home, 'runtime/package.json') } : undefined }
  const coordinator = mountCompanionUpdates(ctx, next)
  t.after(() => coordinator.dispose())
  await new Promise(resolve => setImmediate(resolve))
  const offer = JSON.parse(fs.readFileSync(path.join(f.home, 'harness-remote/installation-offers/desktop.json')))
  assert.equal(offer.source, '')
  assert.equal(offer.version, next)
  assert.equal(companionTarget(f.home, 'desktop').version, '1.7.10')
  assert.equal(coordinator.status().state, 'confirmation-required')
})

test('coordination filesystem failure cannot throw into plugin/host startup', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.home, 'harness-remote'), 'not-a-directory')
  const ctx = { get: key => key === 'profileContext' ? { name: 'desktop', home: f.home,
    dir: path.join(f.home, 'profiles/desktop'), installAnchor: path.join(f.home, 'runtime/package.json') } : undefined }
  const coordinator = mountCompanionUpdates(ctx, next)
  assert.equal(coordinator.status().state, 'unavailable')
  coordinator.dispose()
})

test('Desktop coordination finds a real Node without passing Electron ownership to Web', async () => {
  const environment = { ...process.env, PATH: path.dirname(process.execPath), ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: '/desktop' }
  const runtime = await webInstallerRuntime(environment, true)
  assert.equal(fs.realpathSync(runtime.executable), fs.realpathSync(process.execPath))
  assert.equal(runtime.env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(runtime.env.DSH_DESKTOP_NODE_EXECUTABLE, undefined)
  assert.equal(environment.ELECTRON_RUN_AS_NODE, '1', 'do not mutate the current host')
  await assert.rejects(webInstallerRuntime({ PATH: '' }, true), /独立 Node/)
})

function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function until(predicate) {
  for (let n = 0; n < 400; n++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)) }
  assert.fail('coordinator did not reach the expected state')
}
function context(f, services = {}) {
  const events = new Map()
  return { events, get: key => key === 'profileContext' ? { name: 'desktop', home: f.home,
    dir: path.join(f.home, 'profiles/desktop'), installAnchor: path.join(f.home, 'runtime/package.json') } : services[key],
    on(name, fn) { events.set(name, fn); return () => events.delete(name) } }
}

test('agent idle arriving during a busy check is not lost; no turn/end guess is used', async t => {
  const f = fixture(t); f.target('desktop')
  offerCompanionUpdate(f.home, 'web', '', next)
  const first = deferred(); let queries = 0, installs = 0
  const ctx = context(f, { sessionController: { list: async () => {
    if (++queries === 1) { await first.promise; return { items: [{ running: true }] } }
    return { items: [{ running: false }] }
  } }, pluginManager: { installBundle: async () => {
    installs++; f.target('desktop', native, next); return { application: 'restart-required', bundle: native }
  } } })
  const mounted = mountCompanionUpdates(ctx, '1.7.10'); t.after(() => mounted.dispose())
  await until(() => queries === 1)
  assert.equal(ctx.events.has('session/event'), false)
  ctx.events.get('agent/status')({ status: 'idle' })
  first.resolve()
  await until(() => mounted.status().state === 'self-restart-required')
  assert.equal(installs, 1)
  assert.equal(queries, 3, 'one busy snapshot, then two idle fences')
  ctx.events.get('agent/status')({ status: 'idle' })
  await new Promise(r => setImmediate(r))
  assert.equal(installs, 1, 'waiting for restart cannot reinstall repeatedly')
})

test('replacement offers and manual installs during the final idle query cannot be overwritten', async t => {
  for (const change of ['new-offer', 'disabled', 'already-upgraded']) {
    const f = fixture(t); f.target('desktop')
    const offer = offerCompanionUpdate(f.home, 'web', '', next); let queries = 0
    await assert.rejects(applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, {
      list: async () => {
        if (++queries === 2) {
          if (change === 'new-offer') f.put(path.join(f.home, 'harness-remote/installation-offers/desktop.json'), { ...offer, id: 'f'.repeat(32) })
          if (change === 'disabled') f.target('desktop', native, '1.7.10', [])
          if (change === 'already-upgraded') f.target('desktop', native, next)
        }
        return { items: [] }
      }, install: async () => assert.fail('no stale mutation'),
    }), /已变化/)
  }
})

test('dispose before native admission prevents mutation and leaves the offer retryable', async t => {
  const f = fixture(t); f.target('desktop')
  offerCompanionUpdate(f.home, 'web', '', next)
  const held = deferred(); let queried = false
  const ctx = context(f, { sessionController: { list: async () => { queried = true; await held.promise; return { items: [] } } },
    pluginManager: { installBundle: async () => assert.fail('disposed host cannot start a native update') } })
  const mounted = mountCompanionUpdates(ctx, '1.7.10')
  await until(() => queried)
  mounted.dispose(); held.resolve()
  await new Promise(r => setImmediate(r))
  assert.equal(ctx.events.size, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, 'harness-remote/installation-offers/result-desktop.json'))).state, 'pending')
  assert.equal(companionTarget(f.home, 'desktop').version, '1.7.10')
})

test('cancellation during packing cannot progress to native installation', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = offerCompanionUpdate(f.home, 'web', f.source, next), controller = new AbortController()
  await assert.rejects(applyNativeCompanion(f.home, 'desktop', '1.7.10', offer, {
    signal: controller.signal, list: async () => ({ items: [] }),
    stage: async () => { controller.abort(); return 'never-used.tgz' }, install: async () => assert.fail(),
  }), { name: 'AbortError' })
})

test('a native service arriving late wakes pending coordination through Cordis injection', async t => {
  const f = fixture(t); f.target('desktop'); offerCompanionUpdate(f.home, 'web', '', next)
  const ctx = new Context(); let mounted, installs = 0
  ctx.provide('profileContext', { name: 'desktop', home: f.home,
    dir: path.join(f.home, 'profiles/desktop'), installAnchor: path.join(f.home, 'runtime/package.json') })
  const consumer = ctx.plugin({ name: 'companion-fixture', apply(owner) {
    mounted = mountCompanionUpdates(owner, '1.7.10'); return () => mounted.dispose()
  } })
  await consumer
  t.after(async () => { await consumer.dispose(); await ctx.fiber.dispose() })
  await until(() => mounted?.status().state === 'pending')
  const provider = ctx.plugin({ name: 'manager-fixture', apply(owner) {
    owner.provide('sessionController', { list: async () => ({ items: [] }) })
    owner.provide('pluginManager', { installBundle: async () => {
      installs++; f.target('desktop', native, next); return { application: 'restart-required', bundle: native }
    } })
  } })
  await provider
  await until(() => mounted.status().state === 'self-restart-required')
  assert.equal(installs, 1)
})

test('completed peer receipt is not presented as success after manual downgrade or disable', async t => {
  const f = fixture(t); f.target('desktop')
  f.target('web', core, next)
  const ctx = { get: key => key === 'profileContext' ? { name: 'web', home: f.home,
    dir: path.join(f.home, 'profiles/web'), installAnchor: path.join(f.home, 'runtime/package.json') } : undefined }
  const mounted = mountCompanionUpdates(ctx, next); t.after(() => mounted.dispose())
  await new Promise(r => setImmediate(r))
  const offer = JSON.parse(fs.readFileSync(path.join(f.home, 'harness-remote/installation-offers/desktop.json')))
  decideCompanionOffer(f.home, offer, 'approve')
  f.target('desktop', native, next)
  f.put(path.join(f.home, 'harness-remote/installation-offers/result-desktop.json'), { schema: 2, id: offer.id, version: next, state: 'complete', message: '已对齐' })
  assert.equal(mounted.status().state, 'complete')
  for (const [version, enabled] of [['1.7.10', [native]], ['1.7.9', [native]], [next, []]]) {
    f.target('desktop', native, version, enabled)
    assert.equal(mounted.status().state, 'unavailable')
  }
})

test('unseen and deferred notices never query tasks, stage packages or install; exact confirmation admits once', async t => {
  const f = fixture(t); f.target('desktop')
  const offer = propose(f.home, 'web', '', next)
  assert.equal(offer.schema, 2, 'old automatic receivers must reject this protocol')
  let installs = 0, queries = 0
  const ctx = context(f, { sessionController: { list: async () => { queries++; return { items: [] } } },
    pluginManager: { installBundle: async () => { installs++; f.target('desktop', native, next); return { application: 'restart-required', bundle: native } } } })
  const mounted = mountCompanionUpdates(ctx, '1.7.10'); t.after(() => mounted.dispose())
  await until(() => mounted.status().state === 'confirmation-required')
  assert.equal(queries, 0); assert.equal(installs, 0)
  mounted.decide(offer.id, 'later')
  await until(() => mounted.status().state === 'deferred')
  ctx.events.get('agent/status')({ status: 'idle' })
  await new Promise(r => setImmediate(r))
  assert.equal(queries, 0)
  assert.throws(() => mounted.decide('e'.repeat(32), 'approve'), /过期/)
  mounted.decide(offer.id, 'approve')
  await until(() => mounted.status().state === 'self-restart-required')
  assert.equal(installs, 1)
})

test('new files plus old loaded runtime never reuse an old aligned receipt or approve peer updates', async t => {
  const f = fixture(t)
  f.target('desktop', native, next); f.target('web', core, next)
  const receipt = { schema: 2, id: 'a'.repeat(32), from: 'desktop', to: 'web', version: next, previous: '1.7.10', source: f.source }
  f.put(path.join(f.home, 'harness-remote/installation-offers/web.json'), receipt)
  f.put(path.join(f.home, 'harness-remote/installation-offers/result-web.json'), { ...receipt, state: 'complete', message: '已对齐' })
  const mounted = mountCompanionUpdates(context(f), next); t.after(() => mounted.dispose())
  assert.equal(mounted.status().state, 'complete')
  f.target('desktop', native, '1.7.12-rc.7')
  const value = mounted.status()
  assert.equal(value.state, 'self-restart-required')
  assert.equal(value.versions.running, next)
  assert.equal(value.versions.installed, '1.7.12-rc.7')
  assert.equal(value.versions.peerInstalled, next)
  assert.throws(() => mounted.decide(receipt.id, 'approve'), /重启/)
})

test('incoming completion is revalidated when the source is later upgraded, disabled or removed', async t => {
  const f = fixture(t); f.target('desktop'); f.target('web', core, next)
  const offer = offerCompanionUpdate(f.home, 'web', '', next)
  f.target('desktop', native, next)
  const mounted = mountCompanionUpdates(context(f), next); t.after(() => mounted.dispose())
  await until(() => mounted.status().state === 'complete')
  f.target('web', core, '1.7.12-rc.7')
  assert.equal(mounted.status().state, 'unavailable')
  f.target('web', core, next, [])
  assert.equal(mounted.status().state, 'unavailable')
  assert.equal(companionTarget(f.home, 'desktop').version, next)
})
