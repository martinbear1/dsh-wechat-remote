import { type WorkflowDataStore } from '../human-workflow/data.js';
export interface AssistantSessionPrepare {
    presetId: string;
    workspaceId?: string;
    previousAttemptId?: string;
}
export type AssistantSessionStatus = {
    attemptId: string;
} | {
    presetId: string;
    workspaceId?: string;
};
export interface SessionIntentOptions {
    nodeId: string;
    store: WorkflowDataStore;
    assertIdentity(): void;
    installed(presetId: string): boolean | Promise<boolean>;
    /** Native read-only APIs only; no restore, resolveAgent or create. */
    inspect(sessionId: string, signal: AbortSignal): Promise<unknown>;
    workspace(workspaceId: string): {
        path: string;
        sessionIds: readonly string[];
    } | undefined;
    supported(): boolean;
    now?: () => number;
}
/** A durable owner intent is not proof native create ran. Only its original
 * response authorizes one caller to invoke native create; every later caller
 * can inspect, never automatically replay. Explicit new intent needs a CAS on
 * the previous confirmed intent. No session log or native config is written. */
export declare class AssistantSessionIntents {
    private options;
    private state;
    private readonly lifetime;
    private constructor();
    static open(options: SessionIntentOptions): Promise<AssistantSessionIntents>;
    private active;
    private view;
    prepare(request: AssistantSessionPrepare, signal: AbortSignal): Promise<{
        message?: string | undefined;
        dispatch: boolean;
        attemptId: string;
        sessionId: string;
        presetId: string;
        workspaceId: string | null;
        state: "unknown" | "created" | "conflict";
        createdAt: number;
        sessionGeneration?: string;
        schema: "human.assistant.session-intent.v1";
        nodeId: string;
    }>;
    status(request: AssistantSessionStatus, signal: AbortSignal): Promise<{
        message?: string | undefined;
        dispatch: boolean;
        attemptId: string;
        sessionId: string;
        presetId: string;
        workspaceId: string | null;
        state: "unknown" | "created" | "conflict";
        createdAt: number;
        sessionGeneration?: string;
        schema: "human.assistant.session-intent.v1";
        nodeId: string;
    } | {
        schema: "human.assistant.session-intent.v1";
        nodeId: string;
        presetId: string;
        workspaceId: string | null;
        state: "none";
        dispatch: boolean;
    }>;
    close(): Promise<void>;
}
