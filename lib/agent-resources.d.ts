import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
type Row = Record<string, any>;
export interface ResourceResult {
    readonly ok: boolean;
    /** Versioned agent.resources.v1 JSON, independent of native Agent types. */
    readonly valueJson?: string;
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
}
export interface ResourceConfig {
    readonly invoke?: (method: string, args: Row, signal: AbortSignal) => Promise<Row>;
    readonly store?: (data: Uint8Array, signal: AbortSignal) => Promise<Row>;
}
/** Neutral wire vocabulary. Native paths and native file APIs terminate here. */
export declare class AgentResourcesService extends TypertRemoteService {
    private readonly host;
    private readonly config;
    private readonly secret;
    private readonly snapshots;
    private active;
    constructor(host: Context, config?: ResourceConfig);
    private native;
    private id;
    private target;
    private entry;
    private guarded;
    capabilities(request: {
        scope: string;
    }, signal: AbortSignal): Promise<ResourceResult>;
    list(request: {
        scope: string;
        directoryId?: string;
        cursor?: number;
    }, signal: AbortSignal): Promise<ResourceResult>;
    resolve(request: {
        scope: string;
        reference: string;
    }, signal: AbortSignal): Promise<ResourceResult>;
    private prune;
    prepare(request: {
        scope: string;
        id: string;
        delivery: 'chunks' | 'object';
    }, signal: AbortSignal): Promise<ResourceResult>;
    chunk(request: {
        scope: string;
        transferId: string;
        offset: number;
    }, signal: AbortSignal): Promise<ResourceResult>;
    release(request: {
        scope: string;
        transferId: string;
    }): Promise<ResourceResult>;
}
/** Optional presentation facet; unknown native events still retain their seq. */
export declare function resourcePresentation(event: Row): Row | undefined;
export {};
