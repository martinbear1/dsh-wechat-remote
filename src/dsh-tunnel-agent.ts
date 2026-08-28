/** Multiplexes authenticated E2EE streams onto the local DSH HTTP/WebSocket API. */
import http, { type ClientRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import { WebSocket } from 'ws'

const VERSION = 1
const OPEN = 1
const ACCEPT = 2
const DATA = 3
const END = 4
const ERROR = 5
const CANCEL = 6
const BATCH = 7
const KIND_HTTP = 'http'
const KIND_WEBSOCKET = 'websocket'
const FLAG_BINARY = 1
const FLAG_FINAL = 2
const HEADER_BYTES = 8
const MAX_METADATA_BYTES = 16 * 1024
const MAX_CHUNK_BYTES = 192 * 1024
const MAX_REQUEST_BYTES = 16 * 1024 * 1024
const SEND_QUEUE_PAUSE_BYTES = 2 * 1024 * 1024
const SEND_QUEUE_RESUME_BYTES = 512 * 1024
const MAX_SEND_QUEUE_BYTES = 4 * 1024 * 1024
const EVENT_BATCH_DELAY_MS = 32
const EVENT_BATCH_MAX_BYTES = 4 * 1024
const EVENT_BATCH_HEADER_BYTES = 5
const EVENT_BATCH_CAPABILITY_HEADER = 'x-harness-transport-batch'
const LAN_CREDENTIAL_PATH = '/api/wechat-remote/lan-credential'
const LAN_CREDENTIAL_ROTATE_PATH = '/api/wechat-remote/lan-credential/rotate'
const REMOTE_PROMPT_PATH = '/api/wechat-remote/session.prompt'
const MAX_REMOTE_PROMPT_BYTES = 256 * 1024
const REMOTE_ATTACHMENT_CONCURRENCY = 3
type ByteArray = Uint8Array<ArrayBufferLike>

function concat(...parts: readonly ByteArray[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

function uint32(value: number, out: Uint8Array, offset: number): void {
  out[offset] = (value >>> 24) & 255
  out[offset + 1] = (value >>> 16) & 255
  out[offset + 2] = (value >>> 8) & 255
  out[offset + 3] = value & 255
}

function readUint32(data: Uint8Array, offset: number): number {
  return data[offset] * 0x1000000 + data[offset + 1] * 0x10000 + data[offset + 2] * 0x100 + data[offset + 3]
}

function encode(type: number, streamId: number, flags = 0, payload: ByteArray = new Uint8Array(0)): Uint8Array {
  if (payload.length > MAX_CHUNK_BYTES && type === DATA) throw new Error('Tunnel data chunk is too large')
  if (payload.length > MAX_METADATA_BYTES && type !== DATA) throw new Error('Tunnel metadata is too large')
  const frame = new Uint8Array(HEADER_BYTES + payload.length)
  frame[0] = VERSION
  frame[1] = type
  uint32(streamId, frame, 2)
  frame[6] = flags
  frame[7] = 0
  frame.set(payload, HEADER_BYTES)
  return frame
}

function decode(frame: ByteArray) {
  if (frame.length < HEADER_BYTES || frame[0] !== VERSION || frame[7] !== 0) throw new Error('Invalid DSH tunnel frame')
  const streamId = readUint32(frame, 2)
  if (!streamId || (streamId & 1) !== 1) throw new Error('Invalid client stream ID')
  return { type: frame[1], streamId, flags: frame[6], payload: frame.subarray(HEADER_BYTES) }
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function parseJson(payload: Uint8Array): Record<string, unknown> {
  if (payload.length > MAX_METADATA_BYTES) throw new Error('Tunnel metadata is too large')
  try { return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown> }
  catch { throw new Error('Invalid tunnel metadata') }
}

function safePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/api/')) throw new Error('Only local DSH /api paths are allowed')
  if (/[\u0000-\u001f\\]/.test(value) || value.startsWith('//')) throw new Error('Invalid local DSH path')
  const parsed = new URL(value, 'http://dsh.local')
  if (parsed.origin !== 'http://dsh.local' || !parsed.pathname.startsWith('/api/')) throw new Error('Invalid local DSH path')
  return parsed.pathname + parsed.search
}

function safeMethod(value: unknown): string {
  const method = typeof value === 'string' ? value.toUpperCase() : ''
  if (!['GET', 'POST', 'DELETE'].includes(method)) throw new Error('DSH HTTP method is not allowed')
  return method
}

function requestHeaders(value: unknown): Record<string, string> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const out: Record<string, string> = {
    accept: 'application/json',
    'accept-encoding': 'identity',
    'user-agent': 'HarnessRemote-PublicAgent/1',
  }
  if (typeof source['content-type'] === 'string' && source['content-type'].length <= 128) {
    out['content-type'] = source['content-type']
  }
  return out
}

function responseHeaders(headers: IncomingHttpHeaders): Record<string, string | readonly string[]> {
  const blocked = new Set(['connection', 'transfer-encoding', 'set-cookie', 'content-encoding'])
  const out: Record<string, string | readonly string[]> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (blocked.has(key) || value === undefined) continue
    if (typeof value === 'string' && value.length <= 4096) out[key] = value
    else if (Array.isArray(value)) out[key] = value.filter(item => item.length <= 4096).slice(0, 16)
  }
  return out
}

function pieces(data: ByteArray): readonly ByteArray[] {
  if (data.length === 0) return [new Uint8Array(0)]
  const out: Uint8Array[] = []
  for (let offset = 0; offset < data.length; offset += MAX_CHUNK_BYTES) {
    out.push(data.subarray(offset, Math.min(offset + MAX_CHUNK_BYTES, data.length)))
  }
  return out
}

function batchPayload(messages: readonly { readonly flags: number; readonly payload: ByteArray }[]): Uint8Array {
  const out = new Uint8Array(messages.reduce((sum, message) => sum + EVENT_BATCH_HEADER_BYTES + message.payload.length, 0))
  let offset = 0
  for (const message of messages) {
    out[offset] = message.flags
    uint32(message.payload.length, out, offset + 1)
    offset += EVENT_BATCH_HEADER_BYTES
    out.set(message.payload, offset)
    offset += message.payload.length
  }
  return out
}

function supportsEventBatch(value: Record<string, unknown>): boolean {
  const headers = value.headers && typeof value.headers === 'object'
    ? value.headers as Record<string, unknown>
    : {}
  return headers[EVENT_BATCH_CAPABILITY_HEADER] === '1'
}

function isStreamDelta(message: ByteArray, isBinary: boolean): boolean {
  if (isBinary || message.length === 0 || message.length > EVENT_BATCH_MAX_BYTES) return false
  try {
    const root = JSON.parse(new TextDecoder().decode(message)) as Record<string, any>
    const event = root?.event || root?.payload?.event || root?.payload?.payload?.event
    const chunk = event?.data?.chunk
    return event?.type === 'assistant/chunk' &&
      (chunk?.type === 'text-delta' || chunk?.type === 'reasoning-delta')
  } catch {
    return false
  }
}

interface HttpStream {
  readonly kind: 'http'
  readonly request: ClientRequest
  response?: IncomingMessage
  paused: boolean
  bytes: number
}

interface WebSocketStream {
  readonly kind: 'websocket'
  readonly socket: WebSocket
  fragments: ByteArray[]
  fragmentBytes: number
  paused: boolean
  readonly batchEnabled: boolean
  batchMessages: { flags: number; payload: ByteArray }[]
  batchBytes: number
  batchTimer: NodeJS.Timeout | null
  deltaBurstStarted: boolean
}

interface RemotePromptStream {
  readonly kind: 'remote-prompt'
  readonly controller: AbortController
  chunks: ByteArray[]
  bytes: number
}

interface AdapterHttpStream {
  readonly kind: 'adapter-http'
  readonly controller: AbortController
  readonly path: string
  readonly method: string
  readonly headers: Record<string, string>
  chunks: ByteArray[]
  bytes: number
}

interface AdapterWebSocketStream {
  readonly kind: 'adapter-websocket'
  readonly controller: AbortController
}

type Stream = HttpStream | WebSocketStream | RemotePromptStream | AdapterHttpStream | AdapterWebSocketStream

export interface DshTunnelAgentOptions {
  readonly send: (frame: ByteArray) => void | Promise<void>
  readonly dshPort?: number
  readonly maxStreams?: number
  /**
   * Public-E2EE-only route bootstrap. It is handled inside this virtual tunnel
   * and is never forwarded to DSH/WebUI or exposed on the LAN HTTP door.
   */
  readonly issueLanCredential?: (rotate?: boolean) => { readonly baseUrl: string; readonly token: string }
  readonly materializeAttachment?: (descriptor: unknown, signal: AbortSignal) => Promise<{
    readonly descriptor: { readonly mediaType: string; readonly name?: string }
    readonly data: ByteArray
  }>
  readonly fetchDsh?: (request: {
    readonly path: string
    readonly method: string
    readonly headers?: Readonly<Record<string, string>>
    readonly body?: Uint8Array
    readonly signal?: AbortSignal
  }) => Promise<Response>
  readonly openDshEvents?: (path: string, signal: AbortSignal) => AsyncIterable<Uint8Array>
}

export class DshTunnelAgent {
  private readonly sendCallback: DshTunnelAgentOptions['send']
  private readonly dshPort: number
  private readonly maxStreams: number
  private readonly issueLanCredential?: DshTunnelAgentOptions['issueLanCredential']
  private readonly materializeAttachment?: DshTunnelAgentOptions['materializeAttachment']
  private readonly fetchDsh?: DshTunnelAgentOptions['fetchDsh']
  private readonly openDshEvents?: DshTunnelAgentOptions['openDshEvents']
  private readonly streams = new Map<number, Stream>()
  private sendChain: Promise<void> = Promise.resolve()
  private pendingSendBytes = 0
  private closed = false

  constructor(options: DshTunnelAgentOptions) {
    this.sendCallback = options.send
    this.dshPort = options.dshPort || 3080
    this.maxStreams = options.maxStreams || 128
    this.issueLanCredential = options.issueLanCredential
    this.materializeAttachment = options.materializeAttachment
    this.fetchDsh = options.fetchDsh
    this.openDshEvents = options.openDshEvents
  }

  receive(rawFrame: ByteArray): void {
    if (this.closed) throw new Error('DSH tunnel is closed')
    const frame = decode(new Uint8Array(rawFrame))
    try {
      if (frame.type === OPEN) return this.open(frame.streamId, parseJson(frame.payload))
      const stream = this.streams.get(frame.streamId)
      if (!stream) return
      if (frame.type === DATA) return this.data(stream, frame.streamId, frame.flags, frame.payload)
      if (frame.type === END) return this.end(stream, frame.streamId, frame.payload)
      if (frame.type === CANCEL) return this.cancel(stream, frame.streamId)
      throw new Error('Client tunnel frame type is not allowed')
    } catch (error) {
      this.sendError(frame.streamId, error)
      const stream = this.streams.get(frame.streamId)
      if (stream) this.cancel(stream, frame.streamId)
    }
  }

  close(): void {
    this.closed = true
    for (const [id, stream] of this.streams) this.cancel(stream, id)
  }

  private open(streamId: number, value: Record<string, unknown>): void {
    if (this.streams.has(streamId)) throw new Error('Tunnel stream already exists')
    if (this.streams.size >= this.maxStreams) throw new Error('Too many concurrent DSH streams')
    const kind = value.kind
    const path = safePath(value.path)
    if (path === LAN_CREDENTIAL_PATH || path === LAN_CREDENTIAL_ROTATE_PATH) {
      if (kind !== KIND_HTTP || safeMethod(value.method) !== 'POST') throw new Error('LAN credential route requires POST')
      return this.openLanCredential(streamId, path === LAN_CREDENTIAL_ROTATE_PATH)
    }
    if (path === REMOTE_PROMPT_PATH) {
      if (kind !== KIND_HTTP || safeMethod(value.method) !== 'POST' || !this.materializeAttachment) {
        throw new Error('Encrypted prompt adapter is unavailable')
      }
      this.streams.set(streamId, {
        kind: 'remote-prompt',
        controller: new AbortController(),
        chunks: [],
        bytes: 0,
      })
      return
    }
    if (kind === KIND_HTTP) this.openHttp(streamId, path, value)
    else if (kind === KIND_WEBSOCKET) this.openWebSocket(streamId, path, value)
    else throw new Error('Tunnel stream kind is not allowed')
  }

  private openLanCredential(streamId: number, rotate: boolean): void {
    if (!this.issueLanCredential) throw new Error('LAN route bootstrap is unavailable')
    const credential = this.issueLanCredential(rotate)
    if (!credential || typeof credential.baseUrl !== 'string' || typeof credential.token !== 'string') {
      throw new Error('LAN route bootstrap returned invalid data')
    }
    const body = json({ ok: true, value: credential })
    this.queue(encode(ACCEPT, streamId, 0, json({
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })))
    for (const part of pieces(body)) this.queue(encode(DATA, streamId, 0, part))
    this.queue(encode(END, streamId))
  }

  private openHttp(streamId: number, path: string, value: Record<string, unknown>): void {
    if (this.fetchDsh) {
      this.streams.set(streamId, {
        kind: 'adapter-http',
        controller: new AbortController(),
        path,
        method: safeMethod(value.method),
        headers: requestHeaders(value.headers),
        chunks: [],
        bytes: 0,
      })
      return
    }
    const request = http.request({
      host: '127.0.0.1',
      port: this.dshPort,
      path,
      method: safeMethod(value.method),
      headers: requestHeaders(value.headers),
      timeout: 30_000,
    }, response => {
      const active = this.streams.get(streamId)
      if (active?.kind === KIND_HTTP) active.response = response
      this.queue(encode(ACCEPT, streamId, 0, json({
        statusCode: response.statusCode || 502,
        headers: responseHeaders(response.headers),
      })))
      response.on('data', chunk => {
        for (const part of pieces(Buffer.from(chunk))) this.queue(encode(DATA, streamId, 0, part))
        const current = this.streams.get(streamId)
        if (this.pendingSendBytes >= SEND_QUEUE_PAUSE_BYTES && current?.kind === KIND_HTTP && !current.paused) {
          current.paused = true
          response.pause()
        }
      })
      response.on('end', () => {
        this.streams.delete(streamId)
        this.queue(encode(END, streamId))
      })
      response.on('error', error => this.fail(streamId, error))
    })
    const stream: HttpStream = { kind: KIND_HTTP, request, paused: false, bytes: 0 }
    this.streams.set(streamId, stream)
    request.on('timeout', () => request.destroy(new Error('Local DSH request timed out')))
    request.on('error', error => this.fail(streamId, error))
  }

  private openWebSocket(streamId: number, path: string, value: Record<string, unknown>): void {
    if (this.openDshEvents) {
      const controller = new AbortController()
      const stream: AdapterWebSocketStream = { kind: 'adapter-websocket', controller }
      this.streams.set(streamId, stream)
      this.queue(encode(ACCEPT, streamId, 0, json({ opened: true })))
      void (async () => {
        try {
          for await (const message of this.openDshEvents!(path, controller.signal)) {
            if (this.streams.get(streamId) !== stream) return
            const parts = pieces(message)
            parts.forEach((part, index) => this.queue(encode(
              DATA,
              streamId,
              index === parts.length - 1 ? FLAG_FINAL : 0,
              part,
            )))
          }
          if (this.streams.get(streamId) === stream) {
            this.streams.delete(streamId)
            this.queue(encode(END, streamId, 0, json({ code: 1000, reason: '' })))
          }
        } catch (error) {
          if (!controller.signal.aborted) this.fail(streamId, error as Error)
        }
      })()
      return
    }
    const socket = new WebSocket(`ws://127.0.0.1:${this.dshPort}${path}`, {
      headers: { 'user-agent': 'HarnessRemote-PublicAgent/1' },
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
      handshakeTimeout: 10_000,
    })
    const stream: WebSocketStream = {
      kind: KIND_WEBSOCKET,
      socket,
      fragments: [],
      fragmentBytes: 0,
      paused: false,
      batchEnabled: supportsEventBatch(value),
      batchMessages: [],
      batchBytes: 0,
      batchTimer: null,
      deltaBurstStarted: false,
    }
    this.streams.set(streamId, stream)
    socket.on('open', () => this.queue(encode(ACCEPT, streamId, 0, json({ opened: true }))))
    socket.on('message', (data, isBinary) => {
      const message = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(new Uint8Array(data))
      this.sendWebSocketMessage(streamId, stream, message, isBinary)
      const current = this.streams.get(streamId)
      if (this.pendingSendBytes >= SEND_QUEUE_PAUSE_BYTES && current?.kind === KIND_WEBSOCKET && !current.paused) {
        current.paused = true
        socket.pause()
      }
    })
    socket.on('close', (code, reason) => {
      this.flushEventBatch(streamId, stream)
      this.streams.delete(streamId)
      this.queue(encode(END, streamId, 0, json({ code, reason: reason.toString().slice(0, 256) })))
    })
    socket.on('error', error => this.fail(streamId, error))
  }

  private sendWebSocketMessage(streamId: number, stream: WebSocketStream, message: ByteArray, isBinary: boolean): void {
    const flags = (isBinary ? FLAG_BINARY : 0) | FLAG_FINAL
    if (stream.batchEnabled && isStreamDelta(message, isBinary)) {
      if (!stream.deltaBurstStarted) {
        stream.deltaBurstStarted = true
        this.flushEventBatch(streamId, stream)
        this.queue(encode(DATA, streamId, flags, message))
        return
      }
      const encodedBytes = EVENT_BATCH_HEADER_BYTES + message.length
      if (stream.batchBytes + encodedBytes > EVENT_BATCH_MAX_BYTES) this.flushEventBatch(streamId, stream)
      stream.batchMessages.push({ flags, payload: new Uint8Array(message) })
      stream.batchBytes += encodedBytes
      if (!stream.batchTimer) {
        stream.batchTimer = setTimeout(() => this.flushEventBatch(streamId, stream), EVENT_BATCH_DELAY_MS)
        stream.batchTimer.unref?.()
      }
      return
    }

    this.flushEventBatch(streamId, stream)
    stream.deltaBurstStarted = false
    const messagePieces = pieces(message)
    messagePieces.forEach((part, index) => {
      const partFlags = (isBinary ? FLAG_BINARY : 0) | (index === messagePieces.length - 1 ? FLAG_FINAL : 0)
      this.queue(encode(DATA, streamId, partFlags, part))
    })
  }

  private flushEventBatch(streamId: number, stream: WebSocketStream): void {
    if (stream.batchTimer) clearTimeout(stream.batchTimer)
    stream.batchTimer = null
    if (!stream.batchMessages.length) return
    const messages = stream.batchMessages
    stream.batchMessages = []
    stream.batchBytes = 0
    this.queue(encode(BATCH, streamId, 0, batchPayload(messages)))
  }

  private data(stream: Stream, streamId: number, flags: number, payload: ByteArray): void {
    if (stream.kind === 'remote-prompt') {
      stream.bytes += payload.length
      if (stream.bytes > MAX_REMOTE_PROMPT_BYTES) throw new Error('Encrypted prompt descriptor exceeds 256 KiB')
      stream.chunks.push(new Uint8Array(payload))
      return
    }
    if (stream.kind === KIND_HTTP) {
      stream.bytes += payload.length
      if (stream.bytes > MAX_REQUEST_BYTES) throw new Error('DSH request exceeds 16 MiB')
      stream.request.write(payload)
      return
    }
    if (stream.kind === 'adapter-http') {
      stream.bytes += payload.length
      if (stream.bytes > MAX_REQUEST_BYTES) throw new Error('DSH request exceeds 16 MiB')
      stream.chunks.push(new Uint8Array(payload))
      return
    }
    if (stream.kind === 'adapter-websocket') {
      throw new Error('DSH event streams are server-to-client only')
    }
    stream.fragmentBytes += payload.length
    if (stream.fragmentBytes > 1024 * 1024) throw new Error('DSH WebSocket message exceeds 1 MiB')
    stream.fragments.push(new Uint8Array(payload))
    if (!(flags & FLAG_FINAL)) return
    const message = concat(...stream.fragments)
    stream.fragments = []
    stream.fragmentBytes = 0
    stream.socket.send(message, { binary: Boolean(flags & FLAG_BINARY) })
  }

  private end(stream: Stream, streamId: number, payload: ByteArray): void {
    if (stream.kind === 'remote-prompt') {
      void this.forwardRemotePrompt(streamId, stream)
      return
    }
    if (stream.kind === 'adapter-http') {
      void this.forwardAdapterHttp(streamId, stream)
    } else if (stream.kind === 'adapter-websocket') {
      stream.controller.abort(new Error('DSH event client closed'))
      this.streams.delete(streamId)
    } else if (stream.kind === KIND_HTTP) stream.request.end()
    else {
      const value = payload.length ? parseJson(payload) : {}
      const code = typeof value.code === 'number' ? value.code : 1000
      const reason = typeof value.reason === 'string' ? value.reason.slice(0, 123) : ''
      stream.socket.close(code, reason)
      this.streams.delete(streamId)
    }
  }

  private async forwardAdapterHttp(streamId: number, stream: AdapterHttpStream): Promise<void> {
    try {
      const response = await this.fetchDsh!({
        path: stream.path,
        method: stream.method,
        headers: stream.headers,
        body: concat(...stream.chunks),
        signal: stream.controller.signal,
      })
      if (this.streams.get(streamId) !== stream) return
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        if (!['connection', 'transfer-encoding', 'set-cookie', 'content-encoding'].includes(key)) {
          headers[key] = value
        }
      })
      this.queue(encode(ACCEPT, streamId, 0, json({ statusCode: response.status, headers })))
      const reader = response.body?.getReader()
      if (reader) {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          for (const part of pieces(next.value)) this.queue(encode(DATA, streamId, 0, part))
        }
      }
      if (this.streams.get(streamId) === stream) {
        this.streams.delete(streamId)
        this.queue(encode(END, streamId))
      }
    } catch (error) {
      if (!stream.controller.signal.aborted) this.fail(streamId, error as Error)
    } finally {
      stream.chunks = []
      stream.bytes = 0
    }
  }

  private async forwardRemotePrompt(streamId: number, stream: RemotePromptStream): Promise<void> {
    try {
      const envelope = JSON.parse(new TextDecoder().decode(concat(...stream.chunks))) as Record<string, any>
      const content = envelope?.payload?.content
      if (envelope?.type !== 'client-request' || envelope?.method !== 'session.prompt' || !Array.isArray(content)) {
        throw new Error('Encrypted prompt envelope is invalid')
      }
      const remoteIndexes: number[] = []
      const materialized = Array.from(content)
      for (let index = 0; index < content.length; index += 1) {
        const part = content[index]
        if (!part?.remoteAttachment) continue
        if (remoteIndexes.length >= 9 || part.type !== 'image') {
          throw new Error('Encrypted prompt attachment list is invalid')
        }
        remoteIndexes.push(index)
      }
      const workers = Array.from(
        { length: Math.min(REMOTE_ATTACHMENT_CONCURRENCY, remoteIndexes.length) },
        async (_unused, workerIndex) => {
          for (let cursor = workerIndex; cursor < remoteIndexes.length; cursor += REMOTE_ATTACHMENT_CONCURRENCY) {
            stream.controller.signal.throwIfAborted()
            const index = remoteIndexes[cursor]
            const part = content[index]
            const resolved = await this.materializeAttachment!(part.remoteAttachment, stream.controller.signal)
            materialized[index] = {
              type: 'image',
              mediaType: resolved.descriptor.mediaType,
              data: Buffer.from(resolved.data).toString('base64'),
              ...(resolved.descriptor.name ? { name: resolved.descriptor.name } : {}),
            }
          }
        },
      )
      await Promise.all(workers)
      const attachments = remoteIndexes.length
      if (!attachments) throw new Error('Encrypted prompt contains no remote attachment')
      envelope.payload.content = materialized
      if (this.streams.get(streamId) !== stream || this.closed) return
      this.streams.delete(streamId)
      this.openHttp(streamId, '/api/session.prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      const active = this.streams.get(streamId)
      if (!active || (active.kind !== KIND_HTTP && active.kind !== 'adapter-http')) {
        throw new Error('Local DSH prompt stream did not open')
      }
      const body = json(envelope)
      this.data(active, streamId, 0, body)
      this.end(active, streamId, new Uint8Array(0))
    } catch (error) {
      stream.controller.abort(error)
      if (this.streams.get(streamId) === stream) this.streams.delete(streamId)
      this.sendError(streamId, error)
    } finally {
      stream.chunks = []
      stream.bytes = 0
    }
  }

  private cancel(stream: Stream, streamId: number): void {
    this.streams.delete(streamId)
    if (stream.kind === 'remote-prompt') {
      stream.controller.abort(new Error('Encrypted prompt cancelled'))
      stream.chunks = []
      stream.bytes = 0
    } else if (stream.kind === 'adapter-http' || stream.kind === 'adapter-websocket') {
      stream.controller.abort(new Error('DSH adapter stream cancelled'))
      if (stream.kind === 'adapter-http') {
        stream.chunks = []
        stream.bytes = 0
      }
    } else if (stream.kind === KIND_HTTP) stream.request.destroy()
    else {
      if (stream.batchTimer) clearTimeout(stream.batchTimer)
      stream.batchTimer = null
      stream.batchMessages = []
      stream.batchBytes = 0
      stream.socket.terminate()
    }
  }

  private fail(streamId: number, error: Error): void {
    const stream = this.streams.get(streamId)
    if (!stream) return
    this.sendError(streamId, error)
    this.cancel(stream, streamId)
  }

  private sendError(streamId: number, error: unknown): void {
    const message = error instanceof Error ? error.message : 'DSH tunnel failed'
    this.queue(encode(ERROR, streamId, 0, json({ code: 'dsh-tunnel', message: message.slice(0, 256) })))
  }

  private queue(frame: ByteArray): void {
    if (this.closed) return
    const bytes = frame.byteLength
    if (this.pendingSendBytes + bytes > MAX_SEND_QUEUE_BYTES) {
      // An authenticated client can request a very large DSH response. Bound
      // the promise backlog inside the DSH process instead of buffering until
      // the desktop is out of memory.
      this.close()
      return
    }
    this.pendingSendBytes += bytes
    this.sendChain = this.sendChain
      .then(() => this.closed ? undefined : this.sendCallback(frame))
      .then(() => undefined)
      .catch(() => this.close())
      .finally(() => {
        this.pendingSendBytes = Math.max(0, this.pendingSendBytes - bytes)
        if (!this.closed && this.pendingSendBytes <= SEND_QUEUE_RESUME_BYTES) this.resumeSources()
      })
  }

  private resumeSources(): void {
    for (const stream of this.streams.values()) {
      if (stream.kind === 'remote-prompt' || stream.kind === 'adapter-http'
          || stream.kind === 'adapter-websocket' || !stream.paused) continue
      stream.paused = false
      if (stream.kind === KIND_HTTP) stream.response?.resume()
      else stream.socket.resume()
    }
  }
}
