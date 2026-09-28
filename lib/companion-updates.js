/** Same-user installation coordination, not a shared runtime node. Each host
 * applies an offer through its OWN native installation owner. No remote API,
 * phone authorization, profile copying, implicit installation or forced exit. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compareVersions } from './update-policy.js';
import { writePrivateJsonAtomic } from './secure-file.js';
import { agentDshHome, agentProfileScope } from './agent-metadata.js';
import { auditNativeArchive } from './update-download.js';
const core = '@harness-remote/dsh-wechat-remote', native = 'dsh-wechat-remote';
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
const pending = () => ({ state: 'pending', message: '另一端将在其原生更新入口可用时处理；当前节点不受影响。' });
function scopeOf(value) {
    return value === 'desktop' ? 'desktop' : value === 'web' || value === 'default' ? 'web' : undefined;
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function root(home) { return path.join(home, 'harness-remote', 'installation-offers'); }
function recordResult(home, scope, offer, value) {
    const directory = root(home), file = path.join(directory, `result-${scope}.json`);
    try {
        if (read(path.join(directory, `${scope}.json`)).id !== offer.id)
            return false;
    }
    catch {
        return false;
    }
    try {
        const last = read(file);
        if (last.id === offer.id && last.state === 'complete'
            && !['complete', 'recovering', 'unavailable'].includes(value.state))
            return false;
    }
    catch { /* first receipt */ }
    writePrivateJsonAtomic(file, { schema: 2, id: offer.id, version: offer.version, ...value });
    return true;
}
/** Only already enabled installations participate. Do not re-enable a plugin,
 * create another profile, downgrade, or guess which mixed owner to replace. */
