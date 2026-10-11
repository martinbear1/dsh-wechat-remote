import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function load(name, extra = {}) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(`../src/client/${name}`, import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
  const module = { exports: {} }
  vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, fetch, Date, URL, AbortSignal, AbortController,
    setInterval, clearInterval, setTimeout, clearTimeout, ...extra })
  return module.exports
}
const { RemotePageStore } = await load('remote-page-store.ts')
const { ConnectionDiagnosticStore } = await load('connection-diagnostic-store.ts')
const { resolvePairingClient } = await load('pairing-client.ts')
const runtime = { profileScope: 'desktop', management: 'authenticated-rpc', diagnostics: 'read-only-v1',
  localDoor: { port: 4000, state: 'listening' }, publicDoor: { port: 4001, state: 'listening' } }
const report = () => ({ schema: 1, source: 'plugin', startedAt: '2026-10-11T00:00:00.000Z', pluginRunningVersion: '1.7.14-rc.33',
  platform: 'win32', profileKind: 'desktop', relayEnabled: true, relayState: 'offline',
  checks: [{ id: 'local-plugin', status: 'pass' }, { id: 'relay-health', status: 'pass', durationMs: 12 }, { id: 'agent-connection', status: 'not-tested' }] })
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture({ gate = runtime, qrMode = 'secure-lan-route' } = {}) {
  let id = 'first', handler = async () => report(), qrCalls = 0
  const calls = [], signals = []
  const state = { gate, lan: { ip: 'test', port: 4001 }, publicRelay: { enabled: true, state: 'offline' } }
  const describe = async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: id, gate })
  const call = async (endpoint, payload, signal) => {
    calls.push(endpoint)
    if (endpoint === 'connection-diagnostics') { assert.equal(payload, undefined); signals.push(signal); return handler(signal) }
    if (endpoint === 'pair-code') { qrCalls++; return { qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000, mode: qrMode } }
    assert.equal(endpoint, 'status'); return state
  }
  const store = new RemotePageStore(describe, call), diagnostics = new ConnectionDiagnosticStore(describe, call)
  return { store, diagnostics, dispose() { diagnostics.dispose(); store.dispose() }, state, calls, signals, get qrCalls() { return qrCalls }, changeHost() { id = 'second' }, diagnose(fn) { handler = fn } }
}

test('diagnostics are explicit, concurrent calls merge, health success never changes QR', async () => {
  const f = fixture()
  try {
    await f.store.refresh(); await f.store.generateQr()
    assert.equal(f.calls.includes('connection-diagnostics'), false)
    const qr = f.store.getSnapshot().qr
    let release
    f.diagnose(() => new Promise(resolve => { release = resolve }))
    const a = f.diagnostics.diagnose(), b = f.diagnostics.diagnose()
    assert.equal(a, b); await tick(); release(report()); await a
    assert.equal(f.calls.filter(x => x === 'connection-diagnostics').length, 1)
    assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'ready')
    assert.equal(f.store.getSnapshot().qr, qr); assert.equal(f.qrCalls, 1)
    assert.equal(f.signals[0] instanceof AbortSignal, true)
  } finally { f.dispose() }
})

test('a help-only subscription is passive and ordinary pairing errors never trigger diagnostics', async () => {
  const f = fixture()
  const off = f.diagnostics.subscribe(() => {})
  try {
    await tick(); assert.deepEqual(f.calls, [], 'subscribing expanded help starts no status polling or check')
    assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'idle')
    assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null)
  } finally { off(); f.dispose() }
  const calls = []
  let failing = true
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async endpoint => {
    calls.push(endpoint)
    assert.ok(['status', 'pair-code'].includes(endpoint), 'business lifecycle must not enter a diagnostic endpoint')
    if (failing) throw Error('ordinary pairing or connection failure')
    return endpoint === 'pair-code'
      ? { mode: 'secure-lan-route', qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000 }
      : { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'offline' } }
  })
  const diagnostics = new ConnectionDiagnosticStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async () => assert.fail('not requested'))
  try {
    await store.refresh(); await store.generateQr(); await tick()
    assert.equal(store.getSnapshot().loadState, 'error')
    assert.equal(store.getSnapshot().qrState, 'error')
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'idle')
    assert.equal(diagnostics.getSnapshot().diagnosticReport, null)
    failing = false; await store.refresh(); await store.generateQr(); await tick()
    assert.equal(store.getSnapshot().qr.mode, 'secure-lan-route')
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'idle', 'a recovery QR does not auto-run a diagnostic')
    assert.equal(diagnostics.getSnapshot().diagnosticReport, null)
    assert.deepEqual(calls, ['status', 'pair-code', 'status', 'pair-code', 'status'])
  } finally { diagnostics.dispose(); store.dispose() }
})

