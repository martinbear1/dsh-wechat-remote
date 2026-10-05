import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { PrivatePublishInput } from './lifecycle.js';
import type { HumanTaskRef, HumanWorkflowDraftRef } from '../human-tools/protocol.js';
type Native = Record<string, any>;
interface Host {
    get(name: string): any;
    on(name: string, listener: (...args: any[]) => any, options?: unknown): () => void;
}
/** Only top-level user text is an instruction source. Attachments neither
 * participate in this digest nor grant instruction authority. */
export declare function privateInputTextDigest(content: unknown): string | undefined;
export declare class PrivateInputNative {
    private readonly host;
    readonly nodeId: string;
    private readonly assertIdentity;
    private readonly now;
    private readonly admissions;
    private readonly dispatches;
    private readonly leases;
    private readonly epochs;
    private readonly offs;
    private stopped;
    constructor(host: Host, nodeId: string, assertIdentity: () => void, now?: () => number);
    supported(): boolean;
    describe(value: unknown, signal: AbortSignal): Promise<unknown>;
    run<T>(payload: Native, supplied: unknown, invoke: () => Promise<T>, rpcId: string): Promise<T>;
    ownerInput(exec: ToolRunContext, taskRef: HumanTaskRef, draftRef: HumanWorkflowDraftRef): Promise<PrivatePublishInput>;
    ownerInputStatus(exec: ToolRunContext): Promise<{
        schema: 'human.private.update.status.v1';
        state: 'ready' | 'unavailable' | 'no-current-input';
        expiresAt?: number;
        reason?: string;
    }>;
    private assertAgent;
    private assertLease;
    private assertExecution;
    private invalidate;
    private prune;
    close(): void;
}
export {};
