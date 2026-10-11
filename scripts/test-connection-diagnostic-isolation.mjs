// Synthetic observer faults against actual source stores; no real network or host writes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { build } from 'esbuild'
import { Component } from 'react'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = name => readFileSync(new URL('../src/client/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const baseline = name => execFileSync('git', ['show', '6591e83dfa964b97493c96f52f5fd4ea43aa4239:src/client/' + name], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n')
const runtime = { profileScope: 'desktop', management: 'authenticated-rpc', diagnostics: 'read-only-v1', localDoor: { port: 4000, state: 'listening' }, publicDoor: { port: 4001, state: 'listening' } }
const report = () => ({ schema: 1, source: 'plugin', startedAt: '2026-10-11T00:00:00.000Z', pluginRunningVersion: '1.7.14-rc.33', platform: 'win32', profileKind: 'desktop', relayEnabled: true, relayState: 'online', checks: [{ id: 'local-plugin', status: 'pass' }, { id: 'relay-health', status: 'pass', durationMs: 12 }, { id: 'agent-connection', status: 'not-tested' }] })
const tick = () => new Promise(resolve => setImmediate(resolve))
async function load(name, extra = {}) {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/' + name, import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
  const module = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, fetch, Date, URL, AbortSignal, AbortController,
    setInterval, clearInterval, setTimeout, clearTimeout, require(id) {
      if (id === 'react') return { Component }
      if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
      if (id.endsWith('.css')) return {}
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return { FishLogo: 'FishLogo', Modal: 'NativeModal' }
      throw Error(id)
    }, ...extra })
  return module.exports
}
const { RemotePageStore } = await load('remote-page-store.ts')
const { ConnectionDiagnosticStore } = await load('connection-diagnostic-store.ts')

test('normal page source and original assistant reset remain byte-identical to RC33 after LF normalization', () => {
  assert.equal(source('remote-page-store.ts'), baseline('remote-page-store.ts'))
  const effect = text => text.match(/  ctx\.effect\(\(\) => \{\n    const remove = ctx\.on\('connection\/reset',[\s\S]*?\}, 'wechat assistant lifecycle'\)/)?.[0]
  assert.ok(effect(source('index.ts'))); assert.equal(effect(source('index.ts')), effect(baseline('index.ts')))
  assert.doesNotMatch(source('remote-page-store.ts'), /diagnostic/i)
  assert.doesNotMatch(source('connection-diagnostic-store.ts'), /remote-page-store|RemotePageStore|NativeUpdateStore|WebUpdateStore/)
})

test('throwing diagnostic observer cannot affect pairing, status, decisions, identity cleanup or native updates', async () => {
  const timers = new Map(); let timerId = 0, host = 'first', faults = 0, successes = 0
  const { RemotePageStore: TimedPage } = await load('remote-page-store.ts', {
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id }, clearInterval(id) { timers.delete(id) },
  })
  const calls = [], describe = async () => ({ computerName: host, agentName: 'fixture', agentInstanceId: host, gate: runtime })
  const call = async (endpoint, payload) => {
    calls.push(endpoint)
    if (endpoint === 'connection-diagnostics') return report()
    if (endpoint === 'pair-code') return { mode: 'public-relay', qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000 }
    if (endpoint === 'companion-decision') { assert.equal(payload.offerId, 'offer'); return {} }
    assert.equal(endpoint, 'status')
    return { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'online' }, companionUpdate: { state: 'confirmation-required', offerId: 'offer' } }
  }
  const business = new TimedPage(describe, call), diagnostics = new ConnectionDiagnosticStore(describe, call)
  const offBad = diagnostics.subscribe(() => { faults++; throw Error('injected diagnostic observer failure') })
  const offGood = diagnostics.subscribe(() => { successes++ })
  const offPage = business.subscribe(() => {})
  try {
    await business.refresh(); await business.generateQr(); await business.decide('later')
    assert.equal(faults, 0, 'ordinary work never notifies even an open broken auxiliary view')
    assert.equal(calls.includes('connection-diagnostics'), false); assert.equal(business.getSnapshot().qrState, 'ready')
    assert.equal(business.getSnapshot().decisionError, null); assert.equal(business.getSnapshot().deciding, false)
    const before = business.getSnapshot(); await diagnostics.diagnose()
    assert.equal(faults, 2); assert.equal(successes, 2, 'one bad observer cannot prevent other views receiving results')
    assert.equal(business.getSnapshot(), before, 'diagnostic-only updates preserve the exact normal snapshot object')
    const oldUpdates = business.nativeUpdates; let disposed = 0; const originalDispose = oldUpdates.dispose
    oldUpdates.dispose = () => { disposed++; originalDispose.call(oldUpdates) }
    host = 'second'; await business.refresh()
    assert.equal(disposed, 1); assert.notEqual(business.nativeUpdates, oldUpdates); assert.equal(business.getSnapshot().host.agentInstanceId, 'second')
    assert.equal(faults, 2, 'native identity changes do not notify diagnostics')
    assert.doesNotThrow(() => diagnostics.reset()); assert.equal(business.getSnapshot().loadState, 'ready')
    const lastUpdates = business.nativeUpdates; const lastDispose = lastUpdates.dispose
    lastUpdates.dispose = () => { disposed++; lastDispose.call(lastUpdates) }
    await business.generateQr(); assert.equal(business.getSnapshot().qrState, 'ready'); assert.equal(timers.size, 1)
    assert.doesNotThrow(() => business.dispose()); assert.equal(timers.size, 0); assert.equal(business.nativeUpdates, undefined); assert.equal(disposed, 2)
    assert.doesNotThrow(() => diagnostics.dispose())
  } finally { offBad(); offGood(); offPage(); diagnostics.dispose(); business.dispose() }
})

