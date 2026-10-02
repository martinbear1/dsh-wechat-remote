import { ATTEMPT_ID, HUMAN_ACTION, HUMAN_MEMBERS_ACTION, HUMAN_REMIND_ACTION, HUMAN_WORKFLOW_ACTION, HUMAN_SURFACE_MAX_BYTES, humanWorkflowDraftRef, HUMAN_ID, humanSurface, humanTaskRef,
  humanSelectionRef, humanMemberRefs, humanReminderTitle, humanReceiptData, sameTaskRef, sameSelectionRef, object, text,
  type HumanAckRequest, type HumanAckWireRequest, type HumanActionRequest, type HumanReceipt, type HumanSurface, type HumanTaskRef, type HumanWorkflowDraftRef } from './protocol.js'
import { humanInitialRound, type HumanInitialRound } from './form.js'
import { humanCardAsset, type HumanCardAsset } from './card-cover.js'

/** Business core has no DSH, Cordis, WeChat, network or filesystem dependency. */
export interface HumanOrigin {
  readonly scope: string
  /** Adapter-owned durable session generation; protects a reused display/id slot. */
  readonly generation: string
  readonly callId: string
  readonly rootCallId: string
}
interface Attempt { id: string; receipt?: HumanReceipt }
export interface HumanRecord {
  surface: HumanSurface; origin: HumanOrigin; createdAt: number; attempts: Attempt[]
}
export interface HumanLedger { schemaVersion: 1; records: HumanRecord[] }
export interface HumanStore { load(): Promise<unknown>; save(ledger: HumanLedger): Promise<void> }
export const HUMAN_MAX_RECORDS = 128
export const HUMAN_RETENTION_MS = 7 * 24 * 60 * 60_000
export const HUMAN_CONTEXT_LIMIT = 8
const MAX_ATTEMPTS = 4
const error = (code: string, message: string) => Object.assign(new Error(message), { code })
const clone = <T>(value: T): T => structuredClone(value)
function assertSurfaceBudget(surface: HumanSurface): void {
  // Validated data-only surfaces contain safe integers. Canonical key sorting
  // changes ordering, not UTF-8 size. Do not tighten durable ledger parsing:
  // historical oversized cards remain readable without disabling other cards.
  if (Buffer.byteLength(JSON.stringify(surface)) > HUMAN_SURFACE_MAX_BYTES)
    throw error('human-surface-too-large', '任务卡片总内容过大，请缩短说明、表单标签或选项后重新生成；未发起分享')
}
function validOrigin(origin: unknown): origin is HumanOrigin {
  return object(origin) && text(origin.scope, 256) && text(origin.generation, 80) && text(origin.callId, 256) && text(origin.rootCallId, 256)
}
function validateLedger(value: unknown): HumanLedger {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > HUMAN_MAX_RECORDS)
    throw error('human-store-invalid', '测试卡片存储格式不受支持')
  const ids = new Set<string>()
  for (const record of value.records) {
    if (!object(record) || !humanSurface(record.surface) || !validOrigin(record.origin)
      || !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 0
      || !Array.isArray(record.attempts) || record.attempts.length > MAX_ATTEMPTS)
      throw error('human-store-invalid', '测试卡片记录无效')
    const surface = record.surface as HumanSurface
    if (ids.has(surface.id)) throw error('human-store-invalid', '测试卡片标识重复')
    ids.add(surface.id)
    const attempts = new Set<string>()
    for (const attempt of record.attempts) {
      if (!object(attempt) || typeof attempt.id !== 'string' || !ATTEMPT_ID.test(attempt.id) || attempts.has(attempt.id))
        throw error('human-store-invalid', '测试卡片动作无效')
      attempts.add(attempt.id)
      const receipt = attempt.receipt
      if (receipt !== undefined && (!object(receipt) || receipt.schema !== 'human.action.receipt.v1'
        || receipt.surfaceId !== surface.id || receipt.attemptId !== attempt.id
        || typeof receipt.receiptId !== 'string' || !HUMAN_ID.test(receipt.receiptId)
        || !['success', 'cancelled', 'failed', 'unknown'].includes(String(receipt.outcome))
        || !humanReceiptData(surface, receipt)
        || !['recorded', 'pending', 'dispatching', 'queued', 'uncertain'].includes(String(receipt.delivery))))
        throw error('human-store-invalid', '测试卡片回执无效')
    }
  }
  return clone(value) as unknown as HumanLedger
}

