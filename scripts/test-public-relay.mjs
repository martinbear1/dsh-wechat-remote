import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  agentNodeIdForPublicKey,
  loadOrCreateAgentIdentity,
  loadPublicRelayConfig,
  publicPairingPayload,
} from '../lib/public-relay-agent.js'

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
  console.log('public relay identity/config/pairing tests ok')
} finally {
  rmSync(root, { recursive: true, force: true })
}
