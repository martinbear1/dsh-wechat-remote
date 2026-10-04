import { type WorkflowScope } from './data.js';
import type { WorkflowTransport } from './transport.js';
export interface WorkspaceRef {
    schema: 'human.workspace.ref.v1';
    ref: string;
}
export interface WorkspaceContext {
    workspaceRef: WorkspaceRef;
    bindingKey: string;
    scope: WorkflowScope;
}
export interface WorkspaceHost {
    header(sessionId: string, signal: AbortSignal): Promise<unknown>;
    workspaces(): readonly {
        id: string;
        path: string;
        sessionIds: readonly string[];
    }[];
    archived(): readonly string[];
}
export declare function workspaceRef(value: unknown): WorkspaceRef | undefined;
export declare class WorkspaceAuthority {
    private readonly transport;
    private readonly host;
    private readonly secret;
    constructor(transport: WorkflowTransport, host: WorkspaceHost, secret: string);
    private physical;
    private physicalUnchecked;
    resolve(scope: WorkflowScope, signal: AbortSignal): Promise<WorkspaceContext>;
    register(context: WorkspaceContext, scope: WorkflowScope, signal: AbortSignal): Promise<void>;
}
