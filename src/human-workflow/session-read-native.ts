/** Native point reads shared by owner-input, session intents and automation.
 * Reading an old session must never restore/resolve an Agent or publish it to
 * the live SessionStore. Authorization and principal/generation checks remain
 * with each caller; a readable log is not permission to execute anything. */
interface SessionReadHost { get(name: any): any }
export interface NativeSessionRead {
  meta: Record<string, any>
  events: readonly Record<string, any>[]
}
const unavailable = () => Object.assign(new Error('Native read-only session access is unavailable'), { code: 'native-session-read-unavailable' })
const invalid = () => Object.assign(new Error('Native session identity or log is invalid'), { code: 'native-session-read-invalid' })

export function nativeSessionReadSupported(host: SessionReadHost): boolean {
  try {
    return typeof host.get('sessionController')?.inspect === 'function'
      || typeof host.get('sessionQuery')?.observeSession === 'function'
  } catch { return false }
}

function snapshot(sessionId: string, meta: any, events: unknown): NativeSessionRead {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta) || meta.id !== sessionId
    || !Number.isSafeInteger(meta.createdAt) || meta.createdAt < 0 || !Array.isArray(events)) throw invalid()
  // Native observation metadata/events are immutable point-in-time values;
  // releasing its lease only releases the cache pin, not these values. Do not
  // deep-copy a potentially large history or compute unused projections.
  return { meta: { ...meta }, events }
}

export async function readNativeSession(host: SessionReadHost, sessionId: string, signal: AbortSignal,
  options: { includeEvents?: boolean } = {}): Promise<NativeSessionRead> {
  signal.throwIfAborted()
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256) throw invalid()
  const controller = host.get('sessionController')
  // Preserve the current production API when mounted. A failed inspection is
  // not a reason to retry through a different service and hide its failure.
  if (typeof controller?.inspect === 'function') {
    const value = await controller.inspect(sessionId, signal)
    signal.throwIfAborted()
    return snapshot(sessionId, value?.meta, options.includeEvents === false ? [] : value?.events)
  }
  const query = host.get('sessionQuery')
  if (typeof query?.observeSession !== 'function') throw unavailable()
  const observation = await query.observeSession(sessionId, { signal, projectionMode: 'none' })
  if (typeof observation?.[Symbol.dispose] !== 'function') throw invalid()
  try {
    // The native reader may finish just as the owner/request is cancelled.
    // Always release even a late successful observation before propagating it.
    signal.throwIfAborted()
    const result = snapshot(sessionId, observation.header, options.includeEvents === false ? [] : observation.events)
    signal.throwIfAborted()
    return result
  } finally { observation[Symbol.dispose]() }
}
