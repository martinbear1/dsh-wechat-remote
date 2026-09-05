import type { Context } from '@deepseek-ai/cordis';
import type { WebSocket } from 'ws';
type JsonRecord = Record<string, unknown>;
/** A downlink may be a LAN WebSocket or an authenticated E2EE virtual stream. */
export interface LegacyRealtimePeer {
    readonly readyState: number;
    readonly bufferedAmount: number;
    send(message: string): void;
    close(code: number, reason: string): void;
}
/** Convert one new Host event into the released mini-program vocabulary. */
export declare function legacyHostPayload(frame: JsonRecord): JsonRecord | null;
/**
 * One process-local adapter for the two pre-0.1.2 downlinks. It consumes the
 * new reconnect-safe streams but emits only the long-lived client contract.
 */
export declare class DshRealtimeCompatibility {
    private readonly ctx;
    private readonly sockets;
    private readonly knownSessions;
    private readonly pending;
    private remoteOwner?;
    private disposed;
    constructor(ctx: Context);
    attach(path: '/api/events.mux' | '/api/events.host', socket: WebSocket): void;
    connect(path: '/api/events.mux' | '/api/events.host', socket: LegacyRealtimePeer): () => void;
    subscribeSession(sessionId: unknown): void;
    respond(value: unknown): Promise<{
        readonly accepted: boolean;
        readonly reason?: string;
    }>;
    dispose(): void;
    private gateway;
    private run;
    private ensureRemoteEvents;
    private remove;
    private send;
    private followWorkspace;
    private followControl;
    private controlFrame;
    private startSession;
    private followRemoteEvents;
    private pendingWaterfall;
    private cancelPending;
    private dispatchRemoteEventResult;
}
export {};
