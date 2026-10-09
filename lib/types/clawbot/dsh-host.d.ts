import { ClawbotError, type ClawbotAttention, type ClawbotHost, type ClawbotQuestion, type ClawbotSession } from './contracts.js';
export interface DshClawbotContext {
    get(name: string): any;
    on(name: any, listener: (...args: any[]) => any, options?: {
        global?: boolean;
        prepend?: boolean;
    }): () => void;
}
export type DshClawbotSubmission = 'not-submitted' | 'unknown' | 'accepted';
/** A receipt for observing a run, never authority to replay its prompt. */
export declare class DshClawbotHostError extends ClawbotError {
    readonly submission: DshClawbotSubmission;
    constructor(code: string, message: string, submission: DshClawbotSubmission);
}
/**
 * Native contracts inspected in installed DSH 0.2.0-rc.1:
 * dsh-api-session-controller/lib/types/commands.js:290-351,547-560:
 * prompt resumes the ordinary Agent, stores requestId as user source.rpcId,
 * and acknowledges admission (not completion). No source credential is added.
 * dsh-agent-loop/lib/index.js:943,1061,1144,1027: committed turn/start,
 * user/message, assistant/message, turn/end are the correlation boundaries.
 * dsh-session/lib/index.js:1400-1473: seq is the next append offset and
 * session/event observers run synchronously after the event enters the log.
 * This adapter owns no Agent/preset/tool or phone mux. Its scoped plain-question
 * answerer claims only this run, then answers or delegates to the native UI.
 */
export declare class DshClawbotHost implements ClawbotHost {
    private readonly ctx;
    private readonly assertAccess?;
    private readonly running;
    constructor(ctx: DshClawbotContext, assertAccess?: (() => void) | undefined);
    private gateway;
    private archived;
    /** Selectable ordinary sessions, including cold ones; admission decides writability. */
    listSessions(signal: AbortSignal): Promise<ClawbotSession[]>;
    private metadata;
    describeSession(sessionId: string, signal: AbortSignal): Promise<ClawbotSession & {
        generation: number;
    }>;
    private checkPreset;
    run(input: {
        sessionId: string;
        requestId: string;
        text: string;
        expectedGeneration: number;
    }, signal: AbortSignal, onAttention?: (kind: ClawbotAttention) => void, onQuestion?: (question: ClawbotQuestion) => void): Promise<{
        text: string;
    }>;
    private observeAndSubmit;
}
