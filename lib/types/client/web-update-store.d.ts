/** Shared Web updater UI state. The host still owns tickets, locks and installs. */
export interface Advice {
    label: string;
    message: string;
    severity: string;
    code?: string;
    checkedAt?: number;
    expiresAt?: number;
    current: {
        agentVersion: string;
        pluginVersion: string;
    };
    targetVersion?: string;
}
export interface Job {
    jobId: string;
    statusOrigin: string;
    statusToken: string;
}
export interface UpdateCheck {
    advice: Advice;
    channel?: string;
    canInstall: boolean;
    mode?: 'none' | 'automatic' | 'manual' | 'busy';
    reason: string;
    manualCommand?: string;
    ticket: string;
    activeJob?: Job | null;
    lastResult?: Progress | null;
}
export interface Progress {
    phase: string;
    progress: number;
    message: string;
    terminal: boolean;
    ok?: boolean;
}
export interface UpdateSnapshot {
    check: UpdateCheck | null;
    checking: boolean;
    progress: Progress | null;
    error: string;
    copied: boolean;
    resumeFailed: boolean;
}
export declare class WebUpdateStore {
    readonly origin: string;
    private value;
    private listeners;
    private reading?;
    private installing;
    private disposed;
    private job;
    private timer?;
    private pollGeneration;
    private recovering;
    private fetcher;
    constructor(origin: string, fetcher?: typeof fetch);
    getSnapshot: () => UpdateSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private patch;
    refresh: () => Promise<void>;
    private follow;
    private resume;
    install: () => Promise<void>;
    copyCommand: () => Promise<void>;
    dispose: () => void;
}
