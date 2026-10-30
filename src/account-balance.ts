/** Display-only projection over the current DSH host's public account service.
 * No credential/Platform-session access, HTTP endpoints, filesystem or model tools. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { hostRuntimeVersion } from './dsh-host-context.js'

export const ACCOUNT_CAPABILITY = 'dsh.account-balance'
export interface AccountReadRequest { readonly locale: string; readonly timezoneOffsetSeconds: number }
export interface AccountWalletView { readonly currency: 'CNY' | 'USD'; readonly balance: string }
export interface AccountReadValue {
  readonly schemaVersion: 1
  readonly status: 'ready' | 'signed-out' | 'unsupported' | 'unavailable'
  readonly profile: { readonly status: 'ready' | 'failed'; readonly name: string; readonly contact: string }
  readonly balance: { readonly status: 'ready' | 'failed'; readonly wallets: readonly AccountWalletView[]; readonly bonusWallets: readonly AccountWalletView[] }
  readonly updatedAt: number | null
}
export type AccountReadResult = { readonly ok: true; readonly value: AccountReadValue }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
interface NativeAccount {
  getState(): Promise<unknown>
  getProfile(client: object): Promise<unknown>
  getBalance(client: object): Promise<unknown>
  watch(signal: AbortSignal, includeIdentityChanges?: boolean): AsyncIterable<unknown>
}
declare module '@deepseek-ai/cordis' {
  interface Context { wechatAccount: WechatAccountService }
  interface Events {
    /** Invalidation only; account identifiers and balances are never broadcast.
     * @mode emit */
    'wechatAccount/changed'(value: { supported: boolean }): void
  }
}
const record = (v: unknown): Record<string, any> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null
const text = (v: unknown, max = 80): string => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max) : ''
export function maskedContact(v: unknown): string {
  const s = text(v)
  if (!s) return ''
  // Keep the platform mask; mask again if a provider unexpectedly sends plaintext.
  if (/[*•…]/u.test(s)) return s
  const at = s.indexOf('@')
  if (at > 0) return s.slice(0, 1) + '***' + s.slice(at)
  return s.length > 4 ? '***' + s.slice(-4) : '***'
}
export function walletViews(v: unknown): AccountWalletView[] | null {
  if (!Array.isArray(v) || v.length > 8) return null
  const result: AccountWalletView[] = [], seen = new Set<string>()
  for (const row of v) {
    const r = record(row)
    if (!r || !['CNY', 'USD'].includes(r.currency) || seen.has(r.currency)
      || typeof r.balance !== 'string' || r.balance.length > 96
      || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(r.balance)) return null
    seen.add(r.currency)
    result.push({ currency: r.currency, balance: r.balance })
  }
  return result
}
function empty(status: AccountReadValue['status']): AccountReadValue {
  return { schemaVersion: 1, status, profile: { status: 'failed', name: '', contact: '' },
    balance: { status: 'failed', wallets: [], bonusWallets: [] }, updatedAt: null }
}
function signedIn(v: unknown): boolean { return record(v)?.status === 'credential-stored' }
function contract(v: unknown): v is NativeAccount {
  return !!record(v) && ['getState', 'getProfile', 'getBalance', 'watch'].every(key => typeof (v as any)[key] === 'function')
}
/** Cancel the caller's wait, not the shared native request (the native API owns its timeout). */
function bounded<T>(promise: Promise<T>, signal: AbortSignal, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const done = (error?: unknown, value?: T) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(value as T)
    }
    const abort = () => done(new Error('cancelled'))
    const timer = setTimeout(() => done(new Error('timeout')), ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    promise.then(value => done(undefined, value), error => done(error))
  })
}

