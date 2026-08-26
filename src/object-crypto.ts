import { randomBytes } from 'node:crypto'
import nacl from 'tweetnacl'

const ATTACHMENT_SCHEME = 'xsalsa20-poly1305-chunks-v1'
const ATTACHMENT_CHUNK_BYTES = 256 * 1024
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_CLOUD_OBJECT_BYTES = 256 * 1024 * 1024

export interface EncryptedCloudObjectDescriptor {
  readonly v: 1
  readonly scheme: typeof ATTACHMENT_SCHEME
  readonly objectId: string
  readonly key: string
  readonly noncePrefix: string
  readonly plainBytes: number
  readonly cipherBytes: number
  readonly chunkBytes: number
  readonly contentKind: 'image' | 'history-json' | 'artifact'
  readonly mediaType?: string
  readonly name?: string
}

export interface RemoteAttachmentDescriptor {
  readonly v: 1
  readonly scheme: typeof ATTACHMENT_SCHEME
  readonly objectId: string
  readonly key: string
  readonly noncePrefix: string
  readonly plainBytes: number
  readonly cipherBytes: number
  readonly chunkBytes: number
  readonly contentKind?: 'image'
  readonly mediaType: string
  readonly name?: string
}

function writeUint32(value: number, output: Uint8Array, offset: number): void {
  output[offset] = (value >>> 24) & 255
  output[offset + 1] = (value >>> 16) & 255
  output[offset + 2] = (value >>> 8) & 255
  output[offset + 3] = value & 255
}

function uint32(value: Uint8Array, offset: number): number {
  return value[offset] * 0x1000000 + value[offset + 1] * 0x10000 + value[offset + 2] * 0x100 + value[offset + 3]
}

function counterNonce(prefix: Uint8Array, counter: number): Uint8Array {
  const nonce = new Uint8Array(24)
  nonce.set(prefix, 0)
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  nonce[16] = (high >>> 24) & 255
  nonce[17] = (high >>> 16) & 255
  nonce[18] = (high >>> 8) & 255
  nonce[19] = high & 255
  nonce[20] = (low >>> 24) & 255
  nonce[21] = (low >>> 16) & 255
  nonce[22] = (low >>> 8) & 255
  nonce[23] = low & 255
  return nonce
}

