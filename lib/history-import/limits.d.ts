export declare const MAX_FILE_BYTES: number;
export declare const MAX_SHARE_BYTES: number;
export declare const MAX_NORMALIZED_BYTES: number;
export declare const MAX_FILE_NORMALIZED_BYTES: number;
export declare const MAX_SELECTED_BYTES: number;
export declare const MAX_SEED_BYTES: number;
export declare const MAX_MESSAGES = 10000;
/** Byte counts only, never source content or an untrusted exception message. */
export declare function sizeLimitError(code: string, actualBytes: number, limitBytes: number): Error;
