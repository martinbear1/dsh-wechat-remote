import { type ResourcePreset, type ResourceRelease } from './contract.js';
export interface StoredResource {
    release: ResourceRelease;
    resource: ResourcePreset;
    content: Buffer;
    enabled: boolean;
}
/** Immutable, plugin-owned files only. Startup never creates directories,
 * repairs files or changes an installed package/profile/session. */
export declare class ResourceStorage {
    readonly directory: string;
    constructor(directory: string);
    private root;
    private bounded;
    private read;
    setEnabled(identity: Pick<ResourceRelease, 'resourceId' | 'version'>, enabled: boolean): Promise<StoredResource>;
    scan(): Promise<{
        records: StoredResource[];
        invalid: number;
    }>;
    save(content: Buffer, release: ResourceRelease): Promise<StoredResource>;
}
