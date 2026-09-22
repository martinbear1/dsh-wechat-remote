import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import { DshTunnelAgent } from '../lib/dsh-tunnel-agent.js'
import { TunnelSendQueue } from '../lib/tunnel-send-queue.js'

const LIMIT = 16 * 1024 * 1024
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function until(predicate) {
  for (let i = 0; i < 2000; i++) { if (predicate()) return; await tick() }
  assert.fail('tunnel did not settle')
}
function frame(type, id, body = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + body.length)
  result[0] = 1; result[1] = type; result.writeUInt32BE(id, 2); body.copy(result, 8)
  return result
}
const json = value => Buffer.from(JSON.stringify(value))
function post(tunnel, id, path, body = Buffer.alloc(0)) {
  tunnel.receive(frame(1, id, json({ kind: 'http', method: 'POST', path })))
  if (body.length) tunnel.receive(frame(3, id, body))
  tunnel.receive(frame(4, id))
}
function prompt(images, text = 'hello') {
  return {
    type: 'client-request', rpcId: 'test-prompt', method: 'session.prompt',
    payload: { sessionId: 'test', content: [
      { type: 'text', text },
      ...images.map(objectId => ({ type: 'image', remoteAttachment: { objectId } })),
    ] },
  }
}
function fixture(options = {}) {
  const sent = [], calls = []
  const tunnel = new DshTunnelAgent({
    maxStreams: 2,
    compatibilityApi: {
      async request(value) {
        calls.push({ path: value.path, body: JSON.parse(Buffer.from(value.body).toString() || '{}') })
        return { statusCode: 200, headers: {}, body: json({ ok: true }) }
      },
    },
    async materializeAttachment({ objectId }) {
      return { descriptor: { mediaType: 'image/png', name: '图片.png' }, data: Buffer.alloc(objectId === 'large' ? 13 * 1024 * 1024 : 5) }
    },
    ...options,
    send(raw) { const b = Buffer.from(raw); sent.push({ id: b.readUInt32BE(2), type: b[1], body: b.subarray(8) }) },
  })
  return { tunnel, sent, calls }
}
async function finished(f, id, type) {
  await until(() => f.sent.some(value => value.id === id && value.type === type))
  await tick()
  assert.equal(f.tunnel.streams.size, 0, 'terminal response must release its request slot')
}

test('oversized remote images never consume slots or reach DSH; subsequent list, text and small image work', async () => {
  const f = fixture()
  try {
    for (const id of [1, 3, 5, 7]) {
      post(f.tunnel, id, '/api/wechat-remote/session.prompt', json(prompt(['large'])))
      await finished(f, id, 5)
      assert.match(f.sent.find(value => value.id === id && value.type === 5).body.toString(), /16 MiB/)
    }
    assert.equal(f.calls.length, 0, 'reject before native request dispatch')
    post(f.tunnel, 9, '/api/session.list', json({}))
    await finished(f, 9, 4)
    post(f.tunnel, 11, '/api/session.prompt', json(prompt([])))
    await finished(f, 11, 4)
    post(f.tunnel, 13, '/api/wechat-remote/session.prompt', json(prompt(['small'])))
    await finished(f, 13, 4)
    assert.equal(f.calls.length, 3)
    assert.deepEqual(f.calls[2].body.payload.content[1], {
      type: 'image', mediaType: 'image/png', data: Buffer.alloc(5).toString('base64'), name: '图片.png',
    })
  } finally { f.tunnel.close() }
})

test('native budget includes exact Base64, UTF-8 metadata and text: 16 MiB accepted, one byte more rejected', async () => {
  const data = Buffer.alloc(12 * 1024 * 1024 - 512)
  const descriptor = { mediaType: 'image/png', name: '图片😀.png' }
  const expected = prompt(['near-limit'], '')
  expected.payload.content[1] = { type: 'image', mediaType: descriptor.mediaType, data: data.toString('base64'), name: descriptor.name }
  const padding = LIMIT - json(expected).length
  assert.ok(padding > 0 && padding < 4096)
  const f = fixture({ async materializeAttachment() { return { descriptor, data } } })
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['near-limit'], 'x'.repeat(padding))))
    await finished(f, 1, 4)
    assert.equal(json(f.calls[0].body).length, LIMIT)
    post(f.tunnel, 3, '/api/wechat-remote/session.prompt', json(prompt(['near-limit'], 'x'.repeat(padding + 1))))
    await finished(f, 3, 5)
    assert.equal(f.calls.length, 1)
  } finally { f.tunnel.close() }
})

test('several individually valid images share one native request budget', async () => {
  const f = fixture({ async materializeAttachment() {
    return { descriptor: { mediaType: 'image/png' }, data: Buffer.alloc(7 * 1024 * 1024) }
  } })
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['a', 'b'])))
    await finished(f, 1, 5)
    assert.equal(f.calls.length, 0)
  } finally { f.tunnel.close() }
})

