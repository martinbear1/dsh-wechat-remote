import { createHash } from 'node:crypto'
import { MAX_SOURCE_BYTES, readExportZip } from './source-zip.js'

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }
export interface HistoryFile {
  id?: string
  name: string
  size?: number
  isImage?: boolean
  metadata: JsonObject
}
export interface HistoryFragment { type: string; content?: string; files?: HistoryFile[]; data: JsonObject }
export interface HistoryMessage {
  id: string
  parentId: string | null
  role: 'user' | 'assistant' | 'unknown'
  text: string
  reasoning: string
  model?: string
  createdAt?: string
  fragments: HistoryFragment[]
  metadata: JsonObject
  warnings: string[]
}
export interface HistoryConversation {
  id: string
  title: string
  createdAt?: string
  updatedAt?: string
  modelType?: string
  messages: HistoryMessage[]
  leafIds: string[]
  warnings: string[]
  metadata?: JsonObject
}
export interface HistorySource { kind: 'share' | 'export'; sourceHash: string; conversations: HistoryConversation[] }
export class HistorySourceError extends Error {
  constructor(readonly code: string) { super(`history-import/${code}`); this.name = 'HistorySourceError' }
}
const fail = (code = 'invalid-source'): never => { throw new HistorySourceError(code) }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const identifier = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value
  : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : fail('invalid-message-id')
