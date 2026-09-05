import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adapterDshHome, isAllowedDshWebOrigin } from './dsh-runtime.js';
import { agentProfileScope, defaultGateStatePath, loadAgentDescriptor } from './agent-metadata.js';
import { assessUpdate, validateCatalog } from './update-policy.js';
import { boundedFetch, downloadRelease } from './update-download.js';
import { validateJob, releaseOwnedUpdateLock } from './update-worker.js';
import { resolveTypertGateway, invokeLegacyRpc } from './dsh-protocol-compat.js';
import { tightenPrivateFile, writePrivateJsonAtomic } from './secure-file.js';
const require = createRequire(import.meta.url);
const ownRoot = fileURLToPath(new URL('../', import.meta.url));
const ownVersion = () => JSON.parse(fs.readFileSync(path.join(ownRoot, 'package.json'), 'utf8')).version;
const supportedDsh = ['0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-rc.1'];
// Two operator-only switches. Phone requests and release metadata cannot opt in.
export function previewUpdatesEnabled(env = process.env) {
    return env.HARNESS_REMOTE_UPDATE_CHANNEL === 'preview' && Boolean(env.HARNESS_REMOTE_UPDATE_CATALOG);
}
function resolvePnpm(profile) {
    const candidates = [];
    if (process.env.HARNESS_REMOTE_PNPM_CLI)
        candidates.push(process.env.HARNESS_REMOTE_PNPM_CLI);
    for (const dir of [profile, path.dirname(process.execPath), ownRoot]) {
        try {
            candidates.push(require.resolve('pnpm/bin/pnpm.cjs', { paths: [dir] }));
        }
        catch { /* try global runtime */ }
    }
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        candidates.push(path.join(dir, 'node_modules/pnpm/bin/pnpm.cjs'));
        if (process.platform !== 'win32')
            candidates.push(path.join(dir, 'pnpm'));
    }
    for (const candidate of candidates) {
        try {
            const real = fs.realpathSync(candidate);
            const pkg = JSON.parse(fs.readFileSync(path.resolve(real, '../../package.json'), 'utf8'));
            if (pkg.name === 'pnpm' && /^11\./.test(pkg.version))
                return real;
        }
        catch { /* unsupported installation: provide manual action */ }
    }
    throw new Error('未找到经过验证的 pnpm 11 运行时；请先按安装说明准备环境');
}
export function acceptsUpdateRequest(req, webPort, localPort) {
    const address = req.socket.remoteAddress;
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '')
        && req.headers.host === `127.0.0.1:${localPort}`
        && isAllowedDshWebOrigin(String(req.headers.origin || ''), webPort)
        && !req.headers['x-forwarded-for'];
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
    child;
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
        const directory = process.env.HARNESS_REMOTE_UPDATE_JOB;
        if (!directory)
            return;
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
            const current = this.current();
            if (!supportedDsh.includes(current.agentVersion) || process.arch !== 'x64')
                throw new Error('此 DSH / 架构的自动重启尚未验证，请手工更新');
            // The worker only restarts ordinary node CLI instances, never a service
            // manager/container/Electron process or a command with secret arguments.
            if (process.env.INVOCATION_ID || process.env.PM2_HOME || process.env.NODE_APP_INSTANCE || process.versions.electron
                || process.env.KUBERNETES_SERVICE_HOST || process.env.container || process.env.LAUNCH_JOBKEY_LABEL)
                throw new Error('由服务管理器启动的 DSH，请通过原服务管理方式更新');
            if (!process.argv.includes('web') || process.argv.some(a => /(?:api.?key|password|secret|token)[= ]/i.test(a))
                || process.execArgv.length)
                throw new Error('此启动方式不能安全自动重启，请手工更新');
            const cli = fs.realpathSync(process.argv[1]);
            if (JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json'), 'utf8')).name !== '@deepseek-ai/dsh')
                throw new Error('无法确认 DSH 启动程序');
            const profile = path.join(adapterDshHome(), 'profiles', agentProfileScope());
            if (fs.realpathSync(profile) !== profile || !fs.realpathSync(ownRoot).startsWith(profile + path.sep))
                throw new Error('插件不在可安全更新的独立 profile 中');
            const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'));
            if (manifest.packageManager && !/^pnpm@11\./.test(manifest.packageManager))
                throw new Error('此 profile 的包管理器版本尚未验证，请手工更新');
            const web = this.ctx.get('webServer');
            const sessions = this.ctx.get('sessions');
            if (!web?.server?.listeners || !sessions?.get || !sessions?.flush)
                throw new Error('此宿主缺少可验证的重启与保存能力，请手工更新');
            fs.accessSync(profile, fs.constants.W_OK);
            return { eligible: true, reason: '', profile, pnpm: resolvePnpm(profile), cli };
        }
        catch (error) {
            return { eligible: false, reason: error instanceof Error ? error.message : '安装环境暂不支持自动更新' };
        }
    }
    async quiesce() {
        const web = this.ctx.get('webServer');
        const server = web?.server;
        if (!server?.listeners)
            throw new Error('无法暂停主机请求');
        // This short fence applies to the native WebUI AND the LAN proxy. Public
        // in-process calls are fenced by DshCompatibilityApi below.
        const requests = server.listeners('request'), upgrades = server.listeners('upgrade');
        const paused = (req, res) => {
            if (req.method === 'POST' && req.url === '/api/session.list' && req.headers['x-harness-update-read'] === this.readToken
                && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) {
                requests.forEach((listener) => listener.call(server, req, res));
                return;
            }
            res.writeHead(503, { 'retry-after': '15' });
            res.end('Plugin update in progress');
        };
        const upgradePaused = (_req, socket) => socket.destroy();
        server.removeAllListeners('request');
        server.removeAllListeners('upgrade');
        server.on('request', paused);
        server.on('upgrade', upgradePaused);
        this.maintenance = true;
        this.restoreFence = () => {
            server.removeListener('request', paused);
            server.removeListener('upgrade', upgradePaused);
            requests.forEach((listener) => server.on('request', listener));
            upgrades.forEach((listener) => server.on('upgrade', listener));
            this.maintenance = false;
            this.restoreFence = undefined;
        };
        try {
            for (const socket of web.upgradedSockets || [])
                socket.destroy();
            const deadline = Date.now() + 5000;
            while (this.nativeRequests.size || this.otherInFlight()) {
                if (Date.now() > deadline)
                    throw new Error('仍有请求未完成');
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            const gateway = resolveTypertGateway(this.ctx);
            const request = { type: 'client-request', rpcId: 'update-idle', method: 'session.list', payload: {} };
            let value;
            if (gateway) {
                const reply = await invokeLegacyRpc(gateway, request, { signal: AbortSignal.timeout(5000), describeHost: () => ({}) });
                if (!reply.result.ok)
                    throw new Error('无法确认会话空闲');
                value = reply.result.value;
            }
            else {
                const response = await fetch(`http://127.0.0.1:${this.ports.web}/api/session.list`, {
                    method: 'POST', headers: { 'content-type': 'application/json', 'x-harness-update-read': this.readToken },
                    body: JSON.stringify(request), signal: AbortSignal.timeout(5000), redirect: 'error',
                });
                const reply = await response.json();
                if (!reply.result?.ok)
                    throw new Error('无法确认会话空闲');
                value = reply.result.value;
            }
            if (!Array.isArray(value?.items) || value.items.some((item) => item.running !== false))
                throw new Error('会话仍在运行');
            // Native session service shape is stable on the three explicitly tested
            // DSHs; do not reach across namespaces or maintain a shadow session store.
            const sessions = this.ctx.get('sessions');
            const items = sessions.list?.();
            if (!Array.isArray(items))
                throw new Error('无法枚举待保存会话');
            for (const session of items) {
                if (!await sessions.flush(session))
                    throw new Error('会话未保存');
            }
            // Upgraded sockets were closed above; this closes idle HTTP keep-alives.
            server.closeAllConnections?.();
        }
        catch (error) {
            this.restoreFence?.();
            throw error;
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
        let startedChild;
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
            const archive = await downloadRelease(plan.release);
            fs.writeFileSync(path.join(directory, 'release.tgz'), archive, { flag: 'wx', mode: 0o600 });
            const job = { id, directory, profile: eligible.profile, home, stateFile: defaultGateStatePath(),
                cli: eligible.cli, argv: [eligible.cli, ...process.argv.slice(2)], execArgv: process.execArgv,
                executable: process.execPath, cwd: process.cwd(), pnpm: eligible.pnpm, parentPid: process.pid,
                webPort: this.ports.web, gatePort: this.ports.gate, localPort: this.ports.local,
                targetVersion: plan.release.version, previousVersion: ownVersion(), dshVersion: this.current().agentVersion,
                statusToken: randomBytes(24).toString('hex') };
            validateJob(job);
            writePrivateJsonAtomic(path.join(directory, 'job.json'), job);
            writePrivateJsonAtomic(path.join(directory, 'package.json'), { type: 'module' });
            // Keep the worker's complete built-in-only module closure outside the
            // profile that will be renamed. No model credentials serialized to disk.
            for (const name of ['update-worker.js', 'secure-file.js'])
                fs.copyFileSync(path.join(ownRoot, 'lib', name), path.join(directory, name));
            const log = fs.openSync(path.join(directory, 'worker.log'), 'a', 0o600);
            this.child = spawn(process.execPath, [path.join(directory, 'update-worker.js'), path.join(directory, 'job.json')], {
                detached: true, windowsHide: true, stdio: ['ignore', log, log, 'ipc'], env: process.env, cwd: process.cwd(),
            });
            fs.closeSync(log);
            tightenPrivateFile(path.join(directory, 'worker.log'));
            const child = this.child;
            startedChild = child;
            this.watchWorker(child, lockPath, id);
            const statusOrigin = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('更新辅助进程启动超时')), 10000);
                child.once('error', () => { clearTimeout(timer); reject(new Error('无法启动更新辅助进程')); });
                child.on('message', (m) => { if (m.type === 'ready') {
                    clearTimeout(timer);
                    resolve(m.origin);
                } });
            });
            this.activeJob = { jobId: id, statusOrigin, statusToken: job.statusToken };
            writePrivateJsonAtomic(this.progressIndex(), this.activeJob);
            // Readiness is not permission to mutate. A timed-out helper cannot keep
            // going after the WebUI was told that startup failed.
            child.send({ type: 'start', id });
            return this.activeJob;
        }
        catch (error) {
            if (startedChild && startedChild.exitCode === null && startedChild.signalCode === null)
                startedChild.kill('SIGTERM');
            this.busy = false;
            this.restoreFence?.();
            if (ownedLock)
                releaseOwnedUpdateLock(lockPath, ownedLockId);
            throw error;
        }
    }
    watchWorker(child, lockPath, id) {
        const settled = () => {
            // A previous job's temporary progress server can exit while the next job
            // is running. It must not clear that newer job's fence or lock.
            if (this.child !== child)
                return;
            this.restoreFence?.();
            this.busy = false;
            releaseOwnedUpdateLock(lockPath, id);
        };
        child.on('message', (m) => {
            if (this.child !== child)
                return;
            const reply = (ok) => { if (child.connected)
                child.send({ type: 'quiesced', ok }, () => { }); };
            if (m.type === 'quiesce')
                void this.quiesce().then(() => reply(true), () => reply(false));
            if (m.type === 'finished')
                settled();
        });
        child.on('exit', settled);
    }
    async handle(req, res) {
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
        if (!acceptsUpdateRequest(req, this.ports.web, this.ports.local))
            return json(403, { error: '只能从当前电脑的 DSH WebUI 管理更新' });
        try {
            if (req.method === 'GET' && req.url === '/gate/update/check') {
                const advice = await this.check(true), eligible = this.eligibility();
                const release = this.catalog?.releases.find(r => r.version === advice.targetVersion);
                const recovered = this.recovery();
                const canInstall = Boolean(release?.asset && eligible.eligible && !this.busy && !this.isMaintaining() && !recovered.activeJob);
                if (canInstall)
                    this.ticket = { value: randomBytes(24).toString('hex'), expiresAt: Date.now() + 120000, revision: advice.revision, release: release };
                return json(200, { advice, canInstall, channel: previewUpdatesEnabled() ? 'preview' : 'stable', reason: !eligible.eligible ? eligible.reason : !release?.asset ? '暂无适配此组合的可验证更新包' : '',
                    ticket: canInstall ? this.ticket.value : '', ...recovered });
            }
            if (req.method === 'GET' && req.url === '/gate/update/status')
                return json(200, this.recovery());
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