test('diagnostic subscriptions and cancellation do not start, stop, or retain normal status polling', async () => {
  const timers = new Map(); let timerId = 0, reads = 0
  const isolated = await load('remote-page-store.ts', {
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id },
    clearInterval(id) { timers.delete(id) },
  })
  const store = new isolated.RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', gate: runtime }), async endpoint => {
    assert.equal(endpoint, 'status'); reads++
    return { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'online' } }
  })
  const diagnostics = new ConnectionDiagnosticStore(async () => assert.fail('passive'), async () => assert.fail('passive'))
  let closeHelp = diagnostics.subscribe(() => {}), closePage = () => {}
  try {
    await tick(); assert.equal(timers.size, 0); assert.equal(reads, 0)
    closePage = store.subscribe(() => {}); await store.refresh()
    assert.equal(timers.size, 1); assert.equal(reads, 1)
    closePage(); assert.equal(timers.size, 0, 'an open diagnostic view cannot retain business polling')
    closePage = store.subscribe(() => {}); await store.refresh()
    assert.equal(timers.size, 1); assert.equal(reads, 2)
    closeHelp(); assert.equal(timers.size, 1, 'closing help cannot stop a visible normal page')
    closeHelp = diagnostics.subscribe(() => {})
    diagnostics.cancel(); diagnostics.cancel(true)
    assert.equal(timers.size, 1, 'cancelling diagnostics does not stop business polling')
    await tick(); assert.equal(reads, 2, 'diagnostic lifecycle does not cause a business refresh')
    closePage(); assert.equal(timers.size, 0)
  } finally { closeHelp(); closePage(); diagnostics.dispose(); store.dispose() }
})

test('cancel aborts only this diagnostic; late replies cannot replace cancellation or a retry', async () => {
  const f = fixture()
  try {
    let release
    f.diagnose(() => new Promise(resolve => { release = resolve }))
    const old = f.diagnostics.diagnose(); await tick()
    f.diagnostics.cancel(); assert.equal(f.signals[0].aborted, true)
    assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'cancelled')
    f.diagnose(async () => ({ ...report(), startedAt: '2026-10-11T01:00:00.000Z' }))
    await f.diagnostics.diagnose(); release(report()); await old
    assert.equal(f.diagnostics.getSnapshot().diagnosticReport.startedAt, '2026-10-11T01:00:00.000Z')
    assert.equal(f.calls.some(x => x === 'pair-code'), false)
  } finally { f.dispose() }
})

test('native connection reset on host switch, disposal and final view close drop old reports', async () => {
  for (const action of ['switch', 'reset', 'dispose', 'close']) {
    const f = fixture(), off = f.diagnostics.subscribe(() => {})
    try {
      await f.store.refresh()
      let release
      f.diagnose(() => new Promise(resolve => { release = resolve }))
      const pending = f.diagnostics.diagnose(); await tick()
      if (action === 'switch') { f.changeHost(); f.diagnostics.reset(); await f.store.refresh() }
      else if (action === 'reset') f.diagnostics.cancel(true)
      else if (action === 'close') off()
      else f.diagnostics.dispose()
      assert.equal(f.signals[0].aborted, true, action)
      release(report()); await pending
      assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null, action)
      assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'idle', action)
    } finally { off(); f.dispose() }
  }
})

test('cancel while host description is pending never starts a probe', async () => {
  let release, calls = 0
  const store = new ConnectionDiagnosticStore(() => new Promise(resolve => { release = resolve }), async () => { calls++; return report() })
  try {
    const pending = store.diagnose(); await Promise.resolve(); store.cancel()
    release({ computerName: 'fixture', agentName: 'fixture', gate: runtime }); await pending
    assert.equal(calls, 0); assert.equal(store.getSnapshot().diagnosticState, 'cancelled')
  } finally { store.dispose() }
})

