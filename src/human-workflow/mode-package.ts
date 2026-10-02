import { createHash } from 'node:crypto'
import { availableCapability, type CapabilityManifest } from './capabilities.js'
import { assertScope, bounded, copy, exact, fail, identifier, plain, revision, row, sameScope, scopeValid,
  StateQueue, version, type WorkflowDataStore, type WorkflowScope } from './data.js'

export type ModeField = { key: string; label: string; required: boolean } & (
  { kind: 'short-text' | 'long-text'; maxLength: number } | { kind: 'choice'; choices: string[] }
  | { kind: 'boolean' } | { kind: 'number'; min: number; max: number })
export interface ModePackage {
  schemaVersion: 1; name: string; description: string; goal: string; roles: { id: string; label: string }[]; rules: string[]
  requiredCapabilities: string[]; allowedTools: string[]
  inputSchema: { fields: ModeField[] }; resultSchema: { fields: ModeField[] }
  card: { kind: 'reading-confirmation'; titleField: string; bodyFields: string[] }
  approval: { activation: 'owner'; publication: 'owner' }; automation: 'manual'
  onboarding?: { questions: { field: ModeField; prompt: string }[] }
}
export interface ModeIssue { code: string; path: string; message: string }
export interface ModeValidation { ok: boolean; issues: ModeIssue[] }
export interface ModeReference { id: string; version: number; digest: string }
export interface ModeActivation { schema: 'human.mode.activation.v1'; revision: number; mode: ModeReference | null }
interface StoredVersion { version: number; digest: string; package: ModePackage; createdAt: number; createdBy: WorkflowScope; approvedAt?: number }
interface StoredMode { id: string; versions: StoredVersion[] }
interface ActivationRow { scope: WorkflowScope; revision: number; mode: ModeReference }
interface StoredPreview {
  id: string; scope: WorkflowScope; mode: ModeReference; expiresAt: number; expectedActivationVersion: number
  used?: { operation: 'approve' | 'rollback'; result: ModeActivation }
}
interface ModeLedger { schema: 'human.mode.registry.v1'; nodeId: string; modes: StoredMode[]; activations: ActivationRow[]; previews: StoredPreview[] }
export interface ModePreview extends ModeReference {
  schema: 'human.mode.preview.v1'; previewId: string; expiresAt: number; expectedActivationVersion: number
  package: ModePackage; validation: ModeValidation; capabilities: CapabilityManifest['capabilities']; previouslyApproved: boolean
}
export interface ModeApproval extends ModeReference { previewId: string; expectedActivationVersion: number }
export interface ModeRegistryOptions { nodeId: string; capabilities(): CapabilityManifest; randomId(): string; now?: () => number }
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}(?![\s\S])/.test(value)
const digestValid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(value)
const strings = (value: unknown, count: number, size: number): value is string[] => Array.isArray(value) && value.length <= count && value.every(item => plain(item, size))
const unique = (values: readonly string[]) => new Set(values).size === values.length
const badPackage = () => fail('mode-package-invalid', '模式包字段、组件或约束不受支持')
function fields(value: unknown): value is { fields: ModeField[] } {
  if (!row(value) || !exact(value, ['fields']) || !Array.isArray(value.fields) || value.fields.length > 12) return false
  const keys = new Set<string>()
  for (const field of value.fields) {
    if (!row(field) || !key(field.key) || keys.has(field.key) || !plain(field.label, 80) || typeof field.required !== 'boolean') return false
    keys.add(field.key)
    const base = ['key', 'label', 'kind', 'required']
    if (field.kind === 'short-text' || field.kind === 'long-text') {
      if (!exact(field, [...base, 'maxLength']) || !version(field.maxLength) || field.maxLength > (field.kind === 'short-text' ? 80 : 1000)) return false
    } else if (field.kind === 'choice') {
      if (!exact(field, [...base, 'choices']) || !strings(field.choices, 12, 80) || field.choices.length < 2 || !unique(field.choices)) return false
    } else if (field.kind === 'number') {
      if (!exact(field, [...base, 'min', 'max']) || typeof field.min !== 'number' || typeof field.max !== 'number'
        || !Number.isFinite(field.min) || !Number.isFinite(field.max) || field.min > field.max || field.min < -1e9 || field.max > 1e9) return false
    } else if (field.kind !== 'boolean' || !exact(field, base)) return false
  }
  return true
}
/** Fixed data language only. No templates, code, URLs, event handlers, imports
 * or external renderer references are accepted as executable configuration. */
