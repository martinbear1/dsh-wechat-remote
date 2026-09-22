import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'

import { PublicObjectClient } from '../lib/public-object-client.js'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const identity = {
  nodeId: 'node-abcdefghijklmnop',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  publicKeyPem: '',
}
const objectId = 'object-abcdefghijklmnop'
const trustedOrigin = 'https://oss.example.test'

function assertBodyProof(url, options) {
  const h = options.headers
  assert.equal(h['x-hr-proof-version'], '2')
  const digest = createHash('sha256').update(options.body ?? '', 'utf8').digest('hex')
  const message = Buffer.from(['agent-http-v2', options.method, new URL(url).pathname, identity.nodeId,
    h['x-hr-timestamp'], h['x-hr-nonce'], digest].join('\n'))
  assert.equal(verify(null, message, publicKey, Buffer.from(h['x-hr-signature'], 'base64url')), true)
}

function uploadClient(upload, calls = [], completion = {}) {
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (new URL(url).origin === 'https://relay.example.test') assertBodyProof(url, options)
    if (String(url).endsWith('/objects')) {
      return Response.json({
        objectId,
        ...JSON.parse(options.body),
        expiresAt: Date.now() + 60_000,
        upload,
      })
    }
    if (String(url).includes('/complete')) {
      return Response.json(completion === null ? null : {
        objectId,
        ready: true,
        expiresAt: Date.now() + 60_000,
        ...completion,
      })
    }
    return new Response('', { status: 200 })
  }
  return { client: new PublicObjectClient('https://relay.example.test', identity, fetchImpl, [trustedOrigin]), calls }
}

const valid = uploadClient({
  url: `${trustedOrigin}/upload?signature=ok`,
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-OSS-Forbid-Overwrite': 'true',
  },
  expiresIn: 60,
})
await valid.client.upload('attachment', new Uint8Array([1, 2, 3]))
assert.equal(valid.calls.length, 3)
assert.equal(valid.calls[1].options.redirect, 'error')
assert.deepEqual(valid.calls[1].options.headers, {
  'content-type': 'application/octet-stream',
  'x-oss-forbid-overwrite': 'true',
})
assert.equal(valid.calls[0].options.redirect, 'error')

for (const purpose of ['attachment', 'artifact', 'history']) {
  const attempt = uploadClient({ url: `${trustedOrigin}/upload`, expiresIn: 60 })
  const completed = await attempt.client.upload(purpose, new Uint8Array([1, 2, 3]))
  assert.equal(completed.objectId, objectId)
  assert.equal(completed.purpose, purpose)
  assert.equal(completed.expectedBytes, 3)
  assert.equal(completed.upload, undefined)
}
for (const completion of [null, { ready: false }, { ready: undefined }, { ready: 'true' },
  { objectId: 'object-otherabcdefghijklmnop' }, { expiresAt: 0 }, { expiresAt: '9999999999999' }]) {
  const attempt = uploadClient({ url: `${trustedOrigin}/upload`, expiresIn: 60 }, [], completion)
  await assert.rejects(attempt.client.upload('artifact', new Uint8Array([1, 2, 3])), /completion ticket is invalid/)
}

for (const [label, upload, pattern] of [
  ['plain HTTP', { url: 'http://oss.example.test/upload', expiresIn: 60 }, /not trusted/],
  ['wrong host', { url: 'https://127.0.0.1/upload', expiresIn: 60 }, /not trusted/],
  ['custom port', { url: 'https://oss.example.test:8443/upload', expiresIn: 60 }, /not trusted/],
  ['credentials', { url: 'https://user:pass@oss.example.test/upload', expiresIn: 60 }, /not trusted/],
  ['fragment', { url: 'https://oss.example.test/upload#internal', expiresIn: 60 }, /not trusted/],
  ['authorization header', { url: `${trustedOrigin}/upload`, headers: { authorization: 'secret' }, expiresIn: 60 }, /headers/],
  ['cookie header', { url: `${trustedOrigin}/upload`, headers: { cookie: 'secret' }, expiresIn: 60 }, /headers/],
  ['wrong media type', { url: `${trustedOrigin}/upload`, headers: { 'content-type': 'text/plain' }, expiresIn: 60 }, /content type/],
  ['expired transfer', { url: `${trustedOrigin}/upload`, expiresIn: 0 }, /ticket is invalid/],
]) {
  const attempt = uploadClient(upload)
  await assert.rejects(attempt.client.upload('attachment', new Uint8Array([1, 2, 3])), pattern, label)
  assert.equal(attempt.calls.length, 1, `${label} must be rejected before contacting its target`)
}

const downloadCalls = []
const downloadClient = new PublicObjectClient('https://relay.example.test', identity, async (url, options = {}) => {
  downloadCalls.push({ url: String(url), options })
  if (String(url).startsWith('https://relay.example.test/')) {
    assertBodyProof(url, options)
    return Response.json({
      objectId,
      purpose: 'attachment',
      expectedBytes: 17,
      expiresAt: Date.now() + 60_000,
      download: { url: `${trustedOrigin}/download?signature=ok`, expiresIn: 60 },
    })
  }
  return new Response(Buffer.alloc(17, 7), { status: 200 })
}, [trustedOrigin])
assert.equal((await downloadClient.download(objectId)).length, 17)
assert.equal(downloadCalls[1].options.redirect, 'error')

let authAttempts = 0
const rejectedClient = new PublicObjectClient('https://relay.example.test', identity, async (url, options) => {
  authAttempts++
  assertBodyProof(url, options)
  return Response.json({ error: { code: 'invalid_agent_proof', message: 'Agent request proof is invalid' } }, { status: 401 })
}, [trustedOrigin])
await assert.rejects(rejectedClient.upload('artifact', new Uint8Array([1, 2, 3])), /proof is invalid/)
assert.equal(authAttempts, 1, 'authentication failure must not retry as legacy or switch OSS backends')

assert.throws(
  () => new PublicObjectClient('https://relay.example.test', identity, fetch, ['http://oss.example.test']),
  /bare HTTPS origin/,
)

console.log('public object ticket boundary tests passed')
