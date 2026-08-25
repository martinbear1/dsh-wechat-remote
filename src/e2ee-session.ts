/** Harness Remote E2EE v1, Agent side. See docs/public-connectivity/E2EE-v1.md. */
import { randomBytes, sign } from 'node:crypto'
import nacl from 'tweetnacl'

const VERSION = 1
const PACKET_CLIENT_HELLO = 1
const PACKET_AGENT_HELLO = 2
const PACKET_SEALED = 3
const CLEAR_FINISH = 1
const CLEAR_ACK = 2
const CLEAR_DATA = 3
const CLIENT_HELLO_BYTES = 50
const MAX_CLEAR_BYTES = 1024 * 1024

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i]
  return mismatch === 0
}

function uint64(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('E2EE counter exhausted')
  const out = new Uint8Array(8)
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  out[0] = (high >>> 24) & 255
  out[1] = (high >>> 16) & 255
  out[2] = (high >>> 8) & 255
  out[3] = high & 255
  out[4] = (low >>> 24) & 255
  out[5] = (low >>> 16) & 255
  out[6] = (low >>> 8) & 255
  out[7] = low & 255
  return out
}

function readUint64(data: Uint8Array): number {
  if (data.length !== 8) throw new Error('Invalid E2EE counter')
  const high = data[0] * 0x1000000 + data[1] * 0x10000 + data[2] * 0x100 + data[3]
  const low = data[4] * 0x1000000 + data[5] * 0x10000 + data[6] * 0x100 + data[7]
  const value = high * 0x100000000 + low
  if (!Number.isSafeInteger(value)) throw new Error('E2EE counter exhausted')
  return value
}

function transcriptHash(nodeId: string, clientHello: Uint8Array, agentUnsigned: Uint8Array): Uint8Array {
  return nacl.hash(concat(
    utf8('HarnessRemote-E2EE-v1\0'),
    utf8(nodeId),
    new Uint8Array([0]),
    clientHello,
    agentUnsigned,
  ))
}

function derive(shared: Uint8Array, transcript: Uint8Array): Uint8Array {
  return nacl.hash(concat(utf8('HarnessRemote-E2EE-v1-KDF\0'), shared, transcript))
}

export interface AgentE2EEOptions {
  readonly nodeId: string
  readonly identityPrivateKeyPem: string
  readonly randomSecret?: Uint8Array
  readonly randomPrefix?: Uint8Array
}

export interface E2EEResult {
  readonly outbound?: readonly Uint8Array[]
  readonly ready?: boolean
  readonly data?: Uint8Array
}

export class AgentE2EESession {
  private readonly nodeId: string
  private readonly identityPrivateKeyPem: string
  private readonly keyPair: nacl.BoxKeyPair
  private readonly sendPrefix: Uint8Array
  private receivePrefix: Uint8Array | null = null
  private txKey: Uint8Array | null = null
  private rxKey: Uint8Array | null = null
  private transcript: Uint8Array | null = null
  private state: 'waiting-client' | 'waiting-finish' | 'ready' = 'waiting-client'
  private txCounter = 0
  private rxCounter = 0

  constructor(options: AgentE2EEOptions) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(options.nodeId)) throw new Error('Invalid Agent nodeId')
    const secret = options.randomSecret || randomBytes(32)
    const prefix = options.randomPrefix || randomBytes(16)
    if (secret.length !== 32 || prefix.length !== 16) throw new Error('Invalid E2EE random material')
    this.nodeId = options.nodeId
    this.identityPrivateKeyPem = options.identityPrivateKeyPem
    this.keyPair = nacl.box.keyPair.fromSecretKey(new Uint8Array(secret))
    this.sendPrefix = new Uint8Array(prefix)
  }

  receive(rawPacket: Uint8Array): E2EEResult {
    const packet = new Uint8Array(rawPacket)
    if (this.state === 'waiting-client') return this.receiveClientHello(packet)
    if (this.state === 'waiting-finish') {
      const clear = this.openPacket(packet)
      if (!this.transcript || clear[0] !== CLEAR_FINISH || !equal(clear.subarray(1), this.transcript)) {
        throw new Error('Client key confirmation failed')
      }
      const ack = this.sealClear(concat(new Uint8Array([CLEAR_ACK]), this.transcript))
      this.state = 'ready'
      return { outbound: [ack], ready: true }
    }
    const clear = this.openPacket(packet)
    if (clear[0] !== CLEAR_DATA) throw new Error('Invalid E2EE clear-frame type')
    return { data: clear.subarray(1) }
  }

  seal(data: Uint8Array): Uint8Array {
    if (this.state !== 'ready') throw new Error('E2EE session is not ready')
    const clear = new Uint8Array(data)
    if (clear.length > MAX_CLEAR_BYTES) throw new Error('E2EE clear frame exceeds 1 MiB')
    return this.sealClear(concat(new Uint8Array([CLEAR_DATA]), clear))
  }

  private receiveClientHello(packet: Uint8Array): E2EEResult {
    if (packet.length !== CLIENT_HELLO_BYTES || packet[0] !== PACKET_CLIENT_HELLO || packet[1] !== VERSION) {
      throw new Error('Invalid client E2EE hello')
    }
    const agentUnsigned = concat(
      new Uint8Array([PACKET_AGENT_HELLO, VERSION]),
      this.keyPair.publicKey,
      this.sendPrefix,
    )
    const transcript = transcriptHash(this.nodeId, packet, agentUnsigned)
    const signature = sign(null, Buffer.from(transcript), this.identityPrivateKeyPem)
    if (signature.length !== nacl.sign.signatureLength) throw new Error('Invalid Agent identity signature')
    const shared = nacl.box.before(packet.subarray(2, 34), this.keyPair.secretKey)
    const master = derive(shared, transcript)
    this.rxKey = master.subarray(0, 32)
    this.txKey = master.subarray(32, 64)
    this.receivePrefix = packet.subarray(34, 50)
    this.transcript = transcript
    this.state = 'waiting-finish'
    return { outbound: [concat(agentUnsigned, signature)] }
  }

  private sealClear(clear: Uint8Array): Uint8Array {
    if (!this.txKey) throw new Error('E2EE send key is unavailable')
    const counterBytes = uint64(this.txCounter)
    this.txCounter += 1
    const nonce = concat(this.sendPrefix, counterBytes)
    return concat(
      new Uint8Array([PACKET_SEALED, VERSION]),
      counterBytes,
      nacl.secretbox(clear, nonce, this.txKey),
    )
  }

  private openPacket(packet: Uint8Array): Uint8Array {
    if (!this.rxKey || !this.receivePrefix) throw new Error('E2EE receive key is unavailable')
    if (packet.length < 27 || packet[0] !== PACKET_SEALED || packet[1] !== VERSION) throw new Error('Invalid E2EE sealed packet')
    const counterBytes = packet.subarray(2, 10)
    if (readUint64(counterBytes) !== this.rxCounter) throw new Error('E2EE replay or out-of-order packet')
    const clear = nacl.secretbox.open(packet.subarray(10), concat(this.receivePrefix, counterBytes), this.rxKey)
    if (!clear) throw new Error('E2EE authentication failed')
    this.rxCounter += 1
    return clear
  }
}
