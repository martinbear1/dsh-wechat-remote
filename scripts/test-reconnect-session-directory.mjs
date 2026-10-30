import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'

import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'

// Exercise the real adapter entry points. Only native Gateway/Peer I/O is a
// fixture; no private research path, installed host, sockets or credentials.
const tick = () => new Promise(resolve => setImmediate(resolve))
async function until(predicate, message = 'adapter condition did not settle') {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await tick()
  }
  assert.fail(message)
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function source(signal) {
  const stream = new Readable({ objectMode: true, read() {} })
  stream.on('error', () => {})
  const abort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('source closed'))
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  stream.once('close', () => signal.removeEventListener('abort', abort))
  return stream
}

function fixture(t) {
  const lists = [], catalogsRead = [], feeds = [], remoteFeeds = [], replies = []
  const directory = new Map(), catalogs = new Map(), active = new Set(), listeners = new Set()
  let hold = false, nextError, listingOverride, rejectFollow, gatewayAvailable = true
  function add(id, fields = {}) {
    directory.set(id, { sessionId: id, origin: 'user', ...fields })
    active.add(id)
  }
  for (let i = 0; i < 70; i++) add(`s${i}`)

  const gateway = {
    async invoke({ namespace, method, args, signal }) {
      signal.throwIfAborted()
      if (namespace === 'session' && method === 'list') {
        const job = deferred()
        const listing = listingOverride === undefined ? { items: [...directory.values()].map(row => ({ ...row })) } : listingOverride
        lists.push({ ...job, signal, listing, args: structuredClone(args) })
        if (!hold) {
          if (nextError) { const error = nextError; nextError = undefined; job.reject(error) }
          else job.resolve(listing)
        }
        // A deliberately uncooperative source can reply after cancellation.
        // The adapter must fence that reply, not rely solely on transport abort.
        return job.promise
      }
      if (namespace === 'subagents' && method === 'list') {
        catalogsRead.push(args.parentSessionId)
        return { entries: structuredClone(catalogs.get(args.parentSessionId) || []) }
      }
      assert.fail(`unexpected native read ${namespace}/${method}`)
    },
    async stream({ namespace, method, args, signal }) {
      signal.throwIfAborted()
      if (namespace === 'session' && method === 'follow' && rejectFollow) rejectFollow(args.request.address)
      const stream = source(signal)
      feeds.push({ namespace, method, args, signal, stream })
      if (namespace === 'session' && method === 'follow') {
        stream.push({ type: 'snapshot', cursor: 0, records: [], assistantStream: { revision: 0 } })
      }
      return stream
    },
    wireStream: { async open(...args) {
      const signal = args.at(-1)
      const stream = source(signal)
      remoteFeeds.push(stream)
      stream.push({ type: 'ready', clientId: `source-${remoteFeeds.length}` })
      return stream
    } },
  }
  const adapter = new DshRealtimeCompatibility({
    get(key) {
      if (key === 'typertGateway') return gatewayAvailable ? gateway : undefined
      if (key === 'agents') return { get: id => active.has(id) ? {} : undefined }
      // Advertise this fixture's catalog endpoint; do not infer an installed
      // host version from the machine running the test.
      if (key === 'typert') return { local: { get: endpoint => endpoint === 'subagents/list' ? {} : undefined } }
      if (key === 'connection') return { createSharedFetchHandler() { return {
        async fetch(request) {
          replies.push((await request.json()).payload.args)
          return Response.json({ result: { ok: true } })
        },
      } } }
    },
    on(_name, listener) { listeners.add(listener); return () => listeners.delete(listener) },
  })
  function connect() {
    const messages = [], closes = []
    const socket = {
      readyState: 1, bufferedAmount: 0,
      send(raw) { messages.push(JSON.parse(raw)) },
      close(code, reason) { this.readyState = 3; closes.push({ code, reason }) },
    }
    const detach = adapter.connect('/api/events.mux', socket)
    return { messages, closes, socket, detach }
  }
  function resolveAll() { for (const request of lists) request.resolve(request.listing) }
  t.after(async () => {
    adapter.dispose()
    resolveAll()
    await tick(); await tick()
    assert.equal(listeners.size, 0, 'plugin event listeners must be disposed')
    assert(feeds.every(feed => feed.signal.aborted), 'all native stream sources must be aborted')
    assert(remoteFeeds.every(stream => stream.destroyed), 'remote event sources must be closed')
  })
  return { adapter, lists, catalogsRead, feeds, remoteFeeds, replies, directory, catalogs, active, add, connect, resolveAll,
    hold(value) { hold = value }, failNext(error) { nextError = error }, shape(value) { listingOverride = value },
    setGatewayAvailable(value) { gatewayAvailable = value },
    rejectFollowWith(fn) { rejectFollow = fn },
  }
}

