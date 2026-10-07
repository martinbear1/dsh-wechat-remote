import type { Context } from '@deepseek-ai/cordis';
import { DshRealtimeCompatibility, type LegacyRealtimePeer } from './dsh-realtime-compat.js';
import type { PrivateInputNative } from './human-workflow/private-input-native.js';
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
    /** Optional observer owned by the authenticated gate; no native host API replacement. */
    taskNotificationRequest?: (args: unknown) => Promise<unknown>;
    /** Owned by the gate; credentials are removed before any native dispatch. */
    privateInput?: PrivateInputNative;
    readonly realtime: DshRealtimeCompatibility;
    constructor(ctx: Context, dshPort?: number | undefined);
    handlesPath(path: string): boolean;
    private flushPermission;
    private nativeRequest;
    request(request: CompatibilityHttpRequest): Promise<CompatibilityHttpResponse>;
    private dispatch;
    connectEvents(path: string, peer: LegacyRealtimePeer): () => void;
    dispose(): void;
}
