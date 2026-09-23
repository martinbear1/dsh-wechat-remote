/** Generated-manifest compatibility only. Retire with pre-0.1.6-alpha.2 hosts.
 * New hosts keep lazy factories; old hosts read the SAME strict schema through
 * a lazy accessor. No relaxed validation or second schema copy. */
export declare function attachLegacySchemaAccess(manifest: any): void;
