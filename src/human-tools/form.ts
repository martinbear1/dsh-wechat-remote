/** Fixed data-only member form. Condition expressions only inspect earlier
 * answers; no script, templates, network destinations or dynamic components. */
import { exact, plain, row } from '../human-workflow/data.js'
import { HUMAN_FORM_MAX_BYTES, HUMAN_ROUND_MAX_BYTES } from './capacity.js'
import { HUMAN_FORM_V2_KINDS, HUMAN_FORM_V2_FIELD_KEYS, HUMAN_FORM_THEMES, HUMAN_FORM_ICONS, HUMAN_FORM_LAYOUTS, humanDate, humanTime, humanFormV2Field, humanFormPresentation } from './form-v2.js'
import { SUBMISSION_FILE_TYPES, SUBMISSION_FILE_MAX } from '../human-workflow/submission-file-contract.js'
import { humanRecipientRef, type HumanRecipientRef } from './protocol.js'
export interface HumanInitialRound {
  title: string; instructions: string; form: Record<string, unknown>; closesAt: number | null; recipientRefs: null
  /** Missing retains the original all-group wire representation and digest. */
  audience?: 'all-group' | 'owner-select' | 'known-members'
  /** Opaque participants of the successful source task, never native member
   * IDs. Only known-members accepts this; the server resolves their identity. */
  sourceParticipantRefs?: string[]
  /** Current exact references may also describe selected/audience members who
   * have never opened the source task. Mutually exclusive with the legacy list. */
  sourceRecipientRefs?: HumanRecipientRef[]
}
function condition(value: unknown, previous: string[], choices: Map<string, unknown[]>, depth = 0, budget = { count: 0 }): boolean {
  if (++budget.count > 32 || depth > 4 || !row(value)) return false
  if (value.op === 'all' || value.op === 'any') return exact(value, ['op', 'items']) && Array.isArray(value.items)
    && value.items.length > 0 && value.items.length <= 8 && value.items.every(item => condition(item, previous, choices, depth + 1, budget))
  if (value.op === 'not') return exact(value, ['op', 'item']) && condition(value.item, previous, choices, depth + 1, budget)
  if (value.op === 'contains') return exact(value, ['op', 'field', 'value']) && typeof value.field === 'string'
    && plain(value.value, 80) && choices.get(value.field)?.includes(value.value) === true
  return (value.op === 'present' && exact(value, ['op', 'field']) || value.op === 'eq' && exact(value, ['op', 'field', 'value'])
    && !choices.has(String(value.field))
    && (typeof value.value === 'boolean' || Number.isSafeInteger(value.value) || typeof value.value === 'string' && value.value.length <= 2000))
    && typeof value.field === 'string' && previous.includes(value.field)
}
export function humanForm(value: unknown): Record<string, unknown> | undefined {
  if (!row(value) || !['human.form.v1', 'human.form.v2', 'human.form.v3'].includes(String(value.schema))
    || !exact(value, ['schema', 'fields', 'attachment'], value.schema !== 'human.form.v1' ? ['presentation'] : [])
    || !Array.isArray(value.fields) || value.fields.length > 12 || Buffer.byteLength(JSON.stringify(value)) > HUMAN_FORM_MAX_BYTES) return
  const v2 = value.schema !== 'human.form.v1', previous: string[] = [], choices = new Map<string, unknown[]>()
  if (value.presentation !== undefined && !humanFormPresentation(value.presentation)) return
  for (const field of value.fields) {
    if (!row(field) || !exact(field, ['key', 'label', 'kind', 'required'], ['maxLength', 'choices', 'min', 'max', 'when', ...(v2 ? HUMAN_FORM_V2_FIELD_KEYS : [])])
      || typeof field.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}(?![\s\S])/.test(field.key) || ['constructor', 'prototype', '__proto__'].includes(field.key)
      || previous.includes(field.key) || !plain(field.label, 80) || typeof field.required !== 'boolean'
      || !['short-text', 'long-text', 'choice', 'boolean', 'number', ...(v2 ? HUMAN_FORM_V2_KINDS : [])].includes(String(field.kind))
      || v2 && !humanFormV2Field(field)) return
    if (field.kind === 'short-text' || field.kind === 'long-text') {
      if (!Number.isSafeInteger(field.maxLength) || Number(field.maxLength) < 1 || Number(field.maxLength) > (field.kind === 'short-text' ? 200 : 2000)) return
    } else if (field.maxLength !== undefined) return
    if (field.kind === 'choice' || field.kind === 'multi-choice') {
      if (!Array.isArray(field.choices) || !field.choices.length || field.choices.length > 20 || new Set(field.choices).size !== field.choices.length || !field.choices.every(item => plain(item, 80))) return
    } else if (field.choices !== undefined) return
    if (field.kind === 'number') {
      if (!Number.isSafeInteger(field.min) || !Number.isSafeInteger(field.max) || Number(field.min) < -1e9 || Number(field.max) > 1e9 || Number(field.max) < Number(field.min)) return
    } else if (field.min !== undefined || field.max !== undefined) return
    if (field.when !== undefined && !condition(field.when, previous, choices)) return
    previous.push(field.key)
    if (v2 && field.kind === 'multi-choice') choices.set(field.key, field.choices as unknown[])
  }
  const a = value.attachment
  const allowed = value.schema === 'human.form.v3' && row(a) && a.kind === 'file' ? [...SUBMISSION_FILE_TYPES] : ['image/jpeg', 'image/png']
  if (a !== null && (!row(a) || !exact(a, ['kind', 'required', 'maxBytes', 'mediaTypes'])
    || !(a.kind === 'image' || value.schema === 'human.form.v3' && a.kind === 'file') || typeof a.required !== 'boolean'
    || !Number.isSafeInteger(a.maxBytes) || Number(a.maxBytes) < 1 || Number(a.maxBytes) > SUBMISSION_FILE_MAX
    || !Array.isArray(a.mediaTypes) || !a.mediaTypes.length || a.mediaTypes.length > allowed.length || new Set(a.mediaTypes).size !== a.mediaTypes.length
    || !a.mediaTypes.every(item => allowed.includes(String(item))))) return
  return structuredClone(value)
}
export function humanInitialRound(value: unknown): HumanInitialRound | undefined {
  if (!row(value) || !exact(value, ['title', 'instructions', 'form', 'closesAt', 'recipientRefs'], ['audience', 'sourceParticipantRefs', 'sourceRecipientRefs']) || !plain(value.title, 80)
    || !plain(value.instructions, 2000) || !humanForm(value.form) || value.recipientRefs !== null
    || value.audience !== undefined && !['all-group', 'owner-select', 'known-members'].includes(String(value.audience))
    || value.closesAt !== null && (!Number.isSafeInteger(value.closesAt) || Number(value.closesAt) <= 0)
    || Buffer.byteLength(JSON.stringify(value)) > HUMAN_ROUND_MAX_BYTES) return
  const participants = Object.hasOwn(value, 'sourceParticipantRefs'), recipients = Object.hasOwn(value, 'sourceRecipientRefs')
  if (value.audience !== 'known-members') { if (participants || recipients) return }
  else {
    if (participants === recipients) return
    if (participants && (!Array.isArray(value.sourceParticipantRefs) || value.sourceParticipantRefs.length < 1 || value.sourceParticipantRefs.length > 20
      || new Set(value.sourceParticipantRefs).size !== value.sourceParticipantRefs.length
      || !value.sourceParticipantRefs.every(ref => typeof ref === 'string' && /^[A-Za-z0-9_-]{24,64}(?![\s\S])/.test(ref)))) return
    if (recipients && (!Array.isArray(value.sourceRecipientRefs) || value.sourceRecipientRefs.length < 1 || value.sourceRecipientRefs.length > 20
      || !value.sourceRecipientRefs.every(humanRecipientRef)
      || new Set(value.sourceRecipientRefs.map(ref => JSON.stringify(humanRecipientRef(ref)))).size !== value.sourceRecipientRefs.length)) return
  }
  return structuredClone(value) as unknown as HumanInitialRound
}

