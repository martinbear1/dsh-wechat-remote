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
    requestRejection(request: IncomingMessage): unknown;
    admit: unknown;
}
/** Only the small Connection JSON envelope is accepted; never file bodies.
 * This does not implement auth, proxy traffic, choose ports or retry requests. */
export declare function pairingHttpHandler(channel: string, connection: PairingConnection, handler: PairingHandler): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
