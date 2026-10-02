import { type HumanAckRequest, type HumanAckWireRequest, type HumanActionRequest, type HumanReceipt, type HumanSurface, type HumanTaskRef, type HumanWorkflowDraftRef } from './protocol.js';
import { type HumanInitialRound } from './form.js';
import { type HumanCardAsset } from './card-cover.js';
/** Business core has no DSH, Cordis, WeChat, network or filesystem dependency. */
export interface HumanOrigin {
    readonly scope: string;
    /** Adapter-owned durable session generation; protects a reused display/id slot. */
    readonly generation: string;
    readonly callId: string;
    readonly rootCallId: string;
}
interface Attempt {
    id: string;
    receipt?: HumanReceipt;
}
export interface HumanRecord {
    surface: HumanSurface;
    origin: HumanOrigin;
    createdAt: number;
    attempts: Attempt[];
}
export interface HumanLedger {
    schemaVersion: 1;
    records: HumanRecord[];
}
export interface HumanStore {
    load(): Promise<unknown>;
    save(ledger: HumanLedger): Promise<void>;
}
export declare const HUMAN_MAX_RECORDS = 128;
export declare const HUMAN_RETENTION_MS: number;
export declare const HUMAN_CONTEXT_LIMIT = 8;
export declare class HumanToolsCore {
    private store;
    private randomId;
    private now;
    private coverAuthority?;
    private ledger;
    private tail;
    private stopped;
    private constructor();
    static open(store: HumanStore, randomId: () => string, now?: () => number, coverAuthority?: (origin: HumanOrigin, asset: HumanCardAsset) => void): Promise<HumanToolsCore>;
    /** Stop admission immediately; callers must await the already-started write
     * before another instance opens this ledger during a plugin reload. */
    close(): Promise<void>;
    private available;
    private serial;
    private commit;
    private record;
    private request;
    /** Adapter check only: generation comes from the actual host, never the RPC.
     * Delayed ACKs may still reconcile their old ledger without waking an Agent. */
    assertGeneration(scope: string, surfaceId: string, generation: string): void;
    /** Re-sign only a persisted claim, including receipt reconciliation. This
     * never claims, executes, retries or replaces an action by itself. */
    grantSource(request: HumanActionRequest): {
        surface: HumanSurface;
        origin: HumanOrigin;
    };
    create(origin: HumanOrigin, title: string, body: string, signal: AbortSignal, sourceSurfaceId?: string, cover?: HumanCardAsset): Promise<HumanSurface>;
    createCollection(origin: HumanOrigin, title: string, body: string, initialRound: HumanInitialRound, signal: AbortSignal, sourceSurfaceId?: string, cover?: HumanCardAsset): Promise<HumanSurface>;
    private cover;
    /** Internal caller has already obtained a cloud-validated draft scoped to
     * this origin. The Surface stores only its immutable locator, never private
     * evaluation text. Claiming this button is NOT approving/publishing it. */
    createWorkflow(origin: HumanOrigin, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef, signal: AbortSignal): Promise<HumanSurface>;
    private source;
    private publishedSource;
    createMembers(origin: HumanOrigin, sourceSurfaceId: string, signal: AbortSignal): Promise<HumanSurface>;
    createReminder(origin: HumanOrigin, sourceSurfaceId: string, title: string, signal: AbortSignal, memberRefs?: readonly string[]): Promise<HumanSurface>;
    private createAction;
    /** Read-only host presentation. Never trust model text or another tool's metadata. */
    forResult(scope: string, callId: string, generation?: string): HumanSurface | undefined;
    /** Latest receipt per surface from authoritative state, not user/model text.
     * Bounded, read-only and generation-scoped: prompt assembly performs no I/O,
     * writes, queue operations or model wakeup. No titles/bodies are included. */
    contextSnapshot(scope: string, generation: string): HumanReceipt[];
    claim(request: HumanActionRequest, signal: AbortSignal): Promise<unknown>;
    ack(request: HumanAckRequest | HumanAckWireRequest, signal: AbortSignal): Promise<HumanReceipt>;
    status(scope: string, surfaceId: string): unknown;
}
export {};
