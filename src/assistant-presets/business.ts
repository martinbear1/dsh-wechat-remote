import { randomBytes } from 'node:crypto'
import { assertScope, bounded, copy, exact, fail, plain, row, sameScope, scopeValid, StateQueue, version,
  type WorkflowDataStore, type WorkflowScope } from '../human-workflow/data.js'
import { assistantDefinition } from './definition.js'
import type { AssistantRef, AssistantRegistry } from './registry.js'

/** Local business memory is neither a reusable preset nor a verified group fact. */
export interface AssistantBusinessContent { title: string; answers: Record<string, string>; memory: string }
export interface AssistantBusinessRecord {
  schema: 'human.assistant.business.v1'; authority: 'local-business-notes'; id: string; revision: number
  scope: WorkflowScope; presetId: string; assistant: AssistantRef; content: AssistantBusinessContent
  createdAt: number; updatedAt: number
}
interface Ledger { schema: 'human.assistant.business-ledger.v1'; nodeId: string; records: AssistantBusinessRecord[] }
export interface AssistantBusinessOptions {
  nodeId: string; registry: AssistantRegistry; assertIdentity(): void; now?: () => number; randomId?: () => string
}
const sameRef = (a: AssistantRef, b: AssistantRef) => a.id === b.id && a.version === b.version && a.digest === b.digest
const textOrEmpty = (value: unknown, max: number): value is string => value === '' || plain(value, max)
function content(value: unknown, keys: readonly string[]): AssistantBusinessContent {
  if (!row(value) || !exact(value, ['title', 'answers', 'memory']) || !plain(value.title, 80)
    || !row(value.answers) || !textOrEmpty(value.memory, 8000) || Object.keys(value.answers).length > 12
    || Object.keys(value.answers).some(key => !keys.includes(key) || !plain((value.answers as Record<string, unknown>)[key], 1000)))
    throw fail('assistant-business-content-invalid', '业务资料只能包含本助手的已回答问题与有界工作记忆，不能修改模板或任务事实')
  bounded(value, 24 * 1024)
  return copy(value) as unknown as AssistantBusinessContent
}
export class AssistantBusinessRecords {
  private readonly now: () => number
  private readonly randomId: () => string
  private constructor(private state: StateQueue<Ledger>, private options: AssistantBusinessOptions) {
    this.now = options.now || Date.now; this.randomId = options.randomId || (() => randomBytes(16).toString('hex'))
  }
  static async open(store: WorkflowDataStore, options: AssistantBusinessOptions): Promise<AssistantBusinessRecords> {
    options.assertIdentity()
    if (typeof options.nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(options.nodeId))
      throw fail('assistant-business-scope-invalid', '节点身份无效')
    const raw = await store.load(); options.assertIdentity()
    const ledger: Ledger = raw === undefined ? { schema: 'human.assistant.business-ledger.v1', nodeId: options.nodeId, records: [] }
      : validateLedger(raw, options)
    return new AssistantBusinessRecords(new StateQueue(store, ledger), options)
  }
  close(): Promise<void> { return this.state.close() }
  private current(scope: WorkflowScope, presetId: string) {
    this.options.assertIdentity(); assertScope(scope, this.options.nodeId)
    if (!plain(presetId, 128)) throw fail('assistant-business-preset-unavailable', '当前会话没有已安装的职业助手身份')
    const installed = this.options.registry.installedForPreset(presetId)
    if (!installed || installed.state !== 'installed' || installed.presetId !== presetId)
      throw fail('assistant-business-preset-unavailable', '当前真实原生预设不是已确认安装的职业助手')
    const definition = assistantDefinition(installed.definition)
    return { definition, ref: { id: installed.id, version: installed.version, digest: installed.digest } }
  }
  private checkedRecord(scope: WorkflowScope, presetId: string) {
    const installed = this.current(scope, presetId), record = this.state.current().records.find(item => sameScope(item.scope, scope))
    if (!record) throw fail('assistant-business-not-started', '当前会话尚未建立独立工作实例，请先建档')
    if (record.presetId !== presetId || !sameRef(record.assistant, installed.ref))
      throw fail('assistant-business-preset-mismatch', '已有工作实例绑定其他助手版本，不能借用或覆盖其资料')
    return { record, ...installed }
  }
  start(scope: WorkflowScope, presetId: string, signal: AbortSignal): Promise<AssistantBusinessRecord> {
    signal.throwIfAborted(); this.current(scope, presetId)
    return this.state.update(ledger => {
      const installed = this.current(scope, presetId), existing = ledger.records.find(item => sameScope(item.scope, scope))
      if (existing) {
        if (existing.presetId !== presetId || !sameRef(existing.assistant, installed.ref))
          throw fail('assistant-business-preset-mismatch', '当前会话已有另一个助手的工作实例，请开启新会话')
        return existing
      }
      if (ledger.records.length >= 64) throw fail('assistant-business-capacity', '本节点工作实例数量已达到上限')
      const id = this.randomId(), time = this.now()
      if (!/^[A-Za-z0-9_-]{16,128}(?![\s\S])/.test(id) || ledger.records.some(record => record.id === id))
        throw fail('assistant-business-id-invalid', '工作实例标识生成失败')
      const record: AssistantBusinessRecord = { schema: 'human.assistant.business.v1', authority: 'local-business-notes',
        id, revision: 1, scope: copy(scope), presetId, assistant: installed.ref,
        content: { title: `${installed.definition.name}工作实例`, answers: {}, memory: '' }, createdAt: time, updatedAt: time }
      ledger.records.push(record); return record
    }, signal)
  }
  get(scope: WorkflowScope, presetId: string) {
    const { record, definition } = this.checkedRecord(scope, presetId)
    return { ...copy(record), onboarding: { status: 'self-reported' as const,
      pendingQuestions: definition.onboarding.filter(item => !Object.hasOwn(record.content.answers, item.key)).map(copy),
      meaning: '本记录是当前会话的业务资料和工作记忆，不证明微信成员身份，也不授予共享、发送或访问权限。' } }
  }
  save(scope: WorkflowScope, presetId: string, request: { expectedRevision: number; content: unknown }, signal: AbortSignal) {
    signal.throwIfAborted(); this.checkedRecord(scope, presetId)
    if (!row(request) || !exact(request, ['expectedRevision', 'content']) || !version(request.expectedRevision))
      throw fail('assistant-business-save-invalid', '保存需要当前版本与完整业务内容')
    return this.state.update(ledger => {
      const installed = this.current(scope, presetId), record = ledger.records.find(item => sameScope(item.scope, scope))
      if (!record || record.presetId !== presetId || !sameRef(record.assistant, installed.ref))
        throw fail('assistant-business-preset-mismatch', '当前工作实例身份已变化')
      if (record.revision !== request.expectedRevision) throw fail('assistant-business-conflict', '业务资料已有新版本，请读取后合并，不能覆盖较新的记忆')
      if (record.revision === Number.MAX_SAFE_INTEGER) throw fail('assistant-business-capacity', '业务资料版本已达到上限')
      record.content = content(request.content, installed.definition.onboarding.map(question => question.key))
      record.revision++; record.updatedAt = this.now(); return record
    }, signal)
  }
}
function validateLedger(value: unknown, options: AssistantBusinessOptions): Ledger {
  const invalid = () => fail('assistant-business-store-invalid', '业务资料账本无效或不属于当前节点，未覆盖原文件')
  if (!row(value) || !exact(value, ['schema', 'nodeId', 'records']) || value.schema !== 'human.assistant.business-ledger.v1'
    || value.nodeId !== options.nodeId || !Array.isArray(value.records) || value.records.length > 64) throw invalid()
  const scopes = new Set<string>(), ids = new Set<string>()
  for (const r of value.records) {
    if (!row(r) || !exact(r, ['schema', 'authority', 'id', 'revision', 'scope', 'presetId', 'assistant', 'content', 'createdAt', 'updatedAt'])
      || r.schema !== 'human.assistant.business.v1' || r.authority !== 'local-business-notes'
      || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}(?![\s\S])/.test(r.id) || ids.has(r.id)
      || !version(r.revision) || !scopeValid(r.scope) || r.scope.nodeId !== options.nodeId || !plain(r.presetId, 128)
      || !row(r.assistant) || !exact(r.assistant, ['id', 'version', 'digest']) || !version(r.assistant.version)
      || !Number.isSafeInteger(r.createdAt) || Number(r.createdAt) < 0 || !Number.isSafeInteger(r.updatedAt)
      || Number(r.updatedAt) < Number(r.createdAt)) throw invalid()
    const scopeKey = JSON.stringify([r.scope.nodeId, r.scope.sessionId, r.scope.sessionGeneration])
    if (scopes.has(scopeKey)) throw invalid()
    try {
      const template = options.registry.get({ id: r.assistant.id as string, version: r.assistant.version })
      if (template.digest !== r.assistant.digest || template.presetId !== r.presetId) throw invalid()
      content(r.content, assistantDefinition(template.definition).onboarding.map(question => question.key))
    } catch { throw invalid() }
    ids.add(r.id); scopes.add(scopeKey)
  }
  bounded(value)
  return copy(value) as unknown as Ledger
}
