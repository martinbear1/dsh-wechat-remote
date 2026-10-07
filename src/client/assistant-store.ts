/** Owner UI state. No raw preset files, installation scripts or model calls. */
export type AssistantMethod = 'assistantCatalog' | 'assistantDraft' | 'assistantPreview' | 'assistantInstall' | 'assistantStatus'
export type AssistantCall = (method: AssistantMethod, request: Record<string, unknown>) => Promise<any>
export interface AssistantUiState { catalog: any; preview: any; busy: boolean; message: string; error: string }
export class AssistantStore {
  private state: AssistantUiState = { catalog: null, preview: null, busy: false, message: '', error: '' }
  private listeners = new Set<() => void>()
  private epoch = 0
  private disposed = false
  constructor(private call: AssistantCall, private openSession?: (presetId: string, signal?: AbortSignal) => Promise<void>) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(patch: Partial<AssistantUiState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener()
  }
  reset = () => { this.epoch++; this.set({ catalog: null, preview: null, busy: false, message: '', error: '' }) }
  dispose = () => { this.reset(); this.disposed = true; this.listeners.clear() }
  private async run(action: (current: () => boolean) => Promise<void>) {
    if (this.disposed || this.state.busy) return
    const epoch = this.epoch, current = () => !this.disposed && epoch === this.epoch
    this.set({ busy: true, error: '' })
    try { await action(current) } catch (cause) { if (current()) this.set({ error: cause instanceof Error ? cause.message : '操作未完成，请核对状态' }) }
    finally { if (current()) this.set({ busy: false }) }
  }
  private async read(current: () => boolean) {
    // Do not leave a previous "installed" catalog actionable after a failed
    // fresh read or a disconnected native host.
    if (current()) this.set({ catalog: null })
    try {
      const catalog = await this.call('assistantCatalog', {})
      if (!current()) return
      if (catalog?.schema !== 'human.assistants.catalog.v1' || !Array.isArray(catalog.templates) || !Array.isArray(catalog.drafts)) throw new Error('助手目录格式不受支持')
      this.set({ catalog })
    } catch (error) { if (current()) this.set({ message: '' }); throw error }
  }
  load = () => this.run(current => this.read(current))
  private readyAssistant(presetId: string) {
    const item = this.state.catalog?.drafts?.find((entry: any) => entry.presetId === presetId)
    if (!item || item.state !== 'installed' || item.nativeState && item.nativeState !== 'installed')
      throw new Error('此助手已停用或尚未就绪，请核对下方组件开关。')
    return item
  }
  start = (presetId: string, signal?: AbortSignal) => this.run(async current => {
    this.set({ message: '' })
    // Refresh ownership/readiness, rather than trusting an old green label
    // after the user disabled a native component in another settings panel.
    await this.read(current)
    if (!current() || signal?.aborted) return
    this.readyAssistant(presetId)
    if (!this.openSession) throw new Error('当前 DSH 未提供快捷入口，请在新会话中选择此助手模式。')
    await this.openSession(presetId, signal)
  })
  dismissPreview = () => { if (!this.state.busy) this.set({ preview: null, message: '' }) }
  choose = (templateId: string) => this.run(async current => {
    this.set({ preview: null, message: '' })
    const included = this.state.catalog?.templates?.find((item: any) => item.id === templateId)?.builtin
    if (included) { await this.read(current); if (current()) this.set({ message: '此助手已包含在插件里，请在新会话中选择；无需另装独立包。' }); return }
    const pending = this.state.catalog?.drafts?.find((item: any) => item.templateId === templateId && item.state === 'draft')
    if (pending) {
      const preview = await this.call('assistantPreview', { id: pending.id, version: pending.version })
      if (current()) this.set({ preview }); return
    }
    const draft = await this.call('assistantDraft', { templateId })
    if (!current()) return
    await this.read(current)
    if (!current()) return
    const preview = await this.call('assistantPreview', { id: draft.id, version: draft.version })
    if (current()) this.set({ preview })
  })
  preview = (id: string, version: number) => this.run(async current => {
    this.set({ preview: null })
    const preview = await this.call('assistantPreview', { id, version })
    if (current()) this.set({ preview })
  })
  reinstall = (sourceId: string, sourceVersion: number) => this.run(async current => {
    this.set({ preview: null, message: '' })
    if (this.state.catalog?.drafts?.some((item: any) => item.id === sourceId && item.version === sourceVersion && item.replacement)) {
      await this.read(current); if (current()) this.set({ message: '这个旧模式已有内置版本，请在新会话中选择对应助手，无需重新安装旧包。' }); return
    }
    const draft = await this.call('assistantDraft', { sourceId, sourceVersion })
    if (!current()) return
    await this.read(current)
    if (!current()) return
    const preview = await this.call('assistantPreview', { id: draft.id, version: draft.version })
    if (current()) this.set({ preview })
  })
  install = () => this.run(async current => {
    const preview = this.state.preview
    if (!preview || preview.expiresAt <= Date.now()) throw new Error('请重新预览后确认安装')
    // Clear the consent before the external operation. A lost response must
    // lead to status verification, not a second press with old consent.
    this.set({ preview: null, message: '已提交原生安装，请等待结果。' })
    try {
      const result = await this.call('assistantInstall', { id: preview.id, version: preview.version, digest: preview.digest, previewId: preview.previewId })
      if (current()) this.set({ message: result.message || (result.state === 'installed' ? '原生预设已生效' : '请核对原生安装状态') })
    } finally { if (current()) await this.read(current) }
  })
  verify = (id: string, version: number) => this.run(async current => {
    this.set({ catalog: null, message: '' })
    const result = await this.call('assistantStatus', { id, version })
    if (!current()) return
    this.set({ message: result.message || '状态已核对' }); await this.read(current)
  })
}
