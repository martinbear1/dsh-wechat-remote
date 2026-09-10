const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
function numbers(v, names) {
    return Object.fromEntries(names.flatMap(([from, to]) => typeof v[from] === 'number' && Number.isFinite(v[from]) && Number(v[from]) >= 0 ? [[to, v[from]]] : []));
}
export function presentationProjection(key, raw) {
    const base = object(raw), v = base.values ? object(base.values) : base;
    let name, value;
    switch (key) {
        case 'sessionStats':
            name = 'metrics';
            value = numbers(v, [['turns', 'turns'], ['steps', 'steps'], ['toolMs', 'toolMs'], ['llmMs', 'modelMs'], ['ttftMs', 'firstTokenMs'], ['ttftSteps', 'firstTokenSamples'], ['decodeMs', 'decodeMs'], ['decodeTokens', 'decodeTokens']]);
            break;
        case 'tokenUsage':
            name = 'usage';
            value = numbers(v, [['uncachedInputTokens', 'input'], ['outputTokens', 'output'], ['cacheReadTokens', 'cacheRead'], ['cacheWriteTokens', 'cacheWrite']]);
            break;
        case 'contextPressure':
            name = 'context';
            value = { estimated: true, ...numbers(v, [[v.projectedTokens === undefined ? 'pressureTokens' : 'projectedTokens', 'used'], ['contextWindow', 'capacity']]) };
            break;
        case 'contextBreakdown':
            name = 'composition';
            value = numbers(v, [['systemTokens', 'system'], ['toolsTokens', 'tools'], ['messageTokens', 'messages']]);
            break;
        case 'plan':
            name = 'planMode';
            value = { active: v.active === true, pending: v.pending === true };
            break;
        case 'todos':
            name = 'plan';
            value = Array.isArray(raw) ? { steps: raw.map(t => ({ text: object(t).content, status: object(t).status })) } : null;
            break;
        case 'goal': {
            name = 'goal';
            const goal = object(base.goal);
            value = base.goal ? { id: goal.id, revision: goal.revision, text: goal.objective, status: goal.phase, rounds: base.roundsStarted, roundLimit: goal.maxGoalRounds, reason: object(goal.blockedReason).message } : null;
            break;
        }
        default: return null;
    }
    return { key: `agent.${name}.v1`, value };
}
export function withPresentationProjections(block) {
    const source = object(block);
    if (!source.values)
        return block;
    const values = { ...object(source.values) };
    for (const [key, value] of Object.entries(values)) {
        const projected = presentationProjection(key, value);
        if (projected)
            values[projected.key] = projected.value;
    }
    return { ...source, values };
}
