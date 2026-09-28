import type { CallPairingManagement } from './pairing-client.js'
import type { NativeUpdateStatus } from '../native-update-service.js'
import type { UpdateAdvice } from '../update-policy.js'
export interface NativeCheck { advice: UpdateAdvice; channel: 'stable' | 'preview'; canInstall: boolean; reason: string; ticket: string; status: NativeUpdateStatus }
interface Snapshot { checking: boolean; starting: boolean; check: NativeCheck | null; status: NativeUpdateStatus | null; error: string | null }
/** Same-node shared state: one check, one deliberate submission, no blind retry. */
export class NativeUpdateStore {
  private value: Snapshot = { checking: false, starting: false, check: null, status: null, error: null }
  private listeners = new Set<() => void>()
  private reading?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private disposed = false
  private checkRevision = 0
  private checkInvalidated = false
  constructor(private call: CallPairingManagement) {}
  getSnapshot = () => this.value
  private patch(next: Partial<Snapshot>) { if (!this.disposed) { this.value = { ...this.value, ...next }; for (const listener of this.listeners) listener() } }
  subscribe = (listener: () => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.checkInvalidated) { this.refreshInvalidatedCheck(); if (this.active()) this.poll() }
    else if (!this.value.check && !this.value.starting) void this.refresh()
    else if (this.active()) this.poll()
    return () => { this.listeners.delete(listener); if (!this.listeners.size) { clearTimeout(this.timer); this.timer = undefined } }
  }
  private active() { return this.value.status && ['preparing', 'installing', 'unknown', 'restart-required'].includes(this.value.status.phase) }
  /** Companion activity changes admission, not this node's install result.
   * Keep real job progress; invalidate its cached check/ticket and read again.
   * Never turn a status transition into an install, approval or blind retry. */
  invalidateCheck = (): void => {
    if (this.disposed) return
    this.checkRevision++
    this.checkInvalidated = true
    if (this.value.check) this.patch({ check: { ...this.value.check, canInstall: false, ticket: '' } })
    this.refreshInvalidatedCheck()
  }
  private refreshInvalidatedCheck() {
    if (!this.disposed && this.checkInvalidated && this.listeners.size && !this.value.starting && !this.active()) void this.refresh()
  }
  refresh = (): Promise<void> => {
    if (this.disposed || this.value.starting) return Promise.resolve()
    if (this.reading) return this.reading
    const revision = this.checkRevision
    this.checkInvalidated = false
    this.patch({ checking: true, error: null })
    this.reading = (async () => {
      try {
        const check = await this.call('update-check') as NativeCheck
        if (this.disposed || revision !== this.checkRevision) return
        if (!check?.advice || !check.status || typeof check.canInstall !== 'boolean') throw Error('invalid update response')
        this.patch({ check, status: check.status })
        if (this.active()) this.poll()
      } catch {
        if (this.disposed || revision !== this.checkRevision) return
        // Probe only the existing read-only status endpoint: old RC5 backends
        // do not have update-check, yet pairing and chat may be fully healthy.
        let legacy = false
        try { const status = await this.call('status') as { plugin?: unknown }; legacy = Boolean(status && !status.plugin) } catch {}
        if (this.disposed || revision !== this.checkRevision) return
        this.patch({ check: null, error: legacy
          ? '当前运行的连接服务尚不支持此更新入口。若刚安装新版，请在任务结束后退出并重新打开 Desktop；无需重新配对。仍不可用时请在原生插件管理器核对安装。'
          : '本次更新检查未完成，不能据此判断已是最新版。请稍后重试；配对和聊天不受此次检查失败影响。' })
      }
      finally { this.patch({ checking: false }) }
    })().finally(() => { this.reading = undefined; this.refreshInvalidatedCheck() })
    return this.reading
  }
  install = async (): Promise<void> => {
    const check = this.value.check
    if (this.disposed || this.checkInvalidated || this.value.starting || this.value.checking || !check?.canInstall || !check.ticket) return
    this.patch({ starting: true, error: null, check: { ...check, canInstall: false, ticket: '' } })
    try {
      const status = await this.call('update-start', { ticket: check.ticket }) as NativeUpdateStatus
      this.patch({ status })
    } catch (error) {
      this.patch({ status: (error as { code?: string })?.code === 'update/not-started'
        ? { phase: 'failed', message: error instanceof Error ? error.message : '尚未启动更新，请重新检查' }
        : { phase: 'unknown', message: '更新提交结果暂未确认，正在核对；请勿重复安装。' } })
    } finally { this.patch({ starting: false }); this.poll(); this.refreshInvalidatedCheck() }
  }
  private poll() {
    if (this.disposed || this.timer || !this.listeners.size || !this.active()) return
    this.timer = setTimeout(async () => {
      try {
        const status = await this.call('update-status') as NativeUpdateStatus
        if (!status || !['idle', 'preparing', 'installing', 'restart-required', 'complete', 'failed', 'unknown'].includes(status.phase)) throw Error('invalid status')
        this.patch({ status, error: status.phase === 'idle' ? '尚未发现已接受的更新，请重新检查后再操作。' : null })
      } catch { this.patch({ error: '更新状态暂不可用；恢复连接后继续核对，不会重复安装。' }) }
      finally { this.timer = undefined; this.poll(); this.refreshInvalidatedCheck() }
    }, 2000)
  }
  dispose() { this.disposed = true; this.checkRevision++; this.checkInvalidated = false; clearTimeout(this.timer); this.listeners.clear() }
}
