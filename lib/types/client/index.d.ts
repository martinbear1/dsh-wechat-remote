/**
 * Harness Remote browser surface. The plugin contributes one lazy page to the
 * official Web Settings section ledger. Pairing remains owned by the
 * WeChat gate's loopback-only door; this client page only presents status and
 * requests a short-lived QR code when the user explicitly asks for one.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Required services for the slot registration. */
export declare const inject: string[];
type HarnessRemoteClientContext = ClientContext & {
    connection: ConnectionHandle;
};
/**
 * Register a feature-owned page inside the official Settings shell.
 * `slots.inject` follows late declaration/redeclaration of the section and
 * ensures the registration is disposed with this Cordis fiber.
 * @param ctx - client root context.
 */
export declare function apply(ctx: HarnessRemoteClientContext): void;
export {};
