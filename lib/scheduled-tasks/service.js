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
import { NativeScheduledTasks, ScheduleAdapterError, scheduledError } from './native.js';
/** Only mounted behind the existing owner-authenticated Host transport. This
 * service never enables the official plugin or installs a second scheduler. */
let WechatSchedulesService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _control_decorators;
    return class WechatSchedulesService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _control_decorators = [Remote('control')];
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        adapter = __runInitializers(this, _instanceExtraInitializers);
        lifetime = new AbortController();
        constructor(ctx) {
            super(ctx, 'wechatSchedules');
            this.adapter = new NativeScheduledTasks(ctx);
            const publish = () => {
                if (!this.lifetime.signal.aborted)
                    ctx.emit('wechatSchedules/changed', { enabled: !!this.adapter.status().enabled });
            };
            // Optional injection tracks the native service lifetime, not a user's
            // configuration row. No timer, catalog polling, transcript reads or cache.
            ctx.inject(['schedule'], scope => {
                const emit = () => publish();
                const dispose = scope.on('schedule/changed', emit);
                publish();
                return () => { dispose(); queueMicrotask(publish); };
            });
            ctx.effect(() => () => { this.lifetime.abort(); this.adapter.close(); });
        }
        /** In-process host bootstrap only: synchronous and always live. This is not
         * another Remote or an eager catalog read on the connection's critical path. */
        status() { return this.adapter.status(); }
        async control(request, signal) {
            const combined = AbortSignal.any([signal, this.lifetime.signal]);
            try {
                combined.throwIfAborted();
                if (!request || typeof request.action !== 'string' || request.action.length > 32
                    || request.inputJson !== undefined && (typeof request.inputJson !== 'string' || Buffer.byteLength(request.inputJson, 'utf8') > 512 * 1024)) {
                    throw new ScheduleAdapterError('invalid_request', '请求内容超出手机端支持范围。');
                }
                let input;
                try {
                    input = JSON.parse(request.inputJson || '{}');
                }
                catch {
                    throw new ScheduleAdapterError('invalid_request', '请求格式无效。');
                }
                const value = await this.adapter.control(request.action, input, combined);
                // Deliberately do not recheck cancellation after a native mutation:
                // accepted writes can commit despite disconnect; never report rollback.
                const valueJson = JSON.stringify(value);
                if (Buffer.byteLength(valueJson, 'utf8') > 1024 * 1024)
                    throw new ScheduleAdapterError('response_too_large', '该任务信息较大，请到电脑端查看。');
                return { ok: true, valueJson };
            }
            catch (error) {
                return { ok: false, error: scheduledError(error) };
            }
        }
    };
})();
export { WechatSchedulesService };