/** Diagnostic data, not a second permissive parser. Never rewrite the request,
 * remove a requested format, echo submitted values, or infer runtime readiness. */
export interface HumanFormIssue {
  schema: 'human.form.issue.v1'
  path: string
  code: 'object-required' | 'required' | 'unsupported-field' | 'misplaced-field' | 'schema-unsupported' | 'schema-feature-mismatch'
    | 'type-invalid' | 'value-invalid' | 'limit-exceeded' | 'attachment-format-unsupported' | 'attachment-kind-mismatch'
  message: string
  expected?: string
  correctPath?: string
}
const issue = (path: string, code: HumanFormIssue['code'], message: string, expected?: string, correctPath?: string): HumanFormIssue =>
  ({ schema: 'human.form.issue.v1', path, code, message, ...(expected ? { expected } : {}), ...(correctPath ? { correctPath } : {}) })
const fieldPath = (path: string, key: string): string => `${path}.${/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ? key : '[unsupported-key]'}`
function shapeIssue(value: unknown, path: string, required: string[], optional: readonly string[] = [], destinations: Record<string, string> = {}): HumanFormIssue | undefined {
  if (!row(value)) return issue(path, 'object-required', '应为对象，不能省略或使用其他类型。', 'object')
  // Report misplaced fields first: dropping them or downgrading an unrelated
  // attachment would lose user intent even if another required field is absent.
  for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) {
    const correctPath = Object.hasOwn(destinations, key) ? destinations[key] : undefined
    return correctPath ? issue(fieldPath(path, key), 'misplaced-field', `字段层级错误；请放在 ${correctPath}，保留原有业务要求及附件格式。`, undefined, correctPath)
      : issue(fieldPath(path, key), 'unsupported-field', '此位置不接受该字段；请核对工具参数结构，不据此判断附件能力。', [...required, ...optional].join(', '))
  }
  const missing = required.find(key => !Object.hasOwn(value, key))
  if (missing) return issue(fieldPath(path, missing), 'required', '缺少必需字段。')
}
function presentationIssue(value: unknown, path: string): HumanFormIssue | undefined {
  const shape = shapeIssue(value, path, [], ['theme', 'icon', 'layout', 'submitLabel', 'completionText', 'blocks'])
  if (shape || !row(value)) return shape
  for (const [key, allowed] of [['theme', HUMAN_FORM_THEMES], ['icon', HUMAN_FORM_ICONS], ['layout', HUMAN_FORM_LAYOUTS]] as const)
    if (value[key] !== undefined && !(allowed as readonly unknown[]).includes(value[key])) return issue(`${path}.${key}`, 'value-invalid', '展示选项不在支持列表中；与附件格式无关。', allowed.join(', '))
  for (const [key, maximum] of [['submitLabel', 20], ['completionText', 300]] as const)
    if (value[key] !== undefined && !plain(value[key], maximum)) return issue(`${path}.${key}`, 'value-invalid', '应为无控制字符的非空文字。', `1..${maximum} characters`)
  if (value.blocks !== undefined) {
    if (!Array.isArray(value.blocks)) return issue(`${path}.blocks`, 'type-invalid', '展示内容应为数组。', 'array')
    if (value.blocks.length > 8) return issue(`${path}.blocks`, 'limit-exceeded', '展示内容过多。', '0..8 blocks')
    for (let n = 0; n < value.blocks.length; n++) {
      const block = value.blocks[n], p = `${path}.blocks[${n}]`
      if (!row(block)) return issue(p, 'object-required', '展示内容应为对象。', 'object')
      const required = block.type === 'paragraph' ? ['type', 'text'] : block.type === 'notice' ? ['type', 'text', 'tone'] : block.type === 'list' ? ['type', 'items'] : null
      if (!required) return issue(`${p}.type`, 'value-invalid', '展示内容类型不受支持。', 'paragraph, notice, list')
      const shape = shapeIssue(block, p, required); if (shape) return shape
      if (block.type !== 'list' && !plain(block.text, 1000)) return issue(`${p}.text`, 'value-invalid', '应为非空文字。', '1..1000 characters')
      if (block.type === 'notice' && !['info', 'warning', 'success'].includes(String(block.tone))) return issue(`${p}.tone`, 'value-invalid', '提示样式不受支持。', 'info, warning, success')
      if (block.type === 'list' && (!Array.isArray(block.items) || !block.items.length || block.items.length > 8 || !block.items.every(item => plain(item, 200))))
        return issue(`${p}.items`, 'value-invalid', '列表需包含 1 至 8 项非空文字，每项最多 200 字符。')
    }
  }
}
export function humanFormIssue(value: unknown, path = 'form'): HumanFormIssue | undefined {
  if (humanForm(value)) return
  if (!row(value)) return issue(path, 'object-required', '表单应为对象。', 'object')
  const shape = shapeIssue(value, path, ['schema', 'fields', 'attachment'], ['presentation'],
    Object.fromEntries(['theme', 'icon', 'layout', 'submitLabel', 'completionText', 'blocks'].map(key => [key, `${path}.presentation.${key}`])))
  if (shape) return shape
  if (!['human.form.v1', 'human.form.v2', 'human.form.v3'].includes(String(value.schema)))
    return issue(`${path}.schema`, 'schema-unsupported', '表单版本不受支持；需要文档附件时使用 human.form.v3。', 'human.form.v1, human.form.v2, human.form.v3')
  if (Buffer.byteLength(JSON.stringify(value)) > HUMAN_FORM_MAX_BYTES) return issue(path, 'limit-exceeded', '表单定义超过大小上限；不是附件格式限制。', `${HUMAN_FORM_MAX_BYTES} UTF-8 bytes`)
  const v2 = value.schema !== 'human.form.v1'
  if (value.presentation !== undefined) {
    if (!v2) return issue(`${path}.presentation`, 'schema-feature-mismatch', '展示参数需要 human.form.v2 或 v3；若还需文档附件，保留 v3。')
    const problem = presentationIssue(value.presentation, `${path}.presentation`); if (problem) return problem
  }
  if (!Array.isArray(value.fields)) return issue(`${path}.fields`, 'type-invalid', '填写字段应为数组。', 'array')
  if (value.fields.length > 12) return issue(`${path}.fields`, 'limit-exceeded', '填写字段数量超过上限。', '0..12 fields')
  const previous: string[] = [], choices = new Map<string, unknown[]>()
  for (let n = 0; n < value.fields.length; n++) {
    const f = value.fields[n], p = `${path}.fields[${n}]`, base = ['maxLength', 'choices', 'min', 'max', 'when']
    const shape = shapeIssue(f, p, ['key', 'label', 'kind', 'required'], [...base, ...HUMAN_FORM_V2_FIELD_KEYS]); if (shape || !row(f)) return shape
    if (typeof f.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}(?![\s\S])/.test(f.key) || ['constructor', 'prototype', '__proto__'].includes(f.key) || previous.includes(f.key))
      return issue(`${p}.key`, 'value-invalid', '字段标识需为唯一的 snake_case，不能使用保留标识。', '1..40 characters')
    if (!plain(f.label, 80)) return issue(`${p}.label`, 'value-invalid', '字段名称需为非空文字。', '1..80 characters')
    if (typeof f.required !== 'boolean') return issue(`${p}.required`, 'type-invalid', '必填设置需为布尔值。', 'boolean')
    if (!['short-text', 'long-text', 'choice', 'boolean', 'number', ...HUMAN_FORM_V2_KINDS].includes(String(f.kind)))
      return issue(`${p}.kind`, 'value-invalid', '字段类型不受支持。', 'short-text, long-text, choice, boolean, number, multi-choice, date, time')
    if (!v2 && (HUMAN_FORM_V2_KINDS.includes(f.kind as typeof HUMAN_FORM_V2_KINDS[number]) || HUMAN_FORM_V2_FIELD_KEYS.some(key => Object.hasOwn(f, key))))
      return issue(p, 'schema-feature-mismatch', '该字段类型或扩展需要 human.form.v2 或 v3；文档附件需要 v3。')
    if (f.kind === 'short-text' || f.kind === 'long-text') {
      const max = f.kind === 'short-text' ? 200 : 2000
      if (!Number.isSafeInteger(f.maxLength) || Number(f.maxLength) < 1 || Number(f.maxLength) > max) return issue(`${p}.maxLength`, 'value-invalid', '文本长度上限应为范围内的整数。', `1..${max}`)
    } else if (f.maxLength !== undefined) return issue(`${p}.maxLength`, 'unsupported-field', '只有文本字段使用 maxLength。')
    if (f.kind === 'choice' || f.kind === 'multi-choice') {
      if (!Array.isArray(f.choices) || !f.choices.length || f.choices.length > 20 || new Set(f.choices).size !== f.choices.length || !f.choices.every(item => plain(item, 80)))
        return issue(`${p}.choices`, 'value-invalid', '需提供 1 至 20 个不同的非空选项，每项最多 80 字符。')
    } else if (f.choices !== undefined) return issue(`${p}.choices`, 'unsupported-field', '只有单选、多选字段使用 choices。')
    if (f.kind === 'number') {
      if (!Number.isSafeInteger(f.min) || Number(f.min) < -1e9) return issue(`${p}.min`, 'value-invalid', '最小值应为不小于 -1000000000 的整数。')
      if (!Number.isSafeInteger(f.max) || Number(f.max) > 1e9 || Number(f.max) < Number(f.min)) return issue(`${p}.max`, 'value-invalid', '最大值应为不小于 min、不超过 1000000000 的整数。')
    } else if (f.min !== undefined || f.max !== undefined) return issue(p, 'unsupported-field', '只有数字字段使用 min/max。')
    if (v2 && !humanFormV2Field(f)) {
      for (const [key, max] of [['description', 300], ['section', 80]] as const) if (f[key] !== undefined && !plain(f[key], max))
        return issue(`${p}.${key}`, 'value-invalid', '帮助文字或分组名称应为非空文字。', `1..${max} characters`)
      if (f.kind === 'multi-choice') {
        if (!Number.isSafeInteger(f.minSelected) || Number(f.minSelected) < 0) return issue(`${p}.minSelected`, 'value-invalid', '最少选择数应为非负整数。')
        return issue(`${p}.maxSelected`, 'value-invalid', '最多选择数应为整数，不小于 minSelected（必填时至少 1），不超过选项数量。')
      }
      for (const key of ['minSelected', 'maxSelected']) if (f[key] !== undefined) return issue(`${p}.${key}`, 'unsupported-field', '只有多选字段使用选择数量限制。')
      if (f.kind === 'date' || f.kind === 'time') {
        const valid = f.kind === 'date' ? humanDate : humanTime, format = f.kind === 'date' ? 'YYYY-MM-DD' : 'HH:mm'
        for (const key of ['start', 'end']) if (f[key] !== undefined && !valid(f[key])) return issue(`${p}.${key}`, 'value-invalid', '应为有效日期或时间。', format)
        return issue(`${p}.end`, 'value-invalid', '范围结束值不能早于 start。', format)
      }
      for (const key of ['start', 'end']) if (f[key] !== undefined) return issue(`${p}.${key}`, 'unsupported-field', '只有日期、时间字段使用 start/end。')
      return issue(p, 'value-invalid', '字段扩展未通过校验；附件能力不受此错误影响。')
    }
    if (f.when !== undefined && !condition(f.when, previous, choices)) return issue(`${p}.when`, 'value-invalid', '条件只能引用前面的兼容字段；核对运算符、值、深度和节点数。')
    previous.push(f.key); if (v2 && f.kind === 'multi-choice') choices.set(f.key, f.choices as unknown[])
  }
  const a = value.attachment, p = `${path}.attachment`
  if (a !== null) {
    const shape = shapeIssue(a, p, ['kind', 'required', 'maxBytes', 'mediaTypes']); if (shape || !row(a)) return shape
    if (!['image', 'file'].includes(String(a.kind))) return issue(`${p}.kind`, 'value-invalid', '附件类别不受支持。', 'image, file')
    if (a.kind === 'file' && value.schema !== 'human.form.v3') return issue(`${p}.kind`, 'schema-feature-mismatch', '文件附件需要 human.form.v3；保留用户要求的文档格式，不降级为图片。', 'human.form.v3 + attachment.kind=file')
    if (typeof a.required !== 'boolean') return issue(`${p}.required`, 'type-invalid', '是否必交附件需为布尔值。', 'boolean')
    if (!Number.isSafeInteger(a.maxBytes) || Number(a.maxBytes) < 1 || Number(a.maxBytes) > SUBMISSION_FILE_MAX) return issue(`${p}.maxBytes`, 'limit-exceeded', '单附件大小上限需为 1 至 10485760 的整数。', '1..10485760 bytes')
    const allowed: readonly string[] = a.kind === 'file' ? SUBMISSION_FILE_TYPES : ['image/jpeg', 'image/png']
    if (!Array.isArray(a.mediaTypes)) return issue(`${p}.mediaTypes`, 'type-invalid', '附件格式需为 MIME 数组。', 'array')
    if (!a.mediaTypes.length || new Set(a.mediaTypes).size !== a.mediaTypes.length)
      return issue(`${p}.mediaTypes`, 'value-invalid', '选择至少一种、互不重复的支持格式；一次仍只交一个附件。', allowed.join(', '))
    const index = a.mediaTypes.findIndex(type => !allowed.includes(String(type)))
    if (index >= 0) {
      const supportedFile = SUBMISSION_FILE_TYPES.includes(a.mediaTypes[index] as typeof SUBMISSION_FILE_TYPES[number])
      return a.kind === 'image' && supportedFile
        ? issue(`${p}.mediaTypes[${index}]`, 'attachment-kind-mismatch', '此格式需要 human.form.v3 + attachment.kind=file；文档不能声明为 image，勿删去用户要求的格式。')
        : issue(`${p}.mediaTypes[${index}]`, 'attachment-format-unsupported', '当前文件合同不支持该 MIME；支持 DOCX，不支持旧 DOC、宏文档或任意文件。不是微信禁止 Word。', SUBMISSION_FILE_TYPES.join(', '))
    }
  }
  return issue(path, 'value-invalid', '表单未通过严格校验；核对当前工具合同，不据此推断接收端不支持文档。')
}
export function humanRoundIssue(value: unknown, path = 'initialRound', mode: 'initial' | 'round' | 'correction' = 'initial'): HumanFormIssue | undefined {
  if (mode === 'initial' && humanInitialRound(value)) return
  const required = ['title', 'instructions', 'form', 'closesAt', ...(mode === 'correction' ? [] : ['recipientRefs'])]
  const optional = mode === 'initial' ? ['audience', 'sourceParticipantRefs', 'sourceRecipientRefs'] : mode === 'round' ? ['cover'] : []
  const shape = shapeIssue(value, path, required, optional, { presentation: `${path}.form.presentation`, fields: `${path}.form.fields`, attachment: `${path}.form.attachment` })
  if (shape || !row(value)) return shape
  if (!plain(value.title, 80)) return issue(`${path}.title`, 'value-invalid', '标题需为非空文字。', '1..80 characters')
  if (!plain(value.instructions, 2000)) return issue(`${path}.instructions`, 'value-invalid', '要求需为非空文字。', '1..2000 characters')
  const form = humanFormIssue(value.form, `${path}.form`); if (form) return form
  if (value.closesAt !== null && (!Number.isSafeInteger(value.closesAt) || Number(value.closesAt) <= 0)) return issue(`${path}.closesAt`, 'type-invalid', '截止时间需为正整数毫秒时间戳，或 null；具体允许期限由服务端核验。')
  if (Buffer.byteLength(JSON.stringify(value)) > HUMAN_ROUND_MAX_BYTES) return issue(path, 'limit-exceeded', '本次要求定义超过大小上限；不是附件格式限制。', `${HUMAN_ROUND_MAX_BYTES} UTF-8 bytes`)
  if (mode === 'initial') {
    if (value.recipientRefs !== null) return issue(`${path}.recipientRefs`, 'value-invalid', '首轮 recipientRefs 必须为 null；指定参与者使用 audience 与来源引用。', 'null')
    if (value.audience !== undefined && !['all-group', 'owner-select', 'known-members'].includes(String(value.audience))) return issue(`${path}.audience`, 'value-invalid', '参与范围不受支持。', 'all-group, owner-select, known-members')
    return issue(path, 'value-invalid', '已知成员来源引用不符合合同；known-members 需二选一提供 sourceRecipientRefs/sourceParticipantRefs，其他 audience 不接受这些字段。')
  }
  if (mode === 'round' && value.recipientRefs !== null && (!Array.isArray(value.recipientRefs) || !value.recipientRefs.length || value.recipientRefs.length > 100
    || new Set(value.recipientRefs).size !== value.recipientRefs.length || !value.recipientRefs.every(ref => typeof ref === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(ref))))
    return issue(`${path}.recipientRefs`, 'value-invalid', '应为 null，或本任务中 1 至 100 个不同的准确参与者引用。')
}
/** Message carries the safe path too: some native hosts display only Error.message. */
export function humanFormError(problem: HumanFormIssue): Error & { code: string; validation: HumanFormIssue } {
  return Object.assign(new Error(`${problem.path}：${problem.message}${problem.expected ? ` 允许：${problem.expected}。` : ''} 这是参数校验失败，尚未判定接收端能力；请仅修正指出的字段，勿静默改变用户要求。`),
    { code: 'lifecycle-form-invalid', validation: problem })
}