test('two expanded views share results; only the final unsubscribe cancels and clears; passive remount never probes', async () => {
  let describeCalls = 0, probes = 0, release, signal
  const diagnostics = new ConnectionDiagnosticStore(async () => { describeCalls++; return { computerName: 'fixture', agentName: 'fixture', gate: runtime } }, async (_endpoint, _payload, nextSignal) => {
    probes++; signal = nextSignal; return new Promise(resolve => { release = resolve })
  })
  try {
    let off = diagnostics.subscribe(() => {}); off(); off = diagnostics.subscribe(() => {}); await tick()
    assert.equal(describeCalls, 0); assert.equal(probes, 0, 'StrictMode-like mount/cleanup/remount is passive')
    const offSecond = diagnostics.subscribe(() => {}), pending = diagnostics.diagnose(); await tick()
    off(); assert.equal(signal.aborted, false); assert.equal(diagnostics.getSnapshot().diagnosticState, 'running')
    offSecond(); assert.equal(signal.aborted, true); assert.equal(diagnostics.getSnapshot().diagnosticState, 'idle')
    release(report()); await pending; assert.equal(diagnostics.getSnapshot().diagnosticReport, null)
    assert.equal(describeCalls, 1); assert.equal(probes, 1)
  } finally { diagnostics.dispose() }
})

test('reentrant cancellation, reset or disposal while publishing running never starts describe or probe', async () => {
  for (const action of ['cancel', 'reset', 'dispose']) {
    let calls = 0
    const diagnostics = new ConnectionDiagnosticStore(async () => { calls++; throw Error('must not describe') }, async () => { calls++; throw Error('must not probe') })
    diagnostics.subscribe(() => { if (diagnostics.getSnapshot().diagnosticState === 'running') diagnostics[action]() })
    await diagnostics.diagnose(); assert.equal(calls, 0, action)
    assert.equal(diagnostics.getSnapshot().diagnosticState, action === 'cancel' ? 'cancelled' : 'idle'); diagnostics.dispose()
  }
})

test('reset and last view close while describe is pending discard late descriptions without probing', async () => {
  for (const action of ['reset', 'close']) {
    let release, probes = 0
    const diagnostics = new ConnectionDiagnosticStore(() => new Promise(resolve => { release = resolve }), async () => { probes++; return report() })
    const off = diagnostics.subscribe(() => {}), pending = diagnostics.diagnose(); await tick()
    if (action === 'reset') diagnostics.reset(); else off()
    release({ computerName: 'fixture', agentName: 'fixture', gate: runtime }); await pending
    assert.equal(probes, 0); assert.equal(diagnostics.getSnapshot().diagnosticState, 'idle'); off(); diagnostics.dispose()
  }
})

