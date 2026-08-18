/**
 * Harness Remote pairing surface, browser half: a QR pairing button with
 * LAN/Tailscale connectivity status, rendered beside Settings at the sidebar
 * foot through the `sidebar.footer.action` slot. The pairing endpoints live
 * on the Harness Remote gate in front of this host (same origin): the button
 * simply fetches /pair/code and /gate/status and shows a modal — no DSH
 * transport involvement.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { PairingButton } from './PairingButton.tsx';
/** Required services for the slot registration. */
export declare const inject: string[];
/**
 * Client plugin body: registers the pairing action into the footer slot.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map