import { type Release } from './update-policy.js';
/** Only availability failures permit changing source or using an eligible bundle.
 * Integrity, policy, cancellation and archive errors must never take that route. */
export declare class DownloadUnavailableError extends Error {
    constructor(message?: string, options?: ErrorOptions);
}
export interface DownloadOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    responseTimeoutMs?: number;
    idleTimeoutMs?: number;
}
export declare function boundedFetch(url: string, maxBytes: number, fetcher?: typeof fetch): Promise<Buffer>;
/** Audit the plugin BEFORE any package manager sees it. */
export declare function auditArchive(archive: Buffer, release: Release): void;
export declare function pluginFromInstaller(archive: Buffer, release: Release): Buffer;
/** Also used by the publication gate to verify the alternate independently. */
export declare function downloadNpmRelease(release: Release, fetcher?: typeof fetch, options?: DownloadOptions): Promise<Buffer>;
export declare function downloadRelease(release: Release, fetcher?: typeof fetch, options?: DownloadOptions): Promise<Buffer>;
