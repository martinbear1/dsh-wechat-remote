import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import { Context } from '@deepseek-ai/cordis'
import WechatAttachmentService, { decodeNativeAttachment } from '../lib/attachment-service.js'
import { PublicObjectClient } from '../lib/public-object-client.js'

const image = Buffer.from('native-image-bytes')
const attachmentId = `sha256:${'a'.repeat(64)}`
const native = {
  ok: true,
  value: {
    attachment: {
      attachmentId,
      mediaType: 'image/png',
      bytes: image.length,
      width: 1,
      height: 1,
      name: 'native.png',
    },
    data: image.toString('base64'),
  },
}

const decoded = decodeNativeAttachment(native, { attachmentId })
assert.equal(Buffer.from(decoded.data).equals(image), true)
assert.equal(decoded.attachment.mediaType, 'image/png')
assert.throws(() => decodeNativeAttachment({
  ...native,
  value: { ...native.value, data: Buffer.from('wrong').toString('base64') },
}, { attachmentId }), /长度|length/)

let reads = 0
let stores = 0
let active = 0
let maximumActive = 0
const service = new WechatAttachmentService(new Context(), {
  async readAttachment(_sessionId, requestedId) {
    reads += 1
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise(resolve => setTimeout(resolve, 8))
    active -= 1
    return {
      ...native,
      value: {
        ...native.value,
        attachment: { ...native.value.attachment, attachmentId: requestedId },
      },
    }
  },
  async storeAttachment(_data, attachment) {
    stores += 1
    await new Promise(resolve => setTimeout(resolve, 8))
    return {
      v: 1,
      objectId: `object-${attachment.attachmentId.slice(-20)}`,
      contentKind: 'image',
      mediaType: attachment.mediaType,
      expiresAt: Date.now() + 10 * 60_000,
    }
  },
})

const request = {
  sessionId: 'session-native-auth',
  attachments: [{ attachmentId, mediaType: 'image/png', name: 'ignored-client-name.png' }],
}
const [first, merged] = await Promise.all([
  service.prepareBatch(request, new AbortController().signal),
  service.prepareBatch(request, new AbortController().signal),
])
assert.equal(first.ok, true)
assert.deepEqual(merged, first)
assert.equal(reads, 1, 'concurrent descriptor requests must coalesce')
assert.equal(stores, 1, 'concurrent descriptor uploads must coalesce')
assert.equal(first.value.descriptors[0].attachmentId, attachmentId)
assert.equal(first.value.descriptors[0].descriptor.mediaType, 'image/png')

const ids = Array.from({ length: 6 }, (_, index) => `sha256:${String(index).repeat(64)}`)
const ordered = await service.prepareBatch({
  sessionId: 'session-bounded',
  attachments: ids.map(id => ({ attachmentId: id })),
}, new AbortController().signal)
assert.equal(ordered.ok, true)
assert.deepEqual(ordered.value.descriptors.map(item => item.attachmentId), ids)
assert.ok(maximumActive <= 2, `batch native reads exceeded concurrency 2: ${maximumActive}`)

const noObjectService = new WechatAttachmentService(new Context(), {
  async readAttachment() { throw new Error('must not read without an object transport') },
})
const unavailable = await noObjectService.prepareBatch(request, new AbortController().signal)
assert.equal(unavailable.ok, false)
assert.equal(unavailable.error.code, 'attachment-object-unavailable')

const { privateKey } = generateKeyPairSync('ed25519')
const calls = []
const fetchImpl = async (url, options) => {
  calls.push({ url: String(url), options })
  if (String(url).endsWith('/objects')) {
    return new Response(JSON.stringify({
      objectId: 'object-abcdefghijklmnop',
      purpose: 'attachment',
      expectedBytes: 3,
      expiresAt: Date.now() + 60_000,
      upload: { url: 'https://oss.example/upload', expiresIn: 60 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (String(url) === 'https://oss.example/upload') return new Response('', { status: 200 })
  return new Response(JSON.stringify({
    objectId: 'object-abcdefghijklmnop',
    purpose: 'attachment',
    expectedBytes: 3,
    expiresAt: Date.now() + 60_000,
    ready: true,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const objects = new PublicObjectClient('https://relay.example', {
  nodeId: 'node-abcdefghijklmnop',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  publicKeyPem: '',
}, fetchImpl)
await objects.upload('attachment', new Uint8Array([1, 2, 3]))
assert.equal(JSON.parse(calls[0].options.body).purpose, 'attachment')
assert.equal(calls[1].options.method, 'PUT')
assert.match(calls[2].url, /\/complete$/)

console.log('attachment object service tests passed')