test('old hosts report unsupported without probing a legacy/default port', async () => {
  for (const gate of [{ ...runtime, diagnostics: undefined }, { ...runtime, profileScope: 'web', management: 'loopback' }]) {
    let calls = 0
    const describe = async () => ({ computerName: 'fixture', agentName: 'fixture', gate })
    const client = await resolvePairingClient(describe, async () => { calls++; throw Error('must not call') }, async () => { calls++; throw Error('must not fetch') })
    await assert.rejects(client.diagnose(new AbortController().signal), error => error.code === 'diagnostic-unsupported')
    assert.equal(calls, 0)
    const store = new ConnectionDiagnosticStore(describe, async () => { calls++; throw Error('must not call') })
    try { await store.diagnose(); assert.equal(store.getSnapshot().diagnosticState, 'unsupported'); assert.equal(calls, 0) }
    finally { store.dispose() }
  }
  for (const describe of [async () => { throw Error('offline') }, async () => ({ computerName: 'fixture', agentName: 'fixture' }),
    async () => ({ computerName: 'fixture', agentName: 'fixture', gate: { ...runtime, management: 'loopback' } })]) {
    await assert.rejects(resolvePairingClient(describe, async () => assert.fail(), async () => assert.fail('no port fallback')))
  }
})

test('only explicitly requested reports are whitelisted before storage', async () => {
  const secret = 'secret-password-node-path-qr'
  const f = fixture()
  try {
    await f.store.refresh()
    assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null)
    f.diagnose(async () => ({ ...report(), unexpectedHistory: secret, token: secret, qrDataUrl: secret, stack: secret,
      checks: report().checks.map(check => ({ ...check, message: secret, body: secret })) }))
    await f.diagnostics.diagnose()
    assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'ready')
    assert.equal(JSON.stringify(f.diagnostics.getSnapshot().diagnosticReport).includes(secret), false)
    f.diagnose(async () => ({ token: secret, schema: 99 }))
    await f.diagnostics.diagnose()
    assert.equal(f.diagnostics.getSnapshot().diagnosticState, 'error')
    assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null)
    f.diagnose(async () => { throw new Error(secret) })
    await f.diagnostics.diagnose()
    assert.equal(JSON.stringify(f.diagnostics.getSnapshot()).includes(secret), false)
  } finally { f.dispose() }
})

test('diagnosis never adopts host descriptions, creates update stores or publishes business changes', async () => {
  let host = { computerName: 'first', agentName: 'fixture', agentInstanceId: 'first', gate: runtime }
  let describeFailure = false, businessEvents = 0, diagnosticEvents = 0
  const calls = []
  const describe = async () => {
    if (describeFailure) throw Error('description failed')
    return host
  }
  const call = async endpoint => {
    calls.push(endpoint)
    if (endpoint === 'connection-diagnostics') return report()
    if (endpoint === 'pair-code') return { mode: 'public-relay', qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000 }
    assert.equal(endpoint, 'status')
    return { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'online' } }
  }
  const store = new RemotePageStore(describe, call), diagnostics = new ConnectionDiagnosticStore(describe, call)
  const business = snapshot => {
    return snapshot
  }
  const closeHelp = diagnostics.subscribe(() => { diagnosticEvents++ })
  let closePage = () => {}
  try {
    const initial = business(store.getSnapshot())
    diagnostics.cancel(true); assert.equal(diagnosticEvents, 0, 'idle cancellation is inert')
    await diagnostics.diagnose()
    assert.equal(business(store.getSnapshot()), initial, 'diagnostics cannot initialize the normal page')
    assert.equal(store.updates, undefined); assert.equal(store.nativeUpdates, undefined)
    assert.deepEqual(calls, ['connection-diagnostics'])
    closePage = store.subscribe(() => { businessEvents++ })
    await store.refresh(); await store.generateQr()
    const before = business(store.getSnapshot()), nativeUpdates = store.nativeUpdates, updates = store.updates
    const eventsBefore = businessEvents, callsBefore = calls.length
    assert.ok(nativeUpdates)
    host = { ...host, computerName: 'second', agentInstanceId: 'second', gate: { ...runtime, localDoor: { port: 9000, state: 'listening' } } }
    await diagnostics.diagnose()
    assert.equal(business(store.getSnapshot()), before, 'a diagnostic-only description cannot replace the selected host or QR')
    assert.equal(store.nativeUpdates, nativeUpdates); assert.equal(store.updates, updates)
    assert.equal(businessEvents, eventsBefore, 'diagnostic begin/end do not notify business subscribers')
    assert.deepEqual(calls.slice(callsBefore), ['connection-diagnostics'])
    describeFailure = true; await diagnostics.diagnose()
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'error')
    assert.equal(business(store.getSnapshot()), before, 'description errors cannot become business errors')
    diagnostics.cancel(true)
    const lastEvents = diagnosticEvents
    diagnostics.cancel(true)
    assert.equal(diagnosticEvents, lastEvents, 'repeated idle cancellation does not publish a change')
    assert.equal(businessEvents, eventsBefore)
    assert.equal(store.nativeUpdates, nativeUpdates); assert.equal(store.updates, updates)
  } finally { closeHelp(); closePage(); diagnostics.dispose(); store.dispose() }
})

