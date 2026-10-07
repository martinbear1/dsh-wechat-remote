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
import { FileClawbotStorage } from './storage.js';
import { ClawbotRuntime } from './runtime.js';
import { DshClawbotHost } from './dsh-host.js';
import { ClawbotError } from './contracts.js';
/** Exposed only through the owning native authenticated gateway (or the existing
 * authenticated LAN/E2EE control path). Never a model-callable tool. */
let WechatClawbotService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatClawbotService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        runtime = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx) {
            super(ctx, 'wechatClawbot');
            let storage;
            try {
                storage = new FileClawbotStorage(path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'clawbot'));
                this.runtime = new ClawbotRuntime(storage, new DshClawbotHost(ctx));
                ctx.effect(() => async () => { const runtime = this.runtime; this.runtime = undefined; await runtime?.dispose(); }, 'ClawBot channel');
            }
            catch {
                storage?.close();
                // A broken optional channel cannot break DSH or the other plugin services.
                console.warn('[wechat-clawbot] optional channel unavailable; no host settings changed');
            }
        }
        available() { return Boolean(this.runtime); }
        async control(request, signal) {
            if (!this.runtime)
                return { ok: false, error: { code: 'clawbot-unavailable', message: 'ClawBot 组件尚未就绪，请核对组件状态或本地记录。' } };
            try {
                return { ok: true, value: await this.runtime.control(request, signal) };
            }
            catch (error) {
                signal.throwIfAborted();
                return { ok: false, error: error instanceof ClawbotError ? { code: error.code, message: error.message }
                        : { code: 'clawbot-operation-failed', message: '操作未完成，请刷新核对；不要重复提交或重新扫码。' } };
            }
        }
    };
})();
export { WechatClawbotService };
