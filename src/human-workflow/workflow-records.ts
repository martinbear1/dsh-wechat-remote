import { availableCapability } from './capabilities.js'
import { ModeRegistry, validateModeValues, type ModePackage, type ModeReference } from './mode-package.js'
import { assertScope, bounded, copy, exact, fail, identifier, plain, revision, row, sameScope, scopeValid,
  StateQueue, version, type WorkflowDataStore, type WorkflowScope } from './data.js'

/** References identify a version observed elsewhere. They never update that
 * source, establish identity/ACL, acknowledge delivery, or publish a result. */
export interface WorkflowFactReference { kind: 'task' | 'submission' | 'artifact'; id: string; version: number }
export interface WorkflowContent {
  title: string; objective: string
  plan: { id: string; title: string; state: 'planned' | 'working' | 'done' | 'blocked'; notes?: string }[]
  notes?: string
  analyses: { id: string; summary: string; references: WorkflowFactReference[]; result?: Record<string, unknown> }[]
  onboardingAnswers?: Record<string, unknown>
}
export interface WorkflowRecord {
  schema: 'human.workflow.record.v1'; authority: 'agent-notes'; id: string; revision: number; scope: WorkflowScope
  mode: ModeReference; content: WorkflowContent; createdAt: number; updatedAt: number
}
interface WorkflowLedger { schema: 'human.workflow.records.v1'; nodeId: string; records: WorkflowRecord[] }
export interface WorkflowRecordsOptions {
  nodeId: string; modes: ModeRegistry; randomId(): string; now?: () => number
  /** Optional, synchronous check against the authenticated node projection.
   * Missing authority rejects references, rather than trusting Agent claims. */
  validateReferences?: (scope: WorkflowScope, references: readonly WorkflowFactReference[]) => void
}
function contentShape(value: unknown): value is WorkflowContent {
  if (!row(value) || !exact(value, ['title', 'objective', 'plan', 'analyses'], ['notes', 'onboardingAnswers'])
    || !plain(value.title, 80) || !plain(value.objective, 2000) || value.notes !== undefined && !plain(value.notes, 8000)
    || !Array.isArray(value.plan) || value.plan.length > 32 || !Array.isArray(value.analyses) || value.analyses.length > 16) return false
  const steps = new Set<string>(), analyses = new Set<string>()
  for (const item of value.plan) {
    if (!row(item) || !exact(item, ['id', 'title', 'state'], ['notes']) || !identifier(item.id) || steps.has(item.id)
      || !plain(item.title, 300) || !['planned', 'working', 'done', 'blocked'].includes(String(item.state))
      || item.notes !== undefined && !plain(item.notes, 2000)) return false
    steps.add(item.id)
  }
  for (const item of value.analyses) {
    if (!row(item) || !exact(item, ['id', 'summary', 'references'], ['result']) || !identifier(item.id) || analyses.has(item.id)
      || !plain(item.summary, 4000) || !Array.isArray(item.references) || item.references.length > 16
      || item.result !== undefined && !row(item.result)) return false
    analyses.add(item.id)
    for (const ref of item.references) if (!row(ref) || !exact(ref, ['kind', 'id', 'version'])
      || !['task', 'submission', 'artifact'].includes(String(ref.kind)) || !identifier(ref.id) || !version(ref.version)) return false
  }
  return value.onboardingAnswers === undefined || row(value.onboardingAnswers)
}
export class WorkflowRecords {
  private readonly now: () => number
  private constructor(private readonly state: StateQueue<WorkflowLedger>, private readonly options: WorkflowRecordsOptions) { this.now = options.now || Date.now }
  static async open(store: WorkflowDataStore, options: WorkflowRecordsOptions): Promise<WorkflowRecords> {
    if (!identifier(options.nodeId)) throw fail('workflow-scope-invalid', '节点标识无效')
    const raw = await store.load()
    const ledger: WorkflowLedger = raw === undefined ? { schema: 'human.workflow.records.v1', nodeId: options.nodeId, records: [] } : validateLedger(raw, options.nodeId)
    // A well-shaped ledger is not enough: persisted records must still point to
    // their immutable, owner-approved template. Availability/revoked fact access
    // is deliberately not consulted during recovery of historical local notes.
    for (const record of ledger.records) {
      try {
        const mode = options.modes.get(record.scope, record.mode)
        if (!mode.previouslyApproved || mode.digest !== record.mode.digest) throw new Error('mode mismatch')
        validateModeValues({ fields: mode.package.onboarding?.questions.map(item => item.field) || [] }, record.content.onboardingAnswers || {}, false)
        for (const analysis of record.content.analyses) if (analysis.result !== undefined) validateModeValues(mode.package.resultSchema, analysis.result)
        bounded(record.content, 96 * 1024)
      } catch { throw fail('workflow-store-invalid', '工作流记录不匹配已批准模式，未覆盖原文件') }
    }
    return new WorkflowRecords(new StateQueue(store, ledger), options)
  }
  close(): Promise<void> { return this.state.close() }
  private check(scope: WorkflowScope): void { assertScope(scope, this.options.nodeId) }
  private find(ledger: WorkflowLedger, scope: WorkflowScope, id: string): WorkflowRecord {
    if (!identifier(id)) throw fail('workflow-record-invalid', '工作流标识无效')
    const record = ledger.records.find(item => item.id === id && sameScope(item.scope, scope))
    if (!record) throw fail('workflow-record-unavailable', '此会话无权读取该工作流，跨会话加入尚未开放')
    return record
  }
  private parse(scope: WorkflowScope, mode: ModePackage, value: unknown): WorkflowContent {
    if (!contentShape(value)) throw fail('workflow-content-invalid', '计划或分析字段不受支持；不能写入任务事实或授权')
    if (!mode.allowedTools.includes('human_workflow_save') || !mode.requiredCapabilities.includes('workflow.records')
      || !availableCapability(this.options.modes.manifest(), 'workflow.records')) throw fail('mode-tool-not-allowed', '此模式未声明工作流记录能力')
    const fields = mode.onboarding?.questions.map(item => item.field) || []
    if (value.onboardingAnswers !== undefined) validateModeValues({ fields }, value.onboardingAnswers, false)
    const references = value.analyses.flatMap(item => item.references)
    if (references.length) {
      if (!this.options.validateReferences) throw fail('workflow-reference-unavailable', '当前节点不能核验事实引用，请先同步授权任务')
      for (const ref of references) {
        const capability = ref.kind === 'task' ? 'task.query' : 'submission.receive'
        if (!availableCapability(this.options.modes.manifest(), capability)) throw fail('workflow-reference-unavailable', '引用所需任务或附件能力尚不可用')
      }
      this.options.validateReferences(scope, references)
    }
    for (const analysis of value.analyses) if (analysis.result !== undefined) validateModeValues(mode.resultSchema, analysis.result)
    bounded(value, 96 * 1024)
    return copy(value)
  }
  create(scope: WorkflowScope, request: { mode: ModeReference; content: unknown }, signal: AbortSignal): Promise<WorkflowRecord> {
    this.check(scope)
    if (!row(request) || !exact(request, ['mode', 'content'])) throw fail('workflow-arguments-invalid', '新工作流参数无效')
    return this.state.update(ledger => {
      const mode = this.options.modes.requireActive(scope, request.mode), content = this.parse(scope, mode, request.content)
      if (ledger.records.length >= 128) throw fail('workflow-capacity', '工作流记录数量已达到上限')
      const id = `workflow_${this.options.randomId()}`
      if (!identifier(id) || ledger.records.some(item => item.id === id)) throw fail('workflow-id-invalid', '工作流标识生成失败')
      const time = this.now()
      const record: WorkflowRecord = { schema: 'human.workflow.record.v1', authority: 'agent-notes', id, revision: 1,
        scope: copy(scope), mode: copy(request.mode), content, createdAt: time, updatedAt: time }
      ledger.records.push(record)
      return record
    }, signal)
  }
  update(scope: WorkflowScope, request: { id: string; expectedRevision: number; content: unknown }, signal: AbortSignal): Promise<WorkflowRecord> {
    this.check(scope)
    if (!row(request) || !exact(request, ['id', 'expectedRevision', 'content'])) throw fail('workflow-arguments-invalid', '工作流更新参数无效')
    return this.state.update(ledger => {
      const record = this.find(ledger, scope, request.id)
      if (!version(request.expectedRevision) || request.expectedRevision !== record.revision) throw fail('workflow-version-conflict', '工作流计划已有新版本，请重新读取后合并')
      if (record.revision === Number.MAX_SAFE_INTEGER) throw fail('workflow-capacity', '工作流版本已达到上限')
      // Existing work stays pinned when the session switches its template.
      const mode = this.options.modes.requireApproved(scope, record.mode)
      record.content = this.parse(scope, mode, request.content)
      record.revision++; record.updatedAt = this.now()
      return record
    }, signal)
  }
  get(scope: WorkflowScope, id: string) {
    this.check(scope)
    const record = copy(this.find(this.state.current(), scope, id))
    const mode = this.options.modes.get(scope, record.mode).package
    const answers = record.content.onboardingAnswers || {}
    return { ...record, onboarding: { status: 'self-reported' as const,
      pendingQuestions: (mode.onboarding?.questions || []).filter(item => !Object.hasOwn(answers, item.field.key)).map(copy),
      meaning: '回答是此工作流的业务资料，不证明微信身份或授予成员访问权。' } }
  }
  list(scope: WorkflowScope) {
    this.check(scope)
    return { schema: 'human.workflow.list.v1' as const, records: this.state.current().records.filter(item => sameScope(item.scope, scope))
      .map(item => ({ id: item.id, revision: item.revision, title: item.content.title, mode: copy(item.mode), updatedAt: item.updatedAt })) }
  }
}
function validateLedger(value: unknown, nodeId: string): WorkflowLedger {
  const bad = () => fail('workflow-store-invalid', '工作流存储不受支持或不属于此节点，未覆盖原文件')
  if (!row(value) || !exact(value, ['schema', 'nodeId', 'records']) || value.schema !== 'human.workflow.records.v1' || value.nodeId !== nodeId
    || !Array.isArray(value.records) || value.records.length > 128) throw bad()
  const ids = new Set<string>()
  for (const item of value.records) {
    if (!row(item) || !exact(item, ['schema', 'authority', 'id', 'revision', 'scope', 'mode', 'content', 'createdAt', 'updatedAt'])
      || item.schema !== 'human.workflow.record.v1' || item.authority !== 'agent-notes' || !identifier(item.id) || ids.has(item.id)
      || !version(item.revision) || !scopeValid(item.scope) || item.scope.nodeId !== nodeId || !revision(item.createdAt) || !revision(item.updatedAt)
      || item.updatedAt < item.createdAt || !row(item.mode) || !exact(item.mode, ['id', 'version', 'digest']) || !identifier(item.mode.id)
      || !version(item.mode.version) || typeof item.mode.digest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(item.mode.digest)
      || !contentShape(item.content)) throw bad()
    ids.add(item.id)
  }
  bounded(value)
  return copy(value) as unknown as WorkflowLedger
}
