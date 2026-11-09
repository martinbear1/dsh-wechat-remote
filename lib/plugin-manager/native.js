import { createHash } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { formSection, localized, plain, validateOperations } from './schema.js';
import { builtinCards, catalogPolicy, visibleBundles } from './catalog.js';
import { presentation, pageKind, effective, hasModelRouteSchema, route, routeKey, service, speechView, cuaView, webCredentialRef, credentialRevision } from './presentation.js';
export class PluginAdapterError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function fail(code, message) { throw new PluginAdapterError(code, message); }
const revision = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Cordis exposes fresh contextual proxies; compare native identity, but continue calling the contextual service.
const identity = (value) => value && (Reflect.get(value, symbols.original) ?? value);
/** The transport plugin must not disable itself or rewrite its authentication/configuration through its own channel. */
const transportModule = (name) => typeof name === 'string' && /^(?:@harness-remote\/dsh-wechat-remote(?:\/|$)|dsh-wechat-remote(?:\/|$))/.test(name);
// These Host declarations drive another Client/application's preferences, not a remote-manager setting.
// Do not reject all client-* packages: e.g. cot-translation's bare Host export owns genuine live settings.
const clientModule = (name) => ['client-locale', 'client-product-analytics', 'client-ui-settings-account',
    'client-ui-theme', 'client-ui-settings', 'client-ui-settings-general', 'client-ui-conversation', 'client-ui-chat']
    .some(module => name === '@deepseek-ai/dsh-' + module);
