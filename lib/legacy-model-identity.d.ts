/**
 * Compatibility ONLY for the released Mini Program's model-only equality check.
 * Native IDs, projections, defaults on disk, and slash-style Remote RPCs stay native.
 * No mutable/global alias table: Web/Desktop, reconnect and hot reload cannot share
 * stale identity state. Labels never determine routing; exact native IDs do.
 */
type RecordValue = Record<string, unknown>;
export declare const LEGACY_MODEL_FORMAT = "legacy-provider-model-v1";
export declare const NATIVE_MODEL_FORMAT = "native-v1";
export declare function modelIdentityFormat(request: RecordValue): string;
export declare function legacyModelAlias(provider: string, model: string): string;
export declare function legacyModelSelection(value: unknown): unknown;
export declare function presentModelCatalog(catalog: RecordValue, current: unknown, format: string): RecordValue;
export declare function needsModelAliasResolution(request: RecordValue): boolean;
export declare function resolveModelAlias(catalog: unknown, request: RecordValue): {
    model: string;
    aliased: boolean;
};
export {};
