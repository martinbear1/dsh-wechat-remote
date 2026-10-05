/** Agent-neutral, executable-code-free wire contract. No host/session authority is public. */
import { humanInitialRound, type HumanInitialRound } from './form.js'
import { humanCardAsset, type HumanCardAsset } from './card-cover.js'
import { humanWorkflowInlinePreview, type HumanWorkflowInlinePreview } from '../human-workflow/inline-preview.js'
export { humanWorkflowInlinePreview, type HumanWorkflowInlinePreview } from '../human-workflow/inline-preview.js'
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
  readonly workflowRef?: HumanWorkflowDraftRef
  /** Public reminder intent shown inline; never a native grant or send receipt. */
  readonly reminderPreview?: HumanReminderPreview
  readonly workflowPreview?: HumanWorkflowInlinePreview
  readonly reshare?: { readonly roundId: string | null }
  readonly initialRound?: HumanInitialRound
  readonly cover?: HumanCardAsset
  readonly actions: readonly [HumanAction]
}
export type HumanAction = { readonly id: 'share'; readonly type: 'wechat.share'; readonly label: '发送群卡' | '发送测试卡片' }
  | { readonly id: 'reshare'; readonly type: 'wechat.reshare'; readonly label: '再次发送原任务' }
  | { readonly id: 'select-members'; readonly type: 'wechat.select-members'; readonly label: '选择任务成员' }
  | { readonly id: 'remind'; readonly type: 'wechat.remind'; readonly label: '提醒已选未完成人员' }
  | { readonly id: 'workflow-approve'; readonly type: 'workflow.approve'; readonly label: '审核任务方案' }