const identifier = (v) => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\u0000-\u001f]/u.test(v);
export function pluginError(error) {
    if (error instanceof PluginAdapterError)
        return { code: error.code, message: error.message };
    if (error?.code === 'SETTINGS_CONFLICT')
        return { code: 'settings_conflict', message: '设置已在其他端修改，请刷新后再保存。' };
    return { code: 'native_operation_failed', message: 'DSH 未能完成此操作，请刷新核对当前状态或到电脑端查看。' };
}
export class NativePluginManager {
    host;
    mutations = Promise.resolve();
    constructor(host) {
        this.host = host;
    }
    manager() {
        const service = this.host.get('pluginManager');
        if (!plain(service) || !['listBundles', 'listPlugins', 'setBundleEnabled', 'setPluginEnabled'].every(k => typeof service[k] === 'function'))
            return;
        return service;
    }
    settings() {
        const service = this.host.get('settings');
        if (!plain(service) || typeof service.describe !== 'function' || typeof service.mutate !== 'function')
            return;
        return service;
    }
    status() {
        const manager = this.manager(), settings = this.settings(), supported = !!manager;
        return { supported, protocolVersion: 1, capabilities: { toggle: supported, install: supported && typeof manager.installBundle === 'function', config: supported && !!settings, pageConfig: supported && !!settings }, ...(!supported ? { reason: '当前 DSH 未提供兼容的原生插件管理接口。' } : {}) };
    }
    async snapshot() {
        const manager = this.manager();
        if (!manager)
            fail('native_unavailable', '当前 DSH 未提供兼容的原生插件管理接口。');
        const [bundles, plugins] = await Promise.all([manager.listBundles(), manager.listPlugins()]);
        if (!Array.isArray(bundles) || !Array.isArray(plugins) || bundles.length > 2000 || plugins.length > 10000
            || bundles.some(b => !plain(b) || !identifier(b.name) || typeof b.enabled !== 'boolean')
            || plugins.some(p => !plain(p) || !identifier(p.entryId) || !identifier(p.moduleName) || typeof p.enabled !== 'boolean'))
            fail('native_unavailable', '原生插件目录格式暂不兼容。');
        let forms = [];
        let settingsUnavailable = false;
        const settings = this.settings();
        if (settings) {
            try {
                const result = await settings.describe({ redactSecrets: true });
                if (Array.isArray(result))
                    forms = result.filter(x => plain(x) && identifier(x.ns) && plain(x.schema)
                        && Number.isSafeInteger(x.revision) && x.revision >= 0 && x.applies === 'live').slice(0, 2000);
                else
                    settingsUnavailable = true;
            }
            catch {
                // A third-party configuration failure must not hide the native catalog
                // or block disabling that plugin. No stale/cached forms are exposed.
                settingsUnavailable = true;
            }
        }
        if (identity(this.manager()) !== identity(manager) || identity(this.settings()) !== identity(settings))
            fail('native_unavailable', '插件管理接口正在重载，请刷新后再操作。');
        const policy = await catalogPolicy(this.host.get('profileContext'), bundles);
        if (identity(this.manager()) !== identity(manager) || identity(this.settings()) !== identity(settings))
            fail('native_unavailable', '插件管理接口正在重载，请刷新后再操作。');
        return { bundles, plugins, forms, manager, settings, settingsUnavailable, policy, builtins: builtinCards(plugins, forms), visible: visibleBundles(bundles, plugins, policy) };
    }
    protectedRow(row, snapshot) {
        // The published installer rewrites component modules to native file: URLs.
        // Use the native bundle's ownership records, not a path substring guess,
        // so direct plugin:entryId/config requests cannot disable our carrier.
        return !!row.readOnlyReason || transportModule(row.moduleName)
            || snapshot.bundles.some(bundle => transportModule(bundle.name)
                && ((bundle.rows || []).some((r) => r.entryId === row.entryId)
                    || (bundle.overrides || []).some((id) => id === row.patchId || id === row.entryId)));
    }
    protectedBundle(bundle, snapshot) {
        return !!bundle.readOnlyReason || transportModule(bundle.name) || (bundle.rows || []).some((r) => transportModule(r.moduleName)
            || snapshot.plugins.some(p => p.entryId === r.entryId && this.protectedRow(p, snapshot)))
            || (bundle.overrides || []).some((id) => snapshot.plugins.some(p => (p.patchId === id || p.entryId === id) && this.protectedRow(p, snapshot)));
    }
    item(row, kind, snapshot) {
        const name = kind === 'bundle' ? row.name : row.moduleName;
        const builtin = kind === 'plugin' ? snapshot.builtins.find(card => card.rows.includes(row)) : undefined;
        const owner = kind === 'plugin' ? snapshot.visible.find(b => (b.rows || []).some((r) => r.entryId === row.entryId) || (b.overrides || []).includes(row.patchId)) : undefined;
        const hidden = kind === 'bundle' ? !snapshot.visible.includes(row) : !builtin && !owner;
        const locked = kind === 'bundle' ? this.protectedBundle(row, snapshot) : this.protectedRow(row, snapshot);
        // UI section, not the upstream Experimental badge: all native optional
        // official offers (including Codex/Claude) belong to the optional page.
        const category = builtin ? 'official' : (kind === 'bundle' ? row.official : owner?.official) === true ? 'experimental' : 'third-party';
        const available = kind === 'plugin' || row.availability !== 'missing';
        return { id: `${kind}:${kind === 'bundle' ? row.name : row.entryId}`, kind, name, title: builtin?.title || localized(row.meta?.title, name), description: localized(row.meta?.description, row.description || ''), category,
            enabled: row.enabled, ...(row.version ? { version: row.version } : {}), ...(row.availability ? { availability: row.availability } : {}),
            builtin: !!builtin, iconKey: builtin?.iconKey || 'plugin',
            ...(kind === 'plugin' && ['pending', 'loading', 'active', 'failed', 'unloading'].includes(row.fiberPhase) ? { runtimeState: row.fiberPhase } : {}),
            canToggle: !locked && !hidden && !builtin && available && (!owner || owner.enabled) && (!row.error || row.enabled),
            canInstall: !locked && !hidden && !available && !row.error && row.official === true && typeof row.installTarget?.spec === 'string' && this.status().capabilities.install,
            ...(locked ? { readOnlyReason: transportModule(name) ? 'remote-connection-required' : row.readOnlyReason || 'remote-connection-required' } : builtin ? { readOnlyReason: 'host-settings' } : hidden ? { readOnlyReason: 'not-in-native-catalog' } : !available ? { readOnlyReason: 'not-installed' } : row.error ? { readOnlyReason: row.error.code || 'native-error' } : {}),
            revision: revision([row.name ?? row.entryId, row.enabled, row.version, row.availability, row.readOnlyReason, row.rows, row.overrides, hidden, builtin?.title]) };
    }
    target(input, snapshot) {
        if (!identifier(input.id))
            fail('invalid_request', '插件标识无效。');
        const bundle = snapshot.bundles.find(b => `bundle:${b.name}` === input.id);
        const row = bundle || snapshot.plugins.find(p => `plugin:${p.entryId}` === input.id);
        if (!row)
            fail('not_found', '此插件已不在当前目录中，请刷新。');
        const kind = bundle ? 'bundle' : 'plugin';
        const builtin = bundle ? undefined : snapshot.builtins.find(card => card.rows.includes(row));
        const rows = bundle ? snapshot.plugins.filter(p => (bundle.rows || []).some((r) => r.entryId === p.entryId)
            || (bundle.overrides || []).some((id) => p.patchId === id || p.entryId === id)) : builtin?.rows || [row];
        return { row, kind: kind, rows, item: this.item(row, kind, snapshot) };
    }
    sections(rows, snapshot) {
        const settings = this.settings();
        return rows.filter(row => !clientModule(row.moduleName) && this.item(row, 'plugin', snapshot).readOnlyReason !== 'not-in-native-catalog').flatMap(row => snapshot.forms.filter(v => row.patchId === v.ns).map(view => {
            const section = formSection(view, localized(row.meta?.title, row.moduleName), settings?.writable !== false && !this.protectedRow(row, snapshot));
            if (view.ns === 'cot-translation') {
                const provider = section.fields.find(field => field.path.length === 1 && field.path[0] === 'provider');
                if (provider)
                    provider.description = '翻译会将选中的思考文本交给该服务；DeepSeek 翻译可能产生费用。这里修改宿主设置，不会立即翻译。';
            }
            return section;
        }));
    }
    async control(action, value, signal) {
        signal.throwIfAborted();
        if (!plain(value))
            fail('invalid_request', '请求格式无效。');
        if (action === 'status')
            return this.status();
        if (!['list', 'detail', 'set-enabled', 'write-config', 'write-page', 'official-action', 'install'].includes(action))
            fail('operation_unavailable', '当前插件管理操作不受支持。');
        if (['set-enabled', 'write-config', 'write-page', 'official-action', 'install'].includes(action)) {
            const run = this.mutations.catch(() => undefined).then(() => this.execute(action, value, signal));
            this.mutations = run.then(() => undefined, () => undefined);
            return run;
        }
        return this.execute(action, value, signal);
    }
    async execute(action, input, signal) {
        signal.throwIfAborted();
        const snapshot = await this.snapshot();
        signal.throwIfAborted();
        if (action === 'list') {
            return { protocolVersion: 1, catalogVersion: 2, items: [...snapshot.builtins.map(card => this.item(card.row, 'plugin', snapshot)),
                    ...snapshot.visible.map(b => this.item(b, 'bundle', snapshot))] };
        }
        const target = this.target(input, snapshot), { item, rows, row, kind } = target;
        if (action === 'detail') {
            const sections = this.sections(rows, snapshot);
            const page = await presentation(this.host, item, sections, snapshot.forms, signal);
            if (identity(this.manager()) !== identity(snapshot.manager) || identity(this.settings()) !== identity(snapshot.settings))
                fail('native_unavailable', '插件管理接口正在重载，请刷新。');
            const desktopOnly = sections.length === 0 || sections.some(s => s.customPage || s.unsupported.length > 0);
            return { item, rows: item.builtin ? [] : rows.map(r => this.item(r, 'plugin', snapshot)), sections, desktopOnly, ...(page ? { presentation: page } : {}),
                ...(desktopOnly ? { desktopReason: snapshot.settingsUnavailable
                        ? '电脑暂时无法读取原生设置，配置编辑已停用；插件目录和可用开关仍可操作，请在电脑端检查后刷新。'
                        : '自定义页面、设备授权及未提供通用表单的功能需在电脑端使用；这里可管理已提供的原生设置。' } : {}) };
        }
        const manager = this.manager();
        if (!manager || identity(manager) !== identity(snapshot.manager))
            fail('native_unavailable', '原生插件管理接口已停用或重载，请刷新。');
        if (action === 'write-page')
            return this.writePage(input, item, rows, snapshot, signal);
        if (action === 'official-action') {
            if (pageKind(item) === 'cua') {
                if (!item.enabled || this.protectedBundle(row, snapshot) || input.confirm !== true)
                    fail('operation_unavailable', '请确认本次电脑操作设置。');
                const controller = service(this.host, 'cuaAccess', ['ptcConfiguration']), current = await cuaView(this.host, snapshot.forms);
                if (!controller || !current || input.expectedRevision !== current.revision)
                    fail('settings_conflict', '电脑操作设置已变化，请刷新核对。');
                signal.throwIfAborted();
                if (identity(this.manager()) !== identity(snapshot.manager) || identity(service(this.host, 'cuaAccess', ['ptcConfiguration'])) !== identity(controller))
                    fail('native_unavailable', '电脑操作服务正在重载。');
                if (input.operation === 'cua-persistent') {
                    if (!current.writable || current.persistent)
                        fail('operation_unavailable', '当前执行模式无需修改或不可编辑。');
                    await controller.enablePersistentPtc();
                }
                else if (input.operation === 'cua-default-preset') {
                    if (!current.defaultPreset?.writable || current.defaultPreset.isPtc || input.presetRevision !== current.defaultPreset.revision)
                        fail('settings_conflict', '默认预设不可编辑或已变化，请刷新。');
                    const settings = this.settings();
                    if (!settings || identity(settings) !== identity(snapshot.settings))
                        fail('native_unavailable', '原生设置正在重载。');
                    // This is the one cross-namespace button explicitly owned by the native CUA page.
                    await settings.mutate('agent-preset-registry', [{ op: 'set', path: ['selectedDefault'], value: 'ptc' }], input.presetRevision);
                }
                else if (input.operation === 'cua-revoke') {
                    if (!current.canRevoke || !current.applications?.allowedApps.some(a => a.id === input.applicationId))
                        fail('operation_unavailable', '该应用没有可撤销的持久授权。');
                    await controller.revoke(input.applicationId);
                }
                else if (input.operation === 'cua-retry-approval') {
                    if (!current.canRetryApproval || !current.applications?.blockedApps.some(a => a.id === input.applicationId))
                        fail('operation_unavailable', '该应用没有可重新请求的记录。');
                    await controller.retryApproval(input.applicationId);
                }
                else
                    fail('operation_unavailable', '此电脑操作设置不可用。');
                return { changed: true, application: 'applied' };
            }
            if (pageKind(item) !== 'speech' || !item.enabled || this.protectedBundle(row, snapshot))
                fail('operation_unavailable', '此插件没有可用的原生操作。');
            const controller = service(this.host, 'speechController', ['catalog']);
            const current = await speechView(this.host);
            if (!controller || !current || input.expectedRevision !== current.revision)
                fail('settings_conflict', '语音服务选择已变化，请刷新后重试。');
            signal.throwIfAborted();
            if (identity(this.manager()) !== identity(snapshot.manager) || identity(service(this.host, 'speechController', ['catalog'])) !== identity(controller))
                fail('native_unavailable', '语音服务正在重载，请刷新。');
            if (input.operation === 'speech-configure') {
                const patch = input.patch;
                if (!current.canConfigure || !plain(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => !['providerId', 'language'].includes(k)))
                    fail('invalid_settings', '语音设置无效。');
                const provider = current.providers.find(p => p.id === (patch.providerId ?? current.selection.providerId));
                if (!provider || patch.language !== undefined && !provider.languages.includes(patch.language))
                    fail('invalid_settings', '请选择当前可用的识别服务和语言。');
                await controller.configure(patch);
            }
            else {
                const provider = current.providers.find(p => p.id === input.providerId);
                if (!provider)
                    fail('invalid_settings', '此识别服务已不可用。');
                if (input.operation === 'speech-prepare') {
                    if (!current.canPrepare || !['unprepared', 'cancelled', 'failed'].includes(provider.preparation.phase))
                        fail('operation_unavailable', '当前状态无需重新准备。');
                    if (input.downloadSource !== undefined && (typeof input.downloadSource !== 'string' || !provider.downloadSources?.includes(input.downloadSource)))
                        fail('invalid_settings', '请选择服务提供的下载源。');
                    await controller.prepare(provider.id, input.downloadSource === undefined ? undefined : { downloadSource: input.downloadSource });
                }
                else if (input.operation === 'speech-cancel') {
                    if (!current.canCancel || !['downloading', 'checking', 'loading'].includes(provider.preparation.phase))
                        fail('operation_unavailable', '当前没有可取消的准备任务。');
                    await controller.cancelPreparation(provider.id);
                }
                else
                    fail('operation_unavailable', '此原生操作不可用。');
            }
            return { changed: true, application: 'applied' };
        }
        if (action === 'write-config') {
            if (snapshot.settingsUnavailable)
                fail('settings_unavailable', '电脑暂时无法读取原生设置，本次未写入；请在电脑端检查后刷新。');
            if (!identifier(input.ns) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
                fail('invalid_request', '请刷新设置后再保存。');
            const section = this.sections(rows, snapshot).find(s => s.ns === input.ns);
            if (!section?.writable)
                fail('read_only', '该插件的设置不能在小程序中修改。');
            if (input.expectedRevision !== section.revision)
                fail('settings_conflict', '设置已在其他端修改，请刷新后再保存。');
            try {
                validateOperations(section, input.ops);
            }
            catch (error) {
                fail('invalid_settings', error.message);
            }
            // Older mobile versions can render the boolean but not the object-route
            // selector. Keep the native invariant on this legacy endpoint as well.
            if (pageKind(item) === 'subagent' && input.ns === 'subagent-model-selection-settings'
                && effective(snapshot.forms, [input], input.ns, ['enabled']) === true) {
                const models = effective(snapshot.forms, [input], input.ns, ['allowedModels']);
                if (!Array.isArray(models) || !models.length || !models.every(route))
                    fail('invalid_settings', '保存前请至少选择一个模型；请使用支持模型选择的新小程序或电脑端。');
            }
            signal.throwIfAborted();
            // Native mutate applies path operations under configEditor.edit's own revision check.
            // Never replace the redacted section or persist our own profile-file interpretation.
            const settings = this.settings();
            if (!settings || identity(settings) !== identity(snapshot.settings))
                fail('native_unavailable', '原生设置接口已停用或重载，请刷新。');
            await settings.mutate(input.ns, input.ops, input.expectedRevision);
            return { changed: true, application: 'applied' };
        }
        if (input.expectedRevision !== item.revision)
            fail('plugin_conflict', '插件状态已变化，请刷新后再操作。');
        if (action === 'set-enabled') {
            if (typeof input.enabled !== 'boolean')
                fail('invalid_request', '插件开关值无效。');
            if (!item.canToggle)
                fail('read_only', '为保持远程连接或遵循宿主限制，此插件需在电脑端管理。');
            signal.throwIfAborted();
            return kind === 'bundle' ? manager.setBundleEnabled(row.name, input.enabled) : manager.setPluginEnabled(row.entryId, input.enabled);
        }
        if (!item.canInstall || input.confirm !== true || typeof manager.installBundle !== 'function')
            fail('operation_unavailable', '仅可在确认后安装宿主提供的官方插件。');
        signal.throwIfAborted();
        // No supplied spec, shell command, path, registry or build-script approvals are accepted here.
        return manager.installBundle(row.installTarget.spec, { enabled: true });
    }
    async writePage(input, item, rows, snapshot, signal) {
        if (snapshot.settingsUnavailable)
            fail('settings_unavailable', '电脑暂时无法读取设置，本次未写入。');
        if (!Array.isArray(input.sections) || input.sections.length > 30 || input.sections.length === 0 && input.credential === undefined)
            fail('invalid_request', '请选择要保存的设置。');
        const sections = this.sections(rows, snapshot), page = await presentation(this.host, item, sections, snapshot.forms, signal);
        const kind = pageKind(item), changes = input.sections, seen = new Set();
        const appliedNamespaces = [];
        let failedNamespace;
        // All submitted namespaces, paths and revisions are preflighted before the first write.
        // Native CAS still checks again under each configuration transaction. This is not atomic across namespaces.
        try {
            for (const change of changes) {
                if (!plain(change) || !identifier(change.ns) || seen.has(change.ns) || !Number.isSafeInteger(change.expectedRevision) || Object.keys(change).some(k => !['ns', 'expectedRevision', 'ops'].includes(k)))
                    fail('invalid_request', '设置分组格式无效。');
                seen.add(change.ns);
                failedNamespace = change.ns;
                const section = sections.find(s => s.ns === change.ns);
                if (!section?.writable)
                    fail('read_only', '该插件的设置不能在小程序中修改。');
                if (change.expectedRevision !== section.revision)
                    fail('settings_conflict', '设置已在其他端修改，请刷新后再保存。');
                if (!Array.isArray(change.ops) || change.ops.length < 1 || change.ops.length > 100 || new Set(change.ops.map((o) => JSON.stringify(o?.path))).size !== change.ops.length)
                    fail('invalid_settings', '设置操作无效或重复。');
                const routeOps = change.ops.filter((o) => kind === 'subagent' && change.ns === 'subagent-model-selection-settings' && JSON.stringify(o?.path) === '["allowedModels"]');
                const ordinaryOps = change.ops.filter((o) => !routeOps.includes(o));
                try {
                    if (ordinaryOps.length)
                        validateOperations(section, ordinaryOps);
                }
                catch (e) {
                    fail('invalid_settings', e.message);
                }
                // Audited pages only accept controls that their actual native page exposes. Generic third-party pages retain their schema contract.
                for (const op of ordinaryOps)
                    if (page && kind !== 'native-summary') {
                        const field = page.fields.find(f => f.ns === change.ns && JSON.stringify(f.path) === JSON.stringify(op.path));
                        const webSelection = kind === 'web-search' && change.ns === 'web' && ['searchProvider', 'fetchProvider'].includes(op.path[0]) && op.path.length === 1 && page.web?.switchAvailable;
                        if (!field && !webSelection)
                            fail('read_only', '该字段不属于此原生配置页面。');
                        if (op.op === 'set' && field) {
                            if (field.integer && !Number.isInteger(op.value) || typeof op.value === 'number' && (field.minimum !== undefined && op.value < field.minimum || field.maximum !== undefined && op.value > field.maximum))
                                fail('invalid_settings', `${field.title}的数值无效。`);
                            if (field.options && !field.options.some(x => x.value === op.value))
                                fail('invalid_settings', '请选择当前可用的选项。');
                        }
                    }
                for (const op of routeOps) {
                    const form = snapshot.forms.find(f => f.ns === change.ns);
                    if (!hasModelRouteSchema(form) || !page?.models || Object.keys(op).some(k => !['op', 'path', 'value'].includes(k)) || !['set', 'unset'].includes(op.op) || op.op === 'unset' && Object.hasOwn(op, 'value'))
                        fail('read_only', '当前模型选择配置不能编辑。');
                    if (op.op === 'set' && (!Array.isArray(op.value) || op.value.length > 1000 || !op.value.every(route) || new Set(op.value.map(routeKey)).size !== op.value.length))
                        fail('invalid_settings', '模型选择格式无效。');
                    if (op.op === 'set')
                        for (const r of op.value)
                            if (!page.models.candidates.some(c => c.key === routeKey(r)))
                                fail('invalid_settings', '模型目录已变化，请刷新后重新选择。');
                }
            }
            if (kind === 'subagent' && effective(snapshot.forms, changes, 'subagent-model-selection-settings', ['enabled']) === true) {
                const models = effective(snapshot.forms, changes, 'subagent-model-selection-settings', ['allowedModels']);
                if (!Array.isArray(models) || !models.length || !models.every(route))
                    fail('invalid_settings', '保存前请至少选择一个模型。');
            }
            if (kind === 'web-search' && seen.has('web')) {
                const search = effective(snapshot.forms, changes, 'web', ['searchProvider']), fetch = effective(snapshot.forms, changes, 'web', ['fetchProvider']);
                if (!((search === 'deepseek-search-api' && fetch === 'deepseek-fetch-api') || (search === 'deepseek-official' && fetch === 'http')))
                    fail('invalid_settings', '搜索与抓取提供方必须按原生开关一起选择。');
            }
            if (kind === 'translation' && seen.has('cot-translation')) {
                const language = effective(snapshot.forms, changes, 'cot-translation', ['targetLanguage']);
                if (typeof language !== 'string' || !/^(?:auto|[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*)$/.test(language))
                    fail('invalid_settings', '请填写 auto 或语言代码，例如 zh、en、ja。');
            }
            let credential;
            if (input.credential !== undefined) {
                failedNamespace = '$credential';
                if (kind !== 'web-search' || !plain(input.credential) || Object.keys(input.credential).some(k => !['value', 'expectedRevision'].includes(k)) || typeof input.credential.value !== 'string' || !input.credential.value.trim() || input.credential.value.length > 16384)
                    fail('invalid_settings', '请输入新的 API Key；留空时应保持原密钥。');
                if (input.credential.expectedRevision !== credentialRevision(snapshot.forms))
                    fail('settings_conflict', '搜索凭据配置已变化，请刷新后再保存。');
                const controller = service(this.host, 'credentialsController', ['describe', 'set']), ref = webCredentialRef(snapshot.forms, changes);
                const info = controller && (await controller.describe([ref]))?.[ref];
                if (!controller || info?.writable !== true || !sections.some(s => s.writable))
                    fail('read_only', '当前凭据不能在小程序中修改。');
                credential = { controller, ref, value: input.credential.value };
            }
            const order = kind === 'web-search' ? ['web-search-deepseek', 'web-deepseek-api', '$credential', 'web'] : kind === 'subagent' ? ['subagent-model-selection-settings', 'subagent'] : [];
            const jobs = [...changes.map(change => ({ ns: change.ns, change })), ...(credential ? [{ ns: '$credential', change: undefined }] : [])]
                .sort((a, b) => (order.indexOf(a.ns) < 0 ? 100 : order.indexOf(a.ns)) - (order.indexOf(b.ns) < 0 ? 100 : order.indexOf(b.ns)));
            for (const job of jobs) {
                failedNamespace = job.ns;
                signal.throwIfAborted();
                const settings = this.settings();
                if (!settings || identity(settings) !== identity(snapshot.settings) || identity(this.manager()) !== identity(snapshot.manager))
                    fail('native_unavailable', '原生设置接口正在重载，请刷新核对已保存的部分。');
                if (job.change)
                    await settings.mutate(job.ns, job.change.ops, job.change.expectedRevision);
                else {
                    if (!credential || identity(service(this.host, 'credentialsController', ['describe', 'set'])) !== identity(credential.controller))
                        fail('native_unavailable', '凭据接口正在重载。');
                    // Re-observe the chosen credential reference after preceding namespace writes.
                    // Credentials has no CAS of its own; never intentionally route a new secret through a stale Settings reference.
                    const fresh = await settings.describe({ redactSecrets: true });
                    if (!Array.isArray(fresh) || webCredentialRef(fresh, changes) !== credential.ref
                        || fresh.find(f => f.ns === 'web')?.revision !== snapshot.forms.find(f => f.ns === 'web')?.revision)
                        fail('settings_conflict', '搜索提供方或凭据引用已变化，请刷新后再保存密钥。');
                    signal.throwIfAborted();
                    if (identity(this.settings()) !== identity(settings) || identity(service(this.host, 'credentialsController', ['describe', 'set'])) !== identity(credential.controller))
                        fail('native_unavailable', '设置或凭据接口正在重载。');
                    await credential.controller.set(credential.ref, credential.value);
                }
                appliedNamespaces.push(job.ns);
            }
            return { changed: appliedNamespaces.length > 0, application: 'applied', appliedNamespaces };
        }
        catch (error) {
            return { changed: appliedNamespaces.length > 0, application: appliedNamespaces.length ? 'partial' : 'failed', appliedNamespaces, failedNamespace, error: pluginError(error) };
        }
    }
}
