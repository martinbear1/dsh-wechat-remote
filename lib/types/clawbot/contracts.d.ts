/** A transport, never a preset or a model tool. Public DTOs contain no credentials. */
export interface ClawbotSession {
    id: string;
    title: string;
    generation?: number;
    workspaceId?: string;
    workspaceTitle?: string;
}
export type ClawbotAttention = 'approval' | 'question';
export interface ClawbotQuestionItem {
    id: string;
    question: string;
    header?: string;
    detail?: string;
    options?: {
        label: string;
        description?: string;
    }[];
    multiSelect?: boolean;
}
export interface ClawbotQuestionAnswer {
    answers: {
        id: string;
        selected: string[];
        custom?: string;
    }[];
}
/** Ephemeral native human-question capability, never persisted or replayed. */
export interface ClawbotQuestion {
    id: string;
    questions: ClawbotQuestionItem[];
    signal: AbortSignal;
    answer(value: ClawbotQuestionAnswer): Promise<void>;
    /** Delegate this still-pending question to the host's next native answerer. */
    handoff(): void;
}
export interface ClawbotHost {
    listSessions(signal: AbortSignal): Promise<ClawbotSession[]>;
    describeSession(sessionId: string, signal: AbortSignal): Promise<ClawbotSession & {
        generation: number;
    }>;
    run(input: {
        sessionId: string;
        expectedGeneration: number;
        requestId: string;
        text: string;
    }, signal: AbortSignal, onAttention?: (kind: ClawbotAttention) => void, onQuestion?: (question: ClawbotQuestion) => void): Promise<{
        text: string;
    }>;
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
