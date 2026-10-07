import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import path from 'node:path'
import { agentDshHome, agentProfileScope } from '../agent-metadata.js'
import { nodeStorageDirectory } from '../node-storage.js'
import { FileClawbotStorage } from './storage.js'
import { ClawbotRuntime } from './runtime.js'
import { DshClawbotHost } from './dsh-host.js'
import { ClawbotError, type ClawbotRequest, type ClawbotStatus, type ClawbotSession } from './contracts.js'

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
      this.runtime = new ClawbotRuntime(storage, new DshClawbotHost(ctx))
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
    try { return { ok: true, value: await this.runtime.control(request, signal) } }
    catch (error) {
      signal.throwIfAborted()
      return { ok: false, error: error instanceof ClawbotError ? { code: error.code, message: error.message }
        : { code: 'clawbot-operation-failed', message: '操作未完成，请刷新核对；不要重复提交或重新扫码。' } }
    }
  }
}
