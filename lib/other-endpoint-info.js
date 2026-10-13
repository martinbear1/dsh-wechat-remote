/** Optional, read-only display of the other standard profile on this computer.
 * No process/port discovery, startup work, updater state, or profile mutation.
 * The caller cannot supply a path, profile name, catalog URL or release channel. */
import { open } from 'node:fs/promises';
import path from 'node:path';
import { boundedFetch } from './update-download.js';
import { compareVersions, validateCatalog } from './update-policy.js';
const packages = ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote'];
const catalogUrl = 'https://relay.xyxfood.xyz/v1/update-policy';
const validVersion = (value) => {
    if (typeof value !== 'string' || value.length > 80)
        return false;
    try {
        compareVersions(value, value);
        return true;
    }
    catch {
        return false;
    }
};
const record = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
/** Fixed filenames only. Never scan installations, parse user configuration,
 * follow package-provided paths, or read pairing/session/identity records. */
async function manifest(file, signal) {
    signal.throwIfAborted();
    let handle;
    try {
        handle = await open(file, 'r');
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 256 * 1024)
            throw Error('Invalid manifest');
        // Bound the read itself, not only the earlier stat (a package may change).
        const buffer = Buffer.alloc(256 * 1024 + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        signal.throwIfAborted();
        if (bytesRead > 256 * 1024)
            throw Error('Invalid manifest');
        const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
        if (!record(value))
            throw Error('Invalid manifest');
        return value;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    finally {
        await handle?.close();
    }
}
/** Compare only published stable releases with the OTHER installed version.
 * Missing evidence stays unknown; this advisory never admits an installation. */
export function otherEndpointStableUpdate(raw, pluginVersion, dshVersion, platform, now = Date.now()) {
    try {
        const catalog = validateCatalog(raw);
        if (!validVersion(pluginVersion) || catalog.expiresAt <= now || catalog.issuedAt > now + 300000)
            return { state: 'unknown' };
        if (dshVersion && catalog.retiredDsh.includes(dshVersion))
            return { state: 'unknown' };
        const candidates = catalog.releases.filter(release => release.channel === 'stable'
            && compareVersions(release.version, pluginVersion) > 0)
            .sort((a, b) => compareVersions(b.version, a.version));
        for (const release of candidates) {
            const restrictions = catalog.blocked.filter(row => row.pluginVersion === release.version
                && (!row.platforms || row.platforms.includes(platform)));
            // Without another host's DSH version, a version-specific restriction
            // cannot truthfully be presented as either available or unavailable.
            if (restrictions.some(row => row.dsh && !dshVersion))
                return { state: 'unknown' };
            if (restrictions.some(row => !row.dsh || row.dsh.includes(dshVersion)))
                continue;
            return { state: 'available', targetVersion: release.version };
        }
        return { state: 'none' };
    }
    catch {
        return { state: 'unknown' };
    }
}
export async function readOtherEndpointInfo(options) {
    const { home, scope, signal } = options;
    const target = scope === 'desktop' ? 'web' : scope === 'web' || scope === 'default' ? 'desktop' : undefined;
    const unknown = { ...(target ? { scope: target } : {}), state: 'unknown',
        pluginState: 'unknown', update: { state: 'unknown' } };
    if (!target || !path.isAbsolute(home))
        return unknown;
    try {
        signal.throwIfAborted();
        const directory = path.join(home, 'profiles', target);
        const profile = await manifest(path.join(directory, 'package.json'), signal);
        if (!profile)
            return { scope: target, state: 'not-found', pluginState: 'unknown', update: { state: 'unknown' } };
        if ((profile.dependencies !== undefined && !record(profile.dependencies))
            || (profile.dsh !== undefined && !record(profile.dsh))
            || (profile.dsh?.profile !== undefined && !record(profile.dsh.profile)))
            return unknown;
        const bundles = profile.dsh?.profile?.bundles ?? [];
        if (!Array.isArray(bundles) || bundles.some(value => typeof value !== 'string'))
            return unknown;
        const referenced = (name) => Object.hasOwn(profile.dependencies ?? {}, name) || bundles.includes(name);
        const owners = packages.filter(referenced);
        const result = { scope: target, state: 'available',
            pluginState: owners.length ? 'unknown' : 'not-installed', update: { state: owners.length ? 'unknown' : 'not-installed' } };
        if (referenced('@deepseek-ai/dsh')) {
            try {
                const dsh = await manifest(path.join(directory, 'node_modules', '@deepseek-ai/dsh/package.json'), signal);
                if (dsh?.name === '@deepseek-ai/dsh' && validVersion(dsh.version))
                    result.dshVersion = dsh.version;
            }
            catch {
                signal.throwIfAborted(); /* Optional DSH metadata must not mask the installed plugin. */
            }
        }
        if (owners.length !== 1)
            return result;
        const installed = await manifest(path.join(directory, 'node_modules', owners[0], 'package.json'), signal);
        if (installed?.name !== owners[0] || !validVersion(installed.version))
            return result;
        result.pluginState = 'installed';
        result.pluginVersion = installed.version;
        // Never use HARNESS_REMOTE_UPDATE_CATALOG or a current-end preview target.
        // The request is made only after the user opens this optional summary.
        try {
            const fetcher = (input, init) => (options.fetcher ?? fetch)(input, {
                ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
            });
            const bytes = await boundedFetch(catalogUrl, 256 * 1024, fetcher);
            signal.throwIfAborted();
            const platform = options.platform ?? (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform);
            result.update = otherEndpointStableUpdate(JSON.parse(bytes.toString('utf8')), result.pluginVersion, result.dshVersion, platform);
        }
        catch {
            signal.throwIfAborted();
        }
        return result;
    }
    catch {
        signal.throwIfAborted();
        return unknown;
    }
}
