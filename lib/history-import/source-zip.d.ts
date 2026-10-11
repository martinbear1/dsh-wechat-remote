export declare const MAX_SOURCE_BYTES: number;
export declare const MAX_EXPANDED_BYTES: number;
/** Read one known export entry in memory. Never extract paths or execute archive contents. */
export declare function readExportZip(bytes: Buffer): Promise<Buffer>;
