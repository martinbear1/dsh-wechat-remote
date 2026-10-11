import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function load(name, extra = {}) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(`../src/client/${name}`, import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css'] })
  const module = { exports: {} }
  vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, fetch, Date, URL, AbortSignal, AbortController,
    setInterval, clearInterval, setTimeout, clearTimeout, ...extra })
  return module.exports
}
const { RemotePageStore } = await load('remote-page-store.ts')
const { resolvePairingClient } = await load('pairing-client.ts')
const runtime = { profileScope: 'desktop', management: 'authenticated-rpc', diagnostics: 'read-only-v1',
  localDoor: { port: 4000, state: 'listening' }, publicDoor: { port: 4001, state: 'listening' } }
const report = () => ({ schema: 1, source: 'plugin', startedAt: '2026-10-11T00:00:00.000Z', pluginRunningVersion: '1.7.14-rc.33',
  platform: 'win32', profileKind: 'desktop', qrKind: 'recovery', relayEnabled: true, relayState: 'offline',
  checks: [{ id: 'local-plugin', status: 'pass' }, { id: 'relay-health', status: 'pass', durationMs: 12 }, { id: 'agent-connection', status: 'not-tested' }] })
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  let id = 'first', handler = async () => report(), qrCalls = 0
  const calls = [], signals = []
  const state = { gate: runtime, lan: { ip: 'test', port: 4001 }, publicRelay: { enabled: true, state: 'offline' } }
  const store = new RemotePageStore(async () => ({ computerName: 'fixture', agentName: 'fixture', agentInstanceId: id, gate: runtime }), async (endpoint, payload, signal) => {
    calls.push(endpoint)
    if (endpoint === 'connection-diagnostics') { assert.equal(payload, undefined); signals.push(signal); return handler(signal) }
    if (endpoint === 'pair-code') { qrCalls++; return { qrDataUrl: 'data:image/png;base64,fixture', expiresAt: Date.now() + 900000, mode: 'secure-lan-route' } }
    assert.equal(endpoint, 'status'); return state
  })
  return { store, state, calls, signals, get qrCalls() { return qrCalls }, changeHost() { id = 'second' }, diagnose(fn) { handler = fn } }
}

test('diagnostics are explicit, concurrent calls merge, health success never changes QR', async () => {
  const f = fixture()
  try {
    await f.store.refresh(); await f.store.generateQr()
    assert.equal(f.calls.includes('connection-diagnostics'), false)
    const qr = f.store.getSnapshot().qr
    let release
    f.diagnose(() => new Promise(resolve => { release = resolve }))
    const a = f.store.diagnose(), b = f.store.diagnose()
    assert.equal(a, b); await tick(); release(report()); await a
    assert.equal(f.calls.filter(x => x === 'connection-diagnostics').length, 1)
    assert.equal(f.store.getSnapshot().diagnosticState, 'ready')
    assert.equal(f.store.getSnapshot().qr, qr); assert.equal(f.qrCalls, 1)
    assert.equal(f.signals[0] instanceof AbortSignal, true)
  } finally { f.store.dispose() }
})

test('cancel aborts only this diagnostic; late replies cannot replace cancellation or a retry', async () => {
  const f = fixture()
  try {
    let release
    f.diagnose(() => new Promise(resolve => { release = resolve }))
    const old = f.store.diagnose(); await tick()
    f.store.cancelDiagnostic(); assert.equal(f.signals[0].aborted, true)
    assert.equal(f.store.getSnapshot().diagnosticState, 'cancelled')
    f.diagnose(async () => ({ ...report(), startedAt: '2026-10-11T01:00:00.000Z' }))
    await f.store.diagnose(); release(report()); await old
    assert.equal(f.store.getSnapshot().diagnosticReport.startedAt, '2026-10-11T01:00:00.000Z')
    assert.equal(f.calls.some(x => x === 'pair-code'), false)
  } finally { f.store.dispose() }
})

test('host switch, native reset, disposal and closing diagnostics abort and drop old reports', async () => {
  for (const action of ['switch', 'reset', 'dispose', 'close']) {
    const f = fixture()
    try {
      let release
      f.diagnose(() => new Promise(resolve => { release = resolve }))
      const pending = f.store.diagnose(); await tick()
      if (action === 'switch') { f.changeHost(); await f.store.refresh() }
      else if (action === 'reset') f.store.reset()
      else if (action === 'close') f.store.cancelDiagnostic(true)
      else f.store.dispose()
      assert.equal(f.signals[0].aborted, true, action)
      release(report()); await pending
      assert.equal(f.store.getSnapshot().diagnosticReport, null, action)
      assert.equal(f.store.getSnapshot().diagnosticState, 'idle', action)
    } finally { f.store.dispose() }
  }
})

test('cancel while host description is pending never starts a probe', async () => {
  let release, calls = 0
  const store = new RemotePageStore(() => new Promise(resolve => { release = resolve }), async () => { calls++; return report() })
  try {
    const pending = store.diagnose(); store.cancelDiagnostic()
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
    const store = new RemotePageStore(describe, async () => { calls++; throw Error('must not call') })
    try { await store.diagnose(); assert.equal(store.getSnapshot().diagnosticState, 'unsupported'); assert.equal(calls, 0) }
    finally { store.dispose() }
  }
  for (const describe of [async () => { throw Error('offline') }, async () => ({ computerName: 'fixture', agentName: 'fixture' }),
    async () => ({ computerName: 'fixture', agentName: 'fixture', gate: { ...runtime, management: 'loopback' } })]) {
    await assert.rejects(resolvePairingClient(describe, async () => assert.fail(), async () => assert.fail('no port fallback')))
  }
})

