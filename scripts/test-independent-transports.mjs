/** Real local WebSockets and the unchanged mini-program's E2EE implementation.
 * Only the downstream DSH response is a labelled fixture; no production calls. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { WebSocket } from 'ws'
import { SecureLanServer } from '../lib/secure-lan.js'
import { loadOrCreateAgentIdentity } from '../lib/public-relay-agent.js'

assert(process.env.HARNESS_MINI_DIR, 'HARNESS_MINI_DIR required')
const compiled = await build({ entryPoints: [path.join(process.env.HARNESS_MINI_DIR, 'utils/e2ee.js')],
  bundle: true, write: false, platform: 'node', format: 'cjs' })
const module = { exports: {} }
new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports)
const { createClientSession } = module.exports
const wxApi = { getRandomValues({ length, success }) { success({ randomValues: new Uint8Array(randomBytes(length)) }) },
  base64ToArrayBuffer(value) { return new Uint8Array(Buffer.from(value, 'base64')).buffer } }
const stage = mkdtempSync(path.join(tmpdir(), 'dsh-two-transports-'))
const clients = [], nodes = []
async function host(label) {
  const identity = loadOrCreateAgentIdentity(path.join(stage, label + '.json'))
  let token = randomBytes(32).toString('base64url'), calls = 0
  const lan = new SecureLanServer({ identity: () => identity, token: () => token, dshPort: 1,
    compatibilityApi: { async request() { calls++; return { statusCode: 200, headers: {}, body: Buffer.from(label) } } } })
  const server = createServer((_req, res) => { res.writeHead(404); res.end() })
  server.on('upgrade', (req, socket, head) => lan.sockets.handleUpgrade(req, socket, head,
    ws => lan.attach(ws, req.socket.remoteAddress)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const node = { identity, get token() { return token }, rotate() { token = randomBytes(32).toString('base64url') },
    get calls() { return calls }, url: 'ws://127.0.0.1:' + server.address().port,
    close: async () => { lan.close(); await new Promise(resolve => server.close(resolve)) } }
  nodes.push(node); return node
}
async function connect(target, pinned = target.identity, token = target.token) {
  const crypto = await createClientSession({ nodeId: pinned.nodeId, identityPublicKey: pinned.publicKeyPem, wxApi })
  const socket = new WebSocket(target.url), data = []
  clients.push(socket)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(Error('handshake timeout')) }, 3000)
    const done = (error) => { clearTimeout(timeout); error ? reject(error) : resolve() }
    socket.once('open', () => socket.send(crypto.start()))
    socket.once('error', done)
    socket.once('close', () => done(Error('LAN closed')))
    socket.on('message', frame => {
      try {
        const received = crypto.receive(frame)
        for (const out of received.outbound || []) socket.send(out)
        if (received.ready) socket.send(crypto.seal(Buffer.from(JSON.stringify({ type: 'lan.authenticate', token }))))
        if (received.data) {
          const raw = Buffer.from(received.data)
          if (raw[0] === 123 && JSON.parse(raw.toString()).type === 'lan.ready') done()
          else data.push(raw)
        }
      } catch (error) { socket.terminate(); done(error) }
    })
  })
  let id = 1
  return { socket, async request() {
    const current = id; id += 2
    for (const [type, body] of [[1, Buffer.from(JSON.stringify({ kind: 'http', method: 'GET', path: '/api/session.list' }))], [4, Buffer.alloc(0)]]) {
      const frame = Buffer.alloc(8 + body.length); frame[0] = 1; frame[1] = type; frame.writeUInt32BE(current, 2); body.copy(frame, 8)
      socket.send(crypto.seal(frame))
    }
    for (let count = 0; count < 200; count++) {
      if (data.some(f => f[1] === 4 && f.readUInt32BE(2) === current)) {
        return Buffer.concat(data.filter(f => f[1] === 3 && f.readUInt32BE(2) === current).map(f => f.subarray(8))).toString()
      }
      if (socket.readyState !== WebSocket.OPEN) throw Error('LAN closed')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    throw Error('request timeout')
  } }
}
try {
  const web = await host('web'), desktop = await host('desktop')
  const [a, b] = await Promise.all([connect(web), connect(desktop)])
  assert.deepEqual(await Promise.all([a.request(), b.request()]), ['web', 'desktop'])
  await assert.rejects(connect(desktop, web.identity), /身份签名/)
  await assert.rejects(connect(desktop, desktop.identity, web.token), /LAN closed/)
  assert.equal(desktop.calls, 1, 'wrong identity/credential cannot reach DSH')
  assert.equal(await a.request(), 'web')
  const closing = new Promise(resolve => b.socket.once('close', resolve))
  desktop.rotate()
  await assert.rejects(b.request(), /LAN closed/)
  await closing
  assert.equal(await a.request(), 'web', 'Desktop credential rotation does not affect Web')
  const reconnected = await connect(desktop)
  assert.equal(await reconnected.request(), 'desktop')
  web.rotate()
  assert.equal(await reconnected.request(), 'desktop')
  console.log('PASS real WebSocket + released mini E2EE: two simultaneous nodes, pinned-key mismatch, cross-node token refusal, isolated rotation and reconnect')
} finally {
  for (const client of clients) client.terminate()
  await Promise.all(nodes.map(node => node.close()))
  assert.equal(path.dirname(stage), path.resolve(tmpdir()))
  assert(path.basename(stage).startsWith('dsh-two-transports-'))
  rmSync(stage, { recursive: true, force: true })
}