export function parseModePackage(value: unknown): ModePackage {
  if (!row(value) || !exact(value, ['schemaVersion', 'name', 'description', 'goal', 'roles', 'rules', 'requiredCapabilities',
    'allowedTools', 'inputSchema', 'resultSchema', 'card', 'approval', 'automation'], ['onboarding']) || value.schemaVersion !== 1
    || !plain(value.name, 80) || !plain(value.description, 1000) || !plain(value.goal, 1000)
    || !Array.isArray(value.roles) || value.roles.length > 8
    || value.roles.some(role => !row(role) || !exact(role, ['id', 'label']) || !key(role.id) || !plain(role.label, 80))
    || !unique(value.roles.map(role => role.id)) || !strings(value.rules, 16, 500)
    || !strings(value.requiredCapabilities, 16, 80) || !unique(value.requiredCapabilities)
    || !strings(value.allowedTools, 16, 80) || !unique(value.allowedTools)
    || !fields(value.inputSchema) || !fields(value.resultSchema)
    || !row(value.card) || !exact(value.card, ['kind', 'titleField', 'bodyFields']) || value.card.kind !== 'reading-confirmation'
    || !key(value.card.titleField) || !strings(value.card.bodyFields, 12, 40) || !value.card.bodyFields.length || !unique(value.card.bodyFields)
    || !row(value.approval) || !exact(value.approval, ['activation', 'publication']) || value.approval.activation !== 'owner'
    || value.approval.publication !== 'owner' || value.automation !== 'manual') throw badPackage()
  if (value.onboarding !== undefined && (!row(value.onboarding) || !exact(value.onboarding, ['questions'])
    || !Array.isArray(value.onboarding.questions) || value.onboarding.questions.length > 12
    || value.onboarding.questions.some(question => !row(question) || !exact(question, ['field', 'prompt']) || !plain(question.prompt, 500))
    || !fields({ fields: value.onboarding.questions.map(question => question.field) }))) throw badPackage()
  const byKey = new Map(value.inputSchema.fields.map(field => [field.key, field]))
  const title = byKey.get(value.card.titleField)
  if (!title || !title.required || (title.kind !== 'short-text' && title.kind !== 'choice')
    || value.card.bodyFields.some(name => !byKey.has(name))) throw badPackage()
  bounded(value, 24 * 1024)
  return copy(value) as unknown as ModePackage
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (row(value)) return Object.fromEntries(Object.keys(value).sort().map(name => [name, canonical(value[name])]))
  return value
}
export function modeDigest(value: ModePackage): string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex') }
export function validateModePackage(value: unknown, manifest: CapabilityManifest): ModeValidation {
  let parsed: ModePackage
  try { parsed = parseModePackage(value) } catch { return { ok: false, issues: [{ code: 'mode-package-invalid', path: 'package', message: '模式包只支持固定数据字段和阅读确认卡片。' }] } }
  const issues: ModeIssue[] = []
  for (const id of parsed.requiredCapabilities) {
    const capability = manifest.capabilities.find(item => item.id === id)
    if (!capability || capability.status !== 'available' || capability.version !== 1) issues.push({ code: 'capability-unavailable', path: 'requiredCapabilities', message: `${id}：${capability?.reason || '此节点未提供该能力'}` })
  }
  for (const id of ['mode.packages', 'surface.reading-confirmation']) if (!parsed.requiredCapabilities.includes(id)) {
    issues.push({ code: 'capability-not-declared', path: 'requiredCapabilities', message: `必须声明 ${id}。` })
  }
  for (const tool of parsed.allowedTools) {
    const capability = manifest.capabilities.find(item => item.tools.includes(tool))
    if (!capability || !parsed.requiredCapabilities.includes(capability.id) || capability.status !== 'available') {
      issues.push({ code: 'tool-unavailable', path: 'allowedTools', message: `${tool} 不是已声明且可用的工具。` })
    }
  }
  if (!parsed.allowedTools.includes('human_mode_prepare_card')) issues.push({ code: 'tool-not-declared', path: 'allowedTools', message: '必须声明 human_mode_prepare_card，才能用模式结构化出卡。' })
  return { ok: issues.length === 0, issues }
}
export function validateModeValues(schema: { fields: ModeField[] }, value: unknown, requireAll = true): Record<string, unknown> {
  if (!row(value) || Object.keys(value).some(name => !schema.fields.some(field => field.key === name))) throw fail('mode-values-invalid', '数据包含模式未定义的字段')
  for (const field of schema.fields) {
    if (!Object.hasOwn(value, field.key)) { if (requireAll && field.required) throw fail('mode-values-invalid', `缺少 ${field.label}`); continue }
    const item = value[field.key]
    const valid = field.kind === 'short-text' || field.kind === 'long-text' ? plain(item, field.maxLength)
      : field.kind === 'choice' ? typeof item === 'string' && field.choices.includes(item)
      : field.kind === 'boolean' ? typeof item === 'boolean'
      : field.kind === 'number' && typeof item === 'number' && Number.isFinite(item) && item >= field.min && item <= field.max
    if (!valid) throw fail('mode-values-invalid', `${field.label} 不符合已批准的字段约束`)
  }
  return copy(value)
}
export function renderModeCard(mode: ModePackage, values: unknown): { title: string; body: string } {
  const data = validateModeValues(mode.inputSchema, values)
  const title = String(data[mode.card.titleField])
  const body = mode.card.bodyFields.filter(name => Object.hasOwn(data, name)).map(name => {
    const field = mode.inputSchema.fields.find(field => field.key === name)!
    return `${field.label}：${typeof data[name] === 'boolean' ? data[name] ? '是' : '否' : String(data[name])}`
  }).join('\n')
  if (!plain(title, 80) || !plain(body, 1000)) throw fail('mode-card-too-large', '填入内容超出群卡标题或正文上限，请缩短后重试')
  return { title, body }
}
function referenceValid(value: unknown): value is ModeReference {
  return row(value) && exact(value, ['id', 'version', 'digest']) && identifier(value.id) && version(value.version) && digestValid(value.digest)
}
export class ModeRegistry {
  private readonly now: () => number
  private constructor(private readonly state: StateQueue<ModeLedger>, private readonly options: ModeRegistryOptions) { this.now = options.now || Date.now }
  static async open(store: WorkflowDataStore, options: ModeRegistryOptions): Promise<ModeRegistry> {
    if (!identifier(options.nodeId)) throw fail('workflow-scope-invalid', '节点标识无效')
    const raw = await store.load()
    const ledger: ModeLedger = raw === undefined ? { schema: 'human.mode.registry.v1', nodeId: options.nodeId, modes: [], activations: [], previews: [] } : validateLedger(raw, options.nodeId)
    return new ModeRegistry(new StateQueue(store, ledger), options)
  }
  close(): Promise<void> { return this.state.close() }
  manifest(): CapabilityManifest {
    const value = this.options.capabilities()
    if (value.schema !== 'human.capabilities.v1' || value.nodeId !== this.options.nodeId) throw fail('capability-invalid', '能力目录不属于此节点')
    return copy(value)
  }
  private check(scope: WorkflowScope): void { assertScope(scope, this.options.nodeId) }
  private active(ledger: ModeLedger, scope: WorkflowScope): ModeActivation {
    const found = ledger.activations.find(item => sameScope(item.scope, scope))
    return { schema: 'human.mode.activation.v1', revision: found?.revision || 0, mode: found ? copy(found.mode) : null }
  }
  private find(ledger: ModeLedger, id: string, number: number): StoredVersion {
    if (!identifier(id) || !version(number)) throw fail('mode-reference-invalid', '模式版本标识无效')
    const found = ledger.modes.find(item => item.id === id)?.versions.find(item => item.version === number)
    if (!found) throw fail('mode-unavailable', '模式版本不存在')
    return found
  }
  list(scope: WorkflowScope) {
    this.check(scope); const ledger = this.state.current()
    return { schema: 'human.mode.list.v1' as const, modes: ledger.modes.map(mode => ({ id: mode.id,
      name: mode.versions.at(-1)!.package.name, latestVersion: mode.versions.at(-1)!.version,
      approvedVersions: mode.versions.filter(item => item.approvedAt !== undefined).map(item => item.version) })), activation: this.active(ledger, scope) }
  }
  get(scope: WorkflowScope, request: { id: string; version: number }) {
    this.check(scope); const item = this.find(this.state.current(), request.id, request.version)
    return { schema: 'human.mode.version.v1' as const, id: request.id, ...copy(item), previouslyApproved: item.approvedAt !== undefined }
  }
  draft(scope: WorkflowScope, request: { id?: string; expectedVersion?: number; package: unknown }, signal: AbortSignal) {
    this.check(scope)
    if (!row(request) || !exact(request, ['package'], ['id', 'expectedVersion'])) throw fail('mode-package-invalid', '模式草稿参数无效')
    const parsed = parseModePackage(request.package)
    return this.state.update(ledger => {
      let mode: StoredMode | undefined
      if (request.id !== undefined) {
        if (!identifier(request.id) || !version(request.expectedVersion)) throw fail('mode-version-conflict', '修改模式需要明确当前版本')
        mode = ledger.modes.find(item => item.id === request.id)
        if (!mode || mode.versions.at(-1)!.version !== request.expectedVersion) throw fail('mode-version-conflict', '模式已有新版本，请重新读取')
      } else {
        if (request.expectedVersion !== undefined) throw fail('mode-version-conflict', '新模式不接受已有版本号')
        if (ledger.modes.length >= 32) throw fail('workflow-capacity', '模式数量已达到上限')
        const id = `mode_${this.options.randomId()}`
        if (!identifier(id) || ledger.modes.some(item => item.id === id)) throw fail('workflow-id-invalid', '模式标识生成失败')
        mode = { id, versions: [] }; ledger.modes.push(mode)
      }
      if (mode.versions.length >= 16) throw fail('workflow-capacity', '此模式版本数量已达到上限')
      const item: StoredVersion = { version: mode.versions.length + 1, digest: modeDigest(parsed), package: parsed, createdAt: this.now(), createdBy: copy(scope) }
      mode.versions.push(item)
      return { schema: 'human.mode.version.v1' as const, id: mode.id, ...copy(item), previouslyApproved: false, validation: validateModePackage(parsed, this.manifest()) }
    }, signal)
  }
  preview(scope: WorkflowScope, request: { id: string; version: number }, signal: AbortSignal): Promise<ModePreview> {
    this.check(scope)
    return this.state.update(ledger => {
      const item = this.find(ledger, request.id, request.version), manifest = this.manifest()
      ledger.previews = ledger.previews.filter(item => item.expiresAt > this.now())
      if (ledger.previews.length >= 128) throw fail('workflow-capacity', '待批准预览数量已达到上限')
      const previewId = this.options.randomId()
      if (!identifier(previewId) || ledger.previews.some(item => item.id === previewId)) throw fail('workflow-id-invalid', '预览标识生成失败')
      const ref = { id: request.id, version: item.version, digest: item.digest }
      const preview: StoredPreview = { id: previewId, scope: copy(scope), mode: ref, expiresAt: this.now() + 10 * 60_000,
        expectedActivationVersion: this.active(ledger, scope).revision }
      ledger.previews.push(preview)
      return { schema: 'human.mode.preview.v1', ...ref, previewId, expiresAt: preview.expiresAt,
        expectedActivationVersion: preview.expectedActivationVersion, package: copy(item.package), validation: validateModePackage(item.package, manifest),
        capabilities: manifest.capabilities.filter(capability => item.package.requiredCapabilities.includes(capability.id)), previouslyApproved: item.approvedAt !== undefined }
    }, signal)
  }
  /** Host owner RPC only. Never expose this method as an Agent tool. */
  approve(scope: WorkflowScope, request: ModeApproval, signal: AbortSignal): Promise<ModeActivation> { return this.activate(scope, request, 'approve', signal) }
  /** Host owner RPC only; a rollback still gets an exact fresh preview. */
  rollback(scope: WorkflowScope, request: ModeApproval, signal: AbortSignal): Promise<ModeActivation> { return this.activate(scope, request, 'rollback', signal) }
  private activate(scope: WorkflowScope, request: ModeApproval, operation: 'approve' | 'rollback', signal: AbortSignal): Promise<ModeActivation> {
    this.check(scope)
    return this.state.update(ledger => {
      if (!row(request) || !exact(request, ['id', 'version', 'digest', 'previewId', 'expectedActivationVersion'])
        || !identifier(request.previewId) || !revision(request.expectedActivationVersion)) throw fail('mode-approval-invalid', '批准参数无效')
      const item = this.find(ledger, request.id, request.version)
      const preview = ledger.previews.find(item => item.id === request.previewId && sameScope(item.scope, scope))
      if (!preview || preview.expiresAt <= this.now() || preview.mode.id !== request.id || preview.mode.version !== request.version
        || preview.mode.digest !== request.digest || item.digest !== request.digest || preview.expectedActivationVersion !== request.expectedActivationVersion) throw fail('mode-preview-expired', '预览已失效或内容版本不符，请重新预览')
      if (preview.used) {
        if (preview.used.operation !== operation) throw fail('mode-approval-conflict', '此预览已有不同操作')
        return preview.used.result
      }
      if (this.active(ledger, scope).revision !== request.expectedActivationVersion) throw fail('mode-activation-conflict', '此会话已切换模式，请重新预览')
      if (request.expectedActivationVersion === Number.MAX_SAFE_INTEGER) throw fail('workflow-capacity', '模式启用版本已达到上限')
      if (operation === 'rollback' && item.approvedAt === undefined) throw fail('mode-not-approved', '只能回退到主人曾批准的版本')
      if (!validateModePackage(item.package, this.manifest()).ok) throw fail('mode-capability-unavailable', '模式依赖的能力当前不可用，未启用')
      const result: ModeActivation = { schema: 'human.mode.activation.v1', revision: request.expectedActivationVersion + 1,
        mode: { id: request.id, version: item.version, digest: item.digest } }
      item.approvedAt ??= this.now()
      let activation = ledger.activations.find(item => sameScope(item.scope, scope))
      if (activation) { activation.revision = result.revision; activation.mode = result.mode! }
      else {
        if (ledger.activations.length >= 128) throw fail('workflow-capacity', '已启用模式的会话数量已达到上限')
        ledger.activations.push({ scope: copy(scope), revision: result.revision, mode: result.mode! })
      }
      preview.used = { operation, result: copy(result) }
      return result
    }, signal)
  }
  requireActive(scope: WorkflowScope, ref: ModeReference): ModePackage {
    this.check(scope)
    const active = this.active(this.state.current(), scope).mode
    if (!referenceValid(ref) || !active || active.id !== ref.id || active.version !== ref.version || active.digest !== ref.digest) throw fail('mode-not-active', '此会话尚未由主人启用指定模式版本')
    return this.requireApproved(scope, ref)
  }
  requireApproved(scope: WorkflowScope, ref: ModeReference): ModePackage {
    this.check(scope)
    if (!referenceValid(ref)) throw fail('mode-reference-invalid', '模式版本标识无效')
    const item = this.find(this.state.current(), ref.id, ref.version)
    if (item.digest !== ref.digest || item.approvedAt === undefined) throw fail('mode-not-approved', '模式版本未获主人批准')
    if (!validateModePackage(item.package, this.manifest()).ok) throw fail('mode-capability-unavailable', '模式所需能力已不可用')
    return copy(item.package)
  }
}

