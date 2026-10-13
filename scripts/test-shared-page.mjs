import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import { NativeUpdateService, supportsNativeUpdates } from '../lib/native-update-service.js'
const load = async name => {
  const output = await build({ entryPoints: [fileURLToPath(new URL(`../src/client/${name}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs' })
  const module = { exports: {} }
  vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, fetch, Date, URL, AbortSignal, setInterval, clearInterval, setTimeout, clearTimeout })
  return module.exports
}
const { RemotePageStore } = await load('remote-page-store')
const { openPluginPage } = await load('page-navigation')
const runtime = { profileScope: 'desktop', management: 'authenticated-rpc', localDoor: { port: 4000, state: 'listening' }, publicDoor: { port: 4001, state: 'listening' } }
const fixture = () => {
  let calls = [], id = 'first', expire = Date.now() + 900000
  const state = { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: false, state: 'disabled' } }
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: id, gate: runtime }), async (endpoint) => {
    calls.push(endpoint)
    await new Promise(resolve => setImmediate(resolve))
    if (endpoint === 'pair-code') return { qrDataUrl: 'data:image/png;base64,fixture', expiresAt: expire, mode: 'secure-lan-route' }
    return state
  })
  return { store, calls, state, changeHost() { id = 'other' }, expire() { expire = Date.now() + 5 } }
}
test('two entry subscriptions fold status reads, share QR, and never create one on mount/reopen', async () => {
  const f = fixture(), seen = [0, 0]
  const a = f.store.subscribe(() => seen[0]++), b = f.store.subscribe(() => seen[1]++)
  try {
    await Promise.all([f.store.refresh(), f.store.refresh()])
    assert.deepEqual(f.calls, ['status'])
    await Promise.all([f.store.generateQr(), f.store.generateQr()])
    assert.equal(f.calls.filter(x => x === 'pair-code').length, 1)
    const qr = f.store.getSnapshot().qr
    a(); b()
    const c = f.store.subscribe(() => {})
    await f.store.refresh(); c()
    assert.equal(f.store.getSnapshot().qr, qr)
    assert.equal(f.calls.filter(x => x === 'pair-code').length, 1)
    assert(seen.every(x => x > 1))
  } finally { a(); b(); f.store.dispose() }
})
test('expired QR clears without regeneration; another host never inherits it', async () => {
  const f = fixture()
  try {
    f.expire(); await f.store.generateQr()
    await new Promise(resolve => setTimeout(resolve, 10)); await f.store.refresh()
    assert.equal(f.store.getSnapshot().qrState, 'expired')
    assert.equal(f.store.getSnapshot().qr, null)
    assert.equal(f.calls.filter(x => x === 'pair-code').length, 1)
    f.changeHost(); await f.store.refresh()
    assert.equal(f.store.getSnapshot().qrState, 'idle')
    assert.equal(f.store.getSnapshot().qr, null)
  } finally { f.store.dispose() }
})
test('Web native capability selects one authenticated updater, with no update checks during ordinary status refresh', async () => {
  const calls = [], webRuntime = { ...runtime, profileScope: 'web', updates: 'native-v1' }
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: webRuntime }), async endpoint => {
    calls.push(endpoint)
    if (endpoint === 'status') return { gate: webRuntime, plugin: { runningVersion: '1.7.14-rc.47' } }
    assert.equal(endpoint, 'update-check')
    return { advice: { current: {} }, canInstall: true, ticket: 'confirmed', status: { phase: 'idle' } }
  })
  try {
    await store.refresh(); await store.refresh()
    assert(store.nativeUpdates)
    assert.equal(store.updates, undefined, 'no simultaneous legacy updater')
    assert.deepEqual(calls, ['status', 'status'])
    await store.nativeUpdates.refresh()
    assert.deepEqual(calls, ['status', 'status', 'update-check'])
    assert.equal(store.nativeUpdates.getSnapshot().check.canInstall, true)
    delete webRuntime.updates
    await store.refresh()
    assert.equal(store.nativeUpdates, undefined)
    assert(store.updates, 'old backend keeps its original explicitly described update door')
  } finally { store.dispose() }
})

test('actual client and service follow live manager capability; old Desktop without a declaration retains its native path', async t => {
  for (const profileScope of ['web', 'desktop']) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-page-update-'))
    t.after(() => fs.rmSync(home, { recursive: true, force: true }))
    let manager, inventoryReads = 0
    const calls = [], current = '1.7.13', target = '1.8.0'
    const service = new NativeUpdateService({ home, scope: profileScope, runningVersion: current, manager: () => manager,
      sessions: () => ({ list: async () => assert.fail('viewing must not query tasks') }),
      release: async () => ({ channel: 'stable', advice: { component: 'plugin', targetVersion: target, revision: 'fixture', current: { pluginVersion: current } },
        release: { version: target, npmInstaller: { version: target, url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${target}.tgz`, bytes: 1, sha256: 'a'.repeat(64) } } }) })
    const snapshot = () => ({ ...runtime, profileScope, ...(supportsNativeUpdates(manager, profileScope) ? { updates: 'native-v1' } : {}) })
    const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: snapshot() }), async endpoint => {
      calls.push(endpoint)
      if (endpoint === 'status') return { gate: snapshot(), plugin: { runningVersion: current } }
      assert.equal(endpoint, 'update-check', 'viewing never installs or approves')
      return service.check()
    })
    try {
      await store.refresh()
      assert.equal(store.getSnapshot().loadState, 'ready', 'missing update capability does not fail the main page')
      assert.equal(Boolean(store.nativeUpdates), profileScope === 'desktop', 'preserve old Desktop 1.7.13 without updates field')
      assert.equal(Boolean(store.updates), profileScope === 'web')
      assert.deepEqual(calls, ['status'])
      if (store.nativeUpdates) {
        await store.nativeUpdates.refresh()
        assert.equal(store.nativeUpdates.getSnapshot().check.canInstall, false)
        assert.match(store.nativeUpdates.getSnapshot().check.reason, /先将 DSH 更新/)
      }
      manager = { listBundles: async () => { inventoryReads++; return [{ name: 'dsh-wechat-remote', version: current, installed: true, enabled: true }] },
        installBundle: async () => assert.fail('capability appearance cannot start installation') }
      const before = calls.length
      await store.refresh(); await store.refresh()
      assert.equal(store.getSnapshot().loadState, 'ready')
      assert(store.nativeUpdates)
      assert.equal(store.updates, undefined)
      assert.deepEqual(calls.slice(before), ['status', 'status'])
      assert.equal(inventoryReads, 0, 'ordinary status refresh adds no inventory lookup')
      await store.nativeUpdates.refresh()
      assert.equal(store.nativeUpdates.getSnapshot().check.canInstall, true)
      assert.equal(store.nativeUpdates.getSnapshot().check.reason, '')
      manager = undefined
      await store.refresh()
      assert.equal(store.getSnapshot().loadState, 'ready')
      if (profileScope === 'web') assert.equal(store.nativeUpdates, undefined)
      else {
        await store.nativeUpdates.refresh()
        assert.equal(store.nativeUpdates.getSnapshot().check.canInstall, false)
      }
      assert.equal(fs.existsSync(path.join(home, 'harness-remote-updates')), false, 'capability discovery never writes a journal')
    } finally { store.dispose(); service.dispose() }
  }
})

