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
 * WeChat-only acceleration for durable DSH image attachments.
 *
 * DSH's native `session.attachment` remains the authorization boundary and
 * source of truth. After that read succeeds, the plugin encrypts the bytes on
 * the Agent and stores only ciphertext in the private object service. The
 * returned descriptor is usable only by the paired mini program, which obtains
 * a short-lived download ticket through its authenticated control plane.
 *
 * This is an independent Typert Remote. It does not change the DSH/WebUI
 * `session.attachment` contract and it opens no additional port.
 */
import http from 'node:http';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { resolveTypertGateway } from './dsh-protocol-compat.js';
const MAX_BATCH_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_NATIVE_RESPONSE_BYTES = Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 256 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DESCRIPTOR_REFRESH_MARGIN_MS = 60_000;
const MAX_DESCRIPTOR_CACHE = 128;
const BATCH_CONCURRENCY = 2;
const IMAGE_MEDIA_TYPE = /^image\/(png|jpeg|webp|gif)$/;
let WechatAttachmentService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _prepareBatch_decorators;
    return class WechatAttachmentService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _prepareBatch_decorators = [Remote('prepareBatch')];
            __esDecorate(this, null, _prepareBatch_decorators, { kind: "method", name: "prepareBatch", static: false, private: false, access: { has: obj => "prepareBatch" in obj, get: obj => obj.prepareBatch }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        hostContext = __runInitializers(this, _instanceExtraInitializers);
        dshPort;
        timeoutMs;
        storeAttachment;
        readAttachmentOverride;
        cache = new Map();
        pending = new Map();
        constructor(ctx, config = {}) {
            super(ctx, 'wechatAttachment');
            this.hostContext = ctx;
            this.dshPort = Number.isSafeInteger(config.dshPort) && Number(config.dshPort) > 0
                ? Number(config.dshPort)
                : 3080;
            this.timeoutMs = Number.isSafeInteger(config.timeoutMs) && Number(config.timeoutMs) > 0
                ? Number(config.timeoutMs)
                : DEFAULT_TIMEOUT_MS;
            this.storeAttachment = config.storeAttachment;
            this.readAttachmentOverride = config.readAttachment;
        }
        async prepareBatch(request, signal) {
            const validation = validateRequest(request);
            if (validation)
                return { ok: false, error: validation };
            if (!this.storeAttachment) {
                return {
                    ok: false,
                    error: {
                        code: 'attachment-object-unavailable',
                        message: '公网附件对象加速当前不可用，请回退 DSH 原生附件读取',
                    },
                };
            }
            try {
                const output = new Array(request.attachments.length);
                let cursor = 0;
                const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, request.attachments.length) }, async () => {
                    while (cursor < request.attachments.length) {
                        signal.throwIfAborted();
                        const index = cursor;
                        cursor += 1;
                        output[index] = await this.prepareOne(request.sessionId, request.attachments[index], signal);
                    }
                });
                await Promise.all(workers);
                return { ok: true, value: { descriptors: output } };
            }
            catch (error) {
                signal.throwIfAborted();
                const unavailable = error instanceof ObjectTransportUnavailable;
                return {
                    ok: false,
                    error: {
                        code: unavailable ? 'attachment-object-unavailable' : 'attachment-unavailable',
                        message: unavailable
                            ? '公网附件对象加速当前不可用，请回退 DSH 原生附件读取'
                            : messageOf(error),
                    },
                };
            }
        }
        async prepareOne(sessionId, requested, signal) {
            const cacheKey = `${sessionId}\0${requested.attachmentId}`;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now() + DESCRIPTOR_REFRESH_MARGIN_MS) {
                return { attachmentId: requested.attachmentId, descriptor: cached.descriptor };
            }
            const active = this.pending.get(cacheKey);
            if (active)
                return await waitFor(active, signal);
            // Shared work uses its own deadline so one cancelled caller does not abort
            // another caller waiting for the same content-addressed attachment.
            const operationSignal = AbortSignal.timeout(this.timeoutMs);
            const operation = this.prepareFresh(sessionId, requested, operationSignal);
            this.pending.set(cacheKey, operation);
            void operation.finally(() => {
                if (this.pending.get(cacheKey) === operation)
                    this.pending.delete(cacheKey);
            }).catch(() => { });
            return await waitFor(operation, signal);
        }
        async prepareFresh(sessionId, requested, signal) {
            const response = this.readAttachmentOverride
                ? await this.readAttachmentOverride(sessionId, requested.attachmentId, signal)
                : await this.fetchNativeAttachment(sessionId, requested.attachmentId, signal);
            if (!response.ok || !response.value) {
                throw new Error(typeof response.error?.message === 'string'
                    ? response.error.message
                    : 'DSH 原生附件读取失败');
            }
            const decoded = decodeNativeAttachment(response, requested);
            let descriptor;
            try {
                descriptor = await this.storeAttachment(decoded.data, decoded.attachment, signal);
            }
            catch (error) {
                throw new ObjectTransportUnavailable(messageOf(error));
            }
            const expiresAt = descriptor.expiresAt;
            if (!Number.isSafeInteger(expiresAt) || Number(expiresAt) <= Date.now()) {
                throw new ObjectTransportUnavailable('公网对象服务返回了无效的到期时间');
            }
            const cacheKey = `${sessionId}\0${requested.attachmentId}`;
            this.cache.set(cacheKey, { descriptor, expiresAt: Number(expiresAt) });
            while (this.cache.size > MAX_DESCRIPTOR_CACHE) {
                const oldest = this.cache.keys().next().value;
                if (!oldest)
                    break;
                this.cache.delete(oldest);
            }
            return { attachmentId: requested.attachmentId, descriptor };
        }
        fetchNativeAttachment(sessionId, attachmentId, signal) {
            const gateway = resolveTypertGateway(this.hostContext);
            if (gateway) {
                return gateway.invoke({
                    namespace: 'session',
                    method: 'attachment',
                    args: { request: { sessionId, attachmentId } },
                    signal,
                }).then(value => ({ ok: true, value }), error => ({
                    ok: false,
                    error: { message: error instanceof Error ? error.message : String(error) },
                }));
            }
            const body = Buffer.from(JSON.stringify({
                type: 'client-request',
                rpcId: `wechat-attachment-${Date.now().toString(36)}`,
                method: 'session.attachment',
                payload: { sessionId, attachmentId },
            }));
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (callback) => {
                    if (settled)
                        return;
                    settled = true;
                    signal.removeEventListener('abort', abort);
                    callback();
                };
                const request = http.request({
                    host: '127.0.0.1',
                    port: this.dshPort,
                    path: '/api/session.attachment',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': body.length,
                        accept: 'application/json',
                        'accept-encoding': 'identity',
                        'user-agent': 'HarnessRemote-WechatAttachment/1',
                    },
                    timeout: this.timeoutMs,
                }, response => {
                    const chunks = [];
                    let bytes = 0;
                    response.on('data', (chunk) => {
                        bytes += chunk.length;
                        if (bytes > MAX_NATIVE_RESPONSE_BYTES) {
                            response.destroy(new Error('DSH attachment response exceeds the 20 MiB limit'));
                            return;
                        }
                        chunks.push(Buffer.from(chunk));
                    });
                    response.on('end', () => {
                        try {
                            if (response.statusCode !== 200)
                                throw new Error(`DSH attachment HTTP ${response.statusCode || 0}`);
                            const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                            if (!envelope.result || typeof envelope.result.ok !== 'boolean') {
                                throw new Error('DSH attachment returned an invalid response');
                            }
                            finish(() => resolve(envelope.result));
                        }
                        catch (error) {
                            finish(() => reject(error));
                        }
                    });
                    response.on('error', error => finish(() => reject(error)));
                });
                const abort = () => { request.destroy(new Error('Attachment request aborted')); };
                signal.addEventListener('abort', abort, { once: true });
                request.on('timeout', () => request.destroy(new Error('DSH attachment request timed out')));
                request.on('error', error => finish(() => reject(error)));
                request.end(body);
            });
        }
    };
})();
export { WechatAttachmentService };
/** Pure native-contract validator used by regression tests. */
export function decodeNativeAttachment(response, requested) {
    const ref = response.value?.attachment;
    if (!response.ok || !ref || ref.attachmentId !== requested.attachmentId
        || typeof ref.mediaType !== 'string' || !IMAGE_MEDIA_TYPE.test(ref.mediaType)
        || !Number.isSafeInteger(ref.bytes) || Number(ref.bytes) < 1
        || Number(ref.bytes) > MAX_ATTACHMENT_BYTES
        || typeof response.value?.data !== 'string') {
        throw new Error('DSH 原生附件响应无效');
    }
    return {
        data: strictBase64(response.value.data, Number(ref.bytes)),
        attachment: {
            attachmentId: requested.attachmentId,
            mediaType: ref.mediaType,
            ...(typeof ref.name === 'string' && ref.name.length <= 255 ? { name: ref.name } : {}),
        },
    };
}
function validateRequest(request) {
    if (!request || !safeIdentifier(request.sessionId)) {
        return { code: 'invalid-attachment-request', message: '会话标识无效' };
    }
    if (!Array.isArray(request.attachments) || request.attachments.length < 1
        || request.attachments.length > MAX_BATCH_ATTACHMENTS) {
        return { code: 'invalid-attachment-request', message: '附件批次必须包含 1 至 6 张图片' };
    }
    const seen = new Set();
    for (const item of request.attachments) {
        if (!item || !safeIdentifier(item.attachmentId) || seen.has(item.attachmentId)
            || (item.mediaType !== undefined && (typeof item.mediaType !== 'string' || !IMAGE_MEDIA_TYPE.test(item.mediaType)))
            || (item.name !== undefined && (typeof item.name !== 'string' || item.name.length > 255))) {
            return { code: 'invalid-attachment-request', message: '附件批次参数无效' };
        }
        seen.add(item.attachmentId);
    }
    return null;
}
function safeIdentifier(value) {
    return typeof value === 'string' && value.length >= 1 && value.length <= 256
        && !/[\u0000-\u001f\u007f]/.test(value);
}
function strictBase64(value, expectedBytes) {
    if (value.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 8
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new Error('DSH 原生附件数据编码无效');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== expectedBytes)
        throw new Error('DSH 原生附件长度不一致');
    return new Uint8Array(decoded);
}
async function waitFor(promise, signal) {
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason || new Error('Attachment request aborted'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
class ObjectTransportUnavailable extends Error {
}
function messageOf(error) {
    return error instanceof Error && error.message ? error.message : String(error || '附件读取失败');
}
export default WechatAttachmentService;
