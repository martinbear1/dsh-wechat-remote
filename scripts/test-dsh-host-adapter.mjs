import assert from 'node:assert/strict'
import path from 'node:path'

import { DshHostAdapterRuntime } from '../lib/dsh-host-adapter.js'
import { DshTunnelAgent } from '../lib/dsh-tunnel-agent.js'
import { dshDataHome, profileDataRoot } from '../lib/storage-paths.js'

const calls = []
const connection = {
  fetch: { register() {} },
  requestRejection() { throw new Error('browser authentication must not run in the trusted adapter') },
  createSharedFetchHandler(channel) {
    assert.equal(channel, '/api')
    return {
      async fetch(request) {
        const body = await request.json()
        calls.push({ path: new URL(request.url).pathname, body })
        const endpoint = new URL(request.url).pathname.slice('/api/'.length)
        let value = { acknowledged: true }
        if (endpoint === 'session/list') value = { items: [{ sessionId: 's1', running: false, blank: false }] }
        if (endpoint === '$events/result') value = { accepted: true }
        return Response.json({
          type: 'server-response', rpcId: body.rpcId,
          result: { ok: true, value },
        })
      },
    }
  },
}

const streams = {
  'workspace/follow': [{ type: 'baseline', value: { items: [], archivedSessionIds: [] } }],
  'session/follow': [{
    type: 'snapshot', cursor: 6, hasMore: false,
    records: [
      {
        type: 'event',
        event: { type: 'user/message', seq: 4, time: 1, data: {} },
        view: { view: { card: 'diff', diffs: [{ path: 'generated.txt' }] } },
      },
      {
        type: 'event',
        event: {
          type: 'tool/call', seq: 5, time: 2,
          data: {
            callId: 'write-history', name: 'write',
            arguments: JSON.stringify({ file_path: 'history.txt', content: 'done' }),
          },
        },
      },
      {
        type: 'event',
        event: {
          type: 'tool/result', seq: 6, time: 3,
          data: {
            message: {
              source: { callId: 'write-history' },
              content: [{ type: 'tool-result', toolCallId: 'write-history', isError: false }],
            },
          },
        },
      },
    ],
    projections: { values: {} },
  }, {
    type: 'event',
    event: {
      type: 'tool/call', seq: 7, time: 4,
      data: {
        callId: 'write-live', name: 'write',
        arguments: JSON.stringify({ file_path: 'live.txt', content: 'done' }),
      },
    },
  }, {
    type: 'event',
    event: {
      type: 'tool/result', seq: 8, time: 5,
      data: {
        message: {
          source: { callId: 'write-live' },
          content: [{ type: 'tool-result', toolCallId: 'write-live', isError: false }],
        },
      },
    },
  }],
  'session/control': [],
  '$events': [],
}
const gateway = {
  wireStream: {
    async *open(endpoint, _payload, signal) {
      yield* (streams[endpoint] || [])
      await waitForAbort(signal)
    },
  },
  async invoke({ namespace, method }) {
    if (`${namespace}/${method}` === 'session/list') {
      return { items: [{ sessionId: 's1', running: false, blank: false }] }
    }
    return {}
  },
}

function waitForAbort(signal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
}

class ControlledStream {
  constructor() {
    this.values = []
    this.waiters = new Set()
    this.failure = null
    this.ended = false
    this.openCount = 0
  }

  push(value) {
    this.values.push(value)
    this.wake()
  }

  fail(error) {
    this.failure = error
    this.wake()
  }

  end() {
    this.ended = true
    this.wake()
  }

  wake() {
    for (const waiter of this.waiters) waiter()
    this.waiters.clear()
  }

