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
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { resolveTypertGateway } from './dsh-protocol-compat.js';
import { resolveDshSessionAddress } from './dsh-session-address.js';
/** Native receipt semantics stay adapter-owned. Clients treat this signed,
 * short-lived, scope-bound token as opaque (it is not a secret or file URL). */
let AgentInputsService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _capabilities_decorators;
    let _upload_decorators;
    return class AgentInputsService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _capabilities_decorators = [Remote('capabilities')];
            _upload_decorators = [Remote('upload')];
            __esDecorate(this, null, _capabilities_decorators, { kind: "method", name: "capabilities", static: false, private: false, access: { has: obj => "capabilities" in obj, get: obj => obj.capabilities }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _upload_decorators, { kind: "method", name: "upload", static: false, private: false, access: { has: obj => "upload" in obj, get: obj => obj.upload }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        config;
        secret = randomBytes(32);
        active = 0;
        constructor(host, config = {}) {
            super(host, 'agentInputs');
            this.host = host;
            this.config = config;
        }
        async gateway(scope, signal) {
            const gateway = this.config.gateway || resolveTypertGateway(this.host);
            if (!gateway || !(this.config.supported ?? !!this.host.get('fileUploads')))
                throw Error('此节点尚不支持文件附件');
            if (typeof scope !== 'string' || (await resolveDshSessionAddress(gateway, scope, signal)).kind !== 'session')
                throw Error('此会话暂不支持文件附件');
            return gateway;
        }
        async guarded(fn) {
            try {
                return { ok: true, valueJson: JSON.stringify(await fn()) };
            }
            catch (e) {
                return { ok: false, error: { code: 'input-unavailable', message: e instanceof Error ? e.message : '附件不可用' } };
            }
        }
        async capabilities(request, signal) {
            return this.guarded(async () => {
                await this.gateway(request.scope, signal);
                return { schema: 'agent.inputs.v1', files: true, maxBytes: 10 * 1024 * 1024, maxFiles: 6, delivery: ['inline', ...(this.config.load ? ['object'] : [])] };
            });
        }
        async upload(request, signal) {
            return this.guarded(async () => {
                const gateway = await this.gateway(request.scope, signal);
                if (typeof request.name !== 'string' || !request.name.trim() || request.name.length > 160 || /[\\/\x00-\x1f]/.test(request.name))
                    throw Error('附件文件名无效');
                if (this.active >= 2)
                    throw Error('正在准备其他附件，请稍后重试');
                this.active++;
                try {
                    let data;
                    if (request.descriptorJson !== undefined) {
                        if (request.data !== undefined || !this.config.load || request.descriptorJson.length > 8192)
                            throw Error('附件传输参数无效');
                        const descriptor = JSON.parse(request.descriptorJson);
                        if (descriptor.contentKind !== 'artifact' || !Number.isSafeInteger(descriptor.plainBytes) || descriptor.plainBytes < 1 || descriptor.plainBytes > 10 * 1024 * 1024)
                            throw Error('附件大小无效');
                        data = await this.config.load(descriptor, signal);
                    }
                    else {
                        if (typeof request.data !== 'string' || request.data.length > 14 * 1024 * 1024)
                            throw Error('附件数据无效');
                        const bytes = Buffer.from(request.data, 'base64');
                        if (bytes.toString('base64') !== request.data)
                            throw Error('附件编码无效');
                        data = bytes;
                    }
                    if (data.length < 1 || data.length > 10 * 1024 * 1024)
                        throw Error('附件需为 10 MB 以内的非空文件');
                    signal.throwIfAborted();
                    const value = await gateway.invoke({ namespace: 'fileUploads', method: 'upload', args: { agentId: request.scope, request: { data: Buffer.from(data).toString('base64'), name: request.name } }, signal });
                    if (typeof value?.receiptId !== 'string' || !value.receiptId)
                        throw Error('节点未确认附件保存');
                    const encoded = Buffer.from(JSON.stringify({ scope: request.scope, receiptId: value.receiptId, expires: Date.now() + 30 * 60_000 })).toString('base64url');
                    const token = encoded + '.' + createHmac('sha256', this.secret).update(encoded).digest('base64url');
                    return { schema: 'agent.inputs.v1', token, name: request.name, bytes: data.length };
                }
                finally {
                    this.active--;
                }
            });
        }
        resolve(scope, token) {
            if (typeof token !== 'string' || token.length > 4096)
                throw Error('附件已失效，请重新选择');
            const [encoded, mac, extra] = token.split('.');
            const actual = Buffer.from(mac || '', 'base64url'), expected = createHmac('sha256', this.secret).update(encoded).digest();
            if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected))
                throw Error('附件凭证无效');
            const value = JSON.parse(Buffer.from(encoded, 'base64url').toString());
            if (value.scope !== scope || value.expires < Date.now())
                throw Error('附件不属于此会话或已过期，请重新选择');
            return { type: 'file', receiptId: value.receiptId };
        }
    };
})();
export { AgentInputsService };
