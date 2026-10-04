import type { HumanTaskRef } from '../human-tools/protocol.js'
import type { WorkflowScope } from './data.js'
/** Ephemeral in-process proof, never persisted, returned to a model or accepted
 * from JSON. Cloud publication still independently checks current authority. */
export interface WorkspaceSourceProof { readonly taskRef: HumanTaskRef; readonly scope: WorkflowScope }
const admitted = new WeakSet<object>()
export function workspaceSourceProof(scope: WorkflowScope, taskRef: HumanTaskRef): WorkspaceSourceProof {
  const value = Object.freeze({ scope: Object.freeze({ ...scope }), taskRef: Object.freeze({ ...taskRef }) })
  admitted.add(value); return value
}
export function validWorkspaceSource(value: WorkspaceSourceProof | undefined, origin: { scope: string; generation: string }): value is WorkspaceSourceProof {
  return !!value && admitted.has(value) && value.scope.sessionId === origin.scope && value.scope.sessionGeneration === origin.generation
}
