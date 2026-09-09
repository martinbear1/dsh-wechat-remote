export declare const INSTALL_PNPM_VERSION = "11.22.0";
export interface InstallRuntime {
    executable: string;
    cli: string;
    version: string;
}
export declare function resolveInstallRuntime(owner: string, executable?: string, nodeVersion?: string): InstallRuntime;
export declare function verifyInstallRuntime(runtime: InstallRuntime): Promise<void>;