const timestamp = (value: unknown): string | undefined => {
  const time = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(time) && Math.abs(time) <= 8640000000000000 ? new Date(time).toISOString() : undefined
}
function metadata(value: Record<string, unknown>, omitted: string[]): JsonObject {
  const output: JsonObject = Object.create(null)
  for (const [key, entry] of Object.entries(value)) if (!omitted.includes(key)) output[key] = entry as JsonValue
  return output
}
function validateNesting(value: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  let count = 0
  while (pending.length) {
    const current = pending.pop()!
    if (++count > 2000000 || current.depth > 32) return fail('source-too-complex')
    if (Array.isArray(current.value) || record(current.value)) {
      for (const child of Object.values(current.value)) if (child !== null && typeof child === 'object') pending.push({ value: child, depth: current.depth + 1 })
    }
  }
}
const knownFragments = new Set(['REQUEST', 'RESPONSE', 'THINK', 'FILE', 'SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN', 'TOOL_FIND', 'TIP'])
function fragments(value: unknown, warnings: Set<string>): HistoryFragment[] {
  if (!Array.isArray(value) || value.length > 10000) return fail('invalid-fragments')
  return value.map(entry => {
    if (!record(entry) || typeof entry.type !== 'string' || !entry.type || entry.type.length > 128) return fail('invalid-fragment')
    if (entry.content !== undefined && typeof entry.content !== 'string') return fail('invalid-fragment-content')
    if (!knownFragments.has(entry.type)) warnings.add('unknown-fragment-type')
    const item: HistoryFragment = { type: entry.type, data: metadata(entry, ['type', 'content', 'files']) }
    if (typeof entry.content === 'string') item.content = entry.content
    if (entry.files !== undefined) {
      if (!Array.isArray(entry.files) || entry.files.length > 1000) return fail('invalid-files')
      item.files = entry.files.map(file => {
        if (!record(file) || typeof file.file_name !== 'string') return fail('invalid-file')
        const id = file.file_id ?? file.id
        const size = typeof file.file_size === 'number' && Number.isSafeInteger(file.file_size) && file.file_size >= 0 ? file.file_size : undefined
        const result: HistoryFile = { name: file.file_name, metadata: metadata(file, ['file_id', 'id', 'file_name', 'file_size', 'is_image', 'signed_path']) }
        if (typeof id === 'string') result.id = id
        if (size !== undefined) result.size = size
        if (typeof file.is_image === 'boolean') result.isImage = file.is_image
        return result
      })
      if (item.files.length) warnings.add('attachment-content-unavailable')
    }
    if (entry.type === 'TOOL_OPEN' && Object.keys(item.data).length === 0 && !item.content) warnings.add('search-detail-unavailable')
    return item
  })
}
function message(value: Record<string, unknown>, id: string, parentId: string | null, share: boolean): HistoryMessage {
  const warnings = new Set<string>(), parts = fragments(value.fragments, warnings)
  const user = parts.some(part => part.type === 'REQUEST' || part.type === 'FILE')
  const assistant = parts.some(part => ['RESPONSE', 'THINK', 'SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN', 'TOOL_FIND'].includes(part.type))
  const role: HistoryMessage['role'] = share ? value.role === 'USER' ? 'user' : value.role === 'ASSISTANT' ? 'assistant' : 'unknown'
    : user && !assistant ? 'user' : assistant && !user ? 'assistant' : 'unknown'
  if (role === 'unknown') warnings.add('message-role-unavailable')
  if ((role === 'user' && assistant) || (role === 'assistant' && user)) warnings.add('message-role-conflict')
  const result: HistoryMessage = { id, parentId, role, fragments: parts,
    text: parts.filter(part => part.type === 'REQUEST' || part.type === 'RESPONSE').map(part => part.content ?? '').join('\n\n'),
    reasoning: parts.filter(part => part.type === 'THINK').map(part => part.content ?? '').join('\n\n'),
    metadata: metadata(value, ['message_id', 'parent_id', 'role', 'fragments']), warnings: [...warnings] }
  if (text(value.model)?.trim()) result.model = value.model as string
  else warnings.add('model-unavailable')
  const createdAt = timestamp(value.inserted_at)
  if (createdAt) result.createdAt = createdAt
  result.warnings = [...warnings]
  return result
}
function graph(conversation: HistoryConversation): HistoryConversation {
  const messages = conversation.messages, byId = new Map(messages.map(item => [item.id, item]))
  if (byId.size !== messages.length) return fail('duplicate-message-id')
  const parents = new Set<string>(), visited = new Set<string>()
  for (const item of messages) {
    const path = new Set<string>()
    let current: HistoryMessage | undefined = item
    while (current && !visited.has(current.id)) {
      if (path.has(current.id)) return fail('cyclic-messages')
      path.add(current.id)
      if (current.parentId === null) break
      parents.add(current.parentId)
      current = byId.get(current.parentId)
      if (!current) return fail('missing-parent')
    }
    for (const id of path) visited.add(id)
  }
  conversation.leafIds = messages.filter(item => !parents.has(item.id)).map(item => item.id)
  if (conversation.leafIds.length > 1) conversation.warnings.push('branch-selection-required')
  conversation.warnings = [...new Set([...conversation.warnings, ...messages.flatMap(item => item.warnings)])]
  return conversation
}
function exportConversation(value: unknown): HistoryConversation {
  if (!record(value) || typeof value.title !== 'string' || !record(value.mapping)) return fail('invalid-export-conversation')
  const nodes = Object.entries(value.mapping)
  if (nodes.length > 10001) return fail('conversation-too-large')
  const roots = new Set<string>()
  for (const [id, raw] of nodes) {
    if (!record(raw) || identifier(raw.id) !== id || !Array.isArray(raw.children)) return fail('invalid-export-node')
    if (raw.message === null) {
      if (raw.parent !== null) return fail('invalid-root')
      roots.add(id)
    }
  }
  const messages: HistoryMessage[] = []
  for (const [id, raw] of nodes) {
    const node = raw as Record<string, unknown>
    for (const childId of node.children as unknown[]) {
      const child = value.mapping[identifier(childId)]
      if (!record(child) || child.parent !== id) return fail('invalid-child-link')
    }
    if (node.parent !== null) {
      const parent = value.mapping[identifier(node.parent)]
      if (!record(parent) || !Array.isArray(parent.children) || !parent.children.includes(id)) return fail('invalid-parent-link')
    }
    if (node.message === null) continue
    if (!record(node.message)) return fail('invalid-export-message')
    const parent = node.parent === null ? null : identifier(node.parent)
    messages.push(message(node.message, id, parent !== null && roots.has(parent) ? null : parent, false))
  }
  return graph({ id: identifier(value.id), title: value.title, createdAt: timestamp(value.inserted_at), updatedAt: timestamp(value.updated_at),
    messages, leafIds: [], metadata: metadata(value, ['id', 'title', 'mapping']), warnings: ['web-system-prompt-unavailable'] })
}
function shareConversation(value: Record<string, unknown>): HistoryConversation {
  if (!Array.isArray(value.messages) || typeof value.title !== 'string') return fail('invalid-share')
  if (value.messages.length > 10000) return fail('conversation-too-large')
  const messages = value.messages.map(raw => {
    if (!record(raw)) return fail('invalid-share-message')
    return message(raw, identifier(raw.message_id), raw.parent_id === null ? null : identifier(raw.parent_id), true)
  })
  const warnings = ['shared-selection-only', 'web-system-prompt-unavailable']
  // The official share UI can publish a selected excerpt while retaining the
  // first message's original (unshared) parent. Admit only this one boundary:
  // every remaining message must belong to its connected, otherwise valid
  // tree. Never repair a missing link in the middle or relax full ZIP exports.
  const first = messages[0], ids = new Set(messages.map(item => item.id))
  if (first?.parentId !== null && first?.parentId !== undefined && !ids.has(first.parentId)) {
    if (ids.size !== messages.length) return fail('duplicate-message-id')
    const children = new Map<string, string[]>()
    for (const item of messages.slice(1)) {
      if (item.parentId === null || !ids.has(item.parentId)) return fail('missing-parent')
      const siblings = children.get(item.parentId) ?? []
      siblings.push(item.id); children.set(item.parentId, siblings)
    }
    const connected = new Set<string>(), pending = [first.id]
    while (pending.length) {
      const id = pending.pop()!
      if (connected.has(id)) return fail('cyclic-messages')
      connected.add(id); pending.push(...(children.get(id) ?? []))
    }
    if (connected.size !== messages.length) return fail('missing-parent')
    // parentId describes the local selected path. The original parent remains
    // auditable in the per-message metadata copied into the native RECORD.
    first.metadata.parent_id = (value.messages[0] as JsonObject).parent_id
    first.parentId = null
    first.warnings.push('shared-earlier-history-unavailable')
    warnings.push('shared-earlier-history-unavailable')
  }
  return graph({ id: 'shared-conversation', title: value.title, modelType: text(value.model_type), messages, leafIds: [],
    metadata: metadata(value, ['title', 'messages']), warnings })
}

