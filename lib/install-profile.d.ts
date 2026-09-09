import { type InstallRuntime } from './install-runtime.js';
export declare const PLUGIN_PACKAGE = "@harness-remote/dsh-wechat-remote";
export interface ProfileInstall {
    profile: string;
    directory: string;
    cli: string;
    targetVersion: string;
    runtime: InstallRuntime;
}
export declare function safeProfileName(value: string): boolean;
/** A staged profile must remain valid after its directory is atomically moved. */
export declare function assertRelocatableProfile(root: string): void;
/** Private, per-operation PATH entry; never edit a global shim or shell profile. */
export declare function installToolPath(directory: string, runtime: InstallRuntime): string;
export declare function runNativePlugin(cli: string, profile: string, home: string, toolPath: string, runtime: InstallRuntime, logFile: string): Promise<void>;
export declare function stageProfile(job: ProfileInstall): Promise<string>;