export interface HumanWorkflowDraftRef {
  readonly schema: 'human.lifecycle.draft.ref.v1'; readonly draftId: string; readonly version: 1
  readonly digest: string; readonly kind: 'round' | 'review' | 'reminder'
}
export interface HumanReminderPreview {
  readonly schema: 'human.reminder.preview.v1'
  readonly title: string
  readonly taskTitle: string
  readonly condition: 'pending-submission' | 'result-published' | 'none'
  readonly recipientSource: 'observed' | 'task-audience' | 'selected-members' | 'exact-references'
  readonly recipientCount: number | null
  readonly type: 'complete' | 'participate'
}
export function humanReminderPreview(value: unknown): HumanReminderPreview | undefined {
  if (!object(value) || !exactKeys(value, ['schema', 'title', 'taskTitle', 'condition', 'recipientSource', 'recipientCount', 'type'])
    || value.schema !== 'human.reminder.preview.v1' || !humanReminderTitle(value.title) || !text(value.taskTitle, 80)
    || !['complete', 'participate'].includes(String(value.type))
    || !['pending-submission', 'result-published', 'none'].includes(String(value.condition))
    || !['observed', 'task-audience', 'selected-members', 'exact-references'].includes(String(value.recipientSource))
    || (value.recipientSource === 'exact-references' ? value.condition !== 'none'
      : value.condition === 'none' || value.type !== 'complete' || value.recipientSource !== 'observed' && value.condition !== 'pending-submission')
    || (value.recipientSource === 'task-audience' ? value.recipientCount !== null
      : !Number.isSafeInteger(value.recipientCount) || Number(value.recipientCount) < 1 || Number(value.recipientCount) > 20)) return
  return { schema: 'human.reminder.preview.v1', title: value.title, taskTitle: value.taskTitle,
    condition: value.condition as HumanReminderPreview['condition'], recipientSource: value.recipientSource as HumanReminderPreview['recipientSource'],
    recipientCount: value.recipientCount as number | null, type: value.type as HumanReminderPreview['type'] }
}
export interface HumanRecipientRef {
  readonly schema: 'human.recipient.ref.v1'; readonly taskId: string; readonly deliveryId: string
  readonly source: 'observed' | 'selection' | 'audience'; readonly ref: string; readonly revision: number
}
export function humanRecipientRef(value: unknown): HumanRecipientRef | undefined {
  if (!object(value) || !exactKeys(value, ['schema', 'taskId', 'deliveryId', 'source', 'ref', 'revision'])
    || value.schema !== 'human.recipient.ref.v1' || !humanTaskRef({ schema: 'human.task.ref.v1', taskId: value.taskId, deliveryId: value.deliveryId })
    || !['observed', 'selection', 'audience'].includes(String(value.source)) || typeof value.ref !== 'string' || !TASK_REF_ID.test(value.ref)
    || (value.source === 'selection' ? !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 : value.revision !== 0)) return
  return { schema: 'human.recipient.ref.v1', taskId: value.taskId as string, deliveryId: value.deliveryId as string,
    source: value.source as HumanRecipientRef['source'], ref: value.ref, revision: value.revision as number }
}
export type HumanOutcome = 'success' | 'cancelled' | 'failed' | 'unknown'
/** Bounded client diagnostics, not provider messages, identities or capability grants. */
export const HUMAN_ACTION_FAILURE_REASONS = Object.freeze([
  'native_unavailable', 'member_preview_unavailable', 'reminder_mismatch', 'lease_expiry_missing',
  'action_preparation_failed', 'native_gesture_required', 'native_call_failed', 'result_capacity', 'group_identity_unavailable',
] as const)
export type HumanActionFailureReason = typeof HUMAN_ACTION_FAILURE_REASONS[number]
export type HumanReceiptReason = 'no_pending_members' | HumanActionFailureReason
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
  readonly reason?: HumanReceiptReason
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
  readonly reason?: HumanReceiptReason
  /** recorded means durable plugin state, not a message queued for another turn.
   * COMPAT(human-inbox-m0): legacy values remain readable until Inbox-based
   * research ledgers/clients have retired; never replay them into DSH Inbox. */
  readonly delivery: 'recorded' | 'pending' | 'dispatching' | 'queued' | 'uncertain'
}
export const HUMAN_TOOL_NAME = 'human_surface_share'
export { HUMAN_SURFACE_MAX_BYTES } from './capacity.js'
export const HUMAN_MEMBERS_TOOL_NAME = 'human_task_select_members'
export const HUMAN_REMIND_TOOL_NAME = 'human_task_remind'
export const HUMAN_ACTION = Object.freeze({ id: 'share', type: 'wechat.share', label: '发送群卡' } as const)
export const HUMAN_MEMBERS_ACTION = Object.freeze({ id: 'select-members', type: 'wechat.select-members', label: '选择任务成员' } as const)
export const HUMAN_RESHARE_ACTION = Object.freeze({ id: 'reshare', type: 'wechat.reshare', label: '再次发送原任务' } as const)
export const HUMAN_REMIND_ACTION = Object.freeze({ id: 'remind', type: 'wechat.remind', label: '提醒已选未完成人员' } as const)
// Persisted/wire compatibility label, not the current business-facing button
// copy. Renderers may display a kind-specific label without changing this value
// or the immutable surface/draft used for authorization.
export const HUMAN_WORKFLOW_ACTION = Object.freeze({ id: 'workflow-approve', type: 'workflow.approve', label: '审核任务方案' } as const)
export const HUMAN_ID = /^[a-f0-9]{32}$/
export const ATTEMPT_ID = /^[A-Za-z0-9_-]{16,80}$/
export const TASK_REF_ID = /^[A-Za-z0-9_-]{24,64}(?![\s\S])/
export function humanWorkflowDraftRef(value: unknown): HumanWorkflowDraftRef | undefined {
  return object(value) && exactKeys(value, ['schema', 'draftId', 'version', 'digest', 'kind']) && value.schema === 'human.lifecycle.draft.ref.v1'
    && typeof value.draftId === 'string' && TASK_REF_ID.test(value.draftId) && value.version === 1
    && typeof value.digest === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(value.digest) && ['round', 'review', 'reminder'].includes(String(value.kind))
    ? { schema: 'human.lifecycle.draft.ref.v1', draftId: value.draftId, version: 1, digest: value.digest, kind: value.kind as HumanWorkflowDraftRef['kind'] } : undefined
}
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
  if (!Object.hasOwn(value, 'reason')) return true
  if (value.reason === 'no_pending_members') return action === 'remind' && value.outcome === 'cancelled'
  return value.outcome === 'failed' && typeof value.reason === 'string'
    && HUMAN_ACTION_FAILURE_REASONS.includes(value.reason as HumanActionFailureReason)
    && (action === 'select-members' || action === 'remind' || action === 'workflow-approve' && surface.workflowRef?.kind === 'reminder')
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
    ...['targetTaskRef', 'selectionRef', 'reminder', 'workflowRef', 'reminderPreview', 'workflowPreview', 'reshare', 'initialRound', 'cover'].filter(key => Object.hasOwn(value, key))])
    || Object.hasOwn(value, 'targetTaskRef') && !humanTaskRef(value.targetTaskRef)
    || value.schemaVersion !== 1 || value.kind !== 'human.surface' || value.revision !== 1
    || typeof value.id !== 'string' || !HUMAN_ID.test(value.id) || !text(value.title, 80) || !text(value.body, 1000)
    || !Array.isArray(value.actions) || value.actions.length !== 1) return
  const action = value.actions[0]
  if (!object(action) || !exactKeys(action, ['id', 'type', 'label'])) return
  const share = action.id === HUMAN_ACTION.id && action.type === HUMAN_ACTION.type && [HUMAN_ACTION.label, '发送测试卡片'].includes(action.label as string)
  const members = action.id === HUMAN_MEMBERS_ACTION.id && action.type === HUMAN_MEMBERS_ACTION.type && action.label === HUMAN_MEMBERS_ACTION.label
  const remind = action.id === HUMAN_REMIND_ACTION.id && action.type === HUMAN_REMIND_ACTION.type && action.label === HUMAN_REMIND_ACTION.label
  const workflow = action.id === HUMAN_WORKFLOW_ACTION.id && action.type === HUMAN_WORKFLOW_ACTION.type && action.label === HUMAN_WORKFLOW_ACTION.label
  const reshare = action.id === HUMAN_RESHARE_ACTION.id && action.type === HUMAN_RESHARE_ACTION.type && action.label === HUMAN_RESHARE_ACTION.label
  if (!share && !members && !remind && !workflow && !reshare || !share && !value.targetTaskRef) return
  if (reshare ? !object(value.reshare) || !exactKeys(value.reshare, ['roundId'])
    || value.reshare.roundId !== null && (typeof value.reshare.roundId !== 'string' || !TASK_REF_ID.test(value.reshare.roundId)) : Object.hasOwn(value, 'reshare')) return
  if (workflow ? !humanWorkflowDraftRef(value.workflowRef) : Object.hasOwn(value, 'workflowRef')) return
  if (Object.hasOwn(value, 'reminderPreview') && (!workflow || humanWorkflowDraftRef(value.workflowRef)?.kind !== 'reminder' || !humanReminderPreview(value.reminderPreview))) return
  if (Object.hasOwn(value, 'workflowPreview') && (!workflow || !humanWorkflowInlinePreview(value.workflowPreview)
    || humanWorkflowInlinePreview(value.workflowPreview)?.kind !== humanWorkflowDraftRef(value.workflowRef)?.kind)) return
  if (Object.hasOwn(value, 'initialRound') && (!share || !humanInitialRound(value.initialRound))) return
  if (object(value.initialRound) && value.initialRound.audience === 'known-members' && !humanTaskRef(value.targetTaskRef)) return
  if (object(value.initialRound) && Array.isArray(value.initialRound.sourceRecipientRefs)
    && value.initialRound.sourceRecipientRefs.some(ref => !object(ref) || !object(value.targetTaskRef)
      || ref.taskId !== value.targetTaskRef.taskId || ref.deliveryId !== value.targetTaskRef.deliveryId)) return
  if (Object.hasOwn(value, 'cover') && (!share || !humanCardAsset(value.cover))) return
  if (!remind && (Object.hasOwn(value, 'selectionRef') || Object.hasOwn(value, 'reminder'))) return
  const selection = humanSelectionRef(value.selectionRef), target = humanTaskRef(value.targetTaskRef)
  if (remind && (!selection || !target || selection.taskId !== target.taskId || selection.deliveryId !== target.deliveryId
    || !object(value.reminder) || !exactKeys(value.reminder, ['title', 'type']) || value.reminder.type !== 'complete'
    || !humanReminderTitle(value.reminder.title))) return
  // COMPAT(rc13-test-label): retain existing research Surface revisions. Remove
  // the old label after rc.13 ledgers/cards expire; no second execution route.
  return { schemaVersion: 1, kind: 'human.surface', id: value.id, revision: 1, title: value.title,
    body: value.body, ...(value.targetTaskRef ? { targetTaskRef: { ...humanTaskRef(value.targetTaskRef)! } } : {}),
    ...(workflow ? { workflowRef: humanWorkflowDraftRef(value.workflowRef)! } : {}),
    ...(value.reminderPreview ? { reminderPreview: humanReminderPreview(value.reminderPreview)! } : {}),
    ...(value.workflowPreview ? { workflowPreview: humanWorkflowInlinePreview(value.workflowPreview)! } : {}),
    ...(reshare ? { reshare: { roundId: (value.reshare as { roundId: string | null }).roundId } } : {}),
    ...(value.initialRound ? { initialRound: humanInitialRound(value.initialRound)! } : {}),
    ...(Object.hasOwn(value, 'cover') ? { cover: humanCardAsset(value.cover)! } : {}),
    ...(remind ? { selectionRef: { ...selection!, memberRefs: [...selection!.memberRefs] }, reminder: { title: (value.reminder as { title: string }).title, type: 'complete' as const } } : {}),
    actions: [{ ...action } as HumanAction] }
}
