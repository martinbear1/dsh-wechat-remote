import type { InstallRuntime } from './install-runtime.js';
export declare const PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
export declare const NATIVE_PLUGIN_PACKAGE = "dsh-wechat-remote";
export declare class ProfileOwnershipError extends Error {
    constructor(message: string);
}
/** A native bundle and the CLI payload are different package-manager owners,
 * even though they carry the same runtime. Never repair one by adding the other.
 * Inspect only the selected profile; another host's installation is irrelevant.
 * Unreferenced node_modules leftovers from a failed native add are not owners. */
export declare function assertCliInstallOwner(profile: string, activeRoot?: string): void;
export interface ProfileInstall {
    profile: string;
    directory: string;
    cli: string;
    targetVersion: string;
    runtime: InstallRuntime;
}
export declare function safeProfileName(value: string): boolean;
/** Copy without following links. Backups are restored to the SAME original path. */
export declare function backupProfile(profile: string, backup: string): void;
/** Private, per-operation PATH entry; never edit a global shim or shell profile. */
export declare function installToolPath(directory: string, runtime: InstallRuntime): string;
export declare class NativeInstallError extends Error {
    readonly mayStillBeRunning: boolean;
    constructor(message: string, mayStillBeRunning?: boolean);
}
export declare function runNativePlugin(cli: string, profile: string, home: string, toolPath: string, runtime: InstallRuntime, logFile: string, archiveName: string, timeoutMs?: number, operation?: 'add' | 'install'): Promise<void>;
/** The caller must stop the owning host and complete its backup first. */
export declare function installProfile(job: ProfileInstall): Promise<void>;
