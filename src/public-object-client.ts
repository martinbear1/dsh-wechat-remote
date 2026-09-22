import { setTimeout as delay } from 'node:timers/promises'
import { createAgentHttpProof } from './agent-http-proof.js'
import type { AgentIdentity } from './public-relay-agent.js'
import { OBJECT_UPLOAD_BUDGET_MS, OBJECT_DOWNLOAD_BUDGET_MS } from './object-transfer-budget.js'

interface SignedTransfer {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly expiresIn: number
  readonly alternatives?: readonly SignedTransfer[]
}
interface ObjectTicket {
  readonly objectId: string
  readonly purpose: 'attachment' | 'artifact' | 'history'
  readonly expectedBytes: number
  readonly expiresAt: number
  readonly upload?: SignedTransfer
  readonly download?: SignedTransfer
}
interface ObjectCompletion {
  readonly objectId: string
  readonly ready: boolean
  readonly expiresAt: number
}

export const DEFAULT_TRUSTED_OBJECT_ORIGINS = Object.freeze([
  'https://harness-remote-e2ee-cn-shanghai-7f4c9d2a.oss-cn-shanghai.aliyuncs.com',
  'https://objects-sh.xyxfood.xyz',
])
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/
const SAFE_UPLOAD_HEADERS = new Set(['content-type', 'x-oss-forbid-overwrite'])
const PREFERENCE_TTL_MS = 10 * 60_000
const OBJECT_BACKEND_UNAVAILABLE = 'object_backend_unavailable'
const OBJECT_BACKEND_UNAVAILABLE_MESSAGE =
  '当前电脑网络或 VPN 无法访问文件存储，请调整 VPN 分流或切换网络后重试'

class PublicObjectError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'PublicObjectError'
  }
}

export class PublicObjectClient {
  private readonly trustedObjectOrigins: ReadonlySet<string>
  private lifetime = new AbortController()
  private readonly preferences = new Map<string, { origin: string; expiresAt: number }>()

  constructor(
    private readonly relayOrigin: string,
    private readonly identitySource: AgentIdentity | (() => AgentIdentity),
    private readonly fetchImpl: typeof fetch = fetch,
    trustedObjectOrigins: readonly string[] = DEFAULT_TRUSTED_OBJECT_ORIGINS,
  ) {
    this.trustedObjectOrigins = new Set(trustedObjectOrigins.map(normalizeTrustedOrigin))
    if (!this.trustedObjectOrigins.size) throw new Error('At least one trusted object origin is required')
  }

  private get identity(): AgentIdentity {
    return typeof this.identitySource === 'function' ? this.identitySource() : this.identitySource
  }

  start(): void {
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController()
  }

  stop(): void {
    this.lifetime.abort()
    this.preferences.clear()
  }

  private operationSignal(signal: AbortSignal | undefined, budget: number): AbortSignal {
    return AbortSignal.any([this.lifetime.signal, deadlineSignal(signal, budget)])
  }

  async download(objectId: string, expectedMaximum = 20 * 1024 * 1024 + 4096, signal?: AbortSignal): Promise<Uint8Array> {
    signal = this.operationSignal(signal, OBJECT_DOWNLOAD_BUDGET_MS)
    signal.throwIfAborted()
    if (!OBJECT_ID_PATTERN.test(objectId)) throw new Error('Invalid encrypted object ID')
    const ticket = await this.requestJson<ObjectTicket>('GET',
      `/v1/agents/${this.identity.nodeId}/objects/${objectId}/download`, undefined, signal)
    if (!validTicket(ticket, objectId) || !ticket.download || ticket.expectedBytes < 17 ||
        ticket.expectedBytes > expectedMaximum) throw new Error('Encrypted attachment ticket is invalid')
    const route = this.entries(ticket.download, 'GET')
    for (let index = 0; index < route.entries.length; index++) {
      const transfer = route.entries[index]
      try {
        const response = await this.fetchImpl(transfer.url, { method: 'GET', headers: transfer.headers,
          redirect: 'error', signal: deadlineSignal(signal, 60_000) })
        if (!response.ok) {
          await response.body?.cancel()
          throw transferError(response.status)
        }
        const body = await readExactBody(response, ticket.expectedBytes)
        signal.throwIfAborted()
        this.remember(route.key, transfer.url)
        return body
      } catch (error) {
        signal.throwIfAborted()
        this.forget(route.key, transfer.url)
        if (!recoverable(error) || index + 1 === route.entries.length) throw error
      }
    }
    throw objectBackendUnavailable()
  }