function validateLedger(value: unknown, nodeId: string): ModeLedger {
  const bad = () => fail('mode-store-invalid', '模式存储不受支持或不属于此节点，未覆盖原文件')
  if (!row(value) || !exact(value, ['schema', 'nodeId', 'modes', 'activations', 'previews']) || value.schema !== 'human.mode.registry.v1'
    || value.nodeId !== nodeId || !Array.isArray(value.modes) || value.modes.length > 32 || !Array.isArray(value.activations)
    || value.activations.length > 128 || !Array.isArray(value.previews) || value.previews.length > 128) throw bad()
  const ids = new Set<string>()
  for (const mode of value.modes) {
    if (!row(mode) || !exact(mode, ['id', 'versions']) || !identifier(mode.id) || ids.has(mode.id)
      || !Array.isArray(mode.versions) || !mode.versions.length || mode.versions.length > 16) throw bad()
    ids.add(mode.id)
    for (const [index, item] of mode.versions.entries()) {
      if (!row(item) || !exact(item, ['version', 'digest', 'package', 'createdAt', 'createdBy'], ['approvedAt']) || item.version !== index + 1
        || !revision(item.createdAt) || !scopeValid(item.createdBy) || item.createdBy.nodeId !== nodeId
        || item.approvedAt !== undefined && !revision(item.approvedAt)) throw bad()
      try { if (modeDigest(parseModePackage(item.package)) !== item.digest) throw bad() } catch { throw bad() }
    }
  }
  const approvedRef = (ref: unknown): boolean => {
    if (!referenceValid(ref)) return false
    const item = (value.modes as StoredMode[]).find(mode => mode.id === ref.id)?.versions.find(item => item.version === ref.version)
    return item?.digest === ref.digest && item.approvedAt !== undefined
  }
  const origins = new Set<string>()
  for (const item of value.activations) {
    if (!row(item) || !exact(item, ['scope', 'revision', 'mode']) || !scopeValid(item.scope) || item.scope.nodeId !== nodeId
      || !version(item.revision) || !approvedRef(item.mode)) throw bad()
    const origin = JSON.stringify([item.scope.nodeId, item.scope.sessionId, item.scope.sessionGeneration])
    if (origins.has(origin)) throw bad(); origins.add(origin)
  }
  const previews = new Set<string>()
  for (const item of value.previews) {
    if (!row(item) || !exact(item, ['id', 'scope', 'mode', 'expiresAt', 'expectedActivationVersion'], ['used']) || !identifier(item.id)
      || previews.has(item.id) || !scopeValid(item.scope) || item.scope.nodeId !== nodeId || !referenceValid(item.mode)
      || !revision(item.expiresAt) || !revision(item.expectedActivationVersion)) throw bad()
    previews.add(item.id)
    const modeRef = item.mode
    const stored = (value.modes as StoredMode[]).find(mode => mode.id === modeRef.id)?.versions.find(version => version.version === modeRef.version)
    if (stored?.digest !== item.mode.digest) throw bad()
    if (item.used !== undefined && (!row(item.used) || !exact(item.used, ['operation', 'result']) || !['approve', 'rollback'].includes(String(item.used.operation))
      || !row(item.used.result) || !exact(item.used.result, ['schema', 'revision', 'mode']) || item.used.result.schema !== 'human.mode.activation.v1'
      || item.used.result.revision !== item.expectedActivationVersion + 1 || !approvedRef(item.used.result.mode)
      || !referenceValid(item.used.result.mode) || item.used.result.mode.id !== modeRef.id
      || item.used.result.mode.version !== modeRef.version || item.used.result.mode.digest !== modeRef.digest)) throw bad()
  }
  bounded(value)
  return copy(value) as unknown as ModeLedger
}
