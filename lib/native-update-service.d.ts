import { type Release, type UpdateAdvice } from './update-policy.js';
declare const bundleName = "dsh-wechat-remote";
declare const coreName = "@harness-remote/dsh-wechat-remote";
type Owner = typeof bundleName | typeof coreName;
type Phase = 'idle' | 'preparing' | 'installing' | 'restart-required' | 'complete' | 'failed' | 'unknown';
interface NativeReceipt {
    application: string;
    changed?: boolean;
    errorCode?: string;
    bundle?: string;
    needsApproval?: boolean;
    packageKind?: string;
}
export interface NativeUpdateStatus {
    phase: Phase;
    message: string;
    jobId?: string;
    targetVersion?: string;
    previousVersion?: string;
    bundle?: Owner;
    nativeResult?: NativeReceipt;
}
interface Bundle {
    name: string;
    version?: string;
    installed: boolean;
    enabled: boolean;
    error?: unknown;
    readOnlyReason?: unknown;
}
interface NativeOutcome {
    application: string;
    changed?: boolean;
    bundle?: string;
    error?: {
        code?: string;
    };
    pendingBuilds?: string[];
    packageResult?: {
        kind?: string;
    };
}
interface Manager {
    listBundles(): Promise<Bundle[]>;
    installBundle(spec: string, options: {
        enabled: true;
        requestId: string;
    }): Promise<NativeOutcome>;
    waitForInstall?(requestId: string): Promise<NativeOutcome | null>;
}
/** Capability discovery is read-only and does not query packages or tasks. */
export declare function supportsNativeUpdates(manager: unknown, scope: string): manager is Manager;
export interface NativeUpdateOptions {
    home: string;
    scope: string;
    runningVersion: string;
    manager(): Manager | undefined;
    prepareTools?(manager: Manager): Promise<Manager>;
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
}
export declare class NativeUpdateService {
    private options;
    private state;
    private plan?;
    private checking?;
    private operation?;
    private disposed;
    private lifetime;
    private observation?;
    private refusedUpdate?;
    private readonly directory;
    private readonly journal;
    constructor(options: NativeUpdateOptions);
    isBusy: () => boolean;
    private readJournal;
    private save;
    private settle;
    private observe;
    private inventory;
    private updateTarget;
    private isRefused;
    status: () => Promise<NativeUpdateStatus>;
    check: () => Promise<unknown>;
    start: (ticket: string) => NativeUpdateStatus;
    private idle;
    private restartMessage;
    private installSpec;
    private run;
    dispose(): void;
}
export {};
