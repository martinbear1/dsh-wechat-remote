/**
 * Harness Remote browser surface. The plugin contributes one lazy page to the
 * official Settings section ledger. Pairing uses the owning Host's native
 * authenticated channel, retaining the described local door on older Web hosts.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Required services for the slot registration. */
export declare const inject: string[];
type HarnessRemoteClientContext = Context & {
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
