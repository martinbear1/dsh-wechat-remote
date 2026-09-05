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
/**
 * 微信小程序专用的只读 Host 元信息。
 *
 * DSH 原生 host.describe 当前没有电脑名称字段，因此不能把客户端需要的
 * 字段伪造进官方契约。这个独立 Typert Remote 只暴露微信端连接诊断所需的
 * 最小信息；它沿用 DSH Remote 网关与微信 gate 的 Bearer 鉴权，不修改
 * DSH/WebUI 的设置、会话或目录能力。
 */
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { loadAgentDescriptor } from './agent-metadata.js';
function installedPluginVersion() {
    try {
        const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        return typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown';
    }
    catch (error) {
        return 'unknown';
    }
}
/** Host-only, authenticated, read-only metadata for the WeChat client. */
let WechatHostInfoService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    return class WechatHostInfoService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote('describe')];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        gateRuntime = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, config = {}) {
            super(ctx, 'wechatHost');
            this.gateRuntime = config.gateRuntime;
        }
        async describe(request, signal) {
            void request;
            signal.throwIfAborted();
            const descriptor = loadAgentDescriptor();
            return {
                ok: true,
                value: {
                    computerName: hostname(),
                    pluginVersion: installedPluginVersion(),
                    hostArch: process.arch,
                    updateProtocolVersion: 1,
                    descriptorVersion: descriptor.schemaVersion,
                    hostId: descriptor.hostId,
                    agentInstanceId: descriptor.agentInstanceId,
                    agentKind: descriptor.agentKind,
                    agentName: descriptor.agentName,
                    agentVersion: descriptor.agentVersion,
                    hostPlatform: descriptor.hostPlatform,
                    capabilities: descriptor.capabilities,
                    ...(this.gateRuntime ? { gate: this.gateRuntime() } : {}),
                },
            };
        }
    };
})();
export { WechatHostInfoService };
export default WechatHostInfoService;
