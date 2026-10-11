import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { existsSync } from 'node:fs'
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js'

export type AccountFeature = 'group_assistant' | 'clawbot' | 'history_import'
export interface FeatureGrant { allowed: boolean; reason: string; validUntil: number | null; message?: string }
export interface FeatureLease { schemaVersion: 1; nodeId: string; accountInstance: string | null; checkedAt: number; expiresAt: number; features: Record<AccountFeature, FeatureGrant> }
export type FeatureStatus = FeatureLease & { groupEnabled: boolean; historyImportEnabled: boolean }
export interface FeatureAuthorization { readonly owner: string; assertCurrent(): void; revalidate?(signal: AbortSignal): Promise<void> }
export type FeatureControlResult = { ok: true; value: FeatureStatus } | { ok: false; error: { code: string; message: string } }
const reasons = new Set(['allowed', 'public_access_required', 'public_quota_exhausted', 'feature_not_entitled', 'feature_disabled', 'feature_account_blocked', 'account_suspended', 'node_unbound', 'account_not_found'])
export function featureMessage(reason: string): string {
  return ({ public_access_required: '请先开通或续期公网服务。', public_quota_exhausted: '公网流量已用完，请补充后再使用。',
    feature_not_entitled: '此账号暂未开通此功能。', feature_disabled: '此功能暂未开放。', feature_account_blocked: '此账号暂不能使用此功能。',
    account_suspended: '此账号暂不可用。', node_unbound: '请先用小程序连接此节点。', account_not_found: '请先用小程序连接此节点。',
    group_disabled: '请先开启微信群协作助手。', history_import_disabled: '请先在设置中开启网页会话导入。',
    unavailable: '暂时无法核对使用资格，请联网后刷新。', allowed: '' } as Record<string, string>)[reason] || '暂时无法核对使用资格，请联网后刷新。'
}
export class FeatureAccessError extends Error {
  readonly code = 'feature-access-denied'
  constructor(readonly reason: string) { super(featureMessage(reason)); this.name = 'FeatureAccessError' }
}
export function validateFeatureLease(value: unknown, nodeId: string): FeatureLease {
  const v = value as FeatureLease
  if (!v || v.schemaVersion !== 1 || v.nodeId !== nodeId || !(v.accountInstance === null || typeof v.accountInstance === 'string' && v.accountInstance.length <= 256)
    || !Number.isSafeInteger(v.checkedAt) || !Number.isSafeInteger(v.expiresAt) || v.expiresAt <= v.checkedAt || v.expiresAt > v.checkedAt + 60_000 || !v.features) throw new FeatureAccessError('unavailable')
  const valid = (g: FeatureGrant | undefined): boolean => !!g && typeof g.allowed === 'boolean' && reasons.has(g.reason) && (g.allowed
    ? g.reason === 'allowed' && !!v.accountInstance && Number.isSafeInteger(g.validUntil) && g.validUntil! >= v.expiresAt
    : g.reason !== 'allowed' && g.validUntil === null)
  for (const key of ['group_assistant', 'clawbot'] as const) if (!valid(v.features[key])) throw new FeatureAccessError('unavailable')
  const result = structuredClone(v)
  // Older cloud releases omit new grants. Reject only the new feature, not
  // existing group/ClawBot authority; malformed new grants also fail closed.
  if (!valid(result.features.history_import)) result.features.history_import = { allowed: false, reason: 'unavailable', validUntil: null }
  return result
}

/** One identity-bound, single-flight lease for both local and phone controls.
 * The server's duration is bounded by monotonic time, not the PC wall clock.
 * This is never populated by a mobile-supplied capability/allowed flag. */
