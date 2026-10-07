/** Owner UI state. No raw preset files, installation scripts or model calls. */
export type AssistantMethod = 'assistantCatalog' | 'assistantDraft' | 'assistantPreview' | 'assistantInstall' | 'assistantStatus' | 'assistantSessionPrepare' | 'assistantSessionStatus';
export type AssistantCall = (method: AssistantMethod, request: Record<string, unknown>) => Promise<any>;
export interface WorkspaceChoices {
    items: Array<{
        id: string;
        name: string;
        path: string;
    }>;
    preferredId: string;
}
interface AssistantLaunch {
    presetId: string;
    name: string;
    choices: WorkspaceChoices;
    selectedId: string;
}
export interface AssistantUiState {
    catalog: any;
    preview: any;
    busy: boolean;
    message: string;
    error: string;
    launch: AssistantLaunch | null;
}
export declare class AssistantStore {
    private call;
    private openSession?;
    private workspaceNavigation?;
    private state;
    private listeners;
    private epoch;
    private disposed;
    constructor(call: AssistantCall, openSession?: ((presetId: string, signal?: AbortSignal, workspaceId?: string) => Promise<void>) | undefined, workspaceNavigation?: {
        list(): WorkspaceChoices;
        pick(signal?: AbortSignal): Promise<string | undefined>;
    } | undefined);
    getSnapshot: () => AssistantUiState;
    subscribe: (listener: () => void) => () => void;
    private set;
    reset: () => void;
    dispose: () => void;
    private run;
    private read;
    load: () => Promise<void>;
    prepareStart: (presetId: string, signal?: AbortSignal) => Promise<void>;
    dismissStart: () => void;
    selectWorkspace: (id: string) => void;
    pickWorkspace: (signal?: AbortSignal) => Promise<void>;
    confirmStart: (signal?: AbortSignal) => Promise<void>;
    private readyAssistant;
    start: (presetId: string, signal?: AbortSignal, workspaceId?: string) => Promise<void>;
    dismissPreview: () => void;
    choose: (templateId: string) => Promise<void>;
    preview: (id: string, version: number) => Promise<void>;
    reinstall: (sourceId: string, sourceVersion: number) => Promise<void>;
    install: () => Promise<void>;
    verify: (id: string, version: number) => Promise<void>;
}
export {};
