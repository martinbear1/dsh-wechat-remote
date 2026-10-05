import type { AgentIdentity } from '../public-relay-agent.js';
export type WorkflowOperation = 'grant' | 'sync' | 'action-result' | 'workspace' | 'receiver-key' | 'lifecycle' | 'objects/claim' | 'objects/ack' | 'cover-assets/prepare' | 'cover-assets/finalize' | 'cover-assets/download';
export interface WorkflowTransport {
    readonly nodeId: string;
    assertIdentity(): void;
    request(operation: WorkflowOperation, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export declare function workflowErrorMessage(code: string): string;
/** Uses the paired node's existing identity, never owner credentials. No
 * redirects, arbitrary endpoints, model-provided URLs or plaintext fallback. */
export declare class WorkflowHttpTransport implements WorkflowTransport {
    private readonly identity;
    private readonly fetcher;
    readonly nodeId: string;
    private readonly origin;
    constructor(origin: string, identity: () => AgentIdentity, fetcher?: typeof fetch);
    assertIdentity(): void;
    request(operation: WorkflowOperation, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
