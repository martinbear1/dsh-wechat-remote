/** The first public resource release is shipped as data for offline first use.
 * Cloud publication uses these same canonical bytes; there is no second preset
 * registration or startup download path. Never replace an existing local ID. */
export declare function bundledResourceReleases(): {
    content: Buffer<ArrayBuffer>;
    release: {
        resourceId: string;
        version: string;
        sha256: string;
        bytes: number;
    };
}[];
