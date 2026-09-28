import type { Context } from '@deepseek-ai/cordis'
import type { WebSocket } from 'ws'

import { resolveTypertGateway, type LegacyClientRequest, type TypertGatewayLike } from './dsh-protocol-compat.js'
import { resolveDshSessionAddress, isSessionReadError } from './dsh-session-address.js'
import { presentationProjection, legacyPermissionValue } from './session-presentation.js'
import { AssistantStreamCompatibility, assistantRecordPresentation } from './assistant-stream-compat.js'
import { resourcePresentation } from './agent-resources.js'
import { TurnActivityCompatibility } from './turn-activity.js'
import type { WechatHistoryService } from './history-service.js'

type JsonRecord = Record<string, unknown>

/** A downlink may be a LAN WebSocket or an authenticated E2EE virtual stream. */
export interface LegacyRealtimePeer {
  readonly readyState: number
  readonly bufferedAmount: number
  send(message: string): void
  close(code: number, reason: string): void
}

interface ConnectionFetchHandler {
  fetch(request: Request): Promise<Response>
}

interface ConnectionLike {
  createSharedFetchHandler?(channel: '/api'): ConnectionFetchHandler
}

interface PendingInteraction {
  readonly clientId: string
  readonly eventId: string
  readonly event: 'approval/request' | 'user-questions/request'
  readonly sessionId: string
  readonly approvalId?: string
  readonly payload: JsonRecord
}

interface SocketState {
  readonly socket: LegacyRealtimePeer
  readonly kind: 'mux' | 'host'
  readonly lifetime: AbortController
  readonly sessionLifetimes: Map<string, AbortController>
  readonly permissionProjections: Map<string, JsonRecord>
  clientId?: string
}

const MAX_BUFFERED_BYTES = 4 * 1024 * 1024
const MAX_SESSION_SUBSCRIPTIONS = 64

// These calls inspect a session; they are not an instruction to activate it.
// Unknown calls fail open: while in flight, preserve their native errors too.
const READ_ONLY_SESSION_REQUESTS = new Set([
  'session.history', 'session.models', 'session.list', 'session.search',
  'session/page', 'session/projections', 'session/modelCatalog', 'session/list', 'session/search',
  'commands/list', 'subagent.list', 'subagents/list',
  'wechatHistory/page', 'wechatHistory/window', 'messageFeedback/list',
])

export interface ReadonlySessionConflict {
  readonly sessionId: string
  readonly observedAt: number
  readonly reason: 'writer-held'
}

