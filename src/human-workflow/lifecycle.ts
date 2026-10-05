import { humanTaskRef, humanWorkflowDraftRef, humanReminderTitle, humanSelectionRef, humanRecipientRef, sameTaskRef, type HumanTaskRef, type HumanWorkflowDraftRef, type HumanSelectionRef, type HumanReminderPreview, type HumanRecipientRef } from '../human-tools/protocol.js'
import { assertScope, bounded, copy, exact, fail, plain, revision, row, sameScope, scopeValid, StateQueue, version, type WorkflowDataStore, type WorkflowScope } from './data.js'
import { workflowErrorMessage, type WorkflowTransport } from './transport.js'
import { randomBytes } from 'node:crypto'
import { ReceiverKeyring } from './receiver-keyring.js'
import { SubmissionReceiver } from './receiver.js'
import { canonicalSubmission, sha256 } from './submission-crypto.js'
import { SUBMISSION_RECEIVE_FORMATS, submissionImageType } from './submission-file-contract.js'
import type { AutomationSnapshot, AutomationSubmission } from './automation-types.js'
import { WORKFLOW_LONG_TERM_BYTES } from './archive-store.js'
import { HUMAN_ROUND_MAX_BYTES, HUMAN_SURFACE_MAX_BYTES, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES } from '../human-tools/capacity.js'
import { lifecycleCoverValid, humanCardAsset, type HumanCardAsset } from '../human-tools/card-cover.js'
import { recipientFacts, recipientSnapshot } from './recipient-facts.js'
import type { WorkspaceTaskAccess } from './workspace-directory.js'
import { humanRoundIssue } from '../human-tools/form.js'

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
  currentRevision?: number; approvalStatus?: 'ready' | 'published' | 'stale' | 'expired'
  context?: { taskTitle: string; roundTitle?: string; submissionCreatedAt?: number; reminderTargetCount?: number }
  execution?: { operationId: string; phase: 'prepared' | 'invoked' | 'settled'; outcome: string | null; reason: string | null }
}
/** Host-derived input authority; never a model tool parameter or tool output. */
export interface PrivatePublishInput {
  inputProof: string; inputId: string; contentDigest: string; nativeMessageId: string; idempotencyKey: string
  assertCurrent(): void
}
export type LifecycleReminderContent = { roundId: string | null; title: string } & (
  { condition: 'pending-submission' | 'result-published'; participantRefs: string[]; recipientSource?: never }
  | { condition: 'pending-submission'; recipientSource: 'task-audience'; participantRefs?: never }
  | { condition: 'pending-submission'; recipientSource: 'selected-members'; selectionRef: HumanSelectionRef; participantRefs?: never }
  | { condition: 'none'; recipientSource: 'exact-references'; recipientRefs: HumanRecipientRef[]; type: 'complete' | 'participate'; participantRefs?: never }
)
/** Request data only. Actual audience membership and current eligibility are
 * resolved by the authenticated server without creating participant records. */
export function lifecycleReminderContent(value: unknown): LifecycleReminderContent | undefined {
  if (!row(value) || !humanReminderTitle(value.title)) return
  if (value.recipientSource === 'exact-references') {
    if (!exact(value, ['roundId', 'title', 'condition', 'recipientSource', 'recipientRefs', 'type']) || value.condition !== 'none'
      || value.roundId !== null && !plain(value.roundId, 128) || !['complete', 'participate'].includes(String(value.type))
      || !Array.isArray(value.recipientRefs) || !value.recipientRefs.length || value.recipientRefs.length > 20
      || !value.recipientRefs.every(humanRecipientRef)
      || new Set(value.recipientRefs.map(ref => canonicalSubmission(ref))).size !== value.recipientRefs.length) return
    return copy(value) as LifecycleReminderContent
  }
  if (!plain(value.roundId, 128)) return
  if (Object.hasOwn(value, 'recipientSource')) {
    if (value.condition !== 'pending-submission') return
    if (value.recipientSource === 'selected-members') {
      if (!exact(value, ['roundId', 'title', 'condition', 'recipientSource', 'selectionRef']) || !humanSelectionRef(value.selectionRef)) return
    } else if (!exact(value, ['roundId', 'title', 'condition', 'recipientSource']) || value.recipientSource !== 'task-audience') return
  } else if (!exact(value, ['roundId', 'title', 'condition', 'participantRefs'])
    || !['pending-submission', 'result-published'].includes(String(value.condition))
    || !Array.isArray(value.participantRefs) || value.participantRefs.length < 1 || value.participantRefs.length > 20
    || new Set(value.participantRefs).size !== value.participantRefs.length
    || !value.participantRefs.every(ref => typeof ref === 'string' && /^[A-Za-z0-9_-]{24,64}(?![\s\S])/.test(ref))) return
  return copy(value) as LifecycleReminderContent
}
/** Derived from the checked immutable cloud draft, never supplied by the model. */
export function lifecycleReminderPreview(draft: LifecycleDraft): HumanReminderPreview | undefined {
  const content = lifecycleReminderContent(draft.content)
  if (draft.draftRef.kind !== 'reminder' || !content || !draft.context?.taskTitle) return
  return { schema: 'human.reminder.preview.v1', title: content.title, taskTitle: draft.context.taskTitle, condition: content.condition,
    type: content.recipientSource === 'exact-references' ? content.type : 'complete',
    recipientSource: content.recipientSource || 'observed', recipientCount: content.recipientSource === 'task-audience' ? null
      : content.recipientSource === 'selected-members' ? content.selectionRef.memberRefs.length
        : content.recipientSource === 'exact-references' ? content.recipientRefs.length : content.participantRefs.length }
}
interface Analysis { scope: WorkflowScope; taskRef: HumanTaskRef; submissionId: string; submissionVersion: number; revision: number; text: string; updatedAt: number }
interface ReceiptAttempt { scope: WorkflowScope; taskRef: HumanTaskRef; submissionId: string; submissionVersion: number
  revision: number; requestId: string; state: 'pending' | 'received' | 'blocked'; errorCode?: string; updatedAt: number }