export class HumanToolsCore {
  private ledger: HumanLedger = { schemaVersion: 1, records: [] }
  private tail: Promise<unknown> = Promise.resolve()
  private stopped = false
  private constructor(private store: HumanStore, private randomId: () => string, private now: () => number,
    private coverAuthority?: (origin: HumanOrigin, asset: HumanCardAsset) => void) {}
  static async open(store: HumanStore, randomId: () => string, now = Date.now, coverAuthority?: (origin: HumanOrigin, asset: HumanCardAsset) => void): Promise<HumanToolsCore> {
    const core = new HumanToolsCore(store, randomId, now, coverAuthority)
    core.ledger = validateLedger(await store.load())
    return core
  }
  /** Stop admission immediately; callers must await the already-started write
   * before another instance opens this ledger during a plugin reload. */
  close(): Promise<void> { this.stopped = true; return this.tail.then(() => {}) }
  private available(): void { if (this.stopped) throw error('human-tools-disabled', '测试卡片功能已关闭') }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => { this.available(); return work() })
    this.tail = result.catch(() => {})
    return result
  }
  private async commit(next: HumanLedger): Promise<void> {
    this.available()
    try { await this.store.save(next) }
    catch (cause) { this.stopped = true; throw cause }
    this.ledger = next
    // A completed write stays durable even when disposal happened during I/O,
    // but that disposed caller must not receive a fresh execution permission.
    this.available()
  }
  private record(ledger: HumanLedger, scope: string, surfaceId: string): HumanRecord {
    if (!text(scope, 256) || typeof surfaceId !== 'string' || !HUMAN_ID.test(surfaceId)) throw error('human-action-invalid', '卡片参数无效')
    const record = ledger.records.find(row => row.surface.id === surfaceId && row.origin.scope === scope)
    if (!record || record.createdAt + HUMAN_RETENTION_MS <= this.now()) throw error('human-surface-unavailable', '测试卡片已过期或不属于此会话')
    return record
  }
  private request(ledger: HumanLedger, request: HumanActionRequest): HumanRecord {
    if (!object(request) || request.revision !== 1
      || typeof request.attemptId !== 'string' || !ATTEMPT_ID.test(request.attemptId)) throw error('human-action-invalid', '卡片动作版本或参数无效')
    const record = this.record(ledger, request.scope, request.surfaceId)
    if (request.actionId !== record.surface.actions[0].id) throw error('human-action-invalid', '卡片动作与已保存记录不符')
    return record
  }
  /** Adapter check only: generation comes from the actual host, never the RPC.
   * Delayed ACKs may still reconcile their old ledger without waking an Agent. */
  assertGeneration(scope: string, surfaceId: string, generation: string): void {
    this.available()
    if (this.record(this.ledger, scope, surfaceId).origin.generation !== generation)
      throw error('human-origin-conflict', '会话身份已变化，不能打开旧测试卡片')
  }
  /** Re-sign only a persisted claim, including receipt reconciliation. This
   * never claims, executes, retries or replaces an action by itself. */
  grantSource(request: HumanActionRequest): { surface: HumanSurface; origin: HumanOrigin } {
    this.available()
    const record = this.request(this.ledger, request)
    if (!record.attempts.some(attempt => attempt.id === request.attemptId))
      throw error('human-action-not-claimed', '请先批准原卡片动作')
    assertSurfaceBudget(record.surface)
    if (record.surface.cover) this.cover(record.surface.cover, record.origin)
    return { surface: clone(record.surface), origin: clone(record.origin) }
  }
  create(origin: HumanOrigin, title: string, body: string, signal: AbortSignal, sourceSurfaceId?: string, cover?: HumanCardAsset): Promise<HumanSurface> {
    return this.createAction(origin, signal, () => ({ title, body,
      ...(cover === undefined ? {} : { cover: this.cover(cover, origin) }),
      ...(sourceSurfaceId !== undefined ? { targetTaskRef: this.publishedSource(origin, sourceSurfaceId).taskRef } : {}), actions: [{ ...HUMAN_ACTION }] }))
  }
  createCollection(origin: HumanOrigin, title: string, body: string, initialRound: HumanInitialRound, signal: AbortSignal, sourceSurfaceId?: string, cover?: HumanCardAsset): Promise<HumanSurface> {
    return this.createAction(origin, signal, () => {
      if (!humanInitialRound(initialRound)) throw error('human-surface-invalid', '首轮收集表单无效')
      return { title, body, initialRound: clone(initialRound), actions: [{ ...HUMAN_ACTION }],
        ...(cover === undefined ? {} : { cover: this.cover(cover, origin) }),
        ...(sourceSurfaceId === undefined ? {} : { targetTaskRef: this.publishedSource(origin, sourceSurfaceId).taskRef }) }
    })
  }
  private cover(value: unknown, origin: HumanOrigin): HumanCardAsset {
    const cover = humanCardAsset(value)
    if (!cover || !this.coverAuthority) throw error('human-cover-invalid', '请先准备当前会话的公开封面图片')
    this.coverAuthority(origin, cover)
    return cover
  }
  /** Internal caller has already obtained a cloud-validated draft scoped to
   * this origin. The Surface stores only its immutable locator, never private
   * evaluation text. Claiming this button is NOT approving/publishing it. */
  createWorkflow(origin: HumanOrigin, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef, signal: AbortSignal): Promise<HumanSurface> {
    return this.createAction(origin, signal, () => {
      if (!humanTaskRef(taskRef) || !humanWorkflowDraftRef(draftRef)) throw error('human-surface-invalid', '工作流草稿引用无效')
      return { title: draftRef.kind === 'round' ? '审核新一轮任务' : draftRef.kind === 'review' ? '审核个人反馈' : '审核任务提醒',
        body: '方案尚未批准。请打开主人审核页核对准确内容、对象与版本后决定；此按钮本身不会发群消息。',
        targetTaskRef: clone(taskRef), workflowRef: clone(draftRef), actions: [{ ...HUMAN_WORKFLOW_ACTION }] }
    })
  }
  private source(origin: HumanOrigin, sourceSurfaceId: string, actionId: string): HumanRecord {
    const source = this.record(this.ledger, origin.scope, sourceSurfaceId)
    if (source.origin.generation !== origin.generation) throw error('human-origin-conflict', '会话身份已变化，不能复用旧卡片')
    if (source.surface.actions[0].id !== actionId) throw error('human-source-unavailable', '来源卡片类型不符')
    return source
  }
  private publishedSource(origin: HumanOrigin, sourceSurfaceId: string): { record: HumanRecord; taskRef: HumanTaskRef } {
    const record = this.source(origin, sourceSurfaceId, 'share')
    const taskRef = record.attempts.slice().reverse().find(attempt => attempt.receipt?.outcome === 'success' && attempt.receipt.taskRef)?.receipt?.taskRef
    if (!taskRef) throw error('human-source-unavailable', '此卡片尚无可复用的成功发布记录')
    return { record, taskRef: clone(taskRef) }
  }
  createMembers(origin: HumanOrigin, sourceSurfaceId: string, signal: AbortSignal): Promise<HumanSurface> {
    return this.createAction(origin, signal, () => {
      const { record, taskRef } = this.publishedSource(origin, sourceSurfaceId)
      return { title: record.surface.title, body: `为任务“${record.surface.title}”选择提醒成员。仅用于之后经主人批准的提醒，不授予私密内容或电脑访问权限。\n任务说明：${record.surface.body}`.slice(0, 1000),
        targetTaskRef: taskRef, actions: [{ ...HUMAN_MEMBERS_ACTION }] }
    })
  }
  createReminder(origin: HumanOrigin, sourceSurfaceId: string, title: string, signal: AbortSignal, memberRefs?: readonly string[]): Promise<HumanSurface> {
    return this.createAction(origin, signal, () => {
      if (!humanReminderTitle(title) || memberRefs !== undefined && !humanMemberRefs(memberRefs)) throw error('human-surface-invalid', '提醒标题或成员范围无效')
      const source = this.source(origin, sourceSurfaceId, 'select-members')
      const selected = source.attempts.slice().reverse().find(attempt => attempt.receipt?.outcome === 'success' && attempt.receipt.selectionRef)?.receipt?.selectionRef
      if (!selected) throw error('human-source-unavailable', '此卡片尚无明确选择成员的成功记录')
      // Until the UI can show a trustworthy named subset approval, only the
      // owner's entire native selection is executable. Preserve its ordering.
      if (memberRefs !== undefined && (memberRefs.length !== selected.memberRefs.length || memberRefs.some(id => !selected.memberRefs.includes(id))))
        throw error('human-members-invalid', '只能提醒本任务已选定的全部成员；如需更小范围，请先重新选择成员')
      const selectionRef = clone(selected)
      return { title: source.surface.title, body: `提醒内容：${title}\n提醒范围：你已为本任务选定的全部${selectionRef.memberRefs.length}位成员中尚未确认者。\n点击可能直接发送，不保证另有微信确认。若只提醒其中一部分，请先重新选择成员；不会自动重试。`,
        targetTaskRef: { schema: 'human.task.ref.v1', taskId: selected.taskId, deliveryId: selected.deliveryId },
        selectionRef, reminder: { title, type: 'complete' }, actions: [{ ...HUMAN_REMIND_ACTION }] }
    })
  }
  private createAction(origin: HumanOrigin, signal: AbortSignal, prepare: () => Omit<HumanSurface, 'schemaVersion' | 'kind' | 'id' | 'revision'>): Promise<HumanSurface> {
    return this.serial(async () => {
      signal.throwIfAborted()
      if (!validOrigin(origin)) throw error('human-surface-invalid', '卡片会话身份无效')
      const prepared = prepare()
      if (!text(prepared.title, 80) || !text(prepared.body, 1000)) throw error('human-surface-invalid', '卡片名称或说明无效')
      // One surface per root invocation also covers native Code Mode subcalls.
      const existing = this.ledger.records.find(row => row.origin.scope === origin.scope && row.origin.rootCallId === origin.rootCallId)
      if (existing && existing.origin.generation !== origin.generation)
        throw error('human-origin-conflict', '会话身份已变化，不能复用旧测试卡片')
      if (existing && (!sameTaskRef(existing.surface.targetTaskRef, prepared.targetTaskRef)
        || existing.surface.actions[0].id !== prepared.actions[0].id
        || !sameSelectionRef(existing.surface.selectionRef, prepared.selectionRef)
        || existing.surface.reminder?.title !== prepared.reminder?.title))
        throw error('human-target-conflict', '此工具调用已有不同目标或动作，未覆盖原卡片')
      if (existing && JSON.stringify(existing.surface.workflowRef) !== JSON.stringify(prepared.workflowRef))
        throw error('human-target-conflict', '此工具调用已有不同工作流草稿，未覆盖原审核卡')
      if (existing && JSON.stringify(existing.surface.initialRound) !== JSON.stringify(prepared.initialRound))
        throw error('human-target-conflict', '此工具调用已有不同首轮表单，未覆盖原卡')
      if (existing && JSON.stringify(humanCardAsset(existing.surface.cover)) !== JSON.stringify(prepared.cover))
        throw error('human-target-conflict', '此工具调用已有不同封面，未覆盖原卡；请重新生成并批准')
      if (existing) return clone(this.record(this.ledger, origin.scope, existing.surface.id).surface)
      const next = clone(this.ledger)
      next.records = next.records.filter(row => row.createdAt + HUMAN_RETENTION_MS > this.now())
      if (next.records.length >= HUMAN_MAX_RECORDS) throw error('human-surface-capacity', '测试卡片数量已达上限，请等待旧卡片过期')
      const surface: HumanSurface = { schemaVersion: 1, kind: 'human.surface', id: this.randomId(), revision: 1, ...clone(prepared) }
      if (!humanSurface(surface) || next.records.some(row => row.surface.id === surface.id)) throw error('human-id-invalid', '卡片标识生成失败')
      assertSurfaceBudget(surface)
      next.records.push({ surface, origin: clone(origin), createdAt: this.now(), attempts: [] })
      signal.throwIfAborted()
      await this.commit(next)
      return clone(surface)
    })
  }
  /** Read-only host presentation. Never trust model text or another tool's metadata. */
  forResult(scope: string, callId: string, generation?: string): HumanSurface | undefined {
    if (this.stopped) return
    const record = this.ledger.records.find(row => row.origin.scope === scope && row.origin.rootCallId === callId)
    return record && (generation === undefined || record.origin.generation === generation)
      && record.createdAt + HUMAN_RETENTION_MS > this.now() ? clone(record.surface) : undefined
  }
  /** Latest receipt per surface from authoritative state, not user/model text.
   * Bounded, read-only and generation-scoped: prompt assembly performs no I/O,
   * writes, queue operations or model wakeup. No titles/bodies are included. */
  contextSnapshot(scope: string, generation: string): HumanReceipt[] {
    if (this.stopped || !text(scope, 256) || !text(generation, 80)) return []
    return this.ledger.records.filter(row => row.origin.scope === scope && row.origin.generation === generation
      && row.createdAt + HUMAN_RETENTION_MS > this.now())
      .map(row => row.attempts.slice().reverse().find(attempt => attempt.receipt)?.receipt)
      .filter((receipt): receipt is HumanReceipt => Boolean(receipt))
      .slice(-HUMAN_CONTEXT_LIMIT).map(clone)
  }
  claim(request: HumanActionRequest, signal: AbortSignal): Promise<unknown> {
    return this.serial(async () => {
      signal.throwIfAborted()
      const next = clone(this.ledger), record = this.request(next, request)
      if (!record.attempts.some(attempt => attempt.id === request.attemptId)) {
        if (record.attempts.some(attempt => !attempt.receipt)) throw error('human-action-in-progress', '已有分享操作待确认，请先返回原页面')
        if (record.attempts.length >= MAX_ATTEMPTS) throw error('human-action-capacity', '此测试卡片已达到操作次数上限')
        record.attempts.push({ id: request.attemptId })
        await this.commit(next)
      }
      return { schema: 'human.action.claim.v1', surface: clone(record.surface), attemptId: request.attemptId, action: { ...record.surface.actions[0] } }
    })
  }
  ack(request: HumanAckRequest | HumanAckWireRequest, signal: AbortSignal): Promise<HumanReceipt> {
    return this.serial(async () => {
      signal.throwIfAborted()
      if (!['success', 'cancelled', 'failed', 'unknown'].includes(request?.outcome)) throw error('human-action-invalid', '分享回执状态无效')
      const taskRef = humanTaskRef(request.taskRef)
      const next = clone(this.ledger), record = this.request(next, request)
      if (!humanReceiptData(record.surface, request as unknown as Record<string, unknown>))
        throw error('human-action-invalid', '回执引用或原因与已保存动作不符')
      const selectionRef = humanSelectionRef(request.selectionRef), reason = request.reason as 'no_pending_members' | undefined
      const attempt = record.attempts.find(row => row.id === request.attemptId)
      if (!attempt) throw error('human-action-not-claimed', '请先打开此卡片的分享操作')
      if (attempt.receipt && (attempt.receipt.outcome !== request.outcome || !sameTaskRef(attempt.receipt.taskRef, taskRef)
        || !sameSelectionRef(attempt.receipt.selectionRef, selectionRef) || attempt.receipt.reason !== reason))
        throw error('human-receipt-conflict', '此操作已有不同回执，未覆盖原记录')
      if (!attempt.receipt) {
        attempt.receipt = { schema: 'human.action.receipt.v1', surfaceId: request.surfaceId, attemptId: request.attemptId,
          receiptId: this.randomId(), outcome: request.outcome, delivery: 'recorded', ...(taskRef ? { taskRef: clone(taskRef) } : {}),
          ...(selectionRef ? { selectionRef: clone(selectionRef) } : {}), ...(reason ? { reason } : {}) }
      } else if (attempt.receipt.delivery === 'pending') {
        // COMPAT(human-inbox-m0): an old not-yet-delivered receipt can now be
        // finalized without requiring a live Agent. Never append/replay Inbox.
        attempt.receipt = { ...attempt.receipt, delivery: 'recorded' }
      } else {
        // Legacy dispatch ambiguity remains inspectable, but never triggers send.
        return { ...clone(attempt.receipt), delivery: attempt.receipt.delivery === 'dispatching' ? 'uncertain' : attempt.receipt.delivery }
      }
      // Last changed receipt first in recency, without another timestamp/index
      // or altering expiry. A fresh ACK for an old card must not be omitted by
      // the bounded context. Duplicate ACKs do not reorder or rewrite state.
      next.records.splice(next.records.indexOf(record), 1)
      next.records.push(record)
      await this.commit(next)
      return clone(attempt.receipt)
    })
  }
  status(scope: string, surfaceId: string): unknown {
    this.available()
    const record = this.record(this.ledger, scope, surfaceId)
    return { schema: 'human.surface.status.v1', surface: clone(record.surface), receipts: record.attempts
      .filter(attempt => attempt.receipt).map(attempt => ({ ...clone(attempt.receipt!),
        delivery: attempt.receipt!.delivery === 'dispatching' ? 'uncertain' : attempt.receipt!.delivery })) }
  }
}
