/** DSH-owned data root. Explicit DSH_HOME is an isolation boundary. */
export declare function dshDataHome(environment?: NodeJS.ProcessEnv): string;
export declare function isDefaultProfile(scope: string): boolean;
/**
 * Preserve historic filenames for the default profile (zero-migration), while
 * isolating every additional Agent instance below the active DSH_HOME.
 */
export declare function profileDataRoot(scope: string): string;
