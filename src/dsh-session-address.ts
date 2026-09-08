import type { TypertGatewayLike } from './dsh-protocol-compat.js'

/** Host-only DSH addresses. These never become part of the mini-program RPC. */
export type DshSessionAddress =
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'subagent'; readonly parentSessionId: string; readonly childSessionId: string; readonly mode: 'one-shot' | 'continuable' }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function unavailable(message: string, sessionId: string, reason: string): never {
  throw Object.assign(new Error(message), {
    code: 'adapter/session-address-unavailable', details: { sessionId, reason },
  })
}

/**
 * Use the same native directory and subagent catalog as DSH's own client.
 * A fork may have a parent without being a subagent: origin, not ancestry,
 * selects the route. Modes come only from the native projection-backed catalog.
 * No disk parsing, guessed modes, error-message routing, or cross-request cache.
 * The native follow/page endpoint still validates the supplied durable address.
 */
export async function resolveDshSessionAddress(
  gateway: Pick<TypertGatewayLike, 'invoke'>,
  sessionId: string,
  signal: AbortSignal,
): Promise<DshSessionAddress> {
  signal.throwIfAborted()
  if (!sessionId || sessionId.length > 256) unavailable('会话标识无效', sessionId, 'invalid-id')
  const listing = record(await gateway.invoke({
    namespace: 'session', method: 'list', args: { _request: {} }, signal,
  }))
  signal.throwIfAborted()
  if (!Array.isArray(listing?.items)) unavailable('DSH 会话目录暂不可用', sessionId, 'invalid-directory')
  const rows = listing.items.map(record).filter(row => row?.sessionId === sessionId)
  if (rows.length !== 1) unavailable('会话不存在或暂不可读取，请刷新会话列表', sessionId, 'missing-session')
  const row = rows[0]!
  if (row.origin !== 'subagent') return { kind: 'session', sessionId }
  const parentSessionId = row.parentSessionId
  if (typeof parentSessionId !== 'string' || !parentSessionId || parentSessionId === sessionId) {
    unavailable('子代理会话缺少有效的父会话标识', sessionId, 'invalid-parent')
  }
  const catalog = record(await gateway.invoke({
    namespace: 'subagents', method: 'list', args: { parentSessionId }, signal,
  }))
  signal.throwIfAborted()
  if (!Array.isArray(catalog?.entries)) unavailable('DSH 子代理目录暂不可用', sessionId, 'invalid-catalog')
  const children = catalog.entries.map(record).filter(entry => entry?.id === sessionId)
  if (children.length !== 1) unavailable('子代理会话暂不可读取，请刷新后重试', sessionId, 'missing-child')
  const child = children[0]!
  if (child.kind !== 'child' || (child.mode !== 'one-shot' && child.mode !== 'continuable')) {
    unavailable('DSH 无法识别此子代理会话，请在电脑端检查该会话', sessionId,
      typeof child.reason === 'string' ? child.reason : 'unsupported-child')
  }
  return { kind: 'subagent', parentSessionId, childSessionId: sessionId, mode: child.mode }
}

/** A bad/deleted Session must not tear down the node's multiplexed downlink. */
export function isSessionReadError(error: unknown): boolean {
  const code = record(error)?.code
  return typeof code === 'string' && (code === 'adapter/session-address-unavailable'
    || code.startsWith('session/') || code.startsWith('subagent/')
    || code === 'SESSION_QUERY_PERSISTENCE_FAILED')
}
