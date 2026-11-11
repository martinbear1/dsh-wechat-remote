/** Audited native Client pages, projected as data. No Client JavaScript is imported or executed. */
import { createHash } from 'node:crypto';
import { plain, readPath, formSection, localized } from './schema.js';
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\u0000-\u001f]/u.test(v);
export const routeKey = (r) => `${r.provider}\0${r.model}`;
export const route = (v) => plain(v) && Object.keys(v).every(k => k === 'provider' || k === 'model') && text(v.provider) && text(v.model);
export const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function service(host, name, methods) {
    const value = host.get(name);
    return plain(value) && methods.every(m => typeof value[m] === 'function') ? value : undefined;
}
const bundleKinds = {
    '@deepseek-ai/dsh-experimental-cot-translation-bundle': 'translation',
    '@deepseek-ai/dsh-experimental-voice-input-bundle': 'speech',
    '@deepseek-ai/dsh-cua-bundle': 'cua',
};
export function pageKind(item) {
    if (item.builtin)
        return { subagent: 'subagent', search: 'web-search', loop: 'agent-loop', terminal: 'shell' }[item.iconKey || ''];
    if (item.kind === 'bundle' && item.category === 'experimental')
        return bundleKinds[item.name] || 'native-summary';
}
/** The provider registry and split billing schema supersede the coupled switch.
 * A partially loaded modern Host must never fall back to the shared key. */