  async *iterate(signal) {
    this.openCount += 1
    const abort = () => this.wake()
    signal.addEventListener('abort', abort)
    try {
      while (!signal.aborted) {
        if (this.failure) throw this.failure
        if (this.ended) return
        if (this.values.length) {
          yield this.values.shift()
          continue
        }
        await new Promise(resolve => this.waiters.add(resolve))
      }
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
}
const ctx = {
  inject(_services, callback) { return callback({ connection, typertGateway: gateway }) },
}
const adapter = new DshHostAdapterRuntime(ctx)
assert.equal(adapter.mode, 'modern')
assert.deepEqual((await adapter.call('session.list', {}, new AbortController().signal)).value.items[0], {
  sessionId: 's1', running: false, blank: false,
})
assert.equal(calls[0].path, '/api/session/list')
assert.deepEqual(calls[0].body.payload, { args: { _request: {} } })
assert.deepEqual((await adapter.call('workspace.list', {}, new AbortController().signal)).value, {
  items: [], archivedSessionIds: [],
})
const history = await adapter.call('session.history', {
  sessionId: 's1', maxMessages: 8,
}, new AbortController().signal)
assert.equal(history.value.events.length, 3)
assert.deepEqual(history.value.events[0].view, {
  view: { card: 'diff', diffs: [{ path: 'generated.txt' }] },
})
assert.deepEqual(history.value.events[2].view, {
  view: { card: 'diff', diffs: [{ path: 'history.txt' }] },
})
const realtimeAbort = new AbortController()
const realtime = adapter.events('/api/events.mux', realtimeAbort.signal)[Symbol.asyncIterator]()
const subscribed = JSON.parse(new TextDecoder().decode((await realtime.next()).value))
const realtimeCall = JSON.parse(new TextDecoder().decode((await realtime.next()).value))
const realtimeEvent = JSON.parse(new TextDecoder().decode((await realtime.next()).value))
assert.equal(subscribed.payload.type, 'session/subscribed')
assert.equal(realtimeCall.payload.event.type, 'tool/call')
assert.deepEqual(realtimeEvent.payload.view, {
  view: { card: 'diff', diffs: [{ path: 'live.txt' }] },
})
realtimeAbort.abort()
await adapter.call('agentPreset.select', {
  sessionId: 's1', agentPreset: 'standard',
}, new AbortController().signal)
assert.equal(calls.at(-1).path, '/api/agentPresets/select')
assert.deepEqual(calls.at(-1).body.payload, {
  args: { agentId: 's1', agentPreset: 'standard' },
})
await adapter.call('goal.edit', {
  sessionId: 's1', ref: { id: 'goal-1', revision: 2 }, objective: 'ship it',
}, new AbortController().signal)
assert.equal(calls.at(-1).path, '/api/goals/edit')
assert.deepEqual(calls.at(-1).body.payload, {
  args: {
    agentId: 's1', ref: { id: 'goal-1', revision: 2 },
    request: { objective: 'ship it' },
  },
})
adapter.dispose()

// Every downstream mux socket is its own client generation. A second healthy
// subscriber and a later reconnect must receive the cached authoritative
// baseline without duplicating replay frames into the first subscriber.
const replayStreams = {
  'workspace/follow': new ControlledStream(),
  'session/control': new ControlledStream(),
  '$events': new ControlledStream(),
  'session/follow': new ControlledStream(),
}
let eventResultCalls = 0
let releaseEventResult
const eventResultGate = new Promise(resolve => { releaseEventResult = resolve })
const replayConnection = {
  fetch: { register() {} },
  requestRejection() {},
  createSharedFetchHandler() {
    return {
      async fetch(request) {
        const body = await request.json()
        const endpoint = new URL(request.url).pathname.slice('/api/'.length)
        if (endpoint === '$events/result') {
          eventResultCalls += 1
          await eventResultGate
        }
        return Response.json({
          type: 'server-response', rpcId: body.rpcId,
          result: { ok: true, value: { accepted: true } },
        })
      },
    }
  },
}
const replayGateway = {
  wireStream: {
    open(endpoint, _payload, signal) {
      const stream = replayStreams[endpoint]
      if (!stream) throw new Error(`unexpected replay stream ${endpoint}`)
      return stream.iterate(signal)
    },
  },
  async invoke({ namespace, method }) {
    if (`${namespace}/${method}` === 'session/list') {
      return { items: [{ sessionId: 's-replay', running: true, blank: false }] }
    }
    return {}
  },
}
const replayCtx = {
  inject(_services, callback) {
    return callback({ connection: replayConnection, typertGateway: replayGateway })
  },
}
const replayAdapter = new DshHostAdapterRuntime(replayCtx)
const firstMux = openFrames(replayAdapter, '/api/events.mux')
await waitUntil(() => replayStreams['session/follow'].openCount === 1
  && replayStreams['session/control'].openCount === 1
  && replayStreams.$events.openCount === 1)
replayStreams['session/follow'].push({
  type: 'snapshot', cursor: 12, hasMore: false, records: [], projections: { values: {} },
})
replayStreams['session/control'].push({
  type: 'baseline',
  value: {
    queues: {
      's-replay': [{
        id: 'queue-1', placement: 'queued',
        message: { role: 'user', content: [{ type: 'text', text: 'later' }] },
      }],
    },
    jobs: {},
    projections: {
      's-replay': { asOfSeq: 12, values: { permissions: { options: [], currentValue: 'default' } } },
    },
  },
})
replayStreams.$events.push({ type: 'ready', clientId: 'modern-client-1' })
replayStreams.$events.push({
  type: 'waterfall', clientId: 'modern-client-1', eventId: 'approval-event-1',
  event: 'approval/request', agentId: 's-replay',
  request: { toolName: 'write', reason: 'modify a file' },
})
replayStreams.$events.push({
  type: 'waterfall', clientId: 'modern-client-1', eventId: 'question-event-1',
  event: 'user-questions/request', agentId: 's-replay',
  request: { questions: [{ id: 'q1', question: 'Continue?' }] },
})
const firstBaseline = await collectFrameTypes(firstMux.iterator, new Set([
  'session/subscribed', 'session/queue', 'session/projection',
  'approval/requested', 'question/requested',
]))
assert.equal(firstBaseline.get('session/subscribed').payload.lastSeq, 12)
assert.equal(firstBaseline.get('approval/requested').rpcId, 'approval-event-1')
assert.equal(firstBaseline.get('question/requested').rpcId, 'question-event-1')

const secondMux = openFrames(replayAdapter, '/api/events.mux')
const secondBaseline = await collectFrameTypes(secondMux.iterator, new Set([
  'session/subscribed', 'session/queue', 'session/projection',
  'approval/requested', 'question/requested',
]))
assert.equal(secondBaseline.get('session/queue').payload.items[0].id, 'queue-1')
assert.equal(secondBaseline.get('session/projection').payload.seq, 12)
assert.equal(secondBaseline.get('approval/requested').rpcId, 'approval-event-1')
assert.equal(secondBaseline.get('question/requested').rpcId, 'question-event-1')
assert.equal(await hasFrameWithin(firstMux.iterator, 30), false,
  'targeted replay must not duplicate frames into an existing subscriber')

firstMux.abort.abort()
secondMux.abort.abort()
const reconnectMux = openFrames(replayAdapter, '/api/events.mux')
const reconnectBaseline = await collectFrameTypes(reconnectMux.iterator, new Set([
  'session/subscribed', 'session/queue', 'session/projection',
  'approval/requested', 'question/requested',
]))
assert.equal(reconnectBaseline.get('session/subscribed').payload.lastSeq, 12)
assert.equal(reconnectBaseline.get('approval/requested').rpcId, 'approval-event-1')

const firstResponse = postRespond(replayAdapter, 'approval-event-1', {
  ok: true,
  value: { sessionId: 's-replay', approvalId: 'approval-event-1', outcome: 'allowed-once' },
})
await waitUntil(() => eventResultCalls === 1)
const duplicateResponse = await postRespond(replayAdapter, 'approval-event-1', {
  ok: true,
  value: { sessionId: 's-replay', approvalId: 'approval-event-1', outcome: 'allowed-once' },
})
assert.deepEqual(duplicateResponse, { accepted: false, reason: 'response-in-flight' })
assert.equal(eventResultCalls, 1, 'same rpcId must reach modern DSH at most once concurrently')
releaseEventResult()
assert.deepEqual(await firstResponse, { accepted: true })
assert.equal((await nextFrame(reconnectMux.iterator,
  frame => frame.payload?.type === 'approval/resolved')).payload.approvalId, 'approval-event-1')
assert.deepEqual(await postRespond(replayAdapter, 'approval-event-1', {
  ok: true, value: { outcome: 'allowed-once' },
}), { accepted: false, reason: 'unknown-rpc-id' })
replayStreams.$events.push({ type: 'cancel', eventId: 'question-event-1' })
assert.equal((await nextFrame(reconnectMux.iterator,
  frame => frame.payload?.type === 'question/resolved')).payload.questionRpcId, 'question-event-1')
reconnectMux.abort.abort()
replayAdapter.dispose()

// One failed modern source invalidates the entire upstream generation. The
// same downstream subscriber stays connected while all roots reopen after the
// bounded retry and publish fresh authoritative baselines.
const faultStreams = new Map()
const faultOpenCounts = Object.create(null)
const faultGateway = {
  wireStream: {
    open(endpoint, _payload, signal) {
      const count = (faultOpenCounts[endpoint] || 0) + 1
      faultOpenCounts[endpoint] = count
      const stream = new ControlledStream()
      const rows = faultStreams.get(endpoint) || []
      rows.push(stream)
      faultStreams.set(endpoint, rows)
      queueMicrotask(() => {
        if (endpoint === 'workspace/follow') {
          stream.push({ type: 'baseline', value: { items: [], archivedSessionIds: [] } })
        } else if (endpoint === 'session/control') {
          stream.push({
            type: 'baseline',
            value: {
              queues: {
                's-fault': [{
                  id: `queue-generation-${count}`, placement: 'queued',
                  message: { role: 'user', content: [{ type: 'text', text: `generation ${count}` }] },
                }],
              },
              jobs: {}, projections: {},
            },
          })
        } else if (endpoint === '$events') {
          stream.push({ type: 'ready', clientId: `fault-client-${count}` })
        } else if (endpoint === 'session/follow') {
          stream.push({
            type: 'snapshot', cursor: count * 10, hasMore: false,
            records: [], projections: { values: {} },
          })
        }
      })
      return stream.iterate(signal)
    },
  },
  async invoke({ namespace, method }) {
    if (`${namespace}/${method}` === 'session/list') {
      return { items: [{ sessionId: 's-fault', running: false, blank: false }] }
    }
    return {}
  },
}
const faultCtx = {
  inject(_services, callback) {
    return callback({ connection: replayConnection, typertGateway: faultGateway })
  },
}
const faultAdapter = new DshHostAdapterRuntime(faultCtx)
const faultMux = openFrames(faultAdapter, '/api/events.mux')
const faultInitial = await collectFrameTypes(faultMux.iterator,
  new Set(['session/subscribed', 'session/queue']))
assert.equal(faultInitial.get('session/subscribed').payload.lastSeq, 10)
assert.equal(faultInitial.get('session/queue').payload.items[0].id, 'queue-generation-1')
faultStreams.get('session/control')[0].fail(new Error('controlled session/control failure'))
await waitUntil(() => (faultOpenCounts['session/control'] || 0) >= 2, 2_000)
for (const endpoint of ['$events', 'workspace/follow', 'session/control', 'session/follow']) {
  assert.ok(faultOpenCounts[endpoint] >= 2, `${endpoint} must reopen as one fresh generation`)
}
const faultRecovered = await collectFrames(faultMux.iterator, [
  frame => frame.payload?.type === 'session/subscribed' && frame.payload.lastSeq === 20,
  frame => frame.payload?.type === 'session/queue'
    && frame.payload.items?.[0]?.id === 'queue-generation-2',
])
assert.equal(faultRecovered.length, 2)
faultStreams.get('workspace/follow')[1].end()
await waitUntil(() => (faultOpenCounts['workspace/follow'] || 0) >= 3, 2_000)
faultStreams.get('$events')[2].end()
await waitUntil(() => (faultOpenCounts.$events || 0) >= 4, 2_500)
faultStreams.get('session/follow')[3].end()
await waitUntil(() => (faultOpenCounts['session/follow'] || 0) >= 5, 3_500)
for (const endpoint of ['$events', 'workspace/follow', 'session/control', 'session/follow']) {
  assert.ok(faultOpenCounts[endpoint] >= 5,
    `${endpoint} must reopen when any root or followed Session stream ends`)
}
const finalRecovery = await collectFrames(faultMux.iterator, [
  frame => frame.payload?.type === 'session/subscribed' && frame.payload.lastSeq === 50,
  frame => frame.payload?.type === 'session/queue'
    && frame.payload.items?.[0]?.id === 'queue-generation-5',
])
assert.equal(finalRecovery.length, 2)
faultMux.abort.abort()
faultAdapter.dispose()

function tunnelFrame(type, streamId, payload = new Uint8Array(), flags = 0) {
  const out = new Uint8Array(8 + payload.length)
  out[0] = 1
  out[1] = type
  new DataView(out.buffer).setUint32(2, streamId)
  out[6] = flags
  out.set(payload, 8)
  return out
}
const encoded = value => new TextEncoder().encode(JSON.stringify(value))
const sent = []
let trustedFetches = 0
const tunnel = new DshTunnelAgent({
  send: frame => { sent.push(new Uint8Array(frame)) },
  fetchDsh: async request => {
    trustedFetches += 1
    assert.equal(request.path, '/api/session.list')
    return Response.json({ result: { ok: true, value: { items: [] } } })
  },
  openDshEvents: async function *(_path, signal) {
    signal.throwIfAborted()
    yield encoded({ rpcId: 'push-1', payload: { type: 'host/session-status', sessionId: 's1', running: true } })
  },
})
tunnel.receive(tunnelFrame(1, 1, encoded({ kind: 'http', path: '/api/session.list', method: 'POST' })))
tunnel.receive(tunnelFrame(3, 1, encoded({ type: 'client-request' }), 2))
tunnel.receive(tunnelFrame(4, 1))
await new Promise(resolve => setTimeout(resolve, 20))
assert.equal(trustedFetches, 1)
assert.ok(sent.some(frame => frame[1] === 2), 'adapter HTTP must accept')
assert.ok(sent.some(frame => frame[1] === 4), 'adapter HTTP must end')
sent.length = 0
tunnel.receive(tunnelFrame(1, 3, encoded({ kind: 'websocket', path: '/api/events.host', headers: {} })))
await new Promise(resolve => setTimeout(resolve, 20))
assert.ok(sent.some(frame => frame[1] === 3), 'adapter realtime must emit data')
tunnel.close()

const promptFrames = []
let promptFetches = 0
const promptTunnel = new DshTunnelAgent({
  send: frame => { promptFrames.push(new Uint8Array(frame)) },
  materializeAttachment: async () => ({
    descriptor: { mediaType: 'image/png', name: 'sample.png' },
    data: new Uint8Array([1, 2, 3]),
  }),
  fetchDsh: async request => {
    promptFetches += 1
    assert.equal(request.path, '/api/session.prompt')
    const envelope = JSON.parse(new TextDecoder().decode(request.body))
    assert.equal(envelope.payload.content[0].type, 'image')
    assert.equal(envelope.payload.content[0].data, 'AQID')
    return Response.json({
      type: 'server-response', rpcId: envelope.rpcId,
      result: { ok: true, value: { accepted: true } },
    })
  },
})
promptTunnel.receive(tunnelFrame(1, 5, encoded({
  kind: 'http', path: '/api/wechat-remote/session.prompt', method: 'POST',
})))
promptTunnel.receive(tunnelFrame(3, 5, encoded({
  type: 'client-request', rpcId: 'image-prompt', method: 'session.prompt',
  payload: {
    sessionId: 's1', mode: 'queue',
    content: [{ type: 'image', remoteAttachment: { objectId: 'encrypted-object' } }],
  },
}), 2))
promptTunnel.receive(tunnelFrame(4, 5))
await new Promise(resolve => setTimeout(resolve, 30))
assert.equal(promptFetches, 1, 'materialized image prompt must reach the selected DSH adapter')
assert.ok(promptFrames.some(frame => frame[1] === 2), 'image prompt adapter must accept')
assert.ok(promptFrames.some(frame => frame[1] === 4), 'image prompt adapter must end')
assert.ok(!promptFrames.some(frame => frame[1] === 5), 'image prompt adapter must not fail')
promptTunnel.close()

assert.equal(dshDataHome({ DSH_HOME: path.join('tmp', 'isolated') }), path.resolve('tmp', 'isolated'))
const previous = process.env.DSH_HOME
process.env.DSH_HOME = path.join(process.cwd(), '.tmp-dsh-home')
assert.ok(profileDataRoot('research').startsWith(path.resolve(process.env.DSH_HOME)))
if (previous === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = previous

function openFrames(adapter, eventPath) {
  const abort = new AbortController()
  return {
    abort,
    iterator: adapter.events(eventPath, abort.signal)[Symbol.asyncIterator](),
  }
}

function decodeFrame(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function nextFrame(iterator, predicate = () => true, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now())
    const row = await Promise.race([
      iterator.next(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('frame timeout')), remaining)),
    ])
    if (row.done) throw new Error('frame stream ended')
    const frame = decodeFrame(row.value)
    if (predicate(frame)) return frame
  }
  throw new Error('frame timeout')
}