export class FeatureAccess {
  private lease?: FeatureLease
  private until = 0
  private flight?: Promise<void>
  private generation = 0
  private readAbort?: AbortController
  private intent = 0
  private expiry?: NodeJS.Timeout
  private renewal?: NodeJS.Timeout
  private closed = false
  private listeners = new Set<() => void>()
  private requested?: { nodeId: string; accountInstance: string }
  private historyRequested?: { nodeId: string; accountInstance: string }
  private historyIntent = 0
  private historyEpoch = 0
  private historyAuthority = ''
  constructor(private readonly source: { nodeId(): string; read(signal: AbortSignal): Promise<unknown> },
    private readonly preferenceFile?: string, private readonly monotonic = () => performance.now()) {
    if (preferenceFile && existsSync(preferenceFile)) {
      try {
        const v = readPrivateJson<any>(preferenceFile)
        if (v.schemaVersion === 1) {
          if (v.enabled === true && typeof v.nodeId === 'string' && typeof v.accountInstance === 'string') this.requested = { nodeId: v.nodeId, accountInstance: v.accountInstance }
          const h = v.historyImport
          if (h?.enabled === true && typeof h.nodeId === 'string' && typeof h.accountInstance === 'string') this.historyRequested = { nodeId: h.nodeId, accountInstance: h.accountInstance }
        }
      } catch { /* damaged preference never enables anything */ }
    }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(): void { for (const listener of this.listeners) { try { listener() } catch { /* independent consumers */ } } }
  invalidate(): void {
    this.historyEpoch++
    this.clearLease()
  }
  private clearLease(): void {
    const had = Boolean(this.lease)
    this.generation++; this.readAbort?.abort(); this.readAbort = undefined; this.flight = undefined
    this.lease = undefined; this.until = 0; clearTimeout(this.expiry); clearTimeout(this.renewal)
    if (had) this.emit()
  }
  private renewWhileEnabled(): void {
    clearTimeout(this.renewal)
    if (!this.groupEnabled()) return
    const remaining = this.until - this.monotonic()
    // Only an explicitly enabled group feature owns refreshes. A network
    // failure stops renewal; stale authority is never extended or auto-enabled.
    this.renewal = setTimeout(() => { void this.refresh(true).catch(() => {}) }, Math.max(1, remaining * .75))
    this.renewal.unref?.()
  }
  private live(): FeatureLease | undefined {
    let nodeId: string; try { nodeId = this.source.nodeId() } catch { return undefined }
    return !this.closed && this.lease?.nodeId === nodeId && this.monotonic() < this.until ? this.lease : undefined
  }
  groupEnabled(): boolean { const v = this.live(); return Boolean(v?.features.group_assistant.allowed && this.requested?.nodeId === v.nodeId && this.requested?.accountInstance === v.accountInstance) }
  historyImportEnabled(): boolean { const v = this.live(); return Boolean(v?.features.history_import.allowed && this.historyRequested?.nodeId === v.nodeId && this.historyRequested?.accountInstance === v.accountInstance) }
  grant(feature: AccountFeature, requireEnabled: boolean = true): FeatureGrant {
    const grant = this.live()?.features[feature] || { allowed: false, reason: 'unavailable', validUntil: null }
    if (grant.allowed && feature === 'group_assistant' && requireEnabled && !this.groupEnabled()) return { allowed: false, reason: 'group_disabled', validUntil: null, message: featureMessage('group_disabled') }
    if (grant.allowed && feature === 'history_import' && requireEnabled && !this.historyImportEnabled()) return { allowed: false, reason: 'history_import_disabled', validUntil: null, message: featureMessage('history_import_disabled') }
    return { ...grant, message: featureMessage(grant.reason) }
  }
  async refresh(force: boolean = false): Promise<void> {
    if (this.closed) throw new FeatureAccessError('unavailable')
    if (!force && this.live()) return
    // If expiry's callback was delayed by synchronous work, retire that old
    // lease before starting a fresh read; its timer must not abort the new one.
    if (this.lease && this.monotonic() >= this.until) this.clearLease()
    if (!this.flight) {
      const start = this.monotonic(), generation = this.generation, abort = new AbortController(), previous = this.live()
      this.readAbort = abort
      const flight = Promise.resolve().then(async () => {
        try {
          const nodeId = this.source.nodeId(), raw = await this.source.read(AbortSignal.any([abort.signal, AbortSignal.timeout(8_000)]))
          const lease = validateFeatureLease(raw, nodeId)
          if (this.closed || generation !== this.generation || abort.signal.aborted || this.source.nodeId() !== nodeId) throw new FeatureAccessError('unavailable')
          const until = start + Math.min(60_000, lease.expiresAt - lease.checkedAt)
          if (until <= this.monotonic()) throw new FeatureAccessError('unavailable')
          const historyAuthority = JSON.stringify([lease.nodeId, lease.accountInstance, lease.features.history_import.allowed])
          if (this.historyAuthority !== historyAuthority) this.historyEpoch++
          this.historyAuthority = historyAuthority
          this.lease = lease; this.until = until
          clearTimeout(this.expiry); this.expiry = setTimeout(() => this.clearLease(), Math.max(1, until - this.monotonic())); this.expiry.unref?.()
          this.renewWhileEnabled()
          this.emit()
        } catch (error) {
          const status = (error as { statusCode?: number } | undefined)?.statusCode
          // A failed background observation cannot revoke an unexpired lease.
          // Keep its ORIGINAL deadline/intent only. A validated new lease above,
          // explicit auth denial, identity invalidation or expiry remain final;
          // rate limits/proxy/protocol failures are not evidence of revocation.
          const denied = status === 401 || status === 403
          if (generation === this.generation && !(!denied && !abort.signal.aborted && previous && this.live() === previous)) this.invalidate()
          throw new FeatureAccessError('unavailable')
        }
      })
      this.flight = flight
      void flight.finally(() => { if (this.flight === flight) { this.flight = undefined; this.readAbort = undefined } }).catch(() => {})
    }
    await this.flight
  }
  assertCurrent(feature: AccountFeature, requireEnabled: boolean = true): void { const g = this.grant(feature, requireEnabled); if (!g.allowed) throw new FeatureAccessError(g.reason) }
  async assert(feature: AccountFeature, requireEnabled: boolean = true): Promise<void> { await this.refresh(); this.assertCurrent(feature, requireEnabled) }
  async setGroupEnabled(enabled: boolean, signal?: AbortSignal): Promise<void> {
    const intent = ++this.intent
    signal?.throwIfAborted()
    if (enabled) await this.assert('group_assistant', false)
    signal?.throwIfAborted()
    if (intent !== this.intent || this.closed) throw new FeatureAccessError('unavailable')
    if (enabled) this.assertCurrent('group_assistant', false)
    const lease = this.live(), next = enabled ? { nodeId: lease!.nodeId, accountInstance: lease!.accountInstance! } : undefined
    this.savePreferences(next, this.historyRequested)
    this.requested = next; this.renewWhileEnabled(); this.emit()
  }
  private savePreferences(group: typeof this.requested, history: typeof this.historyRequested): void {
    // Keep the original top-level group fields readable by older plugins.
    if (this.preferenceFile) writePrivateJsonAtomic(this.preferenceFile, { schemaVersion: 1, enabled: !!group, ...group,
      historyImport: { enabled: !!history, ...history } })
  }
  async setHistoryImportEnabled(enabled: boolean, signal?: AbortSignal): Promise<void> {
    const intent = ++this.historyIntent
    signal?.throwIfAborted()
    if (enabled) await this.assert('history_import', false)
    signal?.throwIfAborted()
    if (intent !== this.historyIntent || this.closed) throw new FeatureAccessError('unavailable')
    if (enabled) this.assertCurrent('history_import', false)
    const lease = this.live(), next = enabled ? { nodeId: lease!.nodeId, accountInstance: lease!.accountInstance! } : undefined
    this.savePreferences(this.requested, next)
    this.historyRequested = next; this.emit()
    // Import is demand-driven. This opt-in must never own a renewal timer.
  }
  async authorizeHistoryImport(signal?: AbortSignal): Promise<FeatureAuthorization> {
    const intent = this.historyIntent
    signal?.throwIfAborted(); await this.assert('history_import'); signal?.throwIfAborted()
    if (intent !== this.historyIntent) throw new FeatureAccessError('unavailable')
    const lease = this.live()!, epoch = this.historyEpoch
    let generation = this.generation
    const owner = JSON.stringify([lease.nodeId, lease.accountInstance])
    const assertIntent = () => {
      if (this.closed || epoch !== this.historyEpoch || intent !== this.historyIntent) throw new FeatureAccessError('unavailable')
    }
    const assertCurrent = () => {
      assertIntent()
      if (generation !== this.generation
        || owner !== JSON.stringify([this.live()?.nodeId, this.live()?.accountInstance])) throw new FeatureAccessError('unavailable')
      this.assertCurrent('history_import')
    }
    return { owner, assertCurrent, revalidate: async readSignal => {
      // A long import may outlive a lease, never its original owner or opt-in.
      // Natural expiry can refresh on demand; explicit invalidation, observed
      // revocation or off/on changes permanently fence this operation.
      readSignal.throwIfAborted(); assertIntent()
      await this.refresh()
      readSignal.throwIfAborted(); assertIntent()
      generation = this.generation
      assertCurrent()
    } }
  }
  async currentOwner(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    try { await this.refresh() } catch { signal?.throwIfAborted(); return undefined }
    signal?.throwIfAborted()
    const lease = this.live()
    return lease?.accountInstance ? JSON.stringify([lease.nodeId, lease.accountInstance]) : undefined
  }
  snapshot(): FeatureStatus {
    const v = this.live()
    let nodeId = ''; try { nodeId = this.source.nodeId() } catch {}
    return { ...(v || { schemaVersion: 1, nodeId, accountInstance: null, checkedAt: 0, expiresAt: 0,
      features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot'), history_import: this.grant('history_import', false) } }),
      features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot'), history_import: this.grant('history_import', false) },
      groupEnabled: this.groupEnabled(), historyImportEnabled: this.historyImportEnabled() }
  }
  close(): void { this.closed = true; this.invalidate(); this.listeners.clear() }
}

declare module '@deepseek-ai/cordis' { interface Context { wechatFeatures: WechatFeaturesService } }
export class WechatFeaturesService extends TypertRemoteService {
  readonly access: FeatureAccess
  constructor(ctx: Context, config: { source: ConstructorParameters<typeof FeatureAccess>[0]; preferenceFile: string }) {
    super(ctx, 'wechatFeatures'); this.access = new FeatureAccess(config.source, config.preferenceFile)
    ctx.effect(() => () => this.access.close())
  }
  @Remote('control')
  async control(request: { action: 'status' | 'group.enabled' | 'historyImport.enabled'; enabled?: boolean }, signal: AbortSignal): Promise<FeatureControlResult> {
    try {
      signal.throwIfAborted()
      if (request?.action === 'status') { try { await this.access.refresh() } catch {} }
      else if (request?.action === 'group.enabled' && typeof request.enabled === 'boolean') await this.access.setGroupEnabled(request.enabled, signal)
      else if (request?.action === 'historyImport.enabled' && typeof request.enabled === 'boolean') await this.access.setHistoryImportEnabled(request.enabled, signal)
      else throw new FeatureAccessError('unavailable')
      signal.throwIfAborted(); return { ok: true as const, value: this.access.snapshot() }
    } catch (error) { signal.throwIfAborted(); return { ok: false as const, error: { code: 'feature-access-denied', message: error instanceof FeatureAccessError ? error.message : '操作未完成，请刷新后重试。' } } }
  }
}
export function hostFeatureAccess(host: { get(name: any): any }): FeatureAccess {
  const access = host.get('wechatFeatures')?.access
  if (!access || typeof access.assert !== 'function') throw new FeatureAccessError('unavailable')
  return access
}
