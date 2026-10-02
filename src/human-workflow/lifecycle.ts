import { humanTaskRef, humanWorkflowDraftRef, sameTaskRef, type HumanTaskRef, type HumanWorkflowDraftRef } from '../human-tools/protocol.js'
import { assertScope, bounded, copy, exact, fail, plain, revision, row, sameScope, scopeValid, StateQueue, version, type WorkflowDataStore, type WorkflowScope } from './data.js'
import type { WorkflowTransport } from './transport.js'
import { ReceiverKeyring } from './receiver-keyring.js'
import { SubmissionReceiver } from './receiver.js'
import { canonicalSubmission, sha256 } from './submission-crypto.js'

export interface NodeBinding { schema: 'human.node.binding.v1'; nodeId: string; ownerSubject: string; accountInstance: string; generation: string }
export function receiverBinding(value: unknown, nodeId: string): { binding: NodeBinding; bindingKey: string } {
  if (!row(value) || value.schema !== 'human.node.binding.v1' || value.nodeId !== nodeId
    || !plain(value.ownerSubject, 256) || !plain(value.accountInstance, 256) || !plain(value.generation, 256)) throw fail('lifecycle-binding-invalid', '任务授权绑定无效')
  const binding: NodeBinding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: value.ownerSubject, accountInstance: value.accountInstance, generation: value.generation }
  return { binding, bindingKey: sha256(JSON.stringify(binding)) }
}
export interface LifecycleDraft {
  draftRef: HumanWorkflowDraftRef; taskRef: HumanTaskRef; expectedRevision: number; content: Record<string, unknown>
  expiresAt: number; state: 'draft' | 'published'; result?: unknown
}
interface Analysis { scope: WorkflowScope; taskRef: HumanTaskRef; submissionId: string; submissionVersion: number; revision: number; text: string; updatedAt: number }
interface Ledger { schema: 'human.lifecycle.local.v1'; nodeId: string; analyses: Analysis[] }
export interface LifecycleOptions {
  transport: WorkflowTransport; keys: ReceiverKeyring; receiver?: SubmissionReceiver; store: WorkflowDataStore
  now?: () => number
}
export const RECEIVER_SYNC_MAX_FILES = 4
export const RECEIVER_SYNC_TIMEOUT_MS = 120_000
function lifecycleDraft(value: unknown): LifecycleDraft {
  if (!row(value) || !humanWorkflowDraftRef(value.draftRef) || !humanTaskRef(value.taskRef) || !revision(value.expectedRevision)
    || !row(value.content) || !Number.isSafeInteger(value.expiresAt) || !['draft', 'published'].includes(String(value.state))) throw fail('lifecycle-response-invalid', '任务方案格式无效')
  bounded(value, 64 * 1024)
  const ref = humanWorkflowDraftRef(value.draftRef)!
  if (ref.digest !== sha256(canonicalSubmission({ taskRef: value.taskRef, kind: ref.kind, expectedRevision: value.expectedRevision, content: value.content })))
    throw fail('lifecycle-response-invalid', '任务方案摘要不匹配')
  return copy(value) as unknown as LifecycleDraft
}
/** Local receiver and draft tools never approve. Only the authenticated owner
 * WeChat endpoint can publish a draft. No Agent restoration or execution here. */
