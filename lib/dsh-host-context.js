/** Launcher-owned facts, not a runtime router. No I/O except reading the
 * running host's package manifest; no sockets, discovery or background work. */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
const profiles = new WeakMap();
const versions = new WeakMap();
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
/** DSH supplies this service before mounting profile plugins. Missing is the
 * legacy compatibility case; malformed is NOT permission to use Web's state.
 * Retire absence fallback only when pre-profileContext hosts leave support. */
export function dshProfileFacts(ctx) {
    const value = ctx?.get('profileContext');
    if (value === undefined || value === null) {
        if (process.versions.electron)
            throw new Error('桌面宿主未提供运行实例信息，未使用 Web 配置');
        return;
    }
    if (typeof value !== 'object')
        throw new Error('DSH 运行实例信息无效，未使用其他实例的配置');
    const cached = profiles.get(value);
    if (cached)
        return cached;
    const row = value;
    if (typeof row.name !== 'string' || !row.name || row.name.length > 80
        || /[\\/\u0000-\u001f]/.test(row.name) || ['.', '..', 'node_modules'].includes(row.name)
        || !['home', 'dir', 'installAnchor'].every(key => typeof row[key] === 'string'
            && path.isAbsolute(row[key]) && !row[key].includes('\0'))) {
        throw new Error('DSH 运行实例信息不完整，未使用其他实例的配置');
    }
    const facts = Object.freeze({ name: row.name, home: path.normalize(row.home),
        dir: path.normalize(row.dir), installAnchor: path.normalize(row.installAnchor) });
    profiles.set(value, facts);
    return facts;
}
/** The Desktop launcher, not a CLI worker, owns its install/restart lifecycle. */
export function desktopOwnsLifecycle(ctx) {
    return Boolean(process.versions.electron) || dshProfileFacts(ctx)?.name === 'desktop';
}
/** Prefer the actual bundled runtime. Never search PATH: another CLI on this
 * computer can have a different protocol from the running Desktop host. */
export function hostRuntimeVersion(ctx, entry = process.argv[1]) {
    const profile = dshProfileFacts(ctx);
    if (profile) {
        const cached = versions.get(profile);
        if (cached)
            return cached;
        let manifest;
        try {
            manifest = JSON.parse(readFileSync(profile.installAnchor, 'utf8'));
        }
        catch {
            throw new Error('无法读取当前 DSH 的运行版本，未使用其他安装版本代替');
        }
        if (manifest.name !== '@deepseek-ai/dsh' || typeof manifest.version !== 'string'
            || !versionPattern.test(manifest.version))
            throw new Error('当前 DSH 的运行版本信息无效');
        versions.set(profile, manifest.version);
        return manifest.version;
    }
    // COMPAT: old CLI/source compositions do not expose profileContext. Retain
    // the running-entry ancestor lookup, without scanning other installations.
    if (!entry)
        return;
    let directory;
    try {
        directory = path.dirname(realpathSync(entry));
    }
    catch {
        return;
    }
    for (let depth = 0; depth < 8; depth++) {
        try {
            const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
            if (manifest.name === '@deepseek-ai/dsh') {
                if (typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) {
                    throw new Error('invalid host version');
                }
                return manifest.version;
            }
        }
        catch { /* old entry ancestor may not be a package */ }
        const parent = path.dirname(directory);
        if (parent === directory)
            break;
        directory = parent;
    }
}
