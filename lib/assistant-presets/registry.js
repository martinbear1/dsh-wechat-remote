import { randomBytes } from 'node:crypto';
import { copy, exact, fail, identifier, row, StateQueue, version } from '../human-workflow/data.js';
import { assistantDefinition, definitionDigest } from './definition.js';
import { assistantTemplates } from './catalog.js';
import { validateNativeAssistantPreview } from './native-adapter.js';
import { builtinAssistant, builtinAssistants } from './builtins.js';
export class AssistantRegistry {
    state;
    nodeId;
    native;
    assertIdentity;
    now;
    tail = Promise.resolve();
    settle = new AbortController().signal;
    stopped = false;
    builtinStates = [];
    resourceDefinitions = new Map();
    resourceStates = [];
    constructor(state, nodeId, native, assertIdentity, now) {
        this.state = state;
        this.nodeId = nodeId;
        this.native = native;
        this.assertIdentity = assertIdentity;
        this.now = now;
    }
    static async open(store, options) {
        if (!identifier(options.nodeId))
            throw fail('assistant-node-invalid', '节点身份无效');
        const raw = await store.load();
        const ledger = raw === undefined ? { schema: 'human.assistants.v1', nodeId: options.nodeId, entries: [], previews: [] } : validateLedger(raw, options.nodeId);
        const registry = new AssistantRegistry(new StateQueue(store, ledger), options.nodeId, options.native, options.assertIdentity, options.now || Date.now);
        // Initialization must not await a component waiting for the host Loader.
        // The first real query/work call rechecks fully settled native availability.
        await registry.readBuiltins(new AbortController().signal, false);
        await registry.readResources(new AbortController().signal, false);
        return registry;
    }
    /** Read immutable local definitions even with the resource component off, so
     * restoring business notes never depends on loading a native Agent scope. */
    async readResources(signal, waitForReady = true) {
        const definitions = await this.native.resourceDefinitions?.(signal) || [];
        this.check(signal);
        for (const value of definitions) {
            const definition = assistantDefinition(value.definition);
            if (!/^resource_[a-f0-9]{64}$/.test(value.id) || value.version !== 1 || value.source !== 'resource'
                || !/^hr-resource-[a-z0-9][a-z0-9._-]*-[a-f0-9]{12}$/.test(value.presetId)
                || value.presetId.length > 128 || value.digest !== definitionDigest(definition))
                throw fail('assistant-resource-invalid', '本地资源助手规格无效，请在我的资源中核对。');
            const prior = this.resourceDefinitions.get(value.id);
            if (prior && (prior.digest !== value.digest || prior.presetId !== value.presetId))
                throw fail('assistant-resource-invalid', '本地资源版本内容发生变化，请核对资源包。');
            this.resourceDefinitions.set(value.id, copy({ ...value, definition }));
        }
        let observed = [];
        try {
            observed = await this.native.resources?.(signal, { waitForReady }) || [];
        }
        catch {
            this.check(signal);
        }
        this.check(signal);
        this.resourceStates = [...this.resourceDefinitions.values()].map(definition => {
            const current = observed.find(item => item.id === definition.id && item.version === definition.version && item.digest === definition.digest
                && item.presetId === definition.presetId && item.source === 'resource' && ['installed', 'unknown'].includes(item.state)
                && ['installed', 'disabled', 'unknown'].includes(item.nativeState) && (item.state === 'installed') === (item.nativeState === 'installed'));
            return { ...definition, state: current?.state || 'unknown', nativeState: current?.nativeState || 'disabled',
                ...(current?.reason ? { reason: current.reason } : {}) };
        });
    }
    async readBuiltins(signal, waitForReady = true) {
        if (!this.native.builtins)
            return;
        let results = [];
        try {
            results = await this.native.builtins(signal, { waitForReady });
        }
        catch {
            this.check(signal);
        }
        this.check(signal);
        this.builtinStates = builtinAssistants().map(definition => {
            const observed = results.find(item => item.id === definition.id && item.version === definition.version && item.digest === definition.digest
                && item.presetId === definition.presetId && item.source === 'builtin' && ['installed', 'unknown'].includes(item.state)
                && ['installed', 'disabled', 'stale', 'unknown'].includes(item.nativeState) && (item.state === 'installed') === (item.nativeState === 'installed'));
            return { ...definition, source: 'builtin', state: observed?.state || 'unknown', nativeState: observed?.nativeState || 'unknown',
                ...(typeof observed?.enabled === 'boolean' ? { enabled: observed.enabled } : {}),
                ...(observed?.reason ? { reason: observed.reason } : observed ? {} : { reason: '内置助手状态尚未核实。' }) };
        });
    }
    check(signal) { if (this.stopped)
        throw fail('assistant-disabled', '助手功能已关闭'); signal?.throwIfAborted(); this.assertIdentity(); }
    find(id, selectedVersion) {
        if (!identifier(id) || !version(selectedVersion))
            throw fail('assistant-reference-invalid', '助手版本无效');
        const entry = this.state.current().entries.find(item => item.id === id && item.version === selectedVersion);
        if (!entry)
            throw fail('assistant-not-found', '当前节点没有这个助手版本');
        return entry;
    }
    catalog(signal) {
        const operation = this.tail.then(async () => {
            this.check(signal);
            await this.readBuiltins(signal);
            let native;
            try {
                native = await this.native.probe();
            }
            catch {
                this.check(signal);
                native = { supported: false, basePresets: [], reason: '暂时无法读取原生助手，请稍后核对。' };
            }
            this.check(signal);
            const checked = new Map();
            // The journal is installation history, never evidence of current native
            // availability. Serialize against installation and retain every old plan.
            for (const entry of this.state.current().entries.map(copy))
                if (entry.state !== 'draft') {
                    checked.set(`${entry.id}:${entry.version}`, await this.reconcile(entry, signal));
                }
            this.check(signal);
            const templates = assistantTemplates(), templatesByDigest = new Map(templates.map(t => [definitionDigest(t.definition), t.id]));
            return { schema: 'human.assistants.catalog.v1', nodeId: this.nodeId, native,
                templates: templates.map(template => {
                    const component = this.builtinStates.find(item => item.templateId === template.id);
                    return { ...template, ...(component ? { builtin: { id: component.id, version: component.version, presetId: component.presetId,
                                name: component.name, state: component.state, nativeState: component.nativeState,
                                ...(typeof component.enabled === 'boolean' ? { enabled: component.enabled } : {}), ...(component.reason ? { reason: component.reason } : {}) } } : {}) };
                }),
                drafts: [...this.builtinStates.map(item => ({ id: item.id, version: item.version, digest: item.digest, presetId: item.presetId,
                        name: item.name, description: item.definition.description, templateId: item.templateId, source: item.source,
                        state: item.state, nativeState: item.nativeState, ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
                        ...(item.reason ? { reason: item.reason } : {}) })), ...this.state.current().entries.map(e => {
                        const observed = checked.get(`${e.id}:${e.version}`);
                        const replacement = this.builtinStates.find(item => e.digest === item.sourceTemplateDigest);
                        return { id: e.id, version: e.version, digest: e.digest, name: e.definition.name,
                            description: e.definition.description, state: e.state,
                            ...(observed ? { nativeState: observed.nativeState || (observed.state === 'installed' ? 'installed' : 'unknown'), reason: observed.message || '' } : {}),
                            ...(templatesByDigest.has(e.digest) ? { templateId: templatesByDigest.get(e.digest) } : {}),
                            ...(replacement && e.plan ? { replacement: { presetId: replacement.presetId, name: replacement.name, state: replacement.state,
                                    bundleName: e.plan.bundleName, canRemoveAfterReview: replacement.state === 'installed' && observed?.nativeState === 'installed',
                                    warning: '卸载旧独立包会使依赖旧模式的会话无法继续使用该模式；聊天与资料不删除，新工作请在新会话选择内置助手。不会自动切换旧会话。' } } : {}),
                            ...(e.result?.presetId ? { presetId: e.result.presetId } : {}) };
                    })] };
        });
        this.tail = operation.catch(() => { });
        return operation;
    }
    draft(request, signal) {
        this.check(signal);
        if (!row(request) || !exact(request, [], ['templateId', 'definition', 'id', 'expectedVersion'])
            || Number(request.templateId !== undefined) + Number(request.definition !== undefined) !== 1)
            throw fail('assistant-draft-invalid', '请选择助手或提供结构化草稿');
        const template = request.templateId === undefined ? undefined : assistantTemplates().find(item => item.id === request.templateId);
        if (template && this.builtinStates.some(item => item.templateId === template.id))
            throw fail('assistant-builtin-included', '这个助手已随微信连接插件提供，无需另装独立包；请查看内置助手的状态。');
        const definition = assistantDefinition(template?.definition || request.definition);
        return this.state.update(ledger => {
            this.check(signal);
            if (ledger.entries.length >= 96)
                throw fail('assistant-capacity', '助手版本已达到本机容量上限');
            const previous = request.id === undefined ? [] : ledger.entries.filter(e => e.id === request.id);
            const latest = previous.reduce((a, b) => Math.max(a, b.version), 0);
            if (latest === Number.MAX_SAFE_INTEGER)
                throw fail('assistant-capacity', '助手版本已达到上限');
            if (request.id !== undefined && (!identifier(request.id) || !latest || request.expectedVersion !== latest)
                || request.id === undefined && request.expectedVersion !== undefined)
                throw fail('assistant-version-conflict', '助手已经变化，请重新读取后修改');
            const entry = { id: request.id || 'assistant_' + randomBytes(12).toString('hex'), version: latest + 1,
                digest: definitionDigest(definition), definition, state: 'draft', createdAt: this.now() };
            ledger.entries.push(entry);
            return entry;
        }, signal);
    }
    get(ref) {
        this.check();
        const builtin = builtinAssistant(ref.id, ref.version);
        if (builtin)
            return { ...builtin, source: 'builtin', state: this.builtinStates.find(item => item.id === builtin.id)?.state || 'unknown' };
        const resource = this.resourceDefinitions.get(ref.id);
        if (resource && ref.version === resource.version)
            return copy({ ...resource, state: this.resourceStates.find(item => item.id === ref.id)?.state || 'unknown' });
        return publicEntry(this.find(ref.id, ref.version));
    }
    async preview(ref, signal) {
        this.check(signal);
        const entry = copy(this.find(ref.id, ref.version));
        if (entry.state !== 'draft')
            throw fail('assistant-install-started', '这个版本已提交安装，请核对状态，不要重复提交');
        const presetId = `hr-assistant-${entry.id.slice(-24)}-v${entry.version}`;
        const native = validateNativeAssistantPreview(await this.native.preview({ presetId, definition: entry.definition }, signal));
        this.check(signal);
        if (native.presetId !== presetId || native.basePreset !== entry.definition.basePreset || definitionDigest(native.definition) !== entry.digest)
            throw fail('assistant-native-invalid', '宿主预览不匹配此助手');
        const preview = { id: entry.id, version: entry.version, digest: entry.digest,
            previewId: randomBytes(16).toString('hex'), expiresAt: this.now() + 10 * 60_000, native: copy(native) };
        return this.state.update(ledger => {
            this.check(signal);
            if (this.find(ref.id, ref.version).state !== 'draft')
                throw fail('assistant-install-started', '安装状态已变化');
            ledger.previews = ledger.previews.filter(p => p.expiresAt > this.now() && !(p.id === ref.id && p.version === ref.version)).slice(-31);
            ledger.previews.push(preview);
            return { id: preview.id, version: preview.version, digest: preview.digest, previewId: preview.previewId,
                expiresAt: preview.expiresAt, definition: entry.definition,
                native: { presetId: native.presetId, basePreset: native.basePreset, warnings: native.warnings } };
        }, signal);
    }
    /** Owner RPC only: tools can draft, never approve/install. A lost native
     * response is reconciled read-only; it never becomes a second installation. */
    install(request, signal) {
        const operation = this.tail.then(async () => {
            this.check(signal);
            if (!row(request) || !exact(request, ['id', 'version', 'digest', 'previewId']))
                throw fail('assistant-install-invalid', '安装确认参数无效');
            const entry = copy(this.find(request.id, request.version));
            if (entry.digest !== request.digest)
                throw fail('assistant-version-conflict', '确认内容已经变化');
            if (entry.state !== 'draft')
                return this.reconcile(entry, signal);
            const preview = this.state.current().previews.find(p => p.id === request.id && p.version === request.version
                && p.digest === request.digest && p.previewId === request.previewId && p.expiresAt > this.now());
            if (!preview)
                throw fail('assistant-preview-expired', '请重新预览此助手后再确认安装');
            const plan = copy(preview.native);
            await this.state.update(ledger => {
                this.check(signal);
                const e = ledger.entries.find(e => e.id === entry.id && e.version === entry.version);
                e.state = 'installing';
                e.plan = plan;
                ledger.previews = ledger.previews.filter(p => p.id !== e.id || p.version !== e.version);
            }, signal);
            let result;
            try {
                result = await this.native.install(plan, signal);
            }
            catch {
                result = { presetId: plan.presetId, state: 'unknown', message: '安装结果尚未确认；请检查状态，不要重复安装。' };
            }
            await this.saveResult(entry, result);
            this.check(signal);
            return { id: entry.id, version: entry.version, digest: entry.digest, ...result };
        });
        this.tail = operation.catch(() => { });
        return operation;
    }
    status(ref, signal) {
        const operation = this.tail.then(async () => {
            this.check(signal);
            const builtin = builtinAssistant(ref.id, ref.version);
            if (builtin) {
                await this.readBuiltins(signal);
                return this.builtinStates.find(item => item.id === ref.id)
                    || { ...builtin, source: 'builtin', state: 'unknown', nativeState: 'unknown', reason: '内置助手尚未就绪。' };
            }
            if (ref.id.startsWith('resource_')) {
                await this.readResources(signal);
                const resource = this.resourceStates.find(item => item.id === ref.id && item.version === ref.version);
                if (resource)
                    return resource;
            }
            return this.reconcile(copy(this.find(ref.id, ref.version)), signal);
        });
        this.tail = operation.catch(() => { });
        return operation;
    }
    /** A launch must freshly verify its exact approved plan, not trust catalog
     * cache. undefined means unmanaged; false must not fall back to defaults. */
    async verifyPreset(presetId, signal) {
        this.check(signal);
        if (this.builtinStates.some(item => item.presetId === presetId)) {
            await this.readBuiltins(signal);
            return this.builtinStates.some(item => item.presetId === presetId && item.state === 'installed');
        }
        if (presetId.startsWith('hr-resource-')) {
            await this.readResources(signal);
            const resource = this.resourceStates.find(item => item.presetId === presetId);
            return resource ? resource.state === 'installed' : undefined;
        }
        const entry = this.state.current().entries.find(e => e.plan?.presetId === presetId);
        if (!entry)
            return undefined;
        return (await this.status(entry, signal)).state === 'installed';
    }
    /** Explicit owner reinstallation starts a NEW draft and approval. Never
     * reuse historical consent, artifacts, ID or native installation receipt. */
    async redraft(ref, signal) {
        const status = await this.status(ref, signal);
        const entry = this.find(ref.id, ref.version);
        if (this.builtinStates.some(item => item.sourceTemplateDigest === entry.digest))
            throw fail('assistant-builtin-included', '此旧模式已有内置版本，请在新会话选择对应助手，无需重新安装旧包。');
        if (status.nativeState !== 'uninstalled')
            throw fail('assistant-reinstall-unavailable', '请先核对原生安装状态；仅已确认未安装的助手可以重新准备安装。');
        this.check(signal);
        return this.draft({ definition: copy(entry.definition) }, signal);
    }
    async reconcile(entry, signal) {
        if (!entry.plan)
            throw fail('assistant-not-installed', '此助手尚未提交安装');
        let result;
        try {
            result = await this.native.verify(entry.plan, signal);
            this.validateResult(entry.plan, result);
        }
        catch {
            // Native I/O failures are not evidence that the old installed flag is
            // still true. Do not expose native exceptions/paths in the public result.
            this.check(signal);
            result = { presetId: entry.plan.presetId, state: 'unknown', nativeState: 'unknown', message: '暂时无法核对这个助手的安装状态，请稍后刷新或在原生插件管理中检查。' };
        }
        this.check(signal);
        await this.saveResult(entry, result);
        this.check(signal);
        return { id: entry.id, version: entry.version, digest: entry.digest, ...result };
    }
    validateResult(plan, result) {
        if (!row(result) || !exact(result, ['presetId', 'state'], ['message', 'nativeState'])
            || result.presetId !== plan.presetId || !['installed', 'pending-restart', 'unknown'].includes(result.state)
            || result.message !== undefined && (typeof result.message !== 'string' || result.message.length > 2000)
            || result.nativeState !== undefined && !['installed', 'uninstalled', 'disabled', 'stale', 'unknown'].includes(result.nativeState)
            || result.nativeState !== undefined && (result.state === 'installed') !== (result.nativeState === 'installed'))
            throw fail('assistant-native-invalid', '宿主安装结果不匹配');
    }
    saveResult(entry, result) {
        if (!entry.plan && !this.find(entry.id, entry.version).plan)
            throw fail('assistant-native-invalid', '安装记录缺失');
        const plan = entry.plan || this.find(entry.id, entry.version).plan;
        this.validateResult(plan, result);
        // Persist only the legacy receipt shape so older releases can still open
        // this ledger. Detailed native status is always re-observed, never cached.
        const saved = { presetId: result.presetId, state: result.state, ...(result.message === undefined ? {} : { message: result.message }) };
        const prior = this.find(entry.id, entry.version);
        if (prior.state === (result.state === 'installed' ? 'installed' : 'unknown') && JSON.stringify(prior.result) === JSON.stringify(saved))
            return Promise.resolve();
        return this.state.update(ledger => {
            const e = ledger.entries.find(e => e.id === entry.id && e.version === entry.version);
            e.result = copy(saved);
            e.state = result.state === 'installed' ? 'installed' : 'unknown';
        }, this.settle);
    }
    installedForPreset(presetId) {
        this.check();
        const builtin = this.builtinStates.find(item => item.presetId === presetId && item.state === 'installed');
        if (builtin)
            return copy(builtin);
        const resource = this.resourceStates.find(item => item.presetId === presetId && item.state === 'installed');
        if (resource)
            return copy(resource);
        const entry = this.state.current().entries.find(e => e.state === 'installed' && e.result?.presetId === presetId);
        return entry ? publicEntry(entry) : undefined;
    }
    async close() { this.stopped = true; await this.tail; await this.state.close(); }
}
/** Never expose the native base document/patch, host path or install receipt to
 * a model or remote UI. Those are private adapter reconciliation data. */
