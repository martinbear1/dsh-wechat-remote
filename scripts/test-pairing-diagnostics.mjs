import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import vm from 'node:vm'
import ts from 'typescript'
import { transform } from 'esbuild'
import { PublicRelayAgent, publicPairingPayload } from '../lib/public-relay-agent.js'
import { classifyConnectionFailure } from '../lib/connection-diagnostics.js'
import { createPairingHandler } from '../lib/pairing-management.js'
import { pairingHttpHandler } from '../lib/pairing-http.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const source = readFileSync(new URL('../src/gate-runtime.ts', import.meta.url), 'utf8')
const tree = ts.createSourceFile('gate.ts', source, ts.ScriptTarget.Latest, true)
let pairFunction, attemptFunction
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'makePairEntry') pairFunction = node.getText(tree)
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'pairingAttemptSnapshot') attemptFunction = node.getText(tree)
  ts.forEachChild(node, visit)
}
visit(tree)
assert(pairFunction)
const compiledPair = (await transform(pairFunction, { loader: 'ts' })).code
const compiledAttempt = (await transform(attemptFunction, { loader: 'ts' })).code
test('latest real background enrollment supersedes old explicit attempt without changing QR evidence', () => {
  const old = { at: '2026-10-11T00:00:00.000Z', outcome: 'failed', failure: { code: 'dns' } }
  const recent = { at: '2026-10-11T00:00:01.000Z', outcome: 'ticket-issued' }
  const sandbox = { Date, lastPairingAttempt: old, publicRelayStatus: { lastPairingAttempt: recent } }
  vm.runInNewContext(compiledAttempt + '\nthis.current = pairingAttemptSnapshot', sandbox)
  assert.equal(sandbox.current(), recent)
  assert.equal(sandbox.lastPairingAttempt, old)
  sandbox.lastPairingAttempt = recent
  sandbox.publicRelayStatus.lastPairingAttempt = { ...old, at: '2026-10-11T00:00:02.000Z' }
  assert.equal(sandbox.current().failure.code, 'dns')
  sandbox.publicRelayStatus.lastPairingAttempt = old
  assert.equal(sandbox.current(), recent)
})
const success = () => Response.json({ ticket: 'fixture-ticket', expiresAt: Date.now() + 600_000 })
function fixture(t, fetchImpl) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pairing-diagnostics-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let calls = 0
  const agent = new PublicRelayAgent({ enabled: true, relayOrigin: 'https://relay.invalid' }, {
    identityPath: path.join(dir, 'identity.json'), agentVersion: '1.0.0', onFrame() { assert.fail('no frames') },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://relay.invalid/v1/agents/enroll')
      assert.equal(options.method, 'POST'); calls++
      return fetchImpl()
    },
  })
  agent.connect = () => assert.fail('explicit offline enrollment must not start a transport')
  const warnings = []
  const sandbox = { publicRelayGateway: { agent, ensurePairingStatus: () => agent.ensurePairingTicket(60000, { refresh: true }) },
    publicRelayStatus: agent.snapshot(), publicPairingPayload, classifyConnectionFailure,
    lastPairingAttempt: undefined, qrKind: 'none', lanIPv4: () => '192.0.2.4', PUBLIC_PORT: 3092,
    ROUTE_QR_REFRESH_MS: 900000, Date, QRCode: { toDataURL: async () => 'data:image/png;base64,fixture' },
    console: { warn: (...parts) => warnings.push(parts.join(' ')) } }
  vm.runInNewContext(compiledPair + '\nthis.runPair = makePairEntry', sandbox)
  return { agent, sandbox, warnings, calls: () => calls, identity: () => readFileSync(path.join(dir, 'identity.json'), 'utf8') }
}

