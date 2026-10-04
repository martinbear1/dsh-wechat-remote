import { randomBytes } from 'node:crypto'
import { copy, exact, fail, identifier, row, StateQueue, version, type WorkflowDataStore } from '../human-workflow/data.js'
import { assistantDefinition, definitionDigest, type AssistantDefinition } from './definition.js'
import { assistantTemplates } from './catalog.js'
import type { NativeAssistantAdapter, NativeAssistantPreview, NativeAssistantInstallation } from './types.js'
import { validateNativeAssistantPreview } from './native-adapter.js'

export interface AssistantRef { id: string; version: number; digest: string }
type AssistantNativePlan = NativeAssistantPreview
type AssistantNativeAdapter = NativeAssistantAdapter
type AssistantInstallResult = NativeAssistantInstallation
interface Entry extends AssistantRef {
  definition: AssistantDefinition; state: 'draft' | 'installing' | 'installed' | 'unknown'
  createdAt: number; plan?: AssistantNativePlan; result?: AssistantInstallResult
}
interface Preview extends AssistantRef { previewId: string; expiresAt: number; native: AssistantNativePlan }
interface Ledger { schema: 'human.assistants.v1'; nodeId: string; entries: Entry[]; previews: Preview[] }
export class AssistantRegistry {
  private tail: Promise<unknown> = Promise.resolve()
  private readonly settle = new AbortController().signal
  private stopped = false
  private constructor(private state: StateQueue<Ledger>, private nodeId: string, private native: AssistantNativeAdapter,
    private assertIdentity: () => void, private now: () => number) {}
  static async open(store: WorkflowDataStore, options: { nodeId: string; native: AssistantNativeAdapter; assertIdentity(): void; now?: () => number }): Promise<AssistantRegistry> {
    if (!identifier(options.nodeId)) throw fail('assistant-node-invalid', '节点身份无效')
    const raw = await store.load()
    const ledger: Ledger = raw === undefined ? { schema: 'human.assistants.v1', nodeId: options.nodeId, entries: [], previews: [] } : validateLedger(raw, options.nodeId)
    return new AssistantRegistry(new StateQueue(store, ledger), options.nodeId, options.native, options.assertIdentity, options.now || Date.now)
  }
  private check(signal?: AbortSignal) { if (this.stopped) throw fail('assistant-disabled', '助手功能已关闭'); signal?.throwIfAborted(); this.assertIdentity() }
  private find(id: string, selectedVersion: number): Entry {
    if (!identifier(id) || !version(selectedVersion)) throw fail('assistant-reference-invalid', '助手版本无效')
    const entry = this.state.current().entries.find(item => item.id === id && item.version === selectedVersion)
    if (!entry) throw fail('assistant-not-found', '当前节点没有这个助手版本')
    return entry
  }
  catalog(signal: AbortSignal) {
    const operation = this.tail.then(async () => {
      this.check(signal)
      let native
      try { native = await this.native.probe() }
      catch { this.check(signal); native = { supported: false, basePresets: [], reason: '暂时无法读取原生助手，请稍后核对。' } }
      this.check(signal)
      const checked = new Map<string, AssistantInstallResult>()
      // The journal is installation history, never evidence of current native
      // availability. Serialize against installation and retain every old plan.
      for (const entry of this.state.current().entries.map(copy)) if (entry.state !== 'draft') {
        checked.set(`${entry.id}:${entry.version}`, await this.reconcile(entry, signal))
      }
      this.check(signal)
      const templates = assistantTemplates(), templatesByDigest = new Map(templates.map(t => [definitionDigest(t.definition), t.id]))
      return { schema: 'human.assistants.catalog.v1', nodeId: this.nodeId, native, templates,
        drafts: this.state.current().entries.map(e => {
          const observed = checked.get(`${e.id}:${e.version}`)
          return { id: e.id, version: e.version, digest: e.digest, name: e.definition.name,
            description: e.definition.description, state: e.state,
            ...(observed ? { nativeState: observed.nativeState || (observed.state === 'installed' ? 'installed' : 'unknown'), reason: observed.message || '' } : {}),
            ...(templatesByDigest.has(e.digest) ? { templateId: templatesByDigest.get(e.digest) } : {}),
            ...(e.result?.presetId ? { presetId: e.result.presetId } : {}) }
        }) }
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  draft(request: { templateId?: string; definition?: unknown; id?: string; expectedVersion?: number }, signal: AbortSignal) {
    this.check(signal)
    if (!row(request) || !exact(request, [], ['templateId', 'definition', 'id', 'expectedVersion'])
      || Number(request.templateId !== undefined) + Number(request.definition !== undefined) !== 1) throw fail('assistant-draft-invalid', '请选择助手或提供结构化草稿')
    const template = request.templateId === undefined ? undefined : assistantTemplates().find(item => item.id === request.templateId)
    const definition = assistantDefinition(template?.definition || request.definition)
    return this.state.update(ledger => {
      this.check(signal)
      if (ledger.entries.length >= 96) throw fail('assistant-capacity', '助手版本已达到本机容量上限')
      const previous = request.id === undefined ? [] : ledger.entries.filter(e => e.id === request.id)
      const latest = previous.reduce((a, b) => Math.max(a, b.version), 0)
      if (latest === Number.MAX_SAFE_INTEGER) throw fail('assistant-capacity', '助手版本已达到上限')
      if (request.id !== undefined && (!identifier(request.id) || !latest || request.expectedVersion !== latest)
        || request.id === undefined && request.expectedVersion !== undefined) throw fail('assistant-version-conflict', '助手已经变化，请重新读取后修改')
      const entry: Entry = { id: request.id || 'assistant_' + randomBytes(12).toString('hex'), version: latest + 1,
        digest: definitionDigest(definition), definition, state: 'draft', createdAt: this.now() }
      ledger.entries.push(entry)
      return entry
    }, signal)
  }
  get(ref: { id: string; version: number }) { this.check(); return publicEntry(this.find(ref.id, ref.version)) }
  async preview(ref: { id: string; version: number }, signal: AbortSignal) {
    this.check(signal)
    const entry = copy(this.find(ref.id, ref.version))
    if (entry.state !== 'draft') throw fail('assistant-install-started', '这个版本已提交安装，请核对状态，不要重复提交')
    const presetId = `hr-assistant-${entry.id.slice(-24)}-v${entry.version}`
    const native = validateNativeAssistantPreview(await this.native.preview({ presetId, definition: entry.definition }, signal))
    this.check(signal)
    if (native.presetId !== presetId || native.basePreset !== entry.definition.basePreset || definitionDigest(native.definition) !== entry.digest) throw fail('assistant-native-invalid', '宿主预览不匹配此助手')
    const preview: Preview = { id: entry.id, version: entry.version, digest: entry.digest,
      previewId: randomBytes(16).toString('hex'), expiresAt: this.now() + 10 * 60_000, native: copy(native) }
    return this.state.update(ledger => {
      this.check(signal)
      if (this.find(ref.id, ref.version).state !== 'draft') throw fail('assistant-install-started', '安装状态已变化')
      ledger.previews = ledger.previews.filter(p => p.expiresAt > this.now() && !(p.id === ref.id && p.version === ref.version)).slice(-31)
      ledger.previews.push(preview)
      return { id: preview.id, version: preview.version, digest: preview.digest, previewId: preview.previewId,
        expiresAt: preview.expiresAt, definition: entry.definition,
        native: { presetId: native.presetId, basePreset: native.basePreset, warnings: native.warnings } }
    }, signal)
  }
  /** Owner RPC only: tools can draft, never approve/install. A lost native
   * response is reconciled read-only; it never becomes a second installation. */
  install(request: AssistantRef & { previewId: string }, signal: AbortSignal) {
    const operation = this.tail.then(async () => {
      this.check(signal)
      if (!row(request) || !exact(request, ['id', 'version', 'digest', 'previewId'])) throw fail('assistant-install-invalid', '安装确认参数无效')
      const entry = copy(this.find(request.id, request.version))
      if (entry.digest !== request.digest) throw fail('assistant-version-conflict', '确认内容已经变化')
      if (entry.state !== 'draft') return this.reconcile(entry, signal)
      const preview = this.state.current().previews.find(p => p.id === request.id && p.version === request.version
        && p.digest === request.digest && p.previewId === request.previewId && p.expiresAt > this.now())
      if (!preview) throw fail('assistant-preview-expired', '请重新预览此助手后再确认安装')
      const plan = copy(preview.native)
      await this.state.update(ledger => {
        this.check(signal)
        const e = ledger.entries.find(e => e.id === entry.id && e.version === entry.version)!
        e.state = 'installing'; e.plan = plan
        ledger.previews = ledger.previews.filter(p => p.id !== e.id || p.version !== e.version)
      }, signal)
      let result: AssistantInstallResult
      try { result = await this.native.install(plan, signal) }
      catch { result = { presetId: plan.presetId, state: 'unknown', message: '安装结果尚未确认；请检查状态，不要重复安装。' } }
      await this.saveResult(entry, result)
      this.check(signal)
      return { id: entry.id, version: entry.version, digest: entry.digest, ...result }
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  status(ref: { id: string; version: number }, signal: AbortSignal) {
    const operation = this.tail.then(() => {
      this.check(signal); return this.reconcile(copy(this.find(ref.id, ref.version)), signal)
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  /** A launch must freshly verify its exact approved plan, not trust catalog
   * cache. undefined means unmanaged; false must not fall back to defaults. */
  async verifyPreset(presetId: string, signal: AbortSignal): Promise<boolean | undefined> {
    this.check(signal)
    const entry = this.state.current().entries.find(e => e.plan?.presetId === presetId)
    if (!entry) return undefined
    return (await this.status(entry, signal)).state === 'installed'
  }
  /** Explicit owner reinstallation starts a NEW draft and approval. Never
   * reuse historical consent, artifacts, ID or native installation receipt. */
  async redraft(ref: { id: string; version: number }, signal: AbortSignal) {
    const status = await this.status(ref, signal)
    if (status.nativeState !== 'uninstalled') throw fail('assistant-reinstall-unavailable', '请先核对原生安装状态；仅已确认未安装的助手可以重新准备安装。')
    this.check(signal)
    return this.draft({ definition: copy(this.find(ref.id, ref.version).definition) }, signal)
  }
  private async reconcile(entry: Entry, signal: AbortSignal) {
    if (!entry.plan) throw fail('assistant-not-installed', '此助手尚未提交安装')
    let result: AssistantInstallResult
    try {
      result = await this.native.verify(entry.plan, signal)
      this.validateResult(entry.plan, result)
    } catch {
      // Native I/O failures are not evidence that the old installed flag is
      // still true. Do not expose native exceptions/paths in the public result.
      this.check(signal)
      result = { presetId: entry.plan.presetId, state: 'unknown', nativeState: 'unknown', message: '暂时无法核对这个助手的安装状态，请稍后刷新或在原生插件管理中检查。' }
    }
    this.check(signal); await this.saveResult(entry, result); this.check(signal)
    return { id: entry.id, version: entry.version, digest: entry.digest, ...result }
  }
  private validateResult(plan: AssistantNativePlan, result: AssistantInstallResult) {
    if (!row(result) || !exact(result, ['presetId', 'state'], ['message', 'nativeState'])
      || result.presetId !== plan.presetId || !['installed', 'pending-restart', 'unknown'].includes(result.state)
      || result.message !== undefined && (typeof result.message !== 'string' || result.message.length > 2000)
      || result.nativeState !== undefined && !['installed', 'uninstalled', 'disabled', 'stale', 'unknown'].includes(result.nativeState)
      || result.nativeState !== undefined && (result.state === 'installed') !== (result.nativeState === 'installed'))
      throw fail('assistant-native-invalid', '宿主安装结果不匹配')
  }
  private saveResult(entry: Entry, result: AssistantInstallResult) {
    if (!entry.plan && !this.find(entry.id, entry.version).plan) throw fail('assistant-native-invalid', '安装记录缺失')
    const plan = entry.plan || this.find(entry.id, entry.version).plan!
    this.validateResult(plan, result)
    // Persist only the legacy receipt shape so older releases can still open
    // this ledger. Detailed native status is always re-observed, never cached.
    const saved = { presetId: result.presetId, state: result.state, ...(result.message === undefined ? {} : { message: result.message }) }
    const prior = this.find(entry.id, entry.version)
    if (prior.state === (result.state === 'installed' ? 'installed' : 'unknown') && JSON.stringify(prior.result) === JSON.stringify(saved)) return Promise.resolve()
    return this.state.update(ledger => {
      const e = ledger.entries.find(e => e.id === entry.id && e.version === entry.version)!
      e.result = copy(saved); e.state = result.state === 'installed' ? 'installed' : 'unknown'
    }, this.settle)
  }
  installedForPreset(presetId: string) {
    this.check()
    const entry = this.state.current().entries.find(e => e.state === 'installed' && e.result?.presetId === presetId)
    return entry ? publicEntry(entry) : undefined
  }
  async close() { this.stopped = true; await this.tail; await this.state.close() }
}
/** Never expose the native base document/patch, host path or install receipt to
 * a model or remote UI. Those are private adapter reconciliation data. */
function publicEntry(e: Entry) {
  return copy({ id: e.id, version: e.version, digest: e.digest, definition: e.definition, state: e.state,
    ...(e.result?.presetId ? { presetId: e.result.presetId } : {}) })
}
function validateLedger(value: unknown, nodeId: string): Ledger {
  const invalid = () => fail('assistant-store-invalid', '助手账本无效或不属于当前节点，未覆盖原文件')
  if (!row(value) || !exact(value, ['schema', 'nodeId', 'entries', 'previews']) || value.schema !== 'human.assistants.v1' || value.nodeId !== nodeId
    || !Array.isArray(value.entries) || value.entries.length > 96 || !Array.isArray(value.previews) || value.previews.length > 32) throw invalid()
  const seen = new Set<string>()
  for (const e of value.entries) {
    if (!row(e) || !exact(e, ['id', 'version', 'digest', 'definition', 'state', 'createdAt'], ['plan', 'result']) || !identifier(e.id) || !version(e.version)
      || seen.has(`${e.id}:${e.version}`) || !['draft', 'installing', 'installed', 'unknown'].includes(String(e.state))
      || !Number.isSafeInteger(e.createdAt) || Number(e.createdAt) < 0 || e.digest !== definitionDigest(assistantDefinition(e.definition))) throw invalid()
    if (!/^assistant_[a-f0-9]{24}$/.test(String(e.id))) throw invalid()
    if (e.state === 'draft' && (e.plan !== undefined || e.result !== undefined)) throw invalid()
    if (e.state !== 'draft') {
      const plan = validateNativeAssistantPreview(e.plan)
      if (definitionDigest(plan.definition) !== e.digest || plan.presetId !== `hr-assistant-${String(e.id).slice(-24)}-v${e.version}`) throw invalid()
      if (e.result !== undefined && (!row(e.result) || !exact(e.result, ['presetId', 'state'], ['message']) || e.result.presetId !== plan.presetId
        || !['installed', 'pending-restart', 'unknown'].includes(String(e.result.state)) || e.result.message !== undefined && typeof e.result.message !== 'string')) throw invalid()
    }
    if (e.state === 'installed' && (!row(e.result) || e.result.state !== 'installed' || e.result.presetId !== (e.plan as AssistantNativePlan)?.presetId)) throw invalid()
    seen.add(`${e.id}:${e.version}`)
  }
  // Previews never survive process restart. A previous UI must re-read the
  // live native base and obtain a fresh explicit confirmation.
  return { ...(copy(value) as unknown as Ledger), previews: [] }
}
