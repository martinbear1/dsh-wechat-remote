/** A transport, never a preset or a model tool. Public DTOs contain no credentials. */
export interface ClawbotSession {
    id: string;
    title: string;
    generation?: number;
    workspaceId?: string;
    workspaceTitle?: string;
}
export type ClawbotAttention = 'approval' | 'question';
export interface ClawbotAttachment {
    kind: 'image' | 'file' | 'voice' | 'video';
    name: string;
    data: Uint8Array;
}
/** In-memory native deliverables only; no host paths are retained by the channel. */
export interface ClawbotResult {
    text: string;
    attachments?: ClawbotAttachment[];
    /** Channel delivery notices are separate from the native assistant's text. */
    notices?: string[];
}
export interface ClawbotInput {
    sessionId: string;
    expectedGeneration: number;
    requestId: string;
    text: string;
    attachments?: ClawbotAttachment[];
    /** Channel-only pre-admission fence; never serialized into the native prompt. */
    checkAdmission?: () => void;
}
export interface ClawbotHost {
    listSessions(signal: AbortSignal): Promise<ClawbotSession[]>;
    describeSession(sessionId: string, signal: AbortSignal): Promise<ClawbotSession & {
        generation: number;
    }>;
    run(input: ClawbotInput, signal: AbortSignal, onAttention?: (kind: ClawbotAttention) => void): Promise<ClawbotResult>;
}
export interface ClawbotStatus {
    supported: true;
    revision: number;
    enabled: boolean;
    state: 'disabled' | 'unpaired' | 'ready' | 'connecting' | 'error';
    paired: boolean;
    /** Local credential health, not a claim about other nodes' bindings. */
    bindingState?: 'unpaired' | 'paired' | 'expired';
    target: ClawbotSession | null;
    message: string;
    pending: number;
    uncertain: number;
    access?: {
        allowed: boolean;
        reason: string;
        validUntil: number | null;
        message?: string;
        checkedAt: number;
        expiresAt: number;
    };
    pairing?: {
        id: string;
        url: string;
        qrDataUrl: string;
        status: string;
        expiresAt?: number;
    };
}
export interface ClawbotRequest {
    action: 'status' | 'sessions' | 'route' | 'enabled' | 'login.start' | 'login.poll' | 'login.cancel' | 'disconnect';
    expectedRevision?: number;
    sessionId?: string;
    enabled?: boolean;
    loginId?: string;
    verifyCode?: string;
    /** Explicit owner confirmation to seal unfinished channel deliveries on disconnect. */
    abandonPending?: boolean;
}
export declare class ClawbotError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
