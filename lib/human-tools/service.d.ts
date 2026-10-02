import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type HumanStore } from './core.js';
import { type HumanAckWireRequest, type HumanActionRequest, type HumanSurface } from './protocol.js';
export interface HumanToolsConfig {
    readonly enabled?: boolean;
    readonly store?: HumanStore;
}
export interface HumanResult {
    readonly ok: boolean;
    readonly valueJson?: string;
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
}
/** Private owner RPC only. Never mount this namespace on a published/guest route. */
export declare class HumanToolsService extends TypertRemoteService {
    private readonly host;
    static inject: string[];
    private core?;
    private ready?;
    private readonly lifetime;
    private unregister?;
    constructor(host: Context, config?: HumanToolsConfig);
    private initialize;
    private use;
    private result;
    /** Synchronous bounded lookup used identically by history and live projection. */
    present(scope: string, callId: string): HumanSurface | undefined;
    /** Host-only cold-history barrier. Shares the one ledger load; cancelling a
     * reader never cancels initialization or another reader. Optional failure
     * must not hide the ordinary history, and adds no retry or polling. */
    prepareProjection(signal: AbortSignal): Promise<boolean>;
    capabilities(request: {
        scope: string;
    }, signal: AbortSignal): Promise<HumanResult>;
    claim(request: HumanActionRequest, signal: AbortSignal): Promise<HumanResult>;
    /** A missing live Session is not evidence that its durable generation still
     * exists. Query headers only; never acquire a Session/Agent writer to claim. */
    private claimGeneration;
    ack(request: HumanAckWireRequest, signal: AbortSignal): Promise<HumanResult>;
    status(request: {
        scope: string;
        surfaceId: string;
    }, signal: AbortSignal): Promise<HumanResult>;
}
