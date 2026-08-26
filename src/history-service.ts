/**
 * 微信小程序专用的会话历史语义窗口。
 *
 * DSH 原生 session.history 会保留生成期 assistant/chunk；一个长工具轮次
 * 可能因此达到数 MB。局域网尚可接受，公网 E2EE 中继却会把这些已经被
 * assistant/message 取代的增量完整搬到手机。本服务仍以 DSH 原生历史为
 * 唯一数据源，只在电脑端完成两项确定性变换：
 *
 * 1. 向前补齐到最新轮次的 turn/start，避免工具和生成产物被分页截断；
 * 2. 仅删除 reason.kind=completed 轮次的 assistant/chunk，保留消息、工具、
 *    view、投影与失败/中断轮次的部分输出。
 *
 * 它是微信插件自己的只读 Typert Remote，不修改 DSH 会话、WebUI 或原生
 * session.history 契约，也不新增监听端口。
 */
import http from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

const DEFAULT_PAGE_MESSAGES = 8
const MAX_PAGE_MESSAGES = 30
const MAX_PAGES = 64
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 60_000
// Above this clear-text size we prepare a compressed transport.  The gateway
// keeps small ZIPs inside the existing E2EE response and sends only genuinely
// large archives through OSS, so transport selection is based on wire size.
const DEFAULT_SNAPSHOT_THRESHOLD_BYTES = 32 * 1024
const DEFAULT_MEMORY_CACHE_ENTRIES = 8
const DEFAULT_MEMORY_CACHE_BYTES = 16 * 1024 * 1024
const DEFAULT_MEMORY_CACHE_ENTRY_BYTES = 4 * 1024 * 1024

interface HistoryEntry {
  readonly event?: {
    readonly type?: unknown
    readonly seq?: unknown
    readonly data?: Record<string, unknown>
  }
  readonly [key: string]: unknown
}

interface NativeHistoryValue {
  readonly events?: readonly HistoryEntry[]
  readonly hasMore?: unknown
  readonly [key: string]: unknown
}

interface NativeHistoryResponse {
  readonly ok: boolean
  readonly value?: NativeHistoryValue
  readonly error?: { readonly code?: unknown; readonly message?: unknown }
}

export interface WechatHistoryWindowRequest {
  readonly sessionId: string
  readonly beforeSeq?: number
  readonly maxMessages?: number
  /** Force compact JSON inline when the client's object data plane is unavailable. */
  readonly delivery?: 'auto' | 'inline'
}

export interface WechatHistoryWindowValue extends NativeHistoryValue {
  readonly events: readonly HistoryEntry[]
  readonly hasMore: boolean
  readonly historyStartSeq?: number
  readonly historyEndSeq?: number
  readonly pages: number
  readonly rawEvents: number
}

export interface WechatHistoryRemoteValue {
  /** JSON keeps the Typert boundary constrained while preserving native views. */
  readonly payloadJson?: string
  /** Large windows may use an encrypted, expiring OSS transport descriptor. */
  readonly snapshotJson?: string
  /** Observable acceleration only; DSH remains the source of truth. */
  readonly cache?: 'memory'
}

export interface WechatHistoryWindowError {
  readonly code: 'invalid-history-request' | 'history-unavailable' | 'history-pagination-invalid'
  readonly message: string
}

export type WechatHistoryWindowResult =
  | { readonly ok: true; readonly value: WechatHistoryRemoteValue }
  | { readonly ok: false; readonly error: WechatHistoryWindowError }

export type BuildHistoryWindowResult =
  | { readonly ok: true; readonly value: WechatHistoryWindowValue }
  | { readonly ok: false; readonly error: WechatHistoryWindowError }

export interface WechatHistoryConfig {
  readonly dshPort?: number
  readonly timeoutMs?: number
  readonly snapshotThresholdBytes?: number
  readonly prepareSnapshot?: (payloadJson: string) => Promise<Readonly<Record<string, unknown>>>
}

