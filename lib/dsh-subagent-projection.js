function unavailable() {
    return Object.assign(new Error('DSH 子代理目录暂不可读取，请稍后重试'), {
        code: 'adapter/subagent-projection-unavailable',
    });
}
/** Resolve a migration hint into an exact, read-only catalog observation.
 *
 * Call only AFTER native projections/list requests have passed admission for
 * this parent. A migration-required response is cached display metadata, not
 * permission or a sequenced snapshot. Never use its hints as catalog truth,
 * acquire an Agent/writer, or fall back after a native read is denied.
 * Current and older hosts retain their existing projection path unchanged.
 */
export async function resolveSubagentCatalogProjection(ctx, parent, projection, signal) {
    signal?.throwIfAborted();
    if (projection?.kind !== 'migration-required')
        return projection;
    if (typeof parent !== 'string' || !parent || parent.length > 256)
        throw unavailable();
    const query = ctx.get('sessionQuery');
    if (typeof query?.observeSession !== 'function')
        throw unavailable();
    const observation = await query.observeSession(parent, { signal, projectionMode: 'all' });
    try {
        signal?.throwIfAborted();
        const exact = observation.projections;
        // Native observations bind identity, projection watermark and log cursor
        // to one immutable cut. Missing/mismatched metadata must not be invented.
        if (typeof observation[Symbol.dispose] !== 'function'
            || observation.header?.id !== parent
            || !Number.isSafeInteger(observation.cursor) || observation.cursor < -1
            || exact?.asOfSeq !== observation.cursor
            || !Array.isArray(exact.values?.subagentCatalog))
            throw unavailable();
        // Only the catalog crosses the lease lifetime. Do not retain the lease or
        // copy unrelated projections/history; existing catalog validation remains
        // responsible for child modes, duplicate ids and listed ownership.
        return { kind: 'sequenced', asOfSeq: observation.cursor,
            values: { subagentCatalog: structuredClone(exact.values.subagentCatalog) } };
    }
    finally {
        if (typeof observation?.[Symbol.dispose] === 'function')
            observation[Symbol.dispose]();
    }
}
