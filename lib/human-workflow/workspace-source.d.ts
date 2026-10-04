import type { HumanTaskRef } from '../human-tools/protocol.js';
import type { WorkflowScope } from './data.js';
/** Ephemeral in-process proof, never persisted, returned to a model or accepted
 * from JSON. Cloud publication still independently checks current authority. */
export interface WorkspaceSourceProof {
    readonly taskRef: HumanTaskRef;
    readonly scope: WorkflowScope;
}
export declare function workspaceSourceProof(scope: WorkflowScope, taskRef: HumanTaskRef): WorkspaceSourceProof;
export declare function validWorkspaceSource(value: WorkspaceSourceProof | undefined, origin: {
    scope: string;
    generation: string;
}): value is WorkspaceSourceProof;
