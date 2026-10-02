/** Public native creation/navigation, with a durable current-node launch journal. */
export declare function nativeAssistantNavigation(get: (name: string) => any, call?: (method: 'assistantSessionPrepare' | 'assistantSessionStatus', request: Record<string, unknown>) => Promise<any>): {
    reset(): void;
    start(presetId: string, lifetime?: AbortSignal, newIntent?: boolean): Promise<void>;
};
