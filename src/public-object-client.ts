import { randomBytes, sign } from 'node:crypto'
import type { AgentIdentity } from './public-relay-agent.js'

interface SignedTransfer {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly expiresIn: number
}
interface ObjectTicket {
  readonly objectId: string
  readonly purpose: 'attachment' | 'artifact' | 'history'
  readonly expectedBytes: number
  readonly expiresAt: number
  readonly upload?: SignedTransfer
  readonly download?: SignedTransfer
}

function proofMessage(method: string, pathname: string, nodeId: string, timestamp: number, nonce: string): Buffer {
  return Buffer.from(`agent-http\n${method.toUpperCase()}\n${pathname}\n${nodeId}\n${timestamp}\n${nonce}`)
}

export class PublicObjectClient {
  constructor(
    private readonly relayOrigin: string,
    private readonly identity: AgentIdentity,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async download(objectId: string, expectedMaximum = 20 * 1024 * 1024 + 4096): Promise<Uint8Array> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(objectId)) throw new Error('Invalid encrypted object ID')
    const pathname = `/v1/agents/${this.identity.nodeId}/objects/${objectId}/download`
    const ticket = await this.requestJson<ObjectTicket>('GET', pathname)
    if (!ticket.download || ticket.expectedBytes < 17 || ticket.expectedBytes > expectedMaximum) {
      throw new Error('Encrypted attachment ticket is invalid')
    }
    const response = await this.fetchImpl(ticket.download.url, {
      method: 'GET',
      headers: ticket.download.headers || {},
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Encrypted attachment download failed with HTTP ${response.status}`)
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.length !== ticket.expectedBytes) throw new Error('Encrypted attachment length mismatch')
    return body
  }

  async upload(purpose: 'artifact' | 'history', body: Uint8Array): Promise<ObjectTicket> {
    const pathname = `/v1/agents/${this.identity.nodeId}/objects`
    const ticket = await this.requestJson<ObjectTicket>('POST', pathname, {
      purpose,
      expectedBytes: body.length,
    })
    if (!ticket.upload || ticket.expectedBytes !== body.length) throw new Error('Encrypted object upload ticket is invalid')
    const uploaded = await this.fetchImpl(ticket.upload.url, {
      method: 'PUT',
      headers: ticket.upload.headers || {},
      body: Buffer.from(body),
      signal: AbortSignal.timeout(60_000),
    })
    if (!uploaded.ok) throw new Error(`Encrypted object upload failed with HTTP ${uploaded.status}`)
    const completePath = `${pathname}/${ticket.objectId}/complete`
    return this.requestJson<ObjectTicket>('POST', completePath, {})
  }

  private async requestJson<T>(method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<T> {
    const timestamp = Date.now()
    const nonce = randomBytes(18).toString('base64url')
    const signature = sign(
      null,
      proofMessage(method, pathname, this.identity.nodeId, timestamp, nonce),
      this.identity.privateKeyPem,
    ).toString('base64url')
    const response = await this.fetchImpl(`${this.relayOrigin}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'x-hr-node-id': this.identity.nodeId,
        'x-hr-timestamp': String(timestamp),
        'x-hr-nonce': nonce,
        'x-hr-signature': signature,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`Encrypted object service failed with HTTP ${response.status}`)
    return await response.json() as T
  }
}
