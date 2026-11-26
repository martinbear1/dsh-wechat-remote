import { openZipFile, type ZipReader } from './zip-reader.js'
import { HistorySourceError, parseHistorySource, normalizeHistoryMessage, validateHistoryGraph, validateNesting,
  type HistorySource, type HistoryConversation, type JsonObject } from './source.js'
import { MAX_FILE_NORMALIZED_BYTES, MAX_MESSAGES } from './limits.js'

const fail = (code = 'invalid-export-conversation'): never => { throw new HistorySourceError(code) }
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const time = (value: unknown): string | undefined => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
function json(bytes: Buffer): unknown {
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')) } catch { return fail('invalid-json') }
  validateNesting(value); return value
}
export function normalizeV3Conversation(value: unknown, expectedId: string): HistoryConversation {
  if (!record(value) || value.id !== expectedId || !safeId(value.id) || value.title !== null && typeof value.title !== 'string'
    || !Array.isArray(value.messages) || !value.messages.length) return fail()
  if (value.messages.length > MAX_MESSAGES) return fail('message-limit')
  const messages = value.messages.map((raw: unknown) => {
    if (!record(raw) || !Number.isSafeInteger(raw.id) || raw.id < 0 || raw.parent_id !== null && (!Number.isSafeInteger(raw.parent_id) || raw.parent_id < 0)
      || !['USER', 'ASSISTANT'].includes(raw.role) || typeof raw.status !== 'string' || !time(raw.inserted_at) || !Array.isArray(raw.fragments)) return fail()
    const normalized = normalizeHistoryMessage(raw, String(raw.id), raw.parent_id === null ? null : String(raw.parent_id), true)
    for (const [index, part] of normalized.fragments.entries()) {
      // The v3 exporter writes string query arrays. Adapt to the established
      // historical search mapper without fabricating live search results.
      if (part.type === 'TOOL_SEARCH' && Array.isArray(part.data.queries)) {
        part.data.queries = part.data.queries.map(q => typeof q === 'string' ? { query: q } : q)
        if (part.data.status === undefined) part.data.status = 'FINISHED'
      }
      for (const [fileIndex, file] of (part.files ?? []).entries()) {
        const original = raw.fragments[index]?.files?.[fileIndex]
        if (file.isImage && typeof original?.export_path === 'string'
          && original.export_path.startsWith(`chat_sessions/${expectedId}_files/`)
          && !/[\\\x00:]/.test(original.export_path) && !original.export_path.split('/').some((segment: string) => segment === '.' || segment === '..')) {
          file.exportPath = original.export_path
        }
      }
    }
    return normalized
  })
  const result = validateHistoryGraph({ id: value.id, title: value.title || 'DeepSeek 网页会话', createdAt: time(value.inserted_at),
    messages, leafIds: [], warnings: ['web-system-prompt-unavailable'], exportFormatVersion: 3,
    metadata: { export_format_version: 3 }, archiveEntry: `chat_sessions/${expectedId}.json` })
  const preferred = Number.isSafeInteger(value.current_message_id) && messages.some(m => m.id === String(value.current_message_id))
    ? String(value.current_message_id) : messages.reduce((latest, message) => Number(message.id) > Number(latest) ? message.id : latest, messages[0].id)
  result.currentMessageId = preferred
  // Retain explicit branch choice. Native's selected current message appears
  // first, including exports whose current message is an internal tree node.
  result.leafIds = [preferred, ...result.leafIds.filter(id => id !== preferred)]
  return result
}
async function v3(archive: ZipReader): Promise<boolean> {
  if (!archive.entries.has('manifest.json')) return false
  const manifest = json(await archive.read('manifest.json', 64 * 1024))
  if (!record(manifest) || manifest.export_format_version !== 3) return fail('unsupported-source')
  return true
}
/** Catalog only for v3: don't retain every conversation or image in RAM. */
export async function parseArchiveCatalog(file: string | Buffer): Promise<{ source: HistorySource; bytes: number }> {
  const archive = await openZipFile(file)
  try {
    const sourceHash = await archive.hash()
    if (!await v3(archive)) {
      const source = await parseHistorySource(await archive.read('conversations.json', MAX_FILE_NORMALIZED_BYTES), undefined, true)
      source.sourceHash = sourceHash
      const bytes = Buffer.byteLength(JSON.stringify(source))
      if (bytes > MAX_FILE_NORMALIZED_BYTES) throw new HistorySourceError('source-too-large', bytes, MAX_FILE_NORMALIZED_BYTES)
      return { source, bytes }
    }
    const rows = json(await archive.read('chat_session_index.json', 8 * 1024 * 1024))
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) return fail('too-many-conversations')
    const seen = new Set<string>(), conversations: HistoryConversation[] = []
    for (const row of rows) {
      if (!record(row) || !safeId(row.id) || !time(row.inserted_at) || !time(row.updated_at)) return fail()
      if (seen.has(row.id)) return fail('duplicate-conversation-id')
      seen.add(row.id)
      const entry = `chat_sessions/${row.id}.json`
      if (!archive.entries.has(entry)) return fail('invalid-zip')
      conversations.push(typeof file !== 'string' ? normalizeV3Conversation(json(await archive.read(entry, MAX_FILE_NORMALIZED_BYTES)), row.id) : { id: row.id, title: typeof row.title === 'string' && row.title.trim() ? row.title.slice(0, 160) : 'DeepSeek 网页会话',
        createdAt: time(row.inserted_at), updatedAt: time(row.updated_at), messages: [], leafIds: ['pending'], warnings: [],
        catalogMessages: Number.isSafeInteger(row.message_count) && row.message_count >= 0 ? row.message_count : 0,
        archiveEntry: entry, exportFormatVersion: 3 })
    }
    conversations.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id))
    const source: HistorySource = { kind: 'export', sourceHash, conversations }
    const bytes = Buffer.byteLength(JSON.stringify(source))
    if (bytes > MAX_FILE_NORMALIZED_BYTES) throw new HistorySourceError('source-too-large', bytes, MAX_FILE_NORMALIZED_BYTES)
    return { source, bytes }
  } finally { await archive.close() }
}
export async function readArchiveConversation(file: string, id: string): Promise<HistoryConversation> {
  if (!safeId(id)) return fail()
  const archive = await openZipFile(file)
  try {
    if (!await v3(archive)) return fail('unsupported-source')
    const conversation = normalizeV3Conversation(json(await archive.read(`chat_sessions/${id}.json`, MAX_FILE_NORMALIZED_BYTES)), id)
    const bytes = Buffer.byteLength(JSON.stringify(conversation))
    if (bytes > MAX_FILE_NORMALIZED_BYTES) throw new HistorySourceError('source-too-large', bytes, MAX_FILE_NORMALIZED_BYTES)
    // Absence or excess size is disclosed at preview, before native writes.
    for (const message of conversation.messages) {
      let missing = false
      for (const part of message.fragments) for (const file of part.files ?? []) {
        const entry = file.exportPath && archive.entries.get(file.exportPath)
        if (!entry || entry.expanded > 20 * 1024 * 1024 || entry.bytes > 20 * 1024 * 1024 || !/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) { delete file.exportPath; missing = true }
      }
      if (!missing) message.warnings = message.warnings.filter(w => w !== 'attachment-content-unavailable')
    }
    if (!conversation.messages.some(message => message.warnings.includes('attachment-content-unavailable'))) {
      conversation.warnings = conversation.warnings.filter(w => w !== 'attachment-content-unavailable')
    }
    return conversation
  } finally { await archive.close() }
}
export async function readArchiveImage(file: string, entry: string): Promise<Buffer> {
  const archive = await openZipFile(file)
  try { return await archive.read(entry, 20 * 1024 * 1024) } finally { await archive.close() }
}
