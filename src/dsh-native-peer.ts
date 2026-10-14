import type { HostContext } from './dsh-host-context.js'

/** Structural public contract: old supported hosts do not export Peer yet. */
export interface NativePeer {
  readonly signal: AbortSignal
  readonly interactions: 'answer' | 'none'
  dispose(): void | Promise<void>
}
export interface NativePeerLease {
  readonly peer?: NativePeer
  readonly signal?: AbortSignal
  dispose(): Promise<void>
}

/** Host-owned adapter calls only, AFTER existing pairing/ClawBot admission.
 * No principal or Peer is accepted from the transported RPC payload. Owner is
 * the existing paired node-owner authority, not a new remote guest grant.
 * Missing public capability preserves the old host call; native rejection is
 * never retried without a Peer or with a more privileged identity. */
export function acquireNativePeer(ctx: HostContext | undefined, interactions: 'answer' | 'none', signal?: AbortSignal, borrowed?: NativePeer): NativePeerLease {
  signal?.throwIfAborted()
  const connection = ctx?.get?.('connection') as { createPeer?: (options: {
    principal: { kind: 'owner' }; interactions: 'answer' | 'none'
  }) => NativePeer } | undefined
  const peer = borrowed ?? (typeof connection?.createPeer === 'function'
    ? connection.createPeer({ principal: { kind: 'owner' }, interactions }) : undefined)
  if (!peer) {
    if (typeof connection?.createPeer === 'function') throw new Error('DSH Connection returned no Peer')
    return { signal, dispose: async () => {} }
  }
  if (!peer.signal || typeof peer.signal.throwIfAborted !== 'function' || typeof peer.dispose !== 'function') {
    throw new Error('DSH Connection returned an invalid Peer')
  }
  let disposal: Promise<void> | undefined
  const dispose = () => {
    signal?.removeEventListener('abort', abort)
    return disposal ??= borrowed ? Promise.resolve() : Promise.resolve().then(() => peer.dispose()).catch(error => {
      // A cleanup failure must not turn an accepted native mutation into an
      // apparent rejection that a client might replay.
      console.warn('[wechat-gate] native Peer cleanup failed:', error)
    })
  }
  const abort = () => { void dispose() }
  if (!borrowed) signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted || peer.signal.aborted) {
    void dispose()
    signal?.throwIfAborted()
    peer.signal.throwIfAborted()
  }
  return { peer, signal: signal ? AbortSignal.any([signal, peer.signal]) : peer.signal, dispose }
}

export async function withNativePeer<T>(ctx: HostContext | undefined, signal: AbortSignal | undefined,
  run: (lease: NativePeerLease) => Promise<T>, borrowed?: NativePeer): Promise<T> {
  const lease = acquireNativePeer(ctx, 'none', signal, borrowed)
  try { return await run(lease) } finally { await lease.dispose() }
}

/** Keep a stream lease until end/return/error/abort, including return before
 * first next(). An async-generator wrapper alone leaks that last case. */
export async function withNativePeerStream(ctx: HostContext | undefined, signal: AbortSignal | undefined,
  open: (lease: NativePeerLease) => Promise<AsyncIterable<unknown>>, borrowed?: NativePeer): Promise<AsyncIterable<unknown>> {
  const lease = acquireNativePeer(ctx, 'none', signal, borrowed)
  try {
    const source = await open(lease)
    const iterator = source[Symbol.asyncIterator]()
    let closed = false
    const finish = async () => { closed = true; await lease.dispose() }
    const wrapped: AsyncIterableIterator<unknown> = {
      [Symbol.asyncIterator]() { return this },
      async next() {
        if (closed) return { done: true, value: undefined }
        try {
          lease.signal?.throwIfAborted()
          const result = await iterator.next()
          lease.signal?.throwIfAborted()
          if (result.done) await finish()
          return result
        } catch (error) { await finish(); throw error }
      },
      async return(value?: unknown) {
        try { return await iterator.return?.(value) ?? { done: true, value } }
        finally { await finish() }
      },
      async throw(error?: unknown) {
        try {
          if (iterator.throw) return await iterator.throw(error)
          await iterator.return?.()
          throw error
        } finally { await finish() }
      },
    }
    return wrapped
  } catch (error) { await lease.dispose(); throw error }
}
