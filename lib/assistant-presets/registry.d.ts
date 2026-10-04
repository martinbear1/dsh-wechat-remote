import { type WorkflowDataStore } from '../human-workflow/data.js';
import { type AssistantDefinition } from './definition.js';
import type { NativeAssistantAdapter, NativeAssistantPreview, NativeAssistantInstallation } from './types.js';
export interface AssistantRef {
    id: string;
    version: number;
    digest: string;
}
type AssistantNativePlan = NativeAssistantPreview;
type AssistantNativeAdapter = NativeAssistantAdapter;
type AssistantInstallResult = NativeAssistantInstallation;
interface Entry extends AssistantRef {
    definition: AssistantDefinition;
    state: 'draft' | 'installing' | 'installed' | 'unknown';
    createdAt: number;
    plan?: AssistantNativePlan;
    result?: AssistantInstallResult;
}
export declare class AssistantRegistry {
    private state;
    private nodeId;
    private native;
    private assertIdentity;
    private now;
    private tail;
    private readonly settle;
    private stopped;
    private constructor();
    static open(store: WorkflowDataStore, options: {
        nodeId: string;
        native: AssistantNativeAdapter;
        assertIdentity(): void;
        now?: () => number;
    }): Promise<AssistantRegistry>;
    private check;
    private find;
    catalog(signal: AbortSignal): Promise<{
        schema: string;
        nodeId: string;
        native: import("./types.js").NativeAssistantCapability;
        templates: import("./catalog.js").AssistantTemplate[];
        drafts: {
            presetId?: string | undefined;
            templateId?: string | undefined;
            nativeState?: "unknown" | "disabled" | "installed" | "uninstalled" | "stale" | undefined;
            reason?: string | undefined;
            id: string;
            version: number;
            digest: string;
            name: string;
            description: string;
            state: "unknown" | "installed" | "draft" | "installing";
        }[];
    }>;
    draft(request: {
        templateId?: string;
        definition?: unknown;
        id?: string;
        expectedVersion?: number;
    }, signal: AbortSignal): Promise<Entry>;
    get(ref: {
        id: string;
        version: number;
    }): {
        presetId?: string | undefined;
        id: string;
        version: number;
        digest: string;
        definition: AssistantDefinition;
        state: "unknown" | "installed" | "draft" | "installing";
    };
    preview(ref: {
        id: string;
        version: number;
    }, signal: AbortSignal): Promise<{
        id: string;
        version: number;
        digest: string;
        previewId: string;
        expiresAt: number;
        definition: AssistantDefinition;
        native: {
            presetId: string;
            basePreset: string;
            warnings: string[];
        };
    }>;
    /** Owner RPC only: tools can draft, never approve/install. A lost native
     * response is reconciled read-only; it never becomes a second installation. */
    install(request: AssistantRef & {
        previewId: string;
    }, signal: AbortSignal): Promise<{
        presetId: string;
        state: "installed" | "pending-restart" | "unknown";
        nativeState?: "installed" | "uninstalled" | "disabled" | "stale" | "unknown";
        message?: string;
        id: string;
        version: number;
        digest: string;
    }>;
    status(ref: {
        id: string;
        version: number;
    }, signal: AbortSignal): Promise<{
        presetId: string;
        state: "installed" | "pending-restart" | "unknown";
        nativeState?: "installed" | "uninstalled" | "disabled" | "stale" | "unknown";
        message?: string;
        id: string;
        version: number;
        digest: string;
    }>;
    /** A launch must freshly verify its exact approved plan, not trust catalog
     * cache. undefined means unmanaged; false must not fall back to defaults. */
    verifyPreset(presetId: string, signal: AbortSignal): Promise<boolean | undefined>;
    /** Explicit owner reinstallation starts a NEW draft and approval. Never
     * reuse historical consent, artifacts, ID or native installation receipt. */
    redraft(ref: {
        id: string;
        version: number;
    }, signal: AbortSignal): Promise<Entry>;
    private reconcile;
    private validateResult;
    private saveResult;
    installedForPreset(presetId: string): {
        presetId?: string | undefined;
        id: string;
        version: number;
        digest: string;
        definition: AssistantDefinition;
        state: "unknown" | "installed" | "draft" | "installing";
    } | undefined;
    close(): Promise<void>;
}
export {};
