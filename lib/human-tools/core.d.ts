import { type HumanAckRequest, type HumanAckWireRequest, type HumanActionRequest, type HumanReceipt, type HumanSurface, type HumanTaskRef, type HumanWorkflowDraftRef, type HumanReminderPreview } from './protocol.js';
import { type HumanInitialRound } from './form.js';
import { type HumanCardAsset } from './card-cover.js';
import { type WorkspaceSourceProof } from '../human-workflow/workspace-source.js';
import { type HumanWorkflowInlinePreview } from '../human-workflow/inline-preview.js';
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
/** Adapter-owned, read-only lookup of an already claimed operation. It must
 * verify the current binding and exact persisted source; never execute it. */
export type HumanReceiptRecovery = (source: {
    surface: HumanSurface;
    origin: HumanOrigin;
    attemptId: string;
}, signal: AbortSignal) => Promise<HumanAckRequest | undefined>;
export declare const HUMAN_MAX_RECORDS = 128;
export declare const HUMAN_RETENTION_MS: number;
export declare const HUMAN_CONTEXT_LIMIT = 8;
export declare class HumanToolsCore {
    private store;
    private randomId;
    private now;
    private coverAuthority?;
    private recovery?;
    private ledger;
    private tail;
    private stopped;
    private recoveryLifetime;
    private recoveryFlights;
    private constructor();
    static open(store: HumanStore, randomId: () => string, now?: () => number, coverAuthority?: (origin: HumanOrigin, asset: HumanCardAsset) => void, recovery?: HumanReceiptRecovery): Promise<HumanToolsCore>;
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
    createCollection(origin: HumanOrigin, title: string, body: string, initialRound: HumanInitialRound, signal: AbortSignal, sourceSurfaceId?: string, cover?: HumanCardAsset, workspaceSource?: WorkspaceSourceProof): Promise<HumanSurface>;
    /** Adapter has freshly read this exact public task/round; no new publication. */
    createReshare(origin: HumanOrigin, taskRef: HumanTaskRef, roundId: string | null, title: string, body: string, signal: AbortSignal): Promise<HumanSurface>;
    private cover;
    /** Internal caller has already obtained a cloud-validated draft scoped to
     * this origin. The Surface stores only its immutable locator, never private
     * evaluation text. Claiming this button is NOT approving/publishing it. */
    createWorkflow(origin: HumanOrigin, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef, signal: AbortSignal, reminderPreview?: HumanReminderPreview, workflowPreview?: HumanWorkflowInlinePreview): Promise<HumanSurface>;
    private source;
    private publishedSource;
    private hasSourceEvidence;
    /** Read an exact existing operation only when its local ACK is missing.
     * Source consumers already holding durable evidence keep their existing
     * offline behavior. Explicit status reads still reconcile missing attempts.
     * Network I/O stays outside the serial writer: a late phone ACK is allowed to
     * complete meanwhile. ack() rechecks and never replaces conflicting history.
     * No task listing, model text, current group or other session is a fallback. */
    private recoverSource;
    /** Owner status may reconcile a missing ACK, but never obtain a new claim,
     * publish a draft, select people or invoke a native action. */
    reconcileStatus(scope: string, surfaceId: string, generation: string, signal: AbortSignal): Promise<unknown>;
    /** Host-only admission of a source into the explicit shared directory. */
    publishedEvidence(scope: {
        nodeId: string;
        sessionId: string;
        sessionGeneration: string;
    }, sourceSurfaceId: string, signal: AbortSignal): Promise<{
        origin: {
            nodeId: string;
            sessionId: string;
            sessionGeneration: string;
        };
        taskRef: HumanTaskRef;
        title: string;
    }>;
    createMembers(origin: HumanOrigin, sourceSurfaceId: string, signal: AbortSignal): Promise<HumanSurface>;
    createReminder(origin: HumanOrigin, sourceSurfaceId: string, title: string, signal: AbortSignal, memberRefs?: readonly string[]): Promise<HumanSurface>;
    private createAction;
    /** Read-only host presentation. Never trust model text or another tool's metadata. */
    forResult(scope: string, callId: string, generation?: string): HumanSurface | undefined;
    /** Latest receipt per surface from authoritative state, not user/model text.
     * Bounded, read-only and generation-scoped: prompt assembly performs no I/O,
     * writes, queue operations or model wakeup. No titles/bodies are included. */
    contextSnapshot(scope: string, generation: string): HumanReceipt[];
    /** Context-only action semantics derived from saved surfaces. Keep the wire
     * receipt and persisted ledger unchanged, including historical approvals. */
    contextActionSnapshot(scope: string, generation: string): (HumanReceipt & {
        actionId: HumanSurface['actions'][0]['id'];
        workflowKind?: HumanWorkflowDraftRef['kind'];
    })[];
    claim(request: HumanActionRequest, signal: AbortSignal): Promise<unknown>;
    ack(request: HumanAckRequest | HumanAckWireRequest, signal: AbortSignal): Promise<HumanReceipt>;
    status(scope: string, surfaceId: string): unknown;
}
export {};
