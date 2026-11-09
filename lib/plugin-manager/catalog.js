import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plain } from './schema.js';
/** Public plugins.item companions, verified against both 0.2.1-rc.5 and 0.2.2-rc.1.
 * Host Settings has no menu ledger. Keep this explicit bridge separate from the
 * generic form codec: do not turn every volatile core namespace into a card or
 * execute a browser module to discover its slots. Membership remains live. */
const companions = [
    { companion: 'subagent', title: '子智能体', iconKey: 'subagent', namespaces: ['subagent', 'subagent-model-selection-settings'] },
    { companion: 'web-search', title: '网页搜索', iconKey: 'search', namespaces: ['web-search-deepseek', 'web', 'web-deepseek-api'], required: 'web-search-deepseek' },
    { companion: 'agent-loop', title: 'Agent 循环', iconKey: 'loop', namespaces: ['agent-loop'] },
    { companion: 'shell', title: '终端', iconKey: 'terminal', namespaces: ['pwsh-sandbox', 'bash-sandbox'], firstOnly: true },
];
export function builtinCards(plugins, forms) {
    return companions.flatMap(def => {
        const module = '@deepseek-ai/dsh-client-ui-settings-' + def.companion;
        if (!plugins.some(p => p.moduleName === module && p.enabled && p.fiberPhase === 'active'))
            return [];
        const served = (ns) => forms.some(f => f.ns === ns);
        if ('required' in def && !served(def.required))
            return [];
        let rows = def.namespaces.flatMap(ns => served(ns) ? plugins.filter(p => p.patchId === ns && p.enabled && p.moduleName.startsWith('@deepseek-ai/')) : []);
        if ('firstOnly' in def)
            rows = rows.slice(0, 1); // Native shell companion prefers PowerShell when both are served.
        return rows.length ? [{ row: rows[0], rows, title: def.title, iconKey: def.iconKey }] : [];
    });
}
const names = (items) => items.map(s => '@deepseek-ai/dsh-' + s);
const core = names(['base', 'web-app', 'headless', 'sdk-app', 'acp-app', 'sdk-minimal']);
const oldFirst = names(['experimental-agent-team-profile', 'experimental-voice-input-bundle', 'experimental-auto-review', 'experimental-inspector-profile']);
const oldMore = names(['experimental-tool-worktree', 'experimental-cot-translation-bundle', 'experimental-terminal-bundle', 'experimental-session-search', 'experimental-session-titles-bundle', 'experimental-badge-skill-bundle', 'experimental-ralph-bundle', 'experimental-plugin-market-bundle', 'subagent-codex', 'subagent-claude-code']);
const newFirst = names(['experimental-agent-team-profile', 'experimental-voice-input-bundle', 'experimental-plugin-market-bundle', 'experimental-auto-review']);
const newMore = names(['personalized-recommendations', 'experimental-inspector-profile', 'cua-bundle', 'experimental-cot-translation-bundle', 'experimental-session-search', 'experimental-session-titles-bundle', 'experimental-badge-skill-bundle', 'experimental-ralph-bundle', 'subagent-codex', 'subagent-claude-code']);
const strings = (value) => {
    const list = value instanceof Set ? [...value] : value;
    return Array.isArray(list) && list.length <= 2000 && list.every(v => typeof v === 'string' && v.startsWith('@deepseek-ai/') && v.length <= 256) ? list : undefined;
};
/** Resolve the installation's public pure metadata export, never a profile's
 * third-party browser entry. Older Hosts have no public display policy export. */
export async function catalogPolicy(profile, bundles) {
    if (plain(profile) && typeof profile.installAnchor === 'string' && isAbsolute(profile.installAnchor)) {
        try {
            const require = createRequire(profile.installAnchor);
            const policy = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-official-bundles')).href);
            const hidden = strings(policy.HIDDEN_BUNDLES), first = strings(policy.EXTENSION_BUNDLES), more = strings(policy.MORE_BUNDLES);
            if (hidden && first && more)
                return { hidden: new Set(hidden), first, more, source: 'native-export' };
        }
        catch { /* Exact older UI contract below; no guessed future menu entries. */ }
    }
    const successor = bundles.some(b => b.name === '@deepseek-ai/dsh-experimental-forge-bundle' && b.official === true);
    return { hidden: new Set([...core, ...successor ? names(['experimental-terminal-bundle', 'experimental-tool-worktree']) : []]),
        first: successor ? newFirst : oldFirst, more: successor ? newMore : oldMore, source: successor ? 'verified-rc1-fallback' : 'verified-rc5-fallback' };
}
export function visibleBundles(bundles, plugins, policy) {
    const running = (bundle) => (bundle.rows || []).some((r) => plugins.some(p => p.entryId === r.entryId && p.enabled));
    const rank = (name) => policy.first.includes(name) ? policy.first.indexOf(name) : policy.more.includes(name) ? policy.first.length + 1 + policy.more.indexOf(name) : policy.first.length;
    return bundles.filter(b => !policy.hidden.has(b.name)
        && (b.listedByDefault !== false || b.enabled || b.installed || running(b))
        && (b.installed === true || b.official === true || b.error !== undefined))
        .sort((a, b) => a.official === b.official ? rank(a.name) - rank(b.name) : a.official ? -1 : 1);
}
