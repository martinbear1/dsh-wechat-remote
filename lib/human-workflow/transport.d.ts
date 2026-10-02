import type { AgentIdentity } from '../public-relay-agent.js';
export interface WorkflowTransport {
    readonly nodeId: string;
    assertIdentity(): void;
    request(operation: 'grant' | 'sync', body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
/** Uses the paired node's existing identity, never owner credentials. No
 * redirects, arbitrary endpoints, model-provided URLs or plaintext fallback. */
export declare class WorkflowHttpTransport implements WorkflowTransport {
    private readonly identity;
    private readonly fetcher;
    readonly nodeId: string;
    private readonly origin;
    constructor(origin: string, identity: () => AgentIdentity, fetcher?: typeof fetch);
    assertIdentity(): void;
    request(operation: 'grant' | 'sync', body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
