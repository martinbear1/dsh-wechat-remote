/** Read-only mobile presentation of a native record. Never a native event,
 * tool invocation, file-read authority, or dump of arbitrary metadata. */
import { toolRecordPresentation } from './tool-record-presentation.js'
import { toolResultFailed } from './tool-result-compat.js'

type Row = Record<string, any>
export interface DetailPart {
  readonly kind: 'text' | 'code' | 'diff-before' | 'diff-after' | 'image' | 'notice'
  readonly label: string
  readonly text: string
  readonly path?: string
  readonly language?: string
  readonly attachment?: Row
}
export interface DetailDocument { readonly parts: readonly DetailPart[] }
const MAX_PARTS = 128
const MAX_BYTES = 32 * 1024 * 1024
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const pick = (v: Row, keys: string[]) => Object.fromEntries(keys.filter(k => v[k] !== undefined).map(k => [k, v[k]]))
const prose = (v: unknown) => typeof v === 'string' ? v : record(v) || Array.isArray(v) ? JSON.stringify(v, null, 2) : ''
const clipped = (v: unknown, limit = 1200) => typeof v === 'string' ? v.slice(0, limit).replace(/[\uD800-\uDBFF]$/, '') : ''
const notice = (text: string): DetailPart => ({ kind: 'notice', label: '说明', text })

// Whole opaque references only. Labels may be abbreviated, identifiers may not.
// Native file paths are display data, NOT permission to read the current file.
function imageReference(block: Row): Row | null {
  const attachment = block.attachment
  if (!record(attachment) || typeof attachment.attachmentId !== 'string' || !attachment.attachmentId || attachment.attachmentId.length > 4096
    || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(attachment.mediaType)
    || !['bytes', 'width', 'height'].every(key => Number.isSafeInteger(attachment[key]) && attachment[key] > 0)
    || attachment.name !== undefined && typeof attachment.name !== 'string'
    || attachment.originalDimensions !== undefined && (!record(attachment.originalDimensions)
      || !['width', 'height'].every(key => Number.isSafeInteger(attachment.originalDimensions[key]) && attachment.originalDimensions[key] > 0))) return null
  const ref = pick(attachment, ['attachmentId', 'mediaType', 'bytes', 'width', 'height', 'name'])
  if (attachment.originalDimensions) ref.originalDimensions = pick(attachment.originalDimensions, ['width', 'height'])
  return Buffer.byteLength(JSON.stringify(ref)) <= 8192 ? ref : null
}

/** Uniform on-demand source view. No tool-name renderer dispatch. The optional
 * call argument remains accepted by the existing signed-reference API; central
 * read/diff/web card derivation belongs to the mini's inline presenter only. */
export function historyDetailDocument(entry: Row, _call?: Row): DetailDocument {
  const event = entry.event || {}, data = event.data || {}, parts: DetailPart[] = []
  let bytes = 0, overflow = false
  const add = (part: DetailPart) => {
    if (overflow) return
    bytes += Buffer.byteLength(JSON.stringify(part))
    if (parts.length >= MAX_PARTS || bytes > MAX_BYTES) { overflow = true; return }
    parts.push(part)
  }
  const text = (label: string, value: unknown, kind: DetailPart['kind'] = 'text') => {
    const body = prose(value)
    if (body) add({ kind, label, text: body })
  }
  const content = (message: Row, label: string, depth = 0) => {
    if (depth > 8) { add(notice('嵌套内容过深，请在电脑端查看。')); return }
    for (const block of Array.isArray(message?.content) ? message.content : []) {
      if (overflow) break
      if (!record(block)) { add(notice('此内容格式需在电脑端查看。')); continue }
      if (block.type === 'text' || block.type === 'reasoning') text(label, block.text)
      else if (block.type === 'tool-result' && typeof block.content === 'string') text(label, block.content)
      else if (block.type === 'tool-result' && Array.isArray(block.content)) content(block, label, depth + 1)
      else if (block.type === 'image') {
        const ref = imageReference(block)
        if (ref) text('图片引用', ref, 'code')
        else add(notice('此图片没有可用的附件引用，请在电脑端查看。'))
      } else add(notice('此非文字内容请在电脑端查看；未将二进制或内部数据转换为文字。'))
    }
  }
  switch (event.type) {
    case 'tool/ptc-dispatch-start':
    case 'tool/ptc-dispatch':
      text('工具', data.name); text('输入', data.arguments, 'code')
      if (event.type === 'tool/ptc-dispatch') content(data, '输出')
      break
    case 'tool/call': text('工具', data.name); text('输入', data.arguments, 'code'); break
    case 'tool/result': {
      content(data.message, '输出')
      // Native result fields are plain JSON here, not custom read/diff/search
      // widgets. Reuse the same field boundary as inline transport; no config,
      // provider credentials or arbitrary extension internals are dumped.
      const meta = toolRecordPresentation(entry).event?.data?.meta
      if (record(meta) && Object.keys(meta).length) text('结果数据', meta, 'code')
      text('错误', data.error && pick(data.error, ['name', 'code', 'message']))
      if (data.message?.role === 'tool' && toolResultFailed(data.message) && !data.error) add(notice('此工具执行未成功。'))
      break
    }
    case 'assistant/message': case 'assistant/attempt': content(data.message, '回复'); break
    case 'user/message': content(data, '内容'); break
    case 'compaction/summary': content({ content: data.summary }, '摘要'); break
    case 'command/run': text('命令', data.name); text('参数', data.args, 'code'); break
    case 'command/done': text('结果', data.text); break
    case 'request/header': text('模型', data.model); text('提供方', data.provider); break
  }
  if (overflow) return { parts: [notice('此记录超过手机详情读取上限，请在电脑端查看完整内容。')] }
  return { parts: parts.length ? parts : [notice('此事件没有可供手机展示的正文；内部元数据不在这里展开。')] }
}

