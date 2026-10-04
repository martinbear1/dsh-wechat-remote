const admitted = new WeakSet();
export function workspaceSourceProof(scope, taskRef) {
    const value = Object.freeze({ scope: Object.freeze({ ...scope }), taskRef: Object.freeze({ ...taskRef }) });
    admitted.add(value);
    return value;
}
export function validWorkspaceSource(value, origin) {
    return !!value && admitted.has(value) && value.scope.sessionId === origin.scope && value.scope.sessionGeneration === origin.generation;
}
