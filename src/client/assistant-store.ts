/** Owner UI state. No raw preset files, installation scripts or model calls. */
export type AssistantMethod = 'assistantCatalog' | 'assistantDraft' | 'assistantPreview' | 'assistantInstall' | 'assistantStatus' | 'assistantSessionPrepare' | 'assistantSessionStatus'
export type AssistantCall = (method: AssistantMethod, request: Record<string, unknown>) => Promise<any>
export interface AssistantUiState { catalog: any; preview: any; busy: boolean; message: string; error: string }
export class AssistantStore {
  private state: AssistantUiState = { catalog: null, preview: null, busy: false, message: '', error: '' }
  private listeners = new Set<() => void>()
  private epoch = 0
  private disposed = false
  constructor(private call: AssistantCall) {}
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
    const catalog = await this.call('assistantCatalog', {})
    if (!current()) return
    if (catalog?.schema !== 'human.assistants.catalog.v1' || !Array.isArray(catalog.templates) || !Array.isArray(catalog.drafts)) throw new Error('助手目录格式不受支持')
    this.set({ catalog })
  }
  load = () => this.run(current => this.read(current))
  choose = (templateId: string) => this.run(async current => {
    this.set({ preview: null, message: '' })
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
    const result = await this.call('assistantStatus', { id, version })
    if (!current()) return
    this.set({ message: result.message || '状态已核对' }); await this.read(current)
  })
}
