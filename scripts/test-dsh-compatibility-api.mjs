import assert from 'node:assert/strict'
import { DshCompatibilityApi } from '../lib/dsh-compatibility-api.js'

const calls = []
const gateway = {
  async invoke(call) { calls.push(call); return { sessionId: 'session-created' } },
  async stream() { throw new Error('no stream expected') },
}
const api = new DshCompatibilityApi({ get: key => key === 'typertGateway' ? gateway : undefined })
const signal = new AbortController().signal
const envelope = (method, payload = {}) => Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'request-1', method, payload }))
const request = (method, payload) => api.request({ method: 'POST', path: '/api/' + method, body: envelope(method, payload), signal })
const created = await request('session.create', { cwd: '/work', sessionId: 'session-created' })
assert.equal(created.statusCode, 200)
assert.equal(JSON.parse(Buffer.from(created.body).toString()).result.value.sessionId, 'session-created')
assert.deepEqual(calls[0].args, { request: { cwd: '/work', sessionId: 'session-created' } })
const mismatch = await api.request({ method: 'POST', path: '/api/session.list', body: envelope('session.create'), signal })
assert.equal(mismatch.statusCode, 400)
assert.equal(calls.length, 1, 'mismatched carrier cannot execute a mutation')
assert.equal((await api.request({ method: 'GET', path: '/api/session.list', body: Buffer.alloc(0), signal })).statusCode, 405)
assert.equal((await api.request({ method: 'POST', path: '/other', body: Buffer.from('{}'), signal })).statusCode, 404)
assert.throws(() => api.connectEvents('/api/arbitrary', {}), /Unsupported/)
const aborted = new AbortController()
aborted.abort(new Error('cancelled'))
await assert.rejects(api.request({ method: 'POST', path: '/api/session.list', body: envelope('session.list'), signal: aborted.signal }), /cancelled/)
assert.equal(calls.length, 1)
api.dispose()

// 0.1.1 has Gateway.invoke but not Gateway.stream. Only prompt commands are
// adapted; HTTP endpoints and event sockets otherwise keep native behavior.
const nativeCalls = []
const savedFetch = globalThis.fetch
let current = 'workspace-write'
let flushes = 0
const oldApi = new DshCompatibilityApi({ get: key => key === 'typertGateway' ? {
  async invoke({ namespace, method, args }) {
    assert.equal(namespace, 'commands'); assert.equal(method, 'execute')
    assert.equal(args.agentId, 'old-session')
    current = args.line.split(' ')[1]
    return { commandId: 'native-command', result: { kind: 'success' } }
  },
} : key === 'sessions' ? { get: () => ({ id: 'old-session' }), async flush() { flushes++; return true } } : undefined }, 4321)
assert.equal(oldApi.handlesPath('/api/session.prompt'), true)
assert.equal(oldApi.handlesPath('/api/session.list'), false)
assert.equal(oldApi.handlesPath('/api/events.host'), false)
globalThis.fetch = async (url, init) => {
  assert.equal(new URL(url).origin, 'http://127.0.0.1:4321')
  assert.equal(init.redirect, 'error')
  const body = JSON.parse(init.body.toString())
  nativeCalls.push(body)
  const value = body.method === 'session.history'
    ? { projections: { values: { permissions: { currentValue: current } } } } : { accepted: true }
  return new Response(JSON.stringify({ result: { ok: true, value } }), { status: 200 })
}
try {
  const send = payload => oldApi.request({ method: 'POST', path: '/api/session.prompt', body: envelope('session.prompt', { sessionId: 'old-session', mode: 'queue', ...payload }), signal })
  const changed = await send({ content: [{ type: 'text', text: '/permission read-only' }] })
  assert.equal(JSON.parse(Buffer.from(changed.body).toString()).result.value.permission, 'read-only')
  assert.equal(flushes, 1, 'permission success waits for native durability checkpoint')
  assert.deepEqual(nativeCalls.map(call => call.method), ['session.history'], 'permission does not reach native prompt/model admission')
  await send({ content: [{ type: 'text', text: 'ordinary prompt' }] })
  assert.deepEqual(nativeCalls.map(call => call.method), ['session.history', 'session.prompt'])
  const malformed = await send({ content: [{ type: 'text', text: '/permission read-only\nextra' }] })
  assert.equal(JSON.parse(Buffer.from(malformed.body).toString()).result.error.code, 'adapter/invalid-permission-command')
  assert.equal(nativeCalls.length, 2)
} finally { globalThis.fetch = savedFetch; oldApi.dispose() }
console.log('shared DSH compatibility API tests passed')