test('reports and recent pairing attempts are whitelisted before storage', async () => {
  const secret = 'secret-password-node-path-qr'
  const f = fixture()
  try {
    const attempt = { at: '2026-10-11T00:00:00.000Z', outcome: 'failed', failure: { code: 'dns', systemCode: 'ENOTFOUND', message: secret }, token: secret }
    f.state.pairing = { qrKind: 'recovery', lastPairingAttempt: attempt }
    await f.store.refresh()
    assert.equal(JSON.stringify(f.store.getSnapshot().status.pairing).includes(secret), false)
    f.diagnose(async () => ({ ...report(), lastPairingAttempt: attempt, token: secret, qrDataUrl: secret, stack: secret,
      checks: report().checks.map(check => ({ ...check, message: secret, body: secret })) }))
    await f.store.diagnose()
    assert.equal(f.store.getSnapshot().diagnosticState, 'ready')
    assert.equal(JSON.stringify(f.store.getSnapshot().diagnosticReport).includes(secret), false)
    f.diagnose(async () => ({ token: secret, schema: 99 }))
    await f.store.diagnose()
    assert.equal(f.store.getSnapshot().diagnosticState, 'error')
    assert.equal(f.store.getSnapshot().diagnosticReport, null)
    f.diagnose(async () => { throw new Error(secret) })
    await f.store.diagnose()
    assert.equal(JSON.stringify(f.store.getSnapshot()).includes(secret), false)
  } finally { f.store.dispose() }
})

test('native reset invalidates an older host description and older status error', async () => {
  let releaseDescribe, rejectStatus, descriptionPending = true
  const store = new RemotePageStore(async () => descriptionPending
    ? new Promise(resolve => { releaseDescribe = resolve }) : { computerName: 'new', agentName: 'new', gate: runtime },
  async () => new Promise((_, reject) => { rejectStatus = reject }))
  try {
    const old = store.refresh(); store.reset()
    releaseDescribe({ computerName: 'old', agentName: 'old', gate: runtime }); await old
    assert.equal(store.getSnapshot().host, null)
    descriptionPending = false
    const next = store.refresh(); await tick(); store.reset(); rejectStatus(Error('old host failed')); await next
    assert.equal(store.getSnapshot().loadState, 'loading'); assert.equal(store.getSnapshot().error, null)
  } finally { store.dispose() }
})

test('UI requires report preview and explicit copy; teardown clears report', async () => {
  const state = [], effects = [], copies = []; let cursor = 0, effectCursor = 0
  const react = {
    useSyncExternalStore(_subscribe, snapshot) { return snapshot() },
    useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], next => { state[index] = next }] },
    useEffect(effect, deps) { const index = effectCursor++, old = effects[index]; if (!old || deps.some((value, i) => old.deps[i] !== value)) { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() } } },
  }
  const ui = await load('ConnectionDiagnostics.tsx', { navigator: { clipboard: { writeText: async text => { copies.push(text) } } },
    require(id) { if (id === 'react') return react; if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; if (id.endsWith('.css')) return {}; throw Error(id) } })
  const f = fixture(), render = () => { cursor = 0; effectCursor = 0; return ui.ConnectionDiagnostics({ store: f.store }) }
  function all(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(all)] }
  const button = (tree, label) => all(tree).find(node => node.type === 'button' && node.props.children === label)
  try {
    await f.store.diagnose(); render(); let tree = render()
    assert.equal(copies.length, 0); assert.equal(button(tree, '复制诊断报告'), undefined)
    button(tree, '预览诊断报告').props.onClick(); tree = render()
    const preview = all(tree).find(node => node.type === 'pre').props.children
    assert.equal(copies.length, 0); button(tree, '复制诊断报告').props.onClick(); await tick()
    assert.deepEqual(copies, [preview]); assert.equal(button(render(), '已复制').props.type, 'button')
    assert.match(ui.recoveryReminder({ ...f.store.getSnapshot(), qr: { mode: 'secure-lan-route' } }), /基础网络检查已通过.*重新生成/)
    assert.equal(ui.recoveryReminder({ ...f.store.getSnapshot(), qr: { mode: 'public-relay' } }), null)
    const failed = { at: '2026-10-11T02:00:00.000Z', outcome: 'failed', failure: { code: 'dns' } }
    const issued = { at: '2026-10-11T03:00:00.000Z', outcome: 'ticket-issued' }
    const view = { ...f.store.getSnapshot(), qr: { mode: 'secure-lan-route', lastPairingAttempt: failed } }
    assert.equal(ui.recoveryReminder(view), null, 'an older healthy check does not imply recovery after a newer failure')
    assert.equal(ui.latestPairingAttempt({ ...view, qr: { mode: 'public-relay', lastPairingAttempt: issued },
      status: { ...view.status, pairing: { qrKind: 'recovery', lastPairingAttempt: failed } } }), issued,
    'successful new QR replaces the historical failure even if the status response is older')
    for (const code of ['pairing/not-found', 'other']) {
      f.diagnose(async () => { throw Object.assign(Error('private-token-and-QR'), { code }) }); await f.store.diagnose()
      tree = render()
      assert.equal(button(tree, '复制诊断报告'), undefined)
      assert.equal(JSON.stringify(tree).includes('private-token-and-QR'), false)
      assert.equal(copies.length, 1, 'error/unsupported must not copy anything')
    }
    f.diagnose(async () => report()); await f.store.diagnose()
    effects.forEach(effect => effect.cleanup?.()); assert.equal(f.store.getSnapshot().diagnosticReport, null)
  } finally { f.store.dispose() }
})
