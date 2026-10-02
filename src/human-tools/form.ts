/** Fixed data-only member form. Condition expressions only inspect earlier
 * answers; no script, templates, network destinations or dynamic components. */
import { exact, plain, row } from '../human-workflow/data.js'
export interface HumanInitialRound {
  title: string; instructions: string; form: Record<string, unknown>; closesAt: number | null; recipientRefs: null
}
function condition(value: unknown, previous: string[], depth = 0, budget = { count: 0 }): boolean {
  if (++budget.count > 32 || depth > 4 || !row(value)) return false
  if (value.op === 'all' || value.op === 'any') return exact(value, ['op', 'items']) && Array.isArray(value.items)
    && value.items.length > 0 && value.items.length <= 8 && value.items.every(item => condition(item, previous, depth + 1, budget))
  if (value.op === 'not') return exact(value, ['op', 'item']) && condition(value.item, previous, depth + 1, budget)
  return (value.op === 'present' && exact(value, ['op', 'field']) || value.op === 'eq' && exact(value, ['op', 'field', 'value'])
    && (typeof value.value === 'boolean' || Number.isSafeInteger(value.value) || typeof value.value === 'string' && value.value.length <= 2000))
    && typeof value.field === 'string' && previous.includes(value.field)
}
export function humanForm(value: unknown): Record<string, unknown> | undefined {
  if (!row(value) || !exact(value, ['schema', 'fields', 'attachment']) || value.schema !== 'human.form.v1'
    || !Array.isArray(value.fields) || value.fields.length > 12 || Buffer.byteLength(JSON.stringify(value)) > 10000) return
  const previous: string[] = []
  for (const field of value.fields) {
    if (!row(field) || !exact(field, ['key', 'label', 'kind', 'required'], ['maxLength', 'choices', 'min', 'max', 'when'])
      || typeof field.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(field.key) || ['constructor', 'prototype', '__proto__'].includes(field.key)
      || previous.includes(field.key) || !plain(field.label, 80) || typeof field.required !== 'boolean'
      || !['short-text', 'long-text', 'choice', 'boolean', 'number'].includes(String(field.kind))) return
    if (field.kind === 'short-text' || field.kind === 'long-text') {
      if (!Number.isSafeInteger(field.maxLength) || Number(field.maxLength) < 1 || Number(field.maxLength) > (field.kind === 'short-text' ? 200 : 2000)) return
    } else if (field.maxLength !== undefined) return
    if (field.kind === 'choice') {
      if (!Array.isArray(field.choices) || !field.choices.length || field.choices.length > 20 || new Set(field.choices).size !== field.choices.length || !field.choices.every(item => plain(item, 80))) return
    } else if (field.choices !== undefined) return
    if (field.kind === 'number') {
      if (!Number.isSafeInteger(field.min) || !Number.isSafeInteger(field.max) || Number(field.min) < -1e9 || Number(field.max) > 1e9 || Number(field.max) < Number(field.min)) return
    } else if (field.min !== undefined || field.max !== undefined) return
    if (field.when !== undefined && !condition(field.when, previous)) return
    previous.push(field.key)
  }
  const a = value.attachment
  if (a !== null && (!row(a) || !exact(a, ['kind', 'required', 'maxBytes', 'mediaTypes']) || a.kind !== 'image' || a.required !== true
    || !Number.isSafeInteger(a.maxBytes) || Number(a.maxBytes) < 1 || Number(a.maxBytes) > 10 * 1024 * 1024
    || !Array.isArray(a.mediaTypes) || !a.mediaTypes.length || a.mediaTypes.length > 2 || new Set(a.mediaTypes).size !== a.mediaTypes.length
    || !a.mediaTypes.every(item => ['image/jpeg', 'image/png'].includes(String(item))))) return
  return structuredClone(value)
}
export function humanInitialRound(value: unknown): HumanInitialRound | undefined {
  if (!row(value) || !exact(value, ['title', 'instructions', 'form', 'closesAt', 'recipientRefs']) || !plain(value.title, 80)
    || !plain(value.instructions, 2000) || !humanForm(value.form) || value.recipientRefs !== null
    || value.closesAt !== null && (!Number.isSafeInteger(value.closesAt) || Number(value.closesAt) <= 0)
    || Buffer.byteLength(JSON.stringify(value)) > 12 * 1024) return
  return structuredClone(value) as unknown as HumanInitialRound
}