export interface LatestHistoryWindowCacheToken {
  readonly epoch: number
  readonly revision: number
}

interface LatestHistoryWindowCacheEntry {
  readonly sessionId: string
  readonly payloadJson: string
  readonly bytes: number
}

/**
 * Process-local, event-coherent cache for the latest semantic window.
 *
 * It is deliberately disabled until the native Host event stream is live.
 * Any event for a Session invalidates that Session; any monitor gap clears the
 * whole cache. Clear history never leaves memory and older cursor pages are
 * never cached.
 */
export class LatestHistoryWindowCache {
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly maxEntryBytes: number
  private readonly entries = new Map<string, LatestHistoryWindowCacheEntry>()
  private readonly revisions = new Map<string, number>()
  private tracking = false
  private epoch = 0
  private totalBytes = 0

  constructor(options: {
    readonly maxEntries?: number
    readonly maxBytes?: number
    readonly maxEntryBytes?: number
  } = {}) {
    this.maxEntries = positiveInteger(options.maxEntries, DEFAULT_MEMORY_CACHE_ENTRIES)
    this.maxBytes = positiveInteger(options.maxBytes, DEFAULT_MEMORY_CACHE_BYTES)
    this.maxEntryBytes = positiveInteger(options.maxEntryBytes, DEFAULT_MEMORY_CACHE_ENTRY_BYTES)
  }

  setTracking(ready: boolean): void {
    if (this.tracking === ready) return
    this.tracking = ready
    this.epoch += 1
    this.clear()
  }

  invalidateSession(sessionId: string): void {
    this.revisions.set(sessionId, (this.revisions.get(sessionId) || 0) + 1)
    for (const [key, entry] of this.entries) {
      if (entry.sessionId === sessionId) this.remove(key, entry)
    }
  }

  capture(request: WechatHistoryWindowRequest): LatestHistoryWindowCacheToken | null {
    if (!this.tracking || request.beforeSeq !== undefined) return null
    return {
      epoch: this.epoch,
      revision: this.revisions.get(request.sessionId) || 0,
    }
  }

  read(request: WechatHistoryWindowRequest): string | null {
    if (!this.tracking || request.beforeSeq !== undefined) return null
    const key = latestCacheKey(request)
    const entry = this.entries.get(key)
    if (!entry) return null
    // Refresh insertion order to make Map a bounded LRU.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.payloadJson
  }

  write(
    request: WechatHistoryWindowRequest,
    payloadJson: string,
    token: LatestHistoryWindowCacheToken | null,
  ): boolean {
    if (!token || !this.tracking || request.beforeSeq !== undefined
      || token.epoch !== this.epoch
      || token.revision !== (this.revisions.get(request.sessionId) || 0)) return false
    const bytes = Buffer.byteLength(payloadJson)
    if (bytes > this.maxEntryBytes || bytes > this.maxBytes) return false
    const key = latestCacheKey(request)
    const previous = this.entries.get(key)
    if (previous) this.remove(key, previous)
    this.entries.set(key, { sessionId: request.sessionId, payloadJson, bytes })
    this.totalBytes += bytes
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as
        | [string, LatestHistoryWindowCacheEntry]
        | undefined
      if (!oldest) break
      this.remove(oldest[0], oldest[1])
    }
    return this.entries.has(key)
  }

  private clear(): void {
    this.entries.clear()
    this.totalBytes = 0
  }

  private remove(key: string, entry: LatestHistoryWindowCacheEntry): void {
    if (!this.entries.delete(key)) return
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes)
  }
}

type FetchPage = (
  payload: { readonly sessionId: string; readonly maxMessages: number; readonly beforeSeq?: number },
  signal: AbortSignal,
) => Promise<NativeHistoryResponse>

declare module '@deepseek-ai/cordis' {
  interface Context {
    wechatHistory: WechatHistoryService
  }
}