/** Explicit partial presentation. Do not recursively clip arbitrary objects:
 * doing so corrupts call IDs, URLs, attachment references and projection proofs.
 * If identity/proofs alone exceed the page limit the caller rejects the page. */
export function historyRecordPreview(entry: Row): Row {
  const event = entry.event || {}, data = event.data || {}
  const common = pick(data, ['turn', 'step', 'callId', 'isError'])
  const budget = { chars: 2400, blocks: 16 }
  const content = (blocks: unknown, depth = 0): Row[] => {
    const result: Row[] = []
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (depth > 8 || budget.blocks-- <= 0) break
      if (!record(block)) continue
      if (block.type === 'text' || block.type === 'reasoning') {
        const text = clipped(block.text, Math.min(1200, budget.chars)); budget.chars -= text.length
        if (text) result.push({ type: block.type, text })
      } else if (block.type === 'tool-result') {
        if (typeof block.content === 'string') {
          const text = clipped(block.content, Math.min(1200, budget.chars)); budget.chars -= text.length
          result.push({ ...pick(block, ['type', 'isError']), content: text })
        } else result.push({ ...pick(block, ['type', 'isError']), content: content(block.content, depth + 1) })
      } else if (block.type === 'image') {
        const ref = imageReference(block)
        if (ref) result.push({ type: 'image', attachment: ref })
      }
    }
    return result
  }
  const message = (value: Row = {}) => ({ ...pick(value, ['id', 'role', 'source']), content: content(value.content) })
  let summary: Row
  switch (event.type) {
    case 'tool/ptc-dispatch-start':
    case 'tool/ptc-dispatch':
      summary = { ...pick(data, ['rootCallId', 'parentCallId', 'subCallId', 'name', 'isError']),
        arguments: clipped(prose(data.arguments)), ...(event.type === 'tool/ptc-dispatch' ? { content: content(data.content) } : {}) }
      break
    case 'tool/call': summary = { ...common, name: data.name, arguments: clipped(prose(data.arguments)) }; break
    case 'tool/result': summary = { ...common, message: message(data.message),
      ...(data.error ? { error: { ...pick(data.error, ['name', 'code']), message: clipped(data.error.message, 400) } } : {}) }; break
    case 'assistant/message': case 'assistant/attempt': summary = { ...common, message: message(data.message) }; break
    case 'user/message': summary = { ...common, ...message(data) }; break
    case 'compaction/summary': summary = { ...common, compactionId: data.compactionId, summary: content(data.summary) }; break
    case 'command/run': summary = { ...common, name: data.name, args: clipped(prose(data.args)) }; break
    case 'command/done': summary = { ...common, text: clipped(data.text) }; break
    case 'request/header': summary = pick(data, ['model', 'provider']); break
    // State events cannot be shortened without changing their meaning.
    default: summary = data
  }
  const view = record(entry.view) ? pick(entry.view, ['agentActivity', 'agentResources', 'agentTranscript']) : undefined
  return { event: { ...event, data: summary }, ...(view && Object.keys(view).length ? { view } : {}) }
}
