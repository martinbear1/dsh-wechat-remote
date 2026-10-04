/** Owner-only literal preview. It is never a public share payload or authority. */
import { exact, plain, row } from './data.js'
import { humanForm } from '../human-tools/form.js'
import { HUMAN_ROUND_MAX_BYTES } from '../human-tools/capacity.js'

export interface HumanWorkflowInlinePreview {
  schema: 'human.workflow.inline.v1'; kind: 'round' | 'review'; taskTitle: string
  roundTitle?: string; submissionCreatedAt?: number
  content: Record<string, unknown>
  target?: { participantRef: string; submissionId: string; submissionVersion: number }
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{20,80}(?![\s\S])/.test(v)
function round(v: unknown, correction = false): Record<string, unknown> | undefined {
  if (!row(v) || !exact(v, ['title', 'instructions', 'form', 'closesAt', ...(correction ? [] : ['recipientRefs'])])
    || !plain(v.title, 80) || !plain(v.instructions, 2000)
    || v.closesAt !== null && (!Number.isSafeInteger(v.closesAt) || Number(v.closesAt) <= 0)) return
  const form = humanForm(v.form)
  if (!form || !correction && v.recipientRefs !== null && (!Array.isArray(v.recipientRefs)
    || !v.recipientRefs.length || v.recipientRefs.length > 100 || !v.recipientRefs.every(id)
    || new Set(v.recipientRefs).size !== v.recipientRefs.length)) return
  return { title: v.title, instructions: v.instructions, form, closesAt: v.closesAt,
    ...(correction ? {} : { recipientRefs: v.recipientRefs }) }
}
export function humanWorkflowInlinePreview(v: unknown): HumanWorkflowInlinePreview | undefined {
  if (!row(v) || !exact(v, ['schema', 'kind', 'taskTitle', 'content'], ['roundTitle', 'submissionCreatedAt', 'target'])
    || v.schema !== 'human.workflow.inline.v1' || !['round', 'review'].includes(String(v.kind)) || !plain(v.taskTitle, 80)
    || v.roundTitle !== undefined && !plain(v.roundTitle, 80)
    || v.submissionCreatedAt !== undefined && (!Number.isSafeInteger(v.submissionCreatedAt)
      || Number(v.submissionCreatedAt) < 0 || Number(v.submissionCreatedAt) > 8640000000000000 - 8 * 3600000)
    || Buffer.byteLength(JSON.stringify(v)) > HUMAN_ROUND_MAX_BYTES) return
  let content: Record<string, unknown> | undefined
  if (v.kind === 'round') {
    if (v.target !== undefined || v.submissionCreatedAt !== undefined) return
    content = round(v.content)
  } else {
    const c = v.content, t = v.target
    if (!row(c) || !exact(c, ['submissionId', 'submissionVersion', 'title', 'body', 'correction'])
      || !id(c.submissionId) || !Number.isSafeInteger(c.submissionVersion) || Number(c.submissionVersion) < 1
      || !plain(c.title, 80) || !plain(c.body, 4000) || !row(t)
      || !exact(t, ['participantRef', 'submissionId', 'submissionVersion']) || !id(t.participantRef)
      || t.submissionId !== c.submissionId || t.submissionVersion !== c.submissionVersion) return
    const correction = c.correction === null ? null : round(c.correction, true)
    if (correction === undefined) return
    content = { submissionId: c.submissionId, submissionVersion: c.submissionVersion, title: c.title, body: c.body, correction }
  }
  if (!content) return
  return { schema: 'human.workflow.inline.v1', kind: v.kind as 'round' | 'review', taskTitle: v.taskTitle,
    ...(v.roundTitle === undefined ? {} : { roundTitle: v.roundTitle as string }),
    ...(v.submissionCreatedAt === undefined ? {} : { submissionCreatedAt: v.submissionCreatedAt as number }), content,
    ...(v.kind === 'review' ? { target: structuredClone(v.target) as HumanWorkflowInlinePreview['target'] } : {}) }
}
/** A caller must explicitly fall back to its complete page preview if absent.
 * In particular, an asset digest is not proof that the cover was displayed. */
export function workflowInlinePreview(draft: unknown): HumanWorkflowInlinePreview | undefined {
  if (!row(draft) || !row(draft.draftRef) || !row(draft.context)) return
  return humanWorkflowInlinePreview({ schema: 'human.workflow.inline.v1', kind: draft.draftRef.kind,
    taskTitle: draft.context.taskTitle, ...(draft.context.roundTitle === undefined ? {} : { roundTitle: draft.context.roundTitle }),
    ...(draft.context.submissionCreatedAt === undefined ? {} : { submissionCreatedAt: draft.context.submissionCreatedAt }),
    content: draft.content, ...(draft.draftRef.kind === 'review' ? { target: draft.target } : {}) })
}
