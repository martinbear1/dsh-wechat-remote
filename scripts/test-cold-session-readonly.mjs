import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { DshCompatibilityApi } from '../lib/dsh-compatibility-api.js'
import { resolveTypertGateway } from '../lib/dsh-protocol-compat.js'
const tick = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)) }
test('viewing cold history and command suggestions does not request a write-capable follow', async t => {
  const sources = new Map(), active = new Set(), calls = []
  let observed = 0, disposed = 0
  const open = (key, signal) => {
    const value = new Readable({ objectMode: true, read() {} })
    signal.addEventListener('abort', () => value.destroy(), { once: true }); sources.set(key, value); return value
  }
  const native = {
    async invoke(request) {
      calls.push(request.method)
      if (request.method === 'list') return { items: [{ sessionId: 'cold', origin: 'user' }] }
      if (request.method === 'page') {
        assert.equal(request.args.request.throughSeq, 2)
        return { records: [{ type: 'event', event: { type: 'user/message', seq: 2, data: { content: 'saved' } } }], hasMore: false }
      }
      throw Error('unexpected RPC ' + request.method)
    },
    async stream({ namespace, method, signal }) { calls.push(method); return open(namespace + '/' + method, signal) },
    wireStream: { open: async (_name, _payload, signal) => open('$events', signal) },
  }
  const ctx = { get: key => ({ typertGateway: native, agents: { get: id => active.has(id) ? {} : undefined }, sessionQuery: {
    async observeSession(id, options) {
      assert.equal(id, 'cold'); assert.equal(options.projectionMode, 'all'); observed++
      return { cursor: 2, header: { cwd: '/work' }, projections: { asOfSeq: 2, values: { title: 'history' } }, [Symbol.dispose]() { disposed++ } }
    },
  } })[key] }
  const api = new DshCompatibilityApi(ctx); t.after(() => api.dispose())
  const peer = { readyState: 1, bufferedAmount: 0, send() {}, close() {} }
  api.connectEvents('/api/events.mux', peer)
  const response = await api.request({ method: 'POST', path: '/api/session.history', signal: new AbortController().signal,
    body: Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'view', method: 'session.history', payload: { sessionId: 'cold' } })) })
  const result = JSON.parse(Buffer.from(response.body)).result
  assert.equal(result.ok, true); assert.equal(result.value.events.length, 1)
  assert.equal(observed, 1); assert.equal(disposed, 1)
  assert(!calls.includes('follow'))
  await assert.rejects(resolveTypertGateway(ctx).invoke({ namespace: 'commands', method: 'list', args: { agentId: 'cold' } }), { code: 'session/agent-unavailable' })
  active.add('cold')
  sources.get('$events').push({ type: 'emit', event: 'api-session/status', args: ['cold', true] })
  await tick()
  assert.equal(calls.filter(x => x === 'follow').length, 1, 'native activation enables streaming without another phone action')
})