/** Pure source normalization. No networking, credentials, model calls, filesystem writes or host mutation. */
export async function parseHistorySource(input: Buffer | string | unknown): Promise<HistorySource> {
  let bytes: Buffer
  try { bytes = Buffer.isBuffer(input) ? input : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf8') } catch { return fail('invalid-json') }
  if (bytes.length > MAX_SOURCE_BYTES) return fail('source-too-large')
  const sourceHash = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    try { bytes = await readExportZip(bytes) } catch { return fail('invalid-zip') }
  }
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')) } catch { return fail('invalid-json') }
  validateNesting(value)
  if (Array.isArray(value)) {
    if (value.length > 10000) return fail('too-many-conversations')
    const conversations = value.map(exportConversation), ids = new Set(conversations.map(item => item.id))
    if (ids.size !== conversations.length) return fail('duplicate-conversation-id')
    return { kind: 'export', sourceHash, conversations }
  }
  if (record(value) && Array.isArray(value.messages)) return { kind: 'share', sourceHash, conversations: [shareConversation(value)] }
  if (record(value) && value.code === 0 && record(value.data) && value.data.biz_code === 0 && record(value.data.biz_data)) {
    return { kind: 'share', sourceHash, conversations: [shareConversation(value.data.biz_data)] }
  }
  return fail('unsupported-source')
}

/** Count one selected path, independent of export mapping order. Each user
 * message starts a turn; a leading assistant-only group is retained as a turn.
 * Unknown roles have no trustworthy count and must never be guessed from size. */
export function countHistoryTurns(messages: readonly HistoryMessage[]): number | undefined {
  if (messages.some(m => m.role === 'unknown' || m.warnings.includes('message-role-conflict'))) return undefined
  return messages.reduce((count, m) => count + (m.role === 'user' || m.parentId === null ? 1 : 0), 0)
}

/** Preserve the branch graph in the catalog; require an explicit leaf whenever alternatives exist. */
export function selectHistoryBranch(conversation: HistoryConversation, leafId?: string): HistoryConversation {
  if (!conversation.leafIds.length) return fail('empty-conversation')
  if (!leafId && conversation.leafIds.length !== 1) return fail('branch-required')
  const selected = leafId ?? conversation.leafIds[0]
  if (!conversation.leafIds.includes(selected)) return fail('invalid-branch')
  const byId = new Map(conversation.messages.map(item => [item.id, item])), path: HistoryMessage[] = [], seen = new Set<string>()
  let current = byId.get(selected)
  while (current) {
    if (seen.has(current.id)) return fail('cyclic-messages')
    seen.add(current.id); path.push(current)
    if (current.role === 'unknown' || current.warnings.includes('message-role-conflict')) return fail('unsupported-message-role')
    if (current.parentId === null) break
    current = byId.get(current.parentId)
    if (!current) return fail('missing-parent')
  }
  // Graph-wide warnings include all alternatives. Only the selected path's
  // losses belong in its preview; another branch's missing file is irrelevant.
  const messageWarnings = new Set(conversation.messages.flatMap(m => m.warnings))
  const warnings = [...new Set([...conversation.warnings.filter(w => w !== 'branch-selection-required' && !messageWarnings.has(w)), ...path.flatMap(m => m.warnings)])]
  return { ...conversation, messages: path.reverse(), leafIds: [selected], warnings }
}
