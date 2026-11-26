/** A unique private directory owns exactly one archive file. Never accepts a
 * client path. The controller serializes operations on each upload. */
export declare class StagedArchive {
    readonly size: number;
    offset: number;
    private handle?;
    private directory?;
    private disposed;
    private queue;
    private constructor();
    static create(size: number, root?: string): Promise<StagedArchive>;
    get file(): string;
    append(offset: number, bytes: Uint8Array): Promise<number>;
    finish(): Promise<string>;
    dispose(): Promise<void>;
}
/** Only directories carrying this module's marker beneath its dedicated
 * profile spool. A live process owns its files; crashes are reclaimed next use. */
export declare function cleanupAbandonedArchives(root: string): Promise<void>;
