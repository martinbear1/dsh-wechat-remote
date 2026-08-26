/**
 * Harness Remote（微信版）pairing surface, browser half: a QR pairing button
 * with LAN/public-relay connectivity status, rendered beside Settings at the
 * sidebar foot through the `sidebar.footer.action` slot. The pairing endpoints
 * live on the WeChat gate in front of this host (local door 127.0.0.1:3093):
 * the button simply fetches /pair/code and /gate/status and shows a modal —
 * no DSH transport involvement.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services for the slot registration. */
export declare const inject: string[];
/**
 * Client plugin body: registers the pairing action into the footer slot.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
