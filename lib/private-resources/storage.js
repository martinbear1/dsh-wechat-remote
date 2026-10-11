import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseResourcePreset, resourceError, resourceKey, RESOURCE_MAX_BYTES, validateResourceRelease } from './contract.js';
/** Immutable, plugin-owned files only. Startup never creates directories,
 * repairs files or changes an installed package/profile/session. */
export class ResourceStorage {
    directory;
    constructor(directory) {
        if (!path.isAbsolute(directory))
            throw resourceError('resource-directory-invalid', '资源目录必须是本机绝对路径。');
        this.directory = path.resolve(directory);
    }
    async root(create) {
        if (create)
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
        try {
            const stat = await lstat(this.directory);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw resourceError('resource-storage-invalid', '资源目录不可读取。');
            return true;
        }
        catch (error) {
            if (!create && error.code === 'ENOENT')
                return false;
            throw error;
        }
    }
    async bounded(file, max) {
        const stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max)
            throw resourceError('resource-storage-invalid', '本地资源文件无效。');
        const bytes = await readFile(file);
        if (bytes.length > max)
            throw resourceError('resource-storage-invalid', '本地资源文件无效。');
        return bytes;
    }
    async read(key) {
        if (!/^[a-f0-9]{64}$/.test(key))
            throw resourceError('resource-storage-invalid', '本地资源记录无效。');
        const directory = path.join(this.directory, key), stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw resourceError('resource-storage-invalid', '本地资源记录无效。');
        const receipt = JSON.parse((await this.bounded(path.join(directory, 'receipt.json'), 2048)).toString('utf8'));
        if (receipt.schemaVersion !== 1)
            throw resourceError('resource-storage-invalid', '本地资源记录无效。');
        const release = validateResourceRelease(receipt);
        if (resourceKey(release) !== key)
            throw resourceError('resource-storage-invalid', '本地资源身份不一致。');
        const content = await this.bounded(path.join(directory, 'resource.json'), RESOURCE_MAX_BYTES);
        let enabled = true;
        try {
            const state = JSON.parse((await this.bounded(path.join(directory, 'state.json'), 128)).toString('utf8'));
            if (state.schemaVersion !== 1 || typeof state.enabled !== 'boolean')
                throw resourceError('resource-storage-invalid', '本地资源启用状态无效。');
            enabled = state.enabled;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        return { release, resource: parseResourcePreset(content, release), content, enabled };
    }
    async setEnabled(identity, enabled) {
        await this.root(false);
        const key = resourceKey(identity), saved = await this.read(key);
        if (saved.enabled === enabled)
            return saved;
        const directory = path.join(this.directory, key), staging = path.join(directory, `.state-${randomUUID()}`);
        const file = await open(staging, 'wx', 0o600);
        try {
            try {
                await file.writeFile(JSON.stringify({ schemaVersion: 1, enabled }));
                await file.sync();
            }
            finally {
                await file.close();
            }
            await rename(staging, path.join(directory, 'state.json'));
        }
        finally {
            await rm(staging, { force: true });
        }
        return { ...saved, enabled };
    }
    async scan() {
        if (!await this.root(false))
            return { records: [], invalid: 0 };
        const records = [];
        let invalid = 0;
        for (const entry of await readdir(this.directory, { withFileTypes: true })) {
            if (entry.name.startsWith('.'))
                continue; // An interrupted publish is not an installed resource.
            try {
                records.push(await this.read(entry.name));
            }
            catch {
                invalid++;
            }
        }
        return { records, invalid };
    }
    async save(content, release) {
        parseResourcePreset(content, release);
        await this.root(true);
        const key = resourceKey(release), target = path.join(this.directory, key);
        const existing = async () => {
            const saved = await this.read(key);
            if (saved.release.sha256 !== release.sha256 || saved.release.bytes !== release.bytes)
                throw resourceError('resource-version-conflict', '此版本已安装了不同内容，请发布新版本。');
            return saved;
        };
        try {
            return await existing();
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        const staging = path.join(this.directory, `.pending-${randomUUID()}`);
        await mkdir(staging, { mode: 0o700 });
        try {
            for (const [name, bytes] of [['resource.json', content], ['receipt.json', Buffer.from(JSON.stringify({ schemaVersion: 1, ...release }))]]) {
                const file = await open(path.join(staging, name), 'wx', 0o600);
                try {
                    await file.writeFile(bytes);
                    await file.sync();
                }
                finally {
                    await file.close();
                }
            }
            try {
                await rename(staging, target);
            }
            catch (error) {
                // Another process can have published this exact immutable version.
                try {
                    await lstat(target);
                }
                catch {
                    throw error;
                }
                return existing();
            }
            return this.read(key);
        }
        finally {
            // Only the exact random staging directory created above, never resource data.
            await rm(staging, { recursive: true, force: true });
        }
    }
}
