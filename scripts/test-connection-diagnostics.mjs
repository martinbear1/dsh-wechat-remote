import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import {
  runConnectionDiagnostics, classifyConnectionFailure, connectionHttpFailure,
  CONNECTION_DIAGNOSTIC_TIMEOUT_MS, CONNECTION_DIAGNOSTIC_MAX_BYTES,
} from '../lib/connection-diagnostics.js'
import {
  formatConnectionDiagnosticReport, sanitizeConnectionReport, sanitizePairingAttempt,
  failureDescription, failureAdvice,
} from '../lib/connection-diagnostic-contract.js'

const relayOrigin = 'https://diagnostic.example.invalid'
const at = '2026-10-11T00:00:00.000Z'
const context = { pluginVersion: '1.7.14-rc.33', dshVersion: '0.2.0-rc.2', platform: 'win32',
  profileKind: 'desktop', relayEnabled: true, relayState: 'online', qrKind: 'recovery' }
const healthResponse = (value = { ok: true, version: '2026-08-27.2' }, init = {}) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init })
const run = (fetch, extra = {}) => runConnectionDiagnostics({ relayOrigin, context, fetch, ...extra })
const health = report => report.checks.find(check => check.id === 'relay-health')

test('same injected fetch checks only fixed GET health with no business credentials or mutation', async () => {
  const secret = 'DO_NOT_LEAK_SECRET'
  const original = JSON.parse(JSON.stringify({ ...context, nodeId: secret, pairingTicket: secret, privateKey: secret,
    lastPairingAttempt: { at, outcome: 'failed', failure: { code: 'tls-validation', systemCode: 'CERT_HAS_EXPIRED', message: secret } } }))
  const saved = JSON.stringify(original)
  const calls = []
  const report = await run(async (...args) => { calls.push(args); return healthResponse() }, { context: original })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], `${relayOrigin}/healthz`)
  const options = calls[0][1]
  assert.equal(options.method, 'GET')
  assert.equal(options.credentials, 'omit')
  assert.equal(options.redirect, 'manual')
  assert.equal(options.cache, 'no-store')
  assert.equal(options.body, undefined)
  assert.deepEqual(options.headers, { accept: 'application/json' })
  assert.equal(options.signal.aborted, false)
  assert.equal(health(report).status, 'pass')
  assert.equal(report.checks[2].status, 'pass')
  assert.equal(report.pluginRunningVersion, context.pluginVersion)
  assert.equal(report.dshVersion, context.dshVersion)
  assert.equal(JSON.stringify(original), saved)
  assert.equal(JSON.stringify(report).includes(secret), false)
  for (const source of ['connection-diagnostics.ts', 'connection-diagnostic-contract.ts']) {
    const text = readFileSync(new URL(`../src/${source}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /from ['"](?:node:fs|\.\/public-relay-agent|\.\/gate-runtime|\.\/node-storage)/)
    assert.doesNotMatch(text, /\/v1\/(?:agents|pairing|ws)\//)
  }
})

test('disabled relay does not get enabled or probed; offline business connection stays untested', async () => {
  const report = await run(() => { throw new Error('must not fetch') }, { context: { ...context, relayEnabled: false } })
  assert.equal(health(report).status, 'not-tested')
  assert.equal(report.checks[2].status, 'not-tested')
  const offline = await run(async () => healthResponse(), { context: { ...context, relayState: 'offline' } })
  assert.equal(health(offline).status, 'pass')
  assert.equal(offline.checks[2].status, 'not-tested', 'HTTPS success must not claim WSS success')
})

test('network failures retain only allowlisted system codes through bounded cause and AggregateError', () => {
  const cases = { EAI_AGAIN: 'dns', ENOTFOUND: 'dns', ECONNREFUSED: 'connection-refused', ECONNRESET: 'connection-reset',
    ENETUNREACH: 'network-unreachable', ETIMEDOUT: 'timeout', UND_ERR_CONNECT_TIMEOUT: 'timeout',
    CERT_HAS_EXPIRED: 'tls-validation', SELF_SIGNED_CERT_IN_CHAIN: 'tls-validation',
    ERR_TLS_CERT_ALTNAME_INVALID: 'tls-validation' }
  for (const [systemCode, code] of Object.entries(cases)) {
    const error = new Error('secret https://user:password@private.invalid', {
      cause: new AggregateError([new Error('unknown'), Object.assign(new Error('PRIVATE KEY'), { code: systemCode })], 'secret'),
    })
    assert.deepEqual(classifyConnectionFailure(error), { code, systemCode })
  }
  const cyclic = { message: 'secret', code: 'TOKEN_SECRET' }
  cyclic.cause = cyclic
  cyclic.errors = [cyclic]
  assert.deepEqual(classifyConnectionFailure(cyclic), { code: 'unknown' })
  const huge = { errors: new Array(1_000_000).fill(cyclic) }
  huge.errors[999_999] = { code: 'ENOTFOUND' }
  assert.deepEqual(classifyConnectionFailure(huge), { code: 'unknown' }, 'must not scan huge aggregates')
  let deep = { code: 'ENOTFOUND' }
  for (let i = 0; i < 10; i++) deep = { cause: deep }
  assert.deepEqual(classifyConnectionFailure(deep), { code: 'unknown' })
  assert.deepEqual(classifyConnectionFailure({ get code() { throw Error('private') } }), { code: 'unknown' })
  assert.deepEqual(classifyConnectionFailure({ code: 'invalid-response', message: 'secret' }), { code: 'invalid-response' })
  assert.deepEqual(classifyConnectionFailure({ code: 'invalid-response', status: 200 }), { code: 'invalid-response', httpStatus: 200 })
  const hostile = new Proxy([], { get() { throw new Error('private') } })
  assert.deepEqual(classifyConnectionFailure({ errors: hostile }), { code: 'unknown' })
  assert.deepEqual(classifyConnectionFailure(new DOMException('secret', 'AbortError')), { code: 'cancelled' })
  assert.deepEqual(classifyConnectionFailure(new DOMException('secret', 'TimeoutError')), { code: 'timeout' })
})

test('HTTP status classification cannot invent time, account, VPN or entitlement diagnosis', async () => {
  for (const [status, code] of [[301, 'invalid-response'], [401, 'request-rejected'], [403, 'request-rejected'],
    [407, 'proxy-auth-required'], [429, 'rate-limited'], [502, 'server-error']]) {
    assert.deepEqual(connectionHttpFailure(status), { code, httpStatus: status })
    assert.deepEqual(classifyConnectionFailure({ status, message: 'secret' }), { code, httpStatus: status })
    const report = await run(async () => new Response('secret', { status }))
    assert.equal(health(report).status, 'fail')
    assert.equal(health(report).code, code)
    assert.equal(health(report).httpStatus, status)
    assert.equal(JSON.stringify(report).includes('secret'), false)
  }
  assert.deepEqual(connectionHttpFailure(NaN), { code: 'unknown' })
})

test('invalid configured origins never create a request', async () => {
  for (const origin of ['http://127.0.0.1', 'https://user:secret@example.invalid', 'https://example.invalid/path',
    'https://example.invalid?token=secret', 'https://example.invalid#secret', 'https://example.invalid:8443', ' https://example.invalid', 'file:///private']) {
    const report = await run(() => { throw new Error('unexpected request') }, { relayOrigin: origin })
    assert.equal(health(report).status, 'fail')
    assert.equal(JSON.stringify(report).includes('secret'), false)
  }
})

test('200 HTML, malformed JSON, bad schema, redirected response and oversized headers are not healthy', async () => {
  const responses = [
    () => new Response('<html>private enterprise login</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{"broken":', { headers: { 'content-type': 'application/json' } }),
    () => healthResponse({ ok: false, version: '1' }), () => healthResponse({ ok: true }),
    () => healthResponse({ ok: true, version: 'private token string' }),
    () => healthResponse(undefined, { headers: { 'content-type': 'application/json', 'content-length': `${CONNECTION_DIAGNOSTIC_MAX_BYTES + 1}` } }),
    () => { const response = healthResponse(); Object.defineProperty(response, 'redirected', { value: true }); return response },
  ]
  for (const response of responses) {
    const report = await run(async () => response())
    assert.equal(health(report).code, 'invalid-response')
    assert.equal(health(report).status, 'fail')
    assert.equal(JSON.stringify(report).includes('private'), false)
  }
})

test('body is streamed within 16 KiB and cancelled promptly on excess without buffering rest', async () => {
  let pulls = 0, cancelled = false
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096).fill(32)) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const report = await run(async () => new Response(body, { headers: { 'content-type': 'application/json' } }))
  assert.equal(health(report).code, 'invalid-response')
  assert.equal(cancelled, true)
  assert.equal(pulls, 5)
})

test('cancel before fetch sends nothing and cancellation is not a network failure', async () => {
  const controller = new AbortController()
  controller.abort('secret')
  const report = await run(() => { throw new Error('must not fetch') }, { signal: controller.signal })
  assert.equal(health(report).status, 'cancelled')
  assert.equal(health(report).code, 'cancelled')
})

test('an endless stream of empty chunks is bounded and cancelled', async () => {
  let pulls = 0, cancelled = false
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array()) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const report = await run(async () => new Response(body, { headers: { 'content-type': 'application/json' } }))
  assert.equal(health(report).code, 'invalid-response')
  assert.equal(pulls, 33)
  assert.equal(cancelled, true)
})

test('cancel limits hanging fetch and discards its late response without changing final report', async () => {
  const controller = new AbortController()
  let resolve, called, bodyCancelled = false
  const started = new Promise(done => { called = done })
  const pending = run(() => { called(); return new Promise(done => { resolve = done }) }, { signal: controller.signal })
  await started
  controller.abort('SECRET')
  const report = await pending, saved = JSON.stringify(report)
  assert.equal(health(report).status, 'cancelled')
  resolve(new Response(new ReadableStream({ cancel() { bodyCancelled = true } }), { headers: { 'content-type': 'application/json' } }))
  await Promise.resolve(); await Promise.resolve()
  assert.equal(bodyCancelled, true)
  assert.equal(JSON.stringify(report), saved)
})

test('cancel interrupts hanging stream including a cancel implementation that never completes', async () => {
  const controller = new AbortController()
  let called, cancelled = false
  const reading = new Promise(done => { called = done })
  const stream = new ReadableStream({ pull() { called(); return new Promise(() => {}) }, cancel() { cancelled = true; return new Promise(() => {}) } })
  const pending = run(async () => new Response(stream, { headers: { 'content-type': 'application/json' } }), { signal: controller.signal })
  await reading
  await Promise.resolve(); await Promise.resolve()
  controller.abort()
  const report = await pending
  assert.equal(health(report).status, 'cancelled')
  assert.equal(cancelled, true)
})

test('8 second total deadline covers fetch and body even when abort is ignored', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let observedSignal
  const pending = run((_target, options) => { observedSignal = options.signal; return new Promise(() => {}) })
  t.mock.timers.tick(CONNECTION_DIAGNOSTIC_TIMEOUT_MS)
  const report = await pending
  assert.equal(observedSignal.aborted, true)
  assert.equal(health(report).status, 'fail')
  assert.equal(health(report).code, 'timeout')
})

test('total deadline also cancels a response that stalls after headers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reading, cancelled = false
  const started = new Promise(done => { reading = done })
  const body = new ReadableStream({ pull() { reading(); return new Promise(() => {}) }, cancel() { cancelled = true } }, { highWaterMark: 0 })
  const pending = run(async () => new Response(body, { headers: { 'content-type': 'application/json' } }))
  await started
  t.mock.timers.tick(CONNECTION_DIAGNOSTIC_TIMEOUT_MS)
  const report = await pending
  assert.equal(health(report).code, 'timeout')
  assert.equal(cancelled, true)
})

test('real loopback fetch fault and recovery use injected transport without touching host policy or business paths', async () => {
  const requests = [], originalFetch = globalThis.fetch
  let available = false
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization, cookie: request.headers.cookie })
    response.writeHead(available ? 200 : 503, { 'content-type': 'application/json' })
    response.end(JSON.stringify(available ? { ok: true, version: '2026-08-27.2' } : { message: 'PRIVATE_DETAIL' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  const fetch = (url, options) => {
    assert.equal(url, `${relayOrigin}/healthz`)
    // Test-only routing: production code remains restricted to the configured HTTPS origin.
    return originalFetch(`http://127.0.0.1:${port}/healthz`, options)
  }
  try {
    const failed = await run(fetch)
    assert.equal(health(failed).code, 'server-error')
    available = true
    const recovered = await run(fetch)
    assert.equal(health(recovered).status, 'pass')
    assert.deepEqual(requests, Array.from({ length: 2 }, () => ({ method: 'GET', path: '/healthz', authorization: undefined, cookie: undefined })))
    assert.equal(globalThis.fetch, originalFetch)
    assert.equal(JSON.stringify(failed).includes('PRIVATE_DETAIL'), false)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  const refused = await run(fetch)
  // A just-closed keepalive socket can reset before a fresh connect is refused.
  assert.ok(['connection-refused', 'connection-reset'].includes(health(refused).code))
})

test('report projection is bounded, drops secrets and invalid metadata, and snapshots context', async () => {
  const secret = 'TOKEN-secret-C:\\Users\\private-https://proxy:pass@local'
  const input = { ...context, pluginVersion: secret, dshVersion: secret, platform: secret, profileKind: secret,
    qrKind: secret, relayState: secret, lastPairingAttempt: { at, outcome: 'failed', failure: { code: 'dns', systemCode: secret, message: secret }, qr: secret },
    token: secret, headers: { Authorization: secret } }
  let resolve, called
  const started = new Promise(done => { called = done })
  const pending = run(() => { called(); return new Promise(done => { resolve = done }) }, { context: input })
  await started
  input.lastPairingAttempt.failure.code = 'server-error'
  resolve(healthResponse())
  const report = await pending
  assert.equal(report.lastPairingAttempt.failure.code, 'dns')
  const forged = { ...report, secret, checks: report.checks.map(check => ({ ...check, message: secret, url: secret })) }
  const rendered = formatConnectionDiagnosticReport(forged)
  assert.equal(rendered.includes(secret), false)
  assert.ok(Buffer.byteLength(rendered) < CONNECTION_DIAGNOSTIC_MAX_BYTES)
  assert.equal(report.pluginRunningVersion, 'unknown')
  assert.equal(report.dshVersion, undefined)
  assert.equal(report.platform, 'unknown')
  assert.equal(sanitizeConnectionReport(null), null)
  assert.equal(sanitizeConnectionReport({ ...report, checks: [] }), null)
  assert.equal(sanitizeConnectionReport({ ...report, checks: new Proxy([], { get() { throw Error('secret') } }) }), null)
  assert.equal(sanitizeConnectionReport({ ...report, startedAt: secret }), null)
  assert.equal(sanitizePairingAttempt({ at: secret, outcome: 'failed' }), undefined)
  assert.deepEqual(sanitizePairingAttempt({ at, outcome: 'ticket-issued', failure: { code: 'dns', message: secret } }), { at, outcome: 'ticket-issued' })
  assert.equal(failureDescription(secret), failureDescription('unknown'))
  assert.equal(failureAdvice(secret), failureAdvice('unknown'))
})
