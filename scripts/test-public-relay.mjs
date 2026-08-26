import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

  const metadataPayload = JSON.parse(publicPairingPayload({
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
    adapterVersion: '1.1.0-public-research.8',
    capabilities: [{ id: 'dsh.rpc', version: 1 }],
  }))
  assert.equal(metadataPayload.v, 1, 'metadata extensions must preserve QR protocol v1')
  assert.equal(metadataPayload.hostId, 'host-id-1234567890123456')
  assert.equal(metadataPayload.agentInstanceId, 'agent-id-123456789012345')
  assert.equal(metadataPayload.agentVersion, '0.1.1-rc.2')
  assert.deepEqual(metadataPayload.capabilities, [{ id: 'dsh.rpc', version: 1 }])

  let enrollmentBody = null
  const metadataAgent = new PublicRelayAgent(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    {
      agentVersion: '0.1.1-rc.2',
      adapterVersion: '1.1.0-public-research.8',
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
        return new Response(JSON.stringify({ ticket: 'ticket', expiresAt: Date.now() + 60000 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
  await metadataAgent.enroll()
  assert.equal(enrollmentBody.agentVersion, '0.1.1-rc.2')
  assert.equal(enrollmentBody.adapterVersion, '1.1.0-public-research.8')
  assert.equal(enrollmentBody.hostId, 'host-id-1234567890123456')
  assert.equal(enrollmentBody.agentInstanceId, 'agent-id-123456789012345')
  assert.deepEqual(enrollmentBody.capabilities, [{ id: 'dsh.rpc', version: 1 }])

  const atomicPath = path.join(root, 'atomic-state.json')
  writePrivateJsonAtomic(atomicPath, { generation: 1 })
  writePrivateJsonAtomic(atomicPath, { generation: 2 })
  assert.deepEqual(JSON.parse(readFileSync(atomicPath, 'utf8')), { generation: 2 })

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

  // Regression: when the physical Agent socket drops, every cloud client id
  // from that socket is stale and must be removed before reconnecting.
  let staleTunnelClosed = false
  const gateway = new PublicRelayGateway(
    { enabled: true, relayOrigin: 'https://relay.example.test' },
    { agentVersion: 'test', identityPath: path.join(root, 'gateway-identity.json') },
  )
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
