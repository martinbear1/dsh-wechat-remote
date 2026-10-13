import { BUILTIN_ASSISTANTS, builtinAssistants } from './builtins.js';
import { nativeAssistantCapabilitiesReady, nativeAssistantCodec, nativeAssistantCompositionDigest, parseNativeAssistantBase, transformNativeAssistantBase } from './native-adapter.js';
import { hostFeatureAccess } from '../feature-access.js';
/** A real main-bundle component; no install/profile mutation, child package or
 * generated account-specific ID. Uses the same public registry as DSH's native
 * preset component, retaining the host's current validated standard policies. */
export class BuiltinAssistantComponent {
    host;
    options;
    lifetime = new AbortController();
    ready;
    unregister;
    expected;
    settled = false;
    changes = Promise.resolve();
    closing;
    unsubscribe;
    issue = '内置助手正在准备，请稍后刷新。';
    definition;
    constructor(host, templateId, options = {}) {
        this.host = host;
        this.options = options;
        this.definition = builtinAssistants().find(item => item.templateId === templateId);
        const identity = BUILTIN_ASSISTANTS.find(item => item.templateId === templateId);
        host.provide(identity.service, this);
        try {
            this.unsubscribe = hostFeatureAccess(host).subscribe(() => { void this.notify(); });
        }
        catch { /* missing account gate remains closed */ }
        this.ready = this.initialize().finally(() => { this.settled = true; });
        this.changes = this.ready;
        if (!options.managed)
            host.effect(() => () => this.close(), `${identity.presetId} component`);
    }
    /** Serialize every opt-in, entitlement and component transition per native ID. */
    notify() {
        if (this.lifetime.signal.aborted)
            return this.closing || Promise.resolve();
        return this.changes = this.changes.then(() => this.initialize()).catch(() => { });
    }
    close() {
        if (this.closing)
            return this.closing;
        this.lifetime.abort();
        this.unsubscribe?.();
        // Withdraw an already-published declaration immediately. Native Loader
        // removal may precede its async cleanup; another activation must not see
        // this stopped owner's registration as a foreign live preset.
        const dispose = this.unregister;
        this.unregister = undefined;
        this.expected = undefined;
        let disposed;
        try {
            disposed = dispose?.();
        }
        catch (error) {
            disposed = Promise.reject(error);
        }
        return this.closing = Promise.all([this.changes, disposed]).then(() => { });
    }
    /** Native reads can wait on the global Loader, including our own unload.
     * Cancel that wait; a late registration still disposes only its own entry. */
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
    async initialize() {
        try {
            if (this.lifetime.signal.aborted)
                return;
            const access = hostFeatureAccess(this.host);
            // A refresh never grants the local opt-in. Only the owner control can set
            // it, scoped to this node and account incarnation.
            if (this.options.enabled?.() === false || !access.groupEnabled()) {
                const dispose = this.unregister;
                this.unregister = undefined;
                this.expected = undefined;
                this.issue = this.options.enabled?.() === false ? this.options.reason?.() || '此助手已停用。' : access.grant('group_assistant').message || '微信群协作助手已关闭。';
                await dispose?.();
                return;
            }
            if (this.unregister)
                return;
            const registry = this.host.get('agentPresets'), loader = this.host.get('loader');
            const profile = this.host.get('profileContext');
            if (typeof registry?.register !== 'function' || typeof registry?.readDocument !== 'function' || typeof registry?.list !== 'function'
                || typeof loader?.await !== 'function' || typeof profile?.installAnchor !== 'string') {
                this.issue = '当前 DSH 暂不支持内置助手，请检查版本。';
                return;
            }
            // Do not make our Loader activation wait on itself. initialize runs as an
            // owned background readiness task; disposal cancels the wait and joins it.
            await this.wait(() => loader.await());
            this.lifetime.signal.throwIfAborted();
            const codec = await this.wait(() => nativeAssistantCodec(profile.installAnchor));
            const base = parseNativeAssistantBase(codec, await this.wait(() => registry.readDocument(this.definition.definition.basePreset)), this.definition.definition.basePreset);
            const plugins = transformNativeAssistantBase(base, this.definition.definition);
            if ((await this.wait(() => registry.list())).some(item => item.id === this.definition.presetId))
                throw new Error('native preset identity already belongs to another component');
            this.lifetime.signal.throwIfAborted();
            if (this.options.enabled?.() === false || !access.groupEnabled())
                return;
            access.assertCurrent('group_assistant');
            const dispose = await this.wait(() => registry.register({ id: this.definition.presetId, name: this.definition.name,
                description: this.definition.definition.description, order: 100 + BUILTIN_ASSISTANTS.findIndex(item => item.presetId === this.definition.presetId), plugins }), async (late) => { if (typeof late === 'function')
                await late(); });
            if (typeof dispose !== 'function')
                throw new Error('native registry did not return a disposer');
            this.unregister = dispose;
            this.expected = nativeAssistantCompositionDigest(plugins);
            this.issue = '';
            if (this.lifetime.signal.aborted || this.options.enabled?.() === false || !access.groupEnabled()) {
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
                await Promise.race([this.changes, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        }
        const base = { ...this.definition, source: 'builtin', ...(this.options.enabled ? { enabled: this.options.enabled() } : {}) };
        if (base.enabled === false)
            return { ...base, state: 'unknown', nativeState: 'disabled', reason: this.options.reason?.() || '此助手已停用；已有会话和资料保留。' };
        if (!this.settled)
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: '内置助手正在准备，请稍后刷新。' };
        if (this.lifetime.signal.aborted || !this.expected)
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: this.issue || '内置助手已停用。' };
        // The shared backend opens its registry during every initialization, also
        // when these preset declarations survived a backend-only reload. Acquiring
        // their scopes here could mount a component waiting on that same backend.
        // Defer the full scoped readiness check to an explicit status query.
        if (options.waitForReady === false)
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: '内置助手已包含，工作能力将在连接就绪后核对。' };
        try {
            const registry = this.host.get('agentPresets'), profile = this.host.get('profileContext');
            const expected = this.expected;
            const roster = await this.wait(() => registry.list()), found = roster.find((item) => item.id === this.definition.presetId);
            const codec = await this.wait(() => nativeAssistantCodec(profile.installAnchor));
            const actual = parseNativeAssistantBase(codec, await this.wait(() => registry.readDocument(this.definition.presetId)), this.definition.presetId);
            this.lifetime.signal.throwIfAborted();
            if (!found || found.broken !== undefined || nativeAssistantCompositionDigest(actual) !== expected || found.name !== this.definition.name)
                return { ...base, state: 'unknown', nativeState: 'stale', reason: '内置助手的当前模式需核对，未按名称猜测它已可用。' };
            if (!await nativeAssistantCapabilitiesReady(this.host, this.definition.presetId, this.lifetime.signal))
                return { ...base, state: 'unknown', nativeState: 'unknown', reason: '助手模式已包含，但工作方法尚未接通；请核对微信连接插件状态。' };
            this.lifetime.signal.throwIfAborted();
            if (expected !== this.expected || this.options.enabled?.() === false || !hostFeatureAccess(this.host).groupEnabled())
                return { ...base, ...(this.options.enabled ? { enabled: this.options.enabled() } : {}), state: 'unknown', nativeState: 'disabled', reason: '助手已暂停；已有会话和资料保留。' };
            return { ...base, state: 'installed', nativeState: 'installed' };
        }
        catch {
            return { ...base, state: 'unknown', nativeState: 'unknown', reason: '暂时无法核对内置助手，请稍后刷新。' };
        }
    }
}
export function builtinComponent(templateId) {
    return class {
        static inject = ['agentPresets', 'loader', 'profileContext', 'wechatFeatures'];
        constructor(ctx) { new BuiltinAssistantComponent(ctx, templateId); }
    };
}