test('failure cancels sibling materialization; late result cannot submit or send a second terminal response', async () => {
  const first = deferred(), second = deferred(), signals = [], started = []
  const f = fixture({ async materializeAttachment({ objectId }, signal) {
    signals.push(signal); started.push(objectId)
    return objectId === 'a' ? first.promise : second.promise
  } })
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['a', 'b', 'c', 'd'])))
    first.reject(new Error('download failed'))
    await finished(f, 1, 5)
    assert.ok(signals.every(signal => signal.aborted))
    second.resolve({ descriptor: { mediaType: 'image/png' }, data: Buffer.alloc(5) })
    await tick(); await tick()
    assert.deepEqual(started, ['a', 'b'])
    assert.equal(f.calls.length, 0)
    assert.equal(f.sent.filter(value => value.id === 1 && value.type === 5).length, 1)
  } finally { f.tunnel.close() }
})

test('cancelled remote prompt ignores its late result without affecting a subsequent request', async () => {
  const pending = deferred()
  const f = fixture({ async materializeAttachment() { return pending.promise } })
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['a'])))
    f.tunnel.receive(frame(6, 1))
    post(f.tunnel, 3, '/api/session.list', json({}))
    await finished(f, 3, 4)
    pending.resolve({ descriptor: { mediaType: 'image/png' }, data: Buffer.alloc(5) })
    await tick(); await tick()
    assert.equal(f.sent.some(value => value.id === 1), false)
    assert.equal(f.calls.length, 1)
  } finally { f.tunnel.close() }
})

test('an exception after native stream replacement releases that replacement', async () => {
  const f = fixture()
  const nativeData = f.tunnel.data.bind(f.tunnel)
  let replacement
  f.tunnel.data = (stream, id, flags, body) => {
    if (stream.kind === 'compat-http' && stream.path === '/api/session.prompt') {
      replacement = stream
      throw new Error('native write failed')
    }
    return nativeData(stream, id, flags, body)
  }
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['small'])))
    await finished(f, 1, 5)
    assert.ok(replacement.controller.signal.aborted)
    assert.equal(replacement.bytes, 0)
    assert.deepEqual(replacement.chunks, [])
    post(f.tunnel, 3, '/api/session.list', json({}))
    await finished(f, 3, 4)
  } finally { f.tunnel.close() }
})

