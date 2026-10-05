/** Owner input provenance, NOT a language/approval classifier. Only the actual
 * authenticated prompt invocation may associate a short cloud credential with
 * the native inbox message it inserts. No history/text matching or replay. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { hostRuntimeVersion } from '../dsh-host-context.js'
import { exact, fail, plain, row } from './data.js'
import type { PrivatePublishInput, NodeBinding } from './lifecycle.js'
import type { HumanTaskRef, HumanWorkflowDraftRef } from '../human-tools/protocol.js'

type Native = Record<string, any>
interface Host { get(name: string): any; on(name: string, listener: (...args: any[]) => any, options?: unknown): () => void }
interface OwnerInput {
  schema: 'human.owner.input.v1'; inputProof: string; inputId: string; contentDigest: string
  scope: string; sessionGeneration: string; binding: NodeBinding; expiresAt: number
}
interface Admission { proof: OwnerInput; rpcId: string; open: boolean; inserted: boolean; lease?: Lease }
interface Lease {
  proof: OwnerInput; agent: Native; session: Native; messageId: string; epoch: number
  header: string; turn?: number; entered?: boolean; signal?: AbortSignal; userSeq?: number
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Only top-level user text is an instruction source. Attachments neither
 * participate in this digest nor grant instruction authority. */
export function privateInputTextDigest(content: unknown): string | undefined {
  if (!Array.isArray(content)) return
  const text: string[] = []
  for (const part of content) if (row(part) && part.type === 'text') {
    if (typeof part.text !== 'string') return
    text.push(part.text)
  }
  if (!text.some(value => value.trim()) || Buffer.byteLength(JSON.stringify(text)) > 256 * 1024) return
  return hash(text)
}
const unavailable = () => fail('private-input-unavailable', '本次对话没有可核对的私人更新权限，请开启本会话的私人更新后重新发送要求；也可以继续起草并使用确认按钮。')
function proofOf(value: unknown, nodeId: string, scope: string, digest: string | undefined, now: number): OwnerInput | undefined {
  if (!row(value) || !exact(value, ['schema', 'inputProof', 'inputId', 'contentDigest', 'scope', 'sessionGeneration', 'binding', 'expiresAt'])
    || value.schema !== 'human.owner.input.v1' || !plain(value.inputProof, 4096) || !plain(value.inputId, 128)
    || !digest || value.contentDigest !== digest || value.scope !== scope || !plain(value.sessionGeneration, 80)
    || !Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) <= now || Number(value.expiresAt) > now + 605_000) return
  const binding = value.binding
  if (!row(binding) || !exact(binding, ['schema', 'nodeId', 'ownerSubject', 'accountInstance', 'generation'])
    || binding.schema !== 'human.node.binding.v1' || binding.nodeId !== nodeId
    || !['ownerSubject', 'accountInstance', 'generation'].every(key => plain(binding[key], 256))) return
  return structuredClone(value) as unknown as OwnerInput
}
function headerOf(session: Native): string {
  const h = session?.header
  if (!h || h.id !== session.id || !Number.isSafeInteger(h.createdAt) || h.createdAt < 0
    || h.origin === 'subagent' || h.parentSessionId) throw unavailable()
  return hash([h.id, h.createdAt, h.cwd ?? null, h.origin ?? null, h.parentSessionId ?? null])
}
function logOf(session: Native): Native[] {
  const events = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events
  if (!Array.isArray(events)) throw unavailable()
  return events
}

