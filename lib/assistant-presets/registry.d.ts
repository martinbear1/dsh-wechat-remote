import { type WorkflowDataStore } from '../human-workflow/data.js';
import { type AssistantDefinition } from './definition.js';
import type { NativeAssistantAdapter, NativeAssistantPreview, NativeAssistantInstallation } from './types.js';
import { type BuiltinAssistantStatus } from './builtins.js';
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
    private builtinStates;
    private constructor();
    static open(store: WorkflowDataStore, options: {
        nodeId: string;
        native: AssistantNativeAdapter;
        assertIdentity(): void;
        now?: () => number;
    }): Promise<AssistantRegistry>;
    private readBuiltins;
    private check;
    private find;
    catalog(signal: AbortSignal): Promise<{
        schema: string;
        nodeId: string;
        native: import("./types.js").NativeAssistantCapability;
        templates: {
            builtin?: {
                reason?: string | undefined;
                id: string;
                version: number;
                presetId: string;
                name: string;
                state: "unknown" | "installed";
                nativeState: "unknown" | "disabled" | "stale" | "installed";
            } | undefined;
            id: string;
            name: string;
            description: string;
            definition: AssistantDefinition;
        }[];
        drafts: ({
            reason?: string | undefined;
            id: string;
            version: number;
            digest: string;
            presetId: string;
            name: string;
            description: string;
            templateId: "designer" | "teacher" | "project";
            source: "builtin";
            state: "unknown" | "installed";
            nativeState: "unknown" | "disabled" | "stale" | "installed";
        } | {
            presetId?: string | undefined;
            replacement?: {
                presetId: string;
                name: string;
                state: "unknown" | "installed";
                bundleName: string;
                canRemoveAfterReview: boolean;
                warning: string;
            } | undefined;
            templateId?: string | undefined;
            nativeState?: "unknown" | "disabled" | "stale" | "installed" | "uninstalled" | undefined;
            reason?: string | undefined;
            id: string;
            version: number;
            digest: string;
            name: string;
            description: string;
            state: "unknown" | "draft" | "installed" | "installing";
        })[];
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
        state: "unknown" | "draft" | "installed" | "installing";
    } | {
        source: string;
        state: "unknown" | "installed";
        id: string;
        version: number;
        digest: string;
        templateId: import("./builtins.js").BuiltinTemplateId;
        presetId: string;
        name: string;
        definition: AssistantDefinition;
        sourceTemplateDigest: string;
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
    }, signal: AbortSignal): Promise<BuiltinAssistantStatus | {
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
        state: "unknown" | "draft" | "installed" | "installing";
    } | undefined;
    close(): Promise<void>;
}
export {};
