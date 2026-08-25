import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  agentNodeIdForPublicKey,
  loadOrCreateAgentIdentity,
  loadPublicRelayConfig,
  PublicRelayAgent,
  publicPairingPayload,
} from '../lib/public-relay-agent.js'
import PublicRelayGateway from '../lib/public-relay-gateway.js'

const root = mkdtempSync(path.join(tmpdir(), 'harness-public-relay-test-'))
try {
  const identityPath = path.join(root, 'identity.json')
  const first = loadOrCreateAgentIdentity(identityPath)
  const second = loadOrCreateAgentIdentity(identityPath)
  assert.deepEqual(second, first, 'Agent identity must be stable across restarts')
  assert.equal(agentNodeIdForPublicKey(first.publicKeyPem), first.nodeId)
  assert.equal(readFileSync(identityPath, 'utf8').includes('PRIVATE KEY'), true)

  const configPath = path.join(root, 'config.json')
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