export function independentWeb(host, sections) {
    const registry = host.get('typert');
    const selection = sections.find(s => s.ns === 'web');
    const shared = sections.find(s => s.ns === 'web-deepseek-api');
    const has = (s, name) => s?.fields.some(f => f.path.length === 1 && f.path[0] === name);
    // A missing/partially loaded registry alone does not establish the old shared credential contract.
    return !has(selection, 'searchProvider') || !has(selection, 'fetchProvider') || !has(shared, 'apiKeyEnv')
        || !!service(host, 'web', ['listProviders']) || !!registry?.local?.hasSeen?.('web/listProviders')
        || !!registry?.local?.get?.('web/listProviders')
        || sections.some(s => s.ns === 'web-deepseek-api' && s.fields.some(f => ['searchBilling', 'fetchBilling', 'searchApiKeyEnv', 'fetchApiKeyEnv'].includes(f.path[0])));
}
async function providerChoices(host) {
    const web = service(host, 'web', ['listProviders']);
    if (!web)
        return;
    try {
        const rows = await web.listProviders();
        const choices = (items) => {
            if (!Array.isArray(items) || items.length > 199)
                return;
            const ids = new Set();
            const result = [{ label: '使用宿主默认设置', value: '' }];
            for (const item of items) {
                if (!plain(item) || !text(item.id) || ids.has(item.id))
                    return;
                ids.add(item.id);
                result.push({ label: localized(item.title, item.id) || item.id, value: item.id });
            }
            return result;
        };
        const search = choices(rows?.search), fetch = choices(rows?.fetch);
        if (search && fetch)
            return { search, fetch };
    }
    catch { /* A provider registry may be reloading. */ }
}
export function webCredentialRef(forms, changes = []) {
    const selected = effective(forms, changes, 'web', ['searchProvider']) === 'deepseek-search-api' ? 'web-deepseek-api' : 'web-search-deepseek';
    const ref = forms.find(f => f.ns === selected)?.value?.apiKeyEnv;
    if (ref !== undefined && ref !== '' && (typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)))
        throw new Error('网页搜索的凭据引用无效，请在电脑端核对。');
    return ref || 'DEEPSEEK_API_KEY';
}
export function credentialRevision(forms) {
    return digest(forms.filter(f => ['web', 'web-search-deepseek', 'web-deepseek-api'].includes(f.ns)).map(f => [f.ns, f.revision, f.value?.apiKeyEnv, f.value?.searchProvider]));
}
export function effective(forms, changes, ns, path) {
    const view = forms.find(f => f.ns === ns), op = changes.find(c => c.ns === ns)?.ops?.find((o) => JSON.stringify(o.path) === JSON.stringify(path));
    return op ? op.op === 'unset' ? readPath(view?.base, path) : op.value : readPath(view?.value, path);
}
/** Only this audited object-array field is eligible for writes; other complex schemas stay desktop-only. */
export function hasModelRouteSchema(form) {
    if (!form)
        return false;
    const refs = form.schema?.refs || {}, resolve = (n) => plain(n) ? n : plain(refs[n]) ? refs[n] : undefined;
    const root = resolve(form.schema?.uid ?? form.schema), array = resolve(root?.dict?.allowedModels), inner = resolve(array?.inner);
    return root?.type === 'object' && array?.type === 'array' && inner?.type === 'object'
        && resolve(inner.dict?.provider)?.type === 'string' && resolve(inner.dict?.model)?.type === 'string'
        && ![root, array, inner, resolve(inner.dict.provider), resolve(inner.dict.model)].some(n => n?.meta?.hidden || n?.meta?.disabled || n?.meta?.role === 'secret')
        && !(Array.isArray(form.secrets) && form.secrets.some((s) => Array.isArray(s?.path) && (s.path.length === 0 || s.path[0] === 'allowedModels')));
}
async function modelView(host, form) {
    const saved = Array.isArray(form.value?.allowedModels) ? form.value.allowedModels.filter(route).slice(0, 1000) : [];
    const selected = new Set(saved.map(routeKey)), candidates = [];
    let status = 'error', partial = true;
    try {
        const controller = service(host, 'sessionController', ['modelCatalog']);
        if (controller) {
            const catalog = await controller.modelCatalog();
            if (!plain(catalog) || !Array.isArray(catalog.groups) || catalog.groups.length > 200)
                throw Error('catalog');
            for (const group of catalog.groups) {
                if (!plain(group) || !text(group.id) || !Array.isArray(group.models))
                    continue;
                for (const model of group.models.slice(0, 1000))
                    if (plain(model) && text(model.id) && candidates.length < 2000) {
                        const key = routeKey({ provider: group.id, model: model.id });
                        if (!candidates.some(x => x.key === key))
                            candidates.push({ key, provider: group.id, model: model.id,
                                providerName: text(group.name) ? group.name : group.id, modelName: text(model.name) ? model.name : model.id, available: true, selected: selected.has(key) });
                    }
            }
            status = 'ready';
            partial = Array.isArray(catalog.failures) && catalog.failures.length > 0;
        }
    }
    catch { /* No raw provider diagnostics or credentials cross this boundary. */ }
    for (const r of saved)
        if (!candidates.some(c => c.key === routeKey(r)))
            candidates.push({ ...r, key: routeKey(r), providerName: r.provider, modelName: r.model, available: false, selected: true });
    return { ns: form.ns, path: ['allowedModels'], enabledPath: ['enabled'], status, partial, candidates };
}
export async function speechView(host) {
    const controller = service(host, 'speechController', ['catalog']);
    if (!controller)
        return;
    const raw = await controller.catalog();
    if (!plain(raw) || !plain(raw.selection) || !text(raw.selection.providerId) || !text(raw.selection.language) || !Array.isArray(raw.providers) || raw.providers.length > 100)
        return;
    const providers = [];
    for (const p of raw.providers) {
        if (!plain(p) || !text(p.id) || !text(p.name) || !['host-local', 'cloud'].includes(p.location) || !Array.isArray(p.languages) || !p.languages.every(text) || p.languages.length > 100 || !plain(p.preparation))
            continue;
        const phase = p.preparation.phase;
        if (!['unprepared', 'ready', 'standby', 'cancelled', 'downloading', 'checking', 'loading', 'waking', 'cancelling', 'failed'].includes(phase))
            continue;
        const preparation = { phase };
        for (const key of ['completedBytes', 'totalBytes', 'startedAt'])
            if (Number.isFinite(p.preparation[key]) && p.preparation[key] >= 0)
                preparation[key] = p.preparation[key];
        if (Array.isArray(p.preparation.steps))
            preparation.steps = p.preparation.steps.filter((s) => plain(s) && ['check', 'model', 'vad', 'verify', 'load'].includes(s.kind) && ['pending', 'running', 'complete', 'failed', 'cancelled'].includes(s.status)).slice(0, 20).map((s) => ({ kind: s.kind, status: s.status, ...(Number.isFinite(s.startedAt) ? { startedAt: s.startedAt } : {}) }));
        const setupEstimate = p.setupEstimate;
        providers.push({ id: p.id, name: p.name, location: p.location, languages: p.languages, preparation,
            ...(Array.isArray(p.downloadSources) && p.downloadSources.length <= 30 && p.downloadSources.every(text) ? { downloadSources: p.downloadSources } : {}),
            ...(plain(setupEstimate) && ['recommendedDiskBytes', 'expectedMemoryBytes', 'minimumMinutes', 'maximumMinutes'].every(k => Number.isFinite(setupEstimate[k]) && setupEstimate[k] >= 0)
                ? { setupEstimate: { recommendedDiskBytes: setupEstimate.recommendedDiskBytes, expectedMemoryBytes: setupEstimate.expectedMemoryBytes, minimumMinutes: setupEstimate.minimumMinutes, maximumMinutes: setupEstimate.maximumMinutes } } : {}) });
    }
    const selection = { providerId: raw.selection.providerId, language: raw.selection.language };
    // Readiness progresses independently; it must not invalidate a user's configuration click.
    return { revision: digest([selection, providers.map(p => [p.id, p.languages, p.downloadSources])]), selection, providers,
        canConfigure: typeof controller.configure === 'function', canPrepare: typeof controller.prepare === 'function', canCancel: typeof controller.cancelPreparation === 'function' };
}
/** Native Computer Use observations: app ids and names, never local executable paths or arbitrary icon markup. */
export async function cuaView(host, forms) {
    const c = service(host, 'cuaAccess', ['ptcConfiguration']);
    if (!c)
        return;
    const info = await c.ptcConfiguration();
    if (!plain(info))
        return;
    const result = { revision: '', persistent: info.persistent === true, writable: info.writable === true && typeof c.enablePersistentPtc === 'function', canRevoke: false, canRetryApproval: false };
    const preset = forms.find(f => f.ns === 'agent-preset-registry'), settings = host.get('settings');
    if (preset) {
        const section = formSection(preset, '默认预设', plain(settings) && settings.writable !== false);
        const field = section.fields.find(f => f.path.length === 1 && f.path[0] === 'selectedDefault');
        result.defaultPreset = { isPtc: (preset.value?.selectedDefault ?? preset.value?.default) === 'ptc', writable: !!field && field.type === 'string' && !field.readOnly, revision: section.revision };
    }
    if (typeof c.systemStatus === 'function')
        try {
            const state = await c.systemStatus();
            if (plain(state) && typeof state.accessibility === 'boolean' && typeof state.screenRecording === 'boolean')
                result.system = { accessibility: state.accessibility, screenRecording: state.screenRecording };
        }
        catch { /* No raw OS diagnostics on the wire. */ }
    if (typeof c.applications === 'function')
        try {
            const apps = await c.applications();
            if (plain(apps) && Array.isArray(apps.allowedApps) && Array.isArray(apps.blockedApps) && apps.allowedApps.length + apps.blockedApps.length <= 1000) {
                const list = (items) => items.filter((a) => plain(a) && text(a.id) && text(a.name)).map(a => ({ id: a.id, name: a.name }));
                result.applications = { allowedApps: list(apps.allowedApps), blockedApps: list(apps.blockedApps), persistentAvailable: apps.persistentAvailable === true };
                result.canRevoke = typeof c.revoke === 'function' && apps.persistentAvailable === true;
                result.canRetryApproval = typeof c.retryApproval === 'function';
            }
        }
        catch { /* An unavailable observation disables those actions. */ }
    result.revision = digest({ ...result, revision: undefined });
    return result;
}
export async function presentation(host, item, sections, forms, signal) {
    const id = pageKind(item);
    if (!id)
        return;
    if (item.kind === 'bundle' && !item.enabled)
        return { version: 1, id: 'native-summary', saveMode: 'none', fields: [] };
    const result = { version: 1, id, saveMode: 'page', fields: [] };
    const add = (ns, path, title, extra = {}) => {
        if (sections.find(s => s.ns === ns)?.fields.some(f => f.path.length === 1 && f.path[0] === path))
            result.fields.push({ ns, path: [path], title, ...extra });
    };
    if (id === 'subagent') {
        add('subagent', 'maxDepth', '最大递归深度', { group: '运行限制', integer: true, minimum: 0, help: '限制 Agent 创建子智能体的递归层级。0 表示禁用，1 表示仅主 Agent 可以创建；工具自行设置的限制优先。' });
        add('subagent', 'maxActiveSubagents', '子智能体并行数量上限', { group: '运行限制', integer: true, minimum: 1, help: '同一主 Agent 下，所有递归层级同时存活的子智能体总数，主 Agent 不计入。达到上限时，新的启动请求会被拒绝。' });
        add('subagent-model-selection-settings', 'enabled', '允许 Agent 为子智能体选择模型', { group: '模型选择', help: '开启后，Agent 可以从下方授权模型中，为每个子智能体选择提供方、模型和推理强度。仅影响新会话。' });
        const form = forms.find(f => f.ns === 'subagent-model-selection-settings');
        if (sections.some(s => s.ns === form?.ns) && hasModelRouteSchema(form))
            result.models = await modelView(host, form);
        result.notices = ['关闭模型选择后，子智能体使用配置的默认模型或继承父 Agent 的模型；已选模型会保留。'];
    }
    else if (id === 'web-search') {
        if (independentWeb(host, sections)) {
            const choices = await providerChoices(host);
            signal.throwIfAborted();
            result.notices = ['自定义端点和凭据请在电脑端管理。'];
            if (!choices) {
                result.notices.unshift('服务列表暂不可用，请刷新后再编辑。');
                return result;
            }
            const when = (path, value) => ({ ns: 'web', path: [path], value });
            for (const cap of ['search', 'fetch']) {
                const name = cap === 'search' ? '搜索' : '抓取';
                const providerPath = cap + 'Provider';
                add('web', providerPath, name + '服务', { options: choices[cap] });
                const visibleWhen = when(providerPath, 'deepseek-' + cap + '-api');
                const form = forms.find(f => f.ns === 'web-deepseek-api');
                if (form?.value?.[cap + 'BaseURL'] || form?.value?.[cap + 'ApiKeyEnv'])
                    result.notices.push(name + '已使用电脑端配置的自定义服务参数，该设置优先于计费选择。');
                add('web-deepseek-api', cap + 'Billing', name + '计费方式', { visibleWhen, options: [
                        { label: '自动', value: 'auto' }, { label: 'DeepSeek 账号', value: 'account' }, { label: 'API Key', value: 'api-key' },
                    ] });
            }
            add('web-deepseek-api', 'count', '每次搜索结果数', { integer: true, minimum: 1, maximum: 50, visibleWhen: when('searchProvider', 'deepseek-search-api') });
            add('web-search-deepseek', 'baseURL', 'Messages API 基础地址', { visibleWhen: when('searchProvider', 'deepseek-official') });
            add('web-search-deepseek', 'maxUses', '单次请求最多搜索次数', { visibleWhen: when('searchProvider', 'deepseek-official') });
            return result;
        }
        const api = sections.some(s => s.ns === 'web-deepseek-api'), selection = sections.find(s => s.ns === 'web');
        result.web = { selectionNs: 'web', searchPath: ['searchProvider'], fetchPath: ['fetchProvider'], useSearchApi: effective(forms, [], 'web', ['searchProvider']) === 'deepseek-search-api',
            switchAvailable: api && !!selection?.writable && ['searchProvider', 'fetchProvider'].every(k => selection.fields.some(f => f.path[0] === k && !f.readOnly)),
            apiValues: { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' }, messageValues: { searchProvider: 'deepseek-official', fetchProvider: 'http' } };
        const condition = (api) => ({ ns: 'web', path: ['searchProvider'], value: api ? 'deepseek-search-api' : 'deepseek-official' });
        add('web-search-deepseek', 'baseURL', 'Messages API 基础地址', { help: '填写含 API 前缀的地址，例如 https://api.deepseek.com/anthropic/v1；程序追加 /messages，留空恢复默认。', visibleWhen: condition(false) });
        add('web-search-deepseek', 'maxUses', '单次请求最多搜索次数', { help: '辅助模型在一次 Messages 请求内最多可执行的搜索次数，仅适用于 Messages API。', visibleWhen: condition(false) });
        add('web-deepseek-api', 'baseURL', 'Search / Fetch API 基础地址', { help: '填写含 API 前缀的地址，例如 https://api.deepseek.com/v1/tools；程序追加 /search 或 /fetch，留空恢复默认。', visibleWhen: condition(true) });
        add('web-deepseek-api', 'count', '每次搜索结果数', { integer: true, minimum: 1, maximum: 50, help: '每个查询返回的结果条数，须为 1–50 的整数，默认 10；不控制搜索调用次数。', visibleWhen: condition(true) });
        try {
            const ref = webCredentialRef(forms), controller = service(host, 'credentialsController', ['describe', 'set']);
            const info = controller && (await controller.describe([ref]))?.[ref];
            if (plain(info) && typeof info.configured === 'boolean')
                result.credential = { configured: info.configured, writable: !!controller && info.writable === true && sections.some(s => s.writable), revision: credentialRevision(forms) };
            else
                result.notices = ['当前无法读取凭据状态，请刷新或在电脑端核对。'];
        }
        catch {
            result.notices = ['当前无法读取凭据状态，请刷新或在电脑端核对。'];
        }
    }
    else if (id === 'agent-loop')
        add('agent-loop', 'maxParallelToolCalls', '并行工具调用数', { help: '同一步内最多同时运行多少个可并行的调用。' });
    else if (id === 'shell') {
        const ns = sections.some(s => s.ns === 'pwsh-sandbox') ? 'pwsh-sandbox' : 'bash-sandbox';
        add(ns, 'timeoutMs', '命令超时（毫秒）', { help: '单条命令允许运行多久，超时即终止。' });
        add(ns, 'maxOutputBytes', '单流输出上限（字节）', { help: '超出部分会转存到临时文件，而不是被丢弃。' });
    }
    else if (id === 'translation') {
        const labels = { bing: 'Bing', google: 'Google', 'deepseek-account': 'DeepSeek Flash · 账号（付费）', 'deepseek-official': 'DeepSeek Flash · 官方 API（付费）' };
        let providers = [];
        try {
            const c = service(host, 'cotTranslation', ['limits']);
            const data = c && await c.limits(signal);
            if (Array.isArray(data?.availableProviders))
                providers = data.availableProviders.filter((p) => typeof p === 'string' && Object.hasOwn(labels, p));
        }
        catch { /* unavailable stays uneditable */ }
        add('cot-translation', 'provider', '翻译服务', { options: providers.map(value => ({ label: labels[value], value })) });
        add('cot-translation', 'targetLanguage', '目标语言', { help: 'auto 使用界面语言；也可填写语言代码，例如 zh、en、ja' });
        result.notices = ['展开的思考内容会发送给所选翻译服务，可能包含私有代码或对话细节。', 'DeepSeek 翻译按所选账号或官方 API 凭据计费；Bing 和 Google 匿名接口可能拒绝或限制请求。'];
    }
    else if (id === 'speech') {
        result.saveMode = 'immediate';
        try {
            result.speech = await speechView(host);
        }
        catch { /* unavailable means no active controls */ }
        result.notices = ['输入设备由各客户端在本地选择；电脑麦克风请在电脑端设置。识别服务和语言即时保存到电脑。', '下载及准备任务由电脑管理，离开此页面不会取消。'];
    }
    else if (id === 'cua') {
        result.saveMode = 'immediate';
        try {
            result.cua = await cuaView(host, forms);
        }
        catch { /* unavailable */ }
        result.notices = ['系统权限仍需在电脑上授权；这里只显示电脑实际状态。', '设为默认 PTC 仅影响随后新建会话。开启持久执行会保留运行时内存；撤销应用权限会停止受影响的操作，已完成的输入无法撤销。'];
    }
    else {
        result.saveMode = 'none';
        result.notices = [];
    }
    signal.throwIfAborted();
    return result;
}
