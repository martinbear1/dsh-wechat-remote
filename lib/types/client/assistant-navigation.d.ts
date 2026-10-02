/** Native 0.2 public contracts: remote.session.create, sessions.refresh and
 * uiWorkspace.openSession. No DOM, hidden seat store or default-preset edits. */
export declare function nativeAssistantNavigation(get: (name: string) => any): {
    reset(): void;
    start(presetId: string, lifetime?: AbortSignal): Promise<void>;
};
