import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { COLLABORATION_COMPONENT_ID, nativeAssistantCapabilitiesReady, nativeAssistantCodec, nativeAssistantCompositionDigest, nativeCollaborationModule, parseNativeAssistantBase } from '../assistant-presets/native-adapter.js';
import { assistantGuidance } from '../assistant-presets/definition.js';
import { resourceAssistant, resourceError, resourcePresetId, RESOURCE_PROMPT_MAX_BYTES } from './contract.js';
const collaborationNames = ['dsh-wechat-remote/collaboration', '@harness-remote/dsh-wechat-remote/collaboration'];
const collaborationId = COLLABORATION_COMPONENT_ID;
const promptVariable = 'harness_private_resource_prompt';
/** Trusted shipped helper, not cloud code. Native interpolation is single-pass:
 * variable values containing {{...}} remain literal rather than being evaluated. */
export default class ResourcePromptData {
    static inject = ['systemPrompt'];
    constructor(ctx, config) {
        if (!config || typeof config.text !== 'string' || Buffer.byteLength(config.text) > RESOURCE_PROMPT_MAX_BYTES)
            throw resourceError('resource-prompt-invalid', '预设正文无效。');
        // Validate structured method data in the trusted helper; it is never a
        // module, template or executable input. The authored body stays literal.
        const text = config.assistant === undefined ? config.text : `${config.text}\n\n${assistantGuidance(config.assistant)}`;
        ctx.systemPrompt.variable(promptVariable, () => text);
    }
}
function ownPromptModule() {
    const resolve = createRequire(import.meta.url).resolve, own = realpathSync(new URL('./native.js', import.meta.url));
    for (const name of ['dsh-wechat-remote/private-resource-prompt', '@harness-remote/dsh-wechat-remote/private-resource-prompt']) {
        try {
            if (realpathSync(resolve(name)) === own)
                return name;
        }
        catch { /* Try only our two supported package layouts. */ }
    }
    throw resourceError('resource-host-unavailable', '当前插件尚未提供预设加载组件，请更新插件。');
}
export class NativeResourceRegistry {
    host;
    options;
    owned = new Map();
    expected = new Map();
    groups = new Set();
    groupLifetime = new AbortController();
    lifetime = new AbortController();
    closing;
    constructor(host, options = {}) {
        this.host = host;
        this.options = options;
    }
    /** Native diagnostics can await the global Loader, including our own unload.
     * Stop waiting when this owner closes; never put that wait back on disposal.
     * A native registration may finish later and still needs its own disposer. */
    wait(operation, late, caller) {
        const signal = caller ? AbortSignal.any([this.lifetime.signal, caller]) : this.lifetime.signal;
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
            let settled = false;
            const abort = () => { if (!settled) {
                settled = true;
                reject(signal.reason);
            } };
            signal.addEventListener('abort', abort, { once: true });
            Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(value => {
                signal.removeEventListener('abort', abort);
                if (settled) {
                    if (late)
                        void Promise.resolve().then(() => late(value)).catch(() => { });
                    return;
                }
                settled = true;
                resolve(value);
            }, error => {
                signal.removeEventListener('abort', abort);
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            });
        });
    }
    registry() {
        const registry = this.host.get('agentPresets');
        if (!registry || ['register', 'list', 'readDocument', 'resolve'].some(method => typeof registry[method] !== 'function'))
            throw resourceError('resource-host-unavailable', '当前 DSH 不支持加载此预设，请更新 DSH。');
        return registry;
    }
    groupAvailable() {
        try {
            return this.featureAccess()?.groupEnabled() === true;
        }
        catch {
            return false;
        }
    }
    featureAccess() {
        const access = this.host.get('wechatFeatures')?.access;
        return typeof access?.assertCurrent === 'function' && typeof access?.groupEnabled === 'function' ? access : undefined;
    }
    /** Cancel before queuing reconciliation: a native diagnostic can be waiting
     * for the very gate that is unloading. Ordinary resources never join it. */
    suspendGroups() {
        this.groupLifetime.abort(resourceError('resource-group-unavailable', '微信群协作暂不可用。'));
        const disposers = [];
        for (const id of this.groups) {
            const dispose = this.owned.get(id);
            if (dispose)
                disposers.push(dispose);
            this.owned.delete(id);
            this.expected.delete(id);
        }
        this.groups.clear();
        return Promise.allSettled(disposers.map(dispose => Promise.resolve().then(dispose))).then(() => { });
    }
    async register(resource) {
        this.lifetime.signal.throwIfAborted();
        const assistant = resourceAssistant(resource), group = !!assistant;
        if (group && !this.groupAvailable())
            throw resourceError('resource-group-unavailable', '请先开启本节点的微信群协作助手。');
        if (group && this.groupLifetime.signal.aborted)
            this.groupLifetime = new AbortController();
        const signal = group ? AbortSignal.any([this.lifetime.signal, this.groupLifetime.signal]) : this.lifetime.signal;
        const wait = (operation, late) => this.wait(operation, late, signal);
        const registry = this.registry(), id = resourcePresetId(resource);
        if (this.owned.has(id)) {
            const found = await wait(() => registry.resolve(id));
            signal.throwIfAborted();
            if (found?.id === id && found.broken === undefined)
                return;
            throw resourceError('resource-activation-failed', '此预设暂时不可用，请重启节点后再试。');
        }
        if ((await wait(() => registry.list())).some((entry) => entry.id === id))
            throw resourceError('resource-preset-conflict', 'DSH 中已有同名预设身份，未覆盖原内容。');
        const anchor = this.options.codec ? undefined : this.host.get('profileContext')?.installAnchor;
        const codec = this.options.codec || (typeof anchor === 'string' ? await wait(() => nativeAssistantCodec(anchor)) : undefined);
        if (!codec)
            throw resourceError('resource-host-unavailable', '当前 DSH 暂不支持读取基础模式。');
        let document;
        try {
            document = await wait(() => registry.readDocument(resource.basePreset));
        }
        catch {
            signal.throwIfAborted();
            throw resourceError('resource-base-unavailable', '此预设所需的基础模式暂不可用。');
        }
        // The selected base can itself have an unavailable group dependency. Read
        // its declaration, remove our capability contribution, then audit the NEW
        // composition. A plain resource must not inherit group startup or rights.
        const withoutCollaboration = (rows) => rows.filter(row => {
            if (row.id === collaborationId && !collaborationNames.includes(row.name))
                throw resourceError('resource-base-unavailable', '基础模式的群协作声明无法核对。');
            return !collaborationNames.includes(row.name);
        }).map(row => row.group === true ? { ...row, config: withoutCollaboration(row.config) } : row);
        const plugins = withoutCollaboration(parseNativeAssistantBase(codec, document, resource.basePreset));
        const personas = [];
        const scan = (rows, nested = false) => {
            for (const row of rows) {
                if (row.name === '@deepseek-ai/dsh-persona') {
                    if (nested)
                        throw resourceError('resource-base-unavailable', '基础模式的角色配置不支持派生。');
                    personas.push(row);
                }
                if (row.id === 'harness-private-resource-data')
                    throw resourceError('resource-base-unavailable', '请选择不含交付资源的原生基础模式。');
                if (row.group === true)
                    scan(row.config, true);
            }
        };
        scan(plugins);
        const persona = personas[0];
        if (personas.length !== 1 || !persona.config || typeof persona.config.prefix !== 'string')
            throw resourceError('resource-base-unavailable', '基础模式需要一个明确的原生角色配置。');
        // Preserve base tools, policy and suffix. Plain resources use their exact
        // authored body; only explicitly declared group resources add local guidance.
        persona.config = { ...persona.config, prefix: `{{${promptVariable}}}` };
        plugins.push({ id: 'harness-private-resource-data', name: this.options.promptModule || ownPromptModule(),
            config: { text: resource.systemPrompt, ...(assistant ? { assistant } : {}) } });
        if (group)
            plugins.push({ id: collaborationId, name: this.options.collaborationModule || nativeCollaborationModule() });
        let dispose;
        try {
            if (group) {
                const access = this.featureAccess();
                if (!access)
                    throw resourceError('resource-group-unavailable', '微信群协作暂不可用。');
                access.assertCurrent('group_assistant');
            }
            dispose = await wait(() => registry.register({ id, name: `${resource.name} · ${resource.version}`, description: resource.description, plugins }), async (late) => { if (typeof late === 'function')
                await late(); });
            if (typeof dispose !== 'function')
                throw resourceError('resource-activation-failed', 'DSH 未确认预设加载结果。');
            const loaded = await wait(() => registry.resolve(id));
            signal.throwIfAborted();
            if (!loaded || loaded.id !== id || loaded.broken !== undefined)
                throw resourceError('resource-activation-failed', '预设尚未成功加载，请核对基础模式和 DSH 版本。');
            this.owned.set(id, dispose);
            this.expected.set(id, nativeAssistantCompositionDigest(plugins));
            if (group)
                this.groups.add(id);
        }
        catch (error) {
            await dispose?.();
            throw error;
        }
    }
    async groupReady(resource, signal) {
        const id = resourcePresetId(resource);
        if (!resourceAssistant(resource) || !this.groupAvailable() || !this.groups.has(id) || !this.owned.has(id))
            return false;
        const caller = signal;
        signal = AbortSignal.any([signal, this.groupLifetime.signal]);
        try {
            const registry = this.registry(), loaded = await this.wait(() => registry.resolve(id), undefined, signal);
            const anchor = this.options.codec ? undefined : this.host.get('profileContext')?.installAnchor;
            const codec = this.options.codec || (typeof anchor === 'string' ? await this.wait(() => nativeAssistantCodec(anchor), undefined, signal) : undefined);
            if (!codec || loaded?.id !== id || loaded.broken !== undefined)
                return false;
            const actual = parseNativeAssistantBase(codec, await this.wait(() => registry.readDocument(id), undefined, signal), id);
            if (nativeAssistantCompositionDigest(actual) !== this.expected.get(id))
                return false;
            const ready = await this.wait(() => nativeAssistantCapabilitiesReady(this.host, id, signal), undefined, signal);
            return ready && this.groupAvailable() && this.groups.has(id) && this.owned.has(id);
        }
        catch {
            caller.throwIfAborted();
            return false;
        }
    }
    close() {
        if (this.closing)
            return this.closing;
        this.lifetime.abort(resourceError('resource-library-closed', '资源组件已停止。'));
        const entries = [...this.owned.values()];
        this.owned.clear();
        this.expected.clear();
        this.groups.clear();
        return this.closing = Promise.allSettled(entries.map(dispose => Promise.resolve().then(dispose))).then(() => { });
    }
    async unregister(resource) {
        const id = resourcePresetId(resource), dispose = this.owned.get(id);
        if (!dispose)
            return;
        await dispose();
        this.owned.delete(id);
        this.expected.delete(id);
        this.groups.delete(id);
    }
}
