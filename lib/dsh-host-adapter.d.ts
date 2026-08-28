import type { Context } from '@deepseek-ai/cordis';
export type DshAdapterMode = 'probing' | 'legacy' | 'modern' | 'unavailable';
export interface LegacyRpcResult {
    readonly ok: boolean;
    readonly value?: any;
    readonly error?: {
        readonly code?: string;
        readonly message?: string;
        readonly details?: object;
    };
}
export interface AdapterFetchRequest {
    readonly path: string;
    readonly method: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: Uint8Array;
    readonly signal?: AbortSignal;
}
/** One process-owned adapter. Capability selection is centralized and sticky. */
export declare class DshHostAdapterRuntime {
    private modeValue;
    private modern;
    private readonly legacy;
    private disposed;
    constructor(ctx: Context, dshPort?: number);
    get mode(): DshAdapterMode;
    get usesModernTransport(): boolean;
    dispose(): void;
    /** Invoke one legacy mini-program RPC through the selected official Host API. */
    call(method: string, payload: Record<string, unknown>, signal?: AbortSignal, rpcId?: string): Promise<LegacyRpcResult>;
    /** Fetch-shaped carrier used by both the LAN door and public E2EE tunnel. */
    fetch(request: AdapterFetchRequest): Promise<Response>;
    /** Legacy events.host/events.mux stream, synthesized on modern DSH. */
    events(path: string, signal: AbortSignal): AsyncIterable<Uint8Array>;
}
