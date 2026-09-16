export declare const INSTALL_PNPM_VERSION = "11.22.0";
export interface InstallRuntime {
    executable: string;
    cli: string;
    version: string;
}
/** WebUI updates replace the package that contains pnpm. Keep the tools alive
 * outside that profile for this operation; never relocate the user's profile. */
export declare function pinInstallRuntime(runtime: InstallRuntime, directory: string): Promise<InstallRuntime>;
export declare function resolveInstallRuntime(owner: string, executable?: string, nodeVersion?: string): InstallRuntime;
export declare function verifyInstallRuntime(runtime: InstallRuntime): Promise<void>;
