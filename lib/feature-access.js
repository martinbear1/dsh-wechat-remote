var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { existsSync } from 'node:fs';
import { readPrivateJson, writePrivateJsonAtomic } from './secure-file.js';
const reasons = new Set(['allowed', 'public_access_required', 'public_quota_exhausted', 'feature_not_entitled', 'feature_disabled', 'feature_account_blocked', 'account_suspended', 'node_unbound', 'account_not_found']);
export function featureMessage(reason) {
    return { public_access_required: '请先开通或续期公网服务。', public_quota_exhausted: '公网流量已用完，请补充后再使用。',
        feature_not_entitled: '此账号暂未开通此功能。', feature_disabled: '此功能暂未开放。', feature_account_blocked: '此账号暂不能使用此功能。',
        account_suspended: '此账号暂不可用。', node_unbound: '请先用小程序连接此节点。', account_not_found: '请先用小程序连接此节点。',
        group_disabled: '请先开启微信群协作助手。', group_component_disabled: '请在电脑插件管理器启用微信群协作助手组件。', history_import_disabled: '请先在设置中开启网页会话导入。',
        unavailable: '暂时无法核对使用资格，请联网后刷新。', allowed: '' }[reason] || '暂时无法核对使用资格，请联网后刷新。';
}
export class FeatureAccessError extends Error {
    reason;
    code = 'feature-access-denied';
    constructor(reason) {
        super(featureMessage(reason));
        this.reason = reason;
        this.name = 'FeatureAccessError';
    }
}
export function validateFeatureLease(value, nodeId) {
    const v = value;
    if (!v || v.schemaVersion !== 1 || v.nodeId !== nodeId || !(v.accountInstance === null || typeof v.accountInstance === 'string' && v.accountInstance.length <= 256)
        || !Number.isSafeInteger(v.checkedAt) || !Number.isSafeInteger(v.expiresAt) || v.expiresAt <= v.checkedAt || v.expiresAt > v.checkedAt + 60_000 || !v.features)
        throw new FeatureAccessError('unavailable');
    const valid = (g) => !!g && typeof g.allowed === 'boolean' && reasons.has(g.reason) && (g.allowed
        ? g.reason === 'allowed' && !!v.accountInstance && Number.isSafeInteger(g.validUntil) && g.validUntil >= v.expiresAt
        : g.reason !== 'allowed' && g.validUntil === null);
    for (const key of ['group_assistant', 'clawbot'])
        if (!valid(v.features[key]))
            throw new FeatureAccessError('unavailable');
    const result = structuredClone(v);
    // Older cloud releases omit new grants. Reject only the new feature, not
    // existing group/ClawBot authority; malformed new grants also fail closed.
    if (!valid(result.features.history_import))
        result.features.history_import = { allowed: false, reason: 'unavailable', validUntil: null };
    return result;
}
/** One identity-bound, single-flight lease for both local and phone controls.
 * The server's duration is bounded by monotonic time, not the PC wall clock.
 * This is never populated by a mobile-supplied capability/allowed flag. */
