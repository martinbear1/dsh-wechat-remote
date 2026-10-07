/** Open the host's sessionless composer; workspace/preset selection stays native.
 * The native hero slot stages a preset for the NEXT blank session. It is not a
 * default-setting write, a session creation RPC, or a selection on an old chat.
 */
export declare function nativeAssistantNavigation(get: (name: string) => any): {
    reset(): void;
    start(presetId: string, lifetime?: AbortSignal): Promise<void>;
};
