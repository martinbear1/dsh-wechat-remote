import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import ts from 'typescript'
import { createPairingHandler } from '../lib/pairing-management.js'
import { pairingHttpHandler } from '../lib/pairing-http.js'

const tick = () => new Promise(resolve => setImmediate(resolve))

test('diagnostics have no passive enrollment hooks and the only runner call is the explicit management operation', () => {
  const agent = readFileSync(new URL('../src/public-relay-agent.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(agent, /diagnostic|lastPairingAttempt|qrKind/i)
  const source = readFileSync(new URL('../src/gate-runtime.ts', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('gate.ts', source, ts.ScriptTarget.Latest, true)
  const calls = []
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'runConnectionDiagnostics') calls.push(node)
    if (ts.isFunctionDeclaration(node) && ['makePairEntry', 'pairCodeValue', 'gateStatusValue'].includes(node.name?.text))
      assert.doesNotMatch(node.getText(tree), /diagnostic|lastPairingAttempt|qrKind/i)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(calls.length, 1, 'no startup, connection, failure or status-triggered probe')
  const callback = calls[0].parent
  assert(ts.isArrowFunction(callback))
  assert(ts.isPropertyAssignment(callback.parent))
  assert.equal(callback.parent.name.getText(tree), 'connectionDiagnostics')
  assert.doesNotMatch(source, /lastPairingAttempt|qrKind/, 'no diagnostic-only bookkeeping in business lifecycle')
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

test('pending, failed, cancelled, rate-limited and unsupported diagnostics never gate pairing or status', async () => {
  let rejectProbe, pairs = 0
  const business = { online: true }
  const pairCode = async () => ({ ticket: ++pairs })
  const handler = createPairingHandler(ops({ status: () => business, pairCode,
    connectionDiagnostics: () => new Promise((_, reject) => { rejectProbe = reject }) }))
  const signal = () => new AbortController().signal
  const checkBusiness = async () => {
    assert.equal((await handler.call('status', {}, signal())).value, business)
    assert.equal((await handler.call('pair-code', {}, signal())).ok, true)
  }
  const pending = handler.call('connection-diagnostics', {}, signal())
  await tick(); await checkBusiness()
  rejectProbe(Error('probe failed'))
  assert.equal((await pending).error.code, 'diagnostic/unavailable')
  await checkBusiness()
  assert.equal((await handler.call('connection-diagnostics', {}, signal())).error.code, 'diagnostic/busy')
  await checkBusiness()
  const cancelHandler = createPairingHandler(ops({ status: () => business, pairCode,
    connectionDiagnostics: probeSignal => new Promise(resolve => probeSignal.addEventListener('abort', () => resolve({ cancelled: true }))) }))
  const controller = new AbortController()
  const cancelled = cancelHandler.call('connection-diagnostics', {}, controller.signal)
  await tick(); controller.abort(); await cancelled
  assert.equal((await cancelHandler.call('pair-code', {}, signal())).ok, true)
  const unsupported = createPairingHandler(ops({ status: () => business, pairCode }))
  assert.equal((await unsupported.call('connection-diagnostics', {}, signal())).error.code, 'diagnostic/unsupported')
  assert.equal((await unsupported.call('pair-code', {}, signal())).ok, true)
  assert.equal(pairs, 5)
  handler.stop(); cancelHandler.stop(); unsupported.stop()
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
