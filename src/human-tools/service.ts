import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { defaultGateStatePath } from '../agent-metadata.js'
import { HumanToolsCore, type HumanStore } from './core.js'
import { HumanFileStore } from './store.js'
import { registerHumanContext, dshHumanToolsAvailable, humanShareTool, humanMembersTool, humanRemindTool } from './dsh.js'
import { object, type HumanAckWireRequest, type HumanActionRequest, type HumanSurface } from './protocol.js'

export interface HumanToolsConfig { readonly enabled?: boolean; readonly store?: HumanStore }
export interface HumanResult { readonly ok: boolean; readonly valueJson?: string; readonly error?: { readonly code: string; readonly message: string } }
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
export class HumanToolsService extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessions', 'systemPrompt']
  private core?: HumanToolsCore
  private ready?: Promise<void>
  private readonly lifetime = new AbortController()
  private unregister?: () => void
  constructor(private readonly host: Context, config: HumanToolsConfig = {}) {
    super(host, 'humanTools')
    host.effect(() => async () => {
      this.lifetime.abort(disabled())
      const drained = this.core?.close()
      try { this.unregister?.() } finally { await drained }
    })
    if (!config.enabled) return
    this.ready = this.initialize(config)
    // Failure disables this optional experiment, never the mature gate/host.
    void this.ready.catch(cause => console.warn('[human-tools] unavailable:', cause instanceof Error ? cause.message : String(cause)))
  }
  private async initialize(config: HumanToolsConfig): Promise<void> {
    if (!dshHumanToolsAvailable(this.host)) throw new Error('此DSH不支持原生工具/会话上下文')
    // Resolve the actual host profile, including linked/native installations.
    // Web and Desktop must never share one action ledger on the same computer.
    const store = config.store || new HumanFileStore(path.join(path.dirname(defaultGateStatePath(this.host)), 'human-tools-v1.json'))
    const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
    if (this.lifetime.signal.aborted) { core.close(); return }
    this.core = core
    const unregisterTools: (() => void)[] = []
    try {
      for (const tool of [humanShareTool(core), humanMembersTool(core), humanRemindTool(core)])
        unregisterTools.push((this.host.get('tools') as ToolRuntime).register(tool))
      const unregisterContext = registerHumanContext(this.host, core)
      this.unregister = () => { unregisterContext(); unregisterTools.reverse().forEach(remove => remove()) }
    } catch (cause) { unregisterTools.reverse().forEach(remove => remove()); core.close(); this.core = undefined; throw cause }
  }
  private async use(signal: AbortSignal): Promise<HumanToolsCore> {
    signal.throwIfAborted()
    if (!this.ready || this.lifetime.signal.aborted) throw disabled()
    await waitForReady(this.ready, AbortSignal.any([signal, this.lifetime.signal]))
    signal.throwIfAborted()
    if (this.lifetime.signal.aborted || !this.core) throw disabled()
    return this.core
  }
  private async result(operation: () => Promise<unknown>): Promise<HumanResult> {
    try { return { ok: true, valueJson: JSON.stringify(await operation()) } }
    catch (cause) { return { ok: false, error: { code: typeof (cause as { code?: unknown })?.code === 'string'
      ? (cause as { code: string }).code : 'human-tools-unavailable', message: cause instanceof Error ? cause.message : '测试卡片不可用' } } }
  }
  /** Synchronous bounded lookup used identically by history and live projection. */
  present(scope: string, callId: string): HumanSurface | undefined {
    const session = (this.host.get('sessions') as SessionStore | undefined)?.get(scope as SessionId)
    return this.core?.forResult(scope, callId, session ? String(session.header.createdAt) : undefined)
  }
  /** Host-only cold-history barrier. Shares the one ledger load; cancelling a
   * reader never cancels initialization or another reader. Optional failure
   * must not hide the ordinary history, and adds no retry or polling. */
  async prepareProjection(signal: AbortSignal): Promise<boolean> {
    try { await this.use(signal); return true }
    catch { signal.throwIfAborted(); return false }
  }
  @Remote('capabilities')
  async capabilities(request: { scope: string }, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => { await this.use(signal); return { schema: 'human.tools.v1', enabled: true, shareTest: true, members: true, remind: true } })
  }
  @Remote('claim')
  async claim(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => {
      const claimSignal = AbortSignal.any([signal, this.lifetime.signal])
      const core = await this.use(claimSignal)
      // Check our own bounded scope first, before querying any host directory.
      core.status(request.scope, request.surfaceId)
      const generation = await this.claimGeneration(request.scope, claimSignal)
      claimSignal.throwIfAborted()
      core.assertGeneration(request.scope, request.surfaceId, generation)
      return core.claim(request, claimSignal)
    })
  }
  /** A missing live Session is not evidence that its durable generation still
   * exists. Query headers only; never acquire a Session/Agent writer to claim. */
  private async claimGeneration(scope: string, signal: AbortSignal): Promise<string> {
    try {
      signal.throwIfAborted()
      const sessions = this.host.get('sessions') as SessionStore | undefined
      const session = sessions?.get(scope as SessionId)
      if (session) return headerGeneration(session.header, scope)
      // These optional public APIs return SessionRecord[] with a cloned header.
      // Older hosts keep working for live sessions without a new SDK import.
      const query = this.host.get('sessionQuery') as {
        filterSessions?: (filters: readonly { kind: 'id'; values: readonly string[] }[], signal: AbortSignal) => Promise<unknown>
        listSessions?: (signal: AbortSignal) => Promise<unknown>
      } | undefined
      let pending: Promise<unknown>
      if (typeof query?.filterSessions === 'function') pending = query.filterSessions([{ kind: 'id', values: [scope] }], signal)
      else if (typeof query?.listSessions === 'function') pending = query.listSessions(signal)
      else throw originUnavailable()
      const rows = await waitForReady(Promise.resolve(pending), signal)
      signal.throwIfAborted()
      if (!Array.isArray(rows) || rows.some(row => !object(row) || !object(row.header) || typeof row.header.id !== 'string')) throw originUnavailable()
      const matches = rows.filter(row => row.header.id === scope)
      if (matches.length !== 1) throw originUnavailable()
      const generation = headerGeneration(matches[0].header, scope)
      // A native activation during the read must agree with the observed header.
      const current = sessions?.get(scope as SessionId)
      if (current && headerGeneration(current.header, scope) !== generation) throw originUnavailable()
      return generation
    } catch {
      signal.throwIfAborted()
      throw originUnavailable()
    }
  }
  @Remote('ack')
  async ack(request: HumanAckWireRequest, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.use(signal)).ack(request, signal))
  }
  @Remote('status')
  async status(request: { scope: string; surfaceId: string }, signal: AbortSignal): Promise<HumanResult> {
    return this.result(async () => (await this.use(signal)).status(request.scope, request.surfaceId))
  }
}

function disabled(): Error & { code: string } {
  return Object.assign(new Error('此节点尚未启用测试卡片功能'), { code: 'human-tools-disabled' })
}

function originUnavailable(): Error & { code: string } {
  return Object.assign(new Error('无法确认原会话身份，请在电脑端确认会话仍然存在后重试'), { code: 'human-origin-unavailable' })
}

function headerGeneration(header: unknown, scope: string): string {
  if (!object(header) || header.id !== scope || !Number.isSafeInteger(header.createdAt) || Number(header.createdAt) < 0) throw originUnavailable()
  return String(header.createdAt)
}

function waitForReady<T>(ready: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    ready.then(value => { cleanup(); resolve(value) }, cause => { cleanup(); reject(cause) })
    if (signal.aborted) abort()
  })
}
