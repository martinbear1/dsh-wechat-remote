import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isAllowedDshWebOrigin } from './dsh-runtime.js';
import { agentDshHome, agentProfileScope, loadAgentDescriptor } from './agent-metadata.js';
import { desktopOwnsLifecycle } from './dsh-host-context.js';
import { assessUpdate, validateCatalog } from './update-policy.js';
import { boundedFetch } from './update-download.js';
import { LEGACY_UPDATE_MANUAL_MESSAGE } from './install-capabilities.js';
import { assertCliInstallOwner, ProfileOwnershipError } from './install-profile.js';
import { PLUGIN_VERSION } from './plugin-version.js';
const ownVersion = () => PLUGIN_VERSION;
// Two operator-only switches. Phone requests and release metadata cannot opt in.
export function previewUpdatesEnabled(env = process.env) {
    return env.HARNESS_REMOTE_UPDATE_CHANNEL === 'preview' && Boolean(env.HARNESS_REMOTE_UPDATE_CATALOG);
}
export function updateAction(advice, release, eligible, _occupied, ctx) {
    const none = { canInstall: false, mode: 'none', reason: '', manualCommand: '' };
    if (!advice.targetVersion || !release || release.version !== advice.targetVersion
        || !['info', 'recommended', 'required'].includes(advice.severity) || advice.expiresAt <= Date.now())
        return none;
    if (desktopOwnsLifecycle(ctx))
        return { ...none, mode: 'manual',
            reason: '请在 DSH 桌面应用的插件管理页更新，并按应用提示重新加载或重启。' };
    if (eligible.manualInstallAllowed === false)
        return { ...none, mode: 'manual', reason: eligible.reason };
    // Host-side command, not an executable instruction supplied by the WebUI.
    const profile = agentProfileScope(ctx);
    const manualCommand = release.channel === 'stable' && /^\d+\.\d+\.\d+$/.test(release.version) && /^[A-Za-z0-9_-]+$/.test(profile)
        ? `npx -y dsh-wechat-remote@latest${profile === 'web' ? '' : ` --profile ${profile}`}` : '';
    return { canInstall: false, mode: 'manual', reason: LEGACY_UPDATE_MANUAL_MESSAGE, manualCommand };
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
    // No host listeners or lifecycle ownership: inherited markers and historical
    // journals cannot pause an ordinary DSH startup.
    constructor(ctx, ports) {
        this.ctx = ctx;
        this.ports = ports;
    }
    current() {
        const d = loadAgentDescriptor(this.ctx);
        return { agentKind: d.agentKind, agentVersion: d.agentVersion, pluginVersion: ownVersion(), platform: d.hostPlatform.kind, arch: process.arch };
    }
    progressIndex() {
        const scope = createHash('sha256').update(agentProfileScope(this.ctx)).digest('hex').slice(0, 24);
        return path.join(agentDshHome(this.ctx), 'harness-remote-updates', `profile-${scope}.json`);
    }
    async recovery() {
        const attention = () => ({ activeJob: null, unresolvedJob: true, lastResult: { phase: 'attention', progress: 0, terminal: true,
                message: '发现旧版更新记录，请在主机核对安装结果。记录、备份和更新锁均保留；不会据此暂停、重启或恢复 DSH。' } });
        try {
            const job = JSON.parse(fs.readFileSync(this.progressIndex(), 'utf8'));
            if (!/^[a-f0-9]{32}$/.test(job.jobId))
                return attention();
            const dir = path.join(agentDshHome(this.ctx), 'harness-remote-updates', job.jobId);
            let result;
            try {
                result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
            }
            catch {
                return attention();
            }
            return result?.terminal === true
                ? { activeJob: null, lastResult: { ...result, jobId: job.jobId } }
                : attention();
        }
        catch (error) {
            return error.code === 'ENOENT' ? { activeJob: null, lastResult: null } : attention();
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
    async nativeRelease() {
        const advice = await this.check(true);
        return { advice, release: this.catalog?.releases.find(row => row.version === advice.targetVersion),
            channel: previewUpdatesEnabled() ? 'preview' : 'stable' };
    }
    eligibility() {
        if (desktopOwnsLifecycle(this.ctx))
            return { eligible: false, reason: '请通过 DSH 桌面应用的插件管理页更新' };
        try {
            assertCliInstallOwner(path.join(agentDshHome(this.ctx), 'profiles', agentProfileScope(this.ctx)));
        }
        catch (error) {
            return { eligible: false, reason: error instanceof Error ? error.message : LEGACY_UPDATE_MANUAL_MESSAGE,
                ...(error instanceof ProfileOwnershipError ? { manualInstallAllowed: false } : {}) };
        }
        return { eligible: false, reason: LEGACY_UPDATE_MANUAL_MESSAGE };
    }
    async handle(req, res) {
        const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
        if (!acceptsUpdateRequest(req, this.ports.web, this.ports.local))
            return json(403, { error: '只能从当前电脑的 DSH WebUI 管理更新' });
        try {
            if (req.method === 'GET' && req.url === '/gate/update/check') {
                const advice = await this.check(true);
                const release = this.catalog?.releases.find(r => r.version === advice.targetVersion);
                const recovered = await this.recovery();
                const eligible = release ? this.eligibility() : { eligible: false, reason: '' };
                const action = updateAction(advice, release, eligible, false, this.ctx);
                return json(200, { advice, ...action, channel: previewUpdatesEnabled() ? 'preview' : 'stable',
                    ticket: '', ...recovered });
            }
            if (req.method === 'GET' && req.url === '/gate/update/status')
                return json(200, await this.recovery());
            if (req.method === 'GET' && req.url?.startsWith('/gate/update/resume?')) {
                const query = new URL(req.url, 'http://localhost').searchParams;
                const id = query.get('job') || '';
                if (!/^[a-f0-9]{32}$/.test(id) || query.size !== 1)
                    throw new Error('更新尚未完成验证');
                const directory = path.join(agentDshHome(this.ctx), 'harness-remote-updates', id);
                const job = JSON.parse(fs.readFileSync(path.join(directory, 'job.json'), 'utf8'));
                const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
                if (job.id !== id || job.home !== agentDshHome(this.ctx) || job.profile !== path.join(agentDshHome(this.ctx), 'profiles', agentProfileScope(this.ctx))
                    || job.webPort !== this.ports.web || !result.terminal || !result.ok || ownVersion() !== job.targetVersion)
                    throw new Error('当前实例与完成的更新不匹配');
                // This loopback + exact browser Origin/Host door is already the local
                // management authority. Never put the launch URL in public metadata,
                // progress journals, cloud messages, or logs.
                return json(200, { url: resumedWebUrl(this.ctx.get('connection'), String(req.headers.origin), this.ports.web) });
            }
            // Previously issued tickets must not revive the retired CLI transaction.
            if (req.method === 'POST' && req.url === '/gate/update/start')
                return json(409, {
                    error: LEGACY_UPDATE_MANUAL_MESSAGE, code: 'NATIVE_MANUAL_UPDATE_REQUIRED',
                });
            return json(404, { error: 'Not found' });
        }
        catch (error) {
            return json(409, { error: error instanceof Error ? error.message : '更新暂不可用' });
        }
    }
    dispose() { }
}