export class PrivateInputNative {
  private readonly admissions = new AsyncLocalStorage<Admission>()
  private readonly dispatches = new AsyncLocalStorage<{ token: unknown; lease: Lease }>()
  private readonly leases = new Map<string, Lease>()
  private readonly epochs = new WeakMap<object, number>()
  private readonly offs: (() => void)[] = []
  private stopped = false
  constructor(private readonly host: Host, readonly nodeId: string, private readonly assertIdentity: () => void,
    private readonly now: () => number = Date.now) {
    this.offs.push(host.on('agent/inbox/inserted', ({ agent, message }: Native) => {
      this.invalidate(agent?.session)
      const entry = this.admissions.getStore()
      if (!entry?.open || entry.inserted || message?.source?.kind !== 'user') return
      // Exactly one insertion can belong to an invocation. Even a duplicate or
      // unrelated second insertion cannot inherit its credential.
      entry.inserted = true
      try {
        this.assertAgent(agent)
        const proof = entry.proof, session = agent.session
        if (message.source.rpcId !== entry.rpcId || String(session.id) !== proof.scope || String(session.header.createdAt) !== proof.sessionGeneration
          || privateInputTextDigest(message.content) !== proof.contentDigest || !plain(message.id, 256)) return
        const lease: Lease = { proof, agent, session, messageId: message.id, epoch: this.epochs.get(session)!, header: headerOf(session) }
        entry.lease = lease; this.prune(); if (this.leases.size >= 256) return
        this.leases.set(message.id, lease)
      } catch { /* Chat still works; unverified input is draft-only. */ }
    }))
    this.offs.push(host.on('agent/inbox/claimed', ({ agent, message, turn }: Native) => {
      const lease = this.leases.get(message?.id)
      if (!lease || lease.agent !== agent || !Number.isSafeInteger(turn) || message?.source?.kind !== 'user') return
      try { this.assertLease(lease); lease.turn = turn } catch { this.leases.delete(message.id) }
    }))
    this.offs.push(host.on('agent/inbox/discarded', ({ message }: Native) => { this.leases.delete(message?.id) }))
    this.offs.push(host.on('agent/pre-step', async (payload: Native, next: () => Promise<any>) => {
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      const candidates = messages.map((message: Native) => this.leases.get(message.id)).filter(Boolean) as Lease[]
      const candidate = messages.length === 1 && candidates.length === 1 ? candidates[0] : undefined
      if (candidate) candidate.entered = false
      const decision = await next()
      if (candidate) {
        try {
          this.assertLease(candidate)
          const actual = Array.isArray(decision?.messages) ? decision.messages.filter((m: Native) => m.source?.kind !== 'runtime-context') : []
          if (candidate.agent !== payload.agent || candidate.turn !== payload.turn || decision?.kind !== 'enter'
            || actual.length !== 1 || actual[0].id !== candidate.messageId || actual[0].source?.kind !== 'user'
            || privateInputTextDigest(actual[0].content) !== candidate.proof.contentDigest) throw unavailable()
          payload.signal.throwIfAborted(); candidate.entered = true; candidate.signal = payload.signal
        } catch { this.leases.delete(candidate.messageId) }
      } else if (messages.length) this.invalidate(payload.agent?.session)
      return decision
    }))
    this.offs.push(host.on('session/event', (session: Native, event: Native) => {
      if (event?.type === 'turn/end') this.invalidate(session)
      if (event?.type === 'user/message') {
        // Modern DSH appends its separately typed runtime context after the
        // claimed input. It is neither a new owner input nor authority.
        if (event.data?.source?.kind === 'runtime-context') return
        const lease = this.leases.get(event.data?.id)
        if (lease?.session === session && lease.entered && event.data?.source?.kind === 'user'
          && privateInputTextDigest(event.data.content) === lease.proof.contentDigest) lease.userSeq = event.seq
        else this.invalidate(session)
      }
    }, { global: true }))
    this.offs.push(host.on('workspace/session-stop', ({ sessionId }: Native) => {
      for (const lease of this.leases.values()) if (lease.proof.scope === sessionId) this.invalidate(lease.session)
    }))
    this.offs.push(host.on('tools/execute', (exec: Native, next: () => Promise<any>) => {
      const candidates = [...this.leases.values()].filter(lease => lease.agent === exec.agent && lease.entered)
      if (candidates.length !== 1) return next()
      const lease = candidates[0]
      try { this.assertExecution(exec, lease) } catch { return next() }
      return this.dispatches.run({ token: exec.token, lease }, next)
    }))
  }
  supported(): boolean {
    try {
      this.assertIdentity()
      // Only the documented modern native inbox/tool contracts are admitted.
      // Missing/unknown host versions fail closed, not guessed from arity.
      const match = /^(\d+)\.(\d+)\./.exec(hostRuntimeVersion(this.host) ?? '')
      return !this.stopped && !!match && (Number(match[1]) > 0 || Number(match[2]) >= 2)
        && typeof this.host.get('agents')?.get === 'function' && typeof this.host.get('sessions')?.get === 'function'
        && typeof this.host.get('sessionController')?.inspect === 'function'
        && typeof this.host.get('tools')?.guard === 'function'
    } catch { return false }
  }
  async describe(value: unknown, signal: AbortSignal): Promise<unknown> {
    if (!this.supported() || !row(value) || !exact(value, ['sessionId']) || !plain(value.sessionId, 256)) throw unavailable()
    signal.throwIfAborted()
    const inspected = await this.host.get('sessionController').inspect(value.sessionId, signal)
    const meta = inspected?.meta
    const virtual = { id: value.sessionId, header: meta }; headerOf(virtual)
    signal.throwIfAborted(); this.assertIdentity()
    const live = this.host.get('sessions')?.get(value.sessionId)
    if (live && headerOf(live) !== headerOf(virtual)) throw unavailable()
    return { nodeId: this.nodeId, scope: value.sessionId, sessionGeneration: String(meta.createdAt), supported: true }
  }
  async run<T>(payload: Native, supplied: unknown, invoke: () => Promise<T>, rpcId: string): Promise<T> {
    const scope = payload.sessionId, content = payload.content
    const texts = Array.isArray(content) ? content.filter((p: Native) => p?.type === 'text').map((p: Native) => p.text) : []
    // Slash commands have their own native path, not conversational authority.
    const proof = this.supported() && plain(scope, 256) && plain(rpcId, 256) && !texts.some((t: unknown) => typeof t === 'string' && t.trimStart().startsWith('/'))
      ? proofOf(supplied, this.nodeId, scope, privateInputTextDigest(content), this.now()) : undefined
    if (!proof) return invoke()
    const admission: Admission = { proof, rpcId, open: true, inserted: false }
    try { return await this.admissions.run(admission, invoke) }
    finally { admission.open = false }
  }
  async ownerInput(exec: ToolRunContext, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef): Promise<PrivatePublishInput> {
    const dispatch = this.dispatches.getStore()
    if (!dispatch || dispatch.token !== exec.token) throw unavailable()
    const lease = dispatch.lease
    const assertCurrent = () => this.assertExecution(exec, lease)
    assertCurrent()
    const { inputProof, inputId, contentDigest } = lease.proof
    return { inputProof, inputId, contentDigest, nativeMessageId: lease.messageId,
      idempotencyKey: hash([lease.proof.binding, lease.proof.scope, lease.proof.sessionGeneration, inputId, lease.messageId, taskRef, draftRef]), assertCurrent }
  }
  async ownerInputStatus(exec: ToolRunContext): Promise<{ schema: 'human.private.update.status.v1'; state: 'ready' | 'unavailable' | 'no-current-input'; expiresAt?: number; reason?: string }> {
    if (!this.supported()) return { schema: 'human.private.update.status.v1', state: 'unavailable', reason: '当前宿主尚不能核对真实用户输入，可继续起草并使用确认按钮。' }
    const dispatch = this.dispatches.getStore()
    try {
      if (!dispatch || dispatch.token !== exec.token) throw unavailable()
      this.assertExecution(exec, dispatch.lease)
      return { schema: 'human.private.update.status.v1', state: 'ready', expiresAt: dispatch.lease.proof.expiresAt,
        reason: '当前原生输入凭据可用；是否实际执行仍取决于用户意图和云端即时权限校验。' }
    } catch {
      return { schema: 'human.private.update.status.v1', state: 'no-current-input', reason: '当前没有可核对的用户输入权限；不能据此推断用户已关闭设置，可继续起草并使用确认按钮。' }
    }
  }
  private assertAgent(agent: Native): void {
    if (!agent || agent.id !== agent.session?.id || this.host.get('agents')?.get(agent.id) !== agent
      || this.host.get('sessions')?.get(agent.id) !== agent.session) throw unavailable()
    headerOf(agent.session)
  }
  private assertLease(lease: Lease): void {
    if (!this.supported()) throw unavailable()
    this.assertAgent(lease.agent)
    if (lease.proof.expiresAt <= this.now() || lease.session !== lease.agent.session || headerOf(lease.session) !== lease.header
      || this.epochs.get(lease.session) !== lease.epoch || this.leases.get(lease.messageId) !== lease) throw unavailable()
  }
  private assertExecution(exec: Native, lease: Lease): void {
    this.assertLease(lease); exec.signal.throwIfAborted(); lease.signal?.throwIfAborted()
    if (typeof exec.token !== 'symbol' || exec.agent !== lease.agent || !lease.entered || lease.userSeq === undefined
      || !plain(exec.callId, 256) || !plain(exec.rootCallId, 256)) throw unavailable()
    const events = logOf(lease.session)
    let turn: number | undefined, root: Native | undefined, source = false
    for (const event of events) {
      if (event.type === 'turn/start') { turn = event.data?.turn; root = undefined; source = false }
      if (event.type === 'turn/end') { turn = undefined; root = undefined; source = false }
      if (event.type === 'user/message' && event.seq === lease.userSeq && event.data?.id === lease.messageId && event.data.source?.kind === 'user') source = true
      if (event.type === 'tool/call' && event.data?.callId === exec.rootCallId) root = event
    }
    if (!source || turn !== lease.turn || !root || root.data.turn !== turn || root.seq <= lease.userSeq
      || (exec.parent === undefined && (exec.callId !== exec.rootCallId || root.data.name !== exec.name))) throw unavailable()
  }
  private invalidate(session: Native | undefined): void {
    if (!session) return
    this.epochs.set(session, (this.epochs.get(session) ?? 0) + 1)
    for (const [id, lease] of this.leases) if (lease.session === session) this.leases.delete(id)
  }
  private prune(): void { for (const [id, lease] of this.leases) if (lease.proof.expiresAt <= this.now()) this.leases.delete(id) }
  close(): void {
    if (this.stopped) return
    this.stopped = true; this.leases.clear(); for (const off of this.offs.splice(0).reverse()) off()
    this.admissions.disable(); this.dispatches.disable()
  }
}
