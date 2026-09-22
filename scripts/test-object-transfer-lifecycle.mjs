import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as nodeTest } from 'node:test'
import { PublicObjectClient } from '../lib/public-object-client.js'
import { PublicRelayGateway } from '../lib/public-relay-gateway.js'

const relayOrigin = 'https://relay.example.test'
const primaryOrigin = 'https://primary-oss.example.test'
const backupOrigin = 'https://backup-oss.example.test'
const objectId = 'object-abcdefghijklmnop'
const { privateKey } = generateKeyPairSync('ed25519')
const identity = {
  nodeId: 'node-abcdefghijklmnop', publicKeyPem: '',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const test = (name, run) => nodeTest(name, { timeout: 5000 }, run)
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await tick() }
  assert.fail('controlled lifecycle fixture did not settle')
}
function enrollment() {
  return Response.json({ ticket: 'synthetic-local-only', expiresAt: Date.now() + 60_000 })
}
function gatewayFixture(t, fetchImpl, identityPath) {
  if (!identityPath) {
    const parent = path.resolve(tmpdir())
    const root = mkdtempSync(path.join(parent, 'harness-object-lifecycle-'))
    identityPath = path.join(root, 'identity.json')
    t.after(() => {
      assert.equal(path.dirname(path.resolve(root)), parent)
      assert(path.basename(root).startsWith('harness-object-lifecycle-'))
      rmSync(root, { recursive: true, force: true })
    })
  }
  const gateway = new PublicRelayGateway({ enabled: true, relayOrigin }, {
    agentVersion: 'synthetic-local-only', identityPath, fetchImpl,
    trustedObjectOrigins: [primaryOrigin],
  })
  // Keep the real enrollment lifecycle; no network sockets or installed profiles.
  let connects = 0
  gateway.agent.connect = () => { connects++ }
  t.after(() => gateway.stop())
  return { gateway, identityPath, connects: () => connects }
}

test('duplicate startup shares enrollment without background probes', async t => {
  const pending = deferred()
  let enrolls = 0, other = 0
  const { gateway, connects } = gatewayFixture(t, async url => {
    if (String(url).endsWith('/enroll')) { enrolls++; return pending.promise }
    other++; throw Error('unexpected request')
  })
  const first = gateway.start(), second = gateway.start()
  assert.equal(first, second)
  await until(() => enrolls === 1)
  pending.resolve(enrollment())
  await Promise.all([first, second])
  await gateway.start()
  assert.equal(enrolls, 1)
  assert.equal(connects(), 1)
  assert.equal(other, 0)
})
test('stop before startup or during enrollment cannot reactivate object operations', async t => {
  const pending = deferred()
  let enrolls = 0
  const { gateway, connects } = gatewayFixture(t, async () => { enrolls++; return pending.promise })
  const early = gateway.start()
  gateway.stop()
  await early
  assert.equal(enrolls, 0)
  const late = gateway.start()
  await until(() => enrolls === 1)
  gateway.stop()
  pending.resolve(enrollment())
  await late
  assert.equal(connects(), 0)
  await assert.rejects(gateway.objectClient.download(objectId), { name: 'AbortError' })
  assert.equal(gateway.agent.reconnectTimer, null)
})
test('restart during enrollment only activates the replacement startup', async t => {
  const pending = deferred()
  let enrolls = 0
  const { gateway, connects } = gatewayFixture(t, async () => { enrolls++; return pending.promise })
  const old = gateway.start()
  await until(() => enrolls === 1)
  gateway.stop()
  const replacement = gateway.start()
  pending.resolve(enrollment())
  await Promise.all([old, replacement])
  assert.equal(connects(), 1)
  assert.equal(gateway.objectClient.lifetime.signal.aborted, false)
})
test('stop aborts a transfer; a late success cannot affect restarted preferences', async () => {
  const result = deferred()
  let downloading = false, transferSignal
  const client = new PublicObjectClient(relayOrigin, identity, async (url, options) => {
    if (String(url).startsWith(relayOrigin)) return Response.json({
      objectId, purpose: 'attachment', expectedBytes: 17, expiresAt: Date.now() + 60000,
      download: { url: primaryOrigin + '/object', expiresIn: 60 },
    })
    downloading = true; transferSignal = options.signal
    return result.promise
  }, [primaryOrigin])
  const pending = client.download(objectId)
  await until(() => downloading)
  client.stop()
  assert.equal(transferSignal.aborted, true)
  client.start()
  result.resolve(new Response(Buffer.alloc(17)))
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(client.preferences.size, 0)
})
test('hot replacement is not stopped by an old enrollment result', async t => {
  const pending = deferred()
  let enrolls = 0
  const old = gatewayFixture(t, async () => { enrolls++; return pending.promise })
  const starting = old.gateway.start()
  await until(() => enrolls === 1)
  old.gateway.stop()
  const current = gatewayFixture(t, async () => enrollment(), old.identityPath)
  await current.gateway.start()
  pending.resolve(enrollment())
  await starting
  assert.equal(old.connects(), 0)
  assert.equal(current.connects(), 1)
  assert.equal(current.gateway.objectClient.lifetime.signal.aborted, false)
})