export class WechatHistoryService extends TypertRemoteService {
  private readonly dshPort: number
  private readonly timeoutMs: number
  private readonly snapshotThresholdBytes: number
  private readonly prepareSnapshot?: WechatHistoryConfig['prepareSnapshot']
  private readonly latestCache = new LatestHistoryWindowCache()

  constructor(ctx: Context, config: WechatHistoryConfig = {}) {
    super(ctx, 'wechatHistory')
    this.dshPort = Number.isSafeInteger(config.dshPort) && Number(config.dshPort) > 0
      ? Number(config.dshPort)
      : 3080
    this.timeoutMs = Number.isSafeInteger(config.timeoutMs) && Number(config.timeoutMs) > 0
      ? Number(config.timeoutMs)
      : DEFAULT_TIMEOUT_MS
    this.snapshotThresholdBytes = Number.isSafeInteger(config.snapshotThresholdBytes)
      && Number(config.snapshotThresholdBytes) >= 16 * 1024
      ? Number(config.snapshotThresholdBytes)
      : DEFAULT_SNAPSHOT_THRESHOLD_BYTES
    this.prepareSnapshot = config.prepareSnapshot
  }

  @Remote('window')
  async window(
    request: WechatHistoryWindowRequest,
    signal: AbortSignal,
  ): Promise<WechatHistoryWindowResult> {
    const validation = validateRequest(request)
    if (validation) return { ok: false, error: validation }
    try {
      const cached = this.latestCache.read(request)
      if (cached !== null) return this.deliver(cached, request, true)
      const cacheToken = this.latestCache.capture(request)
      const built = await buildHistoryWindow(request, (payload, pageSignal) => (
        this.fetchNativePage(payload, pageSignal)
      ), signal)
      if (!built.ok) return built
      const payloadJson = JSON.stringify(built.value)
      this.latestCache.write(request, payloadJson, cacheToken)
      return this.deliver(payloadJson, request, false)
    } catch (error) {
      signal.throwIfAborted()
      return {
        ok: false,
        error: { code: 'history-unavailable', message: messageOf(error) },
      }
    }
  }

  /** Enable cache reads only while the native Host monitor is continuous. */
  setCacheTracking(ready: boolean): void {
    this.latestCache.setTracking(ready)
  }

  /** Invalidate before processing every native event for this Session. */
  invalidateSession(sessionId: string): void {
    this.latestCache.invalidateSession(sessionId)
  }

  private async deliver(
    payloadJson: string,
    request: WechatHistoryWindowRequest,
    cacheHit: boolean,
  ): Promise<WechatHistoryWindowResult> {
    if (request.delivery !== 'inline' && this.prepareSnapshot
        && Buffer.byteLength(payloadJson) >= this.snapshotThresholdBytes) {
      try {
        return { ok: true, value: {
          snapshotJson: JSON.stringify(await this.prepareSnapshot(payloadJson)),
          ...(cacheHit ? { cache: 'memory' as const } : {}),
        } }
      } catch {
        // OSS is an acceleration layer, never the history source of truth.
        // A role, Bucket, or network outage falls back to the existing E2EE
        // tunnel response without changing DSH/WebUI behavior.
      }
    }
    return { ok: true, value: {
      payloadJson,
      ...(cacheHit ? { cache: 'memory' as const } : {}),
    } }
  }

