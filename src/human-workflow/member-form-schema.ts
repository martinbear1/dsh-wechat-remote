/** Public Agent input schema; validation lives in human-tools/form*.ts. */
import { HUMAN_FORM_THEMES, HUMAN_FORM_ICONS, HUMAN_FORM_LAYOUTS } from '../human-tools/form-v2.js'
import { SUBMISSION_FILE_TYPES } from './submission-file-contract.js'
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const text = { type: 'string' }, integer = { type: 'integer' }
// DSH's native schema subset does not implement maxLength/minItems/minimum.
// Advertise bounds in descriptions and enforce them in the shared validator.
const boundedText = (maximum: number, description = '') => ({ type: 'string', description: `Nonblank text, at most ${maximum} characters. ${description}` })
const block = { oneOf: [
  object({ type: { type: 'string', const: 'paragraph' }, text: boundedText(1000) }),
  object({ type: { type: 'string', const: 'notice' }, text: boundedText(1000), tone: { type: 'string', enum: ['info', 'warning', 'success'] } }),
  object({ type: { type: 'string', const: 'list' }, items: { type: 'array', description: '1..8 items.', items: boundedText(200) } }),
] }
export const HUMAN_MEMBER_FORM_SCHEMA = object({
  schema: { type: 'string', enum: ['human.form.v1', 'human.form.v2', 'human.form.v3'], description: 'Use v2 for multi-choice/date/time, field descriptions/sections, or presentation. v3 inherits v2 and additionally supports attachment.kind=file (one allowed image or document). v1/v2 still only support image attachments. No code, CSS, HTML or URLs.' },
  fields: { type: 'array', description: 'At most 12 fields.', items: object({
    key: { type: 'string', description: 'Unique snake_case key, max 40 chars.' }, label: boundedText(80, 'Business field name only; required/type are rendered separately, so do not append them to the label.'),
    kind: { type: 'string', enum: ['short-text', 'long-text', 'choice', 'boolean', 'number', 'multi-choice', 'date', 'time'] }, required: { type: 'boolean' },
    maxLength: { type: 'integer', description: 'Only text, required: short 1..200, long 1..2000.' },
    choices: { type: 'array', items: boundedText(80), description: 'Only choice/multi-choice, required. 1..20 distinct nonblank option strings.' },
    min: { ...integer, description: 'Only number: integer range, required.' }, max: { ...integer, description: 'Only number: integer range, required.' },
    description: boundedText(300, 'v2/v3 only: optional help only when needed; do not repeat obvious labels, task instructions or technical limits. Not executable markup.'), section: boundedText(80, 'v2/v3 only: heading before this field; does not change field order.'),
    minSelected: { ...integer, description: 'v2/v3 multi-choice only, required; 0..20, effective minimum is at least 1 for required fields.' },
    maxSelected: { ...integer, description: 'v2/v3 multi-choice only, required; 0..20, >=minSelected and <=choices.length.' },
    start: { type: 'string', description: 'v2/v3 date/time only. Inclusive YYYY-MM-DD or HH:mm. Date is a real calendar day, not an instant/timezone.' },
    end: { type: 'string', description: 'v2/v3 date/time only. Inclusive bound >=start. No implicit default selection.' },
    when: { type: 'object', description: 'Only earlier fields: {op:present,field}/{op:eq,field,value}, or all/any items/not item. v2/v3 additionally {op:contains,field,value} for an earlier multi-choice and one of its declared options. Max32 nodes, depth4. Empty multi-choice is not present.' },
  }, ['key', 'label', 'kind', 'required']) },
  attachment: { description: 'null or ONE attachment <=10MiB. required=false makes it optional. kind=image retains JPEG/PNG; v3 kind=file permits one of the explicitly listed supported formats, including image/document alternatives. No legacy DOC/XLS/PPT, macros, audio, video, or multiple files. Requires a compatible receiving node; upload and computer delivery are distinct.', oneOf: [
    { type: 'null' }, object({ kind: { type: 'string', const: 'image' }, required: { type: 'boolean' }, maxBytes: integer,
      mediaTypes: { type: 'array', items: { type: 'string', enum: ['image/jpeg', 'image/png'] } } }),
    object({ kind: { type: 'string', const: 'file', description: 'Only human.form.v3. File names are display metadata, never paths or executable instructions.' }, required: { type: 'boolean' }, maxBytes: integer,
      mediaTypes: { type: 'array', items: { type: 'string', enum: [...SUBMISSION_FILE_TYPES] }, description: '1..8 unique accepted MIME types. Do not advertise unsupported formats or silently replace a user requested document with a photo.' } }),
  ] },
  presentation: { ...object({ theme: { type: 'string', enum: [...HUMAN_FORM_THEMES] }, icon: { type: 'string', enum: [...HUMAN_FORM_ICONS] },
    layout: { type: 'string', enum: [...HUMAN_FORM_LAYOUTS] }, submitLabel: boundedText(20), completionText: boundedText(300),
    blocks: { type: 'array', description: 'Optional, at most 8 blocks. Omit when task instructions suffice; use only for distinct helpful content, not another copy of the task requirements.', items: block },
  }, []), description: 'v2/v3 only. Optional page tokens/text; no effect on WeChat outer message layout, permissions or actual submission state. Completion text is your business wording, not proof that the Agent has processed the result.' },
}, ['schema', 'fields', 'attachment'])
