import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adapterDshHome, isAllowedDshWebOrigin } from './dsh-runtime.js';
import { agentProfileScope, defaultGateStatePath, loadAgentDescriptor } from './agent-metadata.js';
import { assessUpdate, validateCatalog, trustedReleaseAsset } from './update-policy.js';
import { boundedFetch, downloadRelease } from './update-download.js';
import { validateJob, releaseOwnedUpdateLock, control } from './update-worker.js';
import { createInstallControl } from './install-control.js';
import { assertNativeUpdateCapabilities } from './install-capabilities.js';
import { currentHostManager } from './install-lifecycle.js';
import { writePrivateJsonAtomic } from './secure-file.js';
import { resolveInstallRuntime, verifyInstallRuntime } from './install-runtime.js';
const ownRoot = fileURLToPath(new URL('../', import.meta.url));
const ownVersion = () => JSON.parse(fs.readFileSync(path.join(ownRoot, 'package.json'), 'utf8')).version;
// Two operator-only switches. Phone requests and release metadata cannot opt in.
export function previewUpdatesEnabled(env = process.env) {
    return env.HARNESS_REMOTE_UPDATE_CHANNEL === 'preview' && Boolean(env.HARNESS_REMOTE_UPDATE_CATALOG);
}
export function updateAction(advice, release, eligible, occupied) {
    const none = { canInstall: false, mode: 'none', reason: '', manualCommand: '' };
    if (!advice.targetVersion || !release || release.version !== advice.targetVersion
        || !['info', 'recommended', 'required'].includes(advice.severity) || advice.expiresAt <= Date.now())
        return none;
    if (occupied)
        return { ...none, mode: 'busy', reason: '当前更新尚未结束，请稍后重试。' };
    const assetValid = trustedReleaseAsset(release.asset, release.version);
    if (assetValid && eligible.eligible)
        return { ...none, mode: 'automatic', canInstall: true };
    // Host-side command, not an executable instruction supplied by the WebUI.
    const profile = agentProfileScope();
    const manualCommand = release.channel === 'stable' && /^\d+\.\d+\.\d+$/.test(release.version) && /^[A-Za-z0-9_-]+$/.test(profile)
        ? `npx -y dsh-wechat-remote@latest${profile === 'web' ? '' : ` --profile ${profile}`}` : '';
    return { canInstall: false, mode: 'manual', reason: !eligible.eligible ? eligible.reason : '自动更新包暂不可用，请手动更新。', manualCommand };
}
export function acceptsUpdateRequest(req, webPort, localPort) {
    const address = req.socket.remoteAddress;
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '')
        && req.headers.host === `127.0.0.1:${localPort}`
        && isAllowedDshWebOrigin(String(req.headers.origin || ''), webPort)
        && !req.headers['x-forwarded-for'];
}
/** Use DSH's own browser-authentication handoff after this instance restarts. */
export function resumedWebUrl(connection, origin, webPort) {
    if (!isAllowedDshWebOrigin(origin, webPort))
        throw new Error('WebUI 地址不匹配');
    const value = typeof connection?.authenticatedUrl === 'function' ? connection.authenticatedUrl(origin) : origin + '/';
    const url = new URL(value);
    if (url.origin !== new URL(origin).origin || url.pathname !== '/' || url.username || url.password || url.hash)
        throw new Error('WebUI 恢复地址无效');
    return url.href;
}
export class PluginUpdateService {
    ctx;
    ports;
    catalog = null;
    checkedAt = 0;
    checking;
    ticket;
    busy = false;
    maintenance = false;
    activeJob;
    restoreFence;
    startupJob;
    startupTimer;
    restoreStartup;
    nativeRequests = new Set();
    readToken = randomBytes(24).toString('hex');
    otherInFlight = () => false;
    requestObserver = (req, res) => {
        if (req.method !== 'POST' || req.headers['x-harness-update-read'] === this.readToken)
            return;
        this.nativeRequests.add(res);
        const done = () => this.nativeRequests.delete(res);
        res.once('finish', done);
        res.once('close', done);
    };
    constructor(ctx, ports) {
        this.ctx = ctx;
        this.ports = ports;
        ;
        ctx.get('webServer')?.server?.on('request', this.requestObserver);
        this.fenceStartup();
    }
    // A restarted candidate must remain read-only until its initiating worker
    // verifies durable data. Automatic phone reconnects must not rotate a token
    // or append a message in the middle of that comparison.
    fenceStartup() {
        let directory = process.env.HARNESS_REMOTE_UPDATE_JOB;
        if (!directory) {
            try {
                const ref = JSON.parse(fs.readFileSync(this.progressIndex(), 'utf8'));
                if (!/^[a-f0-9]{32}$/.test(ref.jobId))
                    return;
                const candidate = path.join(adapterDshHome(), 'harness-remote-updates', ref.jobId);
                const result = JSON.parse(fs.readFileSync(path.join(candidate, 'result.json'), 'utf8'));
                if (result.terminal || !['restarting', 'verifying', 'rolling-back'].includes(result.phase))
                    return;
                directory = candidate;
            }
            catch {
                return;
            }
        }
        const job = JSON.parse(fs.readFileSync(path.join(directory, 'job.json'), 'utf8'));
        validateJob(job);
        if (job.directory !== directory || job.home !== adapterDshHome()
            || job.profile !== path.join(adapterDshHome(), 'profiles', agentProfileScope())
            || job.webPort !== this.ports.web || job.gatePort !== this.ports.gate)
            throw new Error('重启验证任务与当前实例不匹配');
        const complete = () => {
            try {
                return JSON.parse(fs.readFileSync(path.join(directory, 'verification-complete.json'), 'utf8')).id === job.id;
            }
            catch {
                return false;
            }
        };
        if (complete())
            return;
        this.startupJob = job;
        const server = this.ctx.get('webServer')?.server;
        if (!server?.listeners)
            throw new Error('无法保护重启验证阶段');
        const requests = server.listeners('request'), upgrades = server.listeners('upgrade');
        const paused = (req, res) => {
            if (this.isVerificationProbe(req)) {
                requests.forEach((listener) => listener.call(server, req, res));
                return;
            }
            res.writeHead(503, { 'retry-after': '5' });
            res.end('Plugin update verification in progress');
        };
        const upgradePaused = (_req, socket) => socket.destroy();
        server.removeAllListeners('request');
        server.removeAllListeners('upgrade');
        server.on('request', paused);
        server.on('upgrade', upgradePaused);
        this.restoreStartup = () => {
            clearInterval(this.startupTimer);
            server.removeListener('request', paused);
            server.removeListener('upgrade', upgradePaused);
            requests.forEach((listener) => server.on('request', listener));
            upgrades.forEach((listener) => server.on('upgrade', listener));
            this.startupJob = undefined;
            this.restoreStartup = undefined;
        };
        // A failed worker never silently releases the fence. Progress/backup stays
        // available on the local management door; an ordinary manual restart does
        // not inherit this one-process environment marker.
        this.startupTimer = setInterval(() => { if (complete())
            this.restoreStartup?.(); }, 100);
        this.startupTimer.unref();
    }
    isVerificationProbe(req) {
        return Boolean(this.startupJob && req.method === 'POST'
            && ['/api/wechatHost/describe', '/api/session.list', '/api/session.history'].includes(req.url || '')
            && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
            && req.headers['x-harness-update-probe'] === this.startupJob.statusToken);
    }
    trackPublicRequests(check) { this.otherInFlight = check; }
    current() {
        const d = loadAgentDescriptor();
        return { agentKind: d.agentKind, agentVersion: d.agentVersion, pluginVersion: ownVersion(), platform: d.hostPlatform.kind, arch: process.arch };
    }
    isMaintaining() { return this.maintenance || Boolean(this.startupJob); }
    progressIndex() {
        const scope = createHash('sha256').update(agentProfileScope()).digest('hex').slice(0, 24);
        return path.join(adapterDshHome(), 'harness-remote-updates', `profile-${scope}.json`);
    }
    recovery() {
        try {
            const job = JSON.parse(fs.readFileSync(this.progressIndex(), 'utf8'));
            if (!/^[a-f0-9]{32}$/.test(job.jobId))
                throw new Error('invalid progress index');
            const dir = path.join(adapterDshHome(), 'harness-remote-updates', job.jobId);
            const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
            return { activeJob: result.terminal ? null : job, lastResult: result };
        }
        catch {
            return { activeJob: this.busy ? this.activeJob || null : null, lastResult: null };
        }
    }
    async check(force = false) {
        if (this.checking)
            return this.checking;
        if (!force && Date.now() - this.checkedAt < (this.catalog ? 6 * 3600000 : 60000))
            return assessUpdate(this.catalog, this.current(), Date.now(), previewUpdatesEnabled());
        this.checking = (async () => {
            try {
                // A local operator may provide the same catalog offline; no client can
                // choose this path. Production defaults to the whitelisted relay API.
                const configured = process.env.HARNESS_REMOTE_UPDATE_CATALOG;
                const raw = configured
                    ? (fs.statSync(configured).size <= 256 * 1024 ? fs.readFileSync(configured) : Buffer.alloc(0))
                    : await boundedFetch('https://relay.xyxfood.xyz/v1/update-policy', 256 * 1024);
                this.catalog = validateCatalog(JSON.parse(raw.toString('utf8')));
            }
            catch {
                this.catalog = null;
            }
            this.checkedAt = Date.now();
            return assessUpdate(this.catalog, this.current(), Date.now(), previewUpdatesEnabled());
        })().finally(() => { this.checking = undefined; });
        return this.checking;
    }
    eligibility() {
        try {
            // Missing OS/CPU/DSH test evidence must never disable this updater.
            // The catalog excludes known broken releases, not untested combinations.
            // Check actual native capabilities and restart ownership on every host.
            if (process.versions.electron)
                throw new Error('此启动方式尚不支持自动重启');
            currentHostManager();
            if (process.argv.some(a => /(?:api.?key|password|secret|token)[= ]/i.test(a))
                || process.execArgv.length)
                throw new Error('此启动方式不能安全自动重启，请手工更新');
            const cli = fs.realpathSync(process.argv[1]);
            if (JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json'), 'utf8')).name !== '@deepseek-ai/dsh')
                throw new Error('无法确认 DSH 启动程序');
            const profile = path.join(adapterDshHome(), 'profiles', agentProfileScope());
            if (fs.realpathSync(profile) !== profile || !fs.realpathSync(ownRoot).startsWith(profile + path.sep))
                throw new Error('插件不在可安全更新的独立 profile 中');
            assertNativeUpdateCapabilities(this.ctx);
            fs.accessSync(profile, fs.constants.W_OK);
            return { eligible: true, reason: '', profile, pnpm: resolveInstallRuntime(ownRoot).cli, cli };
        }
        catch (error) {
            return { eligible: false, reason: error instanceof Error ? error.message : '安装环境暂不支持自动更新' };
        }
    }
    async begin(ticket) {
        if (this.isMaintaining())
            throw new Error('当前实例正在验证或重启，请稍后重试');
        if (this.busy)
            return this.activeJob || { phase: 'preparing' };
        if (this.recovery().activeJob)
            throw new Error('上次更新仍在进行或结果待确认，请先查看进度');
        const plan = this.ticket;
        if (!plan || plan.expiresAt <= Date.now() || ticket.length !== plan.value.length
            || !timingSafeEqual(Buffer.from(ticket), Buffer.from(plan.value)))
            throw new Error('更新确认已过期，请重新检查');
        this.ticket = undefined;
        this.busy = true;
        let lockPath = '';
        let ownedLock = false;
        let ownedLockId = '';
        let controller;
        try {
            const advice = await this.check(true);
            const refreshed = this.catalog?.releases.find(r => r.version === advice.targetVersion);
            if (advice.revision !== plan.revision || advice.targetVersion !== plan.release.version
                || JSON.stringify(refreshed) !== JSON.stringify(plan.release))
                throw new Error('兼容清单已变化，请重新检查确认');
            const eligible = this.eligibility();
            if (!eligible.eligible)
                throw new Error(eligible.reason);
            const id = randomBytes(16).toString('hex'), home = adapterDshHome();
            ownedLockId = id;
            const directory = path.join(home, 'harness-remote-updates', id);
            lockPath = path.join(eligible.profile, '.harness-remote-update.lock');
            const lock = fs.openSync(lockPath, 'wx', 0o600);
            fs.writeFileSync(lock, id);
            fs.closeSync(lock);
            ownedLock = true;
            fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
            await verifyInstallRuntime(resolveInstallRuntime(ownRoot));
            const archive = await downloadRelease(plan.release);
            fs.writeFileSync(path.join(directory, 'release.tgz'), archive, { flag: 'wx', mode: 0o600 });
            const statusToken = randomBytes(24).toString('hex');
            controller = await createInstallControl(this.ctx, { directory, token: statusToken, pnpm: eligible.pnpm });
            const job = { id, directory, profile: eligible.profile, home, stateFile: defaultGateStatePath(),
                cli: eligible.cli, argv: [eligible.cli, ...process.argv.slice(2)], execArgv: process.execArgv,
                executable: process.execPath, cwd: process.cwd(), pnpm: eligible.pnpm, parentPid: process.pid,
                webPort: this.ports.web, gatePort: this.ports.gate, localPort: this.ports.local,
                targetVersion: plan.release.version, previousVersion: ownVersion(), dshVersion: this.current().agentVersion,
                statusToken, controlOrigin: controller.origin, manager: currentHostManager() };
            validateJob(job);
            writePrivateJsonAtomic(path.join(directory, 'job.json'), job);
            writePrivateJsonAtomic(path.join(directory, 'package.json'), { type: 'module' });
            // Keep the worker's complete built-in-only module closure outside the
            // profile being updated. No model credentials serialized to disk.
            for (const name of ['update-worker.js', 'secure-file.js', 'install-profile.js', 'install-runtime.js', 'install-lifecycle.js'])
                fs.copyFileSync(path.join(ownRoot, 'lib', name), path.join(directory, name));
            await control(job, 'launch');
            let statusOrigin = '';
            for (let i = 0; i < 100; i++) {
                try {
                    const ready = JSON.parse(fs.readFileSync(path.join(directory, 'worker-ready.json'), 'utf8'));
                    if (ready.id === id && /^http:\/\/127\.0\.0\.1:\d+$/.test(ready.origin)) {
                        statusOrigin = ready.origin;
                        break;
                    }
                }
                catch { }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!statusOrigin)
                throw new Error('更新辅助进程启动超时');
            this.activeJob = { jobId: id, statusOrigin, statusToken: job.statusToken };
            writePrivateJsonAtomic(this.progressIndex(), this.activeJob);
            writePrivateJsonAtomic(path.join(directory, 'authorized.json'), { id });
            const timer = setInterval(() => {
                try {
                    const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
                    if (!result.terminal)
                        return;
                    clearInterval(timer);
                    if (this.activeJob?.jobId === id)
                        this.busy = false;
                    controller?.close();
                }
                catch { }
            }, 1000);
            timer.unref();
            return this.activeJob;
        }
        catch (error) {
            controller?.close();
            this.busy = false;
            this.restoreFence?.();
            if (ownedLock)
                releaseOwnedUpdateLock(lockPath, ownedLockId);
            throw error;
        }
    }
    async handle(req, res) {
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
        if (!acceptsUpdateRequest(req, this.ports.web, this.ports.local))
            return json(403, { error: '只能从当前电脑的 DSH WebUI 管理更新' });
        try {
            if (req.method === 'GET' && req.url === '/gate/update/check') {
                const advice = await this.check(true);
                const release = this.catalog?.releases.find(r => r.version === advice.targetVersion);
                const recovered = this.recovery();
                const eligible = release ? this.eligibility() : { eligible: false, reason: '' };
                const action = updateAction(advice, release, eligible, Boolean(this.busy || this.isMaintaining() || recovered.activeJob));
                this.ticket = undefined;
                if (action.canInstall)
                    this.ticket = { value: randomBytes(24).toString('hex'), expiresAt: Date.now() + 120000, revision: advice.revision, release: release };
                return json(200, { advice, ...action, channel: previewUpdatesEnabled() ? 'preview' : 'stable',
                    ticket: action.canInstall ? this.ticket.value : '', ...recovered });
            }
            if (req.method === 'GET' && req.url === '/gate/update/status')
                return json(200, this.recovery());
            if (req.method === 'GET' && req.url?.startsWith('/gate/update/resume?')) {
                const query = new URL(req.url, 'http://localhost').searchParams;
                const id = query.get('job') || '';
                if (!/^[a-f0-9]{32}$/.test(id) || query.size !== 1 || this.isMaintaining())
                    throw new Error('更新尚未完成验证');
                const directory = path.join(adapterDshHome(), 'harness-remote-updates', id);
                const job = JSON.parse(fs.readFileSync(path.join(directory, 'job.json'), 'utf8'));
                const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
                if (job.id !== id || job.home !== adapterDshHome() || job.profile !== path.join(adapterDshHome(), 'profiles', agentProfileScope())
                    || job.webPort !== this.ports.web || !result.terminal || !result.ok || ownVersion() !== job.targetVersion)
                    throw new Error('当前实例与完成的更新不匹配');
                // This loopback + exact browser Origin/Host door is already the local
                // management authority. Never put the launch URL in public metadata,
                // progress journals, cloud messages, or logs.
                return json(200, { url: resumedWebUrl(this.ctx.get('connection'), String(req.headers.origin), this.ports.web) });
            }
            if (req.method === 'POST' && req.url === '/gate/update/start') {
                if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'])))
                    return json(415, { error: 'Invalid content type' });
                let body = '';
                for await (const chunk of req) {
                    body += chunk.toString();
                    if (body.length > 1024)
                        throw new Error('更新请求过大');
                }
                const value = JSON.parse(body);
                return json(202, await this.begin(typeof value.ticket === 'string' ? value.ticket : ''));
            }
            return json(404, { error: 'Not found' });
        }
        catch (error) {
            return json(409, { error: error instanceof Error ? error.message : '更新暂不可用' });
        }
    }
    dispose() {
        this.restoreStartup?.();
        if (!this.busy)
            this.restoreFence?.();
        this.ctx.get('webServer')?.server?.removeListener('request', this.requestObserver);
    }
}
