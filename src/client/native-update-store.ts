import type { CallPairingManagement } from './pairing-client.js'
import type { NativeUpdateStatus } from '../native-update-service.js'
import type { UpdateAdvice } from '../update-policy.js'
export interface NativeCheck { advice: UpdateAdvice; channel: 'stable' | 'preview'; canInstall: boolean; reason: string; ticket: string; status: NativeUpdateStatus }
export interface RestartNotice { jobId: string; installedVersion: string; runningVersion?: string }
interface Snapshot { checking: boolean; starting: boolean; check: NativeCheck | null; status: NativeUpdateStatus | null; error: string | null }
export function nativeUpdateFailed(status: NativeUpdateStatus | null): boolean {
  return status?.phase === 'failed' || ['failed', 'cancelled'].includes(status?.nativeResult?.application ?? '')
}
/** Permission belongs to the exact checked snapshot, never stale update advice. */
export function nativeUpdateCanStart(status: NativeUpdateStatus | null, check: NativeCheck | null): boolean {
  return Boolean(status && check?.canInstall && check.ticket && status === check.status
    && !['preparing', 'installing', 'restart-required'].includes(status.phase))
}
export function nativeUpdatePending(status: NativeUpdateStatus | null, check: NativeCheck | null): boolean {
  return Boolean(status && !nativeUpdateFailed(status)
    && (['preparing', 'installing', 'restart-required'].includes(status.phase)
      || status.phase === 'unknown' && !nativeUpdateCanStart(status, check)))
}
/** Same-node shared state: one check, one deliberate submission, no blind retry. */
export class NativeUpdateStore {
  private value: Snapshot = { checking: false, starting: false, check: null, status: null, error: null }
  private listeners = new Set<() => void>()
  private reading?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private disposed = false
  private completedCheck?: string
  // Memory-only presentation intent; never used to allow/refuse an update.
  private noticeIntent?: { target?: string; previousJob?: string; acceptedJob?: string }
  private restartNotice?: RestartNotice
  constructor(private call: CallPairingManagement) {}
  getSnapshot = () => this.value
  private patch(next: Partial<Snapshot>) {
    if (this.disposed) return
    this.value = { ...this.value, ...next }
    if (!this.active()) { clearTimeout(this.timer); this.timer = undefined }
    for (const listener of this.listeners) listener()
  }
  subscribe = (listener: () => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (!this.value.check && !this.value.starting) void this.refresh()
    else if (this.active()) this.poll()
    return () => { this.listeners.delete(listener); if (!this.listeners.size) { clearTimeout(this.timer); this.timer = undefined } }
  }
  private active() { return nativeUpdatePending(this.value.status, this.value.check) }
  takeRestartNotice = (): RestartNotice | undefined => {
    const result = this.disposed ? undefined : this.restartNotice
    this.restartNotice = undefined
    return result
  }
  private observeRestart(status: NativeUpdateStatus, accepted = false) {
    try {
      const intent = this.noticeIntent
      if (!status || typeof status !== 'object') return
      if (accepted && intent) intent.acceptedJob = status.jobId
      if (status.phase === 'failed' || status.phase === 'complete' || status.phase === 'idle') { this.noticeIntent = undefined; this.restartNotice = undefined; return }
      if (!intent || status.phase !== 'restart-required' || typeof intent.target !== 'string' || !intent.target
          || typeof status.jobId !== 'string' || !status.jobId
          || status.targetVersion !== intent.target || status.jobId === intent.previousJob
          || intent.acceptedJob && status.jobId !== intent.acceptedJob) return
      this.noticeIntent = undefined
      this.restartNotice = { jobId: status.jobId, installedVersion: status.targetVersion,
        runningVersion: typeof status.previousVersion === 'string' ? status.previousVersion : undefined }
    } catch { /* Presentation metadata must never change the update outcome. */ }
  }
  refresh = (): Promise<void> => this.readCheck()
  private readCheck(preserveCompleteOnFailure = false): Promise<void> {
    if (this.disposed || this.value.starting) return Promise.resolve()
    if (this.reading) return this.reading
    const observed = this.value.status
    this.patch({ checking: true, error: null })
    this.reading = (async () => {
      try {
        let check = await this.call('update-check') as NativeCheck
        if (this.disposed || this.value.status !== observed) return
        if (!check?.advice || typeof check.canInstall !== 'boolean') throw Error('invalid update response')
        const status = this.normalizeStatus(check.status)
        if (status !== check.status) check = { ...check, status }
        this.patch({ check, status: check.status })
        if (this.active()) this.poll()
      } catch {
        if (this.disposed || this.value.status !== observed) return
        if (preserveCompleteOnFailure || observed?.phase === 'complete') {
          this.patch({ error: '更新已生效，版本信息暂未刷新。可稍后检查更新；无需重复安装。' })
          return
        }
        // Probe only the existing read-only status endpoint: old RC5 backends
        // do not have update-check, yet pairing and chat may be fully healthy.
        let legacy = false
        try { const status = await this.call('status') as { plugin?: unknown }; legacy = Boolean(status && !status.plugin) } catch {}
        if (this.disposed || this.value.status !== observed) return
        this.patch({ check: null, error: legacy
          ? '当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后正常重启当前 DSH；无需重新配对。仍不可用时请在原生插件管理器核对安装。'
          : '本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。' })
      }
      finally { this.patch({ checking: false }) }
    })().finally(() => { this.reading = undefined })
    return this.reading
  }
  /** One read-only refresh per confirmed completion, never an installation retry. */
  private async refreshCompleted(status: NativeUpdateStatus | null) {
    if (this.disposed || !this.listeners.size || this.value.status !== status || status?.phase !== 'complete') return
    let key: string
    try {
      if (typeof status.targetVersion !== 'string' || !status.targetVersion) return
      key = JSON.stringify([status.jobId, status.targetVersion])
    } catch { return }
    if (this.completedCheck === key) return
    this.completedCheck = key
    if (this.reading) await this.reading
    if (this.disposed || !this.listeners.size || this.value.status !== status) return
    await this.readCheck(true)
  }
  private normalizeStatus(status: NativeUpdateStatus): NativeUpdateStatus {
    if (!status || !['idle', 'preparing', 'installing', 'restart-required', 'complete', 'failed', 'unknown'].includes(status.phase)) throw Error('invalid status')
    // Earlier providers labelled changed:true native failures as unknown. The
    // receipt is terminal, not proof of rollback or permission to retry.
    return nativeUpdateFailed(status) && status.phase !== 'failed' ? { ...status, phase: 'failed' } : status
  }
  private async readStatus(): Promise<NativeUpdateStatus> {
    const status = await this.call('update-status') as NativeUpdateStatus
    return this.normalizeStatus(status)
  }
  /** Another tab may own the accepted job. Only observe it; do not obtain a new ticket. */
  private async recoverRejectedStart(previous: NativeUpdateStatus) {
    const rejected = this.value.status
    if (this.disposed) return
    try {
      const status = await this.readStatus()
      if (this.disposed || this.value.status !== rejected || status.phase === 'idle'
          || typeof status.jobId !== 'string' || !status.jobId || status.jobId === previous.jobId) return
      this.observeRestart(status)
      this.patch({ status, error: null })
    } catch { /* A failed read cannot turn a definite refusal into a new attempt. */ }
  }
  install = async (): Promise<void> => {
    const check = this.value.check
    if (this.disposed || this.value.starting || this.value.checking || !check || !nativeUpdateCanStart(this.value.status, check)) return
    try { this.noticeIntent = { target: check.advice.targetVersion, previousJob: check.status.jobId } }
    catch { this.noticeIntent = undefined }
    this.restartNotice = undefined
    this.patch({ starting: true, error: null, check: { ...check, canInstall: false, ticket: '' } })
    try {
      const status = this.normalizeStatus(await this.call('update-start', { ticket: check.ticket }) as NativeUpdateStatus)
      this.observeRestart(status, true)
      this.patch({ status })
    } catch (error) {
      if ((error as { code?: string })?.code === 'update/not-started') this.noticeIntent = undefined
      this.patch({ status: (error as { code?: string })?.code === 'update/not-started'
        ? { phase: 'failed', message: error instanceof Error ? error.message : '尚未启动更新，请重新检查' }
        : { phase: 'unknown', message: '更新提交结果暂未确认，正在核对；请勿重复安装。' } })
      if ((error as { code?: string })?.code === 'update/not-started') await this.recoverRejectedStart(check.status)
    } finally { this.patch({ starting: false }); await this.refreshCompleted(this.value.status); this.poll() }
  }
  private poll() {
    if (this.disposed || this.timer || !this.listeners.size || !this.active()) return
    const timer = setTimeout(async () => {
      const observed = this.value.status
      try {
        const status = await this.readStatus()
        if (this.disposed || this.value.status !== observed) return
        this.observeRestart(status)
        this.patch({ status, error: status.phase === 'idle' ? '尚未发现已接受的更新，请重新检查后再操作。' : null })
        await this.refreshCompleted(status)
      } catch { if (!this.disposed && this.value.status === observed) this.patch({ error: '更新状态暂不可用；恢复连接后继续核对，不会重复安装。' }) }
      finally { if (this.timer === timer) this.timer = undefined; this.poll() }
    }, 2000)
    this.timer = timer
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); this.noticeIntent = undefined; this.restartNotice = undefined }
}
