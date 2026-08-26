/**
 * Opportunistically prepares large encrypted history objects after a DSH turn
 * finishes, so opening that Session later does not pay the OSS cold-upload
 * latency. DSH remains the source of truth; this component only observes the
 * native loopback Host event stream and calls the existing read-only history
 * projection.
 */
import { WebSocket } from 'ws'
import type { Context } from '@deepseek-ai/cordis'
import type { WechatHistoryService } from './history-service.js'

interface SocketLike {
  on(event: string, listener: (...args: any[]) => void): this
  close(): void
  terminate?(): void
}

interface QueueEntry {
  readonly sessionId: string
  readonly attempt: number
}

export interface HistorySnapshotPrewarmerOptions {
  readonly dshPort?: number
  readonly warm: (sessionId: string, signal: AbortSignal) => Promise<'inline' | 'object'>
  readonly socketFactory?: (url: string) => SocketLike
  readonly settleDelayMs?: number
  readonly retryDelayMs?: number
  readonly maxQueue?: number
  readonly onDiagnostic?: (level: 'info' | 'warn', message: string) => void
  readonly onTrackingState?: (ready: boolean) => void
  readonly onSessionChanged?: (sessionId: string) => void
}

export interface HistorySnapshotPrewarmerBindingOptions
  extends Omit<HistorySnapshotPrewarmerOptions, 'warm' | 'onTrackingState' | 'onSessionChanged'> {
  readonly warm: (
    service: WechatHistoryService,
    sessionId: string,
    signal: AbortSignal,
  ) => Promise<'inline' | 'object'>
}

/**
 * Own the prewarmer under Cordis' native service-injection lifecycle.
 *
 * A plugin child context must not read `ctx.wechatHistory` later from a socket
 * callback: Cordis deliberately rejects service properties outside an inject
 * scope. Capture the concrete service once inside `ctx.inject()` and let that
 * child fiber stop the observer whenever the service or parent plugin unloads.
 */
export function bindHistorySnapshotPrewarmer(
  ctx: Context,
  options: HistorySnapshotPrewarmerBindingOptions,
) {
  return ctx.inject(['wechatHistory'], injectedCtx => {
    const service = injectedCtx.wechatHistory
    const prewarmer = new HistorySnapshotPrewarmer({
      dshPort: options.dshPort,
      socketFactory: options.socketFactory,
      settleDelayMs: options.settleDelayMs,
      retryDelayMs: options.retryDelayMs,
      maxQueue: options.maxQueue,
      onDiagnostic: options.onDiagnostic,
      warm: (sessionId, signal) => options.warm(service, sessionId, signal),
      onTrackingState: ready => service.setCacheTracking(ready),
      onSessionChanged: sessionId => service.invalidateSession(sessionId),
    })
    prewarmer.start()
    return () => prewarmer.stop()
  })
}

export class HistorySnapshotPrewarmer {
  private readonly dshPort: number
  private readonly warmCallback: HistorySnapshotPrewarmerOptions['warm']
  private readonly socketFactory: NonNullable<HistorySnapshotPrewarmerOptions['socketFactory']>
  private readonly settleDelayMs: number
  private readonly retryDelayMs: number
  private readonly maxQueue: number
  private readonly onDiagnostic?: HistorySnapshotPrewarmerOptions['onDiagnostic']
  private readonly onTrackingState?: HistorySnapshotPrewarmerOptions['onTrackingState']
  private readonly onSessionChanged?: HistorySnapshotPrewarmerOptions['onSessionChanged']
  private readonly running = new Map<string, boolean>()
  private readonly settleTimers = new Map<string, NodeJS.Timeout>()
  private readonly queued = new Set<string>()
  private readonly rerun = new Set<string>()
  private readonly queue: QueueEntry[] = []
  private socket: SocketLike | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelayMs = 1_000
  private active: { readonly sessionId: string; readonly controller: AbortController } | null = null
  private stopped = true
  private tracking = false

  constructor(options: HistorySnapshotPrewarmerOptions) {
    this.dshPort = Number.isSafeInteger(options.dshPort) && Number(options.dshPort) > 0
      ? Number(options.dshPort)
      : 3080
    this.warmCallback = options.warm
    this.socketFactory = options.socketFactory || (url => new WebSocket(url, {
      headers: { 'user-agent': 'HarnessRemote-HistoryPrewarmer/1' },
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
      handshakeTimeout: 10_000,
    }))
    this.settleDelayMs = nonNegative(options.settleDelayMs, 750)
    this.retryDelayMs = nonNegative(options.retryDelayMs, 15_000)
    this.maxQueue = positive(options.maxQueue, 8)
    this.onDiagnostic = options.onDiagnostic
    this.onTrackingState = options.onTrackingState
    this.onSessionChanged = options.onSessionChanged
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    for (const timer of this.settleTimers.values()) clearTimeout(timer)
    this.settleTimers.clear()
    this.queue.length = 0
    this.queued.clear()
    this.rerun.clear()
    this.running.clear()
    this.setTracking(false)
    this.active?.controller.abort(new Error('History prewarmer stopped'))
    this.active = null
    const socket = this.socket
    this.socket = null
    try { socket?.close() } catch { socket?.terminate?.() }
  }

