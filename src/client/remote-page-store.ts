/** One memory-only view model per connected host, shared by every entry. */
import { resolvePairingClient, type GateRuntimeInfo, type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js'
import { WebUpdateStore } from './web-update-store.js'
import { NativeUpdateStore } from './native-update-store.js'

export interface PairCode { qrDataUrl: string; mode: 'secure-lan-route' | 'public-relay'; expiresAt: number }
export interface GateStatus {
  gate?: GateRuntimeInfo
  plugin?: { runningVersion: string; installedVersion: string }
  lan: { ip: string; port: number }
  publicRelay: { enabled: boolean; state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline';
    remoteAccess?: { status: 'active' | 'expired' | 'suspended' | 'not_entitled'; validUntil?: number | null } | null }
  agent?: { agentName?: string; hostName?: string }
}
export interface PageSnapshot {
  loadState: 'loading' | 'ready' | 'error'
  qrState: 'idle' | 'loading' | 'ready' | 'expired' | 'error'
  status: GateStatus | null; host: HarnessRemoteHostDescription | null; runtime: GateRuntimeInfo | null
  localOrigin: string | null; qr: PairCode | null; error: string | null
}
const initial = (): PageSnapshot => ({ loadState: 'loading', qrState: 'idle', status: null, host: null,
  runtime: null, localOrigin: null, qr: null, error: null })

export class RemotePageStore {
  updates?: WebUpdateStore
  nativeUpdates?: NativeUpdateStore
  private value = initial()
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setInterval>
  private reading?: Promise<void>
  private pairing?: Promise<void>
  private disposed = false
  private identity = ''
  private generation = 0
  constructor(private describeHost: () => Promise<HarnessRemoteHostDescription>, private callManagement: CallPairingManagement) {}
  getSnapshot = (): PageSnapshot => this.value
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (!this.timer) {
      void this.refresh()
      this.timer = setInterval(() => void this.refresh(), 2000)
    }
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) { clearInterval(this.timer); this.timer = undefined }
    }
  }
  private patch(update: Partial<PageSnapshot>) {
    if (this.disposed) return
    this.value = { ...this.value, ...update }
    for (const listener of this.listeners) listener()
  }
  private async client() {
    const client = await resolvePairingClient(this.describeHost, this.callManagement)
    if (this.disposed) throw new Error('disposed')
    const identity = `${client.host.agentInstanceId ?? client.host.computerName}/${client.runtime.profileScope ?? 'web'}`
    if (this.identity && this.identity !== identity) { this.generation++; this.value = initial(); this.updates?.dispose(); this.updates = undefined; this.nativeUpdates?.dispose(); this.nativeUpdates = undefined }
    this.identity = identity
    // New Web and Desktop hosts share the authenticated native manager. Keep
    // the old HTTP view only for an explicitly described legacy Web backend;
    // loading new UI files must not send a new operation to an old runtime.
    const native = client.runtime.updates === 'native-v1' || client.runtime.profileScope === 'desktop'
    if (native && !this.nativeUpdates) this.nativeUpdates = new NativeUpdateStore(this.callManagement)
    if (!native && this.nativeUpdates) { this.nativeUpdates.dispose(); this.nativeUpdates = undefined }
    const legacyOrigin = native ? null : client.localOrigin
    if (this.updates?.origin !== legacyOrigin) {
      this.updates?.dispose()
      this.updates = legacyOrigin ? new WebUpdateStore(legacyOrigin) : undefined
    }
    this.patch({ host: client.host, runtime: client.runtime, localOrigin: client.localOrigin })
    return client
  }
  refresh = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    if (this.reading) return this.reading
    this.reading = (async () => {
      try {
        const client = await this.client(), generation = this.generation
        const status = { ...await client.status() as GateStatus }
        if (generation !== this.generation) return
        this.patch({ status, runtime: status.gate ?? client.runtime, loadState: 'ready', error: null,
          ...(this.value.qr && this.value.qr.expiresAt <= Date.now() ? { qrState: 'expired' as const, qr: null } : {}) })
      } catch { this.patch({ loadState: 'error', error: '连接服务暂未就绪。请确认 DSH 正在运行，然后重试。' }) }
    })().finally(() => { this.reading = undefined })
    return this.reading
  }
  generateQr = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    if (this.pairing) return this.pairing
    this.patch({ qrState: 'loading', qr: null, error: null })
    this.pairing = (async () => {
      try {
        const client = await this.client(), generation = this.generation
        const qr = await client.pairCode() as PairCode
        if (generation !== this.generation) return
        if (!qr?.qrDataUrl?.startsWith('data:image/') || !Number.isFinite(qr.expiresAt) || qr.expiresAt <= Date.now()) throw new Error('invalid QR')
        this.patch({ qr, qrState: 'ready' })
        await this.refresh()
      } catch { this.patch({ qr: null, qrState: 'error', error: '暂时无法生成配对二维码，请稍后重试。' }) }
    })().finally(() => { this.pairing = undefined })
    return this.pairing
  }
  dispose = (): void => {
    this.disposed = true; this.generation++; clearInterval(this.timer); this.timer = undefined
    this.listeners.clear(); this.value = initial(); this.updates?.dispose(); this.updates = undefined; this.nativeUpdates?.dispose(); this.nativeUpdates = undefined
  }
}

// Legacy test/embedding callers may still pass the two callbacks. Scope by
// callback identity, never by port, profile label or process-wide singleton.
const stores = new WeakMap<() => Promise<HarnessRemoteHostDescription>, RemotePageStore>()
export function pageStore(describe: () => Promise<HarnessRemoteHostDescription>, call: CallPairingManagement): RemotePageStore {
  let store = stores.get(describe)
  if (!store) { store = new RemotePageStore(describe, call); stores.set(describe, store) }
  return store
}
