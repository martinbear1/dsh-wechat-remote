/** Local operator management, deliberately outside the phone's /api tunnel.
 * The official Connection owns authentication, body parsing and route disposal. */
import type { HostContext } from './dsh-host-context.js'

export const PAIRING_MANAGEMENT_CHANNEL = '/wechat-remote-management'
type Result = { ok: true; value: unknown } | {
  ok: false; error: { code: string; message: string; details: object }
}
type Handler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<Result>
interface AuthenticatedConnection {
  admit: (...args: never[]) => unknown
  requestRejection: (...args: never[]) => unknown
  rpc: { handle(channel: string, handler: Handler): () => Promise<void> }
}
export interface PairingOperations {
  status(): unknown
  pairCode(): Promise<unknown>
  unavailable(): boolean
}

/** Old Connection implementations only checked browser origin. They must keep
 * the existing local door, never expose a new management channel without auth. */
export function mountPairingManagement(ctx: HostContext, operations: PairingOperations):
  { dispose(): Promise<void> } | undefined {
  const value = ctx.get('connection') as Partial<AuthenticatedConnection> | undefined
  if (typeof value?.admit !== 'function' || typeof value?.requestRejection !== 'function'
      || typeof value?.rpc?.handle !== 'function') return
  let disposed = false
  let pairing: Promise<unknown> | undefined
  const failure = (code: string, message: string): Result => ({ ok: false, error: { code, message, details: {} } })
  const handler: Handler = async (endpoint, payload, signal) => {
    if (disposed || operations.unavailable()) return failure('pairing/unavailable', '连接服务暂不可用，请稍后重试')
    signal.throwIfAborted()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) {
      return failure('pairing/bad-request', '无效的配对请求')
    }
    if (endpoint === 'status') return { ok: true, value: operations.status() }
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
  const unregister = value.rpc.handle(PAIRING_MANAGEMENT_CHANNEL, handler)
  let disposal: Promise<void> | undefined
  return { dispose() {
    disposed = true
    return disposal ??= Promise.resolve().then(unregister)
  } }
}
