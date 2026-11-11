import type { TypertGatewayLike } from './dsh-protocol-compat.js';
/** Host-only DSH addresses. These never become part of the mini-program RPC. */
export type DshSessionAddress = {
    readonly kind: 'session';
    readonly sessionId: string;
} | {
    readonly kind: 'subagent';
    readonly parentSessionId: string;
    readonly childSessionId: string;
    readonly mode: 'one-shot' | 'continuable';
};
/**
 * Use the same native directory and subagent catalog as DSH's own client.
 * A fork may have a parent without being a subagent: origin, not ancestry,
 * selects the route. Modes come only from the native projection-backed catalog.
 * No disk parsing, guessed modes, error-message routing, or cross-request cache.
 * The native follow/page endpoint still validates the supplied durable address.
 */
export declare function resolveDshSessionAddress(gateway: Pick<TypertGatewayLike, 'invoke'>, sessionId: string, signal: AbortSignal): Promise<DshSessionAddress>;
/** A bad/deleted Session must not tear down the node's multiplexed downlink. */
export declare function isSessionReadError(error: unknown): boolean;
