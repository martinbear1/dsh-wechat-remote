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
import { HistoryImportController, importError } from './controller.js';
import { ImportReceipts } from './receipts.js';
import { nativeCapabilities, commitNativeImport, inspectNativeImport } from './native.js';
import { parseImportSource } from './parse.js';
import { readPublicShare } from './share.js';
import { FeatureAccessError, featureMessage, hostFeatureAccess } from '../feature-access.js';
/** A separate optional RPC behind the existing owner-authenticated transport.
 * No replacement of native session.create/history, no hooks in chat execution,
 * no additional server/listener/cloud service. Presets are managed by the
 * resource library, not registered as a side effect of importing history. */
let WechatImportService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatImportService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        controller = __runInitializers(this, _instanceExtraInitializers);
        constructor(host, config) {
            super(host, 'wechatImport');
            this.controller = new HistoryImportController({
                capabilities: async () => {
                    const native = await nativeCapabilities(host);
                    try {
                        const access = hostFeatureAccess(host);
                        try {
                            await access.refresh();
                        }
                        catch { /* show unavailable without denying read-only capability discovery */ }
                        return { ...native, enabled: access.historyImportEnabled(), access: access.grant('history_import', false) };
                    }
                    catch {
                        return { ...native, enabled: false, access: { allowed: false, reason: 'unavailable', validUntil: null, message: featureMessage('unavailable') } };
                    }
                },
                authorize: signal => hostFeatureAccess(host).authorizeHistoryImport(signal),
                owner: async (signal) => { try {
                    return await hostFeatureAccess(host).currentOwner(signal);
                }
                catch {
                    signal.throwIfAborted();
                    return undefined;
                } },
                parse: parseImportSource, share: readPublicShare, loadObject: config.loadObject,
                commit: (request, signal, beforeCreate) => commitNativeImport(host, request, signal, beforeCreate),
                inspect: (request, signal) => inspectNativeImport(host, request, signal),
                receipts: new ImportReceipts(config.receiptDirectory),
            });
            host.effect(() => () => this.controller.dispose());
        }
        async control(request, signal) {
            try {
                if (typeof request.action !== 'string' || request.action.length > 32 || (request.inputJson?.length ?? 0) > 270000)
                    throw new Error('invalid-request');
                const result = await this.controller.control(request.action, JSON.parse(request.inputJson || '{}'), signal);
                return { ok: true, valueJson: JSON.stringify(result) };
            }
            catch (error) {
                return { ok: false, error: error instanceof FeatureAccessError ? { code: error.code, message: error.message } : importError(error) };
            }
        }
    };
})();
export { WechatImportService };
