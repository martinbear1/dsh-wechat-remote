export declare const MAX_SOURCE_BYTES: number;
export declare const MAX_EXPANDED_BYTES: number;
/** Compatibility entry for the original small legacy export API. All archive
 * validation is shared with the disk-backed v3 reader; no second ZIP parser. */
export declare function readExportZip(bytes: Buffer): Promise<Buffer>;
