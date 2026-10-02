/** Agent-neutral, executable-code-free wire contract. No host/session authority is public. */
export interface HumanSurface {
  readonly schemaVersion: 1
  readonly kind: 'human.surface'
  readonly id: string
  readonly revision: 1
  readonly title: string
  readonly body: string
  /** Business locator only; never grants group identity or permission. */
  readonly targetTaskRef?: HumanTaskRef
  readonly selectionRef?: HumanSelectionRef
  readonly reminder?: { readonly title: string; readonly type: 'complete' }
  readonly actions: readonly [HumanAction]
}
export type HumanAction = { readonly id: 'share'; readonly type: 'wechat.share'; readonly label: '发送群卡' | '发送测试卡片' }
  | { readonly id: 'select-members'; readonly type: 'wechat.select-members'; readonly label: '选择任务成员' }
  | { readonly id: 'remind'; readonly type: 'wechat.remind'; readonly label: '提醒已选未完成人员' }
export type HumanOutcome = 'success' | 'cancelled' | 'failed' | 'unknown'
export interface HumanActionRequest {
  readonly scope: string
  readonly surfaceId: string
  readonly revision: number
  readonly actionId: string
  readonly attemptId: string
}
export interface HumanTaskRef {
  readonly schema: 'human.task.ref.v1'
  readonly taskId: string
  readonly deliveryId: string
}
export interface HumanSelectionRef {
  readonly schema: 'human.members.ref.v1'
  readonly taskId: string
  readonly deliveryId: string
  readonly revision: number
  readonly memberRefs: readonly string[]
}
export interface HumanAckRequest extends HumanActionRequest {
  readonly outcome: HumanOutcome; readonly taskRef?: HumanTaskRef; readonly selectionRef?: HumanSelectionRef
  readonly reason?: 'no_pending_members'
}
/** Keep the untrusted nested value intact across generated RPC codecs so the
 * core can reject extra identity/credential fields instead of stripping them. */
