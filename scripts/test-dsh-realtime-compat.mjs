import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import { DshRealtimeCompatibility, legacyHostPayload } from '../lib/dsh-realtime-compat.js'

assert.deepEqual(legacyHostPayload({
  type: 'emit', event: 'api-session/status', args: ['s1', true],
}), { type: 'host/session-status', sessionId: 's1', running: true })

assert.deepEqual(legacyHostPayload({
  type: 'emit', event: 'api-session/error', args: ['s1', 'provider failed'],
}), { type: 'host/agent-error', sessionId: 's1', message: 'provider failed' })

assert.deepEqual(legacyHostPayload({
  type: 'emit', event: 'commands/change', args: [],
}), { type: 'host/remote-event', event: 'commands/change', args: [] })

assert.equal(legacyHostPayload({
  type: 'emit', event: 'credentials/reference-updated', args: ['hidden'],
}), null)

const sources = []
const remoteSources = []
function source(signal) {
  const stream = new Readable({ objectMode: true, read() {} })
  stream.on('error', () => {})
  const abort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  stream.once('close', () => signal.removeEventListener('abort', abort))
  return stream
}
const gateway = {
  async invoke({ namespace, method, args }) {
    if (namespace === 'subagents') return { entries: [{ id: 'child', kind: 'child', mode: 'one-shot' }] }
    return { items: [...Array.from({ length: 65 }, (_, i) => ({ sessionId: `session-${i}` })),
      { sessionId: 'child', origin: 'subagent', parentSessionId: 'session-64' }] }
  },
  async stream({ namespace, method, args, signal }) {
    const stream = source(signal)
    sources.push({ namespace, method, args, signal, stream })
    if (method === 'follow' && namespace === 'session') {
      stream.push({ type: 'snapshot', cursor: 1, records: [] })
    }
    return stream
  },
  wireStream: { async open(_endpoint, _payload, signal) {
    const stream = source(signal)
    const clientId = `source-${remoteSources.length + 1}`
    remoteSources.push({ stream, clientId })
    stream.push({ type: 'ready', clientId })
    return stream
  } },
}
const responses = []
let handleResponse = async () => Response.json({ result: { ok: true } })
const adapter = new DshRealtimeCompatibility({ get(key) {
  if (key === 'typertGateway') return gateway
  if (key === 'connection') return { createSharedFetchHandler() { return {
    async fetch(request) {
      responses.push((await request.json()).payload.args)
      return handleResponse()
    },
  } } }
} })
function peer() {
  return {
    readyState: 1, bufferedAmount: 0, messages: [], closes: [],
    send(message) { this.messages.push(JSON.parse(message)) },
    close(code, reason) { this.readyState = 3; this.closes.push({ code, reason }) },
  }
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('realtime condition did not become true')
}
const firstMux = peer()
const secondMux = peer()
const host = peer()
const detachFirst = adapter.connect('/api/events.mux', firstMux)
adapter.connect('/api/events.mux', secondMux)
adapter.connect('/api/events.host', host)
assert.equal(remoteSources.length, 1, 'node notifications must have one upstream source')
remoteSources[0].stream.push({ type: 'emit', event: 'api-session/status', args: ['session-1', true] })
await until(() => host.messages.length > 0)
assert.equal(host.messages.filter(frame => frame.payload.type === 'host/session-status').length, 1)

for (let i = 0; i < 65; i++) adapter.subscribeSession(`session-${i}`)
await until(() => sources.filter(value => value.method === 'follow' && value.namespace === 'session' && !value.signal.aborted).length === 128)
await new Promise(resolve => setTimeout(resolve, 20))
assert.deepEqual(firstMux.closes, [], 'evicting a Session must not close the node connection')
assert.deepEqual(secondMux.closes, [])
assert.equal(sources.filter(value => value.method === 'follow' && value.namespace === 'session' && !value.signal.aborted).length, 128)

// Settled and interrupted messages must use the same visible projection as
// history. Retained samples never duplicate content or occupy the live wire.
const sessionFeed = sources.find(value => value.method === 'follow' && value.namespace === 'session'
  && value.args.request.address?.sessionId === 'session-64')
