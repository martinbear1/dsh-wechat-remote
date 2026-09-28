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
interface Snapshot {
    checking: boolean;
    starting: boolean;
    check: NativeCheck | null;
    status: NativeUpdateStatus | null;
    error: string | null;
}
/** Same-node shared state: one check, one deliberate submission, no blind retry. */
export declare class NativeUpdateStore {
    private call;
    private value;
    private listeners;
    private reading?;
    private timer?;
    private disposed;
    private checkRevision;
    private checkInvalidated;
    constructor(call: CallPairingManagement);
    getSnapshot: () => Snapshot;
    private patch;
    subscribe: (listener: () => void) => () => void;
    private active;
    /** Companion activity changes admission, not this node's install result.
     * Keep real job progress; invalidate its cached check/ticket and read again.
     * Never turn a status transition into an install, approval or blind retry. */
    invalidateCheck: () => void;
    private refreshInvalidatedCheck;
    refresh: () => Promise<void>;
    install: () => Promise<void>;
    private poll;
    dispose(): void;
}
export {};