for (const [code, expected] of [['EAI_AGAIN', 'dns'], ['ECONNREFUSED', 'connection-refused'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls-validation']]) {
  test(`real QR fallback exposes safe ${code} cause without changing identity`, async t => {
    const f = fixture(t, () => { throw new TypeError('secret proxy password', { cause: Object.assign(new Error('secret URL'), { code }) }) })
    const before = f.identity(), entry = await f.sandbox.runPair()
    assert.equal(JSON.parse(entry.payload).mode, 'secure-lan-route')
    assert.equal(entry.lastPairingAttempt.failure.code, expected)
    assert.equal(entry.lastPairingAttempt.failure.systemCode, code)
    assert.equal(f.agent.snapshot().lastPairingAttempt.failure.code, expected)
    assert.equal(f.identity(), before)
    assert(!JSON.stringify([entry.lastPairingAttempt, f.warnings]).includes('secret'))
    assert.equal(f.calls(), 1)
  })
}
for (const status of [401, 403, 407, 429, 502]) {
  test(`real enrollment records HTTP ${status} and no raw server message`, async t => {
    const f = fixture(t, () => Response.json({ error: { message: 'secret proxy token', code: 'secret' } }, { status }))
    const entry = await f.sandbox.runPair()
    assert.equal(entry.publicMode, false)
    assert.equal(entry.lastPairingAttempt.failure.httpStatus, status)
    assert(!JSON.stringify([f.warnings, entry.lastPairingAttempt]).includes('secret'))
  })
}
for (const [name, response] of [
  ['missing ticket', () => Response.json({})],
  ['wrong ticket', () => Response.json({ ticket: {}, expiresAt: Date.now() + 60000 })],
  ['invalid expiry', () => Response.json({ ticket: 'fixture', expiresAt: 'later' })],
  ['expired ticket', () => Response.json({ ticket: 'fixture', expiresAt: 1 })],
  ['HTML', () => new Response('<html>secret</html>')],
]) {
  test(`success HTTP with ${name} is an explicit invalid response, not silent recovery`, async t => {
    const f = fixture(t, response), result = await f.sandbox.runPair()
    assert.equal(result.publicMode, false)
    assert.equal(result.lastPairingAttempt.outcome, 'invalid-response')
    assert.equal(result.lastPairingAttempt.failure.code, 'invalid-response')
  })
}
test('retry after offline failure restores a new ticket without clearing identity or waiting for old recovery QR expiry', async t => {
  let online = false
  const f = fixture(t, () => online ? success() : Promise.reject(new Error('offline')))
  const identity = f.identity()
  const a = await f.sandbox.runPair(); assert.equal(a.publicMode, false)
  online = true
  const b = await f.sandbox.runPair(); assert.equal(b.publicMode, true)
  assert.equal(b.lastPairingAttempt.outcome, 'ticket-issued')
  assert.equal(b.lastPairingAttempt.failure, undefined)
  assert.equal(f.agent.snapshot().lastPairingAttempt.outcome, 'ticket-issued')
  assert.equal(f.identity(), identity); assert.equal(f.calls(), 2)
})
test('concurrent failure enrollment coalesces, then clears for later retry', async t => {
  let reject, online = false
  const f = fixture(t, () => online ? success() : new Promise((_, r) => { reject = r }))
  const a = f.sandbox.runPair(), b = f.sandbox.runPair()
  assert.equal(f.calls(), 1); reject(new Error('offline'))
  assert((await Promise.all([a, b])).every(x => !x.publicMode))
  online = true; assert.equal((await f.sandbox.runPair()).publicMode, true)
  assert.equal(f.calls(), 2)
})

const ops = extra => ({ unavailable: () => false, status: () => ({}),
  pairCode: () => assert.fail('diagnostic must not create pairing tickets'), ...extra })
test('diagnostic management rejects URL/body injection and unsupported host, leaves normal status available', async () => {
  let checks = 0
  const handler = createPairingHandler(ops({ connectionDiagnostics: async () => { checks++; return {} } }))
  for (const input of [null, [], { url: 'https://arbitrary.invalid' }, { start: true }]) {
    assert.equal((await handler.call('connection-diagnostics', input, new AbortController().signal)).ok, false)
  }
  assert.equal(checks, 0)
  const unsupported = createPairingHandler(ops({}))
  assert.equal((await unsupported.call('connection-diagnostics', {}, new AbortController().signal)).error.code, 'diagnostic/unsupported')
  assert.equal((await unsupported.call('status', {}, new AbortController().signal)).ok, true)
})
test('concurrent views share one diagnostic; aborting one does not cancel the other', async () => {
  let complete, probeSignal, calls = 0
  const handler = createPairingHandler(ops({ connectionDiagnostics: signal => {
    probeSignal = signal; calls++; return new Promise(resolve => { complete = resolve })
  } }))
  const first = new AbortController(), second = new AbortController()
  const a = handler.call('connection-diagnostics', {}, first.signal)
  const b = handler.call('connection-diagnostics', {}, second.signal)
  await tick(); first.abort()
  assert.equal((await a).error.code, 'diagnostic/cancelled')
  assert.equal(probeSignal.aborted, false); assert.equal(calls, 1)
  complete({ checks: [] }); assert.equal((await b).ok, true)
})
for (const action of ['cancel', 'stop']) {
  test(`last diagnostic viewer ${action} aborts probe, not existing pairing/service`, async () => {
    let probeSignal, finished = false
    const handler = createPairingHandler(ops({ connectionDiagnostics: signal => {
      probeSignal = signal
      return new Promise(resolve => signal.addEventListener('abort', () => { finished = true; resolve({ cancelled: true }) }, { once: true }))
    } }))
    const controller = new AbortController(), pending = handler.call('connection-diagnostics', {}, controller.signal)
    await tick()
    if (action === 'stop') handler.stop(); else controller.abort()
    assert.equal((await pending).ok, false)
    assert.equal(probeSignal.aborted, true); assert.equal(finished, true)
  })
}
test('protected HTTP diagnostic endpoint retains admission, POST, content type and payload limits', async () => {
  let checks = 0
  const handler = createPairingHandler(ops({ connectionDiagnostics: async () => { checks++; return { schema: 1 } } }))
  const server = createServer(pairingHttpHandler('/manage', { admit() {}, requestRejection: req =>
    req.headers.origin === 'https://alien.invalid' ? 403 : req.headers.authorization === 'fixture' ? undefined : 401 }, handler.call))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/manage/connection-diagnostics`
  const body = JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'connection-diagnostics', payload: {} })
  const post = (extra = {}, text = body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'fixture', ...extra }, body: text })
  try {
    assert.equal((await post({ authorization: '' })).status, 401)
    assert.equal((await post({ origin: 'https://alien.invalid' })).status, 403)
    assert.equal((await fetch(url, { headers: { authorization: 'fixture' } })).status, 404)
    assert.equal((await post({ 'content-type': 'text/plain' })).status, 415)
    assert.equal((await post({}, 'x'.repeat(5000))).status, 400)
    assert.equal(checks, 0)
    assert.equal((await (await post()).json()).result.ok, true)
    assert.equal(checks, 1)
    assert.equal((await (await post()).json()).result.error.code, 'diagnostic/busy')
  } finally { handler.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
