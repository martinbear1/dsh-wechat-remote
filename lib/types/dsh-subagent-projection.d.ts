import type { HostContext } from './dsh-host-context.js';
type Projection = Record<string, any> | null;
/** Resolve a migration hint into an exact, read-only catalog observation.
 *
 * Call only AFTER native projections/list requests have passed admission for
 * this parent. A migration-required response is cached display metadata, not
 * permission or a sequenced snapshot. Never use its hints as catalog truth,
 * acquire an Agent/writer, or fall back after a native read is denied.
 * Current and older hosts retain their existing projection path unchanged.
 */
export declare function resolveSubagentCatalogProjection(ctx: HostContext, parent: string, projection: Projection, signal?: AbortSignal): Promise<Projection>;
export {};