function recordOf(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Convert one new Host event into the released mini-program vocabulary. */
export function legacyHostPayload(frame: JsonRecord): JsonRecord | null {
  if (frame.type !== 'emit') return null
  const args = Array.isArray(frame.args) ? frame.args : []
  switch (frame.event) {
    case 'api-session/added':
      return { type: 'host/session-added', session: args[0] }
    case 'api-session/activity':
      // The released phone treats session-added as a directory invalidation
      // and rereads the native list. Do not fabricate a Session summary: this
      // signal only announces that its activity/order may have changed.
      return { type: 'host/session-added', sessionId: args[0] }
    case 'api-session/removed':
      return { type: 'host/session-removed', sessionId: args[0] }
    case 'api-session/status':
      return { type: 'host/session-status', sessionId: args[0], running: args[1] === true }
    case 'api-session/error':
      return { type: 'host/agent-error', sessionId: args[0], message: args[1] }
    case 'commands/change':
    case 'agent-preset/selected':
    case 'llm/adapters-updated':
    case 'settings/document-updated':
      return { type: 'host/remote-event', event: frame.event, args }
    default:
      return null
  }
}

/**
 * One process-local adapter for the two pre-0.1.2 downlinks. It consumes the
 * new reconnect-safe streams but emits only the long-lived client contract.
 */
export class DshRealtimeCompatibility {
  private readonly sockets = new Set<SocketState>()
  private readonly knownSessions = new Map<string, number>()
  private readonly pending = new Map<string, PendingInteraction[]>()
  private readonly responding = new Set<PendingInteraction>()
  private readonly sessionRequests = new Map<string, number>()
  private readonly readonlyConflicts: ReadonlySessionConflict[] = []
  private remoteOwner?: SocketState
  private disposed = false

  constructor(private readonly ctx: Context) {}

  /** Scoped to authenticated phone RPCs; never changes native Agent ownership. */
  trackSessionRequest(request: LegacyClientRequest): () => void {
    if (READ_ONLY_SESSION_REQUESTS.has(request.method)) return () => {}
    const args = recordOf(request.payload.args)
    const nested = recordOf(args?.request)
    const ids = [...new Set([request.payload, args, nested].flatMap(value =>
      value ? ['sessionId', 'agentId', 'parentSessionId', 'childSessionId'].map(key => stringOf(value[key])) : []
    ).filter(id => id && id.length <= 256))]
    for (const id of ids) this.sessionRequests.set(id, (this.sessionRequests.get(id) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      for (const id of ids) {
        const next = (this.sessionRequests.get(id) ?? 1) - 1
        if (next > 0) this.sessionRequests.set(id, next)
        else this.sessionRequests.delete(id)
      }
    }
  }

  /** Bounded metadata only: no message bodies, credentials or filesystem paths. */
  getReadonlyConflicts(): readonly ReadonlySessionConflict[] {
    return this.readonlyConflicts.map(value => ({ ...value }))
  }

  /**
   * TEMPORARY COMPATIBILITY / 临时误报规避，不是 DSH 会话冲突的根因修复。
   * 已在 DSH 0.1.7-rc.2 对应原生代码中独立复现：电脑端浏览历史的
   * history.follow 在返回 snapshot 后仍会 promote/resolveObservedAgent，
   * 另一进程持有写入权时产生 api-session/error；已发布小程序又把该广播
   * 显示为全局聊天错误，即使手机并未发起修改操作。
   *
   * 本函数只调整我们插件到小程序的通知语义。原生的后台激活、写入占用和
   * 电脑端错误仍可能发生；绝不能据此宣称两端会话冲突已解决。不得修改、
   * 覆盖或 monkey-patch DSH 本体，不得强行释放/夺取原生写入权。
   *
   * 原生广播没有发起客户端标识，下面是保守的状态判定，不是精确溯源：
   * 仅完整文案匹配 + 当前端无 Agent/附着 Session + 无匹配的在途手机操作
   * 时降为被动占用诊断。能力不明、查询失败、活动会话及其他错误原样保留；
   * 真正发送/修改操作的 RPC 失败绝不在此吞掉。诊断保留在有界内存记录中。
   *
   * TODO(upstream-readonly-follow): 待官方明确区分只读浏览与激活，并在相应
   * 版本实测后复核此兼容分支；不能仅凭版本号或本次不弹错就删除写入保护。
   * 回归：test-native-two-process-browse.mjs（原生复现，仅默认未修改模式）、
   * test-passive-writer-notification.mjs（插件通知和真实失败保留）。
   */
  private readonlyConflict(frame: JsonRecord): ReadonlySessionConflict | undefined {
    if (frame.type !== 'emit' || frame.event !== 'api-session/error' || !Array.isArray(frame.args)) return
    const [sessionId, message] = frame.args
    // The native event drops the domain code. Match its complete, known message,
    // including the event's identity; never suppress arbitrary task error text.
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256
      || message !== `session "${sessionId}" is already owned by an active write handle`
      || this.sessionRequests.has(sessionId)) return
    try {
      const agents = this.ctx.get('agents') as { get?: (id: string) => unknown } | undefined
      const sessions = this.ctx.get('sessions') as { get?: (id: string) => unknown } | undefined
      // Unknown/missing services, attached sessions and live Agents retain the
      // original error. Only a definitely cold, non-requested activation is a
      // passive availability notification instead of a failed phone operation.
      if (typeof agents?.get !== 'function' || typeof sessions?.get !== 'function'
        || agents.get(sessionId) !== undefined || sessions.get(sessionId) !== undefined) return
    } catch { return }
    const conflict: ReadonlySessionConflict = { sessionId, reason: 'writer-held', observedAt: Date.now() }
    this.readonlyConflicts.push(conflict)
    if (this.readonlyConflicts.length > 32) this.readonlyConflicts.shift()
    return conflict
  }

  attach(path: '/api/events.mux' | '/api/events.host', socket: WebSocket): void {
    const detach = this.connect(path, socket)
    socket.once('close', detach)
    socket.once('error', detach)
    socket.on('message', () => socket.close(1003, 'downlink only'))
  }

  connect(path: '/api/events.mux' | '/api/events.host', socket: LegacyRealtimePeer): () => void {
    if (this.disposed) {
      socket.close(1012, 'adapter stopping')
      return () => {}
    }
    const state: SocketState = {
      socket,
      kind: path.endsWith('.mux') ? 'mux' : 'host',
      lifetime: new AbortController(),
      sessionLifetimes: new Map(),
      permissionProjections: new Map(),
    }
    this.sockets.add(state)
    if (state.kind === 'host') this.run(state, () => this.followWorkspace(state))
    else {
      this.run(state, () => this.followControl(state))
      for (const sessionId of this.knownSessions.keys()) this.startSession(state, sessionId)
      for (const [eventId, values] of this.pending) {
        const pending = values[0]
        if (pending) this.send(state, pending.payload, eventId)
      }
    }
    this.ensureRemoteEvents()
    return () => this.remove(state)
  }

  subscribeSession(sessionId: unknown): void {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) return
    this.knownSessions.delete(sessionId)
    this.knownSessions.set(sessionId, Date.now())
    while (this.knownSessions.size > MAX_SESSION_SUBSCRIPTIONS) {
      const oldest = this.knownSessions.keys().next().value as string | undefined
      if (!oldest) break
      this.knownSessions.delete(oldest)
      for (const state of this.sockets) {
        state.sessionLifetimes.get(oldest)?.abort(new Error('subscription evicted'))
        state.sessionLifetimes.delete(oldest)
      }
    }
    for (const state of this.sockets) {
      if (state.kind === 'mux') this.startSession(state, sessionId)
    }
  }

  async respond(value: unknown): Promise<{ readonly accepted: boolean; readonly reason?: string }> {
    const body = recordOf(value)
    const rpcId = stringOf(body?.rpcId)
    if (body?.type !== 'client-response' || !rpcId) {
      return { accepted: false, reason: 'invalid client response' }
    }
    const candidates = this.pending.get(rpcId)
    const target = candidates?.find(candidate =>
      [...this.sockets].some(state => state.clientId === candidate.clientId))
    if (!target) return { accepted: false, reason: 'request is no longer pending' }
    if (this.responding.has(target)) return { accepted: false, reason: 'response is already being delivered' }
    const result = recordOf(body.result)
    let outcome: JsonRecord
    if (result?.ok === true) {
      const legacyValue = recordOf(result.value)
      const valueForHost = target.event === 'approval/request'
        ? legacyValue?.outcome
        : legacyValue?.answer
      outcome = valueForHost === undefined
        ? { kind: 'result' }
        : { kind: 'result', value: valueForHost }
    } else {
      const failure = recordOf(result?.error)
      outcome = {
        kind: 'rejected',
        error: {
          name: 'Error',
          message: stringOf(failure?.message) || 'client cancelled',
          ...(stringOf(failure?.code) ? { code: failure?.code } : {}),
          ...failure && Object.hasOwn(failure, 'details') ? { details: failure.details } : {},
        },
      }
    }
    this.responding.add(target)
    try {
      const reply = await this.dispatchRemoteEventResult({
        clientId: target.clientId,
        eventId: target.eventId,
        outcome,
      })
      if (!reply.ok) return { accepted: false, reason: reply.message }
      // Gateway removes the responding delivery BEFORE broadcasting cancel to
      // the other clients. It will never echo cancel to this upstream owner.
      // A successful result receipt therefore completes our delivery too; it
      // says nothing about subsequent tool execution or the approval verdict.
      // Identity guarding keeps an old in-flight receipt from settling a new
      // delivery established after the owner disconnected.
      if (this.pending.get(rpcId)?.includes(target)) this.settlePending(rpcId)
      return { accepted: true }
    } catch (error: unknown) {
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    } finally {
      this.responding.delete(target)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const state of [...this.sockets]) {
      this.remove(state)
      try { state.socket.close(1001, 'adapter disposed') } catch { /* best effort */ }
    }
    this.pending.clear()
    this.sessionRequests.clear()
    this.readonlyConflicts.length = 0
  }

  private gateway(): TypertGatewayLike {
    const gateway = resolveTypertGateway(this.ctx)
    if (!gateway) throw new Error('DSH Typert Gateway is unavailable')
    return gateway
  }

  private run(state: SocketState, task: () => Promise<void>, signal = state.lifetime.signal, allowCompletion = false): void {
    void task().then(() => {
      if (!allowCompletion && !signal.aborted && !this.disposed) throw new Error('DSH event source ended unexpectedly')
    }).catch((error: unknown) => {
      if (signal.aborted || state.lifetime.signal.aborted || this.disposed) return
      console.warn('[wechat-gate] legacy realtime adapter failed:',
        error instanceof Error ? error.message : String(error))
      this.remove(state)
      try { state.socket.close(1011, 'DSH realtime unavailable') } catch { /* best effort */ }
    })
  }

  private ensureRemoteEvents(): void {
    if (this.remoteOwner || this.disposed) return
    const state = this.sockets.values().next().value as SocketState | undefined
    if (!state) return
    this.remoteOwner = state
    this.run(state, () => this.followRemoteEvents(state))
  }

  private remove(state: SocketState): void {
    if (!this.sockets.delete(state)) return
    state.lifetime.abort(new Error('socket closed'))
    for (const controller of state.sessionLifetimes.values()) {
      controller.abort(new Error('socket closed'))
    }
    state.sessionLifetimes.clear()
    state.permissionProjections.clear()
    if (state.clientId) {
      for (const [eventId, values] of this.pending) {
        const next = values.filter(value => value.clientId !== state.clientId)
        if (next.length) this.pending.set(eventId, next)
        else this.pending.delete(eventId)
      }
    }
    if (this.remoteOwner === state) {
      this.remoteOwner = undefined
      this.ensureRemoteEvents()
    }
  }

  private send(state: SocketState, payload: JsonRecord, rpcId?: string): void {
    if (state.socket.readyState !== 1) return
    if (state.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.remove(state)
      state.socket.close(1009, 'realtime consumer is too slow')
      return
    }
    if (payload.type === 'session/projection' && payload.key === 'permissions' && typeof payload.sessionId === 'string') {
      const previous = state.permissionProjections.get(payload.sessionId)
      if (!previous || Number(payload.seq) >= Number(previous.seq)) {
        state.permissionProjections.delete(payload.sessionId)
        state.permissionProjections.set(payload.sessionId, payload)
        if (state.permissionProjections.size > MAX_SESSION_SUBSCRIPTIONS) {
          state.permissionProjections.delete(state.permissionProjections.keys().next().value!)
        }
      }
      payload = { ...payload, value: legacyPermissionValue(payload.value, this.gateway().permissionCatalog?.()) }
    }
    state.socket.send(JSON.stringify({
      type: 'server-event',
      ...(rpcId ? { rpcId } : {}),
      payload,
    }))
    if (payload.type === 'session/projection' && typeof payload.key === 'string') {
      const facet = presentationProjection(payload.key, payload.value)
      if (facet) this.send(state, { ...payload, ...facet })
    }
  }

  private async followWorkspace(state: SocketState): Promise<void> {
    const iterable = await this.gateway().stream({
      namespace: 'workspace', method: 'follow', args: {}, signal: state.lifetime.signal,
    })
    for await (const raw of iterable) {
      const frame = recordOf(raw)
      if (!frame || frame.type === 'baseline') continue
      if (frame.type === 'upsert') this.send(state, { type: 'host/workspace-changed', workspace: frame.workspace })
      else if (frame.type === 'remove') this.send(state, { type: 'host/workspace-removed', workspaceId: frame.workspaceId })
      else if (frame.type === 'order') this.send(state, { type: 'host/workspace-order-changed', workspaceIds: frame.workspaceIds })
      else if (frame.type === 'archived') this.send(state, { type: 'host/archived-sessions-changed', archivedSessionIds: frame.archivedSessionIds })
    }
  }

  private async followControl(state: SocketState): Promise<void> {
    const iterable = await this.gateway().stream({
      namespace: 'session', method: 'control', args: {}, signal: state.lifetime.signal,
    })
    for await (const raw of iterable) this.controlFrame(state, recordOf(raw))
  }

  private controlFrame(state: SocketState, frame: JsonRecord | null): void {
    if (!frame) return
    if (frame.type === 'baseline') {
      state.permissionProjections.clear()
      const value = recordOf(frame.value)
      const queues = recordOf(value?.queues) ?? {}
      for (const [sessionId, items] of Object.entries(queues)) {
        this.send(state, { type: 'session/queue', sessionId, items })
      }
      const projections = recordOf(value?.projections) ?? {}
      for (const [sessionId, rawBlock] of Object.entries(projections)) {
        const block = recordOf(rawBlock)
        const values = recordOf(block?.values) ?? {}
        for (const [key, value] of Object.entries(values)) {
          this.send(state, {
            type: 'session/projection', sessionId, key, value,
            seq: Number.isSafeInteger(block?.asOfSeq) ? block?.asOfSeq : 0,
          })
        }
      }
      // A reconnect may have missed blank/title changes while the host-event
      // channel stayed connected. Reconcile once after the complete baseline.
      if (Object.keys(projections).length) this.send(state, { type: 'host/session-added' })
      return
    }
    if (frame.type === 'queue') {
      this.send(state, {
        type: 'session/queue', sessionId: frame.sessionId, items: frame.items,
      })
    } else if (frame.type === 'projection') {
      this.send(state, {
        type: 'session/projection', sessionId: frame.sessionId,
        key: frame.key, value: frame.value, seq: frame.seq,
      })
      // Older phones apply projections to the transcript, not directory rows.
      // A freshly created row otherwise remains blank=true (hidden), and its
      // generated title stays at the cwd fallback until a node switch. Keep
      // the native list authoritative; never refresh per token/stream chunk.
      if (frame.key === 'title' || frame.key === 'sessionListMetadata') {
        this.send(state, { type: 'host/session-added', sessionId: frame.sessionId })
      }
    }
  }

  private startSession(state: SocketState, sessionId: string): void {
    if (state.sessionLifetimes.has(sessionId)) return
    if (this.gateway().canFollowSession?.(sessionId) === false) return
    const controller = new AbortController()
    const combined = AbortSignal.any([state.lifetime.signal, controller.signal])
    state.sessionLifetimes.set(sessionId, controller)
    const follow = async () => {
      try {
        const gateway = this.gateway()
        const address = await resolveDshSessionAddress(gateway, sessionId, combined)
        if (gateway.canFollowSession?.(sessionId) === false) return
        const iterable = await gateway.stream({
          namespace: 'session',
          method: 'follow',
          args: { request: { address, maxMessages: 1, assistantStream: true } },
          signal: combined,
        })
        const assistant = new AssistantStreamCompatibility(event =>
          this.send(state, { type: 'session/event', sessionId, event }))
        const activity = new TurnActivityCompatibility()
        // Only small, recent call metadata assists native read/diff renderers.
        // Missing/large input safely uses generic output; it never causes an
        // extra history scan during streaming. Disposal releases this map.
        const calls = new Map<unknown, JsonRecord>()
        const rememberCall = (event: JsonRecord) => {
          const data = recordOf(event.data)
          if (event.type !== 'tool/call' || !data) return
          calls.delete(data.callId)
          if (Buffer.byteLength(JSON.stringify(event)) <= 16 * 1024) {
            calls.set(data.callId, { event })
            if (calls.size > 32) calls.delete(calls.keys().next().value)
          }
        }
        for await (const raw of iterable) {
          const frame = recordOf(raw)
          if (frame?.type === 'snapshot') {
            for(const entry of Array.isArray(frame.records)?frame.records:[]) {
              const record=recordOf(entry)
              const event = recordOf(record?.event) || record || {}
              activity.accept(event)
              rememberCall(event)
            }
            this.send(state, {
              type: 'session/subscribed', sessionId,
              lastSeq: Number.isSafeInteger(frame.cursor) ? frame.cursor : -1,
            })
            assistant.baseline(recordOf(frame.assistantStream) || undefined)
          } else if (frame?.type === 'assistant-stream') {
            assistant.follow(recordOf(frame.frame) || {})
          } else if (frame?.type === 'event' && recordOf(frame.event)) {
            const resources = resourcePresentation(frame.event as JsonRecord)
            const turnActivity = activity.accept(frame.event as JsonRecord)
            const event = frame.event as JsonRecord
            rememberCall(event)
            let entry: JsonRecord = assistantRecordPresentation({ event,
              ...((resources || turnActivity) ? {view:{...(resources?{agentResources:resources}:{}),...(turnActivity?{agentActivity:turnActivity}:{})}} : {}) })
            // One presentation contract for current clients. New minis also
            // accept full records from released plugins; no second live format
            // is maintained in this plugin just for obsolete mini versions.
            const history = this.ctx.get('wechatHistory') as WechatHistoryService | undefined
            if (history && (event.type === 'tool/call' || event.type === 'tool/result'
              || event.type === 'tool/ptc-dispatch-start' || event.type === 'tool/ptc-dispatch')) {
              const data = recordOf(event.data), message = recordOf(data?.message)
              const callId = recordOf(message?.source)?.callId
              entry = history.presentRecord(sessionId, { event }, entry, calls.get(callId))
              if (event.type === 'tool/result') calls.delete(callId)
            }
            this.send(state, { type: 'session/event', sessionId, ...entry })
          }
        }
        if (!combined.aborted) throw new Error('DSH Session stream ended unexpectedly')
      } catch (error) {
        if (combined.aborted) return
        if (!isSessionReadError(error) && (error as { code?: string })?.code !== 'history-detail-unavailable') throw error
        // A subsequent explicit read may retry it, but reconnecting another
        // client must not resurrect an already failed/deleted subscription.
        this.knownSessions.delete(sessionId)
        this.send(state, {
          type: 'host/agent-error', sessionId,
          message: error instanceof Error ? error.message : 'DSH 会话暂不可读取',
        })
      } finally {
        if (state.sessionLifetimes.get(sessionId) === controller) {
          state.sessionLifetimes.delete(sessionId)
        }
      }
    }
    // Session-local failures are contained above; transport/source failures
    // still close the socket so the client's normal reconnect can recover it.
    this.run(state, follow, combined, true)
  }

  private async followRemoteEvents(state: SocketState): Promise<void> {
    const wire = this.gateway().wireStream
    if (!wire) throw new Error('DSH Remote Event stream is unavailable')
    const iterable = await wire.open('$events', { args: {} }, state.lifetime.signal)
    for await (const raw of iterable) {
      if (state.lifetime.signal.aborted) return
      const frame = recordOf(raw)
      if (!frame) continue
      if (frame.type === 'emit' && frame.event === 'permission-presets/catalog-changed') {
        // The shipped phone has no catalog listener. Re-present its known
        // selections at their original sequence, with the new live choices.
        // It accepts equal-seq presentation refreshes; never invent a native
        // permission change or acquire a session merely to refresh the menu.
        for (const target of this.sockets) {
          for (const payload of [...target.permissionProjections.values()]) this.send(target, payload)
        }
        continue
      }
      if (frame.type === 'ready') {
        state.clientId = stringOf(frame.clientId)
        continue
      }
      if (frame.type === 'emit' && frame.event === 'api-session/removed' && Array.isArray(frame.args)) {
        for (const target of this.sockets) target.permissionProjections.delete(stringOf(frame.args[0]))
      }
      const conflict = this.readonlyConflict(frame)
      // Temporary phone-notification mitigation only; see readonlyConflict.
      // The original frame and native Desktop activation/lock stay untouched.
      // Keep diagnostic evidence as an additive event ignored by the released
      // phone instead of its global chat error. Direct RPC failures stay intact.
      const host = conflict ? { type: 'host/remote-event', event: 'wechat-remote/session-readonly', args: [conflict] }
        : legacyHostPayload(frame)
      if (host) {
        // Phone-adapter history reads never activate an Agent. Once the host has
        // activated it (e.g. accepted a prompt), attach the interested peers.
        if (frame.event === 'api-session/status' || frame.event === 'api-session/added') {
          for (const target of this.sockets) if (target.kind === 'mux') {
            for (const id of this.knownSessions.keys()) this.startSession(target, id)
          }
        }
        for (const target of this.sockets) {
          if (target.kind === 'host') this.send(target, host)
        }
        continue
      }
      if (frame.type === 'waterfall') this.pendingWaterfall(state, frame)
      else if (frame.type === 'cancel') this.settlePending(stringOf(frame.eventId))
    }
  }

  private pendingWaterfall(state: SocketState, frame: JsonRecord): void {
    const event = frame.event
    if (event !== 'approval/request' && event !== 'user-questions/request') return
    const eventId = stringOf(frame.eventId)
    const clientId = state.clientId || ''
    const sessionId = stringOf(frame.agentId)
    const request = recordOf(frame.request) ?? {}
    if (!eventId || !clientId || !sessionId) return
    const approvalId = event === 'approval/request'
      ? stringOf(request.callId) || eventId
      : undefined
    const payload: JsonRecord = event === 'approval/request'
      ? {
        type: 'approval/requested', sessionId, approvalId,
        toolName: request.toolName, reason: request.reason,
      }
      : { type: 'question/requested', sessionId, questions: request.questions }
    const pending: PendingInteraction = {
      clientId, eventId, event, sessionId,
      payload,
      ...(approvalId ? { approvalId } : {}),
    }
    const values = this.pending.get(eventId) ?? []
    if (values.some(value => value.clientId === clientId)) return
    values.push(pending)
    this.pending.set(eventId, values)
    for (const target of this.sockets) {
      if (target.kind === 'mux') this.send(target, payload, eventId)
    }
  }

  private settlePending(eventId: string): void {
    const values = this.pending.get(eventId)
    if (!values) return
    this.pending.delete(eventId)
    const seen = new Set<string>()
    for (const pending of values) {
      const key = `${pending.event}\0${pending.sessionId}`
      if (seen.has(key)) continue
      seen.add(key)
      for (const state of this.sockets) {
        if (state.kind !== 'mux') continue
        this.send(state, pending.event === 'approval/request'
          ? { type: 'approval/resolved', sessionId: pending.sessionId, approvalId: pending.approvalId, approvalRpcId: eventId }
          : { type: 'question/resolved', sessionId: pending.sessionId, questionRpcId: eventId }, eventId)
      }
    }
  }

  private async dispatchRemoteEventResult(args: JsonRecord): Promise<{
    readonly ok: boolean
    readonly message?: string
  }> {
    const connection = this.ctx.get('connection') as ConnectionLike | undefined
    const handler = connection?.createSharedFetchHandler?.('/api')
    if (!handler) throw new Error('DSH Connection RPC bridge is unavailable')
    const rpcId = `wechat-response-${Date.now().toString(36)}`
    const response = await handler.fetch(new Request('http://dsh.local/api/$events/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId, method: '$events/result', payload: { args },
      }),
    }))
    if (response.status !== 200) return { ok: false, message: `DSH response HTTP ${response.status}` }
    const body = recordOf(await response.json())
    const result = recordOf(body?.result)
    if (result?.ok === true) return { ok: true }
    const error = recordOf(result?.error)
    return { ok: false, message: stringOf(error?.message) || 'DSH rejected the response' }
  }
}
