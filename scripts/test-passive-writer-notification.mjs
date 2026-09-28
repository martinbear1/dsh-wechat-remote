/** Plugin notification regression, NOT a fix for native Desktop activation. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'
import { DshCompatibilityApi } from '../lib/dsh-compatibility-api.js'

const tick = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)) }
const message = id => `session "${id}" is already owned by an active write handle`
function fixture(t) {
  const sources = new Map(), frames = [], services = { agents: { get() {} }, sessions: { get() {} } }
  const open = (key, signal) => {
    const value = new Readable({ objectMode: true, read() {} })
    signal.addEventListener('abort', () => value.destroy(), { once: true }); sources.set(key, value); return value
  }
  services.typertGateway = {
    invoke: async () => ({ items: [] }),
    stream: async ({ namespace, method, signal }) => open(namespace + '/' + method, signal),
    wireStream: { open: async (_name, _payload, signal) => open('$events', signal) },
  }
  const ctx = { get: key => services[key] }, adapter = new DshRealtimeCompatibility(ctx)
  const peer = { readyState: 1, bufferedAmount: 0, send: value => frames.push(JSON.parse(value).payload), close() {} }
  adapter.connect('/api/events.host', peer); t.after(() => adapter.dispose())
  const emit = async (id = 'cold', error = message(id)) => {
    sources.get('$events').push({ type: 'emit', event: 'api-session/error', args: [id, error] }); await tick(); return frames.at(-1)
  }
  return { adapter, services, frames, emit, ctx, peer, sources }
}
test('confirmed cold passive conflict remains diagnostic, not a failed phone chat', async t => {
  const f = fixture(t)
  const result = await f.emit()
  assert.equal(result.type, 'host/remote-event')
  assert.equal(result.event, 'wechat-remote/session-readonly')
  assert.equal(result.args[0].reason, 'writer-held')
  assert.equal(f.adapter.getReadonlyConflicts().length, 1)
  const snapshot = f.adapter.getReadonlyConflicts(); snapshot[0].sessionId = 'changed'
  assert.equal(f.adapter.getReadonlyConflicts()[0].sessionId, 'cold')
  for (let i = 0; i < 40; i++) await f.emit('cold-' + i)
  assert.equal(f.adapter.getReadonlyConflicts().length, 32)
  f.adapter.dispose(); assert.equal(f.adapter.getReadonlyConflicts().length, 0)
})
test('live agent, attached session, unknown capabilities and lookup errors fail open', async t => {
  const f = fixture(t)
  for (const patch of [
    { agents: { get: () => ({}) }, sessions: { get() {} } },
    { agents: { get() {} }, sessions: { get: () => ({}) } },
    { agents: undefined, sessions: { get() {} } },
    { agents: { get() {} }, sessions: undefined },
    { agents: { get() { throw Error('unavailable') } }, sessions: { get() {} } },
  ]) {
    Object.assign(f.services, patch)
    assert.equal((await f.emit()).type, 'host/agent-error')
  }
})
test('other errors and mismatching session identities are never reclassified', async t => {
  const f = fixture(t)
  for (const error of ['network failed', 'permission denied', message('different'), message('cold') + '\nstack']) {
    assert.equal((await f.emit('cold', error)).type, 'host/agent-error')
  }
})
test('mitigation never mutates the native frame or calls a host mutation', async t => {
  const f = fixture(t)
  let lookups = 0
  f.services.agents = { get() { lookups++; return undefined } }
  f.services.sessions = { get() { lookups++; return undefined } }
  f.services.typertGateway.invoke = async () => assert.fail('notification must not send native RPCs')
  const nativeFrame = Object.freeze({ type: 'emit', event: 'api-session/error', args: Object.freeze(['cold', message('cold')]) })
  f.sources.get('$events').push(nativeFrame); await tick()
  assert.deepEqual(nativeFrame, { type: 'emit', event: 'api-session/error', args: ['cold', message('cold')] })
  assert.equal(f.frames.at(-1).type, 'host/remote-event')
  assert.equal(lookups, 2)
})
test('concurrent mutations, nested wire calls and unknown operations retain failures', async t => {
  const f = fixture(t)
  const releaseA = f.adapter.trackSessionRequest({ method: 'session.prompt', payload: { sessionId: 'cold' } })
  const releaseB = f.adapter.trackSessionRequest({ method: 'future/change', payload: { args: { request: { sessionId: 'cold' } } } })
  assert.equal((await f.emit()).type, 'host/agent-error')
  releaseA(); releaseA()
  assert.equal((await f.emit()).type, 'host/agent-error', 'one completion cannot clear another in-flight operation')
  releaseB()
  assert.equal((await f.emit()).type, 'host/remote-event')
  const releaseRead = f.adapter.trackSessionRequest({ method: 'session.history', payload: { sessionId: 'cold' } })
  assert.equal((await f.emit()).type, 'host/remote-event'); releaseRead()
})
test('actual compatibility API preserves explicit prompt rejection and releases tracking', async t => {
  const f = fixture(t), api = new DshCompatibilityApi(f.ctx)
  t.after(() => api.dispose()); api.connectEvents('/api/events.host', f.peer)
  f.services.typertGateway.invoke = async ({ method }) => {
    assert.equal(method, 'prompt')
    await f.emit()
    assert.equal(f.frames.at(-1).type, 'host/agent-error')
    throw Object.assign(Error(message('cold')), { code: 'session/writer-held', details: { sessionId: 'cold' } })
  }
  const response = await api.request({ method: 'POST', path: '/api/session.prompt', signal: new AbortController().signal,
    body: Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'actual-send', method: 'session.prompt', payload: { sessionId: 'cold', content: 'test' } })) })
  const result = JSON.parse(Buffer.from(response.body)).result
  assert.equal(result.ok, false); assert.equal(result.error.code, 'session/writer-held')
  assert.equal((await f.emit()).type, 'host/remote-event')
})