interface PrivatePublicationAttempt { scope: WorkflowScope; taskRef: HumanTaskRef; draftRef: HumanWorkflowDraftRef
  operationId: string; inputIdDigest: string; nativeMessageDigest: string; state: 'attempted' | 'published' | 'rejected'; rejection?: string; updatedAt: number }
interface Ledger { schema: 'human.lifecycle.local.v1'; nodeId: string; analyses: Analysis[]; receipts?: ReceiptAttempt[]; publications?: PrivatePublicationAttempt[] }
const PRIVATE_PUBLICATION_LIMIT = 256
// These authenticated structured responses guarantee this request added no
// private content. They do NOT prove another earlier operation did not publish.
const PRIVATE_PUBLICATION_REJECTIONS: Record<string, number> = {
  private_updates_disabled: 403, invalid_private_input_proof: 403, private_publication_only: 403, source_scope_mismatch: 403,
  private_input_expired: 410, draft_expired: 410, private_input_replayed: 409, draft_changed: 409,
  lifecycle_conflict: 409, idempotency_conflict: 409, private_update_capacity: 429, lifecycle_capacity: 429,
}
const receiptRetryableCodes = new Set(['download_ticket_expired', 'attachment_download_quota', 'usage_ledger_capacity', 'metering_unavailable', 'receiver-capacity', 'receiver_format_unsupported'])
const receiptBlockedCodes = new Set([...receiptRetryableCodes, 'submission-file-invalid', 'submission-image-invalid', 'submission-manifest-invalid',
  'submission-integrity-invalid', 'submission-context-invalid', 'receiver-file-mismatch'])
export interface LifecycleOptions {
  transport: WorkflowTransport; keys: ReceiverKeyring; receiver?: SubmissionReceiver; store: WorkflowDataStore
  now?: () => number
  coverAuthority?(scope: WorkflowScope, asset: HumanCardAsset): void
  workspaceAccess?(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal): Promise<WorkspaceTaskAccess | undefined>
}
export const RECEIVER_SYNC_MAX_FILES = 4
export const RECEIVER_SYNC_TIMEOUT_MS = 120_000
function lifecycleDraft(value: unknown): LifecycleDraft {
  if (!row(value) || !humanWorkflowDraftRef(value.draftRef) || !humanTaskRef(value.taskRef) || !revision(value.expectedRevision)
    || !row(value.content) || !Number.isSafeInteger(value.expiresAt) || !['draft', 'published'].includes(String(value.state))) throw fail('lifecycle-response-invalid', '任务方案格式无效')
  bounded(value, HUMAN_SURFACE_MAX_BYTES)
  // New servers add a paired, authenticated status. An old server omitting
  // both fields is unknown, not implicit permission to approve/retry.
  if (value.currentRevision !== undefined || value.approvalStatus !== undefined) {
    if (!revision(value.currentRevision) || !['ready', 'published', 'stale', 'expired'].includes(String(value.approvalStatus))
      || Number(value.currentRevision) < value.expectedRevision
      || (value.state === 'published') !== (value.approvalStatus === 'published')
      || value.approvalStatus === 'ready' && value.currentRevision !== value.expectedRevision
      || value.approvalStatus === 'stale' && value.currentRevision === value.expectedRevision)
      throw fail('lifecycle-response-invalid', '任务方案的当前状态不一致')
  }
  const ref = humanWorkflowDraftRef(value.draftRef)!
  if (ref.kind === 'reminder' && Object.hasOwn(value.content, 'recipientSource') && !lifecycleReminderContent(value.content))
    throw fail('lifecycle-response-invalid', '提醒对象来源无效')
  if (!lifecycleCoverValid(ref.kind, value.content)) throw fail('lifecycle-response-invalid', '任务方案封面范围或格式无效')
  if (ref.digest !== sha256(canonicalSubmission({ taskRef: value.taskRef, kind: ref.kind, expectedRevision: value.expectedRevision, content: value.content })))
    throw fail('lifecycle-response-invalid', '任务方案摘要不匹配')
  if (value.context !== undefined && (!row(value.context) || !exact(value.context, ['taskTitle'], ['roundTitle', 'submissionCreatedAt', 'reminderTargetCount'])
    || !plain(value.context.taskTitle, 80) || value.context.roundTitle !== undefined && !plain(value.context.roundTitle, 80)
    || value.context.submissionCreatedAt !== undefined && !revision(value.context.submissionCreatedAt)
    || value.context.reminderTargetCount !== undefined && (ref.kind !== 'reminder'
      || !Number.isSafeInteger(value.context.reminderTargetCount) || Number(value.context.reminderTargetCount) < 0 || Number(value.context.reminderTargetCount) > 20)))
    throw fail('lifecycle-response-invalid', '任务说明来源无效')
  if (value.execution !== undefined) {
    const execution = value.execution, result = value.result
    if (ref.kind !== 'reminder' || value.state !== 'published' || !row(execution) || !row(result)
      || !exact(execution, ['operationId', 'phase', 'outcome', 'reason']) || !plain(execution.operationId, 80)
      || execution.operationId !== result.operationId || result.taskId !== (value.taskRef as HumanTaskRef).taskId
      || result.deliveryId !== (value.taskRef as HumanTaskRef).deliveryId
      || !['prepared', 'invoked', 'settled'].includes(String(execution.phase))
      || (execution.phase === 'settled' ? !['success', 'failed', 'cancelled', 'unknown'].includes(String(execution.outcome)) : execution.outcome !== null)
      || execution.reason !== null && !plain(execution.reason, 80))
      throw fail('lifecycle-response-invalid', '提醒执行结果不匹配')
  }
  return copy(value) as unknown as LifecycleDraft
}
function draftEffects(draft: LifecycleDraft) {
  const published = draft.state === 'published', kind = draft.draftRef.kind, execution = draft.execution
  let notificationState = 'not-requested-by-this-action'
  if (kind === 'reminder') {
    notificationState = !published ? 'not-started' : !execution ? 'unknown'
      : execution.phase === 'prepared' ? 'not-started' : execution.phase === 'invoked' ? 'pending'
        : execution.reason === 'no_pending_members' ? 'not-needed'
          : ({ success: 'succeeded', failed: 'failed', cancelled: 'cancelled', unknown: 'unknown' }[execution.outcome || ''] || 'unknown')
  }
  return { contentState: !published ? 'not-published' : kind === 'review' ? 'private-feedback-visible'
    : kind === 'round' ? 'existing-task-updated' : 'unchanged',
  groupCardState: 'not-sent-by-this-action', notificationState }
}
function draftRecovery(draft: LifecycleDraft) {
  const approvalStatus = draft.approvalStatus ?? (draft.state === 'published' ? 'published' : 'unknown')
  return { expectedRevision: draft.expectedRevision, currentRevision: draft.currentRevision ?? null, approvalStatus,
    recovery: approvalStatus === 'stale' || approvalStatus === 'expired' ? 'read-task-and-prepare-new-draft'
      : approvalStatus === 'published' ? 'check-operation-effects'
        : approvalStatus === 'ready' ? 'await-owner-action' : 'query-current-status' }
}
/** Drafts and reception remain separate from the narrowly scoped private
 * publication path. That path requires trusted host input plus cloud grants;
 * no Agent restoration, model invocation, public sharing or notification here. */
