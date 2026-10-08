import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import path from 'node:path'
import { agentDshHome, agentProfileScope } from '../agent-metadata.js'
import { nodeStorageDirectory } from '../node-storage.js'
import { FileClawbotStorage } from './storage.js'
import { ClawbotRuntime } from './runtime.js'
import { DshClawbotHost } from './dsh-host.js'
import { ClawbotError, type ClawbotRequest, type ClawbotStatus, type ClawbotSession } from './contracts.js'
import { ILinkError } from './ilink-types.js'
import { hostFeatureAccess, FeatureAccessError, featureMessage, type FeatureAccess } from '../feature-access.js'

declare module '@deepseek-ai/cordis' { interface Context { wechatClawbot: WechatClawbotService } }
export type ClawbotControlResult = { ok: true; value: ClawbotStatus | { sessions: ClawbotSession[] } }
  | { ok: false; error: { code: string; message: string } }

/** Exposed only through the owning native authenticated gateway (or the existing
 * authenticated LAN/E2EE control path). Never a model-callable tool. */
export class WechatClawbotService extends TypertRemoteService {
  private runtime?: ClawbotRuntime
  constructor(ctx: Context) {
    super(ctx, 'wechatClawbot')
    let storage: FileClawbotStorage | undefined
    try {
      storage = new FileClawbotStorage(path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'clawbot'))
      const access = () => hostFeatureAccess(ctx)
      this.runtime = new ClawbotRuntime(storage, new DshClawbotHost(ctx, () => access().assertCurrent('clawbot')), undefined, undefined, {
        authorize: () => access().assert('clawbot'), current: () => access().assertCurrent('clawbot'),
        identity: () => {
          const current = access(); current.assertCurrent('clawbot'); const { nodeId, accountInstance } = current.snapshot()
          if (!nodeId || !accountInstance) throw new FeatureAccessError('node_unbound')
          return { nodeId, accountInstance }
        },
      })
      ctx.effect(() => async () => { const runtime = this.runtime; this.runtime = undefined; await runtime?.dispose() }, 'ClawBot channel')
    } catch {
      storage?.close()
      // A broken optional channel cannot break DSH or the other plugin services.
      console.warn('[wechat-clawbot] optional channel unavailable; no host settings changed')
    }
  }
  available(): boolean { return Boolean(this.runtime) }
  @Remote('control')
  async control(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotControlResult> {
    if (!this.runtime) return { ok: false, error: { code: 'clawbot-unavailable', message: 'ClawBot 组件尚未就绪，请核对组件状态或本地记录。' } }
    try {
      let access: FeatureAccess | undefined
      try { access = hostFeatureAccess(this.ctx) } catch { /* safety controls remain available when the authority service is absent */ }
      if (request?.action === 'status') { try { await access?.refresh() } catch {} }
      const value = await this.runtime.control(request, signal)
      const lease = access?.snapshot()
      return { ok: true, value: 'supported' in value ? { ...value, access: {
        ...(lease?.features.clawbot || { allowed: false, reason: 'unavailable', validUntil: null, message: featureMessage('unavailable') }),
        checkedAt: lease?.checkedAt || 0, expiresAt: lease?.expiresAt || 0,
      } } : value }
    }
    catch (error) {
      signal.throwIfAborted()
      // The adapter's typed errors contain fixed safe copy, never provider bodies,
      // URLs or tokens. Preserve actionable pairing/network errors for both UIs.
      return { ok: false, error: error instanceof ClawbotError || error instanceof ILinkError || error instanceof FeatureAccessError ? { code: error.code, message: error.message }
        : { code: 'clawbot-operation-failed', message: '操作未完成，请刷新核对当前状态后再试。' } }
    }
  }
}