export class FeatureAccess {
    source;
    preferenceFile;
    monotonic;
    lease;
    until = 0;
    flight;
    generation = 0;
    readAbort;
    intent = 0;
    expiry;
    renewal;
    closed = false;
    listeners = new Set();
    requested;
    historyRequested;
    historyIntent = 0;
    historyEpoch = 0;
    historyAuthority = '';
    constructor(source, preferenceFile, monotonic = () => performance.now()) {
        this.source = source;
        this.preferenceFile = preferenceFile;
        this.monotonic = monotonic;
        if (preferenceFile && existsSync(preferenceFile)) {
            try {
                const v = readPrivateJson(preferenceFile);
                if (v.schemaVersion === 1) {
                    if (v.enabled === true && typeof v.nodeId === 'string' && typeof v.accountInstance === 'string')
                        this.requested = { nodeId: v.nodeId, accountInstance: v.accountInstance };
                    const h = v.historyImport;
                    if (h?.enabled === true && typeof h.nodeId === 'string' && typeof h.accountInstance === 'string')
                        this.historyRequested = { nodeId: h.nodeId, accountInstance: h.accountInstance };
                }
            }
            catch { /* damaged preference never enables anything */ }
        }
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit() { for (const listener of this.listeners) {
        try {
            listener();
        }
        catch { /* independent consumers */ }
    } }
    invalidate() {
        this.historyEpoch++;
        this.clearLease();
    }
    clearLease() {
        const had = Boolean(this.lease);
        this.generation++;
        this.readAbort?.abort();
        this.readAbort = undefined;
        this.flight = undefined;
        this.lease = undefined;
        this.until = 0;
        clearTimeout(this.expiry);
        clearTimeout(this.renewal);
        if (had)
            this.emit();
    }
    renewWhileEnabled() {
        clearTimeout(this.renewal);
        if (!this.groupEnabled())
            return;
        const remaining = this.until - this.monotonic();
        // Only an explicitly enabled group feature owns refreshes. A network
        // failure stops renewal; stale authority is never extended or auto-enabled.
        this.renewal = setTimeout(() => { void this.refresh(true).catch(() => { }); }, Math.max(1, remaining * .75));
        this.renewal.unref?.();
    }
    live() {
        let nodeId;
        try {
            nodeId = this.source.nodeId();
        }
        catch {
            return undefined;
        }
        return !this.closed && this.lease?.nodeId === nodeId && this.monotonic() < this.until ? this.lease : undefined;
    }
    groupComponentAvailable() { try {
        return this.source.groupAvailable?.() ?? true;
    }
    catch {
        return false;
    } }
    /** Component lifecycle changes effective access, never the user's saved intent. */
    componentsChanged() { if (!this.closed) {
        this.renewWhileEnabled();
        this.emit();
    } }
    groupEnabled() { const v = this.live(); return this.groupComponentAvailable() && Boolean(v?.features.group_assistant.allowed && this.requested?.nodeId === v.nodeId && this.requested?.accountInstance === v.accountInstance); }
    historyImportEnabled() { const v = this.live(); return Boolean(v?.features.history_import.allowed && this.historyRequested?.nodeId === v.nodeId && this.historyRequested?.accountInstance === v.accountInstance); }
    grant(feature, requireEnabled = true) {
        const grant = this.live()?.features[feature] || { allowed: false, reason: 'unavailable', validUntil: null };
        if (grant.allowed && feature === 'group_assistant' && requireEnabled && !this.groupEnabled()) {
            const reason = this.groupComponentAvailable() ? 'group_disabled' : 'group_component_disabled';
            return { allowed: false, reason, validUntil: null, message: featureMessage(reason) };
        }
        if (grant.allowed && feature === 'history_import' && requireEnabled && !this.historyImportEnabled())
            return { allowed: false, reason: 'history_import_disabled', validUntil: null, message: featureMessage('history_import_disabled') };
        return { ...grant, message: featureMessage(grant.reason) };
    }
    async refresh(force = false) {
        if (this.closed)
            throw new FeatureAccessError('unavailable');
        if (!force && this.live())
            return;
        // If expiry's callback was delayed by synchronous work, retire that old
        // lease before starting a fresh read; its timer must not abort the new one.
        if (this.lease && this.monotonic() >= this.until)
            this.clearLease();
        if (!this.flight) {
            const start = this.monotonic(), generation = this.generation, abort = new AbortController(), previous = this.live();
            this.readAbort = abort;
            const flight = Promise.resolve().then(async () => {
                try {
                    const nodeId = this.source.nodeId(), raw = await this.source.read(AbortSignal.any([abort.signal, AbortSignal.timeout(8_000)]));
                    const lease = validateFeatureLease(raw, nodeId);
                    if (this.closed || generation !== this.generation || abort.signal.aborted || this.source.nodeId() !== nodeId)
                        throw new FeatureAccessError('unavailable');
                    const until = start + Math.min(60_000, lease.expiresAt - lease.checkedAt);
                    if (until <= this.monotonic())
                        throw new FeatureAccessError('unavailable');
                    const historyAuthority = JSON.stringify([lease.nodeId, lease.accountInstance, lease.features.history_import.allowed]);
                    if (this.historyAuthority !== historyAuthority)
                        this.historyEpoch++;
                    this.historyAuthority = historyAuthority;
                    this.lease = lease;
                    this.until = until;
                    clearTimeout(this.expiry);
                    this.expiry = setTimeout(() => this.clearLease(), Math.max(1, until - this.monotonic()));
                    this.expiry.unref?.();
                    this.renewWhileEnabled();
                    this.emit();
                }
                catch (error) {
                    const status = error?.statusCode;
                    // A failed background observation cannot revoke an unexpired lease.
                    // Keep its ORIGINAL deadline/intent only. A validated new lease above,
                    // explicit auth denial, identity invalidation or expiry remain final;
                    // rate limits/proxy/protocol failures are not evidence of revocation.
                    const denied = status === 401 || status === 403;
                    if (generation === this.generation && !(!denied && !abort.signal.aborted && previous && this.live() === previous))
                        this.invalidate();
                    throw new FeatureAccessError('unavailable');
                }
            });
            this.flight = flight;
            void flight.finally(() => { if (this.flight === flight) {
                this.flight = undefined;
                this.readAbort = undefined;
            } }).catch(() => { });
        }
        await this.flight;
    }
    assertCurrent(feature, requireEnabled = true) { const g = this.grant(feature, requireEnabled); if (!g.allowed)
        throw new FeatureAccessError(g.reason); }
    async assert(feature, requireEnabled = true) { await this.refresh(); this.assertCurrent(feature, requireEnabled); }
    async setGroupEnabled(enabled, signal) {
        const intent = ++this.intent;
        signal?.throwIfAborted();
        if (enabled)
            await this.assert('group_assistant', false);
        signal?.throwIfAborted();
        if (intent !== this.intent || this.closed)
            throw new FeatureAccessError('unavailable');
        if (enabled) {
            this.assertCurrent('group_assistant', false);
            if (!this.groupComponentAvailable())
                throw new FeatureAccessError('group_component_disabled');
        }
        const lease = this.live(), next = enabled ? { nodeId: lease.nodeId, accountInstance: lease.accountInstance } : undefined;
        this.savePreferences(next, this.historyRequested);
        this.requested = next;
        this.renewWhileEnabled();
        this.emit();
    }
    savePreferences(group, history) {
        // Keep the original top-level group fields readable by older plugins.
        if (this.preferenceFile)
            writePrivateJsonAtomic(this.preferenceFile, { schemaVersion: 1, enabled: !!group, ...group,
                historyImport: { enabled: !!history, ...history } });
    }
    async setHistoryImportEnabled(enabled, signal) {
        const intent = ++this.historyIntent;
        signal?.throwIfAborted();
        if (enabled)
            await this.assert('history_import', false);
        signal?.throwIfAborted();
        if (intent !== this.historyIntent || this.closed)
            throw new FeatureAccessError('unavailable');
        if (enabled)
            this.assertCurrent('history_import', false);
        const lease = this.live(), next = enabled ? { nodeId: lease.nodeId, accountInstance: lease.accountInstance } : undefined;
        this.savePreferences(this.requested, next);
        this.historyRequested = next;
        this.emit();
        // Import is demand-driven. This opt-in must never own a renewal timer.
    }
    async authorizeHistoryImport(signal) {
        const intent = this.historyIntent;
        signal?.throwIfAborted();
        await this.assert('history_import');
        signal?.throwIfAborted();
        if (intent !== this.historyIntent)
            throw new FeatureAccessError('unavailable');
        const lease = this.live(), epoch = this.historyEpoch;
        let generation = this.generation;
        const owner = JSON.stringify([lease.nodeId, lease.accountInstance]);
        const assertIntent = () => {
            if (this.closed || epoch !== this.historyEpoch || intent !== this.historyIntent)
                throw new FeatureAccessError('unavailable');
        };
        const assertCurrent = () => {
            assertIntent();
            if (generation !== this.generation
                || owner !== JSON.stringify([this.live()?.nodeId, this.live()?.accountInstance]))
                throw new FeatureAccessError('unavailable');
            this.assertCurrent('history_import');
        };
        return { owner, assertCurrent, revalidate: async (readSignal) => {
                // A long import may outlive a lease, never its original owner or opt-in.
                // Natural expiry can refresh on demand; explicit invalidation, observed
                // revocation or off/on changes permanently fence this operation.
                readSignal.throwIfAborted();
                assertIntent();
                await this.refresh();
                readSignal.throwIfAborted();
                assertIntent();
                generation = this.generation;
                assertCurrent();
            } };
    }
    async currentOwner(signal) {
        signal?.throwIfAborted();
        try {
            await this.refresh();
        }
        catch {
            signal?.throwIfAborted();
            return undefined;
        }
        signal?.throwIfAborted();
        const lease = this.live();
        return lease?.accountInstance ? JSON.stringify([lease.nodeId, lease.accountInstance]) : undefined;
    }
    snapshot() {
        const v = this.live();
        let nodeId = '';
        try {
            nodeId = this.source.nodeId();
        }
        catch { }
        return { ...(v || { schemaVersion: 1, nodeId, accountInstance: null, checkedAt: 0, expiresAt: 0,
                features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot'), history_import: this.grant('history_import', false) } }),
            features: { group_assistant: this.grant('group_assistant', false), clawbot: this.grant('clawbot'), history_import: this.grant('history_import', false) },
            groupEnabled: this.groupEnabled(), groupComponentAvailable: this.groupComponentAvailable(), historyImportEnabled: this.historyImportEnabled() };
    }
    close() { this.closed = true; this.invalidate(); this.listeners.clear(); }
}
let WechatFeaturesService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatFeaturesService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        access;
        constructor(host, config) {
            super(host, 'wechatFeatures');
            this.host = host;
            this.access = new FeatureAccess(config.source, config.preferenceFile);
            host.effect(() => () => this.access.close());
        }
        async control(request, signal) {
            try {
                signal.throwIfAborted();
                if (request?.action === 'status') {
                    try {
                        await this.access.refresh();
                    }
                    catch { }
                }
                else if (request?.action === 'group.enabled' && typeof request.enabled === 'boolean')
                    await this.access.setGroupEnabled(request.enabled, signal);
                else if (request?.action === 'assistant.enabled' && typeof request.enabled === 'boolean'
                    && ['teacher', 'project', 'designer'].includes(request.templateId || '')) {
                    const controller = this.host.get('wechatGroupAssistants');
                    if (!controller?.active || typeof controller.setEnabled !== 'function')
                        throw new FeatureAccessError('group_component_disabled');
                    if (request.enabled)
                        await this.access.assert('group_assistant');
                    signal.throwIfAborted();
                    await controller.setEnabled(request.templateId, request.enabled, signal);
                }
                else if (request?.action === 'historyImport.enabled' && typeof request.enabled === 'boolean')
                    await this.access.setHistoryImportEnabled(request.enabled, signal);
                else
                    throw new FeatureAccessError('unavailable');
                signal.throwIfAborted();
                return { ok: true, value: this.access.snapshot() };
            }
            catch (error) {
                signal.throwIfAborted();
                return { ok: false, error: { code: 'feature-access-denied', message: error instanceof FeatureAccessError ? error.message : '操作未完成，请刷新后重试。' } };
            }
        }
    };
})();
export { WechatFeaturesService };
export function hostFeatureAccess(host) {
    const access = host.get('wechatFeatures')?.access;
    if (!access || typeof access.assert !== 'function')
        throw new FeatureAccessError('unavailable');
    return access;
}
