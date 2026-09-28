import { type Release, type UpdateAdvice } from './update-policy.js';
type Phase = 'idle' | 'preparing' | 'installing' | 'restart-required' | 'complete' | 'failed' | 'unknown';
export interface NativeUpdateStatus {
    phase: Phase;
    message: string;
    jobId?: string;
    targetVersion?: string;
    previousVersion?: string;
}
interface Bundle {
    name: string;
    version?: string;
    installed: boolean;
    enabled: boolean;
    error?: unknown;
    readOnlyReason?: unknown;
}
interface Manager {
    listBundles(): Promise<Bundle[]>;
    installBundle(spec: string, options: {
        enabled: true;
        requestId: string;
    }): Promise<{
        application: string;
        bundle?: string;
        error?: {
            code?: string;
        };
        pendingBuilds?: string[];
        packageResult?: {
            kind?: string;
        };
    }>;
}
export interface NativeUpdateOptions {
    home: string;
    scope: string;
    runningVersion: string;
    manager(): Manager | undefined;
    sessions(): {
        list(request: object, signal: AbortSignal): Promise<{
            items: {
                running: boolean;
            }[];
        }>;
    } | undefined;
    release(): Promise<{
        advice: UpdateAdvice;
        release?: Release;
        channel: 'stable' | 'preview';
    }>;
    otherBusy?(): boolean;
}
export declare class NativeUpdateService {
    private options;
    private state;
    private plan?;
    private checking?;
    private operation?;
    private disposed;
    private lifetime;
    private readonly directory;
    private readonly journal;
    constructor(options: NativeUpdateOptions);
    isBusy: () => boolean;
    private save;
    private inventory;
    status: () => Promise<NativeUpdateStatus>;
    check: () => Promise<unknown>;
    start: (ticket: string) => NativeUpdateStatus;
    private idle;
    private run;
    dispose(): void;
}
export {};
