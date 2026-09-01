/**
 * Capability-selected DSH transport used by the WeChat gate.
 *
 * DSH 0.1.1 exposes the legacy dot-named API and two WebSocket downlinks.
 * DSH 0.1.2 exposes authenticated slash-named Remote RPC plus multiplexed
 * in-process streams.  This module is the only place that knows both shapes.
 * The mini program-facing contract remains the legacy one.
 */
import http, { type IncomingHttpHeaders } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { Context } from '@deepseek-ai/cordis'

const MAX_HTTP_BODY_BYTES = 64 * 1024 * 1024
const MAX_EVENT_BYTES = 1024 * 1024
const LEGACY_TIMEOUT_MS = 60_000
const STREAM_RESTART_BASE_MS = 250
const STREAM_RESTART_MAX_MS = 15_000
const STREAM_STABLE_RESET_MS = 30_000
// Bound the phone-facing event rate independently of whatever batching a DSH
// release chooses internally. WeChat must receive progressive updates, but a
// token-per-WebSocket-message stream can monopolize its single JS/render loop.
const LIVE_DELTA_FLUSH_MS = 32
const LIVE_DELTA_MAX_BYTES = 16 * 1024

export type DshAdapterMode = 'probing' | 'legacy' | 'modern' | 'unavailable'

export interface LegacyRpcResult {
  readonly ok: boolean
  readonly value?: any
  readonly error?: { readonly code?: string; readonly message?: string; readonly details?: object }
}

export interface AdapterFetchRequest {
  readonly path: string
  readonly method: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: Uint8Array
  readonly signal?: AbortSignal
}

interface ConnectionFetchHandler {
  fetch(request: Request): Promise<Response>
}

interface ModernConnection {
  readonly fetch: { register: (...args: any[]) => unknown }
  readonly requestRejection: (...args: any[]) => unknown
  createSharedFetchHandler(channel: '/api'): ConnectionFetchHandler
}

interface ModernGateway {
  readonly wireStream: {
    open(
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
    failure?(error: unknown): unknown
  }
}

interface CordisScope extends Context {
  readonly connection?: unknown
  readonly typertGateway?: unknown
}

/** One process-owned adapter. Capability selection is centralized and sticky. */
export class DshHostAdapterRuntime {
  private modeValue: DshAdapterMode = 'probing'
  private modern: ModernDshAdapter | null = null
  private readonly legacy: LegacyDshAdapter
  private disposed = false

  constructor(ctx: Context, dshPort = 3080) {
    this.legacy = new LegacyDshAdapter(dshPort)
    try {
      ctx.inject(['connection'], (scope: CordisScope) => {
        if (this.disposed) return
        const connection = scope.connection
        if (isModernConnection(connection)) {
          this.modeValue = 'probing'
          const modernFiber = ctx.inject(['typertGateway'], (gatewayScope: CordisScope) => {
            const gateway = gatewayScope.typertGateway
            if (!isModernGateway(gateway) || this.disposed) {
              this.modeValue = 'unavailable'
              return
            }
            const selected = new ModernDshAdapter(connection, gateway)
            this.modern = selected
            this.modeValue = 'modern'
            return () => {
              if (this.modern === selected) {
                selected.dispose()
                this.modern = null
                if (!this.disposed) this.modeValue = 'probing'
              }
            }
          })
          return () => modernFiber.dispose()
        }
        if (isLegacyConnection(connection)) {
          this.modeValue = 'legacy'
          return () => {
            if (!this.disposed && this.modeValue === 'legacy') this.modeValue = 'probing'
          }
        }
        this.modeValue = 'unavailable'
      })
    } catch {
      this.modeValue = 'unavailable'
    }
  }

  get mode(): DshAdapterMode {
    return this.modeValue
  }

  get usesModernTransport(): boolean {
    return this.modeValue === 'modern' && this.modern !== null
  }

  dispose(): void {
    this.disposed = true
    this.modern?.dispose()
    this.modern = null
    this.modeValue = 'unavailable'
  }

  /** Invoke one legacy mini-program RPC through the selected official Host API. */
  call(
    method: string,
    payload: Record<string, unknown>,
    signal: AbortSignal = new AbortController().signal,
    rpcId = `wechat-${randomUUID()}`,
  ): Promise<LegacyRpcResult> {
    if (this.modern) return this.modern.call(method, payload, signal, rpcId)
    if (this.modeValue === 'legacy') return this.legacy.call(method, payload, signal, rpcId)
    return Promise.resolve(unavailable('DSH Host API capability is not ready'))
  }

  /** Fetch-shaped carrier used by both the LAN door and public E2EE tunnel. */
  fetch(request: AdapterFetchRequest): Promise<Response> {
    if (this.modern) return this.modern.fetch(request)
    if (this.modeValue === 'legacy') return this.legacy.fetch(request)
    return Promise.resolve(Response.json({
      result: unavailable('DSH Host API capability is unavailable'),
    }, { status: 503 }))
  }

  /** Legacy events.host/events.mux stream, synthesized on modern DSH. */
  events(path: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    if (this.modern) return this.modern.events(path, signal)
    if (this.modeValue === 'legacy') return this.legacy.events(path, signal)
    throw new Error('DSH realtime capability is unavailable')
  }
}

/** 0.1.1 adapter: every old contract remains owned by the official loopback API. */
class LegacyDshAdapter {
  constructor(private readonly dshPort: number) {}

