import { parseResourcePreset, ResourceError, resourceError, resourceIdValid, resourceKey, resourcePresetId, resourceVersionValid, validateResourceRelease } from './contract.js';
import { NativeResourceRegistry } from './native.js';
import { ResourceStorage } from './storage.js';
/** Offline local library. Account entitlements admit downloads outside this
 * class; they never revoke an already installed preset or stop an Agent. */
export class PrivateResourceLibrary {
    storage;
    native;
    entries = new Map();
    problems = [];
    tail = Promise.resolve();
    started = false;
    closed = false;
    closing;
    constructor(host, directory, options = {}) {
        this.storage = new ResourceStorage(directory);
        this.native = new NativeResourceRegistry(host, options);
    }
    queue(run) {
        const result = this.tail.then(() => { if (this.closed)
            throw resourceError('resource-library-closed', '资源组件已停止。'); return run(); });
        this.tail = result.catch(() => { });
        return result;
    }
    start() {
        return this.queue(async () => {
            if (this.started)
                return;
            this.started = true;
            try {
                const stored = await this.storage.scan();
                if (stored.invalid)
                    this.problems = ['部分本地资源无法读取；其他资源不受影响。'];
                for (const record of stored.records) {
                    if (this.closed)
                        break;
                    await this.activate(record);
                }
            }
            catch {
                this.problems = ['本地资源目录暂不可读取；其他功能不受影响。'];
            }
        });
    }
    list() { return [...this.entries.values()].map(value => ({ ...value })); }
    issues() { return [...this.problems]; }
    async activate(stored) {
        const { resource, release } = stored;
        const entry = { ...release, presetId: resourcePresetId(resource), name: resource.name,
            description: resource.description, basePreset: resource.basePreset, enabled: stored.enabled, status: 'unavailable' };
        try {
            if (stored.enabled) {
                await this.native.register(resource);
                entry.status = 'installed';
            }
            else {
                await this.native.unregister(resource);
                entry.status = 'disabled';
            }
        }
        catch (error) {
            entry.message = error instanceof ResourceError ? error.message : '此预设暂不可用，请核对 DSH 版本与基础模式。';
        }
        this.entries.set(resourceKey(resource), entry);
        return { ...entry };
    }
    install(bytes, expected) {
        // Copy before the asynchronous queue so a caller cannot change verified bytes.
        const content = Buffer.from(bytes), release = validateResourceRelease(expected);
        parseResourcePreset(content, release);
        return this.queue(async () => {
            const stored = await this.storage.save(content, release);
            return this.activate(stored);
        });
    }
    setEnabled(resourceId, version, enabled) {
        if (!resourceIdValid(resourceId) || !resourceVersionValid(version) || typeof enabled !== 'boolean')
            throw resourceError('resource-state-invalid', '资源启用设置无效。');
        return this.queue(async () => this.activate(await this.storage.setEnabled({ resourceId, version }, enabled)));
    }
    close() {
        if (this.closing)
            return this.closing;
        this.closed = true;
        // Cancel native diagnostics before joining work that may await the Loader.
        const closing = this.native.close();
        return this.closing = Promise.all([this.tail, closing]).then(() => { });
    }
}
