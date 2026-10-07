/** Public native creation/navigation, with a durable current-node launch journal. */
export declare function nativeAssistantNavigation(get: (name: string) => any, call?: (method: 'assistantSessionPrepare' | 'assistantSessionStatus', request: Record<string, unknown>) => Promise<any>): {
    reset(): void;
    workspaces(): {
        items: {
            id: any;
            name: any;
            path: any;
        }[];
        preferredId: any;
    };
    pickWorkspace(lifetime?: AbortSignal): Promise<string | undefined>;
    start(presetId: string, lifetime?: AbortSignal, newIntent?: boolean, workspaceId?: string): Promise<void>;
};
