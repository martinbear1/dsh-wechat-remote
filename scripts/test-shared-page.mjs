import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
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
  const state = { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: false, state: 'disabled' }, companionUpdate: { state: 'confirmation-required', message: 'fixture', offerId: 'a'.repeat(32) } }
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
test('one synchronous decision guard protects all entry points; viewing does not approve', async () => {
  const f = fixture()
  try {
    await f.store.refresh()
    assert.equal(f.calls.includes('companion-decision'), false)
    await Promise.all([f.store.decide('approve'), f.store.decide('approve')])
    assert.equal(f.calls.filter(x => x === 'companion-decision').length, 1)
  } finally { f.store.dispose() }
})

test('new page cannot display old backend completion as present-day alignment', async () => {
  const f = fixture()
  try {
    f.state.companionUpdate = { state: 'complete', message: '两端插件已对齐' }
    await f.store.refresh()
    assert.equal(f.store.getSnapshot().status.companionUpdate.state, 'unverified')
    assert.equal(f.state.companionUpdate.state, 'complete', 'does not mutate backend snapshot')
    f.state.plugin = { runningVersion: '1.7.12-rc.7', installedVersion: '1.7.12-rc.7' }
    await f.store.refresh()
    assert.equal(f.store.getSnapshot().status.companionUpdate.state, 'complete')
  } finally { f.store.dispose() }
})

test('companion busy boundary refreshes native advice once, not on every status poll', async () => {
  const busyStates = ['preparing', 'installing', 'verifying', 'recovering']
  for (const terminal of ['complete', 'unavailable', 'restart-required', 'deferred']) {
    let state = 'installing', reads = 0
    const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async endpoint => {
      if (endpoint === 'status') return { plugin: { runningVersion: '1.7.12' }, gate: runtime, companionUpdate: { state } }
      assert.equal(endpoint, 'update-check', 'viewing cannot install or approve')
      reads++
      return { advice: { current: {} }, channel: 'stable', canInstall: false, ticket: '',
        reason: busyStates.includes(state) ? '正在处理插件更新，请等待完成' : '', status: { phase: 'complete', message: '已生效' } }
    })
    let off
    try {
      await store.refresh()
      off = store.nativeUpdates.subscribe(() => {})
      await store.nativeUpdates.refresh(); assert.equal(reads, 1)
      for (state of busyStates) await store.refresh()
      assert.equal(reads, 1, 'busy progress must not repeatedly fetch the catalog')
      state = terminal; await store.refresh(); await new Promise(resolve => setImmediate(resolve))
      assert.equal(reads, 2); assert.equal(store.nativeUpdates.getSnapshot().check.reason, '')
      await store.refresh(); assert.equal(reads, 2)
    } finally { off?.(); store.dispose() }
  }
})

test('companion completion while views are hidden is revalidated once on return', async () => {
  let state = 'installing', reads = 0
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async endpoint => {
    if (endpoint === 'status') return { plugin: { runningVersion: '1.7.12' }, gate: runtime, companionUpdate: { state } }
    assert.equal(endpoint, 'update-check'); reads++
    return { advice: { current: {} }, canInstall: false, reason: state === 'installing' ? 'busy' : '', status: { phase: 'complete' } }
  })
  let off
  try {
    await store.refresh(); off = store.nativeUpdates.subscribe(() => {}); await store.nativeUpdates.refresh(); off()
    state = 'complete'; await store.refresh(); assert.equal(reads, 1)
    off = store.nativeUpdates.subscribe(() => {}); await new Promise(resolve => setImmediate(resolve))
    assert.equal(reads, 2); assert.equal(store.nativeUpdates.getSnapshot().check.reason, '')
  } finally { off?.(); store.dispose() }
})

test('missing companion state is not completion, and old Web never gets native checks', async () => {
  const f = fixture()
  try {
    await f.store.refresh()
    let invalidations = 0
    f.store.nativeUpdates.invalidateCheck = () => invalidations++
    f.state.companionUpdate = { state: 'installing' }; await f.store.refresh()
    assert.equal(invalidations, 1)
    delete f.state.companionUpdate; await f.store.refresh(); assert.equal(invalidations, 1)
    f.state.companionUpdate = { state: 'complete' }; f.state.plugin = { runningVersion: '1.7.12' }
    await f.store.refresh(); assert.equal(invalidations, 2)
  } finally { f.store.dispose() }
  let state = 'installing'
  const webRuntime = { ...runtime, profileScope: 'web' }
  const web = new RemotePageStore(async () => ({ computerName: 'web', agentName: 'web', gate: webRuntime }), async endpoint => {
    assert.equal(endpoint, 'status')
    return { plugin: { runningVersion: '1.7.12' }, gate: webRuntime, companionUpdate: { state } }
  })
  try {
    await web.refresh(); state = 'complete'; await web.refresh()
    assert.equal(web.nativeUpdates, undefined)
  } finally { web.dispose() }
})

test('host replacement disposes the old in-flight native check without transferring its reason', async () => {
  let id = 'first', state = 'installing', release, checks = 0
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: id, gate: runtime }), async endpoint => {
    if (endpoint === 'status') return { plugin: { runningVersion: '1.7.12' }, gate: runtime, companionUpdate: { state } }
    assert.equal(endpoint, 'update-check'); checks++
    if (id === 'first') return new Promise(resolve => { release = resolve })
    return { advice: { current: {} }, canInstall: false, reason: '', status: { phase: 'complete' } }
  })
  let off, nextOff
  try {
    await store.refresh(); const old = store.nativeUpdates
    off = old.subscribe(() => {}); const pending = old.refresh()
    id = 'second'; state = 'complete'; await store.refresh()
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
