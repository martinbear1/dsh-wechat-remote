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
import { NativePluginManager, pluginError, PluginAdapterError } from './native.js';
/** Mounted on the existing authenticated owner transport; no additional endpoint or credentials. */
let WechatPluginsService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatPluginsService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        adapter = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx) {
            super(ctx, 'wechatPlugins');
            this.adapter = new NativePluginManager(ctx);
            ctx.effect(() => () => { this.lifetime.abort(); });
        }
        status() { return this.adapter.status(); }
        async control(request, signal) {
            try {
                if (!request || typeof request.action !== 'string' || request.action.length > 32 || request.inputJson !== undefined && (typeof request.inputJson !== 'string' || Buffer.byteLength(request.inputJson) > 256 * 1024))
                    throw new PluginAdapterError('invalid_request', '插件管理请求过大或格式无效。');
                let value;
                try {
                    value = JSON.parse(request.inputJson || '{}');
                }
                catch {
                    throw new PluginAdapterError('invalid_request', '插件管理请求格式无效。');
                }
                const result = await this.adapter.control(request.action, value, AbortSignal.any([signal, this.lifetime.signal]));
                const valueJson = JSON.stringify(result);
                if (Buffer.byteLength(valueJson) > 1024 * 1024)
                    throw new PluginAdapterError('response_too_large', '插件信息过大，请在电脑端查看。');
                return { ok: true, valueJson };
            }
            catch (error) {
                return { ok: false, error: pluginError(error) };
            }
        }
    };
})();
export { WechatPluginsService };
