/** Multiplexes authenticated E2EE streams onto the local DSH HTTP/WebSocket API. */
import http, { type ClientRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import { WebSocket } from 'ws'
import type { DshCompatibilityTransport } from './dsh-compatibility-api.js'
import { TunnelSendQueue } from './tunnel-send-queue.js'
import { objectRpcBudget } from './object-transfer-budget.js'

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
const SEND_QUEUE_PAUSE_BYTES = 256 * 1024
const SEND_QUEUE_RESUME_BYTES = 64 * 1024
const SEND_CHUNK_BYTES = 16 * 1024
const EVENT_BATCH_DELAY_MS = 32
const EVENT_BATCH_MAX_BYTES = 4 * 1024
const EVENT_BATCH_HEADER_BYTES = 5
const EVENT_BATCH_CAPABILITY_HEADER = 'x-harness-transport-batch'
const LAN_CREDENTIAL_PATH = '/api/wechat-remote/lan-credential'
const LAN_CREDENTIAL_ROTATE_PATH = '/api/wechat-remote/lan-credential/rotate'
const REMOTE_PROMPT_PATH = '/api/wechat-remote/session.prompt'
const MAX_REMOTE_PROMPT_BYTES = 256 * 1024
const REMOTE_ATTACHMENT_CONCURRENCY = 2
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
  for (let offset = 0; offset < data.length; offset += SEND_CHUNK_BYTES) {
    out.push(data.subarray(offset, Math.min(offset + SEND_CHUNK_BYTES, data.length)))
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
  readonly path: string
  readonly request: ClientRequest
  response?: IncomingMessage
  paused: boolean
  bytes: number
}

interface EventBatchState {
  readonly batchEnabled: boolean
  batchMessages: { flags: number; payload: ByteArray }[]
  batchBytes: number
  batchTimer: NodeJS.Timeout | null
  deltaBurstStarted: boolean
}

interface WebSocketStream extends EventBatchState {
  readonly kind: 'websocket'
  readonly socket: WebSocket
  fragments: ByteArray[]
  fragmentBytes: number
  paused: boolean
}

interface CompatibilityHttpStream {
  readonly kind: 'compat-http'
  readonly controller: AbortController
  readonly path: string
  readonly method: string
  chunks: ByteArray[]
  bytes: number
  ended: boolean
}

interface CompatibilityEventStream extends EventBatchState {
  readonly kind: 'compat-events'
  detach: () => void
}

interface RemotePromptStream {
  readonly kind: 'remote-prompt'
  readonly controller: AbortController
  chunks: ByteArray[]
  bytes: number
}

type Stream = HttpStream | WebSocketStream | RemotePromptStream | CompatibilityHttpStream | CompatibilityEventStream

export interface DshTunnelAgentOptions {
  readonly send: (frame: ByteArray) => void | Promise<void>
  readonly dshPort?: number
  readonly maxStreams?: number
  /** Authenticated in-process dispatch for post-0.1.2 DSH. */
  readonly compatibilityApi?: DshCompatibilityTransport
  /**
   * Public-E2EE-only route bootstrap. It is handled inside this virtual tunnel
   * and is never forwarded to DSH/WebUI or exposed on the LAN HTTP door.
   */
  readonly issueLanCredential?: (rotate?: boolean) => { readonly baseUrl: string; readonly token: string }
  readonly materializeAttachment?: (descriptor: unknown, signal: AbortSignal) => Promise<{
    readonly descriptor: { readonly mediaType: string; readonly name?: string }
    readonly data: ByteArray
  }>
}

export class DshTunnelAgent {
  private readonly sendCallback: DshTunnelAgentOptions['send']
  private readonly dshPort: number
  private readonly maxStreams: number
  private readonly compatibilityApi?: DshCompatibilityTransport
  private readonly issueLanCredential?: DshTunnelAgentOptions['issueLanCredential']
  private readonly materializeAttachment?: DshTunnelAgentOptions['materializeAttachment']
  private readonly streams = new Map<number, Stream>()
  private readonly sendQueue: TunnelSendQueue
  private get pendingSendBytes(): number { return this.sendQueue.bytes }
  private closed = false

  constructor(options: DshTunnelAgentOptions) {
    this.sendCallback = options.send
    this.dshPort = options.dshPort || 3080
    this.maxStreams = options.maxStreams || 128
    this.compatibilityApi = options.compatibilityApi
    this.issueLanCredential = options.issueLanCredential
    this.materializeAttachment = options.materializeAttachment
    this.sendQueue = new TunnelSendQueue({
      send: frame => this.sendCallback(frame),
      onFailure: () => this.close(),
      onDrain: () => { if (!this.closed && this.pendingSendBytes <= SEND_QUEUE_RESUME_BYTES) this.resumeSources() },
      onOverflow: id => {
        const stream = this.streams.get(id)
        if (stream) this.cancel(stream, id)
        // Drop only this producer, not unrelated realtime streams. Completion
        // and error markers share a bounded reserve beyond the data budget.
        this.sendError(id, new Error('当前数据读取积压过多，请缩小范围后重试'))
      },
    })
  }

  receive(rawFrame: ByteArray): void {
    if (this.closed) throw new Error('DSH tunnel is closed')
    const frame = decode(new Uint8Array(rawFrame))
    try {
      if (frame.type === OPEN) return this.open(frame.streamId, parseJson(frame.payload))
      const stream = this.streams.get(frame.streamId)
      if (frame.type === CANCEL) {
        this.sendQueue.discard(frame.streamId)
        if (stream) this.cancel(stream, frame.streamId)
        return
      }
      if (!stream) return
      if (frame.type === DATA) return this.data(stream, frame.streamId, frame.flags, frame.payload)
      if (frame.type === END) return this.end(stream, frame.streamId, frame.payload)
      throw new Error('Client tunnel frame type is not allowed')
    } catch (error) {
      this.sendError(frame.streamId, error)
      const stream = this.streams.get(frame.streamId)
      if (stream) this.cancel(stream, frame.streamId)
    }
  }

  close(): void {
    this.closed = true
    this.sendQueue.close()
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
    if (this.compatibilityApi && this.compatibilityApi.handlesPath?.(path) !== false) {
      this.streams.set(streamId, {
        kind: 'compat-http', path, method: safeMethod(value.method),
        controller: new AbortController(), chunks: [], bytes: 0, ended: false,
      })
      return
    }
    const headers = requestHeaders(value.headers)
    const request = http.request({
      host: '127.0.0.1',
      port: this.dshPort,
      path,
      method: safeMethod(value.method),
      headers,
      timeout: objectRpcBudget(path.split('?')[0].replace(/^\/api\//, '')) ?? 30_000,
    }, response => {
      const active = this.streams.get(streamId)
      if (active?.kind !== KIND_HTTP || this.closed) { response.destroy(); return }
      if (active?.kind === KIND_HTTP) active.response = response
      this.queue(encode(ACCEPT, streamId, 0, json({
        statusCode: response.statusCode || 502,
        headers: responseHeaders(response.headers),
      })))
      response.on('data', chunk => {
        for (const part of pieces(Buffer.from(chunk))) {
          if (this.streams.get(streamId) !== active || this.closed) return
          this.queue(encode(DATA, streamId, 0, part))
        }
        const current = this.streams.get(streamId)
        if (this.pendingSendBytes >= SEND_QUEUE_PAUSE_BYTES && current?.kind === KIND_HTTP && !current.paused) {
          current.paused = true
          response.pause()
        }
      })
      response.on('end', () => {
        if (this.streams.get(streamId) !== active || this.closed) return
        this.streams.delete(streamId)
        this.queue(encode(END, streamId))
      })
      response.on('error', error => this.fail(streamId, error))
    })
    const stream: HttpStream = { kind: KIND_HTTP, path, request, paused: false, bytes: 0 }
    this.streams.set(streamId, stream)
    request.on('timeout', () => request.destroy(new Error('Local DSH request timed out')))
    request.on('error', error => this.fail(streamId, error))
  }

  private openWebSocket(streamId: number, path: string, value: Record<string, unknown>): void {
    if (this.compatibilityApi && this.compatibilityApi.handlesPath?.(path) !== false) {
      this.openCompatibilityEvents(streamId, path, value)
      return
    }
    const headers: Record<string, string> = {
      'user-agent': 'HarnessRemote-PublicAgent/1',
    }
    const socket = new WebSocket(`ws://127.0.0.1:${this.dshPort}${path}`, {
      headers,
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
      if (this.streams.get(streamId) !== stream || this.closed) return
      this.flushEventBatch(streamId, stream)
      this.streams.delete(streamId)
      this.queue(encode(END, streamId, 0, json({ code, reason: reason.toString().slice(0, 256) })))
    })
    socket.on('error', error => this.fail(streamId, error))
  }

  private openCompatibilityEvents(streamId: number, path: string, value: Record<string, unknown>): void {
    const stream: CompatibilityEventStream = {
      kind: 'compat-events', detach: () => {},
      batchEnabled: supportsEventBatch(value), batchMessages: [], batchBytes: 0,
      batchTimer: null, deltaBurstStarted: false,
    }
    this.streams.set(streamId, stream)
    const tunnel = this
    let accepted = false
    const openingMessages: string[] = []
    const detach = this.compatibilityApi!.connectEvents(path, {
      get readyState() { return tunnel.streams.get(streamId) === stream && !tunnel.closed ? 1 : 3 },
      get bufferedAmount() { return tunnel.pendingSendBytes },
      send(message) {
        if (tunnel.streams.get(streamId) === stream && !tunnel.closed) {
          if (!accepted) openingMessages.push(message)
          else tunnel.sendWebSocketMessage(streamId, stream, Buffer.from(message), false)
        }
      },
      close(code, reason) {
        if (tunnel.streams.get(streamId) !== stream) return
        tunnel.flushEventBatch(streamId, stream)
        tunnel.cancel(stream, streamId)
        tunnel.queue(encode(END, streamId, 0, json({ code, reason })))
      },
    })
    stream.detach = detach
    if (this.streams.get(streamId) !== stream) detach()
    else {
      this.queue(encode(ACCEPT, streamId, 0, json({ opened: true })))
      accepted = true
      for (const message of openingMessages) this.sendWebSocketMessage(streamId, stream, Buffer.from(message), false)
    }
  }

  private sendWebSocketMessage(streamId: number, stream: EventBatchState, message: ByteArray, isBinary: boolean): void {
    if (this.streams.get(streamId) !== stream || this.closed) return
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
      if (this.streams.get(streamId) !== stream || this.closed) return
      const partFlags = (isBinary ? FLAG_BINARY : 0) | (index === messagePieces.length - 1 ? FLAG_FINAL : 0)
      this.queue(encode(DATA, streamId, partFlags, part))
    })
  }

  private flushEventBatch(streamId: number, stream: EventBatchState): void {
    if (stream.batchTimer) clearTimeout(stream.batchTimer)
    stream.batchTimer = null
    if (!stream.batchMessages.length) return
    const messages = stream.batchMessages
    stream.batchMessages = []
    stream.batchBytes = 0
    this.queue(encode(BATCH, streamId, 0, batchPayload(messages)))
  }

  private data(stream: Stream, streamId: number, flags: number, payload: ByteArray): void {
    if (stream.kind === 'compat-events') throw new Error('DSH compatibility events are downlinks only')
    if (stream.kind === 'compat-http') {
      if (stream.ended) throw new Error('DSH request has already ended')
      stream.bytes += payload.length
      if (stream.bytes > MAX_REQUEST_BYTES) throw new Error('DSH request exceeds 16 MiB')
      stream.chunks.push(new Uint8Array(payload))
      return
    }
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
    if (stream.kind === 'compat-http') {
      if (stream.ended) throw new Error('DSH request has already ended')
      stream.ended = true
      void this.forwardCompatibilityHttp(streamId, stream)
      return
    }
    if (stream.kind === 'compat-events') {
      this.flushEventBatch(streamId, stream)
      this.cancel(stream, streamId)
      this.queue(encode(END, streamId))
      return
    }
    if (stream.kind === 'remote-prompt') {
      void this.forwardRemotePrompt(streamId, stream)
      return
    }
    if (stream.kind === KIND_HTTP) stream.request.end()
    else {
      const value = payload.length ? parseJson(payload) : {}
      const code = typeof value.code === 'number' ? value.code : 1000
      const reason = typeof value.reason === 'string' ? value.reason.slice(0, 123) : ''
      stream.socket.close(code, reason)
      this.streams.delete(streamId)
    }
  }

  private async forwardRemotePrompt(streamId: number, stream: RemotePromptStream): Promise<void> {
    let owner: Stream = stream
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
        materialized[index] = null
      }
      if (!remoteIndexes.length) throw new Error('Encrypted prompt contains no remote attachment')
      envelope.payload.content = materialized
      // Count the exact native JSON envelope, including UTF-8 text and image
      // metadata, before allocating Base64 or opening a local request. Each
      // resolved image replaces one four-byte `null` placeholder.
      let requestBytes = Buffer.byteLength(JSON.stringify(envelope))
      const workers = Array.from(
        { length: Math.min(REMOTE_ATTACHMENT_CONCURRENCY, remoteIndexes.length) },
        async (_unused, workerIndex) => {
          for (let cursor = workerIndex; cursor < remoteIndexes.length; cursor += REMOTE_ATTACHMENT_CONCURRENCY) {
            stream.controller.signal.throwIfAborted()
            const index = remoteIndexes[cursor]
            const part = content[index]
            const resolved = await this.materializeAttachment!(part.remoteAttachment, stream.controller.signal)
            stream.controller.signal.throwIfAborted()
            const image = {
              type: 'image',
              mediaType: resolved.descriptor.mediaType,
              data: '',
              ...(resolved.descriptor.name ? { name: resolved.descriptor.name } : {}),
            }
            requestBytes += Buffer.byteLength(JSON.stringify(image)) - 4 + 4 * Math.ceil(resolved.data.byteLength / 3)
            if (requestBytes > MAX_REQUEST_BYTES) throw new Error('DSH request exceeds 16 MiB')
            image.data = Buffer.from(resolved.data).toString('base64')
            materialized[index] = image
          }
        },
      )
      await Promise.all(workers)
      if (this.streams.get(streamId) !== stream || this.closed) return
      const body = json(envelope)
      if (body.length > MAX_REQUEST_BYTES) throw new Error('DSH request exceeds 16 MiB')
      // Keep the slot owned during the handoff. The wire/native envelope stays
      // unchanged; cleanup follows the replacement, not only the old adapter.
      this.openHttp(streamId, '/api/session.prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      const active = this.streams.get(streamId)
      if (active) owner = active
      if (!active || (active.kind !== KIND_HTTP && active.kind !== 'compat-http')) throw new Error('Local DSH prompt stream did not open')
      this.data(active, streamId, 0, body)
      this.end(active, streamId, new Uint8Array(0))
    } catch (error) {
      stream.controller.abort(error)
      // Cancellation/close may already have retired this operation. A late
      // result must neither send another terminal frame nor cancel a new owner.
      if (this.streams.get(streamId) === owner) {
        this.sendError(streamId, error)
        this.cancel(owner, streamId)
      }
    } finally {
      stream.chunks = []
      stream.bytes = 0
    }
  }

  private cancel(stream: Stream, streamId: number): void {
    this.streams.delete(streamId)
    if (stream.kind === 'remote-prompt' || stream.kind === 'compat-http') {
      stream.controller.abort(new Error('Encrypted prompt cancelled'))
      stream.chunks = []
      stream.bytes = 0
    } else if (stream.kind === KIND_HTTP) stream.request.destroy()
    else {
      if (stream.batchTimer) clearTimeout(stream.batchTimer)
      stream.batchTimer = null
      stream.batchMessages = []
      stream.batchBytes = 0
      if (stream.kind === 'compat-events') stream.detach()
      else stream.socket.terminate()
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
    const id = frame.length >= HEADER_BYTES ? readUint32(frame, 2) : 0
    if (!id) { this.close(); return }
    const stream = this.streams.get(id)
    const interactive = stream?.kind === 'compat-events' || stream?.kind === KIND_WEBSOCKET
      || stream?.kind === 'remote-prompt' || frame[1] === ERROR
      || (stream?.kind === 'compat-http' || stream?.kind === KIND_HTTP)
        && /\/(respond|session\.(prompt|cancel|list)|host\.describe|workspace\.list)$/.test(stream.path)
    this.sendQueue.enqueue(id, interactive ? 'interactive' : 'bulk', frame, frame[1] === ERROR || frame[1] === END)
  }

  private resumeSources(): void {
    for (const stream of this.streams.values()) {
      if ((stream.kind !== KIND_HTTP && stream.kind !== KIND_WEBSOCKET) || !stream.paused) continue
      stream.paused = false
      if (stream.kind === KIND_HTTP) stream.response?.resume()
      else stream.socket.resume()
    }
  }

  private async forwardCompatibilityHttp(streamId: number, stream: CompatibilityHttpStream): Promise<void> {
    const signal = stream.controller.signal
    try {
      const body = concat(...stream.chunks)
      stream.chunks = []
      const response = await this.compatibilityApi!.request({
        method: stream.method, path: stream.path, body, signal,
      })
      if (signal.aborted || this.closed || this.streams.get(streamId) !== stream) return
      this.queue(encode(ACCEPT, streamId, 0, json({ statusCode: response.statusCode, headers: response.headers })))
      const parts = pieces(response.body)
      for (let index = 0; index < parts.length; index++) {
        if (signal.aborted || this.closed) return
        this.queue(encode(DATA, streamId, 0, parts[index]!))
        // Backpressure bounds further body production, not completion of a
        // finished response. END must join this stream's FIFO immediately;
        // otherwise even a tiny control request waits for unrelated bulk data.
        if (index + 1 < parts.length && this.pendingSendBytes >= SEND_QUEUE_PAUSE_BYTES) {
          await this.sendQueue.waitForCapacity(signal)
        }
      }
      if (!signal.aborted && !this.closed) this.queue(encode(END, streamId))
    } catch (error) {
      if (!signal.aborted && !this.closed) this.sendError(streamId, error)
    } finally {
      if (this.streams.get(streamId) === stream) this.streams.delete(streamId)
      stream.chunks = []
    }
  }
}