function publicEntry(e) {
    return copy({ id: e.id, version: e.version, digest: e.digest, definition: e.definition, state: e.state,
        ...(e.result?.presetId ? { presetId: e.result.presetId } : {}) });
}
function validateLedger(value, nodeId) {
    const invalid = () => fail('assistant-store-invalid', '助手账本无效或不属于当前节点，未覆盖原文件');
    if (!row(value) || !exact(value, ['schema', 'nodeId', 'entries', 'previews']) || value.schema !== 'human.assistants.v1' || value.nodeId !== nodeId
        || !Array.isArray(value.entries) || value.entries.length > 96 || !Array.isArray(value.previews) || value.previews.length > 32)
        throw invalid();
    const seen = new Set();
    for (const e of value.entries) {
        if (!row(e) || !exact(e, ['id', 'version', 'digest', 'definition', 'state', 'createdAt'], ['plan', 'result']) || !identifier(e.id) || !version(e.version)
            || seen.has(`${e.id}:${e.version}`) || !['draft', 'installing', 'installed', 'unknown'].includes(String(e.state))
            || !Number.isSafeInteger(e.createdAt) || Number(e.createdAt) < 0 || e.digest !== definitionDigest(assistantDefinition(e.definition)))
            throw invalid();
        if (!/^assistant_[a-f0-9]{24}$/.test(String(e.id)))
            throw invalid();
        if (e.state === 'draft' && (e.plan !== undefined || e.result !== undefined))
            throw invalid();
        if (e.state !== 'draft') {
            const plan = validateNativeAssistantPreview(e.plan);
            if (definitionDigest(plan.definition) !== e.digest || plan.presetId !== `hr-assistant-${String(e.id).slice(-24)}-v${e.version}`)
                throw invalid();
            if (e.result !== undefined && (!row(e.result) || !exact(e.result, ['presetId', 'state'], ['message']) || e.result.presetId !== plan.presetId
                || !['installed', 'pending-restart', 'unknown'].includes(String(e.result.state)) || e.result.message !== undefined && typeof e.result.message !== 'string'))
                throw invalid();
        }
        if (e.state === 'installed' && (!row(e.result) || e.result.state !== 'installed' || e.result.presetId !== e.plan?.presetId))
            throw invalid();
        seen.add(`${e.id}:${e.version}`);
    }
    // Previews never survive process restart. A previous UI must re-read the
    // live native base and obtain a fresh explicit confirmation.
    return { ...copy(value), previews: [] };
}