assert(sessionFeed)
const reply = { seq: 2, type: 'assistant/message', data: { turn: 1, step: 1,
  message: { id: 'reply', role: 'assistant', content: [{ type: 'text', text: '短回复' }] },
  stream: [{ type: 'text-chunks', index: 0, texts: Array(10000).fill('x') }],
} }
sessionFeed.stream.push({ type: 'event', event: reply })
await until(() => firstMux.messages.some(frame => frame.payload.event?.seq === 2))
const deliveredReply = firstMux.messages.find(frame => frame.payload.event?.seq === 2).payload
assert.equal(deliveredReply.event.data.stream, undefined)
assert.deepEqual(deliveredReply.event.data.message, reply.data.message)
assert.equal(reply.data.stream[0].texts.length, 10000)
sessionFeed.stream.push({ type: 'event', event: { seq: 3, type: 'assistant/attempt', data: { turn: 1, step: 2,
  stream: [{ type: 'text-chunks', index: 0, texts: ['未完成的回复'] }],
} } })
await until(() => firstMux.messages.some(frame => frame.payload.event?.seq === 3))
const deliveredAttempt = firstMux.messages.find(frame => frame.payload.event?.seq === 3).payload
assert.equal(deliveredAttempt.event.data.stream, undefined)
assert.equal(deliveredAttempt.view.agentTranscript.message.content[0].text, '未完成的回复')

const pending = { type: 'waterfall', event: 'approval/request', eventId: 'approval-1', agentId: 'session-64', request: { callId: 'call-1', toolName: 'write', reason: 'change file' } }
remoteSources[0].stream.push(pending)
await until(() => secondMux.messages.some(frame => frame.rpcId === 'approval-1'))
assert.equal(firstMux.messages.filter(frame => frame.rpcId === 'approval-1').length, 1)
assert.equal((await adapter.respond({ type: 'client-response', rpcId: 'approval-1', result: { ok: true, value: { outcome: 'allowed-once' } } })).accepted, true)
assert.deepEqual(responses[0].outcome, { kind: 'result', value: 'allowed-once' })
// Real Gateway does NOT send cancel back to the responding client.
await until(() => secondMux.messages.some(frame => frame.payload.type === 'approval/resolved'))
assert(firstMux.messages.some(frame => frame.payload.type === 'approval/resolved'))
assert.equal((await adapter.respond({ type: 'client-response', rpcId: 'approval-1', result: { ok: true } })).accepted, false)

const questions = [{ id: 'q', question: 'Choose?', options: [{ label: 'A' }] }]
const questionFrame = id => ({ type: 'waterfall', event: 'user-questions/request', eventId: id,
  agentId: 'session-64', request: { questions } })
const answer = id => ({ type: 'client-response', rpcId: id,
  result: { ok: true, value: { sessionId: 'session-64', answer: { answers: [{ id: 'q', selected: ['A'] }] } } } })
remoteSources[0].stream.push(questionFrame('question-1'))
await until(() => firstMux.messages.some(f => f.rpcId === 'question-1'))
handleResponse = async () => Response.json({ result: { ok: false, error: { message: 'retryable' } } })
assert.equal((await adapter.respond(answer('question-1'))).accepted, false)
assert(!firstMux.messages.some(f => f.rpcId === 'question-1' && f.payload.type === 'question/resolved'))
let finishResponse
handleResponse = () => new Promise(resolve => { finishResponse = resolve })
const responding = adapter.respond(answer('question-1'))
await until(() => !!finishResponse)
const sentBeforeDuplicate = responses.length
assert.equal((await adapter.respond(answer('question-1'))).accepted, false)
assert.equal(responses.length, sentBeforeDuplicate, 'never deliver two competing answers')
finishResponse(Response.json({ result: { ok: true } }))
assert.equal((await responding).accepted, true)
assert(firstMux.messages.some(f => f.payload.questionRpcId === 'question-1' && f.payload.type === 'question/resolved'))
assert(secondMux.messages.some(f => f.payload.questionRpcId === 'question-1' && f.payload.type === 'question/resolved'))
assert.deepEqual(responses.at(-1).outcome, { kind: 'result', value: { answers: [{ id: 'q', selected: ['A'] }] } })