// Handler-level fake hooks: explicit copy/collapse behavior, not a React error-boundary mounting test.
test('help is collapsed and inert until explicit check; report requires preview and explicit copy', async () => {
  const state = [], effects = [], copies = [], subscriptions = []; let cursor = 0, effectCursor = 0, subscriptionCursor = 0
  const react = {
    Component: class { constructor(props) { this.props = props } },
    useSyncExternalStore(subscribe, snapshot) { const i = subscriptionCursor++; subscriptions[i] ||= subscribe(() => {}); return snapshot() },
    useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], next => { state[index] = next }] },
    useEffect(effect, deps) { const index = effectCursor++, old = effects[index]; if (!old || deps.some((value, i) => old.deps[i] !== value)) { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() } } },
  }
  const ui = await load('ConnectionDiagnostics.tsx', { navigator: { clipboard: { writeText: async text => { copies.push(text) } } },
    require(id) { if (id === 'react') return react; if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; if (id.endsWith('.css')) return {}; throw Error(id) } })
  const f = fixture()
  let contentMounted = false
  const render = () => {
    cursor = 0; effectCursor = 0; subscriptionCursor = 0
    const root = ui.ConnectionDiagnostics({ store: f.diagnostics })
    const content = root.props.children[1]
    if (content) {
      const boundary = new content.type(content.props)
      const child = boundary.render()
      root.props.children[1] = child.type(child.props)
      contentMounted = true
    } else if (contentMounted) {
      effects.forEach(effect => effect.cleanup?.()); effects.length = 0; subscriptions.splice(0).forEach(off => off()); state.splice(1); contentMounted = false
    }
    return root
  }
  function all(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(all)] }
  const button = (tree, label) => all(tree).find(node => node.type === 'button' && node.props.children === label)
  try {
    let tree = render()
    assert.equal(tree.type, 'details'); assert.equal(tree.props.open, undefined, 'native details defaults to closed')
    assert.equal(tree.props.children[0].type, 'summary'); assert.equal(tree.props.children[0].props.children, '连接帮助')
    assert.equal(button(tree, '检查连接'), undefined, 'closed help does not mount diagnostic controls')
    assert.equal(f.calls.length, 0)
    tree.props.onToggle({ currentTarget: { open: true } }); tree = render(); await tick()
    assert.equal(f.calls.length, 0, 'expanding help does not inspect status, create a code, or run a diagnostic')
    button(tree, '检查连接').props.onClick(); await f.diagnostics.diagnose(); render(); tree = render()
    assert.deepEqual(f.calls, ['connection-diagnostics'], 'only the explicit check starts the diagnostic')
    assert.equal(copies.length, 0); assert.equal(button(tree, '复制诊断报告'), undefined)
    button(tree, '预览诊断报告').props.onClick(); tree = render()
    const preview = all(tree).find(node => node.type === 'pre').props.children
    assert.equal(copies.length, 0); button(tree, '复制诊断报告').props.onClick(); await tick()
    assert.deepEqual(copies, [preview]); assert.equal(button(render(), '已复制').props.type, 'button')
    for (const code of ['pairing/not-found', 'other']) {
      f.diagnose(async () => { throw Object.assign(Error('private-token-and-QR'), { code }) }); await f.diagnostics.diagnose()
      tree = render()
      assert.equal(button(tree, '复制诊断报告'), undefined)
      assert.equal(JSON.stringify(tree).includes('private-token-and-QR'), false)
      assert.equal(copies.length, 1, 'error/unsupported must not copy anything')
    }
    f.diagnose(async () => report()); await f.diagnostics.diagnose()
    render().props.onToggle({ currentTarget: { open: false } }); tree = render()
    assert.equal(button(tree, '检查连接'), undefined)
    assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null, 'closing help clears its memory-only report')
    effects.forEach(effect => effect.cleanup?.()); assert.equal(f.diagnostics.getSnapshot().diagnosticReport, null)
  } finally { subscriptions.splice(0).forEach(off => off()); f.dispose() }
})

