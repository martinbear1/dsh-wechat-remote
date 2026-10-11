import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import path from 'node:path'
import { agentDshHome, agentProfileScope } from '../agent-metadata.js'
import { nodeStorageDirectory } from '../node-storage.js'
import { PrivateResourceLibrary } from './library.js'
import { ResourceDeliveryClient, type DeliverySource } from './source.js'
import { ResourceController } from './controller.js'
import { ResourceError } from './contract.js'
import type { ResourceRequest, ResourceResult } from './protocol.js'

declare module '@deepseek-ai/cordis' { interface Context {
  wechatResources: WechatResourcesService
  wechatResourceSource: DeliverySource
} }
/** Host-authenticated resource management only; not a model-callable tool. */
export class WechatResourcesService extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  private readonly controller: ResourceController
  private readonly ready: Promise<void>
  private settled = false
  constructor(ctx: Context) {
    super(ctx, 'wechatResources')
    const library = new PrivateResourceLibrary(ctx, path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'private-resources'))
    this.controller = new ResourceController(library, new ResourceDeliveryClient({ current: () => {
      // The gate is a sibling component, not an injected lifetime dependency.
      // Native optional lookup keeps installed presets alive while it restarts.
      const source = ctx.get('wechatResourceSource')
      if (!source) throw new ResourceError('resources-unavailable', '当前节点连接组件未开启。')
      return source.current()
    } }))
    // Async readiness must not hold the Loader that is starting this component.
    this.ready = this.restore(ctx, library).finally(() => { this.settled = true })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      // close cancels in-progress native audits before readiness is joined.
      await Promise.all([this.ready, library.close()])
    }, 'Private resource presets')
  }
  private async restore(ctx: Context, library: PrivateResourceLibrary) {
    const signal = this.lifetime.signal
    let stop: (() => void) | undefined
    try {
      const loader = ctx.get('loader') as { await?: () => Promise<void> } | undefined
      if (loader?.await) await Promise.race([loader.await(), new Promise<void>(resolve => {
        stop = resolve; signal.addEventListener('abort', stop, { once: true })
      })])
      if (!signal.aborted) await library.start()
    } catch { /* An optional local resource failure cannot fail the host. */ }
    finally { if (stop) signal.removeEventListener('abort', stop) }
  }
  @Remote('control')
  async control(request: ResourceRequest, signal: AbortSignal): Promise<ResourceResult> {
    signal = AbortSignal.any([signal, this.lifetime.signal])
    try {
      signal.throwIfAborted()
      if (!this.settled) return { ok: true, value: { supported: true, notice: '本地资源正在准备，请稍后刷新。', items: [] } }
      return { ok: true, value: await this.controller.control(request, signal) }
    } catch (error) {
      signal.throwIfAborted()
      return { ok: false, error: error instanceof ResourceError ? { code: error.code, message: error.message }
        : { code: 'resources-network', message: '资源操作未完成，已安装的资源不受影响。' } }
    }
  }
}