  private connect(): void {
    if (this.stopped || this.socket) return
    let socket: SocketLike
    try {
      socket = this.socketFactory(`ws://127.0.0.1:${this.dshPort}/api/events.host`)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.on('open', () => {
      this.reconnectDelayMs = 1_000
      this.setTracking(true)
    })
    socket.on('message', (data: unknown, isBinary?: boolean) => {
      if (!isBinary) this.observe(data)
    })
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
      this.setTracking(false)
      this.scheduleReconnect()
    })
    socket.on('error', () => {
      if (this.socket === socket) this.socket = null
      this.setTracking(false)
      try { socket.terminate?.() } catch { /* reconnect below */ }
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.reconnectDelayMs
    this.reconnectDelayMs = Math.min(30_000, delay * 2)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private observe(raw: unknown): void {
    const frame = parseHostFrame(raw)
    if (!frame) return
    const sessionId = validSessionId(frame.sessionId)
    if (!sessionId) return
    // Invalidate before any event-specific work. This makes a concurrently
    // building latest window fail its revision check instead of entering the
    // cache after newer native data has already arrived.
    this.notifySessionChanged(sessionId)
    if (frame.type === 'host/session-removed') {
      this.forget(sessionId)
      return
    }
    if (frame.type !== 'host/session-status' || typeof frame.running !== 'boolean') return
    const wasRunning = this.running.get(sessionId)
    this.running.set(sessionId, frame.running)
    if (wasRunning === true && frame.running === false) this.settle(sessionId)
  }

  private settle(sessionId: string): void {
    const previous = this.settleTimers.get(sessionId)
    if (previous) clearTimeout(previous)
    const timer = setTimeout(() => {
      this.settleTimers.delete(sessionId)
      this.enqueue({ sessionId, attempt: 0 })
    }, this.settleDelayMs)
    timer.unref?.()
    this.settleTimers.set(sessionId, timer)
  }

  private enqueue(entry: QueueEntry): void {
    if (this.stopped || this.queued.has(entry.sessionId)) return
    if (this.active?.sessionId === entry.sessionId) {
      this.rerun.add(entry.sessionId)
      return
    }
    if (this.queue.length >= this.maxQueue) {
      const discarded = this.queue.shift()
      if (discarded) this.queued.delete(discarded.sessionId)
    }
    this.queue.push(entry)
    this.queued.add(entry.sessionId)
    this.pump()
  }

  private pump(): void {
    if (this.stopped || this.active) return
    const entry = this.queue.shift()
    if (!entry) return
    this.queued.delete(entry.sessionId)
    const controller = new AbortController()
    this.active = { sessionId: entry.sessionId, controller }
    const started = Date.now()
    void this.warmCallback(entry.sessionId, controller.signal)
      .then(transport => {
        this.diagnostic('info', `history prewarm ${transport} ${entry.sessionId.slice(-8)} in ${Date.now() - started}ms`)
      })
      .catch(error => {
        if (controller.signal.aborted || this.stopped) return
        this.diagnostic('warn', `history prewarm failed ${entry.sessionId.slice(-8)}: ${messageOf(error)}`)
        if (entry.attempt === 0) {
          const timer = setTimeout(() => {
            this.settleTimers.delete(entry.sessionId)
            this.enqueue({ sessionId: entry.sessionId, attempt: 1 })
          }, this.retryDelayMs)
          timer.unref?.()
          this.settleTimers.set(entry.sessionId, timer)
        }
      })
      .finally(() => {
        if (this.active?.controller === controller) this.active = null
        if (this.rerun.delete(entry.sessionId)) {
          this.enqueue({ sessionId: entry.sessionId, attempt: 0 })
        }
        this.pump()
      })
  }

  private forget(sessionId: string): void {
    this.running.delete(sessionId)
    this.rerun.delete(sessionId)
    const timer = this.settleTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.settleTimers.delete(sessionId)
    if (this.queued.delete(sessionId)) {
      const index = this.queue.findIndex(entry => entry.sessionId === sessionId)
      if (index >= 0) this.queue.splice(index, 1)
    }
    if (this.active?.sessionId === sessionId) this.active.controller.abort(new Error('Session removed'))
  }

  private setTracking(ready: boolean): void {
    if (this.tracking === ready) return
    this.tracking = ready
    try {
      this.onTrackingState?.(ready)
    } catch (error) {
      // A diagnostics/cache observer is optional acceleration. It must never
      // escape a WebSocket event callback and terminate the DSH host process.
      this.diagnostic('warn', `history tracking observer failed: ${messageOf(error)}`)
    }
  }

  private notifySessionChanged(sessionId: string): void {
    try {
      this.onSessionChanged?.(sessionId)
    } catch (error) {
      this.diagnostic('warn', `history invalidation observer failed: ${messageOf(error)}`)
    }
  }

  private diagnostic(level: 'info' | 'warn', message: string): void {
    try {
      this.onDiagnostic?.(level, message)
    } catch {
      // Diagnostics are deliberately non-authoritative and fail closed.
    }
  }
}

function parseHostFrame(raw: unknown): Record<string, any> | null {
  try {
    const data = Buffer.isBuffer(raw)
      ? raw
      : raw instanceof ArrayBuffer
        ? Buffer.from(raw)
        : ArrayBuffer.isView(raw)
          ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
          : Buffer.from(String(raw))
    if (data.byteLength === 0 || data.byteLength > 1024 * 1024) return null
    const root = JSON.parse(data.toString('utf8')) as Record<string, any>
    const candidates = [root, root.payload, root.payload?.payload]
    return candidates.find(value => value && typeof value.type === 'string') || null
  } catch {
    return null
  }
}

function validSessionId(value: unknown): string | null {
  return typeof value === 'string' && /^session-[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null
}

function positive(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function nonNegative(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error || 'unknown error')).slice(0, 180)
}

export default HistorySnapshotPrewarmer