  async upload(purpose: 'attachment' | 'artifact' | 'history', body: Uint8Array, signal?: AbortSignal): Promise<ObjectTicket> {
    signal = this.operationSignal(signal, OBJECT_UPLOAD_BUDGET_MS)
    signal.throwIfAborted()
    const deadline = Date.now() + OBJECT_UPLOAD_BUDGET_MS
    const pathname = `/v1/agents/${this.identity.nodeId}/objects`
    const ticket = await this.requestJson<ObjectTicket>('POST', pathname, { purpose, expectedBytes: body.length }, signal)
    if (!validTicket(ticket) || ticket.purpose !== purpose || !ticket.upload || ticket.expectedBytes !== body.length) {
      throw new Error('Encrypted object upload ticket is invalid')
    }
    const route = this.entries(ticket.upload, 'PUT')
    const completePath = `${pathname}/${ticket.objectId}/complete`
    for (let index = 0; index < route.entries.length; index++) {
      const transfer = route.entries[index]
      let acknowledged = false
      try {
        const response = await this.fetchImpl(transfer.url, { method: 'PUT', headers: transfer.headers,
          body: Buffer.from(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength), redirect: 'error',
          signal: deadlineSignal(signal, Math.max(1, Math.min(120_000, deadline - Date.now() - 20_000))) })
        await response.body?.cancel()
        if (!response.ok && response.status !== 409) throw transferError(response.status)
        acknowledged = response.ok
      } catch (error) {
        signal.throwIfAborted()
        this.forget(route.key, transfer.url)
        if (!recoverable(error)) throw error
      }
      // A timeout or 409 can mean the same immutable object already arrived.
      // Confirm it before attempting the alternate URL; never allocate another object.
      try {
        const completed = await this.complete(completePath, ticket.objectId, signal)
        signal.throwIfAborted()
        if (acknowledged) this.remember(route.key, transfer.url)
        return { objectId: ticket.objectId, purpose, expectedBytes: body.length, expiresAt: completed.expiresAt }
      } catch (error) {
        signal.throwIfAborted()
        if (!(error instanceof PublicObjectError) || error.code !== 'object_upload_missing') throw error
        if (!acknowledged && index + 1 < route.entries.length) continue
        // Only uncertain/late upload visibility needs bounded reconciliation.
        for (const wait of [500, 1500]) {
          await delay(wait, undefined, { signal })
          try {
            const completed = await this.complete(completePath, ticket.objectId, signal)
            if (acknowledged) this.remember(route.key, transfer.url)
            return { objectId: ticket.objectId, purpose, expectedBytes: body.length, expiresAt: completed.expiresAt }
          } catch (lateError) {
            signal.throwIfAborted()
            if (!(lateError instanceof PublicObjectError) || lateError.code !== 'object_upload_missing') throw lateError
          }
        }
        throw error
      }
    }
    throw objectBackendUnavailable()
  }

  private async complete(path: string, objectId: string, signal: AbortSignal): Promise<ObjectCompletion> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.requestJson<ObjectCompletion>('POST', path, {}, signal)
        if (!result || result.objectId !== objectId || result.ready !== true ||
            !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) {
          throw new Error('Encrypted object completion ticket is invalid')
        }
        return result
      } catch (error) {
        signal.throwIfAborted()
        // Completion is idempotent. Retry its lost reply, never the user's task.
        if (attempt || !recoverable(error)) throw error
      }
    }
  }

  private entries(primary: SignedTransfer, method: 'GET' | 'PUT') {
    if (primary.alternatives !== undefined &&
        (!Array.isArray(primary.alternatives) || primary.alternatives.length > 1)) {
      throw new Error('Encrypted object alternatives are invalid')
    }
    // COMPAT(object-entry-v1): old clouds return a single URL; retain that path
    // until the minimum supported cloud version guarantees negotiated entries.
    const entries = [primary, ...(primary.alternatives || [])].map(item => this.validateTransfer(item, method))
    const first = new URL(entries[0].url)
    if (entries.length > 1) {
      const second = new URL(entries[1].url)
      if (first.origin === second.origin || first.pathname !== second.pathname ||
          (method === 'PUT' && entries.some(item => item.headers['x-oss-forbid-overwrite'] !== 'true'))) {
        throw new Error('Encrypted object alternatives must address the same immutable object')
      }
    }
    const key = `${this.identity.nodeId}|${method}|${first.origin}`
    const preference = this.preferences.get(key)
    if (preference && preference.expiresAt > Date.now()) {
      const preferredIndex = entries.findIndex(item => new URL(item.url).origin === preference.origin)
      if (preferredIndex > 0) entries.unshift(...entries.splice(preferredIndex, 1))
    } else this.preferences.delete(key)
    return { key, entries }
  }

  private remember(key: string, url: string): void {
    const origin = new URL(url).origin
    const previous = this.preferences.get(key)
    // Fixed expiry: repeated successes must not permanently pin a backup.
    if (previous && previous.origin === origin && previous.expiresAt > Date.now()) return
    this.preferences.delete(key)
    if (this.preferences.size >= 16) this.preferences.delete(this.preferences.keys().next().value!)
    this.preferences.set(key, { origin, expiresAt: Date.now() + PREFERENCE_TTL_MS })
  }

  private forget(key: string, url: string): void {
    // A late failure of A must not erase a concurrent successful preference B.
    if (this.preferences.get(key)?.origin === new URL(url).origin) this.preferences.delete(key)
  }

  private validateTransfer(transfer: SignedTransfer, method: 'GET' | 'PUT'): {
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
  } {
    if (!transfer || typeof transfer.url !== 'string' || !Number.isFinite(transfer.expiresIn) ||
        transfer.expiresIn <= 0) {
      throw new Error('Encrypted object transfer ticket is invalid')
    }
    let url: URL
    try { url = new URL(transfer.url) } catch { throw new Error('Encrypted object transfer URL is invalid') }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
        (url.port && url.port !== '443') || !this.trustedObjectOrigins.has(url.origin)) {
      throw new Error('Encrypted object transfer URL is not trusted')
    }
    const allowed = method === 'PUT' ? SAFE_UPLOAD_HEADERS : new Set<string>()
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(transfer.headers || {})) {
      const normalized = name.trim().toLowerCase()
      if (!normalized || Object.hasOwn(headers, normalized) || !allowed.has(normalized) || typeof value !== 'string') {
        throw new Error('Encrypted object transfer headers are not trusted')
      }
      if (normalized === 'content-type' && value.toLowerCase() !== 'application/octet-stream') {
        throw new Error('Encrypted object transfer content type is invalid')
      }
      if (normalized === 'x-oss-forbid-overwrite' && value.toLowerCase() !== 'true') {
        throw new Error('Encrypted object overwrite policy is invalid')
      }
      headers[normalized] = value
    }
    return { url: url.href, headers }
  }


  private async requestJson<T>(method: 'GET' | 'POST', pathname: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted()
    const serialized = body === undefined ? undefined : JSON.stringify(body)
    const response = await this.fetchImpl(`${this.relayOrigin}${pathname}`, {
      method, headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'x-hr-object-entries': '1',
        ...createAgentHttpProof(this.identity, method, pathname, serialized),
      },
      body: serialized, redirect: 'error', signal: deadlineSignal(signal, 15_000),
    })
    if (!response.ok) throw await objectServiceError(response)
    const result = await response.json() as T
    signal?.throwIfAborted()
    return result
  }
}

