import type { HostManager } from './install-lifecycle.js';
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
/** Used only by the stopped-host native CLI installer. */
export declare function releaseOwnedUpdateLock(lock: string, id: string): void;
/** Read-only audit helpers retained for durable-data regression checks. */
export declare function durableSnapshot(job: UpdateJob): Record<string, string>;
export declare function assertPreserved(before: Record<string, string>, after: Record<string, string>): void;
/** Deny even a well-formed historical job before inspecting its paths, calling
 * quiesce, emitting progress, acquiring a lock or changing files/processes. */
export declare function executeUpdate(_job: UpdateJob, _progress: (p: UpdateProgress) => void, _quiesce: () => Promise<void>): Promise<never>;
