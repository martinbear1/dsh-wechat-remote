/** The operator-only wire adapter. Authentication remains owned by DSH.
 * Keep outside /api: phone tunnel credentials must never mint pairing tickets. */
import type { IncomingMessage, ServerResponse } from 'node:http';
export type PairingResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: object;
    };
};
export type PairingHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<PairingResult>;
export interface PairingConnection {
    requestRejection?: (request: IncomingMessage) => unknown;
    admit: unknown;
    authentication?: {
        register?: unknown;
    };
}
export interface PairingPeer {
    readonly principal: {
        readonly kind: string;
    };
    readonly signal: AbortSignal;
}
/** Alpha hosts moved authentication into providers. Keep the old authenticated
 * request fence, or use the operator Peer already admitted by WebServer.
 * Never infer trust from loopback, cookies, headers or an authenticated phone. */
export declare function pairingRequestRejection(connection: PairingConnection, request: IncomingMessage, peer?: PairingPeer): 401 | 403 | undefined;
/** Only the small Connection JSON envelope is accepted; never file bodies.
 * This does not implement auth, proxy traffic, choose ports or retry requests. */
export declare function pairingHttpHandler(channel: string, connection: PairingConnection, handler: PairingHandler): (req: IncomingMessage, res: ServerResponse, peer?: PairingPeer) => Promise<void>;
