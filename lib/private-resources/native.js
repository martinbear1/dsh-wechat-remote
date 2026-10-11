import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nativeAssistantCodec, parseNativeAssistantBase } from '../assistant-presets/native-adapter.js';
import { resourceError, resourcePresetId, RESOURCE_PROMPT_MAX_BYTES } from './contract.js';
const promptVariable = 'harness_private_resource_prompt';
/** Trusted shipped helper, not cloud code. Native interpolation is single-pass:
 * variable values containing {{...}} remain literal rather than being evaluated. */
export default class ResourcePromptData {
    static inject = ['systemPrompt'];
    constructor(ctx, config) {
        if (!config || typeof config.text !== 'string' || Buffer.byteLength(config.text) > RESOURCE_PROMPT_MAX_BYTES)
            throw resourceError('resource-prompt-invalid', '预设正文无效。');
        ctx.systemPrompt.variable(promptVariable, () => config.text);
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
    lifetime = new AbortController();
    closing;
    constructor(host, options = {}) {
        this.host = host;
        this.options = options;
    }
    /** Native diagnostics can await the global Loader, including our own unload.
     * Stop waiting when this owner closes; never put that wait back on disposal.
     * A native registration may finish later and still needs its own disposer. */
    wait(operation, late) {
        const signal = this.lifetime.signal;
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
    async register(resource) {
        this.lifetime.signal.throwIfAborted();
        const registry = this.registry(), id = resourcePresetId(resource);
        if (this.owned.has(id)) {
            const found = await this.wait(() => registry.resolve(id));
            this.lifetime.signal.throwIfAborted();
            if (found?.id === id && found.broken === undefined)
                return;
            throw resourceError('resource-activation-failed', '此预设暂时不可用，请重启节点后再试。');
        }
        if ((await this.wait(() => registry.list())).some((entry) => entry.id === id))
            throw resourceError('resource-preset-conflict', 'DSH 中已有同名预设身份，未覆盖原内容。');
        const base = await this.wait(() => registry.resolve(resource.basePreset));
        if (!base || base.id !== resource.basePreset || base.broken !== undefined)
            throw resourceError('resource-base-unavailable', '此预设所需的基础模式暂不可用。');
        const anchor = this.options.codec ? undefined : this.host.get('profileContext')?.installAnchor;
        const codec = this.options.codec || (typeof anchor === 'string' ? await this.wait(() => nativeAssistantCodec(anchor)) : undefined);
        if (!codec)
            throw resourceError('resource-host-unavailable', '当前 DSH 暂不支持读取基础模式。');
        const plugins = parseNativeAssistantBase(codec, await this.wait(() => registry.readDocument(resource.basePreset)), resource.basePreset);
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
        // Preserve base tools, policy and suffix. Replace only the authored persona,
        // without occupational guidance, human-workflow, extra role text or prompt editing.
        persona.config = { ...persona.config, prefix: `{{${promptVariable}}}` };
        plugins.push({ id: 'harness-private-resource-data', name: this.options.promptModule || ownPromptModule(), config: { text: resource.systemPrompt } });
        let dispose;
        try {
            dispose = await this.wait(() => registry.register({ id, name: `${resource.name} · ${resource.version}`, description: resource.description, plugins }), async (late) => { if (typeof late === 'function')
                await late(); });
            if (typeof dispose !== 'function')
                throw resourceError('resource-activation-failed', 'DSH 未确认预设加载结果。');
            const loaded = await this.wait(() => registry.resolve(id));
            this.lifetime.signal.throwIfAborted();
            if (!loaded || loaded.id !== id || loaded.broken !== undefined)
                throw resourceError('resource-activation-failed', '预设尚未成功加载，请核对基础模式和 DSH 版本。');
            this.owned.set(id, dispose);
        }
        catch (error) {
            await dispose?.();
            throw error;
        }
    }
    close() {
        if (this.closing)
            return this.closing;
        this.lifetime.abort(resourceError('resource-library-closed', '资源组件已停止。'));
        const entries = [...this.owned.values()];
        this.owned.clear();
        return this.closing = Promise.allSettled(entries.map(dispose => Promise.resolve().then(dispose))).then(() => { });
    }
    async unregister(resource) {
        const id = resourcePresetId(resource), dispose = this.owned.get(id);
        if (!dispose)
            return;
        await dispose();
        this.owned.delete(id);
    }
}
