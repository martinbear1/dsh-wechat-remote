export declare function nodeStorageDirectory(home: string, profile: string): string;
/** Installation controller can be loaded into the OLD plugin's process. It
 * reads that process's existing credentials; migration waits for its restart. */
export declare function installedNodeStatePaths(home: string, profile: string): {
    stateFile: string;
    identityFile: string;
};
/** Before opening any network door. Idempotent on first install, upgrade,
 * restart, or re-upgrade after an old plugin changed its rollback files. */
export declare function prepareNodeStorage(home: string, profile: string): void;
/** One serialized transaction updates the authority and downgrade mirror.
 * External changes while running require restart, not stale in-memory writes. */
export declare function writeNodeState(file: string, value: unknown): void;
