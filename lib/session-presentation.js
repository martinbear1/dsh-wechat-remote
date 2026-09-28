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
/** DSH 0.1.7 moved selectable permissions out of the Session projection into
 * permissionPresets.catalog(). Released phones still read permissions.options.
 * Join that LIVE process catalog only at our legacy transport boundary: never
 * persist options into native history, invent default choices, or change the
 * current permission. Older hosts already supplying options are unchanged.
 * Retire this bridge when supported phone clients read the native catalog. */
export function legacyPermissionValue(value, catalog) {
    const selection = object(value), source = object(catalog);
    // A legacy Session may carry its own complete choices. They remain the
    // authority on that host; this bridge only supplies the missing modern list.
    if (Array.isArray(selection.options))
        return value;
    if (typeof selection.currentValue !== 'string' || !Array.isArray(source.options))
        return value;
    const seen = new Set();
    const options = [];
    for (const raw of source.options) {
        const option = object(raw);
        if (typeof option.value !== 'string' || !option.value || seen.has(option.value)
            || typeof option.name !== 'string')
            return value;
        seen.add(option.value);
        options.push({ value: option.value, name: option.name,
            ...(typeof option.description === 'string' ? { description: option.description } : {}) });
    }
    return { ...selection, options };
}
export function withPresentationProjections(block, permissionCatalog) {
    const source = object(block);
    if (!source.values)
        return block;
    const values = { ...object(source.values) };
    if (Object.hasOwn(values, 'permissions'))
        values.permissions = legacyPermissionValue(values.permissions, permissionCatalog);
    for (const [key, value] of Object.entries(values)) {
        const projected = presentationProjection(key, value);
        if (projected)
            values[projected.key] = projected.value;
    }
    return { ...source, values };
}
