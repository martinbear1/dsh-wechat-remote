import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { transform } from 'esbuild'
import { PairingDiagnosticObserver, observePairingDiagnostic } from '../lib/pairing-diagnostic-observer.js'
import { runConnectionDiagnostics } from '../lib/connection-diagnostics.js'
import { sanitizePairingObservation, sanitizeConnectionReport, formatConnectionDiagnosticReport, pairingFailureDescription } from '../lib/connection-diagnostic-contract.js'

const secret = 'PRIVATE-QR-TICKET-TOKEN-IDENTITY'
const fault = code => new Error('fetch failed', { cause: Object.assign(new Error(secret), { code }) })
const observe = (recorder, error) => { const attempt = recorder.begin(); recorder.failed(attempt, error); return recorder.snapshot() }
const report = observation => runConnectionDiagnostics({
  relayOrigin: 'https://diagnostic.example.invalid',
  fetch: async (url, options) => {
    assert.equal(url, 'https://diagnostic.example.invalid/healthz'); assert.equal(options.method, 'GET'); assert.equal(options.body, undefined)
    return Response.json({ ok: true, version: '1.0.0' })
  },
  context: { pluginVersion: '1.7.15-rc.1', dshVersion: '0.2.1-rc.2', platform: 'win32', profileKind: 'desktop', relayEnabled: true, relayState: 'offline', pairingObservation: observation },
})

test('passive observer retains concrete nested system cause, never secret error fields', async () => {
  for (const [code, category] of [['ENOTFOUND', 'dns'], ['ECONNREFUSED', 'connection-refused'], ['ECONNRESET', 'connection-reset'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'tls-validation'], ['UND_ERR_CONNECT_TIMEOUT', 'timeout']]) {
    const recorder = new PairingDiagnosticObserver()
    assert.equal(recorder.snapshot(), undefined)
    const result = observe(recorder, fault(code))
    assert.equal(result.systemCode, code); assert.equal(result.code, category); assert.equal(result.status, 'failed')
    const output = await report(result)
    assert.equal(output.checks[1].status, 'pass'); assert.equal(output.checks[2].status, 'not-tested')
    assert.equal(output.pairingObservation.systemCode, code, 'health success cannot erase an enrollment failure')
    assert.equal(formatConnectionDiagnosticReport(output).includes(secret), false)
    assert.ok(Buffer.byteLength(JSON.stringify(output)) < 4096)
  }
})

test('exact known proof messages distinguish failures without copying raw server text', () => {
  const recorder = new PairingDiagnosticObserver()
  for (const [message, reason] of [['Agent identity proof is expired or replayed', 'proof-expired-or-replayed'],
    ['Agent identity proof is replayed', 'proof-replayed'], ['Agent identity proof is invalid', 'proof-invalid'],
    ['Agent identity does not match proof', 'identity-mismatch']]) {
    const result = observe(recorder, Object.assign(new Error(message), { status: 401, code: 'invalid_agent_proof' }))
    assert.equal(result.reason, reason); assert.equal(result.serverCode, 'invalid_agent_proof'); assert.equal(result.httpStatus, 401)
  }
  const unknown = observe(recorder, Object.assign(new Error(secret), { status: 401, code: secret }))
  assert.equal(unknown.code, 'request-rejected'); assert.equal(unknown.serverCode, undefined); assert.equal(unknown.reason, undefined)
  assert.doesNotMatch(pairingFailureDescription(unknown), /电脑时间|代理|账号/)
  const generic = observe(recorder, new Error('fetch failed'))
  assert.equal(generic.reason, 'fetch-failed'); assert.equal(generic.systemCode, undefined)
  assert.match(pairingFailureDescription(generic), /未提供/)
  assert.equal(observe(recorder, { status: 429, code: 'rate_limited' }).serverCode, 'rate_limited')
  assert.equal(observe(recorder, { name: 'TimeoutError' }).code, 'timeout')
})

