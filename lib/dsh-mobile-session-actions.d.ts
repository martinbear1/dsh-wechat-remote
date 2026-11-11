import type { HostContext } from './dsh-host-context.js';
import type { DshSessionAddress } from './dsh-session-address.js';
type Row = Record<string, any>;
type ResolveAddress = (id: string) => Promise<DshSessionAddress>;
export declare function interruptMobileChild(ctx: HostContext, gateway: Row, request: Row, resolveAddress: ResolveAddress): Promise<any>;
/** Undefined means keep the original ordinary Session prompt. No trial writes. */
export declare function promptMobileChild(ctx: HostContext, gateway: Row, request: Row, resolveAddress: ResolveAddress): Promise<{
    accepted: boolean;
} | undefined>;
export declare function archiveMobileSession(ctx: HostContext, gateway: Row, request: Row): Promise<any>;
export {};
