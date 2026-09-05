import type { Context } from '@deepseek-ai/cordis'

import { invokeLegacyRpc, invokeLegacyPermissionRpc, parseLegacyClientRequest, resolveTypertGateway, type TypertGatewayLike } from './dsh-protocol-compat.js'
import { DshRealtimeCompatibility, type LegacyRealtimePeer } from './dsh-realtime-compat.js'

export interface CompatibilityHttpRequest {
  readonly method: string
  readonly path: string
  readonly body: Uint8Array
  readonly signal: AbortSignal
}

export interface CompatibilityHttpResponse {
  readonly statusCode: number
  readonly headers: Record<string, string>
  readonly body: Uint8Array
}

/** Available only after the caller has authenticated its LAN or E2EE client. */
export interface DshCompatibilityTransport {
  /** Older Hosts retain native endpoints/events except for legacy prompt commands. */
  handlesPath?(path: string): boolean
  request(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse>
  connectEvents(path: string, peer: LegacyRealtimePeer): () => void
}

function response(statusCode: number, value: unknown): CompatibilityHttpResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: Buffer.from(JSON.stringify(value)),
  }
}

/** One in-process protocol boundary shared by both authenticated transports. */
export class DshCompatibilityApi implements DshCompatibilityTransport {
  readonly realtime: DshRealtimeCompatibility
  private inFlight = 0
  hasInFlightRequests(): boolean { return this.inFlight > 0 }

  constructor(private readonly ctx: Context, private readonly dshPort?: number, private readonly maintaining = () => false) {
    this.realtime = new DshRealtimeCompatibility(ctx)
  }

  handlesPath(path: string): boolean {
    if (this.maintaining()) return true
    if (resolveTypertGateway(this.ctx)) return true
    const invoker = this.ctx.get('typertGateway') as Partial<TypertGatewayLike> | undefined
    return typeof invoker?.invoke === 'function' && Boolean(this.dshPort)
      && path.split('?')[0] === '/api/session.prompt'
  }

  private async flushPermission(sessionId: string): Promise<void> {
    const sessions = this.ctx.get('sessions') as {
      get?: (id: string) => unknown; flush?: (session: unknown) => Promise<boolean>
    } | undefined
    const session = sessions?.get?.(sessionId)
    if (!session || typeof sessions?.flush !== 'function') {
      throw Object.assign(new Error('无法确认权限已保存；请检查主机会话存储服务'), { code: 'adapter/permission-persistence-unavailable' })
    }
    if (!await sessions.flush(session)) {
      throw Object.assign(new Error('权限缺少持久化存储确认；请检查主机存储配置'), { code: 'adapter/permission-persistence-unavailable' })
    }
  }

  private async nativeRequest(method: string, body: Uint8Array, signal: AbortSignal): Promise<CompatibilityHttpResponse> {
    if (!this.dshPort || !['session.prompt', 'session.history'].includes(method)) throw new Error('Unsupported native compatibility endpoint')
    const res = await fetch(`http://127.0.0.1:${this.dshPort}/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: Buffer.from(body), signal, redirect: 'error',
    })
    return { statusCode: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: new Uint8Array(await res.arrayBuffer()) }
  }

  async request(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse> {
    if (this.maintaining()) return response(503, { error: { code: 'plugin-update-maintenance', message: '插件正在更新，请稍后重连' } })
    this.inFlight++
    try { return await this.dispatch(request) } finally { this.inFlight-- }
  }

  /** Only the local gate invokes this after authenticating the private worker. */
  async verificationProbe(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse> {
    if (request.method !== 'POST' || !['/api/wechatHost/describe', '/api/session.list', '/api/session.history'].includes(request.path)
        || !resolveTypertGateway(this.ctx)) return response(403, { error: 'Invalid verification probe' })
    return this.dispatch(request)
  }

  private async dispatch(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse> {
    const gateway = resolveTypertGateway(this.ctx)
    const invoker = this.ctx.get('typertGateway') as Partial<TypertGatewayLike> | undefined
    if (!gateway && !this.handlesPath(request.path)) return response(503, { error: 'DSH compatibility gateway is unavailable' })
    if (request.method !== 'POST') return response(405, { error: 'DSH RPC requires POST' })
    if (request.body.byteLength > 32 * 1024 * 1024) return response(413, { error: 'DSH request is too large' })
    try {
      request.signal.throwIfAborted()
      const url = new URL(request.path, 'http://dsh.local')
      if (url.origin !== 'http://dsh.local' || !url.pathname.startsWith('/api/')) {
        return response(404, { error: 'Unknown DSH API path' })
      }
      const body = JSON.parse(Buffer.from(request.body).toString('utf8'))
      if (url.pathname === '/api/respond') {
        return response(200, await this.realtime.respond(body))
      }
      const legacy = parseLegacyClientRequest(decodeURIComponent(url.pathname.slice(5)), body)
      if (!gateway) {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)])
        const reply = await invokeLegacyPermissionRpc(invoker as Pick<TypertGatewayLike, 'invoke'>, legacy, signal, async sessionId => {
          const native = await this.nativeRequest('session.history', Buffer.from(JSON.stringify({
            type: 'client-request', rpcId: legacy.rpcId + '-readback', method: 'session.history', payload: { sessionId, maxMessages: 1 },
          })), signal)
          const result = JSON.parse(Buffer.from(native.body).toString()).result
          if (native.statusCode !== 200 || !result?.ok) throw new Error('DSH 权限状态回读失败；请刷新会话核对')
          return result.value
        }, sessionId => this.flushPermission(sessionId))
        // Non-command prompts keep the old Host's own semantics. Never forward
        // an invalid/failed permission command as ordinary model text.
        return reply ? response(200, reply) : this.nativeRequest('session.prompt', request.body, signal)
      }
      this.realtime.subscribeSession(legacy.payload.sessionId)
      const reply = await invokeLegacyRpc(gateway, legacy, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        describeHost: () => ({ cwd: process.cwd() }),
        flushPermission: sessionId => this.flushPermission(sessionId),
      })
      if (legacy.method === 'session.create' && reply.result.ok) {
        const value = reply.result.value as { readonly sessionId?: unknown } | null
        this.realtime.subscribeSession(value?.sessionId)
      }
      return response(200, reply)
    } catch (error) {
      request.signal.throwIfAborted()
      return response(400, { error: error instanceof Error ? error.message : 'Invalid DSH request' })
    }
  }

  connectEvents(path: string, peer: LegacyRealtimePeer): () => void {
    if (this.maintaining()) throw new Error('Plugin update in progress')
    if (path !== '/api/events.mux' && path !== '/api/events.host') {
      throw new Error('Unsupported DSH event stream')
    }
    if (!resolveTypertGateway(this.ctx)) throw new Error('DSH compatibility gateway is unavailable')
    return this.realtime.connect(path, peer)
  }

  dispose(): void {
    this.realtime.dispose()
  }
}
