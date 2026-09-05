import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import {
  agentNodeIdForPublicKey,
  DEFAULT_PUBLIC_RELAY_ORIGIN,
  loadOrCreateAgentIdentity,
  loadPublicRelayConfig,
  PublicRelayAgent,
  publicPairingPayload,
} from '../lib/public-relay-agent.js'
import PublicRelayGateway from '../lib/public-relay-gateway.js'
import { DshTunnelAgent } from '../lib/dsh-tunnel-agent.js'
import { writePrivateJsonAtomic } from '../lib/secure-file.js'
import HistorySnapshotCache from '../lib/history-snapshot-cache.js'

function tunnelFrame(type, streamId, value) {
  const payload = value === undefined
    ? Buffer.alloc(0)
    : Buffer.from(JSON.stringify(value))
  const frame = Buffer.alloc(8 + payload.length)
  frame[0] = 1
  frame[1] = type
  frame.writeUInt32BE(streamId, 2)
  payload.copy(frame, 8)
  return frame
}

function tunnelFrameInfo(frame) {
  const value = Buffer.from(frame)
  return {
    type: value[1],
    streamId: value.readUInt32BE(2),
    payload: value.subarray(8),
  }
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
}

function unzipSingleEntry(archive) {
  const value = Buffer.from(archive)
  assert.equal(value.readUInt32LE(0), 0x04034b50)
  const nameBytes = value.readUInt16LE(26)
  const extraBytes = value.readUInt16LE(28)
  const compressedBytes = value.readUInt32LE(18)
  const offset = 30 + nameBytes + extraBytes
  return inflateRawSync(value.subarray(offset, offset + compressedBytes)).toString('utf8')
}