export function companionTarget(home, scope) {
    const profile = path.join(home, 'profiles', scope);
    let manifest;
    try {
        manifest = read(path.join(profile, 'package.json'));
    }
    catch {
        return;
    }
    const dependencies = manifest.dependencies || {}, enabled = manifest.dsh?.profile?.bundles;
    if (!Array.isArray(enabled))
        return;
    const owners = [core, native].filter(name => Object.hasOwn(dependencies, name));
    if (owners.length !== 1 || !enabled.includes(owners[0]))
        return;
    const owner = owners[0];
    if (scope === 'desktop' && owner !== native)
        return;
    try {
        const installed = read(path.join(profile, 'node_modules', owner, 'package.json'));
        if (installed.name !== owner || !versionPattern.test(installed.version))
            return;
        return { owner: owner === core ? 'cli' : 'native', version: installed.version };
    }
    catch {
        return;
    }
}
function checkedSource(source, version) {
    if (!path.isAbsolute(source) || !versionPattern.test(version))
        throw new Error('联动安装来源无效');
    const actual = fs.realpathSync(source), manifest = read(path.join(actual, 'package.json'));
    if (manifest.name !== native || manifest.version !== version || manifest.dsh?.bundle?.patch !== './cordis.patch.yml'
        || ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack'].some(key => manifest.scripts?.[key]))
        throw new Error('联动安装包与目标版本不一致');
    const metadata = read(path.join(actual, 'assets/release.json'));
    const release = metadata.catalog?.releases?.find((row) => row.version === version);
    const bytes = fs.readFileSync(path.join(actual, 'assets/plugin.tgz'));
    if (!release || metadata.version !== version || release.asset?.bytes !== bytes.length
        || createHash('sha256').update(bytes).digest('hex') !== release.asset.sha256)
        throw new Error('联动安装包校验失败');
    return actual;
}
/** Called after an explicit CLI install or first activation of a native bundle.
 * Capture the existing peer version: a later manual rollback invalidates this
 * offer instead of becoming an unwanted automatic re-upgrade. */
export function offerCompanionUpdate(home, from, source, version) {
    const to = from === 'web' ? 'desktop' : 'web', peer = companionTarget(home, to);
    if (!peer || compareVersions(version, peer.version) <= 0)
        return;
    if (source)
        source = checkedSource(source, version);
    else if (from !== 'web' || !versionPattern.test(version))
        throw new Error('只有 Web 可通知原生 Desktop 获取同版本 npm 包');
    const directory = root(home), file = path.join(directory, `${to}.json`);
    try {
        const existing = read(file);
        if (existing.schema === 2 && existing.from === from && existing.version === version && existing.previous === peer.version)
            return existing;
        if (versionPattern.test(existing.version) && compareVersions(existing.version, version) > 0)
            return;
    }
    catch { /* first offer */ }
    // Older receivers reject schema 2: they must not act before the new UI's
    // explicit confirmation. Never publish a schema-1 automatic-update offer.
    const offer = { schema: 2, id: randomBytes(16).toString('hex'), from, to, source, version, previous: peer.version };
    writePrivateJsonAtomic(file, offer);
    return offer;
}
export function validateCompanionOffer(home, scope, offer) {
    if (offer.schema !== 2 || !/^[a-f0-9]{32}$/.test(offer.id) || offer.to !== scope
        || offer.from !== (scope === 'web' ? 'desktop' : 'web') || !versionPattern.test(offer.version)
        || !versionPattern.test(offer.previous) || compareVersions(offer.version, offer.previous) <= 0)
        throw new Error('联动更新请求无效');
    const current = read(path.join(root(home), `${scope}.json`));
    if (['schema', 'id', 'from', 'to', 'version', 'previous', 'source'].some(key => current[key] !== offer[key])) {
        throw new Error('联动更新请求已变化，未执行旧请求');
    }
    const target = companionTarget(home, scope);
    if (!target || ![offer.previous, offer.version].includes(target.version))
        throw new Error('另一端的安装、版本或启用状态已变化，未替换插件');
    if (offer.source) {
        if (target.version !== offer.version)
            checkedSource(offer.source, offer.version);
    }
    else if (scope !== 'desktop' || offer.from !== 'web')
        throw new Error('联动安装来源无效');
    return target;
}
function decision(home, offer) {
    try {
        const value = read(path.join(root(home), `decision-${offer.to}.json`));
        return value.id === offer.id ? value.action : undefined;
    }
    catch {
        return;
    }
}
export function assertCompanionApproved(home, offer) {
    validateCompanionOffer(home, offer.to, offer);
    if (decision(home, offer) !== 'approve')
        throw new Error('尚未确认另一端更新，未执行安装');
}
export function decideCompanionOffer(home, offer, action) {
    validateCompanionOffer(home, offer.to, offer);
    if (!['approve', 'later'].includes(action))
        throw new Error('无效的更新选择');
    // Approval is tied to the exact immutable offer; a new version/source never
    // inherits it. Once admitted, "later" cannot cancel a transaction mid-write.
    if (decision(home, offer) === 'approve')
        return;
    if (action === 'approve')
        recordResult(home, offer.to, offer, pending());
    writePrivateJsonAtomic(path.join(root(home), `decision-${offer.to}.json`), { id: offer.id, action });
}
function confirmation(home, offer) {
    const choice = decision(home, offer);
    if (choice === 'approve')
        return;
    return { state: choice === 'later' ? 'deferred' : 'confirmation-required', offerId: offer.id,
        message: `${offer.to === 'web' ? 'Web' : 'Desktop'} 插件可从 ${offer.previous} 更新至 ${offer.version}。确认后会等待任务空闲，更新时连接将短暂断开；保留原配对和会话。当前尚未更新。` };
}
/** Never hand a peer's live directory to pnpm: local folder installs can link
 * the two profiles. Install a verified, immutable tarball kept outside both
 * profiles, so updating/removing the source cannot break the recipient. */
export async function stageCompanionArchive(home, source, version) {
    const actual = checkedSource(source, version);
    const pnpm = path.join(actual, 'node_modules/pnpm/bin/pnpm.cjs');
    if (!fs.existsSync(pnpm))
        throw new Error('安装包缺少内置打包工具，未使用全局工具替代');
    const artifacts = path.join(root(home), 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });
    const temporary = path.join(artifacts, `packing-${randomBytes(16).toString('hex')}.tgz`);
    try {
        // Published artifacts already carry their bundled, hoisted dependencies;
        // packing must not inherit the user's isolated-linker install preference.
        await promisify(execFile)(process.execPath, [pnpm, '--config.ignore-scripts=true', '--config.node-linker=hoisted', 'pack', '--out', temporary], {
            cwd: actual, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
        checkedSource(actual, version);
        if (fs.statSync(temporary).size > 32 * 1024 * 1024)
            throw new Error('联动安装包超过安全大小限制');
        const bytes = fs.readFileSync(temporary);
        auditNativeArchive(bytes, version);
        const digest = createHash('sha256').update(bytes).digest('hex');
        const archive = path.join(artifacts, `${digest}.tgz`);
        try {
            fs.writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST'
                || createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== digest)
                throw error;
        }
        return archive;
    }
    finally {
        // One exact randomly named file owned by this invocation, never a profile.
        try {
            fs.unlinkSync(temporary);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
}
/** Native manager errors (including build approval) remain refusals. No extra
 * scripts are approved, and downloaded is never reported as running. */
export async function applyNativeCompanion(home, scope, runningVersion, offer, services) {
    services.signal?.throwIfAborted();
    const target = validateCompanionOffer(home, scope, offer);
    if (target.owner !== 'native')
        throw new Error('此节点应由 Web 安装器更新');
    if (runningVersion === offer.version) {
        if (target.version !== offer.version)
            throw new Error('磁盘安装已变化，未覆盖或重新升级');
        return { state: 'complete', message: '两端插件已对齐。' };
    }
    if (target.version === offer.version)
        return { state: 'restart-required', message: '另一端插件已安装，重启该应用后生效。' };
    if (runningVersion !== offer.previous)
        throw new Error('运行版本与安装版本不同，未执行联动更新');
    const notice = confirmation(home, offer);
    if (notice)
        return notice;
    const list = await services.list();
    services.signal?.throwIfAborted();
    if (!Array.isArray(list?.items) || list.items.some(row => typeof row.running !== 'boolean'))
        throw new Error('无法确认另一端的会话状态');
    if (list.items.some(row => row.running))
        return { state: 'busy', message: '另一端正在执行任务，任务结束后再处理更新。' };
    services.progress?.({ state: 'preparing', message: '正在准备另一端的插件更新；任务空闲并完成复核后才会安装。' });
    // The core-only Web updater has no outer installer directory. In that case
    // the Desktop owner resolves the exact public package using its ordinary
    // registry, compatibility checks and build-approval policy.
    const archive = offer.source
        ? await (services.stage ?? stageCompanionArchive)(home, offer.source, offer.version)
        : `${native}@${offer.version}`;
    services.signal?.throwIfAborted();
    validateCompanionOffer(home, scope, offer);
    // Packing can take time. Do not update when a task started meanwhile.
    const current = await services.list();
    services.signal?.throwIfAborted();
    if (!Array.isArray(current?.items) || current.items.some(row => typeof row.running !== 'boolean'))
        throw new Error('无法确认另一端的会话状态');
    if (current.items.some(row => row.running))
        return { state: 'busy', message: '另一端正在执行任务，任务结束后再处理更新。' };
    // Recheck after EVERY asynchronous preparation step, including the final
    // idle query. A new offer, manual install or disable wins over this attempt.
    const ready = validateCompanionOffer(home, scope, offer);
    if (ready.owner !== target.owner || ready.version !== offer.previous)
        throw new Error('另一端的安装已变化，未重复安装');
    services.progress?.({ state: 'installing', message: '正在通过原生插件管理器更新，请暂勿退出应用或重复安装。' });
    const result = await services.install(archive);
    if (!['applied', 'restart-required'].includes(result?.application) || result.error || result.bundle !== native) {
        throw new Error('原生插件管理器未完成更新，请在该应用的插件管理页查看原因或完成审批');
    }
    if (companionTarget(home, scope)?.version !== offer.version)
        throw new Error('原生安装后的版本校验未通过');
    return { state: 'restart-required', message: '另一端插件已安装，重启该应用后生效。' };
}
/** The existing Web transaction supplies idle fencing, exact launcher reuse,
 * verification and rollback. It is never passed the Desktop profile. */
/** Desktop's Electron executable is not a Web launch runtime. Discover only
 * a real Node already available to this OS user; never install a runtime or
 * reinterpret a desktop executable as the user's existing CLI. */
export async function webInstallerRuntime(environment = process.env, electron = Boolean(process.versions.electron)) {
    const env = { ...environment };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.DSH_DESKTOP_NODE_EXECUTABLE;
    if (!electron)
        return { executable: process.execPath, env };
    const search = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
    const candidates = [...new Set(search.split(path.delimiter).filter(value => path.isAbsolute(value))
            .map(directory => path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node')))].slice(0, 32);
    const signal = AbortSignal.timeout(10_000);
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate))
            continue;
        try {
            const { stdout } = await promisify(execFile)(candidate, ['-p', 'JSON.stringify({executable:process.execPath,node:process.versions.node,electron:!!process.versions.electron})'], { env, windowsHide: true, timeout: 2000, signal, maxBuffer: 4096 });
            const value = JSON.parse(stdout.trim()), [major, minor] = String(value.node).split('.').map(Number);
            if (!value.electron && (major > 22 || major === 22 && minor >= 13)
                && fs.realpathSync(value.executable) === fs.realpathSync(candidate))
                return { executable: fs.realpathSync(candidate), env };
        }
        catch { /* Next already-installed Node; no shell wrappers or download. */ }
        if (signal.aborted)
            break;
    }
    throw new Error('未找到 Web 使用的独立 Node.js，未使用 Desktop 运行时替代，请在终端执行原安装命令');
}
async function runWebInstaller(home, offer, progress = () => { }, signal) {
    signal?.throwIfAborted();
    const notice = confirmation(home, offer);
    if (notice)
        return notice;
    progress({ state: 'preparing', message: '检测到 Web 旧插件，正在准备同步升级；原配对和会话将保留。' });
    const target = validateCompanionOffer(home, 'web', offer);
    if (target.owner !== 'cli')
        return Promise.resolve(pending());
    const worker = path.join(offer.source, 'bin/companion-worker.mjs');
    if (!fs.existsSync(worker))
        throw new Error('此安装包缺少联动安装入口');
    const runtime = await webInstallerRuntime();
    signal?.throwIfAborted();
    validateCompanionOffer(home, 'web', offer);
    return new Promise((resolve, reject) => {
        // Once admitted, this standalone transaction owns its cleanup/rollback.
        // Disposing the plugin must NOT kill a worker halfway through replacement.
        const child = spawn(runtime.executable, [worker, home, offer.version, offer.previous, offer.id], { windowsHide: true,
            env: runtime.env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        child.on('message', (value) => {
            if (value?.type === 'companion-busy')
                progress({ state: 'busy', message: 'Web 正在执行任务，暂不更新；正在等待其空闲。' });
            if (value?.type === 'companion-progress') {
                const state = value.phase === 'installing' ? 'installing'
                    : ['restarting', 'verifying'].includes(value.phase) ? 'verifying'
                        : value.phase === 'rolling-back' ? 'recovering'
                            : ['preparing', 'checking'].includes(value.phase) ? 'preparing' : undefined;
                const messages = { preparing: '正在检查 Web 安装条件并保存状态；无需手动停止任务。',
                    installing: '正在升级 Web 插件，请暂勿关闭 Web、退出 Desktop 或重复安装。',
                    verifying: '正在恢复 Web 连接并核验版本、原配对和会话，请稍候。',
                    recovering: '更新未通过验证，正在恢复 Web 原插件，请暂勿关闭应用。' };
                if (state)
                    progress({ state, message: messages[state] });
            }
        });
        let tail = '';
        child.stderr?.on('data', bytes => { tail = (tail + bytes.toString()).slice(-2048); });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve({ state: 'restart-required', message: 'Web 插件已安装，等待该节点启动或重新连接确认。' })
            : code === 75 ? resolve({ state: 'unavailable', message: '等待已结束，Web 仍有任务，本次未更新；任务结束后可使用原安装命令升级。' })
                : reject(new Error(tail.trim() || 'Web 联动更新未完成；原有节点保持独立。')));
    });
}
/** No service daemon and no polling scanner: one fiber-owned file watcher plus
 * native agent-idle events. Old peers without this receiver keep their native
 * manual entry; an enabled legacy Web can use its existing one-line installer. */
export function mountCompanionUpdates(ctx, version, options = {}) {
    try {
        return mount(ctx, version, options);
    }
    catch {
        // Coordination is optional. Its filesystem failure must not prevent
        // pairing, authentication or the host's ordinary plugin manager.
        return { status: () => ({ state: 'unavailable', message: '联动更新暂不可用，仍可分别使用原生更新入口。' }), decide() { throw new Error('联动更新不可用'); }, dispose() { } };
    }
}
function mount(ctx, version, options) {
    const home = agentDshHome(ctx), scope = scopeOf(agentProfileScope(ctx));
    let status = { state: 'idle', message: '' }, stopped = false, busy = false, recheck = false;
    const lifetime = new AbortController();
    if (!scope)
        return { status: () => status, decide() { throw new Error('当前安装不支持联动更新'); }, dispose() { } };
    const directory = root(home), inbox = path.join(directory, `${scope}.json`);
    const ownChanged = () => { const own = companionTarget(home, scope); return own && own.version !== version; };
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const receipt = (offer, value) => {
        if (stopped)
            return;
        // An older asynchronous attempt must not overwrite the latest receipt,
        // nor undo a new runtime's proof of successful activation.
        try {
            if (recordResult(home, scope, offer, value))
                status = value;
        }
        catch {
            status = { state: 'unavailable', message: '联动更新结果无法保存，请在该节点的原生插件管理页核对。' };
        }
    };
    const check = async () => {
        if (stopped || ownChanged())
            return;
        if (options.isUpdating?.())
            return;
        if (busy) {
            recheck = true;
            return;
        }
        if (!existsInbox())
            return;
        busy = true;
        let offer;
        try {
            offer = read(inbox);
            const target = validateCompanionOffer(home, scope, offer);
            if (version === offer.version) {
                if (target.version !== version)
                    throw new Error('磁盘安装已变化');
                receipt(offer, { state: 'complete', message: '两端插件已对齐。' });
                return;
            }
            const notice = confirmation(home, offer);
            if (notice) {
                receipt(offer, notice);
                return;
            }
            try {
                const last = read(path.join(directory, `result-${scope}.json`));
                if (last.id === offer.id && ['unavailable', 'complete'].includes(last.state)) {
                    status = last;
                    return;
                }
                if (last.id === offer.id && last.state === 'restart-required' && version !== offer.version) {
                    status = last;
                    return;
                }
            }
            catch { /* first attempt */ }
            if (target.owner === 'native') {
                const manager = ctx.get('pluginManager'), controller = ctx.get('sessionController');
                if (!manager?.installBundle || !controller?.list) {
                    receipt(offer, pending());
                    return;
                }
                receipt(offer, await applyNativeCompanion(home, scope, version, offer, {
                    signal: lifetime.signal,
                    progress: value => receipt(offer, value),
                    list: () => controller.list({}, AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)])),
                    install: spec => manager.installBundle(spec),
                }));
            }
            else
                receipt(offer, await runWebInstaller(home, offer, value => receipt(offer, value), lifetime.signal));
        }
        catch (error) {
            if (stopped)
                return;
            status = { state: 'unavailable', message: '联动更新未完成；请在对应应用的插件管理页核对，当前节点不受影响。' };
            if (offer && /^[a-f0-9]{32}$/.test(offer.id))
                receipt(offer, status);
        }
        finally {
            busy = false;
            if (recheck && !stopped) {
                recheck = false;
                queueMicrotask(() => { void check(); });
            }
        }
    };
    function existsInbox() { return fs.existsSync(inbox); }
    let outboundBusy = false;
    const checkOutbound = async () => {
        if (stopped || ownChanged() || outboundBusy || options.isUpdating?.())
            return;
        let offer;
        try {
            offer = read(path.join(directory, 'web.json'));
            if (scope !== 'desktop' || offer.from !== scope || offer.version !== version)
                return;
            const target = validateCompanionOffer(home, 'web', offer);
            if (target.owner !== 'cli' || target.version === version)
                return;
            const notice = confirmation(home, offer);
            if (notice) {
                recordResult(home, 'web', offer, notice);
                return;
            }
            // Updated receivers own their own transaction. Only legacy Web needs
            // the source host to invoke the existing guarded Web installer.
            if (compareVersions(offer.previous, '1.7.12-rc.6') >= 0)
                return;
            try {
                const last = read(path.join(directory, 'result-web.json'));
                if (last.schema === 2 && last.id === offer.id && ['unavailable', 'restart-required', 'complete'].includes(last.state))
                    return;
            }
            catch { }
        }
        catch {
            return;
        }
        outboundBusy = true;
        const report = (value) => { try {
            recordResult(home, 'web', offer, value);
        }
        catch { } };
        try {
            report(await runWebInstaller(home, offer, report, lifetime.signal));
        }
        catch {
            if (!stopped)
                report({ state: 'unavailable', message: 'Web 联动安装未完成，请在 Web 原生入口核对；Desktop 不受影响。' });
        }
        finally {
            outboundBusy = false;
        }
    };
    const watcher = fs.watch(directory, (_event, filename) => {
        if ([`${scope}.json`, `decision-${scope}.json`].includes(String(filename)))
            void check();
        if (String(filename) === 'decision-web.json')
            void checkOutbound();
    });
    watcher.on('error', () => { status = { state: 'unavailable', message: '联动更新通知不可用，仍可分别使用原生更新入口。' }; });
    const cleanups = [];
    try {
        // turn/end precedes driver drain/checkpoint. Only agent/status establishes
        // real idleness; coalesce events arriving during an outstanding check.
        const off = ctx.on?.('agent/status', (event) => { if (event?.status === 'idle')
            void check(); });
        if (typeof off === 'function')
            cleanups.push(off);
        // Native services can become available after this plugin's initial mount.
        const dependency = ctx.inject?.(['pluginManager', 'sessionController'], () => { void check(); });
        if (dependency?.dispose)
            cleanups.push(() => { void Promise.resolve(dependency.dispose()).catch(() => { }); });
    }
    catch (error) {
        stopped = true;
        lifetime.abort();
        watcher.close();
        cleanups.forEach(fn => fn());
        throw error;
    }
    const kickoff = setImmediate(() => {
        if (stopped || ownChanged())
            return;
        // Only the native wrapper carries the full installer. The ordinary Web
        // core never invents an npm source or broadcasts incomplete package bytes.
        const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        try {
            let packageName;
            try {
                packageName = read(path.join(source, 'package.json')).name;
            }
            catch { /* core-only Web */ }
            const ownPackage = read(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json')).name;
            if (packageName === native || (scope === 'web' && ownPackage === core)) {
                const seen = path.join(directory, `offered-${scope}.json`);
                let previous;
                try {
                    previous = read(seen);
                }
                catch { }
                if (previous?.version !== version) {
                    const offer = offerCompanionUpdate(home, scope, packageName === native ? source : '', version);
                    writePrivateJsonAtomic(seen, { version });
                }
            }
        }
        catch { /* core-only install has no wrapper; explicit installer publishes */ }
        void check();
        void checkOutbound();
    });
    const reportedStatus = () => {
        // Report a peer outcome to the initiating host, without mistaking this
        // host's successful upgrade for completion on the peer.
        const to = scope === 'web' ? 'desktop' : 'web';
        try {
            const offer = read(path.join(directory, `${to}.json`));
            if (offer.from === scope && offer.version === version) {
                const peer = validateCompanionOffer(home, to, offer);
                if (peer.version !== version) {
                    const notice = confirmation(home, offer);
                    if (notice)
                        return notice;
                }
                const last = read(path.join(directory, `result-${to}.json`));
                if (last.schema === 2 && last.id === offer.id && ['pending', 'busy', 'preparing', 'installing', 'verifying', 'recovering', 'restart-required', 'complete', 'unavailable'].includes(last.state)) {
                    if (['complete', 'restart-required'].includes(last.state) && peer.version !== version) {
                        return { state: 'unavailable', message: '另一端的安装已变化，请在该应用内核对；当前节点不受影响。' };
                    }
                    return { state: last.state, message: `${to === 'web' ? 'Web' : 'Desktop'}：${String(last.message).slice(0, 240)}` };
                }
            }
        }
        catch { /* no peer receipt */ }
        try {
            const offer = read(path.join(directory, `${to}.json`));
            if (offer.from === scope && offer.version === version) {
                try {
                    validateCompanionOffer(home, to, offer);
                }
                catch {
                    return { state: 'unavailable', message: '另一端的安装或启用状态已变化，未继续更新；当前节点不受影响。' };
                }
                return pending();
            }
        }
        catch { }
        return status;
    };
    return { status: () => {
            const own = companionTarget(home, scope), to = scope === 'web' ? 'desktop' : 'web', peer = companionTarget(home, to);
            const versions = { current: scope, running: version, installed: own?.version ?? null, peer: to, peerInstalled: peer?.version ?? null };
            if (own && own.version !== version)
                return { state: 'self-restart-required', versions,
                    message: `当前 ${scope === 'desktop' ? 'Desktop' : 'Web'} 已安装 ${own.version}，仍在运行 ${version}。请在任务结束后重启当前应用；另一端尚未因此更新。` };
            const result = reportedStatus();
            if (result.state === 'complete' && (!own || !peer || own.version !== peer.version || own.version !== version)) {
                return { state: 'unavailable', versions, message: '两端版本或启用状态已变化，旧的完成记录不再代表当前已对齐。请分别核对，不会自动覆盖任何一端。' };
            }
            return { ...result, versions };
        }, decide(id, action) {
            if (stopped)
                throw new Error('连接服务已停止');
            if (ownChanged())
                throw new Error('当前安装版本尚未生效，请重启当前应用后再确认');
            const to = scope === 'web' ? 'desktop' : 'web';
            const offers = [to, scope].flatMap(key => { try {
                return [read(path.join(directory, `${key}.json`))];
            }
            catch {
                return [];
            } });
            const offer = offers.find(item => item.id === id);
            if (!offer)
                throw new Error('更新通知已过期，请刷新后重试');
            decideCompanionOffer(home, offer, action);
            void check();
            void checkOutbound();
        }, dispose() { stopped = true; lifetime.abort(); clearImmediate(kickoff); watcher.close(); cleanups.forEach(fn => fn()); } };
}
