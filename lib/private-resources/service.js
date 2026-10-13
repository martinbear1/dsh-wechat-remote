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
import path from 'node:path';
import { agentDshHome, agentProfileScope } from '../agent-metadata.js';
import { nodeStorageDirectory } from '../node-storage.js';
import { PrivateResourceLibrary } from './library.js';
import { hostFeatureAccess } from '../feature-access.js';
import { ResourceDeliveryClient } from './source.js';
import { ResourceController } from './controller.js';
import { ResourceError } from './contract.js';
/** Host-authenticated resource management only; not a model-callable tool. */
let WechatResourcesService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatResourcesService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        lifetime = (__runInitializers(this, _instanceExtraInitializers), new AbortController());
        controller;
        ready;
        settled = false;
        constructor(ctx) {
            super(ctx, 'wechatResources');
            const library = new PrivateResourceLibrary(ctx, path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'private-resources'));
            // Definitions are local verified data, available before native activation;
            // HumanTools can validate its history without waiting on its own tools.
            void library.prepare();
            ctx.provide('wechatResourceAssistants', {
                definitions: signal => library.definitions(signal),
                list: (signal, options) => library.assistantStatus(signal, options),
            });
            ctx.inject(['wechatFeatures'], scope => {
                const access = hostFeatureAccess(scope);
                const changed = () => { void library.setGroupAvailable(access.groupEnabled()).catch(() => { }); };
                const unsubscribe = access.subscribe(changed);
                changed();
                return () => { unsubscribe(); void library.setGroupAvailable(false).catch(() => { }); };
            });
            this.controller = new ResourceController(library, new ResourceDeliveryClient({ current: () => {
                    // The gate is a sibling component, not an injected lifetime dependency.
                    // Native optional lookup keeps installed presets alive while it restarts.
                    const source = ctx.get('wechatResourceSource');
                    if (!source)
                        throw new ResourceError('resources-unavailable', '当前节点连接组件未开启。');
                    return source.current();
                } }));
            // Async readiness must not hold the Loader that is starting this component.
            this.ready = this.restore(ctx, library).finally(() => { this.settled = true; });
            ctx.effect(() => async () => {
                this.lifetime.abort();
                // close cancels in-progress native audits before readiness is joined.
                await Promise.all([this.ready, library.close()]);
            }, 'Private resource presets');
        }
        async restore(ctx, library) {
            const signal = this.lifetime.signal;
            let stop;
            try {
                const loader = ctx.get('loader');
                if (loader?.await)
                    await Promise.race([loader.await(), new Promise(resolve => {
                            stop = resolve;
                            signal.addEventListener('abort', stop, { once: true });
                        })]);
                if (!signal.aborted)
                    await library.start();
            }
            catch { /* An optional local resource failure cannot fail the host. */ }
            finally {
                if (stop)
                    signal.removeEventListener('abort', stop);
            }
        }
        async control(request, signal) {
            signal = AbortSignal.any([signal, this.lifetime.signal]);
            try {
                signal.throwIfAborted();
                if (!this.settled)
                    return { ok: true, value: { supported: true, notice: '本地资源正在准备，请稍后刷新。', items: [] } };
                return { ok: true, value: await this.controller.control(request, signal) };
            }
            catch (error) {
                signal.throwIfAborted();
                return { ok: false, error: error instanceof ResourceError ? { code: error.code, message: error.message }
                        : { code: 'resources-network', message: '资源操作未完成，已安装的资源不受影响。' } };
            }
        }
    };
})();
export { WechatResourcesService };
