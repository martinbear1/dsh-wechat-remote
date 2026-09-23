type Row = Record<string, any>;
export interface HostContext {
    get(name: string): unknown;
}
/** Inspect only the RUNNING CLI, never another global/npm cache install. */
export declare function runningDshVersion(entry?: string): string | undefined;
/** No carrier-arity capability exists. Follow the official 0.1.7-alpha.1
 * boundary centrally, not Function.length or trial calls. Retire the legacy
 * branch once pre-0.1.7 hosts leave the support matrix. */
export declare function usesDuplexEvents(version: string | undefined): boolean;
export declare function openHostEvents(gateway: Row, endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
export declare function workspaceReadArguments(ctx: HostContext, args: Row): Row;
export declare function nativeFileBytes(value: unknown): Buffer;
/** DSH 0.1.7 moved the browser child catalog to parent projections. Keep the
 * shipped phone vocabulary here, without resurrecting a removed Remote method
 * or inspecting native log files. Mutations still use native admission checks.
 * Remove this projection when the phone contract adopts parent projections. */
export declare function projectedSubagentCatalog(parent: string, projection: Row | null, rows: Row[]): Row;
export declare function invokeHostRemote(ctx: HostContext, gateway: Row, request: Row): Promise<unknown>;
export {};
