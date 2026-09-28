import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { test } from 'node:test'
import { pairingHttpHandler } from '../lib/pairing-http.js'
import { createPairingHandler } from '../lib/pairing-management.js'

test('operator wire reaches companion and native update operations; auth and exact payload remain required', async () => {
  const calls = []
  const handler = createPairingHandler({ unavailable: () => false, status: () => ({}), pairCode: async () => ({}),
    companionDecision: (...args) => calls.push(['decision', ...args]),
    updateCheck: async () => { calls.push(['check']); return {} }, updateStart: ticket => { calls.push(['start', ticket]); return {} }, updateStatus: async () => ({ phase: 'idle' }) })
  const server = createServer(pairingHttpHandler('/manage', { admit() {}, requestRejection: req => req.headers.authorization === 'fixture-only' ? undefined : 401 }, handler.call))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const post = (method, payload = {}, auth = 'fixture-only') => fetch(origin + '/manage/' + method, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method, payload }) })
  try {
    assert.equal((await post('update-start', { ticket: 'a'.repeat(48) }, '')).status, 401)
    for (const [method, payload] of [['companion-decision', { offerId: 'a'.repeat(32), action: 'later' }], ['update-check', {}], ['update-start', { ticket: 'a'.repeat(48) }], ['update-status', {}]]) {
      const response = await post(method, payload); assert.equal(response.status, 200); assert.equal((await response.json()).result.ok, true)
    }
    assert.equal((await (await post('update-start', { ticket: 'a'.repeat(48), source: 'arbitrary' })).json()).result.ok, false)
    assert.equal((await (await post('update-check', { profile: 'web' })).json()).result.ok, false)
    assert.equal((await post('run-shell')).status, 404)
    assert.deepEqual(calls.map(row => row[0]), ['decision', 'check', 'start'])
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('small management wire is bounded, abort-safe and never parses unauthorized bodies', async () => {
  let calls = 0
  const server = createServer(pairingHttpHandler('/manage', {
    admit() {}, requestRejection(req) { return req.headers.authorization === 'test-only' ? undefined : 401 },
  }, async (_endpoint, payload) => { calls++; return { ok: true, value: payload } }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const envelope = JSON.stringify({ type: 'client-request', rpcId: 'test', method: 'status', payload: {} })
  const post = (body, authorization = 'test-only') => fetch(origin + '/manage/status', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body,
  })
  try {
    assert.equal((await post('not JSON', '')).status, 401)
    assert.equal((await post('x'.repeat(5000))).status, 400)
    await new Promise(resolve => {
      const req = request(origin + '/manage/status', { method: 'POST', headers: {
        authorization: 'test-only', 'content-type': 'application/json', 'content-length': '1000',
      } })
      req.on('error', () => {})
      req.write('{')
      setTimeout(() => { req.destroy(); resolve() }, 20)
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(calls, 0)
    const valid = await post(envelope)
    assert.equal(valid.status, 200)
    assert.equal(valid.headers.get('cache-control'), 'no-store')
    assert.deepEqual((await valid.json()).result, { ok: true, value: {} })
    assert.equal(calls, 1)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