export class WorkflowLifecycle {
  private readonly lifetime = new AbortController()
  private readonly registered = new Set<string>()
  private readonly offsets = new Map<string, number>()
  private background: Promise<void> = Promise.resolve()
  private syncing = false
  private cursor = 0
  available = false
  private constructor(private readonly options: LifecycleOptions, private readonly state: StateQueue<Ledger>) {}
  static async open(options: LifecycleOptions): Promise<WorkflowLifecycle> {
    const raw = await options.store.load(), nodeId = options.transport.nodeId
    let ledger: Ledger = { schema: 'human.lifecycle.local.v1', nodeId, analyses: [] }
    if (raw !== undefined) {
      if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'analyses']) || raw.schema !== ledger.schema || raw.nodeId !== nodeId
        || !Array.isArray(raw.analyses) || raw.analyses.length > 256) throw fail('lifecycle-store-invalid', '任务处理账本无效')
      const ids = new Set<string>()
      for (const entry of raw.analyses) {
        if (!row(entry) || !exact(entry, ['scope', 'taskRef', 'submissionId', 'submissionVersion', 'revision', 'text', 'updatedAt'])
          || !scopeValid(entry.scope) || entry.scope.nodeId !== nodeId || !humanTaskRef(entry.taskRef) || !plain(entry.submissionId, 128)
          || !version(entry.submissionVersion) || !version(entry.revision) || !plain(entry.text, 8000) || !revision(entry.updatedAt)) throw fail('lifecycle-store-invalid', '任务分析记录无效')
        const key = canonicalSubmission([entry.scope, entry.submissionId]); if (ids.has(key)) throw fail('lifecycle-store-invalid', '任务分析记录重复'); ids.add(key)
      }
      ledger = copy(raw) as unknown as Ledger
    }
    return new WorkflowLifecycle(options, new StateQueue(options.store, ledger))
  }
  private active(signal: AbortSignal): AbortSignal { this.options.transport.assertIdentity(); this.lifetime.signal.throwIfAborted(); return AbortSignal.any([signal, this.lifetime.signal]) }
  async prepareInitial(signal: AbortSignal, requiresImage: boolean): Promise<void> {
    const active = this.active(signal)
    if (requiresImage && !this.options.receiver) throw fail('receiver-unavailable', '此宿主尚不能可靠接收和验证图片')
    // Before the first task exists, discover only the node's current binding.
    // This creates no Agent/session and does not turn the snapshot into facts.
    const page = await this.options.transport.request('sync', { mode: 'snapshot', limit: 1 }, active)
    if (!row(page) || page.schema !== 'human.workflow.sync.v1') throw fail('lifecycle-binding-invalid', '无法核对首轮接收节点')
    await this.registerKey(page.binding, active); this.available = true
  }
  private async registerKey(binding: unknown, signal: AbortSignal): Promise<string> {
    const { bindingKey } = receiverBinding(binding, this.options.transport.nodeId)
    if (this.registered.has(bindingKey)) return bindingKey
    const key = await this.options.keys.ensure(bindingKey, signal)
    const result = await this.options.transport.request('receiver-key', { key }, signal)
    if (!row(result) || result.bindingKey !== bindingKey || receiverBinding(result.binding, this.options.transport.nodeId).bindingKey !== bindingKey
      || canonicalSubmission(result.key) !== canonicalSubmission(key)) throw fail('lifecycle-binding-invalid', '接收公钥登记绑定不符')
    this.options.transport.assertIdentity(); signal.throwIfAborted(); this.registered.add(bindingKey); return bindingKey
  }
  private async get(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    assertScope(scope, this.options.transport.nodeId); if (!humanTaskRef(taskRef)) throw fail('lifecycle-query-invalid', '任务引用无效')
    const active = this.active(signal)
    const result = await this.options.transport.request('lifecycle', { operation: 'get', scope: scope.sessionId,
      sessionGeneration: scope.sessionGeneration, taskRef, ...extra }, active)
    this.options.transport.assertIdentity(); active.throwIfAborted()
    if (!row(result) || !sameTaskRef(humanTaskRef(result.taskRef), taskRef) || !row(result.origin)
      || result.origin.scope !== scope.sessionId || result.origin.sessionGeneration !== scope.sessionGeneration || !revision(result.revision)
      || !Array.isArray(result.rounds) || !Array.isArray(result.submissions) || !Array.isArray(result.drafts) || !Array.isArray(result.participants)
      || !result.submissions.every(row) || result.submissions.length > 20 || result.rounds.length > 100 || result.drafts.length > 100 || result.participants.length > 1000
      || result.nextOffset !== null && !revision(result.nextOffset)) throw fail('lifecycle-response-invalid', '任务生命周期响应无效')
    bounded(result, 1024 * 1024)
    const bindingKey = await this.registerKey(result.binding, active)
    if (result.bindingKey !== bindingKey) throw fail('lifecycle-binding-invalid', '任务接收绑定不符')
    this.available = true
    return result
  }
  async query(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, offset = 0, roundId?: string): Promise<unknown> {
    if (!revision(offset) || roundId !== undefined && !plain(roundId, 128)) throw fail('lifecycle-query-invalid', '任务分页或轮次引用无效')
    const page = await this.get(scope, taskRef, signal, { offset, limit: 20 })
    const rounds = (page.rounds as unknown[]).filter(row), selectedRounds = roundId === undefined ? rounds.slice(-1) : rounds.filter(item => item.id === roundId)
    if (roundId !== undefined && !selectedRounds.length) throw fail('lifecycle-query-invalid', '此任务没有指定轮次')
    const submissions: unknown[] = []; let bytes = 0
    for (const item of page.submissions as unknown[]) {
      const size = Buffer.byteLength(JSON.stringify(item)); if (bytes + size > 40 * 1024) break
      submissions.push(item); bytes += size
    }
    // No owner/account identity, receiver key or bearer download ticket in tool output.
    return { schema: 'human.lifecycle.query.v1', taskRef, revision: page.revision, rounds: copy(selectedRounds),
      roundRefs: rounds.map(item => ({ id: item.id, number: item.number, title: item.title })), submissions: copy(submissions),
      participants: copy(page.participants), drafts: (page.drafts as unknown[]).map(value => {
        const draft = lifecycleDraft(value); return { draftRef: draft.draftRef, state: draft.state, expiresAt: draft.expiresAt }
      }), nextOffset: submissions.length < (page.submissions as unknown[]).length ? offset + submissions.length : page.nextOffset, asOf: (this.options.now ?? Date.now)() }
  }
  async prepare(scope: WorkflowScope, taskRef: HumanTaskRef, kind: HumanWorkflowDraftRef['kind'], expectedRevision: number,
    content: Record<string, unknown>, idempotencyKey: string, signal: AbortSignal): Promise<LifecycleDraft> {
    const active = this.active(signal)
    if (!['round', 'review', 'reminder'].includes(kind) || !revision(expectedRevision) || !row(content) || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey))
      throw fail('lifecycle-draft-invalid', '任务方案参数无效')
    bounded(content, 12 * 1024)
    const current = await this.get(scope, taskRef, active)
    if (current.revision !== expectedRevision) throw fail('lifecycle-version-conflict', '任务已变化，请重新查询后准备方案')
    const result = await this.options.transport.request('lifecycle', { operation: `${kind}-draft`, scope: scope.sessionId,
      sessionGeneration: scope.sessionGeneration, taskRef, expectedRevision, content, idempotencyKey }, active)
    this.options.transport.assertIdentity(); active.throwIfAborted()
    if (!row(result)) throw fail('lifecycle-response-invalid', '任务方案响应无效')
    const draft = lifecycleDraft(result.draft)
    if (!sameTaskRef(draft.taskRef, taskRef) || draft.draftRef.kind !== kind || draft.expectedRevision !== expectedRevision
      || canonicalSubmission(draft.content) !== canonicalSubmission(content)) throw fail('lifecycle-response-invalid', '任务方案与所请求内容不一致')
    return draft
  }
  async preview(scope: WorkflowScope, taskRef: HumanTaskRef, ref: HumanWorkflowDraftRef, signal: AbortSignal): Promise<unknown> {
    if (!humanWorkflowDraftRef(ref)) throw fail('lifecycle-draft-invalid', '任务方案引用无效')
    const page = await this.get(scope, taskRef, signal, { draftId: ref.draftId })
    const draft = (page.drafts as unknown[]).map(lifecycleDraft).find(item => canonicalSubmission(item.draftRef) === canonicalSubmission(ref))
    if (!draft) throw fail('lifecycle-draft-unavailable', '原任务方案已不可用；不能替换成其他版本')
    return { schema: 'human.workflow.preview.v1', ref: copy(ref), taskRef: copy(taskRef), draft }
  }
  /** One hook on the existing node sync loop. Bounded round-robin scan, not a
   * task poller. Failed receivers remain retryable; neither events nor ACKs
   * call a model, create sessions or restore stopped Agents. */
  synced(binding: unknown, tasks: readonly Record<string, unknown>[], signal: AbortSignal): Promise<void> {
    if (this.syncing) return this.background
    this.syncing = true
    const operation = this.background.then(async () => {
      const budget = AbortSignal.timeout(RECEIVER_SYNC_TIMEOUT_MS), now = this.options.now ?? Date.now
      const deadline = now() + RECEIVER_SYNC_TIMEOUT_MS
      const ownerSignal = this.active(signal), active = AbortSignal.any([ownerSignal, budget])
      const outOfBudget = () => budget.aborted || now() >= deadline
      let attempts = 0
      await this.registerKey(binding, active)
      if (!this.options.receiver) return
      const candidates = tasks.filter(task => Number(task.lifecycleRevision) > 0 && row(task.origin) && humanTaskRef(task.taskRef))
      for (let count = 0; count < Math.min(8, candidates.length); count++) {
        ownerSignal.throwIfAborted(); if (outOfBudget() || attempts >= RECEIVER_SYNC_MAX_FILES) break
        const task = candidates[(this.cursor++) % candidates.length]!, origin = task.origin as Record<string, unknown>, taskRef = humanTaskRef(task.taskRef)!
        const scope: WorkflowScope = { nodeId: this.options.transport.nodeId, sessionId: String(origin.scope), sessionGeneration: String(origin.sessionGeneration) }
        try {
          const offset = this.offsets.get(taskRef.taskId) ?? 0
          const page = await this.get(scope, taskRef, active, { offset, limit: 20 })
          const items = (page.submissions as Record<string, unknown>[]).slice(0, 20)
          for (const [index, item] of items.entries()) {
            ownerSignal.throwIfAborted(); if (outOfBudget() || attempts >= RECEIVER_SYNC_MAX_FILES) return
            // Resume the next item, not the next page, when this tick's finite
            // budget is exhausted. Failed items are revisited on the next lap.
            this.offsets.set(taskRef.taskId, index + 1 === items.length ? (typeof page.nextOffset === 'number' ? page.nextOffset : 0) : offset + index + 1)
            if (!plain(item.id, 128) || item.state !== 'accepted' || item.delivery !== 'pending') continue
            attempts++
            const claimed = await this.options.transport.request('objects/claim', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration,
              taskRef, submissionId: item.id, requestId: sha256(canonicalSubmission([scope, taskRef, item.id])) }, active)
            if (!row(claimed)) throw fail('receiver-claim-invalid', '收件租约响应无效')
            await this.options.receiver.receive(scope, taskRef, String(page.bindingKey), claimed.delivery, active)
          }
          if (!items.length) this.offsets.set(taskRef.taskId, typeof page.nextOffset === 'number' ? page.nextOffset : 0)
        } catch {
          ownerSignal.throwIfAborted(); this.options.transport.assertIdentity()
          if (outOfBudget()) return /* deadline is not a task failure; next sync resumes */
          /* retry boundedly on next sync */
        }
      }
    })
    const finished = operation.finally(() => { this.syncing = false })
    this.background = finished.catch(() => {}); return finished
  }
  async readImage(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal) {
    if (!this.options.receiver) throw fail('receiver-unavailable', '此宿主不支持原生图片接收')
    const page = await this.get(scope, taskRef, signal, { submissionId })
    const item = (page.submissions as Record<string, unknown>[]).find(item => item.id === submissionId)
    if (!item) throw fail('submission-unavailable', '提交不属于此会话任务')
    const result = await this.options.receiver.read(scope, submissionId, String(page.bindingKey), this.active(signal))
    if (!sameTaskRef(result.manifest.context.taskRef, taskRef) || item.version !== result.manifest.context.version) throw fail('submission-unavailable', '提交版本已变化')
    return result
  }
  async saveAnalysis(scope: WorkflowScope, taskRef: HumanTaskRef, input: { submissionId: string; submissionVersion: number; expectedRevision: number; text: string }, signal: AbortSignal) {
    const active = this.active(signal)
    if (!plain(input.text, 8000) || !version(input.submissionVersion) || !revision(input.expectedRevision)) throw fail('lifecycle-analysis-invalid', '分析内容或版本无效')
    const page = await this.get(scope, taskRef, active, { submissionId: input.submissionId })
    const submission = (page.submissions as Record<string, unknown>[]).find(item => item.id === input.submissionId && item.version === input.submissionVersion)
    if (!submission) throw fail('submission-unavailable', '分析引用的提交不存在')
    if (submission.delivery !== 'not-required') await this.readImage(scope, taskRef, input.submissionId, active)
    return this.state.update(ledger => {
      this.options.transport.assertIdentity()
      const previous = ledger.analyses.find(entry => sameScope(entry.scope, scope) && entry.submissionId === input.submissionId)
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw fail('lifecycle-version-conflict', '分析版本已变化')
      if (!previous && ledger.analyses.length >= 256) throw fail('lifecycle-capacity', '本地分析数量达到上限')
      const next: Analysis = { scope: copy(scope), taskRef: copy(taskRef), submissionId: input.submissionId, submissionVersion: input.submissionVersion,
        revision: input.expectedRevision + 1, text: input.text, updatedAt: (this.options.now ?? Date.now)() }
      if (previous) ledger.analyses[ledger.analyses.indexOf(previous)] = next; else ledger.analyses.push(next)
      return next
    }, active)
  }
  analyses(scope: WorkflowScope, taskRef: HumanTaskRef) {
    this.active(new AbortController().signal); assertScope(scope, this.options.transport.nodeId)
    return copy(this.state.current().analyses.filter(item => sameScope(item.scope, scope) && sameTaskRef(item.taskRef, taskRef)))
  }
  async close(): Promise<void> { this.lifetime.abort(); await this.state.close(); await this.background }
}