function transferError(status: number): PublicObjectError {
  return new PublicObjectError(
    [408, 429].includes(status) || status >= 500 ? 'object_transfer_retryable' : 'object_transfer_rejected',
    `Encrypted object transfer failed with HTTP ${status}`)
}

function recoverable(error: unknown): boolean {
  if (error instanceof PublicObjectError) return error.code === 'object_transfer_retryable' || /^http_5\d\d$/.test(error.code)
  if (!(error instanceof Error)) return false
  const cause = error.cause as { code?: string } | undefined
  if (cause?.code && (/CERT|TLS|SSL/.test(cause.code) || cause.code === 'ENOBUFS')) return false
  return error.name === 'TypeError' || error.name === 'TimeoutError' || error.name === 'AbortError'
}

async function readExactBody(response: Response, expectedBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new Error('Encrypted attachment body is missing')
  const reader = response.body.getReader()
  const body = new Uint8Array(expectedBytes)
  let length = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (length + chunk.value.byteLength > expectedBytes) throw new Error('Encrypted attachment length mismatch')
      body.set(chunk.value, length)
      length += chunk.value.byteLength
    }
    if (length !== expectedBytes) throw new Error('Encrypted attachment length mismatch')
    return body
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function objectServiceError(response: Response): Promise<Error> {
  let remote: unknown
  try { remote = await response.json() } catch { /* invalid errors stay generic */ }
  const value = remote && typeof remote === 'object' ? remote as Record<string, any> : null
  const detail = value?.error && typeof value.error === 'object'
    ? value.error as Record<string, unknown>
    : null
  const code = typeof detail?.code === 'string' ? detail.code : `http_${response.status}`
  if (code === OBJECT_BACKEND_UNAVAILABLE) return objectBackendUnavailable()
  const message = typeof detail?.message === 'string' && detail.message.length <= 256
    ? detail.message
    : `Encrypted object service failed with HTTP ${response.status}`
  return new PublicObjectError(code, message)
}

function objectBackendUnavailable(): PublicObjectError {
  return new PublicObjectError(OBJECT_BACKEND_UNAVAILABLE, OBJECT_BACKEND_UNAVAILABLE_MESSAGE)
}

function normalizeTrustedOrigin(origin: string): string {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (url.port && url.port !== '443') || url.pathname !== '/') {
    throw new Error('Trusted object origin must be a bare HTTPS origin')
  }
  return url.origin
}

function validTicket(ticket: ObjectTicket, expectedObjectId?: string): boolean {
  return !!ticket && OBJECT_ID_PATTERN.test(ticket.objectId) &&
    (!expectedObjectId || ticket.objectId === expectedObjectId) &&
    ['attachment', 'artifact', 'history'].includes(ticket.purpose) &&
    Number.isSafeInteger(ticket.expectedBytes) && ticket.expectedBytes >= 0 &&
    Number.isFinite(ticket.expiresAt) && ticket.expiresAt > Date.now()
}

function deadlineSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return parent ? AbortSignal.any([parent, timeout]) : timeout
}
