import { type Release } from './update-policy.js';
export declare function boundedFetch(url: string, maxBytes: number, fetcher?: typeof fetch): Promise<Buffer>;
/** Audit the npm tarball BEFORE any package manager sees it. No extraction. */
export declare function auditArchive(archive: Buffer, release: Release): void;
export declare function downloadRelease(release: Release, fetcher?: typeof fetch): Promise<Buffer>;
