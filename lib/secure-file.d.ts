/** Best-effort owner-only permissions for credentials and stable identities. */
export declare function tightenPrivateFile(file: string): void;
/**
 * Replace a private JSON file without ever truncating the previous valid file.
 * The temporary file lives beside the destination, so rename is same-volume.
 */
export declare function writePrivateJsonAtomic(file: string, value: unknown): void;
export declare function readPrivateJson<T>(file: string): T;
