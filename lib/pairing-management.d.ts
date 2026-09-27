/** Local operator management, deliberately outside the phone's /api tunnel.
 * The official Connection owns authentication, body parsing and route disposal. */
import type { HostContext } from './dsh-host-context.js';
export declare const PAIRING_MANAGEMENT_CHANNEL = "/wechat-remote-management";
export interface PairingOperations {
    status(): unknown;
    pairCode(): Promise<unknown>;
    unavailable(): boolean;
}
/** Old Connection implementations only checked browser origin. They must keep
 * the existing local door, never expose a new management channel without auth. */
export declare function mountPairingManagement(ctx: HostContext, operations: PairingOperations): {
    dispose(): Promise<void>;
} | undefined;