test('host rejection with a throwing code getter is contained without an unhandled rejection', async () => {
  const diagnostics = new ConnectionDiagnosticStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async () => {
    throw Object.defineProperty({}, 'code', { get() { throw Error('injected accessor failure') } })
  })
  diagnostics.subscribe(() => { throw Error('injected observer failure') })
  try { await assert.doesNotReject(diagnostics.diagnose()); assert.equal(diagnostics.getSnapshot().diagnosticState, 'error') }
  finally { assert.doesNotThrow(() => diagnostics.dispose()) }
})

test('actual client registration keeps diagnostic reset separate from assistant/native page lifecycles', async () => {
  const { apply } = await load('index.ts'), effects = new Map(), handlers = new Map(), cleanups = [], calls = []
  let injected
  const ctx = {
    get() {}, inject() {},
    effect(fn, name) { const cleanup = fn(); effects.set(name, cleanup); cleanups.push(cleanup) },
    on(name, handler) { assert.equal(name, 'connection/reset'); handlers.set(handler, true); return () => handlers.delete(handler) },
    connection: { rpc: { async call(channel, endpoint) {
      calls.push(endpoint)
      if (endpoint === 'wechatHost/describe') return { ok: true, value: { ok: true, value: { computerName: 'fixture', agentName: 'fixture', gate: runtime } } }
      if (endpoint === 'connection-diagnostics') return { ok: true, value: report() }
      assert.fail('unexpected RPC ' + channel + ':' + endpoint)
    } } },
    slots: { inject(_name, fn) { fn() }, register(spec) { if (spec.name === 'settings.section') injected = spec.inject(); return () => {} } },
  }
  apply(ctx); assert.equal(calls.length, 0); assert.equal(handlers.size, 3)
  let resets = 0, disposals = 0
  const originalReset = injected.assistants.reset, originalDispose = injected.assistants.dispose
  injected.assistants.reset = () => { resets++; originalReset() }
  injected.assistants.dispose = () => { disposals++; originalDispose() }
  injected.diagnostics.subscribe(() => { throw Error('injected diagnostic observer failure') })
  injected.resourceConnection.subscribe(() => { throw Error('injected resource observer failure') })
  const resourceResets = []
  injected.resourceConnection.subscribe(() => resourceResets.push(injected.resourceConnection.getSnapshot()))
  try {
    await injected.diagnostics.diagnose(); const before = injected.store.getSnapshot()
    // Exercise both host emitter orders, not merely the currently registered order.
    for (const order of [Array.from(handlers.keys()), Array.from(handlers.keys()).reverse()]) {
      assert.doesNotThrow(() => { for (const handler of order) handler() }); assert.equal(injected.store.getSnapshot(), before)
      await injected.diagnostics.diagnose()
    }
    assert.equal(resets, 2)
    assert.deepEqual(resourceResets, [1, 2], 'resource generation is independent of emitter order and broken observers')
    effects.get('wechat connection diagnostics')(); assert.equal(handlers.size, 2)
    effects.get('wechat resources client lifecycle')(); assert.equal(handlers.size, 1)
    for (const handler of handlers.keys()) handler(); assert.equal(resets, 3)
    effects.get('wechat assistant lifecycle')(); assert.equal(disposals, 1); assert.equal(handlers.size, 0)
    assert.doesNotThrow(() => effects.get('wechat shared page')())
  } finally { cleanups.forEach(cleanup => cleanup?.()) }
})

test('diagnostic render boundary encloses only lazily mounted auxiliary content, not the native page', async () => {
  const text = source('ConnectionDiagnostics.tsx')
  assert.match(text, /class DiagnosticBoundary extends Component/)
  assert.match(text, /static getDerivedStateFromError\(\)/)
  assert.match(text, /expanded \? <DiagnosticBoundary><DiagnosticContent store=\{store\} \/><\/DiagnosticBoundary> : null/)
  assert.doesNotMatch(text, /useEffect\(\(\) => \(\) => store\./)
  assert.match(source('HarnessRemoteSettings.tsx'), /diagnostics \? <ConnectionDiagnostics store=\{diagnostics\} \/> : null/)
  // This is an explicit source-structure check. No renderer package is installed;
  // handler/SSR tests do not substitute for a real React error-boundary mount test.
})
