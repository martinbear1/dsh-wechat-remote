/** Optional, memory-only diagnostics. No reference to the normal page store. */
import { resolvePairingClient, type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js'
import { diagnosticField, sanitizeConnectionReport, type ConnectionDiagnosticReport } from '../connection-diagnostic-contract.js'

export interface DiagnosticSnapshot {
  diagnosticState: 'idle' | 'running' | 'ready' | 'cancelled' | 'error' | 'unsupported'
  diagnosticReport: ConnectionDiagnosticReport | null
}
const initial = (): DiagnosticSnapshot => ({ diagnosticState: 'idle', diagnosticReport: null })

export class ConnectionDiagnosticStore {
  private value = initial()
  private listeners = new Set<() => void>()
  private active?: { controller: AbortController; promise: Promise<void> }
  private disposed = false
  constructor(private describeHost: () => Promise<HarnessRemoteHostDescription>, private callManagement: CallPairingManagement) {}
  getSnapshot = (): DiagnosticSnapshot => this.value
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) this.reset()
    }
  }
  private publish(value: DiagnosticSnapshot): void {
    if (this.disposed) return
    this.value = value
    for (const listener of this.listeners) {
      // Auxiliary views must never throw into host reset/disposal or each other.
      try { listener() } catch { /* A faulty diagnostic observer cannot gate business work. */ }
    }
  }
  diagnose = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    if (this.active) return this.active.promise
    const controller = new AbortController()
    const active = { controller, promise: Promise.resolve() }
    this.active = active
    // Register the request before notifying views, including reentrant cancel.
    active.promise = Promise.resolve().then(async () => {
      try {
        if (controller.signal.aborted) return
        const client = await resolvePairingClient(this.describeHost, this.callManagement)
        if (this.active !== active) return
        const value = await client.diagnose(controller.signal)
        if (this.active !== active) return
        const report = sanitizeConnectionReport(value)
        if (!report) throw new Error('invalid diagnostic report')
        this.publish({ diagnosticState: 'ready', diagnosticReport: report })
      } catch (error) {
        if (this.active !== active) return
        const code = diagnosticField(error, 'code')
        this.publish({ diagnosticState: typeof code === 'string' && ['diagnostic-unsupported', 'diagnostic/unsupported', 'pairing/not-found', 'endpoint-not-found', 'not-found', 'not_found', 'unknown-endpoint', 'unimplemented'].includes(code)
          ? 'unsupported' : 'error', diagnosticReport: null })
      }
    }).finally(() => { if (this.active === active) this.active = undefined })
    this.publish({ diagnosticState: 'running', diagnosticReport: null })
    return active.promise
  }
  cancel = (clear = false): void => {
    const active = this.active
    if (!active && (!clear || this.value.diagnosticState === 'idle' && !this.value.diagnosticReport)) return
    this.active = undefined
    // This controller belongs only to the explicit diagnostic request.
    try { active?.controller.abort() } catch { /* Cleanup of optional diagnostics stays local. */ }
    this.publish({ diagnosticState: clear ? 'idle' : 'cancelled', diagnosticReport: null })
  }
  reset = (): void => { this.cancel(true) }
  dispose = (): void => {
    this.disposed = true
    this.listeners.clear()
    this.reset()
    this.value = initial()
  }
}
