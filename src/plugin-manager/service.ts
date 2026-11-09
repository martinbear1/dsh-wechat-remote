import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { NativePluginManager, pluginError, PluginAdapterError } from './native.js'
import type { PluginRequest, PluginResult, PluginStatus } from './protocol.js'
declare module '@deepseek-ai/cordis' { interface Context { wechatPlugins: WechatPluginsService } }
/** Mounted on the existing authenticated owner transport; no additional endpoint or credentials. */
export class WechatPluginsService extends TypertRemoteService {
  private readonly adapter: NativePluginManager
  private readonly lifetime = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'wechatPlugins')
    this.adapter = new NativePluginManager(ctx)
    ctx.effect(() => () => { this.lifetime.abort() })
  }
  status(): PluginStatus { return this.adapter.status() }
  @Remote('control')
  async control(request: PluginRequest, signal: AbortSignal): Promise<PluginResult> {
    try {
      if (!request || typeof request.action !== 'string' || request.action.length > 32 || request.inputJson !== undefined && (typeof request.inputJson !== 'string' || Buffer.byteLength(request.inputJson) > 256 * 1024)) throw new PluginAdapterError('invalid_request', '插件管理请求过大或格式无效。')
      let value: unknown
      try { value = JSON.parse(request.inputJson || '{}') } catch { throw new PluginAdapterError('invalid_request', '插件管理请求格式无效。') }
      const result = await this.adapter.control(request.action, value, AbortSignal.any([signal, this.lifetime.signal]))
      const valueJson = JSON.stringify(result)
      if (Buffer.byteLength(valueJson) > 1024 * 1024) throw new PluginAdapterError('response_too_large', '插件信息过大，请在电脑端查看。')
      return { ok: true, valueJson }
    } catch (error) { return { ok: false, error: pluginError(error) } }
  }
}