test('legacy localhost HTTP handoff preserves native envelope and cleans a destroyed replacement', async () => {
  const received = []
  const server = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    received.push(JSON.parse(Buffer.concat(chunks).toString() || '{}'))
    response.end('{"ok":true}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const f = fixture({ compatibilityApi: undefined, dshPort: server.address().port })
  try {
    post(f.tunnel, 1, '/api/wechat-remote/session.prompt', json(prompt(['small'])))
    await finished(f, 1, 4)
    assert.equal(received[0].payload.content[1].data, Buffer.alloc(5).toString('base64'))
    const nativeData = f.tunnel.data.bind(f.tunnel)
    let replacement
    f.tunnel.data = (stream, id, flags, body) => {
      if (stream.kind === 'http' && stream.path === '/api/session.prompt') {
        replacement = stream
        throw new Error('local request write failed')
      }
      return nativeData(stream, id, flags, body)
    }
    post(f.tunnel, 3, '/api/wechat-remote/session.prompt', json(prompt(['small'])))
    await finished(f, 3, 5)
    assert.equal(replacement.request.destroyed, true)
    post(f.tunnel, 5, '/api/session.list', json({}))
    await finished(f, 5, 4)
    assert.equal(received.length, 2)
  } finally {
    f.tunnel.close(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

for (const bytes of [0, 8, 16 * 1024]) {
  test(`small ${bytes}-byte response completes promptly while unrelated history and tool data remain queued`, async () => {
    const gate = deferred(), sent = [], history = Buffer.alloc(128 * 1024, 65), tool = 'T'.repeat(256 * 1024)
    let peer
    const tunnel = new DshTunnelAgent({
      compatibilityApi: {
        async request({ path }) { return { statusCode: 200, headers: {}, body: path.endsWith('history') ? history : Buffer.alloc(bytes, 66) } },
        connectEvents(_, value) { peer = value; return () => {} },
      },
      async send(raw) {
        const b = Buffer.from(raw)
        sent.push({ id: b.readUInt32BE(2), type: b[1], body: b.subarray(8) })
        if (sent.length === 1) await gate.promise
      },
    })
    try {
      post(tunnel, 1, '/api/session.history')
      await tick()
      tunnel.receive(frame(1, 3, json({ kind: 'websocket', path: '/api/events.mux' })))
      peer.send(tool)
      post(tunnel, 5, '/api/respond')
      await tick()
      assert.ok(tunnel.pendingSendBytes >= 256 * 1024)
      // The terminal marker is queued, not blocked on other producers' capacity.
      assert.ok(tunnel.sendQueue.streams.get(5).frames.some(raw => raw[1] === 4))
      gate.resolve()
      await until(() => tunnel.pendingSendBytes === 0)
      const end = sent.findIndex(value => value.id === 5 && value.type === 4)
      const precedingBytes = sent.slice(0, end).reduce((total, value) => total + value.body.length + 8, 0)
      assert.ok(end >= 0 && precedingBytes < 80 * 1024, 'completion must not wait for bulk to drain')
      for (const [id, expected] of [[1, history], [3, Buffer.from(tool)], [5, Buffer.alloc(bytes, 66)]]) {
        assert.equal(sent.find(value => value.id === id).type, 2)
        assert.deepEqual(Buffer.concat(sent.filter(value => value.id === id && value.type === 3).map(value => value.body)), expected)
      }
      for (const id of [1, 5]) assert.equal(sent.filter(value => value.id === id).at(-1).type, 4)
      assert.equal(sent.some(value => value.type === 5), false)
      assert.equal(tunnel.streams.size, 1, 'only the subscribed event stream remains')
    } finally { gate.resolve(); tunnel.close() }
  })
}

const SEND_LIMIT = 4 * 1024 * 1024
const TERMINAL_RESERVE = 64 * 1024
const ORDINARY_LIMIT = SEND_LIMIT - TERMINAL_RESERVE

function blockedSendFixture() {
  const gate = deferred(), sent = [], peers = new Map(), detached = []
  let openingId
  const tunnel = new DshTunnelAgent({
    compatibilityApi: {
      async request() { return { statusCode: 200, headers: {}, body: Buffer.alloc(8, 66) } },
      connectEvents(_, peer) {
        const id = openingId
        peers.set(id, peer)
        return () => detached.push(id)
      },
    },
    async send(raw) {
      const b = Buffer.from(raw)
      sent.push({ id: b.readUInt32BE(2), type: b[1], body: b.subarray(8) })
      if (sent.length === 1) await gate.promise
    },
  })
  return {
    tunnel, gate, sent, peers, detached,
    openEvents(id) {
      openingId = id
      tunnel.receive(frame(1, id, json({ kind: 'websocket', path: '/api/events.mux' })))
      return peers.get(id)
    },
  }
}

function fillEventQueueTo(f, id, targetBytes) {
  const wireBytes = targetBytes - f.tunnel.pendingSendBytes
  const count = Math.ceil(wireBytes / (16 * 1024 + 8))
  const payloadBytes = wireBytes - count * 8
  assert.ok(payloadBytes > 0)
  assert.equal(Math.ceil(payloadBytes / (16 * 1024)), count)
  const tool = 'T'.repeat(payloadBytes)
  f.peers.get(id).send(tool)
  assert.equal(f.tunnel.pendingSendBytes, targetBytes, 'real event framing must exactly fill the requested budget')
  return Buffer.from(tool)
}

async function queueReplyAtOrdinaryLimit(f) {
  f.openEvents(3)
  const acceptBytes = frame(2, 5, json({ statusCode: 200, headers: {} })).length
  const dataBytes = frame(3, 5, Buffer.alloc(8)).length
  const tool = fillEventQueueTo(f, 3, ORDINARY_LIMIT - acceptBytes - dataBytes)
  post(f.tunnel, 5, '/api/respond')
  await tick()
  assert.deepEqual(f.tunnel.sendQueue.streams.get(5).frames.map(raw => raw[1]), [2, 3, 4])
  assert.equal(f.tunnel.pendingSendBytes, ORDINARY_LIMIT + 8, 'only END borrows eight reserved bytes')
  return tool
}

test('ACCEPT plus final DATA exactly fills the ordinary budget; END uses its reserve without replacing the response', async () => {
  const f = blockedSendFixture()
  try {
    const tool = await queueReplyAtOrdinaryLimit(f)
    assert.equal(f.tunnel.closed, false)
    assert.equal(f.peers.get(3).readyState, 1)
    f.gate.resolve()
    await until(() => f.tunnel.pendingSendBytes === 0)
    const response = f.sent.filter(value => value.id === 5)
    assert.deepEqual(response.map(value => value.type), [2, 3, 4])
    assert.deepEqual(response[1].body, Buffer.alloc(8, 66))
    const end = f.sent.findIndex(value => value.id === 5 && value.type === 4)
    assert.ok(f.sent.slice(0, end).reduce((sum, value) => sum + value.body.length + 8, 0) < 80 * 1024)
    assert.deepEqual(Buffer.concat(f.sent.filter(value => value.id === 3 && value.type === 3).map(value => value.body)), tool)
    assert.equal(f.sent.some(value => value.type === 5), false)
    assert.equal(f.tunnel.streams.size, 1)
  } finally { f.gate.resolve(); f.tunnel.close() }
})

for (const operation of ['cancel', 'close']) {
  test(`${operation} discards a queued HTTP response including its reserved END after the request owner has retired`, async () => {
    const f = blockedSendFixture()
    try {
      await queueReplyAtOrdinaryLimit(f)
      assert.equal(f.tunnel.streams.has(5), false)
      if (operation === 'cancel') f.tunnel.receive(frame(6, 5))
      else f.tunnel.close()
      assert.equal(f.tunnel.sendQueue.streams.has(5), false)
      assert.equal(f.peers.get(3).readyState, operation === 'cancel' ? 1 : 3)
      f.gate.resolve()
      await until(() => f.tunnel.pendingSendBytes === 0)
      assert.equal(f.sent.some(value => value.id === 5), false, 'discarded DATA and END must not appear later')
      if (operation === 'close') assert.deepEqual(f.detached, [3])
      else assert.ok(f.sent.some(value => value.id === 3 && value.type === 3))
    } finally { f.gate.resolve(); f.tunnel.close() }
  })
}

test('a WebSocket close marker uses the same bounded reserve and stays after its ACCEPT', async () => {
  const f = blockedSendFixture()
  try {
    f.openEvents(3)
    const peer = f.openEvents(5)
    fillEventQueueTo(f, 3, ORDINARY_LIMIT)
    peer.close(1000, 'finished')
    const end = json({ code: 1000, reason: 'finished' })
    assert.equal(f.tunnel.pendingSendBytes, ORDINARY_LIMIT + 8 + end.length)
    assert.deepEqual(f.tunnel.sendQueue.streams.get(5).frames.map(raw => raw[1]), [2, 4])
    assert.deepEqual(f.detached, [5])
    peer.send('late event')
    peer.close(1000, 'late close')
    f.gate.resolve()
    await until(() => f.tunnel.pendingSendBytes === 0)
    const response = f.sent.filter(value => value.id === 5)
    assert.deepEqual(response.map(value => value.type), [2, 4])
    assert.deepEqual(response[1].body, end)
    assert.equal(f.tunnel.closed, false)
    assert.equal(f.peers.get(3).readyState, 1)
  } finally { f.gate.resolve(); f.tunnel.close() }
})

test('DATA cannot borrow terminal reserve: overflow cancels only its producer while unrelated queued data survive', async () => {
  const f = blockedSendFixture()
  try {
    f.openEvents(3)
    const peer = f.openEvents(5)
    const tool = fillEventQueueTo(f, 3, ORDINARY_LIMIT)
    peer.send('x')
    assert.deepEqual(f.detached, [5])
    assert.equal(peer.readyState, 3)
    assert.equal(f.peers.get(3).readyState, 1)
    assert.deepEqual(f.tunnel.sendQueue.streams.get(5).frames.map(raw => raw[1]), [5])
    assert.ok(f.tunnel.pendingSendBytes <= SEND_LIMIT)
    f.gate.resolve()
    await until(() => f.tunnel.pendingSendBytes === 0)
    assert.deepEqual(f.sent.filter(value => value.id === 5).map(value => value.type), [5])
    assert.deepEqual(Buffer.concat(f.sent.filter(value => value.id === 3 && value.type === 3).map(value => value.body)), tool)
    assert.equal(f.tunnel.closed, false)
  } finally { f.gate.resolve(); f.tunnel.close() }
})

test('terminal reserve exhaustion never exceeds the hard cap; fail-close drops queued tails and wakes producers', async () => {
  const gate = deferred(), sent = []
  let failures = 0
  const queue = new TunnelSendQueue({
    async send(raw) { sent.push(raw); await gate.promise },
    onOverflow() { assert.fail('this scenario only exhausts terminal reserve') },
    onFailure() { failures++ },
  })
  try {
    queue.enqueue(1, 'bulk', frame(3, 1, Buffer.alloc(ORDINARY_LIMIT - 8)))
    const wait = queue.waitForCapacity(new AbortController().signal)
    for (let index = 0; index < TERMINAL_RESERVE / 8; index++) {
      queue.enqueue(3, 'interactive', frame(4, 3), true)
    }
    assert.equal(queue.bytes, SEND_LIMIT)
    queue.enqueue(5, 'interactive', frame(4, 5), true)
    await wait
    assert.equal(failures, 1)
    assert.ok(queue.bytes <= SEND_LIMIT)
    queue.enqueue(7, 'interactive', frame(4, 7), true)
    assert.equal(failures, 1, 'closed queue does not repeatedly fail')
    gate.resolve()
    await until(() => queue.bytes === 0)
    assert.equal(sent.length, 1, 'only the already in-flight frame remains observable')
  } finally { gate.resolve(); queue.close() }
})