test('host replacement disposes the old in-flight native check without transferring its reason', async () => {
  let id = 'first', release, checks = 0
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: id, gate: runtime }), async endpoint => {
    if (endpoint === 'status') return { plugin: { runningVersion: '1.7.12' }, gate: runtime }
    assert.equal(endpoint, 'update-check'); checks++
    if (id === 'first') return new Promise(resolve => { release = resolve })
    return { advice: { current: {} }, canInstall: false, reason: '', status: { phase: 'complete' } }
  })
  let off, nextOff
  try {
    await store.refresh(); const old = store.nativeUpdates
    off = old.subscribe(() => {}); const pending = old.refresh()
    id = 'second'; await store.refresh()
    nextOff = store.nativeUpdates.subscribe(() => {}); await store.nativeUpdates.refresh()
    release({ advice: { current: {} }, canInstall: false, reason: 'old host busy', status: { phase: 'complete' } })
    await pending; await new Promise(resolve => setImmediate(resolve))
    assert.equal(old.getSnapshot().check, null)
    assert.equal(store.nativeUpdates.getSnapshot().check.reason, '')
    assert.equal(checks, 2)
  } finally { off?.(); nextOff?.(); store.dispose() }
})
test('native navigation resolves enabled actual wrapper or core, never guessing by desktop/web', async () => {
  for (const name of ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']) {
    const opened = []
    const services = { pluginNavigation: { openBundle: name => opened.push(name) }, 'remote.pluginManager': { listBundles: async () => ({ ok: true, value: [{ name, enabled: true }] }) } }
    assert.equal(await openPluginPage(key => services[key]), true)
    assert.deepEqual(opened, [name])
  }
})