export class WorkflowLifecycle {
  private readonly lifetime = new AbortController()
  private readonly registered = new Set<string>()
  private readonly fileRegistered = new Set<string>()
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
      if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'analyses'], ['receipts', 'publications']) || raw.schema !== ledger.schema || raw.nodeId !== nodeId
        || !Array.isArray(raw.analyses) || raw.analyses.length > 2048) throw fail('lifecycle-store-invalid', '任务处理账本无效')
      const ids = new Set<string>()
      for (const entry of raw.analyses) {
        if (!row(entry) || !exact(entry, ['scope', 'taskRef', 'submissionId', 'submissionVersion', 'revision', 'text', 'updatedAt'])
          || !scopeValid(entry.scope) || entry.scope.nodeId !== nodeId || !humanTaskRef(entry.taskRef) || !plain(entry.submissionId, 128)
          || !version(entry.submissionVersion) || !version(entry.revision) || !plain(entry.text, 8000) || !revision(entry.updatedAt)) throw fail('lifecycle-store-invalid', '任务分析记录无效')
        const key = canonicalSubmission([entry.scope, entry.submissionId]); if (ids.has(key)) throw fail('lifecycle-store-invalid', '任务分析记录重复'); ids.add(key)
      }
      ledger = copy(raw) as unknown as Ledger
      if (raw.publications !== undefined) {
        if (!Array.isArray(raw.publications) || raw.publications.length > PRIVATE_PUBLICATION_LIMIT) throw fail('lifecycle-store-invalid', '私人更新记录无效')
        const publications = new Set<string>()
        for (const p of raw.publications) {
          const ref = row(p) && humanWorkflowDraftRef(p.draftRef)
          if (!row(p) || !exact(p, ['scope', 'taskRef', 'draftRef', 'operationId', 'inputIdDigest', 'nativeMessageDigest', 'state', 'updatedAt'], ['rejection'])
            || !scopeValid(p.scope) || p.scope.nodeId !== nodeId || !humanTaskRef(p.taskRef) || !ref || ref.kind === 'reminder'
            || !/^[A-Za-z0-9:_-]{16,128}$/.test(String(p.operationId)) || !['attempted', 'published', 'rejected'].includes(String(p.state))
            || !/^[a-f0-9]{64}$/.test(String(p.inputIdDigest)) || !/^[a-f0-9]{64}$/.test(String(p.nativeMessageDigest))
            || (p.state === 'rejected' ? typeof p.rejection !== 'string' || !Object.hasOwn(PRIVATE_PUBLICATION_REJECTIONS, p.rejection) : p.rejection !== undefined)
            || !revision(p.updatedAt)) throw fail('lifecycle-store-invalid', '私人更新记录无效')
          const key = canonicalSubmission([p.scope, p.taskRef, ref.draftId])
          if (publications.has(key)) throw fail('lifecycle-store-invalid', '私人更新记录重复'); publications.add(key)
        }
      }
      if (raw.receipts !== undefined) {
        if (!Array.isArray(raw.receipts) || raw.receipts.length > 4096) throw fail('lifecycle-store-invalid', '收件意图账本无效')
        const receipts = new Set<string>()
        for (const r of raw.receipts) {
          if (!row(r) || !exact(r, ['scope', 'taskRef', 'submissionId', 'submissionVersion', 'revision', 'requestId', 'state', 'updatedAt'], ['errorCode'])
            || !scopeValid(r.scope) || r.scope.nodeId !== nodeId || !humanTaskRef(r.taskRef) || !plain(r.submissionId, 128) || !version(r.submissionVersion)
            || !version(r.revision) || !/^[a-f0-9]{64}$/.test(String(r.requestId)) || !['pending', 'received', 'blocked'].includes(String(r.state))
            || !revision(r.updatedAt) || r.errorCode !== undefined && !receiptBlockedCodes.has(String(r.errorCode))) throw fail('lifecycle-store-invalid', '收件意图账本无效')
          const key = canonicalSubmission([r.scope, r.taskRef, r.submissionId, r.submissionVersion])
          if (receipts.has(key)) throw fail('lifecycle-store-invalid', '收件意图重复'); receipts.add(key)
        }
      }
    }
    bounded(ledger, WORKFLOW_LONG_TERM_BYTES)
    return new WorkflowLifecycle(options, new StateQueue(options.store, ledger, WORKFLOW_LONG_TERM_BYTES))
  }
  private active(signal: AbortSignal): AbortSignal { this.options.transport.assertIdentity(); this.lifetime.signal.throwIfAborted(); return AbortSignal.any([signal, this.lifetime.signal]) }
  async prepareInitial(signal: AbortSignal, requiresAttachment: boolean, requiresFile = false): Promise<void> {
    const active = this.active(signal)
    if (requiresAttachment && !this.options.receiver) throw fail('receiver-unavailable', '此宿主尚不能可靠接收和验证附件')
    // Discover fresh authenticated binding without allocating a task snapshot.
    // Even a one-row snapshot copies the full source and consumes scarce slots;
    // neither cached binding nor an events cursor is a fresh authority substitute.
    const page = await this.options.transport.request('sync', { mode: 'binding' }, active)
    this.options.transport.assertIdentity(); active.throwIfAborted()
    if (!row(page) || page.schema !== 'human.workflow.binding.v1' || !revision(page.asOf)
      || receiverBinding(page.binding, this.options.transport.nodeId).bindingKey !== page.bindingKey)
      throw fail('lifecycle-binding-invalid', '无法核对首轮接收节点')
    const bindingKey = await this.registerKey(page.binding, active)
    if (requiresFile && !this.fileRegistered.has(bindingKey)) throw fail('receiver-file-unavailable', '接收节点与服务端尚未共同确认文档收件能力')
    this.available = true
  }
  private async registerKey(binding: unknown, signal: AbortSignal): Promise<string> {
    const { bindingKey } = receiverBinding(binding, this.options.transport.nodeId)
    if (this.registered.has(bindingKey)) return bindingKey
    const key = await this.options.keys.ensure(bindingKey, signal)
    const result = await this.options.transport.request('receiver-key', { key, ...(this.options.receiver ? { receiveFormats: SUBMISSION_RECEIVE_FORMATS } : {}) }, signal)
    if (!row(result) || result.bindingKey !== bindingKey || receiverBinding(result.binding, this.options.transport.nodeId).bindingKey !== bindingKey
      || canonicalSubmission(result.key) !== canonicalSubmission(key)) throw fail('lifecycle-binding-invalid', '接收公钥登记绑定不符')
    if (this.options.receiver && result.receiveFormats !== undefined && canonicalSubmission(result.receiveFormats) !== canonicalSubmission(SUBMISSION_RECEIVE_FORMATS))
      throw fail('receiver-file-unavailable', '服务端确认的附件格式与本节点不一致')
    this.options.transport.assertIdentity(); signal.throwIfAborted(); this.registered.add(bindingKey)
    if (this.options.receiver && result.receiveFormats !== undefined) this.fileRegistered.add(bindingKey)
    return bindingKey
  }
  private async get(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, extra: Record<string, unknown> = {}, allowShared = true): Promise<Record<string, unknown>> {
    assertScope(scope, this.options.transport.nodeId); if (!humanTaskRef(taskRef)) throw fail('lifecycle-query-invalid', '任务引用无效')
    const active = this.active(signal)
    const shared = allowShared ? await this.options.workspaceAccess?.(scope, taskRef, active) : undefined, expectedOrigin = shared?.sourceScope ?? scope
    const result = await this.options.transport.request('lifecycle', { operation: 'get', scope: scope.sessionId,
      sessionGeneration: scope.sessionGeneration, taskRef, ...extra, ...(shared ? { workspaceRef: shared.workspaceRef } : {}) }, active)
    this.options.transport.assertIdentity(); active.throwIfAborted()
    if (!row(result) || !sameTaskRef(humanTaskRef(result.taskRef), taskRef) || !row(result.origin)
      || result.origin.scope !== expectedOrigin.sessionId || result.origin.sessionGeneration !== expectedOrigin.sessionGeneration || !revision(result.revision)
      || !Array.isArray(result.rounds) || !Array.isArray(result.submissions) || !Array.isArray(result.drafts) || !Array.isArray(result.participants)
      || !result.submissions.every(row) || result.submissions.length > 20 || result.rounds.length > 100 || result.drafts.length > 100 || result.participants.length > 1000
      || result.nextOffset !== null && !revision(result.nextOffset)) throw fail('lifecycle-response-invalid', '任务生命周期响应无效')
    bounded(result, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES)
    const bindingKey = await this.registerKey(result.binding, active)
    if (result.bindingKey !== bindingKey) throw fail('lifecycle-binding-invalid', '任务接收绑定不符')
    this.available = true
    return result
  }
  async reshare(scope: WorkflowScope, taskRef: HumanTaskRef, roundId: string | null, signal: AbortSignal) {
    if (roundId !== null && !plain(roundId, 128)) throw fail('lifecycle-query-invalid', '原任务提交要求引用无效')
    const page = await this.get(scope, taskRef, signal)
    if (!row(page.task) || !plain(page.task.title, 80) || !plain(page.task.body, 1000)) throw fail('lifecycle-response-invalid', '服务器未返回可核对的原任务公开内容')
    const round = roundId === null ? undefined : (page.rounds as Record<string, unknown>[]).find(r => r.id === roundId)
    if (roundId !== null && (!round || round.recipientRefs !== null || !plain(round.title, 80) || !plain(round.instructions, 2000)))
      throw fail('lifecycle-share-invalid', '只能重新发送原入口或已发布的公开提交要求，不能公开个人反馈或定向订正')
    return { title: (round?.title ?? page.task.title) as string, body: ((round?.instructions ?? page.task.body) as string).slice(0, 1000) }
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
        const draft = lifecycleDraft(value); return { draftRef: draft.draftRef, state: draft.state, expiresAt: draft.expiresAt,
          ...draftRecovery(draft), effects: draftEffects(draft) }
      }), nextOffset: submissions.length < (page.submissions as unknown[]).length ? offset + submissions.length : page.nextOffset, asOf: (this.options.now ?? Date.now)() }
  }
  async recipients(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, roundId: string | null = null, offset = 0, snapshot?: string) {
    assertScope(scope, this.options.transport.nodeId)
    if (!humanTaskRef(taskRef) || roundId !== null && !plain(roundId, 128) || !revision(offset) || offset > 10000
      || snapshot !== undefined && !recipientSnapshot(snapshot) || offset > 0 && snapshot === undefined)
      throw fail('lifecycle-query-invalid', '成员范围或分页快照无效，请从第一页重新查询')
    const active = this.active(signal)
    const shared = await this.options.workspaceAccess?.(scope, taskRef, active), expectedOrigin = shared?.sourceScope ?? scope
    const result = await this.options.transport.request('lifecycle', { operation: 'recipients', scope: scope.sessionId,
      sessionGeneration: scope.sessionGeneration, taskRef, roundId, offset, ...(snapshot === undefined ? {} : { snapshot }), ...(shared ? { workspaceRef: shared.workspaceRef } : {}) }, active)
    this.options.transport.assertIdentity(); active.throwIfAborted()
    if (!row(result) || !row(result.origin) || result.origin.scope !== expectedOrigin.sessionId || result.origin.sessionGeneration !== expectedOrigin.sessionGeneration)
      throw fail('lifecycle-response-invalid', '成员事实不属于当前会话')
    const { bindingKey } = receiverBinding(result.binding, this.options.transport.nodeId)
    if (result.bindingKey !== bindingKey) throw fail('lifecycle-binding-invalid', '成员事实节点绑定不符')
    return recipientFacts(result, taskRef, roundId, offset, snapshot)
  }
  async prepare(scope: WorkflowScope, taskRef: HumanTaskRef, kind: HumanWorkflowDraftRef['kind'], expectedRevision: number,
    content: Record<string, unknown>, idempotencyKey: string, signal: AbortSignal): Promise<LifecycleDraft> {
    const active = this.active(signal)
    if (!['round', 'review', 'reminder'].includes(kind) || !revision(expectedRevision) || !row(content) || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey))
      throw fail('lifecycle-draft-invalid', '任务方案参数无效')
    bounded(content, HUMAN_ROUND_MAX_BYTES)
    if (!lifecycleCoverValid(kind, content)) throw fail('lifecycle-cover-invalid', '封面仅适用于公开新轮次，不能用于定向轮次、私密反馈或订正')
    if (kind === 'reminder' && !lifecycleReminderContent(content)) throw fail('lifecycle-reminder-invalid', '提醒内容或对象来源无效')
    if (kind === 'reminder' && content.recipientSource === 'exact-references'
      && (content.recipientRefs as HumanRecipientRef[]).some(ref => ref.taskId !== taskRef.taskId || ref.deliveryId !== taskRef.deliveryId))
      throw fail('lifecycle-reminder-invalid', '提醒对象引用不属于此任务')
    if (content.cover !== undefined) {
      if (!this.options.coverAuthority) throw fail('lifecycle-cover-unavailable', '此节点不能核对封面图片来源')
      this.options.coverAuthority(scope, humanCardAsset(content.cover)!)
    }
    const current = await this.get(scope, taskRef, active)
    const submissionForm = kind === 'round' ? content.form : kind === 'review' && row(content.correction) ? content.correction.form : undefined
    if (row(submissionForm) && row(submissionForm.attachment) && submissionForm.attachment.kind === 'file' && !this.fileRegistered.has(String(current.bindingKey)))
      throw fail('receiver-file-unavailable', '接收节点与服务端尚未共同确认文档收件能力')
    if (current.revision !== expectedRevision) throw fail('lifecycle-version-conflict', '任务已变化，请重新查询后准备方案')
    if (kind === 'reminder' && content.recipientSource === 'task-audience') {
      const round = (current.rounds as unknown[]).find(value => row(value) && value.id === content.roundId)
      if (!row(round) || round.recipientRefs !== null)
        throw fail('lifecycle-reminder-invalid', '只能复用此任务公开提交要求的固定指定名单进行提醒')
    }
    const shared = await this.options.workspaceAccess?.(scope, taskRef, active)
    const result = await this.options.transport.request('lifecycle', { operation: `${kind}-draft`, scope: scope.sessionId,
      sessionGeneration: scope.sessionGeneration, taskRef, expectedRevision, content, idempotencyKey, ...(shared ? { workspaceRef: shared.workspaceRef } : {}) }, active)
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
    return { schema: 'human.workflow.preview.v1', ref: copy(ref), taskRef: copy(taskRef),
      revision: page.revision, asOf: page.asOf, draft }
  }
  async publishPrivate(scope: WorkflowScope, taskRef: HumanTaskRef, ref: HumanWorkflowDraftRef, input: PrivatePublishInput, signal: AbortSignal) {
    const active = this.active(signal)
    assertScope(scope, this.options.transport.nodeId)
    if (!humanTaskRef(taskRef) || !humanWorkflowDraftRef(ref) || ref.kind === 'reminder')
      throw fail('private-publication-invalid', '只能更新准确任务的私人反馈或指定对象要求，不能发送群卡或提醒')
    if (!input || !plain(input.inputProof, 512) || !plain(input.inputId, 128) || !plain(input.nativeMessageId, 256)
      || !/^[a-f0-9]{64}$/.test(input.contentDigest) || !/^[A-Za-z0-9:_-]{16,128}$/.test(input.idempotencyKey)
      || typeof input.assertCurrent !== 'function') throw fail('private-input-required', '缺少当前真实对话输入的授权依据；未更新私人页面')
    input.assertCurrent()
    // Do not apply the workspace read-sharing grant to private writes.
    const page = await this.get(scope, taskRef, active, { draftId: ref.draftId }, false)
    input.assertCurrent()
    const draft = (page.drafts as unknown[]).map(lifecycleDraft).find(item => canonicalSubmission(item.draftRef) === canonicalSubmission(ref))
    if (!draft || draft.draftRef.kind === 'reminder' || draft.draftRef.kind === 'round'
      && (!Array.isArray(draft.content.recipientRefs) || !draft.content.recipientRefs.length || draft.content.cover !== undefined || humanRoundIssue(draft.content, 'content', 'round')))
      throw fail('private-publication-invalid', '当前方案不是原会话中准确对象的私人更新；公开内容仍用原操作入口')
    const sameAttempt = (p: PrivatePublicationAttempt) => sameScope(p.scope, scope) && sameTaskRef(p.taskRef, taskRef) && p.draftRef.draftId === ref.draftId
    const inputIdDigest = sha256(input.inputId), nativeMessageDigest = sha256(input.nativeMessageId)
    const checkPrevious = (p?: PrivatePublicationAttempt) => {
      if (!p) return
      if (p.state === 'rejected') {
        if (p.operationId === input.idempotencyKey || p.inputIdDigest === inputIdDigest || p.nativeMessageDigest === nativeMessageDigest)
          throw fail('private-new-input-required', '此前这次更新已被明确拒绝；纠正权限或条件后，须由用户在当前会话重新提出要求，不能自动重试')
      } else throw fail('private-publication-unknown', '此前已尝试更新这份方案；当前尚未核实生效，只能查询原任务，不能再次发布')
    }
    if (draft.state === 'published') {
      if (this.state.current().publications?.some(p => sameAttempt(p) && p.state !== 'published'))
        await this.state.update(next => { const p = next.publications?.find(sameAttempt); if (p) { p.state = 'published'; delete p.rejection; p.updatedAt = (this.options.now ?? Date.now)() } }, active)
      input.assertCurrent(); this.options.transport.assertIdentity(); active.throwIfAborted()
      return { schema: 'human.private.publication.v1', taskRef: copy(taskRef), draftRef: copy(ref),
        state: 'published', effects: draftEffects(draft), alreadyPublished: true }
    }
    checkPrevious(this.state.current().publications?.find(sameAttempt))
    if (draft.approvalStatus !== 'ready' || draft.expiresAt <= (this.options.now ?? Date.now)())
      throw fail('private-draft-not-ready', '私人方案版本已变化、过期或尚未核实；先读取当前任务，不沿用旧请求')
    input.assertCurrent(); active.throwIfAborted()
    // Save intent before mutation. A lost response, process restart or concurrent
    // call can only read the same draft; never replay a possibly completed write.
    // No proof, user text or input lease is persisted. Unresolved attempts are
    // never evicted to make room; only verified published tombstones may expire.
    await this.state.update(next => {
      input.assertCurrent(); this.options.transport.assertIdentity()
      const entries = next.publications ??= []
      const previous = entries.find(sameAttempt); checkPrevious(previous)
      if (previous) entries.splice(entries.indexOf(previous), 1)
      if (entries.length >= PRIVATE_PUBLICATION_LIMIT) {
        const index = entries.findIndex(p => p.state === 'published')
        if (index < 0) throw fail('private-publication-capacity', '待核实的私人更新已达上限；先核对已有结果，不会重复执行')
        entries.splice(index, 1)
      }
      entries.push({ scope: copy(scope), taskRef: copy(taskRef), draftRef: copy(ref), operationId: input.idempotencyKey, inputIdDigest, nativeMessageDigest,
        state: 'attempted', updatedAt: (this.options.now ?? Date.now)() })
    }, active)
    input.assertCurrent(); active.throwIfAborted(); this.options.transport.assertIdentity()
    let result: unknown
    try {
      result = await this.options.transport.request('lifecycle', { operation: 'private-publish', scope: scope.sessionId,
        sessionGeneration: scope.sessionGeneration, taskRef, draftRef: ref, idempotencyKey: input.idempotencyKey,
        inputProof: input.inputProof, inputId: input.inputId, contentDigest: input.contentDigest, nativeMessageId: input.nativeMessageId }, active)
    } catch (error) {
      if (row(error) && typeof error.code === 'string' && Object.hasOwn(PRIVATE_PUBLICATION_REJECTIONS, error.code)
        && error.status === PRIVATE_PUBLICATION_REJECTIONS[error.code]) {
        const code = error.code
        await this.state.update(next => {
          const p = next.publications?.find(sameAttempt)
          if (p?.operationId === input.idempotencyKey) { p.state = 'rejected'; p.rejection = code; p.updatedAt = (this.options.now ?? Date.now)() }
        }, active)
      }
      throw error
    }
    this.options.transport.assertIdentity(); active.throwIfAborted(); input.assertCurrent()
    const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(value)
    if (!row(result) || result.schema !== 'human.private.publication.v1' || result.state !== 'published'
      || !sameTaskRef(humanTaskRef(result.taskRef), taskRef) || canonicalSubmission(result.draftRef) !== canonicalSubmission(ref)
      || result.inputId !== input.inputId || result.nativeMessageId !== input.nativeMessageId || result.operationId !== input.idempotencyKey
      || !row(result.result) || (ref.kind === 'review'
        ? !exact(result.result, ['resultId', 'correctionRoundId']) || !id(result.result.resultId)
          || (draft.content.correction === null ? result.result.correctionRoundId !== null : !id(result.result.correctionRoundId))
        : !exact(result.result, ['roundId']) || !id(result.result.roundId)))
      throw fail('private-publication-unknown', '更新结果尚不能与本次请求核对；请查询原任务，不要重新发布')
    await this.state.update(next => { const p = next.publications?.find(sameAttempt); if (p) { p.state = 'published'; p.updatedAt = (this.options.now ?? Date.now)() } }, active)
    // Re-project only public operation facts, never bearer authority, message
    // content, account binding or an unexpected server field.
    return { schema: 'human.private.publication.v1', taskRef: copy(taskRef), draftRef: copy(ref), state: 'published',
      operationId: input.idempotencyKey, result: copy(result.result), effects: draftEffects({ ...draft, state: 'published' }) }
  }
  private receipt(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, submissionVersion: number) {
    return this.state.current().receipts?.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef)
      && r.submissionId === submissionId && r.submissionVersion === submissionVersion)
  }
  async receiptStatus(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, offset = 0) {
    if (!revision(offset) || offset > 10000) throw fail('lifecycle-query-invalid', '收件分页位置无效')
    const active = this.active(signal), page = await this.get(scope, taskRef, active, { offset, limit: 20 })
    const items = []
    for (const item of page.submissions as Record<string, unknown>[]) {
      if (!plain(item.id, 128) || !version(item.version) || !plain(item.roundId, 128)) throw fail('lifecycle-response-invalid', '收件列表无效')
      const r = this.receipt(scope, taskRef, item.id, item.version)
      let state = item.delivery === 'not-required' ? 'not-required' : item.delivery === 'expired' ? 'blocked' : r?.state ?? 'pending', errorCode = r?.errorCode
      if (item.delivery === 'expired') errorCode = 'submission-expired'
      if (item.delivery === 'received') {
        try {
          const original = await this.options.receiver?.read(scope, item.id, String(page.bindingKey), active)
          if (!original || original.manifest.context.version !== item.version || !sameTaskRef(original.manifest.context.taskRef, taskRef)) throw fail('submission-not-received', '收件不可用')
          state = 'received'; errorCode = undefined
        }
        catch { this.active(active); state = 'blocked'; errorCode = 'submission-not-received' }
      }
      items.push({ submissionId: item.id, submissionVersion: item.version, roundId: item.roundId, state, revision: r?.revision ?? 0,
        ...(errorCode ? { errorCode, message: workflowErrorMessage(errorCode) } : {}), retryable: state === 'blocked' && item.delivery === 'pending' && !!errorCode && receiptRetryableCodes.has(errorCode) })
    }
    return { schema: 'human.workflow.receipts.v1', taskRef: copy(taskRef), asOf: page.asOf, items, nextOffset: page.nextOffset }
  }
  async retryReceipt(scope: WorkflowScope, taskRef: HumanTaskRef, input: { submissionId: string; submissionVersion: number; expectedRevision: number }, signal: AbortSignal) {
    const active = this.active(signal)
    if (!plain(input.submissionId, 128) || !version(input.submissionVersion) || !revision(input.expectedRevision)) throw fail('lifecycle-query-invalid', '收件重试引用无效')
    const page = await this.get(scope, taskRef, active, { submissionId: input.submissionId })
    const item = (page.submissions as Record<string, unknown>[]).find(s => s.id === input.submissionId && s.version === input.submissionVersion)
    if (!item || item.state !== 'accepted' || item.delivery !== 'pending') throw fail('receipt-retry-unavailable', '该提交无需或不能重新申请下载；请核对原始收件')
    return this.state.update(next => {
      this.active(active)
      const r = next.receipts?.find(r => sameScope(r.scope, scope) && sameTaskRef(r.taskRef, taskRef) && r.submissionId === input.submissionId && r.submissionVersion === input.submissionVersion)
      if (!r || r.revision !== input.expectedRevision || r.state !== 'blocked' || !r.errorCode || !receiptRetryableCodes.has(r.errorCode)) throw fail('receipt-version-conflict', '收件状态已变化；请先刷新核对，不会重复申请下载')
      r.requestId = randomBytes(32).toString('hex'); r.revision++; r.state = 'pending'; delete r.errorCode; r.updatedAt = (this.options.now ?? Date.now)()
      return { schema: 'human.workflow.receipt-retry.v1', taskRef: copy(taskRef), submissionId: r.submissionId, submissionVersion: r.submissionVersion, revision: r.revision, state: 'pending' }
    }, active)
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
            if (!plain(item.id, 128) || !version(item.version) || !(item.state === 'accepted' && item.delivery === 'pending' || item.state === 'expired' && item.delivery === 'expired')) continue
            let intent = this.receipt(scope, taskRef, item.id, item.version)
            if (intent?.state === 'blocked') continue
            if (!intent) intent = await this.state.update(next => {
              this.active(active); next.receipts ??= []
              if (next.receipts.length >= 4096) throw fail('lifecycle-capacity', '收件意图已达容量上限，未删除旧记录')
              const r: ReceiptAttempt = { scope: copy(scope), taskRef: copy(taskRef), submissionId: String(item.id), submissionVersion: Number(item.version), revision: 1,
                requestId: sha256(canonicalSubmission([scope, taskRef, item.id])), state: 'pending', updatedAt: now() }
              next.receipts.push(r); return r
            }, active)
            attempts++
            try {
            const claim = (receipt?: unknown) => this.options.transport.request('objects/claim', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration,
              taskRef, submissionId: item.id, requestId: intent!.requestId, ...(receipt ? { receipt } : { receiveFormats: SUBMISSION_RECEIVE_FORMATS }) }, active)
            const recovered = typeof this.options.receiver.recoverReceipt === 'function' && await this.options.receiver.recoverReceipt(scope, taskRef, String(page.bindingKey), item.id, item.version, claim, active)
            if (!recovered) {
              if (item.delivery === 'expired') continue // only durable-original ACK may recover an expired object
              const claimed = await claim()
              if (!row(claimed)) throw fail('receiver-claim-invalid', '收件租约响应无效')
              await this.options.receiver.receive(scope, taskRef, String(page.bindingKey), claimed.delivery, active)
            }
            await this.state.update(next => { const r = next.receipts!.find(r => r.requestId === intent!.requestId)!; r.state = 'received'; r.updatedAt = now() }, active)
            } catch (cause) {
              const code = String((cause as { code?: string })?.code ?? '')
              if (receiptBlockedCodes.has(code)) await this.state.update(next => {
                const r = next.receipts!.find(r => r.requestId === intent!.requestId)!
                r.state = 'blocked'; r.errorCode = code; r.revision++; r.updatedAt = now()
              }, active)
              else throw cause
            }
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
  private async readAttachment(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal) {
    if (!this.options.receiver) throw fail('receiver-unavailable', '此宿主不支持附件接收')
    const page = await this.get(scope, taskRef, signal, { submissionId })
    const item = (page.submissions as Record<string, unknown>[]).find(item => item.id === submissionId)
    if (!item) throw fail('submission-unavailable', '提交不属于此会话任务')
    const originalScope = { ...scope, sessionId: String((page.origin as Record<string, unknown>).scope), sessionGeneration: String((page.origin as Record<string, unknown>).sessionGeneration) }
    const result = await this.options.receiver.read(originalScope, submissionId, String(page.bindingKey), this.active(signal))
    if (!sameTaskRef(result.manifest.context.taskRef, taskRef) || item.id !== result.manifest.context.submissionId
      || item.version !== result.manifest.context.version || item.roundId !== result.manifest.context.roundId
      || item.participantRef !== result.manifest.context.participantRef || !row(item.values)
      || canonicalSubmission(item.values) !== canonicalSubmission(result.manifest.answers))
      throw fail('submission-unavailable', '提交来源、答案或版本已变化')
    return result
  }
  async readImage(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal) {
    const result = await this.readAttachment(scope, taskRef, submissionId, signal)
    const mediaType = result.manifest.file.mediaType
    if (!submissionImageType(mediaType)) throw fail('submission-not-image', '该提交是文档，请使用 human_submission_file 取得文件路径并用宿主文件工具读取')
    return { ...result, manifest: { ...result.manifest, file: { ...result.manifest.file, mediaType } } }
  }
  async exportFile(scope: WorkflowScope, taskRef: HumanTaskRef, submissionId: string, signal: AbortSignal) {
    if (!this.options.receiver) throw fail('receiver-unavailable', '此宿主不支持附件接收')
    const page = await this.get(scope, taskRef, signal, { submissionId })
    const item = (page.submissions as Record<string, unknown>[]).find(item => item.id === submissionId)
    if (!item) throw fail('submission-unavailable', '提交不属于此会话任务')
    const originalScope = { ...scope, sessionId: String((page.origin as Record<string, unknown>).scope), sessionGeneration: String((page.origin as Record<string, unknown>).sessionGeneration) }
    const result = await this.options.receiver.exportFile(originalScope, submissionId, String(page.bindingKey), this.active(signal))
    if (!sameTaskRef(result.manifest.context.taskRef, taskRef) || item.id !== result.manifest.context.submissionId
      || item.version !== result.manifest.context.version || item.roundId !== result.manifest.context.roundId
      || item.participantRef !== result.manifest.context.participantRef || !row(item.values)
      || canonicalSubmission(item.values) !== canonicalSubmission(result.manifest.answers))
      throw fail('submission-unavailable', '提交来源、答案或版本已变化')
    return result
  }
  /** Fresh signed authority for automatic work. This is intentionally not the
   * local replica and not a timestamp supplied by the phone or workstation. */
  async inspectAutomation(scope: WorkflowScope, taskRef: HumanTaskRef, signal: AbortSignal, extra: { offset?: number; submissionId?: string } = {}): Promise<AutomationSnapshot> {
    const page = await this.get(scope, taskRef, signal, { ...extra, limit: 20 })
    if (!revision(page.asOf) || !plain(page.bindingKey, 64)) throw fail('automation-authority-unavailable', '服务端尚不提供新鲜自动处理授权时间')
    const submissions: AutomationSubmission[] = (page.submissions as Record<string, unknown>[]).map(s => {
      if (!plain(s.id, 128) || !plain(s.roundId, 128) || !version(s.version) || !plain(s.state, 32) || !plain(s.delivery, 32)
        || s.acceptedAt !== null && !revision(s.acceptedAt) || !row(s.values)) throw fail('automation-authority-invalid', '提交授权记录无效')
      return copy(s) as unknown as AutomationSubmission
    })
    return { bindingKey: String(page.bindingKey), asOf: page.asOf, revision: Number(page.revision), rounds: copy(page.rounds as Record<string, unknown>[]), submissions,
      participants: (page.participants as Record<string, unknown>[]).filter(p => plain(p.participantRef, 128)).map(p => ({ participantRef: String(p.participantRef) })), nextOffset: page.nextOffset as number | null }
  }
  async readyAutomation(scope: WorkflowScope, taskRef: HumanTaskRef, submission: AutomationSubmission, signal: AbortSignal): Promise<boolean> {
    if (submission.state !== 'accepted') return false
    if (submission.delivery === 'not-required') return true
    if (submission.delivery !== 'received') return false
    const received = await this.readAttachment(scope, taskRef, submission.id, signal)
    if (!submissionImageType(received.manifest.file.mediaType))
      throw fail('automation-document-reading-unavailable', '文档已接收；自动读取和分析尚未接通，请先在会话中查看文件')
    return received.manifest.context.version === submission.version && received.manifest.context.roundId === submission.roundId
  }
  async saveAnalysis(scope: WorkflowScope, taskRef: HumanTaskRef, input: { submissionId: string; submissionVersion: number; expectedRevision: number; text: string }, signal: AbortSignal) {
    const active = this.active(signal)
    if (!plain(input.text, 8000) || !version(input.submissionVersion) || !revision(input.expectedRevision)) throw fail('lifecycle-analysis-invalid', '分析内容或版本无效')
    const page = await this.get(scope, taskRef, active, { submissionId: input.submissionId })
    const submission = (page.submissions as Record<string, unknown>[]).find(item => item.id === input.submissionId && item.version === input.submissionVersion)
    if (!submission) throw fail('submission-unavailable', '分析引用的提交不存在')
    if (submission.delivery !== 'not-required') await this.readAttachment(scope, taskRef, input.submissionId, active)
    return this.state.update(ledger => {
      this.options.transport.assertIdentity()
      const previous = ledger.analyses.find(entry => sameScope(entry.scope, scope) && entry.submissionId === input.submissionId)
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw fail('lifecycle-version-conflict', '分析版本已变化')
      if (!previous && ledger.analyses.length >= 2048) throw fail('lifecycle-capacity', '本地分析和归档已达到 2048 份上限；不会自动删除历史')
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