  private fetchNativePage(
    payload: { readonly sessionId: string; readonly maxMessages: number; readonly beforeSeq?: number },
    signal: AbortSignal,
  ): Promise<NativeHistoryResponse> {
    const body = Buffer.from(JSON.stringify({
      type: 'client-request',
      rpcId: `wechat-history-${Date.now().toString(36)}`,
      method: 'session.history',
      payload,
    }))
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        callback()
      }
      const request = http.request({
        host: '127.0.0.1',
        port: this.dshPort,
        path: '/api/session.history',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': body.length,
          accept: 'application/json',
          'accept-encoding': 'identity',
          'user-agent': 'HarnessRemote-WechatHistory/1',
        },
        timeout: this.timeoutMs,
      }, response => {
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > MAX_RESPONSE_BYTES) {
            response.destroy(new Error('DSH history page exceeds 32 MiB'))
            return
          }
          chunks.push(Buffer.from(chunk))
        })
        response.on('end', () => {
          try {
            if (response.statusCode !== 200) throw new Error(`DSH history HTTP ${response.statusCode || 0}`)
            const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              readonly result?: NativeHistoryResponse
            }
            if (!envelope.result || typeof envelope.result.ok !== 'boolean') {
              throw new Error('DSH history returned an invalid response')
            }
            finish(() => resolve(envelope.result as NativeHistoryResponse))
          } catch (error) {
            finish(() => reject(error))
          }
        })
        response.on('error', error => finish(() => reject(error)))
      })
      const abort = (): void => { request.destroy(new Error('History request aborted')) }
      signal.addEventListener('abort', abort, { once: true })
      request.on('timeout', () => request.destroy(new Error('DSH history request timed out')))
      request.on('error', error => finish(() => reject(error)))
      request.end(body)
    })
  }
}

/**
 * Populate the gateway's content-addressed history cache after a native DSH
 * turn finishes. This is deliberately a host helper rather than a Typert
 * Remote, so clients cannot invoke background work or discover a second API.
 */
export async function prewarmLatestHistory(
  service: WechatHistoryService,
  sessionId: string,
  signal: AbortSignal,
): Promise<'inline' | 'object'> {
  const result = await service.window({
    sessionId,
    maxMessages: MAX_PAGE_MESSAGES,
    delivery: 'auto',
  }, signal)
  if (!result.ok) throw new Error(result.error.message)
  if (!result.value.snapshotJson) return 'inline'
  const descriptor = JSON.parse(result.value.snapshotJson) as { readonly objectId?: unknown }
  return typeof descriptor.objectId === 'string' ? 'object' : 'inline'
}

/** Exported pure coordinator for deterministic plugin regression tests. */
export async function buildHistoryWindow(
  request: WechatHistoryWindowRequest,
  fetchPage: FetchPage,
  signal: AbortSignal,
): Promise<BuildHistoryWindowResult> {
  const validation = validateRequest(request)
  if (validation) return { ok: false, error: validation }
  const maxMessages = request.maxMessages ?? DEFAULT_PAGE_MESSAGES
  const pages: HistoryEntry[][] = []
  const completedTurns = new Set<string>()
  const durableMessageTurns = new Set<string>()
  let cursor = request.beforeSeq
  let previousCursor: number | undefined
  let targetTurn: string | undefined
  let tailValue: NativeHistoryValue | undefined
  let oldestValue: NativeHistoryValue | undefined
  let historyStartSeq: number | undefined
  let historyEndSeq: number | undefined
  let rawEvents = 0

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    signal.throwIfAborted()
    const payload = {
      sessionId: request.sessionId,
      maxMessages,
      ...(cursor === undefined ? {} : { beforeSeq: cursor }),
    }
    const response = await fetchPage(payload, signal)
    if (!response.ok || !response.value) {
      return {
        ok: false,
        error: {
          code: 'history-unavailable',
          message: typeof response.error?.message === 'string'
            ? response.error.message
            : 'DSH 会话历史不可用',
        },
      }
    }
    const value = response.value
    const entries = Array.isArray(value.events) ? Array.from(value.events) : []
    rawEvents += entries.length
    if (!tailValue) {
      tailValue = value
      targetTurn = tailTurnOf(entries)
      historyEndSeq = eventSeqOf(entries[entries.length - 1])
    }
    oldestValue = value
    const firstSeq = eventSeqOf(entries[0])
    if (firstSeq !== undefined) historyStartSeq = firstSeq
    markCompletedTurns(entries, completedTurns)
    markDurableMessageTurns(entries, durableMessageTurns)
    pages.unshift(entries)

    if (targetTurn === undefined || hasTurnStart(entries, targetTurn)
      || value.hasMore !== true || entries.length === 0) {
      return {
        ok: true,
        value: {
          ...(tailValue || {}),
          events: compactEntries(pages.flat(), completedTurns, durableMessageTurns),
          hasMore: oldestValue?.hasMore === true,
          historyStartSeq,
          historyEndSeq,
          pages: pages.length,
          rawEvents,
        },
      }
    }
    if (firstSeq === undefined || firstSeq === previousCursor) {
      return {
        ok: false,
        error: { code: 'history-pagination-invalid', message: 'DSH 历史分页没有继续前进' },
      }
    }
    previousCursor = firstSeq
    cursor = firstSeq
  }

  return {
    ok: false,
    error: { code: 'history-pagination-invalid', message: 'DSH 单轮历史超过安全分页上限' },
  }
}

