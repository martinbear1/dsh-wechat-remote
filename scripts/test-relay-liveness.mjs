import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createTcpServer, connect as tcpConnect } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { PublicRelayAgent } from '../lib/public-relay-agent.js'

const fixtureParent = path.resolve(tmpdir())
const root = mkdtempSync(path.join(fixtureParent, 'harness-relay-liveness-'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await wait(10)
  }
  throw new Error(message)
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server.address().port
}
let fixtureIndex = 0
async function fixture({ autoPong = true, stalledUpgrade = false, fetchImpl } = {}) {
  let drop = stalledUpgrade
  let enrollments = 0
  let connections = 0
  let disconnects = 0
  let pings = 0
  const states = []
  const tcpSockets = new Set()
  const server = createHttpServer((_req, res) => { res.writeHead(404); res.end() })
  const webSockets = new WebSocketServer({ server, autoPong })
  webSockets.on('connection', socket => {
    connections++
    socket.on('ping', () => { pings++ })
    socket.send(JSON.stringify({ type: 'relay.ready', protocol: 1 }))
  })
  const relayPort = await listen(server)
  const proxy = createTcpServer(downstream => {
    const upstream = tcpConnect({ host: '127.0.0.1', port: relayPort })
    for (const socket of [downstream, upstream]) {
      tcpSockets.add(socket)
      socket.on('error', () => {})
      socket.on('close', () => tcpSockets.delete(socket))
    }
    downstream.on('data', data => { if (!drop && !upstream.destroyed) upstream.write(data) })
    upstream.on('data', data => { if (!drop && !downstream.destroyed) downstream.write(data) })
    downstream.on('close', () => upstream.destroy())
    upstream.on('close', () => { if (!drop) downstream.destroy() })
  })
  const proxyPort = await listen(proxy)
  const identityPath = path.join(root, `identity-${++fixtureIndex}.json`)
  const agent = new PublicRelayAgent({ enabled: true, relayOrigin: `http://127.0.0.1:${proxyPort}` }, {
    agentVersion: 'synthetic-local-only',
    identityPath,
    transportTiming: { pingIntervalMs: 50, pongTimeoutMs: 250, handshakeTimeoutMs: 300 },
    onFrame() {},
    onTransportDisconnect() { disconnects++ },
    onStatus(status) { states.push({ state: status.state, lastError: status.lastError }) },
    async fetchImpl(...args) {
      enrollments++
      if (fetchImpl) return fetchImpl(...args)
      return new Response(JSON.stringify({ ticket: 'synthetic-local-only', expiresAt: Date.now() + 600_000 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    },
  })
  return {
    agent, webSockets, states,
    counters: () => ({ enrollments, connections, disconnects, pings }),
    identity: () => readFileSync(identityPath, 'utf8'),
    cutUpstream() { drop = true; for (const socket of webSockets.clients) socket.terminate() },
    restore() { drop = false },
    async close() {
      agent.stop()
      for (const socket of tcpSockets) socket.destroy()
      for (const socket of webSockets.clients) socket.terminate()
      await Promise.all([
        new Promise(resolve => proxy.close(resolve)),
        new Promise(resolve => webSockets.close(resolve)),
        new Promise(resolve => server.close(resolve)),
      ])
    },
  }
}

try {
  const healthy = await fixture()
  try {
    await healthy.agent.start()
    await until(() => healthy.counters().pings >= 4, 'idle connection did not exchange heartbeats')
    assert.equal(healthy.agent.snapshot().state, 'online')
    assert.equal(healthy.counters().connections, 1, 'healthy idle connection must not reconnect')
    assert.equal(healthy.counters().disconnects, 0)
    console.log('PASS idle connection stays online through repeated ping/pong without app frames')

    const identityBefore = healthy.identity()
    healthy.cutUpstream()
    await until(() => healthy.states.some(s => s.lastError === 'Relay heartbeat timed out'), 'half-open connection was not detected')
    assert.notEqual(healthy.agent.snapshot().state, 'online')
    await until(() => healthy.counters().disconnects === 1, 'physical disconnect did not clear stale E2EE clients')
    healthy.restore()
    await until(() => healthy.counters().connections === 2 && healthy.agent.snapshot().state === 'online', 'relay did not reconnect after restoration')
    assert.equal(healthy.identity(), identityBefore, 'transport recovery must not rotate the pairing identity')
    assert.equal(healthy.agent.snapshot().lastError, undefined)
    console.log('PASS half-open timeout clears transport, reconnects, and preserves node identity')

    const beforeStop = healthy.counters().enrollments
    healthy.agent.stop()
    await wait(450)
    assert.equal(healthy.agent.snapshot().state, 'offline')
    assert.equal(healthy.counters().enrollments, beforeStop)
    assert.equal(healthy.agent.clearHeartbeat, null)
    assert.equal(healthy.agent.reconnectTimer, null)
    console.log('PASS explicit stop cancels heartbeat and retry timers')
  } finally { await healthy.close() }

  const stalled = await fixture({ stalledUpgrade: true })
  try {
    await stalled.agent.start()
    await until(() => stalled.states.some(s => s.state === 'connecting'), 'stalled fixture never attempted upgrade')
    await until(() => stalled.states.some(s => s.state === 'offline'), 'stalled HTTP upgrade did not time out')
    stalled.restore()
    await until(() => stalled.agent.snapshot().state === 'online', 'stalled upgrade did not recover')
    assert(stalled.counters().enrollments >= 2)
    console.log('PASS non-responsive WebSocket handshake is bounded and retried')
  } finally { await stalled.close() }

  const wrongPong = await fixture({ autoPong: false })
  let wrongPongTimer
  try {
    await wrongPong.agent.start()
    await until(() => wrongPong.agent.snapshot().state === 'online', 'no-pong fixture did not connect')
    wrongPongTimer = setInterval(() => {
      for (const socket of wrongPong.webSockets.clients) {
        if (socket.readyState === WebSocket.OPEN) socket.pong(Buffer.from('not-the-pending-ping'))
      }
    }, 30)
    await until(() => wrongPong.states.some(s => s.lastError === 'Relay heartbeat timed out'), 'unsolicited pong incorrectly kept a stale probe alive')
    console.log('PASS unrelated pong cannot acknowledge the pending heartbeat')
  } finally { clearInterval(wrongPongTimer); await wrongPong.close() }

  let resolveEnrollment
  const pendingEnrollment = new Promise(resolve => { resolveEnrollment = resolve })
  const stopped = await fixture({ fetchImpl: () => pendingEnrollment })
  try {
    const starting = stopped.agent.start()
    await until(() => stopped.counters().enrollments === 1, 'enrollment did not start')
    stopped.agent.stop()
    resolveEnrollment(new Response(JSON.stringify({ ticket: 'local-only', expiresAt: Date.now() + 60_000 }), { status: 200 }))
    await starting
    await wait(50)
    assert.equal(stopped.counters().connections, 0, 'late enrollment resurrected a stopped Agent')
    assert.equal(stopped.agent.snapshot().state, 'offline')
    assert.equal(stopped.agent.reconnectTimer, null)
    console.log('PASS stop during enrollment cannot resurrect the connection')
  } finally { await stopped.close() }
  console.log('relay liveness: 6 checks passed')
} finally {
  assert.equal(path.dirname(path.resolve(root)), fixtureParent)
  assert(path.basename(root).startsWith('harness-relay-liveness-'))
  rmSync(root, { recursive: true, force: true })
}