function base64url(value: string, bytes: number, name: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${name} is invalid`)
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== bytes) throw new Error(`${name} is invalid`)
  return new Uint8Array(decoded)
}

export function validateRemoteAttachment(value: unknown): RemoteAttachmentDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Remote attachment descriptor is invalid')
  const source = value as Record<string, unknown>
  if (source.v !== 1 || source.scheme !== ATTACHMENT_SCHEME ||
      typeof source.objectId !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(source.objectId) ||
      !Number.isSafeInteger(source.plainBytes) || Number(source.plainBytes) < 1 || Number(source.plainBytes) > MAX_ATTACHMENT_BYTES ||
      !Number.isSafeInteger(source.cipherBytes) || Number(source.cipherBytes) < Number(source.plainBytes) + 20 ||
      source.chunkBytes !== ATTACHMENT_CHUNK_BYTES ||
      typeof source.mediaType !== 'string' || !/^image\/(png|jpeg|webp|gif)$/.test(source.mediaType)) {
    throw new Error('Remote attachment descriptor is invalid')
  }
  base64url(String(source.key), 32, 'Remote attachment key')
  base64url(String(source.noncePrefix), 16, 'Remote attachment nonce')
  return {
    v: 1,
    scheme: ATTACHMENT_SCHEME,
    objectId: source.objectId,
    key: String(source.key),
    noncePrefix: String(source.noncePrefix),
    plainBytes: Number(source.plainBytes),
    cipherBytes: Number(source.cipherBytes),
    chunkBytes: ATTACHMENT_CHUNK_BYTES,
    mediaType: source.mediaType,
    ...(typeof source.name === 'string' && source.name.length <= 255 ? { name: source.name } : {}),
  }
}

export function encryptCloudObject(
  plaintext: Uint8Array,
  contentKind: EncryptedCloudObjectDescriptor['contentKind'],
): { readonly ciphertext: Uint8Array; readonly descriptor: Omit<EncryptedCloudObjectDescriptor, 'objectId'> } {
  if (!plaintext.length || plaintext.length > MAX_CLOUD_OBJECT_BYTES) throw new Error('Cloud object size is invalid')
  const key = new Uint8Array(randomBytes(32))
  const noncePrefix = new Uint8Array(randomBytes(16))
  const chunks = Math.ceil(plaintext.length / ATTACHMENT_CHUNK_BYTES)
  const ciphertext = new Uint8Array(plaintext.length + chunks * (4 + nacl.secretbox.overheadLength))
  let offset = 0
  for (let index = 0; index < chunks; index += 1) {
    const start = index * ATTACHMENT_CHUNK_BYTES
    const sealed = nacl.secretbox(
      plaintext.subarray(start, Math.min(start + ATTACHMENT_CHUNK_BYTES, plaintext.length)),
      counterNonce(noncePrefix, index),
      key,
    )
    writeUint32(sealed.length, ciphertext, offset)
    offset += 4
    ciphertext.set(sealed, offset)
    offset += sealed.length
  }
  return {
    ciphertext,
    descriptor: {
      v: 1,
      scheme: ATTACHMENT_SCHEME,
      key: Buffer.from(key).toString('base64url'),
      noncePrefix: Buffer.from(noncePrefix).toString('base64url'),
      plainBytes: plaintext.length,
      cipherBytes: ciphertext.length,
      chunkBytes: ATTACHMENT_CHUNK_BYTES,
      contentKind,
    },
  }
}

export function decryptCloudObject(ciphertext: Uint8Array, raw: EncryptedCloudObjectDescriptor): Uint8Array {
  if (!raw || raw.v !== 1 || raw.scheme !== ATTACHMENT_SCHEME || raw.chunkBytes !== ATTACHMENT_CHUNK_BYTES ||
      !Number.isSafeInteger(raw.plainBytes) || raw.plainBytes < 1 || raw.plainBytes > MAX_CLOUD_OBJECT_BYTES ||
      !Number.isSafeInteger(raw.cipherBytes) || raw.cipherBytes !== ciphertext.length) {
    throw new Error('Encrypted cloud object descriptor is invalid')
  }
  const key = base64url(raw.key, 32, 'Encrypted cloud object key')
  const prefix = base64url(raw.noncePrefix, 16, 'Encrypted cloud object nonce')
  const output = new Uint8Array(raw.plainBytes)
  let inputOffset = 0
  let outputOffset = 0
  let counter = 0
  while (inputOffset < ciphertext.length) {
    if (inputOffset + 4 > ciphertext.length) throw new Error('Encrypted cloud object chunk header is truncated')
    const length = uint32(ciphertext, inputOffset)
    inputOffset += 4
    if (length < nacl.secretbox.overheadLength || length > ATTACHMENT_CHUNK_BYTES + nacl.secretbox.overheadLength ||
        inputOffset + length > ciphertext.length) throw new Error('Encrypted cloud object chunk is invalid')
    const clear = nacl.secretbox.open(ciphertext.subarray(inputOffset, inputOffset + length), counterNonce(prefix, counter), key)
    if (!clear || outputOffset + clear.length > output.length) throw new Error('Encrypted cloud object authentication failed')
    output.set(clear, outputOffset)
    outputOffset += clear.length
    inputOffset += length
    counter += 1
  }
  if (outputOffset !== output.length || counter === 0) throw new Error('Encrypted cloud object plaintext length mismatch')
  return output
}

export function decryptRemoteAttachment(ciphertext: Uint8Array, raw: unknown): { descriptor: RemoteAttachmentDescriptor; data: Uint8Array } {
  const descriptor = validateRemoteAttachment(raw)
  const data = decryptCloudObject(ciphertext, { ...descriptor, contentKind: 'image' })
  return { descriptor, data }
}
