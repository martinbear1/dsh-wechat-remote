/** Owner UI state. No raw preset files, installation scripts or model calls. */
export type AssistantMethod = 'assistantCatalog' | 'assistantDraft' | 'assistantPreview' | 'assistantInstall' | 'assistantStatus';
export type AssistantCall = (method: AssistantMethod, request: Record<string, unknown>) => Promise<any>;
export interface AssistantUiState {
    catalog: any;
    preview: any;
    busy: boolean;
    message: string;
    error: string;
}
export declare class AssistantStore {
    private call;
    private state;
    private listeners;
    private epoch;
    private disposed;
    constructor(call: AssistantCall);
    getSnapshot: () => AssistantUiState;
    subscribe: (listener: () => void) => () => void;
    private set;
    reset: () => void;
    dispose: () => void;
    private run;
    private read;
    load: () => Promise<void>;
    choose: (templateId: string) => Promise<void>;
    preview: (id: string, version: number) => Promise<void>;
    install: () => Promise<void>;
    verify: (id: string, version: number) => Promise<void>;
}
