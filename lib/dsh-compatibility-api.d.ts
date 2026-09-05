import type { Context } from '@deepseek-ai/cordis';
import { DshRealtimeCompatibility, type LegacyRealtimePeer } from './dsh-realtime-compat.js';
export interface CompatibilityHttpRequest {
    readonly method: string;
    readonly path: string;
    readonly body: Uint8Array;
    readonly signal: AbortSignal;
}
export interface CompatibilityHttpResponse {
    readonly statusCode: number;
    readonly headers: Record<string, string>;
    readonly body: Uint8Array;
}
/** Available only after the caller has authenticated its LAN or E2EE client. */
export interface DshCompatibilityTransport {
    /** Older Hosts retain native endpoints/events except for legacy prompt commands. */
    handlesPath?(path: string): boolean;
    request(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse>;
    connectEvents(path: string, peer: LegacyRealtimePeer): () => void;
}
/** One in-process protocol boundary shared by both authenticated transports. */
export declare class DshCompatibilityApi implements DshCompatibilityTransport {
    private readonly ctx;
    private readonly dshPort?;
    private readonly maintaining;
    readonly realtime: DshRealtimeCompatibility;
    private inFlight;
    hasInFlightRequests(): boolean;
    constructor(ctx: Context, dshPort?: number | undefined, maintaining?: () => boolean);
    handlesPath(path: string): boolean;
    private flushPermission;
    private nativeRequest;
    request(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse>;
    /** Only the local gate invokes this after authenticating the private worker. */
    verificationProbe(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse>;
    private dispatch;
    connectEvents(path: string, peer: LegacyRealtimePeer): () => void;
    dispose(): void;
}
