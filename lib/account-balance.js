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
import { hostRuntimeVersion } from './dsh-host-context.js';
export const ACCOUNT_CAPABILITY = 'dsh.account-balance';
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
const text = (v, max = 80) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max) : '';
export function maskedContact(v) {
    const s = text(v);
    if (!s)
        return '';
    // Keep the platform mask; mask again if a provider unexpectedly sends plaintext.
    if (/[*•…]/u.test(s))
        return s;
    const at = s.indexOf('@');
    if (at > 0)
        return s.slice(0, 1) + '***' + s.slice(at);
    return s.length > 4 ? '***' + s.slice(-4) : '***';
}
export function walletViews(v) {
    if (!Array.isArray(v) || v.length > 8)
        return null;
    const result = [], seen = new Set();
    for (const row of v) {
        const r = record(row);
        if (!r || !['CNY', 'USD'].includes(r.currency) || seen.has(r.currency)
            || typeof r.balance !== 'string' || r.balance.length > 96
            || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(r.balance))
            return null;
        seen.add(r.currency);
        result.push({ currency: r.currency, balance: r.balance });
    }
    return result;
}
function empty(status) {
    return { schemaVersion: 1, status, profile: { status: 'failed', name: '', contact: '' },
        balance: { status: 'failed', wallets: [], bonusWallets: [] }, updatedAt: null };
}
function signedIn(v) { return record(v)?.status === 'credential-stored'; }
function contract(v) {
    return !!record(v) && ['getState', 'getProfile', 'getBalance', 'watch'].every(key => typeof v[key] === 'function');
}
/** Cancel the caller's wait, not the shared native request (the native API owns its timeout). */
function bounded(promise, signal, ms) {
    return new Promise((resolve, reject) => {
        const done = (error, value) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            if (error)
                reject(error);
            else
                resolve(value);
        };
        const abort = () => done(new Error('cancelled'));
        const timer = setTimeout(() => done(new Error('timeout')), ms);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
        promise.then(value => done(undefined, value), error => done(error));
    });
}
let WechatAccountService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _read_decorators;
    return class WechatAccountService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _read_decorators = [Remote('read')];
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        // Cordis re-scopes Service-valued properties on Remote invocation. Keep the
        // captured host provider inside a plain slot so identity checks remain stable
        // across those proxies (the account service is host-global, not session-local).
        provider = (__runInitializers(this, _instanceExtraInitializers), { current: null });
        generation = 0;
        pending;
        lifetime = new AbortController();
        watchReady = false;
        constructor(ctx) {
            super(ctx, 'wechatAccount');
            ctx.inject(['deepseekAccount'], scope => {
                const provider = scope.get('deepseekAccount');
                if (!contract(provider))
                    return;
                this.provider.current = provider;
                const watcher = new AbortController();
                const signal = AbortSignal.any([watcher.signal, this.lifetime.signal]);
                this.changed();
                void (async () => {
                    try {
                        // Same subscription as DSH's account UI: grant changes invalidate data;
                        // identity-only discovery during getProfile must not invalidate its own read.
                        for await (const _state of provider.watch(signal)) {
                            if (signal.aborted || this.provider.current !== provider)
                                return;
                            this.watchReady = true;
                            this.changed();
                        }
                    }
                    catch { /* Optional service failure must never affect chat or log credentials. */ }
                    finally {
                        if (!signal.aborted && this.provider.current === provider) {
                            this.watchReady = false;
                            this.changed();
                        }
                    }
                })();
                return () => {
                    watcher.abort();
                    if (this.provider.current === provider) {
                        this.provider.current = null;
                        this.watchReady = false;
                        this.changed();
                    }
                };
            });
            ctx.effect(() => () => { this.lifetime.abort(); this.provider.current = null; this.pending = undefined; });
        }
        available() { return this.provider.current !== null && !this.lifetime.signal.aborted; }
        changed() {
            this.generation++;
            if (!this.lifetime.signal.aborted)
                this.ctx.emit('wechatAccount/changed', { supported: this.available() });
        }
        async read(request, signal) {
            if (!request || typeof request.locale !== 'string' || !/^[a-zA-Z-]{2,24}$/.test(request.locale)
                || !Number.isInteger(request.timezoneOffsetSeconds) || Math.abs(request.timezoneOffsetSeconds) > 50400) {
                return { ok: false, error: { code: 'invalid_request', message: '账号查询参数无效' } };
            }
            const native = this.provider.current;
            if (!native || !this.available())
                return { ok: true, value: empty('unsupported') };
            if (!this.watchReady)
                return { ok: true, value: empty('unavailable') };
            try {
                const combined = AbortSignal.any([signal, this.lifetime.signal]);
                combined.throwIfAborted();
                if (!this.pending || this.pending.native !== native) {
                    // All callers share one native read. A timed-out caller cannot fan out more requests.
                    let version = 'unknown';
                    try {
                        version = hostRuntimeVersion(this.ctx) || version;
                    }
                    catch { /* no other profile fallback */ }
                    const client = { locale: request.locale, timezoneOffsetSeconds: request.timezoneOffsetSeconds, version };
                    const entry = { native, promise: this.query(native, client) };
                    this.pending = entry;
                    void entry.promise.finally(() => { if (this.pending === entry)
                        this.pending = undefined; }).catch(() => { });
                }
                return { ok: true, value: await bounded(this.pending.promise, combined, 35000) };
            }
            catch {
                return { ok: false, error: { code: 'account_unavailable', message: '暂时无法读取，请稍后重试' } };
            }
        }
        async query(native, client) {
            // Retry once after a native grant change; never mix two accounts' concurrent results.
            for (let attempt = 0; attempt < 2; attempt++) {
                const generation = this.generation;
                if (this.provider.current !== native || !this.watchReady || this.lifetime.signal.aborted)
                    return empty('unavailable');
                const state = await native.getState();
                if (!signedIn(state))
                    return empty(record(state)?.status === 'signed-out' ? 'signed-out' : 'unavailable');
                const [profile, balance] = await Promise.all([
                    native.getProfile(client).catch(() => undefined), native.getBalance(client).catch(() => undefined),
                ]);
                const after = await native.getState();
                if (this.provider.current !== native || !this.watchReady || this.lifetime.signal.aborted)
                    return empty('unavailable');
                if (!signedIn(after))
                    return empty(record(after)?.status === 'signed-out' ? 'signed-out' : 'unavailable');
                if (generation !== this.generation)
                    continue;
                // Native null means signed out or grant changed, NOT zero/empty account data.
                if (profile === null || balance === null)
                    return empty('unavailable');
                const p = record(profile), b = record(balance);
                const wallets = b?.status === 'ready' ? walletViews(b.value) : null;
                const bonus = b?.status === 'ready' ? walletViews(b.bonusWallets ?? []) : null;
                const value = empty('ready');
                return { ...value, updatedAt: Date.now(),
                    profile: p?.status === 'ready' && record(p.value)
                        ? { status: 'ready', name: text(p.value.name), contact: maskedContact(p.value.contact) } : value.profile,
                    balance: wallets && bonus ? { status: 'ready', wallets, bonusWallets: bonus } : value.balance };
            }
            return empty('unavailable');
        }
    };
})();
export { WechatAccountService };
export default WechatAccountService;
