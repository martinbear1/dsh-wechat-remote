import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { test } from 'node:test'
import { pairingHttpHandler } from '../lib/pairing-http.js'

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
