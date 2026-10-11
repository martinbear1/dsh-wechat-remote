import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash, verify } from 'node:crypto'
import { ResourceDeliveryClient } from '../lib/private-resources/source.js'

const pair = generateKeyPairSync('ed25519')
const identity = { nodeId: 'test-node', publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
const payload = Buffer.from('{"fixture":"resource"}')
const release = { resourceId: 'test-resource', version: '1.0.0', name: '预设', description: '说明', kind: 'preset', bytes: payload.length, sha256: createHash('sha256').update(payload).digest('hex') }
const origin = 'https://relay.example.test', oss = 'https://bucket.oss-cn-shanghai.aliyuncs.com'
const catalog = { schemaVersion: 1, nodeId: identity.nodeId, accountInstance: 'account-one', items: [release] }
const ticket = { schemaVersion: 1, nodeId: identity.nodeId, accountInstance: 'account-one', release, download: { url: `${oss}/resource-delivery/v1/hash.json?signature=short-lived`, expiresIn: 300 } }
function fixture(overrides = {}) {
  const calls = []
  const connection = { identity, origin, objectOrigins: [oss], fetchImpl: async (address, options) => {
    const url = new URL(address); calls.push({ url, options })
    assert.equal(options.redirect, 'error')
    if (url.origin === oss) { assert.equal(options.headers, undefined); return overrides.object?.() ?? new Response(payload) }
    assert.equal(url.origin, origin)
    const headers = options.headers
    assert.equal(headers['x-hr-proof-version'], '2')
    const digest = createHash('sha256').update(options.body ?? '').digest('hex')
    const proof = `agent-http-v2\n${options.method}\n${url.pathname}\n${identity.nodeId}\n${headers['x-hr-timestamp']}\n${headers['x-hr-nonce']}\n${digest}`
    assert.ok(verify(null, Buffer.from(proof), pair.publicKey, Buffer.from(headers['x-hr-signature'], 'base64url')))
    if (overrides.response) return overrides.response(url, options)
    return Response.json(url.pathname.endsWith('/library') ? catalog : (overrides.ticket ?? ticket))
  } }
  return { connection, calls, client: new ResourceDeliveryClient({ current: () => connection }) }
}
const signal = () => new AbortController().signal
test('library is on-demand and bodyproofV2; download is direct OSS without identity headers', async () => {
  const f = fixture(); assert.equal(f.calls.length, 0)
  assert.deepEqual(await f.client.catalog(signal()), catalog)
  assert.deepEqual(await f.client.download(release, 'account-one', signal()), payload)
  assert.equal(f.calls.length, 3)
  assert.equal(f.calls[1].options.body, '{}')
})
test('forbidden grant, changed account and untrusted object origins cannot download', async () => {
  for (const [changes, code] of [
    [{ response: () => new Response('', { status: 403 }) }, 'resources-forbidden'],
    [{ ticket: { ...ticket, accountInstance: 'someone-else' } }, 'resources-closed'],
    [{ ticket: { ...ticket, download: { ...ticket.download, url: 'https://attacker.test/resource-delivery/a' } } }, 'resources-invalid'],
    [{ ticket: { ...ticket, release: { ...release, sha256: '0'.repeat(64) } } }, 'resources-invalid'],
  ]) {
    const f = fixture(changes)
    await assert.rejects(f.client.download(release, 'account-one', signal()), { code })
    assert.equal(f.calls.length, 1)
  }
})
test('oversized response is cancelled before buffering, normal errors contain no URLs', async () => {
  let cancelled = false
  const f = fixture({ object: () => new Response(new ReadableStream({ cancel() { cancelled = true } }), { headers: { 'content-length': '99999999' } }) })
  await assert.rejects(f.client.download(release, 'account-one', signal()), { code: 'resources-invalid' })
  assert.ok(cancelled)
})
test('account/node changes during asynchronous receipt invalidate the response', async () => {
  const f = fixture({ response: async () => {
    f.connection.identity = { ...identity, nodeId: 'different-node' }
    return Response.json(catalog)
  } })
  await assert.rejects(f.client.catalog(signal()), { code: 'resources-closed' })
})
test('missing account catalog, duplicate release and unsafe API origin are rejected', async () => {
  const f = fixture({ response: () => Response.json({ ...catalog, items: [release, release] }) })
  await assert.rejects(f.client.catalog(signal()), { code: 'resources-invalid' })
  f.connection.origin = 'http://127.0.0.1'
  await assert.rejects(f.client.catalog(signal()), { code: 'resources-invalid' })
})
