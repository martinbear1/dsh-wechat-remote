import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { existsSync } from 'node:fs'
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js'

export type AccountFeature = 'group_assistant' | 'clawbot'
export interface FeatureGrant { allowed: boolean; reason: string; validUntil: number | null; message?: string }
export interface FeatureLease { schemaVersion: 1; nodeId: string; accountInstance: string | null; checkedAt: number; expiresAt: number; features: Record<AccountFeature, FeatureGrant> }
export type FeatureStatus = FeatureLease & { groupEnabled: boolean }
export type FeatureControlResult = { ok: true; value: FeatureStatus } | { ok: false; error: { code: string; message: string } }
const reasons = new Set(['allowed', 'public_access_required', 'public_quota_exhausted', 'feature_not_entitled', 'feature_disabled', 'feature_account_blocked', 'account_suspended', 'node_unbound', 'account_not_found'])
export function featureMessage(reason: string): string {
  return ({ public_access_required: '请先开通或续期公网服务。', public_quota_exhausted: '公网流量已用完，请补充后再使用。',
    feature_not_entitled: '此账号暂未开通此功能。', feature_disabled: '此功能暂未开放。', feature_account_blocked: '此账号暂不能使用此功能。',
    account_suspended: '此账号暂不可用。', node_unbound: '请先用小程序连接此节点。', account_not_found: '请先用小程序连接此节点。',
    group_disabled: '请先开启微信群协作助手。', unavailable: '暂时无法核对使用资格，请联网后刷新。', allowed: '' } as Record<string, string>)[reason] || '暂时无法核对使用资格，请联网后刷新。'
}
export class FeatureAccessError extends Error {
  readonly code = 'feature-access-denied'
  constructor(readonly reason: string) { super(featureMessage(reason)); this.name = 'FeatureAccessError' }
}
export function validateFeatureLease(value: unknown, nodeId: string): FeatureLease {
  const v = value as FeatureLease
  if (!v || v.schemaVersion !== 1 || v.nodeId !== nodeId || !(v.accountInstance === null || typeof v.accountInstance === 'string' && v.accountInstance.length <= 256)
    || !Number.isSafeInteger(v.checkedAt) || !Number.isSafeInteger(v.expiresAt) || v.expiresAt <= v.checkedAt || v.expiresAt > v.checkedAt + 60_000 || !v.features) throw new FeatureAccessError('unavailable')
  for (const key of ['group_assistant', 'clawbot'] as const) {
    const g = v.features[key]
    if (!g || typeof g.allowed !== 'boolean' || !reasons.has(g.reason) || (g.allowed
      ? g.reason !== 'allowed' || !v.accountInstance || !Number.isSafeInteger(g.validUntil) || g.validUntil! < v.expiresAt
      : g.reason === 'allowed' || g.validUntil !== null)) throw new FeatureAccessError('unavailable')
  }
  return structuredClone(v)
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
  constructor(private readonly source: { nodeId(): string; read(signal: AbortSignal): Promise<unknown> },
    private readonly preferenceFile?: string, private readonly monotonic = () => performance.now()) {
    if (preferenceFile && existsSync(preferenceFile)) {
      try { const v = readPrivateJson<any>(preferenceFile); if (v.schemaVersion === 1 && v.enabled === true && typeof v.nodeId === 'string' && typeof v.accountInstance === 'string') this.requested = { nodeId: v.nodeId, accountInstance: v.accountInstance } } catch { /* damaged preference never enables anything */ }
    }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(): void { for (const listener of this.listeners) { try { listener() } catch { /* independent consumers */ } } }
  invalidate(): void {
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
  grant(feature: AccountFeature, requireEnabled: boolean = true): FeatureGrant {
    const grant = this.live()?.features[feature] || { allowed: false, reason: 'unavailable', validUntil: null }
    if (grant.allowed && feature === 'group_assistant' && requireEnabled && !this.groupEnabled()) return { allowed: false, reason: 'group_disabled', validUntil: null, message: featureMessage('group_disabled') }
    return { ...grant, message: featureMessage(grant.reason) }
  }
  async refresh(force: boolean = false): Promise<void> {
    if (this.closed) throw new FeatureAccessError('unavailable')
    if (!force && this.live()) return
    if (!this.flight) {
      const start = this.monotonic(), generation = this.generation, abort = new AbortController()
      this.readAbort = abort
      const flight = Promise.resolve().then(async () => {
        try {
          const nodeId = this.source.nodeId(), raw = await this.source.read(AbortSignal.any([abort.signal, AbortSignal.timeout(8_000)]))
          const lease = validateFeatureLease(raw, nodeId)
          if (this.closed || generation !== this.generation || abort.signal.aborted || this.source.nodeId() !== nodeId) throw new FeatureAccessError('unavailable')
          const until = start + Math.min(60_000, lease.expiresAt - lease.checkedAt)
          if (until <= this.monotonic()) throw new FeatureAccessError('unavailable')
          this.lease = lease; this.until = until
          clearTimeout(this.expiry); this.expiry = setTimeout(() => this.invalidate(), Math.max(1, until - this.monotonic())); this.expiry.unref?.()
          this.renewWhileEnabled()
          this.emit()
        } catch { if (generation === this.generation) this.invalidate(); throw new FeatureAccessError('unavailable') }
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
    if (this.preferenceFile) writePrivateJsonAtomic(this.preferenceFile, { schemaVersion: 1, enabled, ...next })
    this.requested = next; this.renewWhileEnabled(); this.emit()
  }
  snapshot(): FeatureStatus {
    const v = this.live()
    let nodeId = ''; try { nodeId = this.source.nodeId() } catch {}
    return { ...(v || { schemaVersion: 1, nodeId, accountInstance: null, checkedAt: 0, expiresAt: 0,
      features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot') } }),
      features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot') }, groupEnabled: this.groupEnabled() }
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
  async control(request: { action: 'status' | 'group.enabled'; enabled?: boolean }, signal: AbortSignal): Promise<FeatureControlResult> {
    try {
      signal.throwIfAborted()
      if (request?.action === 'status') { try { await this.access.refresh() } catch {} }
      else if (request?.action === 'group.enabled' && typeof request.enabled === 'boolean') await this.access.setGroupEnabled(request.enabled, signal)
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