test('diagnostic errors, invalid results, false negatives and unsupported hosts never gate normal pairing', async () => {
  const scenarios = [
    { name: 'failed request', expected: 'error', handler: async () => { throw Error('probe-only transport failure') } },
    { name: 'invalid report', expected: 'error', handler: async () => ({ schema: 99, checks: 'invalid' }) },
    { name: 'timeout exception', expected: 'error', handler: async () => { throw Object.assign(Error('probe timeout'), { name: 'TimeoutError' }) } },
    { name: 'unsupported endpoint', expected: 'unsupported', handler: async () => { throw Object.assign(Error('unsupported'), { code: 'pairing/not-found' }) } },
    { name: 'old host without diagnostic capability', expected: 'unsupported', gate: { ...runtime, diagnostics: undefined }, handler: async () => assert.fail('must not probe old host') },
    { name: 'false negative health result', expected: 'ready', handler: async () => ({ ...report(), relayEnabled: false, relayState: 'disabled',
      checks: report().checks.map(check => check.id === 'relay-health' ? { ...check, status: 'fail', code: 'tls-validation' } : check) }) },
    { name: 'reported probe timeout', expected: 'ready', handler: async () => ({ ...report(),
      checks: report().checks.map(check => check.id === 'relay-health' ? { ...check, status: 'fail', code: 'timeout' } : check) }) },
  ]
  const business = snapshot => JSON.stringify({ loadState: snapshot.loadState, qrState: snapshot.qrState, status: snapshot.status,
    qr: snapshot.qr, error: snapshot.error, deciding: snapshot.deciding, decisionError: snapshot.decisionError })
  for (const scenario of scenarios) {
    const f = fixture({ gate: scenario.gate, qrMode: 'public-relay' })
    try {
      f.state.publicRelay = { enabled: true, state: 'online', remoteAccess: { status: 'active', validUntil: Date.now() + 86400000 } }
      await f.store.refresh(); await f.store.generateQr()
      const before = business(f.store.getSnapshot()), source = JSON.stringify(f.state)
      const qrCalls = f.qrCalls, statusCalls = f.calls.filter(endpoint => endpoint === 'status').length
      f.diagnose(scenario.handler); await f.diagnostics.diagnose()
      assert.equal(f.diagnostics.getSnapshot().diagnosticState, scenario.expected, scenario.name)
      assert.equal(business(f.store.getSnapshot()), before, scenario.name + ': diagnosis cannot rewrite business state')
      assert.equal(JSON.stringify(f.state), source, scenario.name + ': diagnosis cannot mutate its input')
      assert.equal(f.qrCalls, qrCalls, scenario.name + ': no automatic pairing attempt')
      assert.equal(f.calls.filter(endpoint => endpoint === 'status').length, statusCalls, scenario.name + ': no diagnostic-triggered refresh')
      await Promise.all([f.store.refresh(), f.store.generateQr()])
      const after = f.store.getSnapshot()
      assert.equal(after.loadState, 'ready', scenario.name)
      assert.equal(after.qrState, 'ready', scenario.name)
      assert.equal(after.qr.mode, 'public-relay', scenario.name)
      assert.equal(after.status.publicRelay.state, 'online', scenario.name)
      assert.equal(after.status.publicRelay.remoteAccess.status, 'active', scenario.name)
      assert.equal(after.error, null, scenario.name)
      assert.equal(f.qrCalls, qrCalls + 1, scenario.name + ': explicit pairing still allowed')
      assert.equal(f.diagnostics.getSnapshot().diagnosticState, scenario.expected, scenario.name + ': no passing diagnosis is required')
    } finally { f.dispose() }
  }
})

