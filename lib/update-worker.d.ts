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
export declare function stopRestarted(child: ChildProcess, timeoutMs?: number): Promise<void>;
/** Actual cross-platform transaction; archive must have already passed audit. */
export declare function executeUpdate(job: UpdateJob, progress: (p: UpdateProgress) => void, quiesce: () => Promise<void>): Promise<UpdateProgress>;