const root = mkdtempSync(path.join(tmpdir(), 'harness-public-relay-test-'))
try {
  const identityPath = path.join(root, 'identity.json')
  const first = loadOrCreateAgentIdentity(identityPath)
  const second = loadOrCreateAgentIdentity(identityPath)
  assert.deepEqual(second, first, 'Agent identity must be stable across restarts')
  assert.equal(agentNodeIdForPublicKey(first.publicKeyPem), first.nodeId)
  assert.equal(readFileSync(identityPath, 'utf8').includes('PRIVATE KEY'), true)

  const configPath = path.join(root, 'config.json')
  assert.deepEqual(loadPublicRelayConfig(path.join(root, 'missing.json')), {
    enabled: true,
    relayOrigin: DEFAULT_PUBLIC_RELAY_ORIGIN,
  })
  writeFileSync(configPath, JSON.stringify({ enabled: false }))
  assert.equal(loadPublicRelayConfig(configPath), null)
  writeFileSync(configPath, JSON.stringify({ enabled: true, relayOrigin: 'https://relay.example.test/' }))
  assert.deepEqual(loadPublicRelayConfig(configPath), {
    enabled: true,
    relayOrigin: 'https://relay.example.test',
  })
  writeFileSync(configPath, JSON.stringify({ enabled: true, relayOrigin: 'https://relay.example.test:8443/' }))
  assert.throws(() => loadPublicRelayConfig(configPath), /bare HTTPS origin/)

  const payload = publicPairingPayload({
    enabled: true,
    state: 'online',
    nodeId: first.nodeId,
    identityPublicKey: first.publicKeyPem,
    relayOrigin: 'https://relay.example.test',
    pairingTicket: 'single-use-ticket',
    pairingExpiresAt: 123456,
  })
  const decoded = JSON.parse(payload)
  assert.equal(decoded.mode, 'public-relay')
  assert.equal(decoded.nodeId, first.nodeId)
  assert.match(decoded.identityPublicKey, /BEGIN PUBLIC KEY/)
  assert.equal(decoded.ticket, 'single-use-ticket')

  const compactPairingPayload = JSON.parse(publicPairingPayload({
    enabled: true,
    state: 'online',
    nodeId: first.nodeId,
    identityPublicKey: first.publicKeyPem,
    relayOrigin: 'https://relay.example.test',
    pairingTicket: 'single-use-ticket',
    pairingExpiresAt: 123456,
    hostId: 'host-id-1234567890123456',
    agentInstanceId: 'agent-id-123456789012345',
    hostName: 'Peach',
    agentKind: 'deepseek-harness',
    agentName: 'DeepSeek Harness',
    agentVersion: '0.1.1-rc.2',
    adapterVersion: '1.1.0',
    capabilities: [{ id: 'dsh.rpc', version: 1 }],
  }))
  assert.equal(compactPairingPayload.v, 1, 'compact pairing must preserve QR protocol v1')
  assert.equal(compactPairingPayload.nodeId, first.nodeId)
  assert.equal(compactPairingPayload.hostId, undefined, 'claim response, not QR, owns mutable Agent metadata')
  assert.equal(compactPairingPayload.capabilities, undefined)
  assert.ok(JSON.stringify(compactPairingPayload).length < 500, 'public pairing payload must remain easy to scan')

  let enrollmentBody = null
  const metadataAgent = new PublicRelayAgent(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    {
      agentVersion: '0.1.1-rc.2',
      adapterVersion: '1.1.0',
      hostId: 'host-id-1234567890123456',
      agentInstanceId: 'agent-id-123456789012345',
      agentKind: 'deepseek-harness',
      agentName: 'DeepSeek Harness',
      hostName: 'Peach',
      capabilities: [{ id: 'dsh.rpc', version: 1 }],
      identityPath: path.join(root, 'metadata-identity.json'),
      onFrame() {},
      async fetchImpl(_url, options) {
        enrollmentBody = JSON.parse(options.body)
        return new Response(JSON.stringify({
          ticket: 'ticket',
          expiresAt: Date.now() + 60000,
          remoteAccess: { status: 'active', validUntil: Date.now() + 30 * 86400000 },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
  const enrollmentStatus = await metadataAgent.ensurePairingTicket()
  assert.equal(enrollmentBody.agentVersion, '0.1.1-rc.2')
  assert.equal(enrollmentBody.adapterVersion, '1.1.0')
  assert.equal(enrollmentBody.hostId, 'host-id-1234567890123456')
  assert.equal(enrollmentBody.agentInstanceId, 'agent-id-123456789012345')
  assert.deepEqual(enrollmentBody.capabilities, [{ id: 'dsh.rpc', version: 1 }])
  assert.equal(enrollmentStatus.remoteAccess.status, 'active')
  assert.equal(typeof enrollmentStatus.remoteAccess.validUntil, 'number')

  const rotatedIdentityPath = path.join(root, 'revoked-identity.json')
  const revokedIdentity = loadOrCreateAgentIdentity(rotatedIdentityPath)
  const enrollmentNodeIds = []
  let enrollmentAttempts = 0
  const recoveringAgent = new PublicRelayAgent(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    {
      agentVersion: 'test',
      identityPath: rotatedIdentityPath,
      onFrame() {},
      async fetchImpl(_url, options) {
        enrollmentAttempts += 1
        enrollmentNodeIds.push(JSON.parse(options.body).publicKey)
        if (enrollmentAttempts === 1) {
          return new Response(JSON.stringify({
            error: { code: 'agent_revoked', message: 'Agent identity has been revoked' },
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ ticket: 'fresh-ticket', expiresAt: Date.now() + 60_000 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
  const recoveredStatus = await recoveringAgent.ensurePairingTicket()
  const persistedIdentity = loadOrCreateAgentIdentity(rotatedIdentityPath)
  assert.equal(enrollmentAttempts, 2, 'revoked identity should be replaced and enrolled once')
  assert.notEqual(recoveredStatus.nodeId, revokedIdentity.nodeId)
  assert.notEqual(enrollmentNodeIds[0], enrollmentNodeIds[1])
  assert.equal(recoveredStatus.nodeId, persistedIdentity.nodeId)
  assert.equal(recoveredStatus.pairingTicket, 'fresh-ticket')

  const atomicPath = path.join(root, 'atomic-state.json')
  writePrivateJsonAtomic(atomicPath, { generation: 1 })
  writePrivateJsonAtomic(atomicPath, { generation: 2 })
  assert.deepEqual(JSON.parse(readFileSync(atomicPath, 'utf8')), { generation: 2 })

  // The restart cache stores only a bounded encrypted object descriptor. It
  // must survive a new gateway process without persisting any clear history.
  const cachePath = path.join(root, 'history-snapshot-cache.json')
  const cacheNow = Date.now()
  const clearMarker = 'PRIVATE CONVERSATION CONTENT MUST NEVER BE STORED HERE'
  const cachedPayload = JSON.stringify({ events: [{ text: clearMarker }, {
    text: randomBytes(180 * 1024).toString('base64'),
  }] })
  const cachedDigest = createHash('sha256').update(cachedPayload).digest('base64url')
  const encryptedDescriptor = {
    v: 1,
    scheme: 'xsalsa20-poly1305-chunks-v1',
    objectId: randomBytes(18).toString('base64url'),
    key: randomBytes(32).toString('base64url'),
    noncePrefix: randomBytes(16).toString('base64url'),
    plainBytes: 180_000,
    cipherBytes: 180_020,
    chunkBytes: 256 * 1024,
    contentKind: 'history-json',
    contentEncoding: 'zip',
    archiveEntry: 'history.json',
    originalBytes: Buffer.byteLength(cachedPayload),
    expiresAt: cacheNow + 60 * 60_000,
  }
  const firstCache = new HistorySnapshotCache({ file: cachePath, now: () => cacheNow })
  firstCache.set(cachedDigest, encryptedDescriptor)
  const serializedCache = readFileSync(cachePath, 'utf8')
  assert.equal(serializedCache.includes(clearMarker), false, 'restart cache must never persist clear history')
  if (process.platform !== 'win32') assert.equal(statSync(cachePath).mode & 0o077, 0, 'restart cache must be owner-only')

  const cacheDiagnostics = []
  const restoredCache = new HistorySnapshotCache({
    file: cachePath,
    now: () => cacheNow,
    onDiagnostic(level, message) { cacheDiagnostics.push({ level, message }) },
  })
  assert.deepEqual(restoredCache.get(cachedDigest), encryptedDescriptor)
  assert.match(cacheDiagnostics[0].message, /restored 1 encrypted history snapshot/)

  // Invalid and expired entries are ignored independently; one damaged entry
  // cannot poison other valid restart cache records.
  const storedCache = JSON.parse(serializedCache)
  storedCache.entries.push({
    digest: randomBytes(32).toString('base64url'),
    descriptor: { ...encryptedDescriptor, expiresAt: cacheNow - 1 },
    expiresAt: cacheNow - 1,
  })
  storedCache.entries.push({
    digest: randomBytes(32).toString('base64url'),
    descriptor: { ...encryptedDescriptor, key: 'tampered' },
    expiresAt: encryptedDescriptor.expiresAt,
  })
  writePrivateJsonAtomic(cachePath, storedCache)
  const filteredDiagnostics = []
  const filteredCache = new HistorySnapshotCache({
    file: cachePath,
    now: () => cacheNow,
    onDiagnostic(level, message) { filteredDiagnostics.push({ level, message }) },
  })
  assert.equal(filteredCache.size, 1)
  assert.match(filteredDiagnostics[0].message, /ignored 2 invalid/)

  const boundedCache = new HistorySnapshotCache({ now: () => cacheNow })
  for (let index = 0; index < 40; index += 1) {
    boundedCache.set(randomBytes(32).toString('base64url'), {
      ...encryptedDescriptor,
      objectId: randomBytes(18).toString('base64url'),
    })
  }
  assert.equal(boundedCache.size, 32, 'restart cache must remain bounded')

  const corruptCachePath = path.join(root, 'corrupt-history-cache.json')
  writeFileSync(corruptCachePath, '{not-json')
  const corruptDiagnostics = []
  const corruptCache = new HistorySnapshotCache({
    file: corruptCachePath,
    now: () => cacheNow,
    onDiagnostic(level, message) { corruptDiagnostics.push({ level, message }) },
  })
  assert.equal(corruptCache.size, 0)
  assert.equal(corruptDiagnostics[0].level, 'warn')
  assert.doesNotThrow(() => corruptCache.set(cachedDigest, encryptedDescriptor), 'cache corruption must not affect DSH')
  assert.equal(readFileSync(corruptCachePath, 'utf8'), '{not-json', 'malformed cache evidence must not be overwritten')

  // A new gateway instance must return the persisted descriptor before any
  // upload-ticket request. This proves restart reuse rather than only testing
  // the cache class in isolation.
  const cachedGateway = new PublicRelayGateway(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    {
      agentVersion: 'test',
      identityPath: path.join(root, 'cached-gateway-identity.json'),
      historyCachePath: cachePath,
      fetchImpl() { throw new Error('cache hit unexpectedly contacted object service') },
    },
  )
  assert.deepEqual(await cachedGateway.prepareHistorySnapshot(cachedPayload), encryptedDescriptor)
  cachedGateway.stop()

  // Regression: a synchronous gateway error must be isolated to that client.
  // Promise.resolve(callback()) does not catch a synchronous callback throw
  // and previously terminated the entire DSH process after reconnect churn.
  let isolatedError = null
  const isolatedAgent = new PublicRelayAgent(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    {
      agentVersion: 'test',
      identityPath: path.join(root, 'isolated-identity.json'),
      onFrame() { throw new Error('synthetic synchronous gateway failure') },
      onClientError(clientId, error) { isolatedError = { clientId, error } },
    },
  )
  await isolatedAgent.dispatchFrame({ clientId: 'client-sync', payload: Buffer.alloc(0), reply() {} })
  assert.equal(isolatedError.clientId, 'client-sync')
  assert.match(isolatedError.error.message, /synthetic synchronous gateway failure/)

  // Large history responses wait for the network buffer to drain instead of
  // closing the shared desktop Agent connection at the 2 MiB watermark.
  let routed = false
  let closedByBackpressure = false
  const bufferedSocket = {
    readyState: 1,
    bufferedAmount: 3 * 1024 * 1024,
    send(_data, _options, callback) { routed = true; callback() },
    close() { closedByBackpressure = true },
  }
  const draining = isolatedAgent.sendRouted(bufferedSocket, Buffer.alloc(18), Buffer.from('history'))
  setTimeout(() => { bufferedSocket.bufferedAmount = 0 }, 20)
  await draining
  assert.equal(routed, true)
  assert.equal(closedByBackpressure, false)

  // The per-client virtual tunnel owns an explicit promise-backlog ceiling.
  // A stalled relay send must close only that tunnel instead of accumulating
  // unbounded response buffers inside the DSH process.
  let releaseBlockedSend
  const blockedSend = new Promise(resolve => { releaseBlockedSend = resolve })
  const boundedTunnel = new DshTunnelAgent({ send: () => blockedSend })
  boundedTunnel.queue(new Uint8Array(512 * 1024))
  await Promise.resolve()
  for (let index = 0; index < 9; index += 1) {
    boundedTunnel.queue(new Uint8Array(512 * 1024))
  }
  assert.equal(boundedTunnel.closed, true)
  assert.ok(boundedTunnel.pendingSendBytes <= 4 * 1024 * 1024)
  releaseBlockedSend()
  await boundedTunnel.sendChain

  // Pre-Gateway DSH still uses the original loopback HTTP/WebSocket route.
  const compatibilityRequests = []
  const compatibilityServer = createServer((req, res) => {
    compatibilityRequests.push({
      kind: 'http',
      path: req.url,
      authorization: req.headers.authorization,
    })
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  const compatibilityWebSockets = new WebSocketServer({ noServer: true })
  compatibilityServer.on('upgrade', (req, socket, head) => {
    compatibilityRequests.push({
      kind: 'websocket',
      path: req.url,
      authorization: req.headers.authorization,
    })
    compatibilityWebSockets.handleUpgrade(req, socket, head, webSocket => {
      webSocket.send('compat-ready')
    })
  })
  await new Promise((resolve, reject) => {
    compatibilityServer.once('error', reject)
    compatibilityServer.listen(0, '127.0.0.1', resolve)
  })
  const compatibilityPort = compatibilityServer.address().port
  const routedFrames = []
  const routedTunnel = new DshTunnelAgent({
    dshPort: compatibilityPort,
    send(frame) { routedFrames.push(tunnelFrameInfo(frame)) },
  })
  routedTunnel.receive(tunnelFrame(1, 1, {
    kind: 'http',
    path: '/api/session.list',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  }))
  routedTunnel.receive(tunnelFrame(4, 1))
  await waitFor(
    () => routedFrames.some(frame => frame.streamId === 1 && frame.type === 4),
    'compatibility HTTP tunnel did not finish',
  )
  assert.deepEqual(compatibilityRequests[0], {
    kind: 'http',
    path: '/api/session.list',
    authorization: undefined,
  })

  routedTunnel.receive(tunnelFrame(1, 3, {
    kind: 'websocket',
    path: '/api/events.host',
    headers: {},
  }))
  await waitFor(
    () => routedFrames.some(frame => frame.streamId === 3 && frame.type === 3),
    'compatibility WebSocket tunnel did not receive a frame',
  )
  assert.deepEqual(compatibilityRequests[1], {
    kind: 'websocket',
    path: '/api/events.host',
    authorization: undefined,
  })
  assert.equal(
    routedFrames.find(frame => frame.streamId === 3 && frame.type === 3).payload.toString(),
    'compat-ready',
  )
  routedTunnel.close()
  await new Promise(resolve => compatibilityWebSockets.close(resolve))
  await new Promise(resolve => compatibilityServer.close(resolve))

  // The modern branch works with no listening DSH/LAN door and preserves
  // large-response backpressure, downlink frame order, and cancellation.
  const inProcessFrames = []
  let detached = false
  let cancelledSignal
  const inProcessTunnel = new DshTunnelAgent({
    dshPort: 1,
    compatibilityApi: {
      async request({ path, body, signal }) {
        if (path === '/api/cancel-me') {
          cancelledSignal = signal
          await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
        }
        assert.equal(Buffer.from(body).toString(), '{}')
        return { statusCode: 200, headers: {}, body: Buffer.alloc(5 * 1024 * 1024, 65) }
      },
      connectEvents(path, peer) {
        assert.equal(path, '/api/events.mux')
        peer.send('synchronous-baseline')
        return () => { detached = true }
      },
    },
    send(frame) { inProcessFrames.push(tunnelFrameInfo(frame)) },
  })
  inProcessTunnel.receive(tunnelFrame(1, 1, { kind: 'http', method: 'POST', path: '/api/session.history' }))
  inProcessTunnel.receive(tunnelFrame(3, 1, {}))
  inProcessTunnel.receive(tunnelFrame(4, 1))
  await waitFor(() => inProcessFrames.some(frame => frame.streamId === 1 && frame.type === 4), 'large in-process response did not finish')
  assert.equal(inProcessFrames.filter(frame => frame.streamId === 1 && frame.type === 3).reduce((sum, frame) => sum + frame.payload.length, 0), 5 * 1024 * 1024)
  assert.equal(inProcessTunnel.closed, false, 'large history must drain without dropping the node tunnel')
  inProcessTunnel.receive(tunnelFrame(1, 3, { kind: 'websocket', path: '/api/events.mux' }))
  await waitFor(() => inProcessFrames.some(frame => frame.streamId === 3 && frame.type === 3), 'in-process baseline missing')
  assert.deepEqual(inProcessFrames.filter(frame => frame.streamId === 3).map(frame => frame.type), [2, 3], 'ACCEPT precedes even a synchronous baseline')
  inProcessTunnel.receive(tunnelFrame(1, 5, { kind: 'http', method: 'POST', path: '/api/cancel-me' }))
  inProcessTunnel.receive(tunnelFrame(4, 5))
  await waitFor(() => !!cancelledSignal, 'cancellable request was not dispatched')
  inProcessTunnel.receive(tunnelFrame(6, 5))
  assert.equal(cancelledSignal.aborted, true)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(inProcessFrames.some(frame => frame.streamId === 5), false, 'cancelled requests cannot emit a late response')
  inProcessTunnel.close()
  assert.equal(detached, true)

  // Regression: when the physical Agent socket drops, every cloud client id
  // from that socket is stale and must be removed before reconnecting.
  let staleTunnelClosed = false
  const gateway = new PublicRelayGateway(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    { agentVersion: 'test', identityPath: path.join(root, 'gateway-identity.json') },
  )
  const compactPayload = JSON.stringify({
    events: Array.from({ length: 1200 }, (_, seq) => ({
      event: { seq, type: 'assistant/message', data: { text: 'repeatable compact history '.repeat(8) } },
    })),
  })
  const compactDescriptor = await gateway.prepareHistorySnapshot(compactPayload)
  assert.equal(compactDescriptor.contentKind, 'history-json')
  assert.equal(compactDescriptor.contentEncoding, 'zip')
  assert.equal(typeof compactDescriptor.archiveBase64, 'string')
  assert.equal(compactDescriptor.objectId, undefined, 'small ZIP must not pay an OSS cold-upload handshake')
  assert.equal(unzipSingleEntry(Buffer.from(compactDescriptor.archiveBase64, 'base64')), compactPayload)
  gateway.clients.set('stale-client', {
    e2ee: null,
    tunnel: { close() { staleTunnelClosed = true } },
    reply() {},
  })
  gateway.agent.options.onTransportDisconnect()
  assert.equal(gateway.clients.size, 0)
  assert.equal(staleTunnelClosed, true)
  gateway.stop()
  console.log('public relay identity/config/pairing tests ok')
} finally {
  rmSync(root, { recursive: true, force: true })
}
