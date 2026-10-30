const identities = new WeakMap();
const changed = () => Object.assign(new Error('The current live Chat session changed.'), { code: 'CHAT_HISTORY_SCOPE' });
export async function observeChatSession(ctx, agent, signal) {
    const session = agent?.session;
    const valid = () => session && ctx.agents.get(agent.id) === agent && session.id === agent.id
        && session.header.id === agent.id && ctx.sessions.get(agent.id) === session;
    signal?.throwIfAborted();
    if (!valid())
        throw changed();
    const observation = await ctx.sessionQuery.observeSession(agent.id, { signal, projectionMode: 'none' });
    try {
        signal?.throwIfAborted();
        if (!valid() || observation.source !== 'live' || observation.header.id !== agent.id)
            throw changed();
        return observation;
    }
    catch (error) {
        observation[Symbol.dispose]();
        throw error;
    }
}
export async function importedSession(ctx, agent, signal) {
    if (!agent?.session)
        return false;
    signal?.throwIfAborted();
    if (ctx.agents.get(agent.id) !== agent || ctx.sessions.get(agent.id) !== agent.session)
        return false;
    const cached = identities.get(agent.session);
    if (cached !== undefined)
        return cached;
    const observation = await observeChatSession(ctx, agent, signal);
    try {
        const imported = observation.events[0]?.type === 'harness-remote/history-import/source';
        identities.set(agent.session, imported);
        return imported;
    }
    finally {
        observation[Symbol.dispose]();
    }
}
