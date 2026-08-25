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
 * 微信小程序专用的电脑目录浏览服务。
 *
 * 这是普通的 DSH Typert Remote Service：它不注册 directoryPicker、不向
 * WebUI 注入目录组件，也不修改 workspace/session 语义。小程序选中路径后
 * 仍须调用 DSH 官方 workspace.create。
 */
import { execFile } from 'node:child_process';
import { mkdir, opendir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { boundedInsert, fullyQualified, raceAbort, } from '@deepseek-ai/dsh-host-directory-picker-browse';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
const execFileAsync = promisify(execFile);
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_OPERATION_TIMEOUT_MS = 6500;
const MIN_OPERATION_TIMEOUT_MS = 1000;
const MAX_OPERATION_TIMEOUT_MS = 30_000;
/**
 * Host-only directory service exposed through the standard DSH Typert gateway.
 */
let WechatDirectoryService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _roots_decorators;
    let _list_decorators;
    let _create_decorators;
    return class WechatDirectoryService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _roots_decorators = [Remote('roots')];
            _list_decorators = [Remote('list')];
            _create_decorators = [Remote('create')];
            __esDecorate(this, null, _roots_decorators, { kind: "method", name: "roots", static: false, private: false, access: { has: obj => "roots" in obj, get: obj => obj.roots }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        maxEntries = __runInitializers(this, _instanceExtraInitializers);
        operationTimeoutMs;
        windowsRoots = new Map();
        windowsRootsPromise;
        constructor(ctx, config = {}) {
            super(ctx, 'wechatDirectory');
            const requested = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
            this.maxEntries = Number.isSafeInteger(requested) && requested > 0
                ? requested
                : DEFAULT_MAX_ENTRIES;
            const requestedTimeout = config.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
            this.operationTimeoutMs = Number.isSafeInteger(requestedTimeout)
                && requestedTimeout >= MIN_OPERATION_TIMEOUT_MS
                && requestedTimeout <= MAX_OPERATION_TIMEOUT_MS
                ? requestedTimeout
                : DEFAULT_OPERATION_TIMEOUT_MS;
        }
        /** Enumerate real filesystem roots once; never guess C: through Z:. */
        async roots(request, signal) {
            try {
                void request;
                signal.throwIfAborted();
                if (process.platform !== 'win32') {
                    return {
                        ok: true,
                        value: {
                            home: homedir(),
                            roots: [{ name: '/', path: '/', kind: 'filesystem' }],
                        },
                    };
                }
                const roots = await this.readWindowsRoots(signal);
                return { ok: true, value: { home: homedir(), roots } };
            }
            catch (error) {
                signal.throwIfAborted();
                return {
                    ok: false,
                    error: {
                        code: 'drive-enumeration-failed',
                        message: `无法读取电脑磁盘列表：${messageOf(error)}`,
                    },
                };
            }
        }
        /** List one directory level with the same bounds and path fence as DSH browse. */
        async list(request, signal) {
            const requested = request.path;
            const home = homedir();
            const fallbackPath = requested ?? home;
            if (requested !== undefined && !fullyQualified(requested)) {
                return unreadable(fallbackPath, '路径不是完全限定的电脑绝对路径');
            }
            const target = resolve(fallbackPath);
            if (await this.isNetworkTarget(target, signal)) {
                return await this.listNetworkDirectory(target, signal);
            }
            const keep = this.maxEntries + 1;
            const window = [];
            let evicted = false;
            try {
                const opening = opendir(target);
                const level = await raceAbort(opening, signal).catch((error) => {
                    opening.then((dir) => dir.close().catch(swallowCloseFailure), () => { });
                    throw error;
                });
                try {
                    for (;;) {
                        const dirent = await raceAbort(level.read(), signal);
                        if (dirent === null)
                            break;
                        if (!dirent.isDirectory() && !dirent.isSymbolicLink())
                            continue;
                        if (boundedInsert(window, {
                            name: dirent.name,
                            isDirectory: dirent.isDirectory(),
                            isSymbolicLink: dirent.isSymbolicLink(),
                        }, keep))
                            evicted = true;
                    }
                }
                finally {
                    const closing = level.close();
                    if (signal.aborted)
                        closing.catch(swallowCloseFailure);
                    else
                        await closing;
                }
            }
            catch (error) {
                signal.throwIfAborted();
                return unreadable(target, messageOf(error));
            }
            const entries = [];
            let truncated = evicted;
            for (const candidate of window) {
                signal.throwIfAborted();
                const row = await directoryRow(target, candidate, signal);
                if (row === null)
                    continue;
                if (entries.length === this.maxEntries) {
                    truncated = true;
                    break;
                }
                entries.push(row);
            }
            return {
                ok: true,
                value: {
                    path: target,
                    home,
                    crumbs: ancestryCrumbs(target),
                    entries,
                    truncated,
                },
            };
        }
        /** Create exactly one child directory; never recurse or accept a path segment. */
        async create(request, signal) {
            if (!fullyQualified(request.path)) {
                return createFailed(request.path, '父目录不是完全限定的电脑绝对路径');
            }
            const parent = resolve(request.path);
            if (request.name.trim() === ''
                || request.name === '.'
                || request.name === '..'
                || /[/\\]/.test(request.name)) {
                return createFailed(parent, '文件夹名称必须是单个非空路径段');
            }
            const target = join(parent, request.name);
            if (await this.isNetworkTarget(parent, signal)) {
                return await this.createNetworkDirectory(target, signal);
            }
            try {
                await mkdir(target);
                return { ok: true, value: { path: target } };
            }
            catch (error) {
                if (errorCode(error) === 'EEXIST') {
                    return {
                        ok: false,
                        error: { code: 'directory-exists', path: target, message: '同名文件夹已经存在' },
                    };
                }
                return createFailed(target, messageOf(error));
            }
        }
        /**
         * Share one non-blocking drive snapshot between roots() and the initial home
         * listing. The child process still has its own 8 s kill deadline, while each
         * caller may stop waiting through the Typert request signal.
         */
        async readWindowsRoots(signal) {
            if (this.windowsRootsPromise === undefined) {
                const processSignal = new AbortController().signal;
                this.windowsRootsPromise = enumerateWindowsRoots(processSignal)
                    .then((roots) => {
                    this.windowsRoots.clear();
                    for (const root of roots)
                        this.windowsRoots.set(root.path.toUpperCase(), root);
                    return roots;
                })
                    .catch((error) => {
                    this.windowsRootsPromise = undefined;
                    throw error;
                });
            }
            return await raceAbort(this.windowsRootsPromise, signal);
        }
        /** Treat UNC paths and mapped drives reported with DisplayRoot as network I/O. */
        async isNetworkTarget(target, signal) {
            if (process.platform !== 'win32')
                return false;
            if (target.startsWith('\\\\'))
                return true;
            const match = /^([A-Za-z]):[\\/]/.exec(target);
            if (match === null)
                return false;
            const rootPath = `${match[1].toUpperCase()}:\\`;
            let root = this.windowsRoots.get(rootPath);
            if (root === undefined) {
                try {
                    await this.readWindowsRoots(signal);
                }
                catch (error) {
                    signal.throwIfAborted();
                    // If drive classification itself fails, use the killable worker rather
                    // than risk blocking the DSH process on an unknown mounted filesystem.
                    return true;
                }
                root = this.windowsRoots.get(rootPath);
            }
            return root?.kind === 'network';
        }
        /**
         * Network shares are enumerated in a disposable PowerShell child. A dead
         * mapped drive can therefore be killed without pinning DSH's event loop.
         * The path travels only through base64 environment data; no client text is
         * interpolated into the fixed script.
         */
        async listNetworkDirectory(target, signal) {
            const script = [
                "$ErrorActionPreference = 'Stop'",
                '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
                '$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_WECHAT_DIRECTORY_PATH_B64))',
                '$limit = [int]$env:DSH_WECHAT_DIRECTORY_LIMIT',
                '$items = @(Get-ChildItem -LiteralPath $path -Force -Directory -ErrorAction Stop | Select-Object -First ($limit + 1) | ForEach-Object {',
                '  [pscustomobject]@{ name = $_.Name; hidden = (($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0) }',
                '})',
                '[pscustomobject]@{ entries = @($items); truncated = ($items.Count -gt $limit) } | ConvertTo-Json -Depth 4 -Compress',
            ].join('; ');
            try {
                const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
                    encoding: 'utf8',
                    windowsHide: true,
                    timeout: this.operationTimeoutMs,
                    signal,
                    env: {
                        ...process.env,
                        DSH_WECHAT_DIRECTORY_PATH_B64: Buffer.from(target, 'utf8').toString('base64'),
                        DSH_WECHAT_DIRECTORY_LIMIT: String(this.maxEntries),
                    },
                });
                signal.throwIfAborted();
                const decoded = JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim());
                const rawEntries = Array.isArray(decoded.entries)
                    ? decoded.entries
                    : decoded.entries === undefined || decoded.entries === null
                        ? []
                        : [decoded.entries];
                const entries = rawEntries
                    .filter(isNetworkEntry)
                    .slice(0, this.maxEntries)
                    .map((entry) => ({
                    name: entry.name,
                    path: join(target, entry.name),
                    hidden: entry.hidden === true,
                }))
                    .sort((left, right) => left.name.localeCompare(right.name));
                return {
                    ok: true,
                    value: {
                        path: target,
                        home: homedir(),
                        crumbs: ancestryCrumbs(target),
                        entries,
                        truncated: decoded.truncated === true || rawEntries.length > this.maxEntries,
                    },
                };
            }
            catch (error) {
                signal.throwIfAborted();
                if (isChildTimeout(error))
                    return timedOut(target);
                return networkUnavailable(target);
            }
        }
        /** Create one network-share child in a killable process with the same deadline. */
        async createNetworkDirectory(target, signal) {
            const script = [
                "$ErrorActionPreference = 'Stop'",
                '$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_WECHAT_DIRECTORY_PATH_B64))',
                'if (Test-Path -LiteralPath $path) { exit 17 }',
                'New-Item -ItemType Directory -LiteralPath $path -ErrorAction Stop | Out-Null',
            ].join('; ');
            try {
                await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
                    encoding: 'utf8',
                    windowsHide: true,
                    timeout: this.operationTimeoutMs,
                    signal,
                    env: {
                        ...process.env,
                        DSH_WECHAT_DIRECTORY_PATH_B64: Buffer.from(target, 'utf8').toString('base64'),
                    },
                });
                signal.throwIfAborted();
                return { ok: true, value: { path: target } };
            }
            catch (error) {
                signal.throwIfAborted();
                if (processExitCode(error) === 17) {
                    return {
                        ok: false,
                        error: { code: 'directory-exists', path: target, message: '同名文件夹已经存在' },
                    };
                }
                if (isChildTimeout(error)) {
                    return createFailed(target, '网络盘响应超时，已停止创建请求');
                }
                return createFailed(target, '映射的网络位置当前不存在、离线或无权访问');
            }
        }
    };
})();
export { WechatDirectoryService };
async function enumerateWindowsRoots(signal) {
    // 固定脚本，不拼接任何客户端输入。Get-PSDrive 同时覆盖本地卷和映射网络盘，
    // 并过滤掉 Temp 等非盘符 FileSystem PSDrive。
    const script = [
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
        "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -match '^[A-Za-z]$' -and $_.Root -match '^[A-Za-z]:\\\\$' } | ForEach-Object {",
        "  [pscustomobject]@{ name = $_.Name.ToUpperInvariant(); path = $_.Root; displayRoot = $(if ($_.DisplayRoot) { [string]$_.DisplayRoot } else { $null }) }",
        '} | Sort-Object name | ConvertTo-Json -Compress',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 8000, signal });
    signal.throwIfAborted();
    const text = String(stdout).trim();
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
function ancestryCrumbs(target) {
    const crumbs = [];
    let current = target;
    for (;;) {
        const parent = dirname(current);
        crumbs.unshift({
            name: parent === current ? current : basename(current),
            path: current,
            hidden: false,
        });
        if (parent === current)
            return crumbs;
        current = parent;
    }
}
async function directoryRow(parent, candidate, signal) {
    const target = join(parent, candidate.name);
    if (!candidate.isDirectory && candidate.isSymbolicLink) {
        try {
            const info = await raceAbort(stat(target), signal);
            if (!info.isDirectory())
                return null;
        }
        catch (error) {
            signal.throwIfAborted();
            return null;
        }
    }
    return {
        name: candidate.name,
        path: target,
        hidden: process.platform !== 'win32' && candidate.name.startsWith('.'),
    };
}
function unreadable(path, detail) {
    return {
        ok: false,
        error: { code: 'directory-unreadable', path, message: `无法读取目录：${detail}` },
    };
}
function timedOut(path) {
    return {
        ok: false,
        error: {
            code: 'directory-timeout',
            path,
            message: '网络盘响应超时，已停止读取；可以立即切换其他盘符',
        },
    };
}
function networkUnavailable(path) {
    return {
        ok: false,
        error: {
            code: 'network-unavailable',
            path,
            message: '映射的网络位置当前不存在、离线或无权访问',
        },
    };
}
function createFailed(path, detail) {
    return {
        ok: false,
        error: { code: 'directory-create-failed', path, message: `无法新建文件夹：${detail}` },
    };
}
function errorCode(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
}
function processExitCode(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return undefined;
    const code = error.code;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}
function isChildTimeout(error) {
    if (typeof error !== 'object' || error === null)
        return false;
    const record = error;
    return record.killed === true
        || record.code === 'ETIMEDOUT'
        || (typeof record.signal === 'string' && record.signal !== '');
}
function isNetworkEntry(value) {
    if (typeof value !== 'object' || value === null || !('name' in value))
        return false;
    const name = value.name;
    return typeof name === 'string' && name !== '' && !/[/\\]/.test(name);
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function swallowCloseFailure() { }
export default WechatDirectoryService;
