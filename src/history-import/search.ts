import type { HistoryFragment, HistoryMessage } from './source.js'
import { HistorySourceError } from './source.js'
import { fromMarkdown } from 'mdast-util-from-markdown'

export interface HistorySearchSource { url: string; title?: string; snippet?: string; publishedAt?: number }
const MAX_LINK_GROWTH = 128 * 1024
const MAX_RENDER_BYTES = 24 * 1024 * 1024
const MAX_RESPONSE_CHARS = 1024 * 1024
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function escapeText(value: string): string {
  let cost = Buffer.byteLength(value)
  for (const match of value.matchAll(/[&<>\\`*_{}\[\]()!#|]/g)) {
    cost += match[0] === '&' ? 4 : ['<', '>'].includes(match[0]) ? 3 : 1
    if (cost > MAX_RENDER_BYTES) throw new HistorySourceError('conversation-too-large')
  }
  if (cost > MAX_RENDER_BYTES) throw new HistorySourceError('conversation-too-large')
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()!#|]/g, '\\$&')
}
function literal(value: string): string {
  let maximum = 0
  for (const match of value.matchAll(/`+/g)) maximum = Math.max(maximum, match[0].length)
  if (Buffer.byteLength(value) + maximum * 2 + 4 > MAX_RENDER_BYTES) throw new HistorySourceError('conversation-too-large')
  const ticks = '`'.repeat(maximum + 1)
  return `${ticks} ${value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')} ${ticks}`
}

/** Links are inert history metadata: this module never fetches, opens or executes them. */
function source(value: unknown): HistorySearchSource | undefined {
  if (!object(value) || typeof value.url !== 'string' || value.url.length > 8192
    || !/^https?:\/\//i.test(value.url) || /[\s\u0000-\u001f\u007f<>\\]/.test(value.url)) return
  let parsed: URL
  try { parsed = new URL(value.url) } catch { return }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return
  // Angle-delimited Markdown destinations also need angle brackets encoded.
  const result: HistorySearchSource = { url: parsed.href.replace(/</g, '%3C').replace(/>/g, '%3E') }
  if (typeof value.title === 'string') result.title = value.title
  if (typeof value.snippet === 'string') result.snippet = value.snippet
  if (typeof value.published_at === 'number' && Number.isFinite(value.published_at)) result.publishedAt = value.published_at
  return result
}
function rawSources(part: HistoryFragment): unknown[] {
  if (['SEARCH', 'TOOL_SEARCH'].includes(part.type)) return Array.isArray(part.data.results) ? part.data.results : []
  return part.type === 'TOOL_OPEN' && part.data.result !== null && part.data.result !== undefined ? [part.data.result] : []
}
function collected(part: HistoryFragment): HistorySearchSource[] {
  const raw = rawSources(part)
  const results: HistorySearchSource[] = []
  let cost = 0
  for (const item of raw) {
    const result = source(item)
    if (!result) continue
    cost += result.url.length + (result.title?.length ?? 0) + (result.snippet?.length ?? 0)
    if (cost > MAX_RENDER_BYTES) throw new HistorySourceError('conversation-too-large')
    results.push(result)
  }
  return results
}

/** No array-position guesses: export ZIPs only have URL/title, not citation IDs. */
export function historySearchSources(part: HistoryFragment): HistorySearchSource[] { return collected(part) }

/** Preserve unmodelled source facts as inert history, not a claimed native
 * execution/result. Structured fields stay literal, including future schemas;
 * they are never interpreted as executable Markdown, links or instructions. */
export function historicalFragmentText(part: HistoryFragment): string | undefined {
  if (['REQUEST', 'RESPONSE', 'THINK', 'FILE', 'SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN', 'TIP'].includes(part.type)) return
  // Compact JSON prevents indentation from amplifying deeply nested metadata.
  const data = Object.keys(part.data).length ? JSON.stringify(part.data) : ''
  if (!part.content && !data && part.type !== 'TOOL_FIND') return
  const label = part.type === 'TOOL_FIND' ? '网页内查找' : `网页原记录 ${escapeText(part.type)}`
  const lines = [`${label}（历史记录，未重新执行）`]
  if (part.content) lines.push(part.content)
  if (part.type === 'TOOL_FIND' && typeof part.data.pattern === 'string') lines.push(`查找内容：${part.data.pattern}`)
  if (part.type === 'TOOL_FIND' && typeof part.data.status === 'string') lines.push(`原记录状态：${part.data.status}`)
  if (data) lines.push(data)
  else if (part.type === 'TOOL_FIND') lines.push('源数据未提供查找详情。')
  // Use one literal block: unknown strings may contain Markdown, HTML, URLs or
  // an attempted closing fence. The raw fragment remains in the archive too.
  const body = lines.slice(1).join('\n\n')
  let fenceLength = 3
  for (const match of body.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1)
  if (Buffer.byteLength(lines[0]) + Buffer.byteLength(body) + fenceLength * 2 + 6 > MAX_RENDER_BYTES) {
    throw new HistorySourceError('conversation-too-large')
  }
  const fence = '`'.repeat(fenceLength)
  return `${lines[0]}\n\n${fence}\n${body}\n${fence}`
}

export function historicalSourceText(part: HistoryFragment): string | undefined {
  if (part.type === 'TOOL_FIND') return historicalFragmentText(part)
  if (!['SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN'].includes(part.type)) return
  if (part.type === 'TOOL_OPEN' && !part.content && !Object.keys(part.data).length) return
  const lines = ['原网页检索资料（历史记录）']
  let bytes = 0
  const append = (value: string) => {
    bytes += Buffer.byteLength(value) + 2
    if (bytes > MAX_RENDER_BYTES) throw new HistorySourceError('conversation-too-large')
    lines.push(value)
  }
  if (part.content) append(escapeText(part.content))
  const queries = Array.isArray(part.data.queries) ? part.data.queries : []
  for (const item of queries) if (object(item) && typeof item.query === 'string') {
    append(`查询：${escapeText(item.query)}`)
  }
  for (const [index, raw] of rawSources(part).entries()) {
    if (!object(raw)) throw new HistorySourceError('invalid-source')
    const item = source(raw), url = typeof raw.url === 'string' ? raw.url : ''
    const title = typeof raw.title === 'string' ? raw.title : ''
    // Unsafe destinations are retained as escaped text, not executable links.
    append(item ? `${index + 1}. [${escapeText(title || url)}](<${item.url}>)`
      : `${index + 1}. ${escapeText(title)} ${literal(url)}（原链接不生成快捷入口）`)
    if (typeof raw.snippet === 'string' && raw.snippet) append(`   ${escapeText(raw.snippet)}`)
  }
  if (!rawSources(part).length) append('源数据未提供可展示的网页结果；未补造搜索内容。')
  return lines.join('\n\n')
}

function referenceResolver(message: HistoryMessage): (part: HistoryFragment, index: number, kind: string) => HistorySearchSource[] {
  // Source IDs are scoped to ONE message. Duplicate IDs/types are ambiguous.
  const fragments = new Map<string, HistoryFragment | null>()
  const citations = new Map<number, unknown | null>()
  const key = (id: unknown, type: unknown): string | undefined => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
    && typeof type === 'string' ? `${type}:${id}` : undefined
  for (const part of message.fragments) {
    const name = key(part.data.id, part.type)
    if (name) fragments.set(name, fragments.has(name) ? null : part)
    if (part.type === 'SEARCH') for (const result of rawSources(part)) {
      if (!object(result) || typeof result.cite_index !== 'number' || !Number.isSafeInteger(result.cite_index)) continue
      citations.set(result.cite_index, citations.has(result.cite_index) ? null : result)
    }
  }
  function walk(ref: unknown, visited: Set<string>, budget: { left: number }): HistorySearchSource[] {
    if (!object(ref) || --budget.left < 0) return []
    const name = key(ref.id, ref.type)
    if (!name || visited.has(name)) return []
    visited.add(name)
    const target = fragments.get(name)
    if (!target) return []
    if (target.type === 'TOOL_SEARCH') {
      const raw = rawSources(target), results = raw.length <= 64 ? collected(target) : []
      return raw.length === results.length ? results : []
    }
    if (target.type === 'TOOL_OPEN' && target.data.result !== null && target.data.result !== undefined) return collected(target)
    if (object(target.data.reference)) return walk(target.data.reference, visited, budget)
    // Some website fragments forward to another fragment; never follow a cycle.
    if (Array.isArray(target.data.references)) {
      if (target.data.references.length > 64) return []
      const result: HistorySearchSource[] = []
      for (const child of target.data.references) {
        const nested = walk(child, visited, budget)
        if (!nested.length) return []
        result.push(...nested)
      }
      return result.length <= 64 ? result : []
    }
    return []
  }
  return (part, index, kind) => {
    if (kind === 'reference') {
      const refs = part.data.references
      if (!Array.isArray(refs) || refs.length > 10000) return []
      return walk(refs[index], new Set(), { left: 64 })
    }
    // Legacy website citations use the explicit cite_index, NOT result order.
    const result = source(citations.get(index))
    return result ? [result] : []
  }
}

/** Use the same CommonMark parser family as DSH, then splice source offsets:
 * serializing the AST would rewrite whitespace and unrelated original text. */
function replaceReferences(text: string, replace: (token: string, kind: string, index: number) => string): string {
  type Node = { type: string; value?: string; children?: Node[]; position?: { start: { offset?: number }; end: { offset?: number } } }
  const stack: Node[] = [fromMarkdown(text)], ranges: { start: number; end: number }[] = [], html: { start: number; end: number; value: string }[] = []
  let nodes = 0
  while (stack.length) {
    const node = stack.pop()!
    if (++nodes > 100000) return text
    const start = node.position?.start.offset, end = node.position?.end.offset
    if (node.type === 'html') {
      if (start !== undefined && end !== undefined) html.push({ start, end, value: node.value ?? '' })
      continue
    }
    if (['code', 'inlineCode', 'link', 'linkReference', 'image', 'imageReference', 'definition'].includes(node.type)) continue
    if (node.type === 'text' && start !== undefined && end !== undefined) ranges.push({ start, end })
    if (node.children) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
  }
  // Inline HTML tags are separate AST nodes. Protect their contents as well as
  // the tags; a simple <br> is not a container for the rest of the paragraph.
  const protectedRanges: { start: number; end: number }[] = [], tags: { name: string; start: number }[] = []
  for (const item of html) {
    const opening = /^<([a-z][\w-]*)\b[^>]*>$/i.exec(item.value.trim()), closing = /^<\/([a-z][\w-]*)\s*>$/i.exec(item.value.trim())
    if (opening && !/\/>$/.test(item.value.trim()) && !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(opening[1])) {
      tags.push({ name: opening[1].toLowerCase(), start: item.start })
    } else if (closing) {
      let index = tags.length - 1
      while (index >= 0 && tags[index].name !== closing[1].toLowerCase()) index--
      if (index >= 0) { protectedRanges.push({ start: tags[index].start, end: item.end }); tags.splice(index) }
    }
  }
  for (const tag of tags) protectedRanges.push({ start: tag.start, end: text.length })
  // Bare URLs and malformed link examples may legitimately be text nodes.
  // Never edit inside a destination, even when it is not a Markdown link.
  for (const match of text.matchAll(/\b(?!(?:reference|citation):)[a-z][a-z0-9+.-]*:(?:\/\/)?[^\s<>"']+/gi)) {
    protectedRanges.push({ start: match.index!, end: match.index! + match[0].length })
  }
  const edits: { start: number; end: number; value: string }[] = []
  let added = 0
  for (const range of ranges) for (const match of text.slice(range.start, range.end).matchAll(/\[(reference|citation):(\d{1,10})\]/g)) {
    const start = range.start + match.index!, end = start + match[0].length
    if (protectedRanges.some(item => item.start <= start && end <= item.end)) continue
    let escaped = 0
    for (let i = start - 1; i >= 0 && text[i] === '\\'; i--) escaped++
    if (escaped % 2 || text[start - 1] === '!' || /^\s*:/.test(text.slice(end, end + 8))) continue
    const value = replace(match[0], match[1], Number(match[2]))
    added += value.length - match[0].length
    if (added > MAX_LINK_GROWTH) return text
    if (value !== match[0]) edits.push({ start, end, value })
  }
  let cursor = 0
  const output: string[] = []
  for (const edit of edits) { output.push(text.slice(cursor, edit.start), edit.value); cursor = edit.end }
  output.push(text.slice(cursor))
  return output.join('')
}

/** Display-only conversion; original fragment content/data remain unchanged in
 * the archival event. Official mapping: [reference:n] -> references[n] -> same
 * message's (id,type); TOOL_SEARCH denotes a group, TOOL_OPEN a single result. */
export function renderHistoryResponse(message: HistoryMessage, part: HistoryFragment): string {
  const text = part.content ?? ''
  if (part.type !== 'RESPONSE' || text.length > MAX_RESPONSE_CHARS || !/\[(?:reference|citation):\d+\]/.test(text)) return text
  // A pathological number of adjacent bracket tokens is costly to parse.
  // This only forgoes display links: the complete original text is retained.
  let markers = 0
  for (const _match of text.matchAll(/\[(?:reference|citation):\d+\]/g)) if (++markers > 4096) return text
  const resolve = referenceResolver(message), cache = new Map<string, string>()
  return replaceReferences(text, (token, kind, index) => {
    const prior = cache.get(token)
    if (prior !== undefined) return prior
    const results = resolve(part, index, kind), seen = new Set<string>()
    const unique = results.filter(result => !seen.has(result.url) && !!seen.add(result.url))
    const rendered = unique.length && unique.length <= 64
      ? unique.map((item, i) => `[来源 ${index + 1}${unique.length > 1 ? `.${i + 1}` : ''}](<${item.url}>)`).join(' ')
      : token
    cache.set(token, rendered)
    return rendered
  })
}
