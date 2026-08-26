import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, networkInterfaces, platform } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
class BasePlatformAdapter {
    async isPotentiallyBlockingPath(_target, signal) {
        signal.throwIfAborted();
        return false;
    }
    lanIPv4() {
        return selectLanIPv4();
    }
}
class WindowsPlatformAdapter extends BasePlatformAdapter {
    descriptor = Object.freeze({
        kind: 'windows',
        name: 'Windows',
        pathStyle: 'windows',
        directoryRootStyle: 'drives',
    });
    rootsPromise;
    rootsByPath = new Map();
    async filesystemRoots(signal) {
        if (!this.rootsPromise) {
            const workerSignal = new AbortController().signal;
            this.rootsPromise = enumerateWindowsRoots(workerSignal)
                .then((roots) => {
                this.rootsByPath.clear();
                for (const root of roots)
                    this.rootsByPath.set(root.path.toUpperCase(), root);
                return roots;
            })
                .catch((error) => {
                this.rootsPromise = undefined;
                throw error;
            });
        }
        return await raceSignal(this.rootsPromise, signal);
    }
    async isPotentiallyBlockingPath(target, signal) {
        signal.throwIfAborted();
        if (target.startsWith('\\\\'))
            return true;
        const match = /^([A-Za-z]):[\\/]/.exec(target);
        if (!match)
            return false;
        const rootPath = `${match[1].toUpperCase()}:\\`;
        let root = this.rootsByPath.get(rootPath);
        if (!root) {
            try {
                await this.filesystemRoots(signal);
            }
            catch (error) {
                signal.throwIfAborted();
                // Unknown mounted storage is safer in a killable child process than
                // in DSH's main event loop.
                return true;
            }
            root = this.rootsByPath.get(rootPath);
        }
        return root?.kind === 'network';
    }
}
class MacPlatformAdapter extends BasePlatformAdapter {
    descriptor = Object.freeze({
        kind: 'macos',
        name: 'macOS',
        pathStyle: 'posix',
        directoryRootStyle: 'filesystem',
    });
    async filesystemRoots(signal) {
        signal.throwIfAborted();
        const roots = [
            { name: '主目录', path: homedir(), kind: 'home' },
            { name: '根目录', path: '/', kind: 'filesystem' },
        ];
        if (existsSync('/Volumes'))
            roots.push({ name: '卷', path: '/Volumes', kind: 'volume' });
        return roots;
    }
    async isPotentiallyBlockingPath(target, signal) {
        signal.throwIfAborted();
        const normalized = path.resolve(target);
        return normalized.startsWith('/Volumes/');
    }
}
class LinuxPlatformAdapter extends BasePlatformAdapter {
    descriptor = Object.freeze({
        kind: 'linux',
        name: 'Linux',
        pathStyle: 'posix',
        directoryRootStyle: 'filesystem',
    });
    async filesystemRoots(signal) {
        signal.throwIfAborted();
        const roots = [
            { name: '主目录', path: homedir(), kind: 'home' },
            { name: '根目录', path: '/', kind: 'filesystem' },
        ];
        for (const mountRoot of ['/mnt', '/media']) {
            if (existsSync(mountRoot))
                roots.push({ name: path.basename(mountRoot), path: mountRoot, kind: 'volume' });
        }
        return roots;
    }
    async isPotentiallyBlockingPath(target, signal) {
        signal.throwIfAborted();
        const normalized = path.resolve(target);
        return normalized.startsWith('/mnt/')
            || normalized.startsWith('/media/')
            || /\/run\/user\/\d+\/gvfs(?:\/|$)/.test(normalized);
    }
}
class UnknownPlatformAdapter extends BasePlatformAdapter {
    descriptor = Object.freeze({
        kind: 'unknown',
        name: 'Unknown',
        pathStyle: path.sep === '\\' ? 'windows' : 'posix',
        directoryRootStyle: path.sep === '\\' ? 'drives' : 'filesystem',
    });
    async filesystemRoots(signal) {
        signal.throwIfAborted();
        return [{ name: '主目录', path: homedir(), kind: 'home' }];
    }
}
function buildAdapter() {
    switch (platform()) {
        case 'win32': return new WindowsPlatformAdapter();
        case 'darwin': return new MacPlatformAdapter();
        case 'linux': return new LinuxPlatformAdapter();
        default: return new UnknownPlatformAdapter();
    }
}
export const hostPlatform = buildAdapter();
export function hostPlatformDescriptor() {
    return hostPlatform.descriptor;
}
/**
 * Choose a real private LAN address, not a VPN/VM/benchmark adapter. Interface
 * names are only ranking hints; no chosen address is persisted by this layer.
 */