const subscribed = peer => peer.messages.filter(frame => frame.payload.type === 'session/subscribed')
const follows = f => f.feeds.filter(feed => feed.namespace === 'session' && feed.method === 'follow')
const errors = peer => peer.messages.filter(frame => frame.payload.type === 'host/agent-error')

test('empty recovery with a missing native Gateway keeps asynchronous source failure', async t => {
  const f = fixture(t)
  t.mock.method(console, 'warn', () => {})
  f.setGatewayAvailable(false)
  let peer
  assert.doesNotThrow(() => { peer = f.connect() }, 'empty recovery must not add a synchronous Gateway lookup')
  await until(() => peer.closes.length === 1)
  assert.equal(peer.closes[0].code, 1011)
  assert.equal(f.lists.length, 0)
})

for (const count of [0, 1, 16, 64, 65]) {
  test(`reconnect restores ${count} remembered sessions with one directory read and unchanged retention`, async t => {
    const f = fixture(t)
    for (let i = 0; i < count; i++) f.adapter.subscribeSession(`s${i}`)
    const retained = Math.min(count, 64), peer = f.connect()
    await until(() => subscribed(peer).length === retained)
    assert.equal(f.lists.length, retained ? 1 : 0)
    if (retained) assert.deepEqual(f.lists[0].args, { _request: {} }, 'recovery uses the unchanged native directory request')
    assert.equal(follows(f).length, retained)
    assert.deepEqual(follows(f).map(feed => feed.args.request.address),
      Array.from({ length: retained }, (_, index) => ({ kind: 'session', sessionId: `s${count - retained + index}` })))
    assert.deepEqual(peer.closes, [])
  })
}

test('new explicit subscriptions read a fresh directory, including during recovery', async t => {
  const f = fixture(t)
  f.hold(true); f.adapter.subscribeSession('s0')
  const peer = f.connect(); await until(() => f.lists.length === 1)
  f.add('new'); f.adapter.subscribeSession('new')
  await until(() => f.lists.length === 2)
  f.resolveAll(); await until(() => subscribed(peer).length === 2)
  assert.deepEqual(follows(f).map(feed => feed.args.request.address.sessionId).sort(), ['new', 's0'])
  f.hold(false); f.add('later'); f.adapter.subscribeSession('later')
  await until(() => subscribed(peer).length === 3)
  assert.equal(f.lists.length, 3, 'settled recovery reads are not a cache')
})

test('each socket owns its directory read and one close cannot cancel its peer', async t => {
  const f = fixture(t)
  f.hold(true)
  for (let i = 0; i < 16; i++) f.adapter.subscribeSession(`s${i}`)
  const first = f.connect(), second = f.connect()
  await until(() => f.lists.length === 2)
  first.detach()
  assert(f.lists[0].signal.aborted); assert(!f.lists[1].signal.aborted)
  f.resolveAll(); await until(() => subscribed(second).length === 16)
  assert.equal(subscribed(first).length, 0)
  assert.equal(follows(f).length, 16)
  assert.deepEqual(second.closes, [])
})

test('overlapping native recovery rounds cannot reuse an earlier in-flight directory', async t => {
  const f = fixture(t)
  f.hold(true); f.active.delete('s1')
  f.adapter.subscribeSession('s0'); f.adapter.subscribeSession('s1')
  const peer = f.connect(); await until(() => f.lists.length === 1)
  f.active.add('s1')
  f.remoteFeeds[0].push({ type: 'emit', event: 'api-session/status', args: ['s1', true] })
  await until(() => f.lists.length === 2)
  f.lists[1].resolve(f.lists[1].listing)
  await until(() => subscribed(peer).length === 1)
  assert.equal(subscribed(peer)[0].payload.sessionId, 's1', 'the new round must not wait for the older directory')
  f.lists[0].resolve(f.lists[0].listing)
  await until(() => subscribed(peer).length === 2)
  assert.deepEqual(peer.closes, [])
})

test('a late closed-socket response cannot start follows or satisfy the next reconnect', async t => {
  const f = fixture(t)
  f.hold(true); f.adapter.subscribeSession('s0')
  const first = f.connect(); await until(() => f.lists.length === 1)
  first.detach()
  const second = f.connect(); await until(() => f.lists.length === 2)
  f.lists[0].resolve(f.lists[0].listing); await tick()
  assert.equal(follows(f).length, 0)
  assert.equal(subscribed(second).length, 0)
  f.lists[1].resolve(f.lists[1].listing)
  await until(() => subscribed(second).length === 1)
  assert.equal(subscribed(first).length, 0)
})