export class WechatAccountService extends TypertRemoteService {
  // Cordis re-scopes Service-valued properties on Remote invocation. Keep the
  // captured host provider inside a plain slot so identity checks remain stable
  // across those proxies (the account service is host-global, not session-local).
  private readonly provider: { current: NativeAccount | null } = { current: null }
  private generation = 0
  private pending?: { native: NativeAccount; promise: Promise<AccountReadValue> }
  private readonly lifetime = new AbortController()
  private watchReady = false
  constructor(ctx: Context) {
    super(ctx, 'wechatAccount')
    ctx.inject(['deepseekAccount'], scope => {
      const provider = scope.get('deepseekAccount') as unknown
      if (!contract(provider)) return
      this.provider.current = provider
      const watcher = new AbortController()
      const signal = AbortSignal.any([watcher.signal, this.lifetime.signal])
      this.changed()
      void (async () => {
        try {
          // Same subscription as DSH's account UI: grant changes invalidate data;
          // identity-only discovery during getProfile must not invalidate its own read.
          for await (const _state of provider.watch(signal)) {
            if (signal.aborted || this.provider.current !== provider) return
            this.watchReady = true
            this.changed()
          }
        } catch { /* Optional service failure must never affect chat or log credentials. */ }
        finally {
          if (!signal.aborted && this.provider.current === provider) { this.watchReady = false; this.changed() }
        }
      })()
      return () => {
        watcher.abort()
        if (this.provider.current === provider) { this.provider.current = null; this.watchReady = false; this.changed() }
      }
    })
    ctx.effect(() => () => { this.lifetime.abort(); this.provider.current = null; this.pending = undefined })
  }
  available(): boolean { return this.provider.current !== null && !this.lifetime.signal.aborted }
  private changed(): void {
    this.generation++
    if (!this.lifetime.signal.aborted) this.ctx.emit('wechatAccount/changed', { supported: this.available() })
  }
  @Remote('read')
  async read(request: AccountReadRequest, signal: AbortSignal): Promise<AccountReadResult> {
    if (!request || typeof request.locale !== 'string' || !/^[a-zA-Z-]{2,24}$/.test(request.locale)
      || !Number.isInteger(request.timezoneOffsetSeconds) || Math.abs(request.timezoneOffsetSeconds) > 50400) {
      return { ok: false, error: { code: 'invalid_request', message: '账号查询参数无效' } }
    }
    const native = this.provider.current
    if (!native || !this.available()) return { ok: true, value: empty('unsupported') }
    if (!this.watchReady) return { ok: true, value: empty('unavailable') }
    try {
      const combined = AbortSignal.any([signal, this.lifetime.signal])
      combined.throwIfAborted()
      if (!this.pending || this.pending.native !== native) {
        // All callers share one native read. A timed-out caller cannot fan out more requests.
        let version = 'unknown'
        try { version = hostRuntimeVersion(this.ctx) || version } catch { /* no other profile fallback */ }
        const client = { locale: request.locale, timezoneOffsetSeconds: request.timezoneOffsetSeconds, version }
        const entry = { native, promise: this.query(native, client) }
        this.pending = entry
        void entry.promise.finally(() => { if (this.pending === entry) this.pending = undefined }).catch(() => {})
      }
      return { ok: true, value: await bounded(this.pending.promise, combined, 35000) }
    } catch {
      return { ok: false, error: { code: 'account_unavailable', message: '暂时无法读取，请稍后重试' } }
    }
  }
  private async query(native: NativeAccount, client: object): Promise<AccountReadValue> {
    // Retry once after a native grant change; never mix two accounts' concurrent results.
    for (let attempt = 0; attempt < 2; attempt++) {
      const generation = this.generation
      if (this.provider.current !== native || !this.watchReady || this.lifetime.signal.aborted) return empty('unavailable')
      const state = await native.getState()
      if (!signedIn(state)) return empty(record(state)?.status === 'signed-out' ? 'signed-out' : 'unavailable')
      const [profile, balance] = await Promise.all([
        native.getProfile(client).catch(() => undefined), native.getBalance(client).catch(() => undefined),
      ])
      const after = await native.getState()
      if (this.provider.current !== native || !this.watchReady || this.lifetime.signal.aborted) return empty('unavailable')
      if (!signedIn(after)) return empty(record(after)?.status === 'signed-out' ? 'signed-out' : 'unavailable')
      if (generation !== this.generation) continue
      // Native null means signed out or grant changed, NOT zero/empty account data.
      if (profile === null || balance === null) return empty('unavailable')
      const p = record(profile), b = record(balance)
      const wallets = b?.status === 'ready' ? walletViews(b.value) : null
      const bonus = b?.status === 'ready' ? walletViews(b.bonusWallets ?? []) : null
      const value = empty('ready')
      return { ...value, updatedAt: Date.now(),
        profile: p?.status === 'ready' && record(p.value)
          ? { status: 'ready', name: text(p.value.name), contact: maskedContact(p.value.contact) } : value.profile,
        balance: wallets && bonus ? { status: 'ready', wallets, bonusWallets: bonus } : value.balance }
    }
    return empty('unavailable')
  }
}
export default WechatAccountService
