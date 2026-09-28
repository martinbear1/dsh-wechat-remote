/** Local operator management, deliberately outside the phone's /api tunnel.
 * The official Connection owns authentication; our fiber owns the route. */
import type { Context } from '@deepseek-ai/cordis'
import { pairingHttpHandler, type PairingConnection, type PairingHandler } from './pairing-http.js'

export const PAIRING_MANAGEMENT_CHANNEL = '/wechat-remote-management'
export interface PairingOperations {
  status(): unknown
  pairCode(): Promise<unknown>
  unavailable(): boolean
  companionDecision?(id: string, action: 'approve' | 'later'): void
  updateCheck?(): Promise<unknown>
  updateStart?(ticket: string): unknown
  updateStatus?(): Promise<unknown>
}

/** Old Connection implementations only checked browser origin. They must keep
 * the existing local door, never expose a new management channel without auth. */
export function mountPairingManagement(ctx: Pick<Context, 'get' | 'effect'>, operations: PairingOperations):
  { dispose(): Promise<void> } | undefined {
  const value = ctx.get('connection') as Partial<PairingConnection> | undefined
  const webServer = ctx.get('webServer') as { register(route: { kind: 'prefix'; path: string;
    handler: ReturnType<typeof pairingHttpHandler> }): () => void } | undefined
  if (typeof value?.admit !== 'function' || typeof value?.requestRejection !== 'function'
      || typeof webServer?.register !== 'function') return
  const handler = createPairingHandler(operations)
  // COMPAT: 0.1.7-rc.2 Connection.rpc.handle captures a provider-shadow context
  // without webServer injection. Use the public WebServer registration and
  // native requestRejection instead, never mutate the host or weaken auth.
  // Retire this small wire adapter only after the sibling-provider regression
  // and installed-host tests pass with the official RPC convenience method.
  const unregister = ctx.effect(() => webServer.register({ kind: 'prefix',
    path: PAIRING_MANAGEMENT_CHANNEL,
    handler: pairingHttpHandler(PAIRING_MANAGEMENT_CHANNEL, value as PairingConnection, handler.call),
  }), 'wechat pairing management')
  let disposal: Promise<void> | undefined
  return { dispose() { handler.stop(); return disposal ??= Promise.resolve().then(unregister) } }
}

export function createPairingHandler(operations: PairingOperations) {
  let disposed = false
  let pairing: Promise<unknown> | undefined
  const failure = (code: string, message: string) => ({ ok: false as const, error: { code, message, details: {} } })
  const handler: PairingHandler = async (endpoint, payload, signal) => {
    if (disposed || operations.unavailable()) return failure('pairing/unavailable', '连接服务暂不可用，请稍后重试')
    signal.throwIfAborted()
    if (endpoint === 'update-start') {
      const value = payload as { ticket?: unknown }
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'ticket'
          || typeof value.ticket !== 'string' || !/^[a-f0-9]{48}$/.test(value.ticket) || !operations.updateStart) return failure('update/bad-request', '无效的更新确认')
      try { return { ok: true, value: operations.updateStart(value.ticket) } }
      catch (error) { return failure('update/not-started', error instanceof Error ? error.message : '尚未启动更新，请重新检查') }
    }
    if (endpoint === 'companion-decision') {
      const value = payload as { offerId?: unknown; action?: unknown }
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'action,offerId'
          || typeof value.offerId !== 'string' || !/^[a-f0-9]{32}$/.test(value.offerId)
          || !['approve', 'later'].includes(String(value.action)) || !operations.companionDecision) return failure('pairing/bad-request', '无效的更新选择')
      try {
        operations.companionDecision(value.offerId, value.action as 'approve' | 'later')
        return { ok: true, value: operations.status() }
      } catch { return failure('pairing/stale-offer', '更新通知已变化，请刷新后重新选择') }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) {
      return failure('pairing/bad-request', '无效的配对请求')
    }
    if (endpoint === 'status') return { ok: true, value: operations.status() }
    if (endpoint === 'update-check' && operations.updateCheck) return { ok: true, value: await operations.updateCheck() }
    if (endpoint === 'update-status' && operations.updateStatus) return { ok: true, value: await operations.updateStatus() }
    if (endpoint !== 'pair-code') return failure('pairing/not-found', '不支持此管理操作')
    try {
      // Concurrent page requests share one ticket operation rather than
      // invalidating each other's QR codes. No background refresh or retry.
      if (!pairing) {
        pairing = Promise.resolve().then(() => {
          if (disposed || operations.unavailable()) throw new Error('pairing stopped')
          return operations.pairCode()
        }).finally(() => { pairing = undefined })
      }
      const result = await pairing
      signal.throwIfAborted()
      if (disposed || operations.unavailable()) return failure('pairing/unavailable', '连接服务已停止，请重新打开设置')
      return { ok: true, value: result }
    } catch {
      return failure('pairing/unavailable', '暂时无法生成配对二维码，请稍后重试')
    }
  }
  return { call: handler, stop() { disposed = true } }
}
