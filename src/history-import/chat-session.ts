/** Read only the current live session through the host's public observation API.
 * Never open another chat, cold persistence, or a cross-session search index. */
type Row = Record<string, any>
export type ChatObservation = Row & { [Symbol.dispose](): void }
const identities = new WeakMap<object, boolean>()
const changed = () => Object.assign(new Error('The current live Chat session changed.'), { code: 'CHAT_HISTORY_SCOPE' })

export async function observeChatSession(ctx: Row, agent: Row, signal?: AbortSignal): Promise<ChatObservation> {
  const session = agent?.session
  const valid = () => session && ctx.agents.get(agent.id) === agent && session.id === agent.id
    && session.header.id === agent.id && ctx.sessions.get(agent.id) === session
  signal?.throwIfAborted()
  if (!valid()) throw changed()
  const observation = await ctx.sessionQuery.observeSession(agent.id, { signal, projectionMode: 'none' })
  try {
    signal?.throwIfAborted()
    if (!valid() || observation.source !== 'live' || observation.header.id !== agent.id) throw changed()
    return observation
  } catch (error) { observation[Symbol.dispose](); throw error }
}

export async function importedSession(ctx: Row, agent: Row, signal?: AbortSignal): Promise<boolean> {
  if (!agent?.session) return false
  signal?.throwIfAborted()
  if (ctx.agents.get(agent.id) !== agent || ctx.sessions.get(agent.id) !== agent.session) return false
  const cached = identities.get(agent.session)
  if (cached !== undefined) return cached
  const observation = await observeChatSession(ctx, agent, signal)
  try {
    const imported = observation.events[0]?.type === 'harness-remote/history-import/source'
    identities.set(agent.session, imported)
    return imported
  } finally { observation[Symbol.dispose]() }
}
