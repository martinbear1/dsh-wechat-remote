/** Shared host/cloud policy evaluator. Never shipped to the mini-program.
 * Compatibility is positive evidence (explicit versions), not guessed semver
 * intervals: prereleases between two tested RCs are NOT implicitly supported.
 */
export declare const UPDATE_SCHEMA = 1;
export declare const RELEASE_REPOSITORY = "https://github.com/martinbear1/dsh-wechat-remote";
export type Severity = 'none' | 'info' | 'recommended' | 'required' | 'unknown';
export interface RuntimeVersion {
    agentKind: string;
    agentVersion: string;
    pluginVersion: string;
    platform: string;
    arch?: string;
}
export interface Release {
    version: string;
    channel: 'stable' | 'preview';
    dsh: string[];
    platforms: string[];
    architectures: string[];
    asset?: {
        url: string;
        sha256: string;
        bytes: number;
    };
}
export interface UpdateCatalog {
    schemaVersion: 1;
    revision: string;
    issuedAt: number;
    expiresAt: number;
    releases: Release[];
    blocked: {
        pluginVersion: string;
        dsh?: string[];
        platforms?: string[];
        reason: string;
    }[];
    retiredDsh: string[];
    manualUpgradePlugins?: string[];
}
export interface UpdateAdvice {
    schemaVersion: 1;
    revision: string;
    checkedAt: number;
    expiresAt: number;
    severity: Severity;
    component: 'plugin' | 'agent' | 'none';
    code: string;
    label: string;
    message: string;
    targetVersion?: string;
    current: RuntimeVersion;
    releaseUrl?: string;
    manualUpdate?: string;
}
export declare function compareVersions(a: string, b: string): number;
export declare function trustedReleaseAsset(asset: Release['asset'], version: string): boolean;
export declare function validateCatalog(value: unknown): UpdateCatalog;
export declare function releaseMatches(r: Release, current: RuntimeVersion): boolean;
export declare function assessUpdate(raw: unknown, current: RuntimeVersion, now?: number, preview?: boolean): UpdateAdvice;