test('a running or cancelled diagnostic never blocks status reads or a concurrent first-pairing request', async () => {
  let releaseProbe, releaseQr, diagnosticSignal, qrSignal, statusCalls = 0, qrCalls = 0
  const state = { gate: runtime, lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'online' } }
  const describe = async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: 'same-node', gate: runtime })
  const call = async (endpoint, _payload, signal) => {
      if (endpoint === 'connection-diagnostics') { diagnosticSignal = signal; return new Promise(resolve => { releaseProbe = resolve }) }
      if (endpoint === 'pair-code') { qrCalls++; qrSignal = signal; return new Promise(resolve => { releaseQr = resolve }) }
      assert.equal(endpoint, 'status'); statusCalls++; return state
    }
  const store = new RemotePageStore(describe, call), diagnostics = new ConnectionDiagnosticStore(describe, call)
  const qr = () => ({ mode: 'public-relay', qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000 })
  try {
    await store.refresh()
    const diagnostic = diagnostics.diagnose(); await tick()
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'running')
    await store.refresh(); assert.equal(statusCalls, 2, 'status completes while probe is still unresolved')
    const pairing = store.generateQr(); await tick()
    assert.equal(qrCalls, 1, 'pairing started before the probe completed')
    diagnostics.cancel()
    assert.equal(diagnosticSignal.aborted, true)
    assert.equal(qrSignal, undefined, 'diagnostic cancellation signal is not shared with pairing')
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'cancelled')
    releaseQr(qr()); await pairing
    assert.equal(store.getSnapshot().qrState, 'ready')
    assert.equal(store.getSnapshot().qr.mode, 'public-relay')
    const confirmed = store.getSnapshot().qr
    releaseProbe({ ...report(), checks: report().checks.map(check => ({ ...check, status: 'fail', code: 'unknown' })) }); await diagnostic
    assert.equal(store.getSnapshot().qr, confirmed, 'late cancelled report cannot discard or replace a usable QR')
    assert.equal(diagnostics.getSnapshot().diagnosticState, 'cancelled')
    const next = store.generateQr(); await tick(); releaseQr(qr()); await next
    assert.equal(qrCalls, 2, 'another explicit pairing remains allowed after cancellation')
    assert.equal(store.getSnapshot().loadState, 'ready')
    assert.equal(store.getSnapshot().error, null)
  } finally { diagnostics.dispose(); store.dispose() }
})

test('actual settings Generate and Regenerate buttons depend only on business readiness, never diagnostics', async () => {
  const ui = await load('HarnessRemoteSettings.tsx', { require(id) {
    if (id === 'react') return { Component: class {}, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(), useId: () => 'fixture-title' }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { FishLogo: 'FishLogo', Modal: 'NativeModal' }
    if (id.endsWith('.css')) return {}
    throw Error(id)
  } })
  function all(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(all)] }
  const base = { loadState: 'ready', status: { lan: { ip: 'fixture', port: 4001 }, publicRelay: { enabled: true, state: 'online' } },
    host: { agentName: 'fixture', computerName: 'fixture' }, runtime, error: null, localOrigin: null }
  let snapshot, diagnosticSnapshot, clicks = 0
  const store = { getSnapshot: () => snapshot, subscribe() {}, refresh() {}, generateQr() { clicks++ } }
  const diagnosticStore = { getSnapshot: () => diagnosticSnapshot, subscribe() {} }
  const render = () => ui.HarnessRemoteSettings({ store, diagnostics: diagnosticStore, describeHost: async () => assert.fail('render must not inspect host'), callManagement: async () => assert.fail('render must not call management') })
  const diagnostics = ['idle', 'running', 'ready', 'cancelled', 'error', 'unsupported']
  for (const diagnosticState of diagnostics) for (const qrState of ['idle', 'ready', 'expired', 'error']) {
    diagnosticSnapshot = { diagnosticState, diagnosticReport: diagnosticState === 'ready' ? { ...report(),
      checks: report().checks.map(check => ({ ...check, status: 'fail', code: 'unknown' })) } : null }
    snapshot = { ...base, qrState,
      qr: qrState === 'ready' ? { mode: 'public-relay', qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000 } : null }
    const label = qrState === 'idle' ? '生成二维码' : '重新生成'
    const button = all(render()).find(node => node.type === 'button' && node.props.children === label)
    assert.ok(button, `${diagnosticState}/${qrState}: real pairing button remains visible`)
    assert.equal(button.props.disabled, false, `${diagnosticState}/${qrState}: diagnosis cannot gate pairing`)
    const before = clicks; button.props.onClick(); assert.equal(clicks, before + 1, 'button still dispatches explicit pairing')
  }
  for (const diagnosticState of diagnostics) {
    diagnosticSnapshot = { diagnosticState, diagnosticReport: null }
    snapshot = { ...base, qrState: 'loading', qr: null }
    assert.equal(all(render()).find(node => node.type === 'button' && node.props.children === '生成中…').props.disabled, true,
      'business in-flight guard is retained independently of diagnostics')
    snapshot = { ...snapshot, loadState: 'error', qrState: 'idle' }
    assert.equal(all(render()).find(node => node.type === 'button' && node.props.children === '生成二维码').props.disabled, true,
      'actual host unavailability is still respected; this is not a diagnostic result')
  }
})
