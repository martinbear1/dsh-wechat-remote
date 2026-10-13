export interface OtherEndpointInfo {
    scope?: 'web' | 'desktop';
    state: 'available' | 'not-found' | 'unknown';
    pluginState: 'installed' | 'not-installed' | 'unknown';
    pluginVersion?: string;
    /** Present only when this profile explicitly owns a DSH package. */
    dshVersion?: string;
    update: {
        state: 'available' | 'none' | 'unknown' | 'not-installed';
        targetVersion?: string;
    };
}
/** Compare only published stable releases with the OTHER installed version.
 * Missing evidence stays unknown; this advisory never admits an installation. */
export declare function otherEndpointStableUpdate(raw: unknown, pluginVersion: string, dshVersion: string | undefined, platform: string, now?: number): OtherEndpointInfo['update'];
export declare function readOtherEndpointInfo(options: {
    home: string;
    scope: string;
    signal: AbortSignal;
    platform?: string;
    fetcher?: typeof fetch;
}): Promise<OtherEndpointInfo>;