test('latest-started attempt wins; success and in-flight status remove old failure', () => {
  const recorder = new PairingDiagnosticObserver()
  observe(recorder, fault('ENOTFOUND'))
  const earlier = recorder.begin(), later = recorder.begin()
  assert.equal(recorder.snapshot().status, 'running'); assert.equal(recorder.snapshot().systemCode, undefined)
  recorder.failed(earlier, fault('ECONNRESET')); assert.equal(recorder.snapshot().status, 'running')
  recorder.issued(later); assert.equal(recorder.snapshot().status, 'issued'); assert.equal(recorder.snapshot().code, undefined)
  recorder.failed(earlier, fault('ENOTFOUND')); assert.equal(recorder.snapshot().status, 'issued')
  const snapshot = recorder.snapshot(); snapshot.status = 'failed'
  assert.equal(recorder.snapshot().status, 'issued', 'consumer gets a copy')
  recorder.failed(undefined, fault('ENOTFOUND')); assert.equal(recorder.snapshot().status, 'issued')
  assert.equal(new PairingDiagnosticObserver().snapshot(), undefined, 'new gate has no previous instance data')
})

test('unsupported and malformed observations do not invalidate old report schema', async () => {
  const baseline = await report(undefined)
  assert.equal(Object.hasOwn(baseline, 'pairingObservation'), false)
  for (const input of [null, {}, { status: secret, startedAt: new Date().toISOString() },
    { status: 'failed', startedAt: new Date().toISOString() }, new Proxy({}, { get() { throw Error(secret) } })]) {
    const value = sanitizeConnectionReport({ ...baseline, pairingObservation: input })
    assert.ok(value); assert.equal(value.pairingObservation, undefined)
  }
  const observation = { ...observe(new PairingDiagnosticObserver(), fault('ENOTFOUND')), message: secret, stack: secret, token: secret, reason: secret, serverCode: secret }
  const sanitized = sanitizePairingObservation(observation)
  assert.equal(JSON.stringify(sanitized).includes(secret), false)
  assert.equal(sanitized.systemCode, 'ENOTFOUND')
  const successful = sanitizePairingObservation({ ...observation, status: 'issued' })
  assert.equal(successful.code, undefined); assert.equal(successful.systemCode, undefined)
})

test('fault boundary tolerates throwing observers and hostile exception accessors', () => {
  assert.doesNotThrow(() => observePairingDiagnostic(() => { throw Error(secret) }))
  assert.equal(observePairingDiagnostic(() => { throw Error(secret) }), undefined)
  const recorder = new PairingDiagnosticObserver(), error = new Proxy({}, { get() { throw Error(secret) } })
  assert.doesNotThrow(() => observe(recorder, error))
  assert.equal(recorder.snapshot().code, 'unknown')
  const cyclic = { cause: null, errors: [], message: secret }; cyclic.cause = cyclic; cyclic.errors.push(cyclic)
  assert.doesNotThrow(() => observe(recorder, cyclic))
  assert.equal(JSON.stringify(recorder.snapshot()).includes(secret), false)
})

test('checking/cancelling snapshots never changes stored attempt or starts another enrollment', async () => {
  const recorder = new PairingDiagnosticObserver(), first = observe(recorder, fault('ENOTFOUND'))
  let release, calls = 0
  const controller = new AbortController()
  const pending = runConnectionDiagnostics({ relayOrigin: 'https://diagnostic.example.invalid', signal: controller.signal,
    context: { relayEnabled: true, pairingObservation: recorder.snapshot() },
    fetch: () => { calls++; return new Promise(resolve => { release = resolve }) },
  })
  recorder.issued(recorder.begin())
  controller.abort()
  const cancelled = await pending
  release(Response.json({ ok: true, version: '1' }))
  assert.equal(calls, 1); assert.equal(cancelled.checks[1].status, 'cancelled')
  assert.deepEqual(cancelled.pairingObservation, first, 'report is a time-stamped snapshot')
  assert.equal(recorder.snapshot().status, 'issued', 'diagnostic cannot overwrite live observation')
})