  async call(
    method: string,
    payload: Record<string, unknown>,
    signal: AbortSignal,
    rpcId: string,
  ): Promise<LegacyRpcResult> {
    const response = await this.fetch({
      path: `/api/${method}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({
        type: 'client-request', rpcId, method, payload,
      })),
      signal,
    })
    if (response.status !== 200) return unavailable(`DSH API HTTP ${response.status}`)
    const body = await response.json() as { readonly result?: LegacyRpcResult }
    return body.result ?? unavailable('DSH API returned an invalid response')
  }

  fetch(request: AdapterFetchRequest): Promise<Response> {
    return nodeFetch(this.dshPort, request)
  }

  events(path: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    return websocketEvents(`ws://127.0.0.1:${this.dshPort}${path}`, signal)
  }
}

/** 0.1.2 adapter: official shared Fetch handler plus official Remote streams. */
class ModernDshAdapter {
  private readonly fetchHandler: ConnectionFetchHandler
  private readonly eventsHub: ModernLegacyEventHub

  constructor(
    connection: ModernConnection,
    private readonly gateway: ModernGateway,
  ) {
    this.fetchHandler = connection.createSharedFetchHandler('/api')
    this.eventsHub = new ModernLegacyEventHub(
      gateway,
      (endpoint, args, signal) => this.callModern(
        endpoint, args, signal, `wechat-event-${randomUUID()}`,
      ),
    )
  }

  dispose(): void {
    this.eventsHub.dispose()
  }

  events(path: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    return this.eventsHub.subscribe(path, signal)
  }

  async fetch(request: AdapterFetchRequest): Promise<Response> {
    if (request.method.toUpperCase() === 'GET' || request.method.toUpperCase() === 'HEAD') {
      return this.fetchHandler.fetch(new Request(`http://dsh.internal${request.path}`, {
        method: request.method.toUpperCase(),
        headers: request.headers,
        signal: request.signal,
      }))
    }
    if (request.method.toUpperCase() !== 'POST') {
      return new Response('not found', { status: 404 })
    }
    const method = legacyMethodFromPath(request.path)
    if (!method) return new Response('not found', { status: 404 })
    let envelope: Record<string, any>
    try {
      envelope = JSON.parse(Buffer.from(request.body ?? []).toString('utf8')) as Record<string, any>
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    if (envelope?.type === 'client-response' && method === 'respond') {
      const result = await this.eventsHub.respond(String(envelope.rpcId || ''), envelope.result, request.signal)
      return Response.json(result)
    }
    if (envelope?.type !== 'client-request' || envelope.method !== method
      || typeof envelope.rpcId !== 'string' || !isRecord(envelope.payload)) {
      return new Response('invalid client-request message', { status: 400 })
    }
    const result = await this.call(
      method,
      envelope.payload,
      request.signal ?? new AbortController().signal,
      envelope.rpcId,
    )
    return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result })
  }

  async call(
    method: string,
    payload: Record<string, unknown>,
    signal: AbortSignal,
    rpcId: string,
  ): Promise<LegacyRpcResult> {
    try {
      if (method === 'host.describe') {
        return { ok: true, value: { cwd: process.cwd(), version: 'unknown' } }
      }
      if (method === 'workspace.list') {
        const frame = await firstStreamItem(
          this.gateway,
          'workspace/follow',
          { args: {} },
          signal,
        ) as Record<string, any>
        if (frame?.type !== 'baseline' || !isRecord(frame.value)) {
          return unavailable('DSH workspace baseline is unavailable')
        }
        return { ok: true, value: frame.value }
      }
      if (method === 'session.history') {
        const result = await this.history(payload, signal)
        if (result.ok && typeof payload.sessionId === 'string') {
          // A long-lived alpha Session follow can remain open after its
          // underlying Agent generation stopped delivering. Compare the
          // phone's authoritative history tail with the bridge head and
          // replace only this Session's stale lease before returning history.
          await waitWithSignal(this.eventsHub.ensureSessionFollow(
            payload.sessionId,
            legacyHistoryTail(result.value?.events),
          ), signal)
        }
        return result
      }
      if (method === 'session.models') return await this.models(payload, signal, rpcId)
      if (method === 'llm.providers' || method === 'llm.models') {
        return await this.legacyLlmDirectory(method, signal, rpcId)
      }
      if (method === 'host.openPath') {
        return await this.callModern('session/openWorkspacePath', { request: payload }, signal, rpcId)
      }

      if (method === 'session.prompt' && typeof payload.sessionId === 'string') {
        // Establish a fresh per-Session follow snapshot before prompt
        // admission. The HTTP RPC and realtime stream are separate carriers;
        // accepting a prompt behind a stale follow would otherwise make the
        // reply visible only after a later history refresh.
        await waitWithSignal(this.eventsHub.refreshSessionFollow(payload.sessionId), signal)
      }

      const translated = translateLegacyCall(method, payload, rpcId)
      const result = await this.callModern(translated.endpoint, translated.args, signal, rpcId)
      // Alpha releases changed when the remote-event waterfall becomes ready.
      // Reconcile mutations from their authoritative RPC result as well, so a
      // new Session is followed immediately even if api-session/added is late
      // or absent for this particular DSH/client version combination.
      if (result.ok && method === 'session.create') {
        this.eventsHub.observeSessionCreated(result.value)
      } else if (result.ok && method === 'session.list') {
        this.eventsHub.reconcileSessionCatalog(result.value?.items)
      }
      return result
    } catch (error) {
      if (signal.aborted) throw signal.reason
      return unavailable(messageOf(error))
    }
  }

  private async callModern(
    endpoint: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    rpcId: string,
  ): Promise<LegacyRpcResult> {
    const request = new Request(`http://dsh.internal/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId, method: endpoint, payload: { args },
      }),
      signal,
    })
    const response = await this.fetchHandler.fetch(request)
    if (response.status !== 200) return unavailable(`DSH Remote HTTP ${response.status}`)
    const body = await response.json() as { readonly result?: LegacyRpcResult }
    return body.result ?? unavailable('DSH Remote returned an invalid response')
  }

  private async history(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<LegacyRpcResult> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
    if (!sessionId) return badRequest('session.history requires sessionId')
    const opening = await firstStreamItem(
      this.gateway,
      'session/follow',
      { args: { request: {
        address: { kind: 'session', sessionId },
        ...(Number.isSafeInteger(payload.maxMessages)
          ? { maxMessages: Number(payload.maxMessages) } : {}),
      } } },
      signal,
    ) as Record<string, any>
    if (opening?.type !== 'snapshot' || !Number.isSafeInteger(opening.cursor)) {
      return unavailable('DSH Session follow snapshot is unavailable')
    }
    let records: unknown = opening.records
    let hasMore = opening.hasMore === true
    if (payload.beforeSeq !== undefined) {
      const beforeSeq = Number(payload.beforeSeq)
      if (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0) return badRequest('invalid history cursor')
      const page = await this.callModern('session/page', {
        request: {
          address: { kind: 'session', sessionId },
          throughSeq: opening.cursor,
          beforeSeq,
          ...(Number.isSafeInteger(payload.maxMessages)
            ? { maxMessages: Number(payload.maxMessages) } : {}),
        },
      }, signal, `wechat-history-${randomUUID()}`)
      if (!page.ok) return page
      records = page.value?.records
      hasMore = page.value?.hasMore === true
    }
    return {
      ok: true,
      value: {
        events: legacyHistoryEntries(records),
        hasMore,
        ...(payload.beforeSeq === undefined && isRecord(opening.projections)
          ? { projections: opening.projections } : {}),
      },
    }
  }

  private async models(
    payload: Record<string, unknown>,
    signal: AbortSignal,
    rpcId: string,
  ): Promise<LegacyRpcResult> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
    if (!sessionId) return badRequest('session.models requires sessionId')
    const [catalog, opening] = await Promise.all([
      this.callModern('session/modelCatalog', {}, signal, rpcId),
      firstStreamItem(
        this.gateway,
        'session/follow',
        { args: { request: { address: { kind: 'session', sessionId }, maxMessages: 1 } } },
        signal,
      ) as Promise<Record<string, any>>,
    ])
    if (!catalog.ok) return catalog
    const value = catalog.value || {}
    const projection = opening?.projections?.values?.modelSelection
    const current = projection?.next || projection?.lastUsed || value.default
    return {
      ok: true,
      value: {
        current,
        routable: Boolean(current && Array.isArray(value.routableProviders)
          && value.routableProviders.includes(current.provider)),
        groups: Array.isArray(value.groups) ? value.groups : [],
        failures: Array.isArray(value.failures) ? value.failures : [],
      },
    }
  }

  private async legacyLlmDirectory(
    method: string,
    signal: AbortSignal,
    rpcId: string,
  ): Promise<LegacyRpcResult> {
    const catalog = await this.callModern('session/modelCatalog', {}, signal, rpcId)
    if (!catalog.ok) return catalog
    if (method === 'llm.providers') {
      return {
        ok: true,
        value: {
          providers: (catalog.value?.groups || []).map((group: any) => ({
            id: group.id, name: group.name,
          })),
        },
      }
    }
    return { ok: true, value: catalog.value }
  }
}

/** Shared modern stream fan-out. One $events client prevents duplicate waterfalls. */
class ModernLegacyEventHub {
  private readonly hostSubscribers = new Set<AsyncFrameQueue>()
  private readonly muxSubscribers = new Set<AsyncFrameQueue>()
  private readonly lifetime = new AbortController()
  private readonly pending = new Map<string, {
    readonly clientId: string
    readonly eventId: string
    readonly event: string
    readonly sessionId: string
    readonly rpcId: string
    readonly payload: Record<string, unknown>
    responding: boolean
  }>()
  private readonly queueBaselines = new Map<string, readonly unknown[]>()
  private readonly projectionBaselines = new Map<string, Map<string, {
    readonly value: unknown
    readonly seq: number
  }>>()
  private readonly sessionHeads = new Map<string, number>()
  private readonly sessionSummaries = new Map<string, Record<string, any>>()
  private readonly desiredSessions = new Set<string>()
  private readonly liveDeltas = new Map<string, {
    readonly key: string
    readonly field: 'text' | 'argumentsDelta'
    readonly event: Record<string, any>
    bytes: number
    timer: NodeJS.Timeout
  }>()
  private clientId = ''
  private started = false
  private generation = 0
  private generationAbort: AbortController | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private stableTimer: NodeJS.Timeout | null = null
  private restartAttempt = 0
  private readonly followedSessions = new Map<string, {
    readonly generation: number
    readonly controller: AbortController
    readonly ready: Promise<number>
    readonly reject: (error: unknown) => void
  }>()

  constructor(
    private readonly gateway: ModernGateway,
    private readonly callEndpoint: (
      endpoint: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
    ) => Promise<LegacyRpcResult>,
  ) {}

  dispose(): void {
    this.flushAllSessionDeltas()
    this.lifetime.abort(new Error('DSH modern compatibility bridge disposed'))
    this.generationAbort?.abort(new Error('DSH modern compatibility bridge disposed'))
    this.generationAbort = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.restartTimer = null
    this.stableTimer = null
    for (const queue of this.hostSubscribers) queue.end()
    for (const queue of this.muxSubscribers) queue.end()
    this.hostSubscribers.clear()
    this.muxSubscribers.clear()
    this.pending.clear()
    this.queueBaselines.clear()
    this.projectionBaselines.clear()
    this.sessionHeads.clear()
    this.sessionSummaries.clear()
    this.desiredSessions.clear()
    for (const sessionId of Array.from(this.followedSessions.keys())) {
      this.stopSessionFollow(sessionId, 'DSH modern compatibility bridge disposed')
    }
  }

  subscribe(path: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    const target = path.split('?', 1)[0]
    const subscribers = target === '/api/events.host'
      ? this.hostSubscribers
      : target === '/api/events.mux'
        ? this.muxSubscribers
        : null
    if (!subscribers) throw new Error('Unsupported DSH realtime path')
    const queue = new AsyncFrameQueue()
    subscribers.add(queue)
    // A downstream WebSocket generation is independent from the long-lived
    // modern DSH streams. Replaying only into this queue prevents a newly
    // connected phone from duplicating frames in already healthy clients.
    if (target === '/api/events.mux') {
      this.flushAllSessionDeltas()
      this.replayMux(queue)
    }
    this.start()
    const close = (): void => {
      subscribers.delete(queue)
      queue.end()
    }
    signal.addEventListener('abort', close, { once: true })
    return queue.iterate(() => signal.removeEventListener('abort', close))
  }

  async respond(rpcId: string, result: unknown, signal?: AbortSignal): Promise<object> {
    const pending = this.pending.get(rpcId)
    if (!pending || !this.clientId || pending.clientId !== this.clientId) {
      return { accepted: false, reason: 'unknown-rpc-id' }
    }
    if (pending.responding) return { accepted: false, reason: 'response-in-flight' }
    pending.responding = true
    try {
      const modernOutcome = legacyResponseOutcome(pending.event, result)
      const response = await this.callEndpoint(
        '$events/result',
        {
          clientId: pending.clientId,
          eventId: pending.eventId,
          outcome: modernOutcome,
        },
        signal ?? new AbortController().signal,
      )
      if (response.ok && this.pending.get(rpcId) === pending) {
        this.pending.delete(rpcId)
        this.broadcastResolved(pending, result)
      }
      return response.ok
        ? { accepted: true }
        : { accepted: false, reason: response.error?.code || 'rejected' }
    } finally {
      if (this.pending.get(rpcId) === pending) pending.responding = false
    }
  }

  observeSessionCreated(value: unknown): void {
    if (!isRecord(value)) return
    const nested = isRecord(value.session) ? value.session : value
    const sessionId = typeof nested.sessionId === 'string' ? nested.sessionId : ''
    if (!sessionId) return
    const previous = this.sessionSummaries.get(sessionId)
    const summary = { ...(previous || {}), ...nested, sessionId }
    this.sessionSummaries.set(sessionId, summary)
    if (!previous) this.host({ type: 'host/session-added', ...summary })
    void this.ensureSessionFollow(sessionId)
  }

  ensureSessionFollow(sessionId: string, throughSeq?: number): Promise<number> {
    if (!sessionId) return Promise.reject(new Error('Session follow requires sessionId'))
    this.desiredSessions.add(sessionId)
    this.ensureGenerationActive()
    const head = this.sessionHeads.get(sessionId) ?? -1
    const stale = Number.isSafeInteger(throughSeq) && Number(throughSeq) > head
    return this.followSession(sessionId, this.generation, this.generationAbort?.signal, stale)
  }

  refreshSessionFollow(sessionId: string): Promise<number> {
    if (!sessionId) return Promise.reject(new Error('Session follow requires sessionId'))
    this.desiredSessions.add(sessionId)
    this.ensureGenerationActive()
    return this.followSession(sessionId, this.generation, this.generationAbort?.signal, true)
  }

  private ensureGenerationActive(): void {
    if (this.started) return
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.start()
  }

  reconcileSessionCatalog(items: unknown): void {
    if (!Array.isArray(items)) return
    const observed = new Set<string>()
    for (const item of items) {
      if (!isRecord(item) || typeof item.sessionId !== 'string') continue
      const sessionId = item.sessionId
      observed.add(sessionId)
      const previous = this.sessionSummaries.get(sessionId)
      this.sessionSummaries.set(sessionId, item)
      if (!previous) this.host({ type: 'host/session-added', ...item })
      else if (Boolean(previous.running) !== Boolean(item.running)) {
        this.host({ type: 'host/session-status', sessionId, running: Boolean(item.running) })
      }
    }
    for (const sessionId of Array.from(this.sessionSummaries.keys())) {
      if (observed.has(sessionId)) continue
      this.sessionSummaries.delete(sessionId)
      this.desiredSessions.delete(sessionId)
      this.stopSessionFollow(sessionId, 'DSH Session was removed')
      this.queueBaselines.delete(sessionId)
      this.projectionBaselines.delete(sessionId)
      this.sessionHeads.delete(sessionId)
      this.host({ type: 'host/session-removed', sessionId })
    }
  }

  private start(): void {
    if (this.started || this.restartTimer || this.lifetime.signal.aborted) return
    this.started = true
    this.generation += 1
    const generation = this.generation
    const controller = new AbortController()
    this.generationAbort = controller
    const signal = AbortSignal.any([this.lifetime.signal, controller.signal])
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.stableTimer = setTimeout(() => {
      if (this.generation === generation && !signal.aborted) this.restartAttempt = 0
    }, STREAM_STABLE_RESET_MS)
    this.stableTimer.unref?.()
    void this.runGeneration(generation, signal)
  }

  private async runGeneration(generation: number, signal: AbortSignal): Promise<void> {
    try {
      await this.consumeSessions(generation, signal)
      await Promise.all([
        this.consumeRemoteEvents(signal),
        this.consumeWorkspace(signal),
        this.consumeControl(signal),
      ])
      if (!signal.aborted) throw new Error('DSH modern compatibility streams ended')
    } catch (error) {
      this.failGeneration(generation, error)
    }
  }

  private failGeneration(generation: number, error: unknown): void {
    if (generation !== this.generation || !this.started || this.lifetime.signal.aborted) return
    this.generationAbort?.abort(new Error('DSH modern compatibility generation replaced'))
    this.generationAbort = null
    this.started = false
    this.clientId = ''
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.stableTimer = null
    for (const [sessionId, owner] of Array.from(this.followedSessions.entries())) {
      if (owner.generation === generation) {
        this.stopSessionFollow(sessionId, 'DSH modern compatibility generation replaced')
      }
    }
    // A waterfall belongs to one upstream $events clientId. Retire its local
    // card before reconnecting; the new $events generation will replay any
    // still-authoritative request with a fresh clientId and the same event id.
    this.flushAllSessionDeltas()
    this.retirePending()
    this.broadcastError(error)
    const delay = Math.min(
      STREAM_RESTART_BASE_MS * (2 ** Math.min(this.restartAttempt, 8)),
      STREAM_RESTART_MAX_MS,
    )
    this.restartAttempt += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.start()
    }, delay)
    this.restartTimer.unref?.()
  }

  private async consumeRemoteEvents(signal: AbortSignal): Promise<void> {
    const stream = await openModernStream(this.gateway, '$events', { args: {} }, signal)
    for await (const value of stream) {
      if (!isRecord(value)) continue
      if (value.type === 'ready' && typeof value.clientId === 'string') {
        this.clientId = value.clientId
        continue
      }
      if (value.type === 'emit') {
        this.consumeEmit(String(value.event || ''), Array.isArray(value.args) ? value.args : [])
        continue
      }
      if (value.type === 'waterfall') this.consumeWaterfall(value)
      if (value.type === 'cancel' && typeof value.eventId === 'string') {
        for (const [rpcId, pending] of this.pending) {
          if (pending.eventId !== value.eventId) continue
          this.pending.delete(rpcId)
          this.broadcastResolved(pending)
        }
      }
    }
    if (!signal.aborted) throw new Error('DSH $events stream ended')
  }

  private consumeEmit(event: string, args: unknown[]): void {
    if (event === 'api-session/added' && isRecord(args[0])) {
      const summary = args[0]
      const sessionId = String(summary.sessionId || '')
      const previous = this.sessionSummaries.get(sessionId)
      if (sessionId) this.sessionSummaries.set(sessionId, summary)
      if (!previous) this.host({ type: 'host/session-added', ...summary })
      void this.ensureSessionFollow(sessionId)
    } else if (event === 'api-session/removed') {
      const sessionId = String(args[0] || '')
      this.sessionSummaries.delete(sessionId)
      this.desiredSessions.delete(sessionId)
      this.stopSessionFollow(sessionId, 'DSH Session was removed')
      this.queueBaselines.delete(sessionId)
      this.projectionBaselines.delete(sessionId)
      this.sessionHeads.delete(sessionId)
      this.host({ type: 'host/session-removed', sessionId: args[0] })
    } else if (event === 'api-session/status') {
      const sessionId = String(args[0] || '')
      const previous = this.sessionSummaries.get(sessionId)
      if (previous) this.sessionSummaries.set(sessionId, { ...previous, running: Boolean(args[1]) })
      this.host({ type: 'host/session-status', sessionId, running: args[1] })
    } else if (event === 'api-session/error') {
      this.host({ type: 'host/agent-error', sessionId: args[0], message: args[1] })
    } else {
      this.host({ type: 'host/remote-event', event, args })
    }
  }

  private consumeWaterfall(frame: Record<string, any>): void {
    if (typeof frame.clientId === 'string') this.clientId = frame.clientId
    if (typeof frame.eventId !== 'string' || typeof frame.event !== 'string'
      || typeof frame.agentId !== 'string' || !isRecord(frame.request)) return
    const rpcId = frame.eventId
    if (frame.event === 'approval/request') {
      const payload = {
        type: 'approval/requested',
        sessionId: frame.agentId,
        approvalId: frame.eventId,
        ...frame.request,
      }
      this.pending.set(rpcId, {
        clientId: this.clientId, eventId: frame.eventId, event: frame.event,
        sessionId: frame.agentId, rpcId, payload, responding: false,
      })
      this.mux(payload, rpcId)
    } else if (frame.event === 'user-questions/request') {
      const payload = {
        type: 'question/requested',
        sessionId: frame.agentId,
        questions: frame.request.questions,
      }
      this.pending.set(rpcId, {
        clientId: this.clientId, eventId: frame.eventId, event: frame.event,
        sessionId: frame.agentId, rpcId, payload, responding: false,
      })
      this.mux(payload, rpcId)
    }
  }

  private async consumeWorkspace(signal: AbortSignal): Promise<void> {
    const stream = await openModernStream(this.gateway, 'workspace/follow', { args: {} }, signal)
    for await (const value of stream) {
      if (!isRecord(value) || value.type === 'baseline') continue
      if (value.type === 'upsert') this.host({ type: 'host/workspace-changed', workspace: value.workspace })
      else if (value.type === 'remove') this.host({ type: 'host/workspace-removed', workspaceId: value.workspaceId })
      else if (value.type === 'order') this.host({ type: 'host/workspace-order-changed', workspaceIds: value.workspaceIds })
      else if (value.type === 'archived') this.host({ type: 'host/archived-sessions-changed', archivedSessionIds: value.archivedSessionIds })
    }
    if (!signal.aborted) throw new Error('DSH workspace stream ended')
  }

  private async consumeControl(signal: AbortSignal): Promise<void> {
    const stream = await openModernStream(this.gateway, 'session/control', { args: {} }, signal)
    for await (const value of stream) {
      if (!isRecord(value)) continue
      if (value.type === 'baseline' && isRecord(value.value)) {
        const queues = isRecord(value.value.queues) ? value.value.queues : {}
        for (const sessionId of this.queueBaselines.keys()) {
          if (!Object.hasOwn(queues, sessionId)) this.cacheQueue(sessionId, [])
        }
        for (const [sessionId, items] of Object.entries(queues)) {
          this.cacheQueue(sessionId, items)
        }
        for (const [sessionId, jobs] of Object.entries(value.value.jobs || {})) {
          this.mux({ type: 'session/jobs', sessionId, jobs })
        }
        for (const [sessionId, projection] of Object.entries(value.value.projections || {})) {
          if (!isRecord(projection) || !isRecord(projection.values)) continue
          for (const [key, projectionValue] of Object.entries(projection.values)) {
            this.cacheProjection(sessionId, key, projectionValue, projection.asOfSeq)
          }
        }
      } else if (value.type === 'queue') {
        this.cacheQueue(String(value.sessionId || ''), value.items)
      } else if (value.type === 'jobs') {
        this.mux({ type: 'session/jobs', sessionId: value.sessionId, jobs: value.jobs })
      } else if (value.type === 'projection') {
        this.cacheProjection(String(value.sessionId || ''), String(value.key || ''), value.value, value.seq)
      }
    }
    if (!signal.aborted) throw new Error('DSH session control stream ended')
  }

  private async consumeSessions(generation: number, signal: AbortSignal): Promise<void> {
    const result = await invokeModernRpc(this.gateway, 'session/list', { args: { _request: {} } }, signal)
    if (!result.ok || !Array.isArray(result.value?.items)) {
      throw new Error(result.error?.message || 'DSH session catalog is unavailable')
    }
    const available = new Set<string>()
    for (const item of result.value.items) {
      if (typeof item?.sessionId !== 'string') continue
      this.sessionSummaries.set(item.sessionId, item)
      available.add(item.sessionId)
    }
    // Catalog discovery stays lightweight. Only Sessions explicitly opened by
    // the phone (or newly created while connected) own a live follow stream.
    // This avoids an O(history-count) waterfall during every cold reconnect.
    for (const sessionId of this.desiredSessions) {
      if (available.has(sessionId)) void this.followSession(sessionId, generation, signal)
    }
  }

  private followSession(
    sessionId: string,
    generation = this.generation,
    signal?: AbortSignal,
    replace = false,
  ): Promise<number> {
    if (!sessionId) return Promise.reject(new Error('Session follow requires sessionId'))
    const previous = this.followedSessions.get(sessionId)
    if (previous && previous.generation === generation && !replace) return previous.ready
    if (previous) this.stopSessionFollow(sessionId, 'DSH Session follow refreshed')

    const controller = new AbortController()
    const generationSignal = signal ?? this.generationAbort?.signal ?? this.lifetime.signal
    const followSignal = AbortSignal.any([generationSignal, controller.signal])
    let resolveReady!: (cursor: number) => void
    let rejectReady!: (error: unknown) => void
    let readySettled = false
    const ready = new Promise<number>((resolve, reject) => {
      resolveReady = value => { readySettled = true; resolve(value) }
      rejectReady = error => { readySettled = true; reject(error) }
    })
    // Catalog and $events discovery intentionally start follows without
    // awaiting them; keep a failed opening from becoming an unhandled Promise.
    void ready.catch(() => {})
    const lease = { generation, controller, ready, reject: rejectReady }
    this.followedSessions.set(sessionId, lease)
    void (async () => {
      const legacyViewState = createLegacyViewState()
      try {
        const stream = await openModernStream(this.gateway, 'session/follow', {
          args: { request: { address: { kind: 'session', sessionId } } },
        }, followSignal)
        let opened = false
        for await (const value of stream) {
          if (!isRecord(value)) continue
          if (!opened && value.type === 'snapshot') {
            opened = true
            this.flushSessionDelta(sessionId)
            // Seed pending mutation calls from the opening window. A tool result
            // may arrive immediately after the snapshot for a call it contains.
            legacyHistoryEntries(value.records, legacyViewState)
            if (Number.isSafeInteger(value.cursor)) {
              this.sessionHeads.set(sessionId, Number(value.cursor))
              if (!readySettled) resolveReady(Number(value.cursor))
            } else throw new Error(`DSH Session snapshot cursor is invalid for ${sessionId}`)
            this.mux({ type: 'session/subscribed', sessionId, lastSeq: value.cursor })
          } else if (value.type === 'event' && isRecord(value.event)) {
            const synthesizedView = legacyMutationView(value.event, legacyViewState)
            const view = Object.hasOwn(value, 'view') ? value.view : synthesizedView
            this.publishSessionEvent(sessionId, value.event, view)
          } else if (value.type === 'chunks' && isRecord(value.event)) {
            // Current official follow streams use scalar SessionEventEntry
            // frames after their snapshot; packed chunk rows are a durable
            // history/snapshot shape. Keep this defensive branch for a Host
            // that forwards such a row live, without claiming alpha.3 does so.
            // Preserve it as one legacy occurrence with an inclusive seqEnd.
            const event = coalesceChunkRowEvent(value.event)
            if (event) this.publishSessionEvent(sessionId, event)
          }
        }
        if (!followSignal.aborted) throw new Error(`DSH Session stream ended for ${sessionId}`)
      } catch (error) {
        if (!readySettled) rejectReady(error)
        if (!followSignal.aborted) this.failGeneration(generation, error)
      } finally {
        if (this.followedSessions.get(sessionId) === lease) this.followedSessions.delete(sessionId)
      }
    })()
    return ready
  }

  private stopSessionFollow(sessionId: string, reason: string): void {
    const current = this.followedSessions.get(sessionId)
    if (!current) return
    this.followedSessions.delete(sessionId)
    current.reject(new Error(reason))
    current.controller.abort(new Error(reason))
  }

  private cacheQueue(sessionId: string, items: unknown): void {
    if (!sessionId) return
    const normalized = Array.isArray(items) ? items : []
    this.queueBaselines.set(sessionId, normalized)
    this.mux({ type: 'session/queue', sessionId, items: normalized })
  }

  private cacheProjection(sessionId: string, key: string, value: unknown, seq: unknown): void {
    if (!sessionId || !key || !Number.isSafeInteger(seq)) return
    let rows = this.projectionBaselines.get(sessionId)
    if (!rows) {
      rows = new Map()
      this.projectionBaselines.set(sessionId, rows)
    }
    const previous = rows.get(key)
    if (previous && Number(seq) < previous.seq) return
    const cell = { value, seq: Number(seq) }
    rows.set(key, cell)
    this.mux({ type: 'session/projection', sessionId, key, value, seq: cell.seq })
  }

  private replayMux(queue: AsyncFrameQueue): void {
    for (const [sessionId, lastSeq] of this.sessionHeads) {
      this.push(queue, { type: 'session/subscribed', sessionId, lastSeq })
    }
    for (const [sessionId, items] of this.queueBaselines) {
      this.push(queue, { type: 'session/queue', sessionId, items })
    }
    for (const [sessionId, rows] of this.projectionBaselines) {
      for (const [key, cell] of rows) {
        this.push(queue, { type: 'session/projection', sessionId, key, value: cell.value, seq: cell.seq })
      }
    }
    for (const pending of this.pending.values()) {
      if (!pending.responding) this.push(queue, pending.payload, pending.rpcId)
    }
  }

  private broadcastResolved(
    pending: { readonly event: string; readonly sessionId: string; readonly eventId: string; readonly rpcId: string },
    result?: unknown,
  ): void {
    if (pending.event === 'approval/request') {
      this.mux({
        type: 'approval/resolved', sessionId: pending.sessionId,
        approvalId: pending.eventId,
        ...(isRecord(result) && isRecord(result.value)
          ? { outcome: result.value.outcome } : {}),
      })
    } else if (pending.event === 'user-questions/request') {
      this.mux({
        type: 'question/resolved', sessionId: pending.sessionId,
        questionRpcId: pending.rpcId,
        ...(isRecord(result) && isRecord(result.value)
          ? { outcome: result.value.answer } : {}),
      })
    }
  }

  private retirePending(): void {
    for (const pending of this.pending.values()) this.broadcastResolved(pending)
    this.pending.clear()
  }

  private host(payload: object, rpcId?: string): void {
    this.broadcast(this.hostSubscribers, payload, rpcId)
  }

  private mux(payload: object, rpcId?: string): void {
    this.broadcast(this.muxSubscribers, payload, rpcId)
  }

  /**
   * Coalesce scalar delta occurrences at the one common phone-facing boundary.
   * This covers old DSH scalar streams, alpha packed rows and future releases
   * without leaking release-specific transport behavior into the mini program.
   */
  private publishSessionEvent(sessionId: string, event: Record<string, any>, view?: unknown): void {
    const descriptor = liveDeltaDescriptor(event)
    if (!descriptor || view !== undefined) {
      this.flushSessionDelta(sessionId)
      this.commitSessionHead(sessionId, event)
      this.mux({
        type: 'session/event', sessionId, event,
        ...(view === undefined ? {} : { view }),
      })
      return
    }

    const startSeq = Number(event.seq)
    const endSeq = eventRangeEnd(event)
    const pending = this.liveDeltas.get(sessionId)
    const nextBytes = Buffer.byteLength(descriptor.value)
    if (pending && (pending.key !== descriptor.key
      || startSeq !== eventRangeEnd(pending.event) + 1
      || pending.bytes + nextBytes > LIVE_DELTA_MAX_BYTES)) {
      this.flushSessionDelta(sessionId)
    }

    const current = this.liveDeltas.get(sessionId)
    if (current) {
      const chunk = current.event.data.chunk
      chunk[current.field] += descriptor.value
      current.event.seqEnd = endSeq
      current.bytes += nextBytes
      return
    }

    const chunk = { ...event.data.chunk, [descriptor.field]: descriptor.value }
    const normalized = {
      ...event,
      seqEnd: endSeq,
      data: { ...event.data, chunk },
    }
    const timer = setTimeout(() => this.flushSessionDelta(sessionId), LIVE_DELTA_FLUSH_MS)
    timer.unref?.()
    this.liveDeltas.set(sessionId, {
      key: descriptor.key,
      field: descriptor.field,
      event: normalized,
      bytes: nextBytes,
      timer,
    })
  }

  private flushSessionDelta(sessionId: string): void {
    const pending = this.liveDeltas.get(sessionId)
    if (!pending) return
    this.liveDeltas.delete(sessionId)
    clearTimeout(pending.timer)
    this.commitSessionHead(sessionId, pending.event)
    this.mux({ type: 'session/event', sessionId, event: pending.event })
  }

  private flushAllSessionDeltas(): void {
    for (const sessionId of Array.from(this.liveDeltas.keys())) this.flushSessionDelta(sessionId)
  }

  private commitSessionHead(sessionId: string, event: Record<string, any>): void {
    const seq = eventRangeEnd(event)
    if (!Number.isSafeInteger(seq)) return
    this.sessionHeads.set(sessionId, Math.max(this.sessionHeads.get(sessionId) ?? -1, seq))
  }

  private broadcast(subscribers: Set<AsyncFrameQueue>, payload: object, rpcId?: string): void {
    const bytes = this.encode(payload, rpcId)
    if (!bytes) return
    for (const subscriber of subscribers) subscriber.push(bytes)
  }

  private push(queue: AsyncFrameQueue, payload: object, rpcId?: string): void {
    const bytes = this.encode(payload, rpcId)
    if (bytes) queue.push(bytes)
  }

  private encode(payload: object, rpcId?: string): Uint8Array | null {
    const bytes = Buffer.from(JSON.stringify({
      rpcId: rpcId || `push-${randomUUID()}`,
      payload,
    }))
    return bytes.byteLength <= MAX_EVENT_BYTES ? bytes : null
  }

  private broadcastError(error: unknown): void {
    const payload = {
      type: 'stream/error',
      error: { code: 'compatibility-stream', message: messageOf(error), details: {} },
    }
    this.host(payload)
    this.mux(payload)
  }
}

class AsyncFrameQueue {
  private readonly frames: Uint8Array[] = []
  private waiter: (() => void) | null = null
  private ended = false

  push(frame: Uint8Array): void {
    if (this.ended) return
    this.frames.push(frame)
    this.waiter?.()
  }

  end(): void {
    this.ended = true
    this.waiter?.()
  }

  async *iterate(cleanup: () => void): AsyncGenerator<Uint8Array> {
    try {
      while (!this.ended) {
        while (this.frames.length) yield this.frames.shift() as Uint8Array
        if (this.ended) return
        await new Promise<void>(resolve => { this.waiter = resolve })
        this.waiter = null
      }
    } finally {
      cleanup()
      this.end()
    }
  }
}

function translateLegacyCall(
  method: string,
  payload: Record<string, unknown>,
  rpcId: string,
): { endpoint: string; args: Record<string, unknown> } {
  if (method.includes('/')) {
    return {
      endpoint: method,
      args: isRecord(payload.args) ? payload.args : payload,
    }
  }
  const dot = method.indexOf('.')
  if (dot <= 0 || dot === method.length - 1) return { endpoint: method, args: payload }
  let namespace = method.slice(0, dot)
  let action = method.slice(dot + 1)
  if (namespace === 'agentPreset') namespace = 'agentPresets'
  if (namespace === 'subagent') {
    namespace = 'subagents'
    if (action === 'interrupt') action = 'interruptByParent'
  }
  if (namespace === 'goal') namespace = 'goals'
  if (namespace === 'agentPresets' && action === 'select') {
    return {
      endpoint: 'agentPresets/select',
      args: {
        agentId: payload.sessionId,
        agentPreset: payload.agentPreset,
      },
    }
  }
  if (namespace === 'goals') {
    const common = {
      agentId: payload.sessionId,
      ...(isRecord(payload.ref) ? { ref: payload.ref } : {}),
    }
    if (action === 'create') {
      return {
        endpoint: 'goals/create',
        args: { agentId: payload.sessionId, request: { objective: payload.objective } },
      }
    }
    if (action === 'edit') {
      return {
        endpoint: 'goals/edit',
        args: { ...common, request: { objective: payload.objective } },
      }
    }
    return { endpoint: `goals/${action}`, args: common }
  }
  const requestDomains = new Set(['session', 'workspace'])
  if (namespace === 'session' && action === 'list') {
    return { endpoint: 'session/list', args: { _request: payload } }
  }
  const request = requestDomains.has(namespace)
    ? {
      ...payload,
      ...(namespace === 'session' && action === 'prompt' && !Object.hasOwn(payload, 'requestId')
        ? { requestId: rpcId } : {}),
    }
    : payload
  return {
    endpoint: `${namespace}/${action}`,
    args: requestDomains.has(namespace) ? { request } : request,
  }
}

interface LegacyViewState {
  readonly mutationPaths: Map<string, string | null>
}

function createLegacyViewState(): LegacyViewState {
  return { mutationPaths: new Map() }
}

function legacyHistoryEntries(
  records: unknown,
  viewState: LegacyViewState = createLegacyViewState(),
): Array<{ readonly event: any; readonly view?: any }> {
  if (!Array.isArray(records)) return []
  const entries: Array<{ event: any; view?: any }> = []
  for (const record of records) {
    if (!isRecord(record) || !isRecord(record.event)) continue
    if (record.type !== 'chunks') {
      const synthesizedView = legacyMutationView(record.event, viewState)
      entries.push({
        event: record.event,
        ...(Object.hasOwn(record, 'view')
          ? { view: record.view }
          : synthesizedView === undefined ? {} : { view: synthesizedView }),
      })
      continue
    }
    const event = coalesceChunkRowEvent(record.event)
    if (event) entries.push({ event })
  }
  return entries
}

/**
 * Recreate the legacy diff view from alpha's durable mutation vocabulary.
 *
 * DSH 0.1.2 deliberately removed presentation `view` objects from the Host
 * journal. Its official deliverables client derives produced files from
 * successful first-party `write`, `edit`, and mutating `str_replace_editor`
 * calls. The mini-program contract still consumes the earlier diff view, so
 * the compatibility boundary performs that same deterministic derivation.
 */
function legacyMutationView(
  event: Record<string, any>,
  state: LegacyViewState,
): { readonly view: { readonly card: 'diff'; readonly diffs: readonly { readonly path: string }[] } } | undefined {
  const data = isRecord(event.data) ? event.data : null
  if (!data) return undefined
  if (event.type === 'tool/call') {
    const callId = typeof data.callId === 'string' ? data.callId : ''
    if (callId) state.mutationPaths.set(callId, mutationPath(data.name, data.arguments))
    return undefined
  }
  if (event.type !== 'tool/result') return undefined
  const message = isRecord(data.message) ? data.message : null
  const source = message && isRecord(message.source) ? message.source : null
  const firstContent = message && Array.isArray(message.content) && isRecord(message.content[0])
    ? message.content[0] : null
  const callId = typeof source?.callId === 'string'
    ? source.callId
    : typeof firstContent?.toolCallId === 'string' ? firstContent.toolCallId : ''
  if (!callId) return undefined
  const path = state.mutationPaths.get(callId)
  state.mutationPaths.delete(callId)
  if (!path || firstContent?.isError === true) return undefined
  return { view: { card: 'diff', diffs: [{ path }] } }
}

function mutationPath(name: unknown, argumentsRaw: unknown): string | null {
  if (typeof name !== 'string' || typeof argumentsRaw !== 'string') return null
  let args: Record<string, unknown>
  try {
    const parsed = JSON.parse(argumentsRaw)
    if (!isRecord(parsed)) return null
    args = parsed
  } catch {
    return null
  }
  if (name === 'write') {
    return typeof args.content === 'string' ? pathValue(args.file_path) : null
  }
  if (name === 'edit') {
    const valid = typeof args.old_string === 'string'
      && args.old_string.length > 0
      && typeof args.new_string === 'string'
      && args.old_string !== args.new_string
      && (args.replace_all === undefined || typeof args.replace_all === 'boolean')
    return valid ? pathValue(args.file_path) : null
  }
  if (name !== 'str_replace_editor') return null
  const path = pathValue(args.path)
  if (!path) return null
  if (args.command === 'create') return typeof args.file_text === 'string' ? path : null
  if (args.command === 'str_replace') {
    return typeof args.old_str === 'string' && args.old_str.length > 0
      && (args.new_str === undefined || typeof args.new_str === 'string') ? path : null
  }
  if (args.command === 'insert') {
    return Number.isInteger(args.insert_line) && Number(args.insert_line) >= 0
      && typeof args.new_str === 'string' ? path : null
  }
  return null
}

function pathValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * Translate one alpha packed row to one wire occurrence.
 *
 * `seq` remains the first native occurrence and `seqEnd` is the inclusive last
 * occurrence represented by the coalesced delta. Older DSH rows still flow as
 * ordinary single-seq events; the optional range is a compatible extension of
 * the mini-program protocol rather than a second Timeline shape.
 */
function coalesceChunkRowEvent(event: Record<string, any>): Record<string, any> | null {
  const type = String(event.type || '')
  const data = isRecord(event.data) ? event.data : null
  if (!data || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.time)) return null
  const members = type === 'chunkrow/tool-call-chunks' ? data.args : data.texts
  if (!Array.isArray(members) || members.length === 0 || !Array.isArray(data.dt)) return null
  const joined = members.map(member => typeof member === 'string' ? member : String(member ?? '')).join('')
  let chunk: Record<string, unknown>
  if (type === 'chunkrow/text-chunks') {
    chunk = { type: 'text-delta', index: data.index, text: joined }
  } else if (type === 'chunkrow/reasoning-chunks') {
    chunk = { type: 'reasoning-delta', index: data.index, text: joined }
  } else if (type === 'chunkrow/tool-call-chunks') {
    chunk = {
      type: 'tool-call-delta', index: data.index, id: data.id,
      ...(typeof data.name === 'string' ? { name: data.name } : {}),
      argumentsDelta: joined,
    }
  } else return null
  return {
    type: 'assistant/chunk',
    seq: event.seq,
    seqEnd: event.seq + members.length - 1,
    time: event.time,
    data: { turn: data.turn, step: data.step, chunk },
  }
}

function eventRangeEnd(event: Record<string, any>): number {
  return Number.isSafeInteger(event.seqEnd) && Number(event.seqEnd) >= Number(event.seq)
    ? Number(event.seqEnd)
    : Number(event.seq)
}

function legacyHistoryTail(entries: unknown): number | undefined {
  if (!Array.isArray(entries)) return undefined
  let tail = -1
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry.event) || !Number.isSafeInteger(entry.event.seq)) continue
    tail = Math.max(tail, eventRangeEnd(entry.event))
  }
  return tail >= 0 ? tail : undefined
}

function waitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      cleanup()
      reject(signal.reason)
    }
    const cleanup = (): void => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => {
      cleanup()
      resolve(value)
    }, error => {
      cleanup()
      reject(error)
    })
  })
}

function liveDeltaDescriptor(event: Record<string, any>): {
  readonly key: string
  readonly field: 'text' | 'argumentsDelta'
  readonly value: string
} | null {
  if (event.type !== 'assistant/chunk' || !Number.isSafeInteger(event.seq)
    || !isRecord(event.data) || !isRecord(event.data.chunk)) return null
  const chunk = event.data.chunk
  const type = String(chunk.type || '')
  const field = type === 'tool-call-delta'
    ? 'argumentsDelta'
    : type === 'text-delta' || type === 'reasoning-delta' ? 'text' : null
  if (!field || typeof chunk[field] !== 'string') return null
  const key = [
    event.data.turn, event.data.step, type, chunk.index, chunk.id, chunk.name,
  ].map(value => String(value ?? '')).join('\u0000')
  return { key, field, value: chunk[field] }
}

function legacyResponseOutcome(event: string, result: unknown): object {
  const response = isRecord(result) ? result : {}
  if (response.ok === false) {
    const error = isRecord(response.error) ? response.error : {}
    return {
      kind: 'rejected',
      error: {
        name: 'Error',
        message: typeof error.message === 'string' ? error.message : 'cancelled by client',
        ...(typeof error.code === 'string' ? { code: error.code } : {}),
      },
    }
  }
  const value = isRecord(response.value) ? response.value : {}
  if (event === 'approval/request') return { kind: 'result', value: value.outcome }
  if (event === 'user-questions/request') return { kind: 'result', value: value.answer }
  return { kind: 'next' }
}

async function invokeModernRpc(
  gateway: ModernGateway,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<LegacyRpcResult> {
  try {
    const stream = gateway.wireStream
    const value = (gateway as any).invoke
    if (typeof value === 'function') {
      const slash = endpoint.indexOf('/')
      const args = isRecord((payload as any)?.args) ? (payload as any).args : {}
      const result = await value.call(gateway, {
        namespace: endpoint.slice(0, slash), method: endpoint.slice(slash + 1), args, signal,
      })
      return { ok: true, value: result }
    }
    void stream
    return unavailable('DSH Remote invocation is unavailable')
  } catch (error) {
    return {
      ok: false,
      error: {
        code: typeof (error as any)?.failure?.code === 'string'
          ? (error as any).failure.code : 'internal',
        message: messageOf(error),
        details: isRecord((error as any)?.failure?.details)
          ? (error as any).failure.details : {},
      },
    }
  }
}

async function openModernStream(
  gateway: ModernGateway,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<AsyncIterable<unknown>> {
  return await gateway.wireStream.open(endpoint, payload, signal)
}

async function firstStreamItem(
  gateway: ModernGateway,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const local = new AbortController()
  const combined = AbortSignal.any([signal, local.signal])
  const stream = await openModernStream(gateway, endpoint, payload, combined)
  try {
    for await (const item of stream) return item
    throw new Error(`DSH Remote stream ${endpoint} ended before its baseline`)
  } finally {
    local.abort(new Error('baseline received'))
  }
}

function isModernConnection(value: unknown): value is ModernConnection {
  return isRecord(value)
    && typeof value.createSharedFetchHandler === 'function'
    && typeof value.requestRejection === 'function'
    && isRecord(value.fetch)
    && typeof value.fetch.register === 'function'
}

function isLegacyConnection(value: unknown): boolean {
  return isRecord(value)
    && typeof value.createSharedFetchHandler === 'function'
    && !('requestRejection' in value)
}

function isModernGateway(value: unknown): value is ModernGateway {
  return isRecord(value)
    && isRecord(value.wireStream)
    && typeof value.wireStream.open === 'function'
    && typeof value.invoke === 'function'
}

function legacyMethodFromPath(path: string): string | null {
  const parsed = new URL(path, 'http://dsh.internal')
  if (!parsed.pathname.startsWith('/api/')) return null
  const method = parsed.pathname.slice('/api/'.length)
  return /^[A-Za-z0-9_$.-]+(?:\/[A-Za-z0-9_$.-]+)?$/.test(method) ? method : null
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unavailable(message: string): LegacyRpcResult {
  return { ok: false, error: { code: 'service-unavailable', message, details: {} } }
}

function badRequest(message: string): LegacyRpcResult {
  return { ok: false, error: { code: 'bad-request', message, details: {} } }
}

function messageOf(error: unknown): string {
  const failure = isRecord((error as any)?.failure) ? (error as any).failure : null
  if (typeof failure?.message === 'string') return failure.message
  return error instanceof Error && error.message ? error.message : String(error || 'DSH operation failed')
}

function nodeFetch(port: number, input: AdapterFetchRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = input.signal ?? new AbortController().signal
    const request = http.request({
      host: '127.0.0.1', port, path: input.path,
      method: input.method,
      headers: {
        accept: 'application/json', 'accept-encoding': 'identity',
        'user-agent': 'HarnessRemote-DshAdapter/1',
        ...(input.headers || {}),
      },
      timeout: LEGACY_TIMEOUT_MS,
    }, response => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength
        if (bytes > MAX_HTTP_BODY_BYTES) {
          response.destroy(new Error('DSH response exceeds adapter limit'))
        } else chunks.push(Buffer.from(chunk))
      })
      response.on('end', () => {
        const headers = new Headers()
        copyResponseHeaders(response.headers, headers)
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode || 502,
          headers,
        }))
      })
      response.on('error', reject)
    })
    const abort = (): void => {
      request.destroy(signal.reason instanceof Error
        ? signal.reason : new Error('DSH adapter request aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
    request.on('timeout', () => request.destroy(new Error('DSH adapter request timed out')))
    request.on('error', reject)
    request.on('close', () => signal.removeEventListener('abort', abort))
    if (input.body && input.body.byteLength > MAX_HTTP_BODY_BYTES) {
      request.destroy(new Error('DSH request exceeds adapter limit'))
      return
    }
    request.end(input.body)
  })
}

function copyResponseHeaders(source: IncomingHttpHeaders, target: Headers): void {
  const blocked = new Set(['connection', 'transfer-encoding', 'set-cookie', 'content-encoding'])
  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key) || value === undefined) continue
    if (Array.isArray(value)) value.forEach(item => target.append(key, item))
    else target.set(key, String(value))
  }
}

async function *websocketEvents(url: string, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  const socket = new WebSocket(url, {
    headers: { 'user-agent': 'HarnessRemote-DshAdapter/1' },
    maxPayload: MAX_EVENT_BYTES,
    perMessageDeflate: false,
  })
  const queue = new AsyncFrameQueue()
  socket.on('message', (data) => {
    const bytes = Buffer.isBuffer(data)
      ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(new Uint8Array(data))
    queue.push(bytes)
  })
  socket.on('close', () => queue.end())
  socket.on('error', () => queue.end())
  const abort = (): void => socket.terminate()
  signal.addEventListener('abort', abort, { once: true })
  try {
    yield* queue.iterate(() => {})
  } finally {
    signal.removeEventListener('abort', abort)
    socket.terminate()
  }
}
