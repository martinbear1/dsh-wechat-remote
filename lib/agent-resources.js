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
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { resolveTypertGateway } from './dsh-protocol-compat.js';
import { exportSessionArchive, sessionExportAvailable } from './dsh-session-export.js';
const MAX_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 192 * 1024;
const TTL = 5 * 60_000;
/** Neutral wire vocabulary. Native paths and native file APIs terminate here. */
let AgentResourcesService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _capabilities_decorators;
    let _list_decorators;
    let _resolve_decorators;
    let _prepareArchive_decorators;
    let _prepare_decorators;
    let _chunk_decorators;
    let _release_decorators;
    return class AgentResourcesService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _capabilities_decorators = [Remote('capabilities')];
            _list_decorators = [Remote('list')];
            _resolve_decorators = [Remote('resolve')];
            _prepareArchive_decorators = [Remote('prepareArchive')];
            _prepare_decorators = [Remote('prepare')];
            _chunk_decorators = [Remote('chunk')];
            _release_decorators = [Remote('release')];
            __esDecorate(this, null, _capabilities_decorators, { kind: "method", name: "capabilities", static: false, private: false, access: { has: obj => "capabilities" in obj, get: obj => obj.capabilities }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resolve_decorators, { kind: "method", name: "resolve", static: false, private: false, access: { has: obj => "resolve" in obj, get: obj => obj.resolve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prepareArchive_decorators, { kind: "method", name: "prepareArchive", static: false, private: false, access: { has: obj => "prepareArchive" in obj, get: obj => obj.prepareArchive }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prepare_decorators, { kind: "method", name: "prepare", static: false, private: false, access: { has: obj => "prepare" in obj, get: obj => obj.prepare }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _chunk_decorators, { kind: "method", name: "chunk", static: false, private: false, access: { has: obj => "chunk" in obj, get: obj => obj.chunk }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _release_decorators, { kind: "method", name: "release", static: false, private: false, access: { has: obj => "release" in obj, get: obj => obj.release }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        host = __runInitializers(this, _instanceExtraInitializers);
        config;
        secret = randomBytes(32);
        snapshots = new Map();
        active = 0;
        constructor(host, config = {}) {
            super(host, 'agentResources');
            this.host = host;
            this.config = config;
            host.effect(() => {
                const timer = setInterval(() => this.prune(), TTL);
                timer.unref();
                return () => { clearInterval(timer); this.snapshots.clear(); };
            });
        }
        async native(method, scope, args, signal) {
            if (typeof scope !== 'string' || !scope || scope.length > 256)
                throw new Error('会话无效');
            signal.throwIfAborted();
            const input = { workspaceFileScopeId: scope, ...args };
            if (this.config.invoke)
                return this.config.invoke(method, input, signal);
            const gateway = resolveTypertGateway(this.host);
            if (!gateway)
                throw new Error('此节点尚不支持文件浏览');
            return await gateway.invoke({ namespace: 'workspaceFiles', method, args: input, signal });
        }
        id(scope, location, kind) {
            const data = Buffer.from(JSON.stringify({ scope, location, kind, expires: Date.now() + 60 * 60_000 })).toString('base64url');
            return data + '.' + createHmac('sha256', this.secret).update(data).digest('base64url');
        }
        target(scope, id, kind) {
            if (typeof id !== 'string' || id.length > 12000)
                throw new Error('文件引用无效，请刷新');
            const [data, signature, extra] = id.split('.');
            const expected = createHmac('sha256', this.secret).update(data || '').digest();
            const actual = Buffer.from(signature || '', 'base64url');
            if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected))
                throw new Error('文件引用无效，请刷新');
            const value = JSON.parse(Buffer.from(data, 'base64url').toString());
            if (value.scope !== scope || value.expires < Date.now() || (kind && value.kind !== kind))
                throw new Error('文件引用已失效，请刷新');
            return value;
        }
        entry(scope, parent, item) {
            if (typeof item.name !== 'string' || !item.name || /[\\/\x00-\x1f]/.test(item.name) || item.name === '.' || item.name === '..')
                throw new Error('无效文件名');
            const location = [parent, item.name].filter(Boolean).join('/');
            return { id: this.id(scope, location, item.type), name: item.name, kind: item.type,
                bytes: Number.isSafeInteger(item.size) ? item.size : null, parentId: this.id(scope, parent || '.', 'directory') };
        }
        async guarded(operation) {
            try {
                return { ok: true, valueJson: JSON.stringify(await operation()) };
            }
            catch (error) {
                const value = error && typeof error === 'object' ? error : null;
                const code = value?.code === 'object_backend_unavailable'
                    ? 'object_backend_unavailable'
                    : 'resource-unavailable';
                const message = typeof value?.message === 'string' ? value.message : '文件不可用';
                return { ok: false, error: { code, message } };
            }
        }
        async capabilities(request, signal) {
            return this.guarded(async () => {
                signal.throwIfAborted();
                // Export does not depend on a workspace still being browsable. Older
                // clients keep their existing browse capability and unchanged response.
                if (request.purpose === 'sessionArchive')
                    return { schema: 'agent.resources.v1', sessionArchive: sessionExportAvailable(this.host) };
                await this.native('list', request.scope, { path: '.' }, signal);
                return { schema: 'agent.resources.v1', browse: true, resolve: true, download: true,
                    delivery: ['chunks', ...(this.config.store ? ['object'] : [])], maxBytes: MAX_BYTES, chunkBytes: CHUNK_BYTES };
            });
        }
        async list(request, signal) {
            return this.guarded(async () => {
                const location = request.directoryId ? this.target(request.scope, request.directoryId, 'directory').location : '.';
                const value = await this.native('list', request.scope, { path: location }, signal);
                const parent = value.path || '';
                const cursor = request.cursor ?? 0;
                if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 2000)
                    throw new Error('目录分页无效');
                const sorted = (value.entries || []).filter((e) => e.type === 'file' || e.type === 'directory')
                    .sort((a, b) => Number(b.type === 'directory') - Number(a.type === 'directory') || a.name.localeCompare(b.name));
                return { schema: 'agent.resources.v1', directoryId: this.id(request.scope, parent || '.', 'directory'),
                    parentId: parent ? this.id(request.scope, path.posix.dirname(parent), 'directory') : null,
                    label: parent || '工作区', truncated: value.truncated === true,
                    nextCursor: cursor + 100 < sorted.length ? cursor + 100 : null,
                    entries: sorted.slice(cursor, cursor + 100).map((e) => this.entry(request.scope, parent, e)) };
            });
        }
        async resolve(request, signal) {
            return this.guarded(async () => {
                let reference = request.reference;
                if (typeof reference !== 'string' || reference.length > 4096 || /[\x00-\x1f]/.test(reference))
                    throw new Error('文件链接无效');
                // DSH's URI is decoded only in the adapter, never in the generic client.
                if (reference.startsWith('dsh-resource://file/session/')) {
                    const parts = reference.slice('dsh-resource://file/session/'.length).split('/');
                    if (decodeURIComponent(parts.shift() || '') !== request.scope)
                        throw new Error('文件不属于当前会话');
                    reference = decodeURIComponent(parts.join('/'));
                }
                const paths = /^[A-Za-z]:[\\/]/.test(reference) ? path.win32 : path.posix;
                const name = paths.basename(reference);
                // Unlike native stat/read, list enforces workspace containment, including
                // parent symlinks. Only an actually listed file can receive a signed ID.
                const directory = await this.native('list', request.scope, { path: paths.dirname(reference) }, signal);
                const item = (directory.entries || []).find((e) => e.name === name && e.type === 'file');
                if (!item)
                    throw new Error('文件不在当前工作区、已移动或已删除');
                return this.entry(request.scope, directory.path || '', item);
            });
        }
        prune() {
            for (const [key, value] of this.snapshots)
                if (value.expires <= Date.now())
                    this.snapshots.delete(key);
        }
        checkPreparation(delivery, signal) {
            signal.throwIfAborted();
            if (delivery !== 'chunks' && delivery !== 'object')
                throw new Error('文件传输方式无效');
            if (delivery === 'object' && !this.config.store)
                throw new Error('公网文件下载暂不可用');
            if (this.active >= 2)
                throw new Error('有文件正在准备，请稍后重试');
        }
        /** Workspace files and native archives share one bounded transfer lifecycle. */
        async deliver(scope, data, metadata, delivery, signal) {
            signal.throwIfAborted();
            const value = { ...metadata, bytes: data.length,
                sha512: createHash('sha512').update(data).digest('hex'),
                sha256: createHash('sha256').update(data).digest('hex') };
            if (delivery === 'object' && data.length) {
                const descriptor = await this.config.store(data, signal);
                signal.throwIfAborted();
                return { ...value, delivery: 'object', descriptor };
            }
            this.prune();
            const used = [...this.snapshots.values()].reduce((total, item) => total + item.data.length, 0);
            if (this.snapshots.size >= 16 || used + data.length > 48 * 1024 * 1024)
                throw new Error('文件下载较多，请稍后再试');
            const transferId = randomBytes(24).toString('base64url');
            const expiresAt = Date.now() + TTL;
            this.snapshots.set(transferId, { scope, data, expires: expiresAt });
            return { ...value, delivery: 'chunks', transferId, expiresAt, chunkBytes: CHUNK_BYTES };
        }
        async prepareArchive(request, signal) {
            return this.guarded(async () => {
                this.checkPreparation(request.delivery, signal);
                this.active++;
                try {
                    const archive = await exportSessionArchive(this.host, request.scope, signal, MAX_BYTES);
                    return await this.deliver(request.scope, archive.data, { name: archive.name }, request.delivery, signal);
                }
                finally {
                    this.active--;
                }
            });
        }
        async prepare(request, signal) {
            return this.guarded(async () => {
                this.checkPreparation(request.delivery, signal);
                const file = this.target(request.scope, request.id, 'file');
                this.active++;
                try {
                    // Revalidate directory containment on each export, not just when listed.
                    await this.native('list', request.scope, { path: path.posix.dirname(file.location) }, signal);
                    const before = await this.native('stat', request.scope, { path: file.location }, signal);
                    if (typeof before.absolutePath !== 'string' || !before.absolutePath || typeof before.version !== 'string')
                        throw new Error('节点文件信息不完整');
                    const paths = /^[A-Za-z]:[\\/]/.test(before.absolutePath) ? path.win32 : path.posix;
                    // Pin the canonical file and have native containment check its parent
                    // again. A renamed parent/symlink cannot redirect later byte reads.
                    await this.native('list', request.scope, { path: paths.dirname(before.absolutePath) }, signal);
                    if (!Number.isSafeInteger(before.bytes) || before.bytes < 0 || before.bytes > MAX_BYTES)
                        throw new Error('手机暂支持下载 20 MB 以内的文件，请在电脑查看此文件');
                    const data = Buffer.alloc(before.bytes);
                    for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
                        const value = await this.native('readBytes', request.scope, { path: before.absolutePath, range: { offset, length: Math.min(CHUNK_BYTES, data.length - offset) } }, signal);
                        const chunk = Buffer.from(value.data || '', 'base64');
                        if (value.absolutePath !== before.absolutePath || value.version !== before.version || value.offset !== offset || chunk.length !== Math.min(CHUNK_BYTES, data.length - offset))
                            throw new Error('文件正在变化，请生成完成后重试');
                        chunk.copy(data, offset);
                    }
                    const after = await this.native('stat', request.scope, { path: file.location }, signal);
                    if (after.absolutePath !== before.absolutePath || after.version !== before.version || after.bytes !== before.bytes)
                        throw new Error('文件正在变化，请重试');
                    return await this.deliver(request.scope, data, { name: path.posix.basename(file.location), version: before.version }, request.delivery, signal);
                }
                finally {
                    this.active--;
                }
            });
        }
        async chunk(request, signal) {
            return this.guarded(async () => {
                signal.throwIfAborted();
                this.prune();
                const item = this.snapshots.get(request.transferId);
                if (!item || item.scope !== request.scope)
                    throw new Error('下载已过期，请重新打开文件');
                if (!Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset > item.data.length || request.offset % CHUNK_BYTES !== 0)
                    throw new Error('文件分块无效');
                const data = item.data.subarray(request.offset, request.offset + CHUNK_BYTES);
                return { offset: request.offset, data: data.toString('base64'), eof: request.offset + data.length === item.data.length };
            });
        }
        async release(request) {
            if (this.snapshots.get(request.transferId)?.scope === request.scope)
                this.snapshots.delete(request.transferId);
            return { ok: true, valueJson: '{"released":true}' };
        }
    };
})();
export { AgentResourcesService };
/** Optional presentation facet; unknown native events still retain their seq. */
export function resourcePresentation(event) {
    if (event.type !== 'deliverables/presented' || !Array.isArray(event.data?.files))
        return undefined;
    return { schema: 'agent.resources.v1', turn: event.data.turn, files: event.data.files.slice(0, 32)
            .filter((f) => typeof f.path === 'string' && f.path.length <= 4096)
            .map((f) => ({ reference: f.path, name: f.path.split(/[\\/]/).pop(), description: typeof f.description === 'string' ? f.description.slice(0, 256) : '' })) };
}
