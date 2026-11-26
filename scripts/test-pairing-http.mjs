import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { test } from 'node:test'
import { pairingHttpHandler, pairingRequestRejection } from '../lib/pairing-http.js'

test('provider-based management uses the admitted owner without authenticating twice', () => {
  const request = { headers: { host: 'localhost' } }
  const native = { authentication: { register() {} }, admit() { assert.fail('must not select a second identity') } }
  const peer = kind => ({ principal: { kind }, signal: new AbortController().signal })
  assert.equal(pairingRequestRejection(native, request, peer('owner')), undefined)
  assert.equal(pairingRequestRejection(native, request), 401)
  assert.equal(pairingRequestRejection(native, request, peer('session')), 403)
  assert.equal(pairingRequestRejection(native, request, { principal: { kind: 'owner' }, signal: AbortSignal.abort() }), 403)
  assert.equal(pairingRequestRejection({ admit() {} }, request, peer('owner')), 401)
})

test('alpha native management keeps the small body limit and rejects shared users before parsing', async () => {
  let calls = 0
  const handler = pairingHttpHandler('/manage', {
    authentication: { register() {} }, admit() { assert.fail('must not authenticate twice') },
  }, async () => { calls++; return { ok: true, value: 'owner-only' } })
  const server = createServer((req, res) => handler(req, res,
    req.headers.authorization ? { principal: { kind: req.headers.authorization === 'owner' ? 'owner' : 'session' }, signal: new AbortController().signal } : undefined))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const post = (authorization, body) => fetch(origin + '/manage/status', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body,
  })
  try {
    assert.equal((await post('', 'invalid')).status, 401)
    assert.equal((await post('shared', 'invalid')).status, 403)
    assert.equal((await post('owner', 'x'.repeat(5000))).status, 400)
    assert.equal(calls, 0)
    const response = await post('owner', JSON.stringify({ type: 'client-request', rpcId: 'alpha', method: 'status', payload: {} }))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).result.value, 'owner-only')
    assert.equal(calls, 1)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('revoking an admitted Peer while reading the body prevents every operation', async () => {
  const lifetime = new AbortController()
  let calls = 0
  const handler = pairingHttpHandler('/manage', { authentication: { register() {} }, admit() {} },
    async () => { calls++; return { ok: true, value: 'must-not-run' } })
  const server = createServer((req, res) => {
    void handler(req, res, { principal: { kind: 'owner' }, signal: lifetime.signal })
    req.once('data', () => lifetime.abort())
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/manage/pair-code', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'revoked', method: 'pair-code', payload: {} }),
    })
    assert.equal(response.status, 503)
    assert.equal(calls, 0)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('revoking an admitted Peer during an operation suppresses the late result', async () => {
  const lifetime = new AbortController()
  const handler = pairingHttpHandler('/manage', { authentication: { register() {} }, admit() {} },
    async () => { lifetime.abort(); return { ok: true, value: 'private-ticket' } })
  const server = createServer((req, res) => handler(req, res, { principal: { kind: 'owner' }, signal: lifetime.signal }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/manage/pair-code', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'revoked', method: 'pair-code', payload: {} }),
    })
    assert.equal(response.status, 503)
    assert.equal(await response.text(), '')
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
import { createPairingHandler } from '../lib/pairing-management.js'

test('operator wire reaches current-endpoint update operations; auth and exact payload remain required', async () => {
  const calls = []
  const handler = createPairingHandler({ unavailable: () => false, status: () => ({}), pairCode: async () => ({}),
    updateCheck: async () => { calls.push(['check']); return {} }, updateStart: ticket => { calls.push(['start', ticket]); return {} }, updateStatus: async () => ({ phase: 'idle' }) })
  const server = createServer(pairingHttpHandler('/manage', { admit() {}, requestRejection: req => req.headers.authorization === 'fixture-only' ? undefined : 401 }, handler.call))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const post = (method, payload = {}, auth = 'fixture-only') => fetch(origin + '/manage/' + method, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method, payload }) })
  try {
    assert.equal((await post('update-start', { ticket: 'a'.repeat(48) }, '')).status, 401)
    for (const [method, payload] of [['update-check', {}], ['update-start', { ticket: 'a'.repeat(48) }], ['update-status', {}]]) {
      const response = await post(method, payload); assert.equal(response.status, 200); assert.equal((await response.json()).result.ok, true)
    }
    assert.equal((await (await post('update-start', { ticket: 'a'.repeat(48), source: 'arbitrary' })).json()).result.ok, false)
    assert.equal((await (await post('update-check', { profile: 'web' })).json()).result.ok, false)
    assert.equal((await post('run-shell')).status, 404)
    assert.equal((await post('companion-decision', { offerId: 'a'.repeat(32), action: 'approve' })).status, 404)
    assert.deepEqual(calls.map(row => row[0]), ['check', 'start'])
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
