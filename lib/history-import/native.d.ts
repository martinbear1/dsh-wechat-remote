import type { HistoryConversation } from './source.js';
type Native = Record<string, any>;
export interface ImportHost {
    get(name: string): any;
}
export interface NativeImportRequest {
    sessionId: string;
    workspaceId: string;
    sourceHash: string;
    branchId?: string;
    presetId?: string;
    title?: string;
    conversation: HistoryConversation;
}
export type NativeImportIdentity = Pick<NativeImportRequest, 'sessionId' | 'workspaceId' | 'sourceHash' | 'branchId'>;
export interface NativeImportInspection {
    state: 'succeeded' | 'uncertain' | 'not-found';
    sessionId: string;
    workspaceId: string;
    title?: string;
    messageCount?: number;
    message?: string;
}
export declare class NativeImportError extends Error {
    readonly code: string;
    constructor(code: string);
}
/** Only thrown before the native factory has been called. Later failures must
 * remain uncertain: the caller must never retry a possibly persisted import. */
export declare class NativeImportPreflightError extends NativeImportError {
    readonly rejectedBeforeCreate = true;
}
export declare function nativeCapabilities(ctx: ImportHost): Promise<{
    supported: boolean;
    reason?: string;
}>;
/** Canonical, plugin-independent visible messages plus ignorable archival facts.
 * No original web system prompt is assumed or elevated into host authority. */
export declare function buildNativeImportSeed(request: NativeImportRequest, now?: number): Native[];
export declare function inspectNativeImport(ctx: ImportHost, request: NativeImportIdentity, signal?: AbortSignal): Promise<NativeImportInspection>;
export declare function commitNativeImport(ctx: ImportHost, request: NativeImportRequest, signal?: AbortSignal, beforeCreate?: () => void): Promise<{
    sessionId: string;
    workspaceId: string;
    title: string;
    messageCount: number;
}>;
export {};
