import { type ChildProcess } from 'node:child_process';
import { type HostManager } from './install-lifecycle.js';
export interface UpdateJob {
    id: string;
    directory: string;
    profile: string;
    home: string;
    stateFile: string;
    cli: string;
    argv: string[];
    execArgv: string[];
    executable: string;
    cwd: string;
    pnpm: string;
    parentPid: number;
    webPort: number;
    gatePort: number;
    localPort: number;
    targetVersion: string;
    previousVersion: string;
    dshVersion: string;
    statusToken: string;
    controlOrigin?: string;
    manager?: HostManager;
    identityFile?: string;
}
export interface UpdateProgress {
    phase: string;
    progress: number;
    message: string;
    terminal: boolean;
    ok?: boolean;
    rollback?: boolean;
}
export declare function releaseOwnedUpdateLock(lock: string, id: string): void;
export declare function validateJob(job: UpdateJob): void;
export declare function control(job: UpdateJob, operation: string, input?: unknown): Promise<any>;
/** Legacy grants acquire an owner only inside this verified, backed-up upgrade.
 * A later actual identity replacement still invalidates the old grants normally.
 */
export declare function migrateLegacyGrantOwner(job: UpdateJob): void;
export declare function healthy(job: UpdateJob, version: string, timeoutMs?: number): Promise<void>;
export declare function stopRestarted(child: ChildProcess, timeoutMs?: number, forceTimeoutMs?: number): Promise<void>;
interface OwnedNativeLock {
    filename: string;
    dev: number;
    ino: number;
    pid: number;
}
/** DSH atomic-write uses a sibling wx file containing its writer PID. Capture
 * proof BEFORE stopping our candidate, never infer ownership from lock age.
 * Linux may be interrupted between exclusive create and writing the PID: only
 * an open descriptor in this exact child proves ownership of that empty file.
 */
export declare function captureCandidateLock(home: string, child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode'>): OwnedNativeLock | undefined;
export declare function retireCandidateLock(lock: OwnedNativeLock | undefined, child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode'>, directory: string): void;
/** Actual cross-platform transaction; archive must have already passed audit. */
export declare function executeUpdate(job: UpdateJob, progress: (p: UpdateProgress) => void, quiesce: () => Promise<void>): Promise<UpdateProgress>;
export {};