function validateRequest(request: WechatHistoryWindowRequest): WechatHistoryWindowError | null {
  if (!request || typeof request.sessionId !== 'string'
    || request.sessionId.length < 1 || request.sessionId.length > 256
    || /[\u0000-\u001f\u007f]/.test(request.sessionId)) {
    return { code: 'invalid-history-request', message: '会话标识无效' }
  }
  if (request.beforeSeq !== undefined
    && (!Number.isSafeInteger(request.beforeSeq) || request.beforeSeq < 0)) {
    return { code: 'invalid-history-request', message: '历史游标无效' }
  }
  if (request.maxMessages !== undefined
    && (!Number.isSafeInteger(request.maxMessages)
      || request.maxMessages < 1 || request.maxMessages > MAX_PAGE_MESSAGES)) {
    return { code: 'invalid-history-request', message: '历史窗口大小无效' }
  }
  if (request.delivery !== undefined && request.delivery !== 'auto' && request.delivery !== 'inline') {
    return { code: 'invalid-history-request', message: '历史传输方式无效' }
  }
  return null
}

function latestCacheKey(request: WechatHistoryWindowRequest): string {
  return `${request.sessionId}\u0000${request.maxMessages ?? DEFAULT_PAGE_MESSAGES}`
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function eventSeqOf(entry: HistoryEntry | undefined): number | undefined {
  const seq = entry?.event?.seq
  return typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : undefined
}

function tailTurnOf(entries: readonly HistoryEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const turn = entries[index]?.event?.data?.turn
    if (turn !== undefined && turn !== null) return String(turn)
  }
  return undefined
}

function hasTurnStart(entries: readonly HistoryEntry[], targetTurn: string): boolean {
  return entries.some(entry => entry.event?.type === 'turn/start'
    && String(entry.event.data?.turn) === targetTurn)
}

function markCompletedTurns(entries: readonly HistoryEntry[], completedTurns: Set<string>): void {
  for (const entry of entries) {
    const event = entry.event
    const reason = event?.data?.reason
    if (event?.type === 'turn/end' && reason && typeof reason === 'object'
      && (reason as { readonly kind?: unknown }).kind === 'completed') {
      completedTurns.add(String(event.data?.turn))
    }
  }
}

function markDurableMessageTurns(entries: readonly HistoryEntry[], durableTurns: Set<string>): void {
  for (const entry of entries) {
    const event = entry.event
    if (event?.type === 'assistant/message' && event.data?.turn !== undefined) {
      durableTurns.add(String(event.data.turn))
    }
  }
}

function compactEntries(
  entries: readonly HistoryEntry[],
  completedTurns: ReadonlySet<string>,
  durableMessageTurns: ReadonlySet<string>,
): HistoryEntry[] {
  if (completedTurns.size === 0 || durableMessageTurns.size === 0) return Array.from(entries)
  return entries.filter(entry => {
    const event = entry.event
    return event?.type !== 'assistant/chunk'
      || !completedTurns.has(String(event.data?.turn))
      || !durableMessageTurns.has(String(event.data?.turn))
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || 'DSH 会话历史不可用')
}

export default WechatHistoryService
