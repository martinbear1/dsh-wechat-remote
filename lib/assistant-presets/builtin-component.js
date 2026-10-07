import { BUILTIN_ASSISTANTS, builtinAssistants } from './builtins.js';
import { nativeAssistantCodec, nativeAssistantCompositionDigest, parseNativeAssistantBase, transformNativeAssistantBase } from './native-adapter.js';
import { HUMAN_WORKFLOW_SKILL } from '../human-workflow/dsh-skill.js';
/** A real main-bundle component; no install/profile mutation, child package or
 * generated account-specific ID. Uses the same public registry as DSH's native
 * preset component, retaining the host's current validated standard policies. */
export class BuiltinAssistantComponent {
    host;
    lifetime = new AbortController();
    ready;
    unregister;
    expected;
    settled = false;
    issue = '内置助手正在准备，请稍后刷新。';
    definition;
    constructor(host, templateId) {
        this.host = host;
        this.definition = builtinAssistants().find(item => item.templateId === templateId);
        const identity = BUILTIN_ASSISTANTS.find(item => item.templateId === templateId);
        host.provide(identity.service, this);
        this.ready = this.initialize().finally(() => { this.settled = true; });
        host.effect(() => async () => {
            this.lifetime.abort();
            await this.ready;
            const dispose = this.unregister;
            this.unregister = undefined;
            this.expected = undefined;
            await dispose?.();
        }, `${identity.presetId} component`);
    }
    async initialize() {
        try {
            const registry = this.host.get('agentPresets'), loader = this.host.get('loader');
            const profile = this.host.get('profileContext');
            if (typeof registry?.register !== 'function' || typeof registry?.readDocument !== 'function'
                || typeof loader?.await !== 'function' || typeof profile?.installAnchor !== 'string') {
                this.issue = '当前 DSH 暂不支持内置助手，请检查版本。';
                return;
            }
            // Do not make our Loader activation wait on itself. initialize runs as an
            // owned background readiness task; disposal cancels the wait and joins it.
            let stopped;
            try {
                await Promise.race([loader.await(), new Promise(resolve => {
                        stopped = () => resolve();
                        this.lifetime.signal.addEventListener('abort', stopped, { once: true });
                    })]);
            }
            finally {
                if (stopped)
                    this.lifetime.signal.removeEventListener('abort', stopped);
            }
            this.lifetime.signal.throwIfAborted();
            const codec = await nativeAssistantCodec(profile.installAnchor);
            const base = parseNativeAssistantBase(codec, await registry.readDocument(this.definition.definition.basePreset), this.definition.definition.basePreset);
            const plugins = transformNativeAssistantBase(base, this.definition.definition);
            this.lifetime.signal.throwIfAborted();
            const dispose = await registry.register({ id: this.definition.presetId, name: this.definition.name,
                description: this.definition.definition.description, order: 100 + BUILTIN_ASSISTANTS.findIndex(item => item.presetId === this.definition.presetId), plugins });
            if (typeof dispose !== 'function')
                throw new Error('native registry did not return a disposer');
            this.unregister = dispose;
            this.expected = nativeAssistantCompositionDigest(plugins);
            this.issue = '';
            if (this.lifetime.signal.aborted) {
                await dispose();
                this.unregister = undefined;
                this.expected = undefined;
            }
        }
        catch {
            // Host paths/configs never enter a user-facing catalog.
            this.issue = '内置助手暂未就绪，请检查 DSH 版本或同名模式冲突；原有会话和资料未改动。';
        }
    }
    async status(options = {}) {
        if (options.waitForReady !== false && !this.settled) {
            // A slow unrelated host component must not permanently disable our mode,
            // nor leave the settings view waiting on all host startup indefinitely.
            let timer;
            try {
                await Promise.race([this.ready, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        }
        const base = { ...this.definition, source: 'builtin' };
        if (!this.settled)
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: '内置助手正在准备，请稍后刷新。' };
        if (this.lifetime.signal.aborted || !this.expected)
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: this.issue || '内置助手已停用。' };
        try {
            const registry = this.host.get('agentPresets'), profile = this.host.get('profileContext');
            const roster = await registry.list(), found = roster.find((item) => item.id === this.definition.presetId);
            const codec = await nativeAssistantCodec(profile.installAnchor);
            const actual = parseNativeAssistantBase(codec, await registry.readDocument(this.definition.presetId), this.definition.presetId);
            this.lifetime.signal.throwIfAborted();
            if (!found || found.broken !== undefined || nativeAssistantCompositionDigest(actual) !== this.expected || found.name !== this.definition.name)
                return { ...base, state: 'unknown', nativeState: 'stale', reason: '内置助手的当前模式需核对，未按名称猜测它已可用。' };
            const skills = this.host.get('skills'), skill = typeof skills?.get === 'function' ? await skills.get('human-workflow') : undefined;
            this.lifetime.signal.throwIfAborted();
            if (!skill || skill.content !== HUMAN_WORKFLOW_SKILL.content || skill.provider !== HUMAN_WORKFLOW_SKILL.provider)
                return { ...base, state: 'unknown', nativeState: 'unknown', reason: '助手模式已包含，但工作方法尚未接通；请核对微信连接插件状态。' };
            return { ...base, state: 'installed', nativeState: 'installed' };
        }
        catch {
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: '暂时无法核对内置助手，请稍后刷新。' };
        }
    }
}
export function builtinComponent(templateId) {
    return class {
        static inject = ['agentPresets', 'loader', 'profileContext'];
        constructor(ctx) { new BuiltinAssistantComponent(ctx, templateId); }
    };
}