// Execute the actual gate QR function with isolated dependencies and compare it
// to the released baseline. Nothing opens a port, writes an identity or calls a server.
const gate = readFileSync(new URL('../src/gate-runtime.ts', import.meta.url), 'utf8')
const releasedGate = execFileSync('git', ['show', '13a4504:src/gate-runtime.ts'], { encoding: 'utf8' })
async function qrFunction(source, env) {
  const start = source.indexOf('  async function makePairEntry()'), end = source.indexOf('\n  // ── LOCAL door', start)
  const compiled = await transform(source.slice(start, end) + '\n globalThis.run = makePairEntry', { loader: 'ts' })
  const context = vm.createContext(env); vm.runInContext(compiled.code, context); return context.run
}
const FixedDate = class extends Date { static now() { return 1_700_000_000_000 } }
function gateEnvironment(scenario, recorder) {
  const trace = []
  const env = {
    Date: FixedDate, publicRelayStatus: {}, PUBLIC_PORT: 4001, ROUTE_QR_REFRESH_MS: 60_000,
    lanIPv4: () => '192.0.2.1',
    publicRelayGateway: scenario === 'not-ready' ? null : {
      agent: { identity: { nodeId: 'synthetic-node', publicKeyPem: 'synthetic-public-key' }, config: { relayOrigin: 'https://diagnostic.example.invalid' } },
      ensurePairingStatus: async () => { trace.push('ensure'); if (scenario === 'fail') throw fault('ENOTFOUND'); return { synthetic: true } },
    },
    publicPairingPayload: () => scenario === 'missing' ? null : JSON.stringify({ mode: 'public-relay', expiresAt: 1_700_000_090_000, ticket: secret }),
    QRCode: { toDataURL: async (payload, options) => { trace.push(['qr', payload, options]); return 'synthetic-qr' } },
    messageOf: error => error.message,
    console: { warn: (...args) => trace.push(['warn', ...args]) },
    pairingDiagnostics: recorder, observePairingDiagnostic,
  }
  return { env, trace }
}
test('actual QR business path stays identical to release even when every observer method throws', async () => {
  for (const scenario of ['issued', 'fail', 'missing', 'not-ready']) {
    for (const broken of [false, true]) {
      const recorder = broken ? new Proxy({}, { get() { return () => { throw Error('diagnostic-only fault') } } }) : new PairingDiagnosticObserver()
      const before = gateEnvironment(scenario), after = gateEnvironment(scenario, recorder)
      const oldRun = await qrFunction(releasedGate, before.env), newRun = await qrFunction(gate, after.env)
      const outcome = async run => { try { return { value: JSON.stringify(await run()) } } catch (error) { return { error: error.message } } }
      assert.deepEqual(await outcome(newRun), await outcome(oldRun), `${scenario}, observer broken=${broken}`)
      assert.equal(JSON.stringify(after.trace), JSON.stringify(before.trace), 'no extra request, QR, warning or altered result')
      if (!broken) {
        assert.equal(recorder.snapshot().status, scenario === 'issued' ? 'issued' : 'failed')
        if (scenario === 'fail') assert.equal(recorder.snapshot().systemCode, 'ENOTFOUND')
      }
    }
  }
})

test('new observer has no infrastructure or business dependencies and only diagnostic endpoint reads it', () => {
  const observer = readFileSync(new URL('../src/pairing-diagnostic-observer.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(observer, /node:|fetch\(|setTimeout|setInterval|WebSocket|writeFile|\.subscribe\(|\.emit\(/)
  assert.doesNotMatch(observer, /from ['"].*(?:gate-runtime|public-relay-agent|updat|pairing-management)/)
  assert.equal((gate.match(/pairingDiagnostics\.snapshot\(/g) || []).length, 1)
  assert.match(gate, /connectionDiagnostics: signal => runConnectionDiagnostics\([\s\S]*pairingObservation: observePairingDiagnostic\(\(\) => pairingDiagnostics\.snapshot\(\)\)/)
})