test('navigation works through real Cordis sibling services without undeclared Remote property access', async () => {
  const ctx = new Context(), opened = []
  try {
    await ctx.plugin({ name: 'native-providers', apply(owner) {
      new Service(owner, 'remote')
      class Manager extends Service {
        constructor() { super(owner, 'remote.pluginManager') }
        async listBundles() { return { ok: true, value: [{ name: 'dsh-wechat-remote', enabled: true }] } }
      }
      new Manager()
      owner.provide('pluginNavigation', { openBundle: name => opened.push(name) })
    } })
    let result
    await ctx.plugin({ name: 'wechat-navigation', apply(owner) {
      result = openPluginPage(name => owner.get(name))
    } })
    assert.equal(await result, true)
    assert.deepEqual(opened, ['dsh-wechat-remote'])
  } finally { await ctx.fiber.dispose() }
})
test('old/disabled/ambiguous/unavailable navigation gracefully retains settings path', async () => {
  for (const bundles of [[], [{ name: 'dsh-wechat-remote', enabled: false }], [{ name: 'dsh-wechat-remote', enabled: true }, { name: '@harness-remote/dsh-wechat-remote', enabled: true }]]) {
    const services = { pluginNavigation: { openBundle: () => assert.fail('wrong navigation') }, 'remote.pluginManager': { listBundles: async () => ({ ok: true, value: bundles }) } }
    assert.equal(await openPluginPage(key => services[key]), false)
  }
  assert.equal(await openPluginPage(() => undefined), false)
  assert.equal(await openPluginPage(() => { throw Error('late provider') }), false)
})

test('a vanished native provider leaves a small settings hint, never a third modal page', async () => {
  const output = await build({ entryPoints: [fileURLToPath(new URL('../src/client/WechatShortcut.tsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
  const state = [], refs = []; let index = 0, refIndex = 0
  const module = { exports: {} }
  vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, require(id) {
    if (id === 'react') return { useState(value) { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = next }] }, useRef(value) { return refs[refIndex++] ??= { current: value } } }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'NativeModal' }
    throw Error(id)
  } })
  const f = fixture()
  const render = () => { index = 0; refIndex = 0; return module.exports.WechatShortcut({ wide: true, store: f.store, describeHost: () => {}, callManagement: () => {}, openPlugin: async () => false }) }
  try {
    render().props.children[0].props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    const hint = render().props.children[1]
    assert.equal(hint.type, 'small')
    assert.match(hint.props.children, /设置 → 微信连接/)
    assert.deepEqual(f.calls, [], 'opening navigation itself never creates a pairing or update')
  } finally { f.store.dispose() }
})