test('evicting one session does not cancel siblings sharing a directory read', async t => {
  const f = fixture(t)
  f.hold(true)
  for (let i = 0; i < 64; i++) f.adapter.subscribeSession(`s${i}`)
  const peer = f.connect(); await until(() => f.lists.length === 1)
  f.adapter.subscribeSession('s64'); await until(() => f.lists.length === 2)
  assert.equal(f.lists[0].signal.aborted, false)
  f.resolveAll(); await until(() => subscribed(peer).length === 64)
  assert(!follows(f).some(feed => feed.args.request.address.sessionId === 's0'))
  assert.deepEqual(peer.closes, [])
})

test('failed shared read closes only its source and a new connection can retry', async t => {
  const f = fixture(t)
  t.mock.method(console, 'warn', () => {})
  for (let i = 0; i < 16; i++) f.adapter.subscribeSession(`s${i}`)
  f.failNext(new Error('fixture transport unavailable'))
  const first = f.connect(); await until(() => first.closes.length === 1)
  assert.equal(f.lists.length, 1)
  assert.equal(follows(f).length, 0)
  const second = f.connect(); await until(() => subscribed(second).length === 16)
  assert.equal(f.lists.length, 2, 'failed flight cannot poison later recovery')
  assert.deepEqual(second.closes, [])
})

test('removed rows are not revived from the previous connection directory', async t => {
  const f = fixture(t)
  f.adapter.subscribeSession('s0'); f.adapter.subscribeSession('s1')
  const first = f.connect(); await until(() => subscribed(first).length === 2)
  first.detach(); f.directory.delete('s0')
  const second = f.connect(); await until(() => errors(second).length === 1 && subscribed(second).length === 1)
  assert.equal(f.lists.length, 2)
  assert.equal(errors(second)[0].payload.sessionId, 's0')
  assert.equal(subscribed(second)[0].payload.sessionId, 's1')
  assert.deepEqual(second.closes, [])
})

for (const [name, listing] of [
  ['invalid shape', { unexpected: [] }],
  ['duplicate identity', { items: [{ sessionId: 's0' }, { sessionId: 's0' }] }],
]) {
  test(`${name} remains a local read error, with no guessed address`, async t => {
    const f = fixture(t)
    f.shape(listing); f.adapter.subscribeSession('s0')
    const peer = f.connect(); await until(() => errors(peer).length === 1)
    assert.equal(follows(f).length, 0); assert.deepEqual(peer.closes, [])
    f.shape(undefined); f.adapter.subscribeSession('s0')
    await until(() => subscribed(peer).length === 1)
    assert.equal(f.lists.length, 2, 'an explicit retry reads the current native directory')
  })
}

test('main sessions, forks and both child modes retain original address and catalog validation', async t => {
  const f = fixture(t)
  f.add('fork', { origin: 'fork', parentSessionId: 's0' })
  for (const [id, mode] of [['one', 'one-shot'], ['continuable', 'continuable']]) {
    f.add(id, { origin: 'subagent', parentSessionId: 's0' })
    f.catalogs.set('s0', [...f.catalogs.get('s0') || [], { id, kind: 'child', mode }])
  }
  for (const id of ['s0', 'fork', 'one', 'continuable']) f.adapter.subscribeSession(id)
  const peer = f.connect(); await until(() => subscribed(peer).length === 4)
  assert.equal(f.lists.length, 1)
  assert.deepEqual(f.catalogsRead, ['s0', 's0'], 'child catalogs are NOT shared or skipped')
  assert.deepEqual(follows(f).map(feed => feed.args.request.address), [
    { kind: 'session', sessionId: 's0' }, { kind: 'session', sessionId: 'fork' },
    { kind: 'subagent', parentSessionId: 's0', childSessionId: 'one', mode: 'one-shot' },
    { kind: 'subagent', parentSessionId: 's0', childSessionId: 'continuable', mode: 'continuable' },
  ])
})

for (const reason of ['invalid-parent', 'missing-child', 'unsupported-mode']) {
  test(`${reason} does not create a child follow or disconnect a valid sibling`, async t => {
    const f = fixture(t)
    f.add('child', { origin: 'subagent', parentSessionId: reason === 'invalid-parent' ? 'child' : 's0' })
    if (reason === 'unsupported-mode') f.catalogs.set('s0', [{ id: 'child', kind: 'child', mode: 'unknown' }])
    f.adapter.subscribeSession('s0'); f.adapter.subscribeSession('child')
    const peer = f.connect(); await until(() => subscribed(peer).length === 1 && errors(peer).length === 1)
    assert.equal(follows(f).length, 1)
    assert.equal(errors(peer)[0].payload.sessionId, 'child')
    assert.deepEqual(peer.closes, [])
  })
}