export interface HumanAckWireRequest extends HumanActionRequest {
  readonly outcome: HumanOutcome; readonly taskRef?: Readonly<Record<string, string>>
  readonly selectionRef?: Readonly<Record<string, string | number | readonly string[]>>
  readonly reason?: string
}
export interface HumanReceipt {
  readonly schema: 'human.action.receipt.v1'
  readonly surfaceId: string
  readonly attemptId: string
  readonly receiptId: string
  readonly outcome: HumanOutcome
  readonly taskRef?: HumanTaskRef
  readonly selectionRef?: HumanSelectionRef
  readonly reason?: 'no_pending_members'
  /** recorded means durable plugin state, not a message queued for another turn.
   * COMPAT(human-inbox-m0): legacy values remain readable until Inbox-based
   * research ledgers/clients have retired; never replay them into DSH Inbox. */
  readonly delivery: 'recorded' | 'pending' | 'dispatching' | 'queued' | 'uncertain'
}
export const HUMAN_TOOL_NAME = 'human_surface_share'
export const HUMAN_MEMBERS_TOOL_NAME = 'human_task_select_members'
export const HUMAN_REMIND_TOOL_NAME = 'human_task_remind'
export const HUMAN_ACTION = Object.freeze({ id: 'share', type: 'wechat.share', label: '发送群卡' } as const)
export const HUMAN_MEMBERS_ACTION = Object.freeze({ id: 'select-members', type: 'wechat.select-members', label: '选择任务成员' } as const)
export const HUMAN_REMIND_ACTION = Object.freeze({ id: 'remind', type: 'wechat.remind', label: '提醒已选未完成人员' } as const)
export const HUMAN_ID = /^[a-f0-9]{32}$/
export const ATTEMPT_ID = /^[A-Za-z0-9_-]{16,80}$/
export const TASK_REF_ID = /^[A-Za-z0-9_-]{24,64}(?![\s\S])/
export function humanTaskRef(value: unknown): HumanTaskRef | undefined {
  return object(value) && exactKeys(value, ['schema', 'taskId', 'deliveryId']) && value.schema === 'human.task.ref.v1'
    && typeof value.taskId === 'string' && TASK_REF_ID.test(value.taskId)
    && typeof value.deliveryId === 'string' && TASK_REF_ID.test(value.deliveryId) ? value as unknown as HumanTaskRef : undefined
}
export function sameTaskRef(a: HumanTaskRef | undefined, b: HumanTaskRef | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.taskId === b.taskId && a.deliveryId === b.deliveryId
}
export function humanMemberRefs(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && new Set(value).size === value.length
    && [...value].every(id => typeof id === 'string' && TASK_REF_ID.test(id))
}
export function humanSelectionRef(value: unknown): HumanSelectionRef | undefined {
  return object(value) && exactKeys(value, ['schema', 'taskId', 'deliveryId', 'revision', 'memberRefs'])
    && value.schema === 'human.members.ref.v1' && typeof value.taskId === 'string' && TASK_REF_ID.test(value.taskId)
    && typeof value.deliveryId === 'string' && TASK_REF_ID.test(value.deliveryId)
    && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && humanMemberRefs(value.memberRefs)
    ? value as unknown as HumanSelectionRef : undefined
}
export function sameSelectionRef(a: HumanSelectionRef | undefined, b: HumanSelectionRef | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.taskId === b.taskId && a.deliveryId === b.deliveryId
    && a.revision === b.revision && a.memberRefs.length === b.memberRefs.length && a.memberRefs.every((id, i) => id === b.memberRefs[i])
}
export function humanReminderTitle(value: unknown): value is string {
  return typeof value === 'string' && /^[\u4e00-\u9fa5A-Za-z0-9]+(?![\s\S])/.test(value)
    && [...value].reduce((count, char) => count + (/[\u4e00-\u9fa5]/.test(char) ? 2 : 1), 0) <= 30
}
/** Strict action-specific receipt data, shared by wire validation and durable reload. */
export function humanReceiptData(surface: HumanSurface, value: Record<string, unknown>): boolean {
  const action = surface.actions[0].id
  if (Object.hasOwn(value, 'taskRef') && (action !== 'share' || value.outcome !== 'success' || !humanTaskRef(value.taskRef))) return false
  if (Object.hasOwn(value, 'selectionRef')) {
    const selection = humanSelectionRef(value.selectionRef), target = surface.targetTaskRef
    if (action !== 'select-members' || value.outcome !== 'success' || !selection || !target
      || selection.taskId !== target.taskId || selection.deliveryId !== target.deliveryId) return false
  }
  return !Object.hasOwn(value, 'reason') || action === 'remind' && value.outcome === 'cancelled' && value.reason === 'no_pending_members'
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
}
export function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
/** Reject rather than coerce newer schemas, hidden fields, arbitrary routes and actions. */
export function humanSurface(value: unknown): HumanSurface | undefined {
  if (!object(value) || !exactKeys(value, ['schemaVersion', 'kind', 'id', 'revision', 'title', 'body', 'actions',
    ...['targetTaskRef', 'selectionRef', 'reminder'].filter(key => Object.hasOwn(value, key))])
    || Object.hasOwn(value, 'targetTaskRef') && !humanTaskRef(value.targetTaskRef)
    || value.schemaVersion !== 1 || value.kind !== 'human.surface' || value.revision !== 1
    || typeof value.id !== 'string' || !HUMAN_ID.test(value.id) || !text(value.title, 80) || !text(value.body, 1000)
    || !Array.isArray(value.actions) || value.actions.length !== 1) return
  const action = value.actions[0]
  if (!object(action) || !exactKeys(action, ['id', 'type', 'label'])) return
  const share = action.id === HUMAN_ACTION.id && action.type === HUMAN_ACTION.type && [HUMAN_ACTION.label, '发送测试卡片'].includes(action.label as string)
  const members = action.id === HUMAN_MEMBERS_ACTION.id && action.type === HUMAN_MEMBERS_ACTION.type && action.label === HUMAN_MEMBERS_ACTION.label
  const remind = action.id === HUMAN_REMIND_ACTION.id && action.type === HUMAN_REMIND_ACTION.type && action.label === HUMAN_REMIND_ACTION.label
  if (!share && !members && !remind || !share && !value.targetTaskRef) return
  if (!remind && (Object.hasOwn(value, 'selectionRef') || Object.hasOwn(value, 'reminder'))) return
  const selection = humanSelectionRef(value.selectionRef), target = humanTaskRef(value.targetTaskRef)
  if (remind && (!selection || !target || selection.taskId !== target.taskId || selection.deliveryId !== target.deliveryId
    || !object(value.reminder) || !exactKeys(value.reminder, ['title', 'type']) || value.reminder.type !== 'complete'
    || !humanReminderTitle(value.reminder.title))) return
  // COMPAT(rc13-test-label): retain existing research Surface revisions. Remove
  // the old label after rc.13 ledgers/cards expire; no second execution route.
  return { schemaVersion: 1, kind: 'human.surface', id: value.id, revision: 1, title: value.title,
    body: value.body, ...(value.targetTaskRef ? { targetTaskRef: { ...humanTaskRef(value.targetTaskRef)! } } : {}),
    ...(remind ? { selectionRef: { ...selection!, memberRefs: [...selection!.memberRefs] }, reminder: { title: (value.reminder as { title: string }).title, type: 'complete' as const } } : {}),
    actions: [{ ...action } as HumanAction] }
}
