/** Shared Web updater UI state. The host still owns tickets, locks and installs. */
export interface Advice { label: string; message: string; severity: string; code?: string; checkedAt?: number; expiresAt?: number; current: { agentVersion: string; pluginVersion: string }; targetVersion?: string }
export interface Job { jobId: string; statusOrigin: string; statusToken: string }
export interface UpdateCheck { advice: Advice; channel?: string; canInstall: boolean; mode?: 'none' | 'automatic' | 'manual' | 'busy'; reason: string; manualCommand?: string; ticket: string; activeJob?: Job | null; lastResult?: Progress | null }
export interface Progress { phase: string; progress: number; message: string; terminal: boolean; ok?: boolean }
export interface UpdateSnapshot { check: UpdateCheck | null; checking: boolean; progress: Progress | null; error: string; copied: boolean; resumeFailed: boolean }
export class WebUpdateStore {
  private value: UpdateSnapshot = { check: null, checking: false, progress: null, error: '', copied: false, resumeFailed: false }
  private listeners = new Set<() => void>()
  private reading?: Promise<void>
  private installing = false
  private disposed = false
  private job: Job | null = null
  private timer?: ReturnType<typeof setTimeout>
  private pollGeneration = 0
  private recovering = false
  private fetcher: typeof fetch
  constructor(readonly origin: string, fetcher: typeof fetch = globalThis.fetch) {
    // Browser fetch checks its Window receiver. Storing it unbound and calling
    // this.fetcher() uses the store as `this`, which Node/arrow mocks tolerate
    // but Chromium rejects. Bind once for check/start/poll/recovery alike;
    // endpoints, credentials and native update admission remain unchanged.
    this.fetcher = fetcher.bind(globalThis)
  }
  getSnapshot = (): UpdateSnapshot => this.value
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.listeners.size === 1) void this.refresh()
    return () => { this.listeners.delete(listener) }
  }
  private patch(update: Partial<UpdateSnapshot>) {
    if (this.disposed) return
    this.value = { ...this.value, ...update }
    for (const listener of this.listeners) listener()
  }
  refresh = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    if (this.reading) return this.reading
    this.patch({ checking: true, error: '', copied: false })
    this.reading = (async () => {
      try {
        const response = await this.fetcher(this.origin + '/gate/update/check', { signal: AbortSignal.timeout(10000) })
        const data = await response.json() as UpdateCheck & { error?: string }
        if (!response.ok) throw new Error(data.error || '暂时无法检查更新')
        if (!data.advice?.current || typeof data.advice.label !== 'string') throw new Error('更新检查返回信息不完整')
        this.patch({ check: data })
        // An already-running install remains the authority over progress.
        if (this.installing || this.job || this.recovering) return
        if (data.activeJob?.statusOrigin) this.follow(data.activeJob)
        else if (data.lastResult?.phase === 'unknown') this.patch({ progress: data.lastResult })
        else if (data.mode === 'busy') this.patch({ progress: { phase: 'preparing', progress: 0, message: '更新仍在准备或等待确认，请稍后重新检查；不要重复安装。', terminal: true } })
        else this.patch({ progress: data.lastResult ?? null })
      } catch (error) { this.patch({ check: null, error: error instanceof Error ? error.message : '暂时无法检查更新' }) }
      finally { this.patch({ checking: false }) }
    })().finally(() => { this.reading = undefined })
    return this.reading
  }
  private follow(job: Job) {
    if (this.disposed) return
    if (this.job?.jobId === job.jobId) return
    this.job = job
    const generation = ++this.pollGeneration, deadline = Date.now() + 10 * 60000
    clearTimeout(this.timer)
    this.patch({ progress: { phase: 'recovering', progress: 0, message: '正在恢复更新进度…', terminal: false } })
    const poll = async () => {
      if (this.disposed || generation !== this.pollGeneration) return
      let next: Progress | undefined
      try {
        const response = await this.fetcher(job.statusOrigin + '/status', { headers: { Authorization: 'Bearer ' + job.statusToken }, signal: AbortSignal.timeout(4000) })
        if (!response.ok) throw new Error('进度暂不可用')
        const result = await response.json() as Progress & { jobId?: string }
        if (result.jobId !== job.jobId || typeof result.terminal !== 'boolean' || typeof result.message !== 'string') throw new Error('进度不匹配')
        next = result
      } catch {
        try {
          const response = await this.fetcher(this.origin + '/gate/update/status', { signal: AbortSignal.timeout(3000) })
          const value = await response.json() as { activeJob?: Job | null; lastResult?: Progress & { jobId?: string } }
          if (response.ok && value.lastResult?.jobId === job.jobId) next = value.lastResult
        } catch { /* Host is restarting; preserve the last confirmed state. */ }
      }
      if (this.disposed || generation !== this.pollGeneration) return
      if (next) {
        this.patch({ progress: next })
        if (next.terminal) { this.job = null; if (next.ok) void this.resume(job.jobId); else void this.refresh(); return }
      }
      if (Date.now() > deadline) {
        this.job = null
        this.patch({ progress: { phase: 'unknown', progress: 0, message: '暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。', terminal: true } })
        return
      }
      this.timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
  }
  private async resume(jobId: string) {
    this.recovering = true
    const deadline = Date.now() + 30000
    const resume = async () => {
      try {
        const response = await this.fetcher(this.origin + '/gate/update/resume?job=' + encodeURIComponent(jobId), { signal: AbortSignal.timeout(3000) })
        if (!response.ok) throw new Error('尚未恢复')
        const data = await response.json() as { url?: string }
        if (!data.url) throw new Error('缺少恢复地址')
        const url = new URL(data.url)
        if (url.origin !== window.location.origin || url.pathname !== '/' || url.username || url.password || url.hash) throw new Error('恢复地址不匹配')
        if (!this.disposed) window.location.replace(url.href)
      } catch {
        if (this.disposed) return
        if (Date.now() >= deadline) { this.recovering = false; this.patch({ resumeFailed: true }); return }
        this.timer = setTimeout(() => void resume(), 1000)
      }
    }
    await resume()
  }
  install = async (): Promise<void> => {
    const { check, checking, error, progress } = this.value
    if (this.disposed || !check?.canInstall || checking || error || (progress && !progress.terminal) || this.installing || this.job || this.recovering) return
    this.installing = true
    // Invalidate the shared ticket before the first await: two open pages
    // cannot both admit an install, even when clicks occur in the same tick.
    this.patch({ error: '', check: { ...check, canInstall: false, ticket: '' }, progress: { phase: 'download', progress: 10, message: '正在下载并验证更新包；当前插件尚未替换', terminal: false } })
    let rejected = false
    try {
      const response = await this.fetcher(this.origin + '/gate/update/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: check.ticket }) })
      const data = await response.json() as Job & { error?: string }
      rejected = !response.ok && typeof data.error === 'string'
      if (!response.ok || !data.statusOrigin) throw new Error(data.error || '无法取得更新进度，请重新检查')
      this.follow(data)
    } catch (error) {
      if (this.disposed) return
      if (rejected) this.patch({ progress: { phase: 'failed', progress: 0, message: (error instanceof Error ? error.message : '更新暂不可用') + '。请重新检查更新。', terminal: true, ok: false } })
      else {
        try {
          const response = await this.fetcher(this.origin + '/gate/update/status', { signal: AbortSignal.timeout(3000) })
          const recovered = await response.json() as { activeJob?: Job | null }
          if (response.ok && recovered.activeJob?.statusOrigin) { this.follow(recovered.activeJob); return }
        } catch { /* A lost start reply is not evidence that nothing started. */ }
        this.patch({ progress: { phase: 'unknown', progress: 0, message: '连接中断，暂时无法确认更新结果。请稍后检查更新；不要重复安装或删除节点。', terminal: true } })
      }
    } finally { this.installing = false }
  }
  copyCommand = async (): Promise<void> => {
    if (!this.value.check?.manualCommand || this.value.checking || this.installing || this.job) return
    try { await navigator.clipboard.writeText(this.value.check.manualCommand); this.patch({ copied: true }) }
    catch { this.patch({ error: '复制失败，请手动选中下方命令复制。' }) }
  }
  dispose = (): void => { this.disposed = true; this.pollGeneration++; clearTimeout(this.timer); this.listeners.clear() }
}
