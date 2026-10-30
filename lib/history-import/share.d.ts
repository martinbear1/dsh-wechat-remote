/** Public share reader only. Never accepts a generic URL or a login credential. */
import { MAX_SHARE_BYTES } from './limits.js';
export { MAX_SHARE_BYTES };
export declare const MAX_IMPORT_BYTES: number;
export declare const IMPORT_CHUNK_BYTES: number;
export declare function shareIdentifier(input: unknown): string;
export declare function readPublicShare(input: unknown, signal: AbortSignal, fetchImpl?: typeof fetch): Promise<Buffer>;
