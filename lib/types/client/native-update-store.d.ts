import type { CallPairingManagement } from './pairing-client.js';
import type { NativeUpdateStatus } from '../native-update-service.js';
import type { UpdateAdvice } from '../update-policy.js';
export interface NativeCheck {
    advice: UpdateAdvice;
    channel: 'stable' | 'preview';
    canInstall: boolean;
    reason: string;
    ticket: string;
    status: NativeUpdateStatus;
}
export interface RestartNotice {
    jobId: string;
    installedVersion: string;
    runningVersion?: string;
}
interface Snapshot {
    checking: boolean;
    starting: boolean;
    check: NativeCheck | null;
    status: NativeUpdateStatus | null;
    error: string | null;
}
export declare function nativeUpdateFailed(status: NativeUpdateStatus | null): boolean;
/** Permission belongs to the exact checked snapshot, never stale update advice. */
export declare function nativeUpdateCanStart(status: NativeUpdateStatus | null, check: NativeCheck | null): boolean;
export declare function nativeUpdatePending(status: NativeUpdateStatus | null, check: NativeCheck | null): boolean;
/** Same-node shared state: one check, one deliberate submission, no blind retry. */
export declare class NativeUpdateStore {
    private call;
    private value;
    private listeners;
    private reading?;
    private timer?;
    private disposed;
    private completedCheck?;
    private noticeIntent?;
    private restartNotice?;
    constructor(call: CallPairingManagement);
    getSnapshot: () => Snapshot;
    private patch;
    subscribe: (listener: () => void) => () => void;
    private active;
    takeRestartNotice: () => RestartNotice | undefined;
    private observeRestart;
    refresh: () => Promise<void>;
    private readCheck;
    /** One read-only refresh per confirmed completion, never an installation retry. */
    private refreshCompleted;
    private normalizeStatus;
    private readStatus;
    /** Another tab may own the accepted job. Only observe it; do not obtain a new ticket. */
    private recoverRejectedStart;
    install: () => Promise<void>;
    private poll;
    dispose(): void;
}
export {};
