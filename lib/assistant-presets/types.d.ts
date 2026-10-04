import type { AssistantDefinition } from './definition.js';
/** Owner-management adapter only. Never register install as an Agent tool:
 * the core must authenticate the owner and verify its exact approved preview. */
export interface NativeAssistantCapability {
    supported: boolean;
    reason?: string;
    basePresets: {
        id: string;
        name: string;
    }[];
    creatorPresetId?: string;
    defaultPresetId?: string;
}
export interface NativeAssistantPreview {
    schema: 'assistant.native.preview.v1';
    presetId: string;
    basePreset: string;
    bundleName: string;
    rowId: string;
    definition: AssistantDefinition;
    /** Exact original native declaration and rendered output are both pinned. */
    baseDigest: string;
    patchDigest: string;
    patch: string;
    /** Binds the artifact to one actual host profile, not a model-supplied path. */
    profileFingerprint: string;
    defaultPreset: string;
    warnings: string[];
}
export interface NativeAssistantInstallation {
    presetId: string;
    state: 'installed' | 'pending-restart' | 'unknown';
    /** Fresh observation only; legacy installation ledgers keep their old shape. */
    nativeState?: 'installed' | 'uninstalled' | 'disabled' | 'stale' | 'unknown';
    message?: string;
}
export interface NativeAssistantAdapter {
    probe(): Promise<NativeAssistantCapability>;
    preview(input: {
        presetId: string;
        definition: AssistantDefinition;
    }, signal: AbortSignal): Promise<NativeAssistantPreview>;
    install(preview: NativeAssistantPreview, signal: AbortSignal): Promise<NativeAssistantInstallation>;
    /** Read-only reconciliation. Unknown outcome is never an automatic retry. */
    verify(preview: NativeAssistantPreview, signal: AbortSignal): Promise<NativeAssistantInstallation>;
    /** Dispose cancels a cancellable native install and joins its settlement. */
    close(): Promise<void>;
}
