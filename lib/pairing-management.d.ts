/** Local operator management, deliberately outside the phone's /api tunnel.
 * The official Connection owns authentication; our fiber owns the route. */
import type { Context } from '@deepseek-ai/cordis';
import { type PairingHandler } from './pairing-http.js';
export declare const PAIRING_MANAGEMENT_CHANNEL = "/wechat-remote-management";
/** Follow the native service lifetime on both host generations. Alpha split
 * authentication into a separate Cordis service; declaring it only on that
 * branch keeps older hosts working without an unavailable dependency. */
export declare function observePairingManagement(ctx: Pick<Context, 'inject'>, listener: (ctx: Context) => void | (() => void | Promise<void>)): import("@deepseek-ai/cordis").Fiber & PromiseLike<import("@deepseek-ai/cordis").Fiber>;
export interface PairingOperations {
    status(): unknown;
    pairCode(): Promise<unknown>;
    unavailable(): boolean;
    updateCheck?(): Promise<unknown>;
    updateStart?(ticket: string): unknown;
    updateStatus?(): Promise<unknown>;
    connectionDiagnostics?(signal: AbortSignal): Promise<unknown>;
}
/** Old Connection implementations only checked browser origin. They must keep
 * the existing local door, never expose a new management channel without auth. */
export declare function mountPairingManagement(ctx: Pick<Context, 'get' | 'effect'>, operations: PairingOperations): {
    dispose(): Promise<void>;
} | undefined;
export declare function createPairingHandler(operations: PairingOperations): {
    call: PairingHandler;
    stop(): void;
};