test('a final native follow rejection is preserved even when directory lookup succeeded', async t => {
  const f = fixture(t)
  f.add('child', { origin: 'subagent', parentSessionId: 's0' })
  f.catalogs.set('s0', [{ id: 'child', kind: 'child', mode: 'one-shot' }])
  f.rejectFollowWith(address => {
    if (address.kind === 'subagent') throw Object.assign(new Error('native ownership changed'), { code: 'subagent/unauthorized' })
  })
  f.adapter.subscribeSession('s0'); f.adapter.subscribeSession('child')
  const peer = f.connect(); await until(() => errors(peer).length === 1 && subscribed(peer).length === 1)
  assert.equal(errors(peer)[0].payload.message, 'native ownership changed')
  assert.equal(follows(f).length, 1)
  assert.deepEqual(peer.closes, [])
})

test('inactive agents are skipped and a later native status starts one fresh recovery round', async t => {
  const f = fixture(t)
  for (let i = 0; i < 16; i++) { f.active.delete(`s${i}`); f.adapter.subscribeSession(`s${i}`) }
  const peer = f.connect(); await tick()
  assert.equal(f.lists.length, 0)
  for (let i = 0; i < 16; i++) f.active.add(`s${i}`)
  f.remoteFeeds[0].push({ type: 'emit', event: 'api-session/status', args: ['s0', true] })
  await until(() => subscribed(peer).length === 16)
  assert.equal(f.lists.length, 1)
})

test('an agent withdrawn during lookup is not followed and can recover later', async t => {
  const f = fixture(t)
  f.hold(true); f.adapter.subscribeSession('s0'); f.adapter.subscribeSession('s1')
  const peer = f.connect(); await until(() => f.lists.length === 1)
  f.active.delete('s0'); f.resolveAll(); await until(() => subscribed(peer).length === 1)
  assert.equal(subscribed(peer)[0].payload.sessionId, 's1')
  f.hold(false); f.active.add('s0')
  f.remoteFeeds[0].push({ type: 'emit', event: 'api-session/status', args: ['s0', true] })
  await until(() => subscribed(peer).length === 2)
  assert.equal(f.lists.length, 2)
})

test('recovery preserves background deltas, durable events and approval replies', async t => {
  const f = fixture(t)
  for (let i = 0; i < 16; i++) f.adapter.subscribeSession(`s${i}`)
  const peer = f.connect(); await until(() => subscribed(peer).length === 16)
  // The older background session must remain subscribed; do not optimize by
  // keeping only the most recently visited session.
  const background = follows(f).find(feed => feed.args.request.address.sessionId === 's0')
  background.stream.push({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'a', revision: 1 } })
  for (let i = 0; i < 200; i++) background.stream.push({ type: 'assistant-stream', frame: {
    type: 'chunk', attemptId: 'a', revision: i + 2, index: i, time: i * 20,
    chunk: { type: 'text-delta', index: 0, text: String(i) + ',' },
  } })
  for (let i = 0; i < 10; i++) background.stream.push({ type: 'event', event: { type: 'fixture/durable', seq: i, data: { index: i } } })
  await until(() => peer.messages.filter(frame => frame.payload.event?.type === 'assistant/chunk').length === 200
    && peer.messages.filter(frame => frame.payload.event?.type === 'fixture/durable').length === 10)
  assert.equal(peer.messages.filter(frame => frame.payload.event?.type === 'assistant/chunk')
    .map(frame => frame.payload.event.data.chunk.text).join(''), Array.from({ length: 200 }, (_, i) => `${i},`).join(''))
  assert.deepEqual(peer.messages.filter(frame => frame.payload.event?.type === 'fixture/durable')
    .map(frame => frame.payload.event.seq), Array.from({ length: 10 }, (_, i) => i))
  f.remoteFeeds[0].push({ type: 'waterfall', event: 'approval/request', eventId: 'approval-1', agentId: 's0',
    request: { callId: 'call-1', toolName: 'fixture', reason: 'fixture approval' } })
  await until(() => peer.messages.some(frame => frame.payload.type === 'approval/requested'))
  const approval = peer.messages.find(frame => frame.payload.type === 'approval/requested')
  assert.equal(approval.payload.sessionId, 's0')
  assert.equal((await f.adapter.respond({ type: 'client-response', rpcId: approval.rpcId,
    result: { ok: true, value: { outcome: 'allowed-once' } } })).accepted, true)
  await until(() => peer.messages.some(frame => frame.payload.type === 'approval/resolved'))
  assert.deepEqual(f.replies[0].outcome, { kind: 'result', value: 'allowed-once' })
  assert.equal(f.lists.length, 1, 'stream events and approvals must not trigger directory polling')
  assert.deepEqual(peer.closes, [])
})