export function selectLanIPv4(source = networkInterfaces()) {
    const candidates = [];
    for (const [name, addresses] of Object.entries(source)) {
        for (const item of addresses || []) {
            if (item.family !== 'IPv4' || item.internal || !item.address)
                continue;
            candidates.push({ name, address: item.address });
        }
    }
    candidates.sort((left, right) => scoreAddress(right) - scoreAddress(left));
    return candidates[0]?.address || '127.0.0.1';
}
function scoreAddress(candidate) {
    const address = candidate.address;
    const name = candidate.name.toLowerCase();
    let score = 0;
    if (address.startsWith('192.168.'))
        score += 100;
    else if (address.startsWith('10.'))
        score += 90;
    else if (isPrivate172(address))
        score += 80;
    else
        score += 10;
    if (/^(en0|en1|wi-?fi|wlan\d*|ethernet|以太网)/i.test(name))
        score += 30;
    if (/(tailscale|docker|veth|vmnet|virtualbox|hyper-v|wsl|loopback|utun|bridge)/i.test(name))
        score -= 80;
    if (address.startsWith('169.254.') || isBenchmarkAddress(address))
        score -= 200;
    return score;
}
function isPrivate172(address) {
    const match = /^172\.(\d+)\./.exec(address);
    if (!match)
        return false;
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
}
function isBenchmarkAddress(address) {
    const match = /^198\.(\d+)\./.exec(address);
    if (!match)
        return false;
    const second = Number(match[1]);
    return second === 18 || second === 19;
}
async function enumerateWindowsRoots(signal) {
    const script = [
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
        "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -match '^[A-Za-z]$' -and $_.Root -match '^[A-Za-z]:\\\\$' } | ForEach-Object {",
        "  [pscustomobject]@{ name = $_.Name.ToUpperInvariant(); path = $_.Root; displayRoot = $(if ($_.DisplayRoot) { [string]$_.DisplayRoot } else { $null }) }",
        '} | Sort-Object name | ConvertTo-Json -Compress',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 8000, signal });
    signal.throwIfAborted();
    const text = String(stdout).replace(/^\uFEFF/, '').trim();
    if (!text)
        return [];
    const decoded = JSON.parse(text);
    const rows = Array.isArray(decoded) ? decoded : [decoded];
    const unique = new Map();
    for (const row of rows) {
        if (typeof row.name !== 'string' || typeof row.path !== 'string')
            continue;
        const name = row.name.toUpperCase();
        if (!/^[A-Z]$/.test(name) || !/^[A-Za-z]:[\\/]$/.test(row.path))
            continue;
        const rootPath = `${name}:\\`;
        const displayRoot = typeof row.displayRoot === 'string' && row.displayRoot.trim()
            ? row.displayRoot
            : undefined;
        unique.set(rootPath, {
            name: `${name}:`,
            path: rootPath,
            kind: displayRoot ? 'network' : 'local',
            ...(displayRoot ? { displayRoot } : {}),
        });
    }
    return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}
function raceSignal(promise, signal) {
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        promise.then(value => { signal.removeEventListener('abort', aborted); resolve(value); }, error => { signal.removeEventListener('abort', aborted); reject(error); });
    });
}
