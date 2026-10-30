import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'

const tick = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)) }
const questions = [{ id: 'q', question: '原始问题', detail: '完整内容', options: [{ label: ' 原始 label ' }] }]
function fixture(t) {
  const sources = new Map(), calls = [], responses = []
  const open = (key, signal) => {
    const stream = new Readable({ objectMode: true, read() {} })
    const abort = () => stream.destroy()
    signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => signal.removeEventListener('abort', abort))
    sources.set(key, stream); return stream
  }
  const gateway = {
    invoke: async request => { calls.push(request); return { items: [] } },
    stream: async ({ namespace, method, signal }) => open(namespace + '/' + method, signal),
    wireStream: { open: async (_endpoint, _payload, signal) => open('$events', signal) },
  }
  const connection = { createSharedFetchHandler: () => ({ fetch: async request => {
    responses.push((await request.json()).payload.args)
    return Response.json({ result: { ok: true } })
  } }) }
  const adapter = new DshRealtimeCompatibility({ get: key => key === 'typertGateway' ? gateway : key === 'connection' ? connection : undefined })
  const peer = { readyState: 1, bufferedAmount: 0, frames: [], closes: [],
    send(value) { this.frames.push(JSON.parse(value)) }, close(...args) { this.closes.push(args) } }
  adapter.connect('/api/events.mux', peer)
  sources.get('$events').push({ type: 'ready', clientId: 'native-client' })
  t.after(() => adapter.dispose())
  return { adapter, peer, sources, calls, responses, request(wait, id = 'event', event = 'user-questions/request') {
    sources.get('$events').push({ type: 'waterfall', event, eventId: id, agentId: 'session',
      request: { questions, callId: id, toolName: 'write', reason: 'reason', ...(wait === undefined ? {} : { wait }) } })
  } }
}
const requested = f => f.peer.frames.filter(frame => frame.payload.type === 'question/requested')
const cancel = id => ({ type: 'client-response', rpcId: id, result: { ok: false, error: { code: 'cancelled', message: 'cancelled by client' } } })

test('native wait identity is distinct from delivery; no automatic claim, timer, retry or host activation', async t => {
  const f = fixture(t)
  for (const [id, timed] of [['timed', true], ['indefinite', undefined]]) f.request({ callId: 'call-' + id, ...(timed ? { timed } : {}) }, id)
  await tick()
  for (const frame of requested(f)) {
    assert.deepEqual(frame.payload.nativeQuestion, { version: 1, callId: 'call-' + frame.rpcId, timed: frame.rpcId === 'timed', channel: 'waterfall' })
    assert.deepEqual(frame.payload.questions, questions)
  }
  assert.equal(f.calls.length, 0); assert.deepEqual([...f.sources.keys()].sort(), ['$events', 'session/control'])
  assert.deepEqual(f.peer.closes, [])
})

test('legacy and malformed waits are not upgraded based on version strings or message text', async t => {
  const f = fixture(t), waits = [undefined, null, {}, [], { callId: '' }, { callId: 8 }, { callId: 'bad', timed: 'yes' }]
  waits.forEach((wait, i) => f.request(wait, 'legacy-' + i)); await tick()
  assert.equal(requested(f).length, waits.length)
  for (const frame of requested(f)) assert.deepEqual(frame.payload, { type: 'question/requested', sessionId: 'session', questions })
})

test('replayed request is deduplicated; host abort ends only its delivery; late answer is refused', async t => {
  const f = fixture(t); f.request({ callId: 'call', timed: true }); f.request({ callId: 'call', timed: true }); await tick()
  assert.equal(requested(f).length, 1)
  f.sources.get('$events').push({ type: 'cancel', eventId: 'event' }); await tick()
  assert.equal(f.peer.frames.filter(frame => frame.payload.type === 'question/resolved').length, 1)
  assert.equal((await f.adapter.respond(cancel('event'))).accepted, false)
  assert.equal(f.responses.length, 0); assert.equal(f.calls.length, 0)
})

test('ordinary cancel uses native UserQuestionError/ASK_CANCELLED; unknown errors retain identity', async t => {
  const f = fixture(t); f.request(undefined, 'cancel'); f.request(undefined, 'unknown'); await tick()
  assert.equal((await f.adapter.respond(cancel('cancel'))).accepted, true)
  assert.deepEqual(f.responses[0].outcome, { kind: 'rejected', error: { name: 'UserQuestionError', code: 'ASK_CANCELLED', message: 'cancelled by client' } })
  await f.adapter.respond({ type: 'client-response', rpcId: 'unknown', result: { ok: false,
    error: { code: 'permission-denied', message: 'blocked', details: { read: false } } } })
  assert.deepEqual(f.responses[1].outcome, { kind: 'rejected', error: { name: 'Error', code: 'permission-denied', message: 'blocked', details: { read: false } } })
})

test('old phone cannot cancel a named native question; full answer still uses its live waterfall', async t => {
  const f = fixture(t); f.request({ callId: 'call', timed: true }); await tick()
  assert.equal((await f.adapter.respond(cancel('event'))).accepted, false); assert.equal(f.responses.length, 0)
  const answer = { answers: [{ id: 'q', selected: [' 原始 label '], custom: '完整补充' }] }
  assert.equal((await f.adapter.respond({ type: 'client-response', rpcId: 'event', result: { ok: true, value: { answer } } })).accepted, true)
  assert.deepEqual(f.responses[0].outcome, { kind: 'result', value: answer })
})

test('approval allow/reject stays a native verdict, never a question cancellation or session stop', async t => {
  const f = fixture(t)
  for (const outcome of ['rejected', 'allowed-once']) f.request(undefined, outcome, 'approval/request')
  await tick()
  for (const outcome of ['rejected', 'allowed-once']) await f.adapter.respond({ type: 'client-response', rpcId: outcome, result: { ok: true, value: { outcome } } })
  assert.deepEqual(f.responses.map(r => r.outcome), [{ kind: 'result', value: 'rejected' }, { kind: 'result', value: 'allowed-once' }])
  assert.equal(f.calls.length, 0)
})

test('official continued/settled projection remains full and independent; metadata never fabricates late support', async t => {
  const f = fixture(t), value = { active: [{ callId: 'call', state: 'continued', questions }], settled: [] }
  f.sources.get('session/control').push({ type: 'projection', sessionId: 'session', key: 'userQuestions', seq: 20, value }); await tick()
  assert.deepEqual(f.peer.frames.find(frame => frame.payload.key === 'userQuestions').payload,
    { type: 'session/projection', sessionId: 'session', key: 'userQuestions', seq: 20, value })
  assert.equal(requested(f).length, 0); assert.equal(f.calls.length, 0)
})
