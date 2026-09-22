import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TunnelSendQueue } from '../lib/tunnel-send-queue.js'
import { DshTunnelAgent } from '../lib/dsh-tunnel-agent.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const frame = n => Uint8Array.of(n)
async function settled(queue) {
  for (let i = 0; i < 100 && queue.bytes; i++) await tick()
  assert.equal(queue.bytes, 0)
}

test('interactive streams overtake bulk, never reorder a stream or starve bulk', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const sent = []
  const queue = new TunnelSendQueue({
    async send(bytes) { sent.push(bytes[0]); if (bytes[0] === 1) await gate },
    onFailure() { assert.fail('unexpected failure') }, onOverflow() { assert.fail('unexpected overflow') },
  })
  queue.enqueue(1, 'bulk', frame(1))
  queue.enqueue(1, 'bulk', frame(2))
  queue.enqueue(1, 'bulk', frame(3))
  for (let i = 10; i < 20; i++) queue.enqueue(3, 'interactive', frame(i))
  release()
  await settled(queue)
  assert.equal(sent[1], 10)
  assert.deepEqual(sent.filter(n => n < 10), [1, 2, 3])
  assert.deepEqual(sent.filter(n => n >= 10), Array.from({ length: 10 }, (_, i) => i + 10))
  assert.ok(sent.indexOf(2) <= 5, 'bulk gets a turn after four interactive frames')
})

test('overflow removes only its producer; terminal response uses reserved capacity', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const sent = [], overflow = []
  const queue = new TunnelSendQueue({ maxBytes: 128, maxStreamBytes: 50,
    async send(bytes) { sent.push(bytes[0]); if (bytes[0] === 1) await gate },
    onFailure() { assert.fail('another stream must stay connected') },
    onOverflow(id) { overflow.push(id); queue.enqueue(id, 'interactive', frame(99), true) },
  })
  queue.enqueue(1, 'bulk', frame(1))
  queue.enqueue(3, 'bulk', new Uint8Array(40))
  queue.enqueue(3, 'bulk', new Uint8Array(40))
  queue.enqueue(5, 'interactive', frame(5))
  release()
  await settled(queue)
  assert.deepEqual(overflow, [3])
  assert.deepEqual(sent.sort((a, b) => a - b), [1, 5, 99])
})

test('cancel removes queued frames, capacity waits abort and release listeners', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const sent = []
  const queue = new TunnelSendQueue({ highWaterBytes: 2,
    async send(bytes) { sent.push(bytes[0]); if (bytes[0] === 1) await gate },
    onFailure() {}, onOverflow() {},
  })
  queue.enqueue(1, 'bulk', frame(1))
  queue.enqueue(1, 'bulk', frame(2))
  const controller = new AbortController()
  const wait = queue.waitForCapacity(controller.signal)
  controller.abort(new Error('cancelled'))
  await assert.rejects(wait, /cancelled/)
  queue.discard(1)
  release()
  await settled(queue)
  assert.deepEqual(sent, [1])
  queue.close()
})

test('failed physical send terminates the queue once and wakes waiting producers', async () => {
  let failures = 0
  const queue = new TunnelSendQueue({ highWaterBytes: 1,
    send() { throw new Error('offline') }, onFailure() { failures++ }, onOverflow() {},
  })
  queue.enqueue(1, 'bulk', frame(1))
  await queue.waitForCapacity(new AbortController().signal)
  queue.enqueue(3, 'interactive', frame(3))
  assert.equal(failures, 1)
  assert.equal(queue.bytes, 0)
})

test('real tunnel interleaves history, a large native tool event and an approval without losing bytes', async () => {
  const encode = (type, id, value) => {
    const body = value === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(value))
    const result = Buffer.alloc(8 + body.length)
    result[0] = 1; result[1] = type; result.writeUInt32BE(id, 2); body.copy(result, 8)
    return result
  }
  const sent = [], history = Buffer.alloc(800 * 1024, 65), tool = 'T'.repeat(2 * 1024 * 1024)
  let release, peer, detached = false
  const blocked = new Promise(resolve => { release = resolve })
  const tunnel = new DshTunnelAgent({
    compatibilityApi: {
      async request({ path }) {
        return { statusCode: 200, headers: {}, body: path.endsWith('history') ? history : Buffer.from('approved') }
      },
      connectEvents(_, value) { peer = value; return () => { detached = true } },
    },
    async send(raw) {
      const bytes = Buffer.from(raw)
      sent.push({ type: bytes[1], id: bytes.readUInt32BE(2), body: bytes.subarray(8) })
      if (sent.length === 1) await blocked
    },
  })
  const post = (id, path) => {
    tunnel.receive(encode(1, id, { kind: 'http', method: 'POST', path }))
    tunnel.receive(encode(4, id))
  }
  try {
    post(1, '/api/session.history')
    await tick()
    tunnel.receive(encode(1, 3, { kind: 'websocket', path: '/api/events.mux' }))
    peer.send(tool)
    post(5, '/api/respond')
    await tick()
    release()
    for (let i = 0; i < 1000 && !sent.some(f => f.id === 1 && f.type === 4); i++) await tick()
    const historyEnd = sent.findIndex(f => f.id === 1 && f.type === 4)
    const approvalEnd = sent.findIndex(f => f.id === 5 && f.type === 4)
    assert.ok(historyEnd >= 0, 'history must eventually drain')
    assert.ok(approvalEnd >= 0 && approvalEnd < historyEnd, 'approval must not wait for the whole history')
    assert.ok(sent.findIndex(f => f.id === 3 && f.type === 3) < historyEnd, 'live output must not wait for history')
    assert.deepEqual(Buffer.concat(sent.filter(f => f.id === 1 && f.type === 3).map(f => f.body)), history)
    assert.equal(Buffer.concat(sent.filter(f => f.id === 3 && f.type === 3).map(f => f.body)).toString(), tool)
    assert.equal(sent.some(f => f.type === 5), false, 'a previously supported 2 MiB tool event stays supported')
    for (const id of [1, 3, 5]) assert.equal(sent.find(f => f.id === id).type, 2, 'ACCEPT is ordered before DATA')
  } finally { release(); tunnel.close() }
  assert.equal(detached, true)
})
