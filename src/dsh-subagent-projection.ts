import type { HostContext } from './dsh-host-context.js'

type Projection = Record<string, any> | null
type Observation = {
  header: { id: string }
  cursor: number
  projections?: { asOfSeq: number; values: Record<string, unknown> }
  [Symbol.dispose](): void
}

function unavailable(key: 'subagentCatalog' | 'worktree'): Error {
  if (key === 'worktree') return Object.assign(new Error('无法确认工作树归属，请在电脑端核对后归档。'), {code:'adapter/worktree-projection-unavailable'})
  return Object.assign(new Error('DSH 子代理目录暂不可读取，请稍后重试'), {
    code: 'adapter/subagent-projection-unavailable',
  })
}

/** Resolve a migration hint into an exact, read-only observation of the requested projection.
 *
 * Call only AFTER native projections/list requests have passed admission for
 * this session. A migration-required response is cached display metadata, not
 * permission or a sequenced snapshot. Never use its hints as catalog truth,
 * acquire an Agent/writer, or fall back after a native read is denied.
 * Current and older hosts retain their existing projection path unchanged.
 */
export async function resolveExactArrayProjection(
  ctx: HostContext,
  parent: string,
  projection: Projection,
  signal?: AbortSignal,
  key: 'subagentCatalog' | 'worktree' = 'subagentCatalog',
): Promise<Projection> {
  signal?.throwIfAborted()
  if (projection?.kind !== 'migration-required') return projection
  if (typeof parent !== 'string' || !parent || parent.length > 256) throw unavailable(key)
  const query = ctx.get('sessionQuery') as {
    observeSession?: (id: string, options: { signal?: AbortSignal; projectionMode: 'all' }) => Promise<Observation>
  } | undefined
  if (typeof query?.observeSession !== 'function') throw unavailable(key)
  const observation = await query.observeSession(parent, { signal, projectionMode: 'all' })
  try {
    signal?.throwIfAborted()
    const exact = observation.projections
    // Native observations bind identity, projection watermark and log cursor
    // to one immutable cut. Missing/mismatched metadata must not be invented.
    if (typeof observation[Symbol.dispose] !== 'function'
        || observation.header?.id !== parent
        || !Number.isSafeInteger(observation.cursor) || observation.cursor < -1
        || exact?.asOfSeq !== observation.cursor
        || !Array.isArray(exact.values?.[key])) throw unavailable(key)
    // Copy only the requested projection before releasing the native observation.
    return { kind: 'sequenced', asOfSeq: observation.cursor,
      values: { [key]: structuredClone(exact.values[key]) } }
  } finally {
    if (typeof observation?.[Symbol.dispose] === 'function') observation[Symbol.dispose]()
  }
}

export const resolveSubagentCatalogProjection = resolveExactArrayProjection
