/** One-way, creation-only adapter to DSH's public Agent factory and Session
 * persistence contracts. Never writes host logs/configuration directly, starts a model turn,
 * or changes an existing Session. Optional native modules load only on demand. */
import { createHash } from 'node:crypto'
import type { HistoryConversation, HistoryMessage } from './source.js'

type Native = Record<string, any>
export interface ImportHost { get(name: string): any }
export interface NativeImportRequest {
  sessionId: string
  workspaceId: string
  sourceHash: string
  branchId?: string
  presetId?: string
  conversation: HistoryConversation
}
export type NativeImportIdentity = Pick<NativeImportRequest, 'sessionId' | 'workspaceId' | 'sourceHash' | 'branchId'>
export interface NativeImportInspection {
  state: 'succeeded' | 'uncertain' | 'not-found'
  sessionId: string
  workspaceId: string
  title?: string
  messageCount?: number
  message?: string
}
export class NativeImportError extends Error {
  constructor(readonly code: string) { super(`history-import/${code}`); this.name = 'NativeImportError' }
}
/** Only thrown before the native factory has been called. Later failures must
 * remain uncertain: the caller must never retry a possibly persisted import. */
export class NativeImportPreflightError extends NativeImportError {
  readonly rejectedBeforeCreate = true
}
const fail = (code: string): never => { throw new NativeImportError(code) }
const SOURCE = 'harness-remote/history-import/source'
const RECORD = 'harness-remote/history-import/record'
const COMPLETE = 'harness-remote/history-import/complete'
// Product limits, not native DSH limits. At most eight events per source message.
const MAX_MESSAGES = 5000
const MAX_EVENTS = MAX_MESSAGES * 8 + 16
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const row = (value: unknown): value is Native => !!value && typeof value === 'object' && !Array.isArray(value)
const moduleName = (name: string): string => `@deepseek-ai/dsh-${name}`
async function nativeModules(): Promise<{ session: Native; catalog: Native }> {
  try {
    const [session, catalogModule] = await Promise.all([import(moduleName('session')), import(moduleName('session-format-catalog'))])
    const catalog = catalogModule.sessionFormatCatalog
    if (session.SESSION_FORMAT_VERSION !== 4 || catalog?.currentVersion !== 4
      || typeof session.Session?.create !== 'function' || typeof catalog.createRestore !== 'function'
      || typeof catalog.encodeCurrentHeader !== 'function' || typeof catalog.encodeCurrentEvent !== 'function') fail('native-unavailable')
    return { session, catalog }
  } catch { return fail('native-unavailable') }
}
function services(ctx: ImportHost): Native {
  const value = Object.fromEntries(['agents', 'sessions', 'sessionPersistence', 'workspaceRegistry', 'agentDefaultModel', 'agentPresets'].map(key => [key, ctx.get(key)]))
  for (const [key, methods] of Object.entries({ agents: ['get', 'create'], sessions: ['get', 'flush'],
    sessionPersistence: ['stat', 'open'], workspaceRegistry: ['get'], agentDefaultModel: ['currentSelection'] })) {
    if (methods.some(method => typeof value[key]?.[method] !== 'function')) fail('native-unavailable')
  }
  return value
}
export async function nativeCapabilities(ctx: ImportHost): Promise<{ supported: boolean; reason?: string }> {
  try { services(ctx); await nativeModules(); return { supported: true } }
  catch { return { supported: false, reason: '此节点的 DSH 尚未提供本功能所需的原生会话接口，请更新 DSH。' } }
}
function identity(request: NativeImportIdentity): void {
  if (!/^session-dsimport-[0-9a-f-]{36}$/.test(request.sessionId)
    || typeof request.workspaceId !== 'string' || !request.workspaceId || request.workspaceId.length > 256
    || !/^[0-9a-f]{64}$/.test(request.sourceHash)
    || request.branchId !== undefined && (typeof request.branchId !== 'string' || request.branchId.length > 512)) fail('invalid-identity')
}
function eventTime(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : Date.parse(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}
function content(message: HistoryMessage): Native[] {
  const blocks: Native[] = []
  // Fragment order is source order: reasoning, search, further reasoning and
  // final text may interleave. Do not flatten or rewrite this chronology.
  if (!message.fragments.length) {
    if (message.reasoning) blocks.push({ type: 'reasoning', text: message.reasoning })
    if (message.text) blocks.push({ type: 'text', text: message.text })
  }
  // Search facts remain visibly labelled historical source material. They are
  // not fabricated native tool calls/results or executable commands.
  for (const part of message.fragments) {
    if (part.type === 'THINK' && part.content !== undefined) blocks.push({ type: 'reasoning', text: part.content })
    if (['REQUEST', 'RESPONSE'].includes(part.type) && part.content !== undefined) blocks.push({ type: 'text', text: part.content })
    if (['SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN'].includes(part.type) && (part.content || Object.keys(part.data).length)) {
      blocks.push({ type: 'text', text: `\n\n[网页原记录中的检索资料]\n${JSON.stringify({ type: part.type, ...(part.content ? { content: part.content } : {}), ...part.data })}` })
    }
    for (const file of part.files ?? []) blocks.push({ type: 'text', text: `\n[原记录附件：${file.name}；源文件未包含在导出数据中]` })
    if (!['REQUEST', 'RESPONSE', 'THINK', 'SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN', 'FILE'].includes(part.type) && part.content) {
      blocks.push({ type: 'text', text: `\n[网页原记录 ${part.type}]\n${part.content}` })
    }
  }
  return blocks
}
/** Canonical, plugin-independent visible messages plus ignorable archival facts.
 * No original web system prompt is assumed or elevated into host authority. */
export function buildNativeImportSeed(request: NativeImportRequest, now = Date.now()): Native[] {
  identity(request)
  const conversation = request.conversation
  if (!conversation || !Array.isArray(conversation.messages) || !conversation.messages.length || conversation.messages.length > MAX_MESSAGES) fail('message-limit')
  const events: Native[] = [], title = conversation.title.trim().slice(0, 160) || 'DeepSeek 网页会话'
  const append = (type: string, data: Native, time: number, surface = false, ignorable = false) => {
    events.push({ type, seq: events.length, time, data, ...(surface ? { surfaceOp: 'append' } : {}), ...(ignorable ? { ignorable: true } : {}) })
  }
  const branchId = request.branchId ?? conversation.messages.at(-1)!.id
  append(SOURCE, { schema: 1, sourceHash: request.sourceHash, conversationId: conversation.id, branchId,
    workspaceId: request.workspaceId, title, originalTitle: conversation.title, messageCount: conversation.messages.length,
    ...(conversation.metadata ? { metadata: conversation.metadata } : {}),
    ...(conversation.createdAt ? { createdAt: conversation.createdAt } : {}), ...(conversation.updatedAt ? { updatedAt: conversation.updatedAt } : {}),
    ...(conversation.modelType ? { modelType: conversation.modelType } : {}), warnings: conversation.warnings }, now, false, true)
  let turn = 0, step = 0, opened = false, stepOpen = false, lastTime = now
  const closeStep = () => { if (stepOpen) { append('step/end', { turn, step }, lastTime); stepOpen = false } }
  const closeTurn = () => { if (opened) { closeStep(); append('turn/end', { turn, reason: { kind: 'completed' } }, lastTime); opened = false } }
  for (const [index, message] of conversation.messages.entries()) {
    if (!['user', 'assistant'].includes(message.role)) fail('unsupported-message-role')
    lastTime = eventTime(message.createdAt, now)
    if (message.role === 'user' || !opened) {
      closeTurn(); turn++; step = 0; opened = true
      append('turn/start', { turn }, lastTime)
    }
    if (turn === 1 && step === 0) {
      step = 1; stepOpen = true
      append('step/start', { turn, step }, lastTime)
      // Native V4 requires its protected system head BEFORE any user/assistant
      // surface. Empty is deliberate: no private web prompt is known. DSH's
      // own prompt owner replaces this empty head on the first actual request.
      append('system/message', { turn, step, message: { id: `${request.sessionId}:system`, role: 'system', content: [], source: { kind: 'system-prompt' } } }, lastTime, true)
    }
    append(RECORD, { index, id: message.id, parentId: message.parentId, ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      fragments: message.fragments, metadata: message.metadata, warnings: message.warnings }, lastTime, false, true)
    const nativeMessage = { id: `${request.sessionId}:${index}`, role: message.role, content: content(message),
      source: message.role === 'user' ? { kind: 'user' } : { kind: 'model', provider: 'deepseek-web-history', model: message.model || 'unknown-from-source' } }
    if (message.role === 'user') append('user/message', nativeMessage, lastTime, true)
    else {
      if (!stepOpen) { step++; stepOpen = true; append('step/start', { turn, step }, lastTime) }
      // The source has no timed provider stream; never fabricate one.
      append('assistant/message', { turn, step, stream: [], message: nativeMessage }, lastTime, true)
      closeStep()
    }
  }
  closeTurn()
  append('session/title', { title, messageSeqs: [], source: { kind: 'user' } }, now)
  append(COMPLETE, { schema: 1, sourceHash: request.sourceHash, branchId, prefixCount: events.length, prefixHash: digest(events) }, now, false, true)
  if (events.length > MAX_EVENTS) fail('message-limit')
  return events
}
function validateArchive(modules: { session: Native; catalog: Native }, sessionId: string, seed: Native[], header: Native): void {
  // Session.create alone is insufficient: the cold persistence reader also
  // checks protected-head and lifecycle relationships. Run BOTH before create.
  modules.session.Session.create(sessionId, seed, header)
  const restore = modules.catalog.createRestore(modules.catalog.encodeCurrentHeader(header, 0), { recovery: 'strict', validation: 'current' })
  for (const event of seed) restore.decodeRow(modules.catalog.encodeCurrentEvent(event))
  restore.finish()
}
export async function inspectNativeImport(ctx: ImportHost, request: NativeImportIdentity, signal?: AbortSignal): Promise<NativeImportInspection> {
  identity(request); signal?.throwIfAborted()
  const result: NativeImportInspection = { state: 'uncertain', sessionId: request.sessionId, workspaceId: request.workspaceId }
  const native = services(ctx), workspace = native.workspaceRegistry.get(request.workspaceId)
  if (!workspace) return { ...result, message: '目标工作区已不存在，请在电脑核对。' }
  if (!await native.sessionPersistence.stat(request.sessionId)) return { ...result, state: 'not-found' }
  const handle = await native.sessionPersistence.open(request.sessionId, 'read', signal ? { signal } : undefined)
  try {
    const { events } = await handle.read(0, MAX_EVENTS, signal ? { signal } : undefined)
    signal?.throwIfAborted()
    const origin = events[0], markers = events.filter((event: Native) => event.type === COMPLETE)
    if (origin?.type !== SOURCE || origin.ignorable !== true || origin.data?.schema !== 1 || origin.data.sourceHash !== request.sourceHash
      || origin.data.workspaceId !== request.workspaceId || request.branchId !== undefined && origin.data.branchId !== request.branchId
      || markers.length !== 1 || handle.header.id !== request.sessionId || handle.header.cwd !== workspace.path
      || !workspace.sessionIds.includes(request.sessionId)) return result
    const marker = markers[0]
    if (marker.ignorable !== true || marker.data?.schema !== 1 || marker.data.sourceHash !== request.sourceHash
      || marker.data.branchId !== origin.data.branchId || marker.data.prefixCount !== marker.seq
      || marker.data.prefixHash !== digest(events.slice(0, marker.seq))) return result
    return { ...result, state: 'succeeded', title: origin.data.title, messageCount: origin.data.messageCount }
  } finally { await handle.close() }
}
async function prepareNativeImport(ctx: ImportHost, request: NativeImportRequest, signal?: AbortSignal) {
  identity(request); signal?.throwIfAborted()
  const native = services(ctx), modules = await nativeModules(), workspace = native.workspaceRegistry.get(request.workspaceId)
  if (!workspace || typeof workspace.attachSession !== 'function') fail('workspace-unavailable')
  // Never adopt, overwrite, append to, or dispose a pre-existing Session.
  if (native.agents.get(request.sessionId) || native.sessions.get(request.sessionId) || await native.sessionPersistence.stat(request.sessionId)) fail('session-exists')
  const seed = buildNativeImportSeed(request)
  const selection = native.agentDefaultModel.currentSelection()
  if (!row(selection) || typeof selection.provider !== 'string' || !selection.provider || typeof selection.model !== 'string' || !selection.model) fail('model-unavailable')
  const presets = native.agentPresets
  if (presets && (typeof presets.resolve !== 'function' || typeof presets.mount !== 'function')) fail('preset-unavailable')
  if (!presets && request.presetId !== undefined) fail('preset-unavailable')
  let resolved: Native | undefined
  try { resolved = presets ? await presets.resolve(request.presetId) : undefined }
  catch { return fail('preset-unavailable') }
  // Native resolve rejects absent presets rather than falling back. Also fail
  // closed if a future host violates that contract or exposes a disabled row.
  if (presets && (!row(resolved) || typeof resolved.id !== 'string' || !resolved.id || resolved.broken
    || resolved.disabled === true || resolved.enabled === false
    || request.presetId !== undefined && resolved.id !== request.presetId)) fail('preset-unavailable')
  const preset = resolved?.id
  const meta = { cwd: workspace.path, ...(preset === undefined ? {} : { agentPreset: preset }) }
  validateArchive(modules, request.sessionId, seed, { version: 4, id: request.sessionId, createdAt: Date.now(), isSeeded: false, delegationDepth: 0, ...meta })
  signal?.throwIfAborted()
  if (native.workspaceRegistry.get(request.workspaceId) !== workspace) fail('workspace-changed')
  return { native, modules, workspace, seed, selection, presets, preset, meta }
}
export async function commitNativeImport(ctx: ImportHost, request: NativeImportRequest, signal?: AbortSignal): Promise<{ sessionId: string; workspaceId: string; title: string; messageCount: number }> {
  const prepared = await prepareNativeImport(ctx, request, signal).catch((error: unknown) => {
    throw new NativeImportPreflightError(error instanceof NativeImportError ? error.code : signal?.aborted ? 'aborted' : 'preflight-failed')
  })
  const { native, modules, workspace, seed, selection, presets, preset, meta } = prepared
  let handle: Native | undefined
  try {
    const created: Native = await native.agents.create({ sessionId: request.sessionId, seed, meta,
      agentOptions: { provider: selection.provider, model: selection.model }, ...(signal ? { signal } : {}),
      setup: async (agentCtx: Native) => {
        if (presets && (await presets.mount(agentCtx, preset))?.id !== preset) fail('preset-unavailable')
      } })
    if (!created || typeof created.dispose !== 'function' || created.agent?.session?.id !== request.sessionId) fail('uncertain')
    handle = created
    if (!await native.sessions.flush(created.agent.session)) fail('uncertain')
    // Releasing only our newly-created handle forces a real cold read below;
    // the next UI open belongs wholly to DSH's normal controller/resume path.
    await created.dispose(); handle = undefined
    signal?.throwIfAborted()
    const read = await native.sessionPersistence.open(request.sessionId, 'read', signal ? { signal } : undefined)
    try {
      const stored = await read.read(0, seed.length, signal ? { signal } : undefined)
      if (read.header.id !== request.sessionId || read.header.cwd !== workspace.path || digest(stored.events) !== digest(seed)) fail('uncertain')
      validateArchive(modules, request.sessionId, stored.events, read.header)
    } finally { await read.close() }
    signal?.throwIfAborted()
    if (native.workspaceRegistry.get(request.workspaceId) !== workspace) fail('uncertain')
    await workspace.attachSession(request.sessionId)
    const receipt = await inspectNativeImport(ctx, request, signal)
    if (receipt.state !== 'succeeded') fail('uncertain')
    return { sessionId: request.sessionId, workspaceId: request.workspaceId, title: receipt.title!, messageCount: receipt.messageCount! }
  } finally { if (handle) await handle.dispose() }
}