handleResponse = async () => Response.json({ result: { ok: true } })
remoteSources[0].stream.push(questionFrame('question-cancel'))
await until(() => firstMux.messages.some(f => f.rpcId === 'question-cancel'))
assert.equal((await adapter.respond({ type: 'client-response', rpcId: 'question-cancel',
  result: { ok: false, error: { code: 'ASK_CANCELLED', message: 'cancelled by user' } } })).accepted, true)
assert.equal(responses.at(-1).outcome.kind, 'rejected')
assert(firstMux.messages.some(f => f.payload.questionRpcId === 'question-cancel' && f.payload.type === 'question/resolved'))

remoteSources[0].stream.push(questionFrame('question-other-client'))
await until(() => firstMux.messages.some(f => f.rpcId === 'question-other-client'))
remoteSources[0].stream.push({ type: 'cancel', eventId: 'question-other-client' })
await until(() => firstMux.messages.some(f => f.payload.questionRpcId === 'question-other-client'))
assert.equal((await adapter.respond(answer('question-other-client'))).accepted, false)
const probe = peer()
const detachProbe = adapter.connect('/api/events.mux', probe)
assert(!probe.messages.some(f => /^(question|approval)\/requested$/.test(f.payload.type)),
  'settled deliveries must not be replayed on reconnect')
detachProbe()

remoteSources[0].stream.push(questionFrame('question-owner-change'))
await until(() => firstMux.messages.some(f => f.rpcId === 'question-owner-change'))
finishResponse = null
handleResponse = () => new Promise(resolve => { finishResponse = resolve })
const oldOwnerResponse = adapter.respond(answer('question-owner-change'))
await until(() => !!finishResponse)

detachFirst()
assert.equal(remoteSources.length, 2, 'another client takes over when the upstream owner disconnects')
remoteSources[1].stream.push(questionFrame('question-owner-change'))
await until(() => secondMux.messages.filter(f => f.rpcId === 'question-owner-change' && f.payload.type === 'question/requested').length === 2)
finishResponse(Response.json({ result: { ok: true } }))
await oldOwnerResponse
assert(!secondMux.messages.some(f => f.rpcId === 'question-owner-change' && f.payload.type === 'question/resolved'),
  'a receipt from a detached delivery cannot settle a replacement delivery')
handleResponse = async () => Response.json({ result: { ok: true } })
assert.equal((await adapter.respond(answer('question-owner-change'))).accepted, true)
remoteSources[1].stream.push({ type: 'emit', event: 'api-session/status', args: ['session-1', false] })
await until(() => host.messages.filter(frame => frame.payload.type === 'host/session-status').length === 2)
assert.deepEqual(secondMux.closes, [])
adapter.subscribeSession('child')
await until(() => sources.some(value => value.args.request?.address.childSessionId === 'child'))
const childSource = sources.find(value => value.args.request?.address.childSessionId === 'child')
assert.deepEqual(childSource.args.request.address, { kind: 'subagent', parentSessionId: 'session-64', childSessionId: 'child', mode: 'one-shot' })
childSource.stream.push({ type: 'event', event: { type: 'turn/end', seq: 2, data: {} } })
await until(() => secondMux.messages.some(frame => frame.payload.sessionId === 'child' && frame.payload.type === 'session/event'))
adapter.subscribeSession('deleted')
await until(() => secondMux.messages.some(frame => frame.payload.sessionId === 'deleted' && frame.payload.type === 'host/agent-error'))
assert.deepEqual(secondMux.closes, [], 'a missing child/session must not disconnect other Sessions')
const reconnected = peer()
adapter.connect('/api/events.mux', reconnected)
await until(() => reconnected.messages.some(frame => frame.payload.type === 'session/subscribed' && frame.payload.sessionId === 'child'))
assert(!reconnected.messages.some(frame => frame.payload.sessionId === 'deleted'), 'reconnection must not resurrect a failed subscription')
adapter.dispose()
assert.equal(sources.every(value => value.signal.aborted), true)
console.log('DSH realtime compatibility tests passed')
