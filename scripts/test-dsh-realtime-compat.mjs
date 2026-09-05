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
  async invoke() {},
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
const adapter = new DshRealtimeCompatibility({ get(key) {
  if (key === 'typertGateway') return gateway
  if (key === 'connection') return { createSharedFetchHandler() { return {
    async fetch(request) {
      responses.push((await request.json()).payload.args)
      return Response.json({ result: { ok: true } })
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
await until(() => sources.some(value => value.args.request?.address.sessionId === 'session-0' && value.signal.aborted))
await new Promise(resolve => setTimeout(resolve, 20))
assert.deepEqual(firstMux.closes, [], 'evicting a Session must not close the node connection')
assert.deepEqual(secondMux.closes, [])
assert.equal(sources.filter(value => value.method === 'follow' && value.namespace === 'session' && !value.signal.aborted).length, 128)

const pending = { type: 'waterfall', event: 'approval/request', eventId: 'approval-1', agentId: 'session-64', request: { callId: 'call-1', toolName: 'write', reason: 'change file' } }
remoteSources[0].stream.push(pending)
await until(() => secondMux.messages.some(frame => frame.rpcId === 'approval-1'))
assert.equal(firstMux.messages.filter(frame => frame.rpcId === 'approval-1').length, 1)
assert.equal((await adapter.respond({ type: 'client-response', rpcId: 'approval-1', result: { ok: true, value: { outcome: 'allow-once' } } })).accepted, true)
assert.deepEqual(responses[0].outcome, { kind: 'result', value: 'allow-once' })
remoteSources[0].stream.push({ type: 'cancel', eventId: 'approval-1' })
await until(() => secondMux.messages.some(frame => frame.payload.type === 'approval/resolved'))
assert.equal((await adapter.respond({ type: 'client-response', rpcId: 'approval-1', result: { ok: true } })).accepted, false)

detachFirst()
assert.equal(remoteSources.length, 2, 'another client takes over when the upstream owner disconnects')
remoteSources[1].stream.push({ type: 'emit', event: 'api-session/status', args: ['session-1', false] })
await until(() => host.messages.filter(frame => frame.payload.type === 'host/session-status').length === 2)
assert.deepEqual(secondMux.closes, [])
adapter.dispose()
assert.equal(sources.every(value => value.signal.aborted), true)
console.log('DSH realtime compatibility tests passed')