async function collectFrameTypes(iterator, types) {
  const found = new Map()
  const deadline = Date.now() + 1_500
  while (found.size < types.size) {
    const frame = await nextFrame(iterator, () => true, Math.max(1, deadline - Date.now()))
    const type = frame.payload?.type
    if (types.has(type) && !found.has(type)) found.set(type, frame)
  }
  return found
}

async function collectFrames(iterator, predicates) {
  const remaining = predicates.slice()
  const found = []
  const deadline = Date.now() + 2_000
  while (remaining.length) {
    const frame = await nextFrame(iterator, () => true, Math.max(1, deadline - Date.now()))
    const index = remaining.findIndex(predicate => predicate(frame))
    if (index < 0) continue
    found.push(frame)
    remaining.splice(index, 1)
  }
  return found
}

async function hasFrameWithin(iterator, timeoutMs) {
  return await Promise.race([
    iterator.next().then(row => !row.done),
    new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

async function waitUntil(predicate, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('condition timeout')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function postRespond(adapter, rpcId, result) {
  const response = await adapter.fetch({
    path: '/api/respond', method: 'POST',
    body: new TextEncoder().encode(JSON.stringify({ type: 'client-response', rpcId, result })),
  })
  return await response.json()
}

console.log('dsh host adapter tests passed')
