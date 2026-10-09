import { type ClawbotQuestion } from './contracts.js';
type Row = Record<string, any>;
interface Context {
    on(name: any, listener: (...args: any[]) => any, options?: {
        global?: boolean;
        prepend?: boolean;
    }): () => void;
}
/** Native user-questions answerer: claim an owned plain question, or call
 * next() once to delegate. No global Remote Event client, shadow card, prompt,
 * host cancellation, approval decision, or late-answer steering is created. */
export declare class DshQuestionBridge {
    private readonly ctx;
    private readonly owns;
    private readonly onQuestion;
    private readonly fallback;
    private readonly assertAccess?;
    private readonly pending;
    private off?;
    private closed;
    get ready(): boolean;
    constructor(ctx: Context, owns: (agent: Row) => boolean, onQuestion: (question: ClawbotQuestion) => void, fallback: () => void, assertAccess?: (() => void) | undefined);
    start(): boolean;
    close(): void;
    private notice;
    private owned;
    private claim;
}
export {};
