import type { HostContext } from './dsh-host-context.js';
/** Structural public contract: old supported hosts do not export Peer yet. */
export interface NativePeer {
    readonly signal: AbortSignal;
    readonly interactions: 'answer' | 'none';
    dispose(): void | Promise<void>;
}
export interface NativePeerLease {
    readonly peer?: NativePeer;
    readonly signal?: AbortSignal;
    dispose(): Promise<void>;
}
/** Host-owned adapter calls only, AFTER existing pairing/ClawBot admission.
 * No principal or Peer is accepted from the transported RPC payload. Owner is
 * the existing paired node-owner authority, not a new remote guest grant.
 * Missing public capability preserves the old host call; native rejection is
 * never retried without a Peer or with a more privileged identity. */
export declare function acquireNativePeer(ctx: HostContext | undefined, interactions: 'answer' | 'none', signal?: AbortSignal, borrowed?: NativePeer): NativePeerLease;
export declare function withNativePeer<T>(ctx: HostContext | undefined, signal: AbortSignal | undefined, run: (lease: NativePeerLease) => Promise<T>, borrowed?: NativePeer): Promise<T>;
/** Keep a stream lease until end/return/error/abort, including return before
 * first next(). An async-generator wrapper alone leaks that last case. */
export declare function withNativePeerStream(ctx: HostContext | undefined, signal: AbortSignal | undefined, open: (lease: NativePeerLease) => Promise<AsyncIterable<unknown>>, borrowed?: NativePeer): Promise<AsyncIterable<unknown>>;
