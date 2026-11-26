import { setImmediate as yieldRouteRead } from 'node:timers/promises';
import { observeChatSession } from './chat-session.js';
const complete = (value) => typeof value?.provider === 'string' && value.provider.length > 0
    && typeof value.model === 'string' && value.model.length > 0
    ? { provider: value.provider, model: value.model } : undefined;
/** Use the last model that actually answered, as native compaction does on
 * alpha.1. A rejected new route may not accept the existing conversation.
 * Read through the public observation API instead of another owner's private
 * projection. Imported provider labels describe archives, not runnable models.
 */
export async function conversationSummaryRoute(ctx, agent, signal, pendingRoute) {
    const observation = await observeChatSession(ctx, agent, signal);
    const finish = (route) => {
        signal?.throwIfAborted();
        if (ctx.agents.get(agent.id) !== agent || ctx.sessions.get(agent.id) !== agent.session)
            throw Object.assign(new Error('The current live Chat session changed.'), { code: 'CHAT_HISTORY_SCOPE' });
        return route;
    };
    try {
        for (let i = observation.events.length - 1, scanned = 0; i >= 0; i--) {
            if (++scanned % 512 === 0) {
                await yieldRouteRead();
                signal?.throwIfAborted();
            }
            const event = observation.events[i];
            if (event.type !== 'assistant/message')
                continue;
            const route = complete(event.data?.message?.source);
            if (!route || route.provider === 'deepseek-web-history' || route.provider === 'deepseek-chat-export')
                continue;
            return finish(route);
        }
        return finish(complete(pendingRoute) ?? complete(agent.session.requestHeader()?.config) ?? complete(agent.options));
    }
    finally {
        observation[Symbol.dispose]();
    }
}
