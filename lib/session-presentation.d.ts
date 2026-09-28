export declare function presentationProjection(key: string, raw: unknown): {
    key: string;
    value: unknown;
} | null;
/** DSH 0.1.7 moved selectable permissions out of the Session projection into
 * permissionPresets.catalog(). Released phones still read permissions.options.
 * Join that LIVE process catalog only at our legacy transport boundary: never
 * persist options into native history, invent default choices, or change the
 * current permission. Older hosts already supplying options are unchanged.
 * Retire this bridge when supported phone clients read the native catalog. */
export declare function legacyPermissionValue(value: unknown, catalog: unknown): unknown;
export declare function withPresentationProjections(block: unknown, permissionCatalog?: unknown): unknown;
