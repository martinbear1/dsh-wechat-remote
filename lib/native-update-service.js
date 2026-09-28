/** Operator-only Desktop self update. The native manager owns all profile
 * mutations, approvals, package rollback and activation. No shell, CLI,
 * profile edits, forced restart or change to the other node in this service. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { trustedNpmInstaller, compareVersions } from './update-policy.js';
import { writePrivateJsonAtomic } from './secure-file.js';
import { symbols } from '@deepseek-ai/cordis';
const bundleName = 'dsh-wechat-remote';
export class NativeUpdateService {
    options;
    state = { phase: 'idle', message: '' };
    plan;
    checking;
    operation;
    disposed = false;
    lifetime = new AbortController();
    directory;
    journal;
    constructor(options) {
        this.options = options;
        this.directory = path.join(options.home, 'harness-remote-updates', 'native-desktop');
        this.journal = path.join(this.directory, 'status.json');
        // Read-only recovery: startup never installs, retries, or clears an unknown job.
        if (options.scope !== 'desktop')
            return;
        try {
            const old = JSON.parse(fs.readFileSync(this.journal, 'utf8'));
            if (!/^[a-f0-9]{32}$/.test(old.jobId) || !['preparing', 'installing', 'restart-required', 'complete', 'failed', 'unknown'].includes(old.phase)
                || typeof old.targetVersion !== 'string' || typeof old.previousVersion !== 'string')
                throw Error('invalid journal');
            compareVersions(old.targetVersion, old.previousVersion);
            this.state = { phase: old.phase, jobId: old.jobId, targetVersion: old.targetVersion, previousVersion: old.previousVersion,
                message: '正在核对上次更新结果。' };
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                this.state = { phase: 'unknown', message: '无法读取上次更新记录，请在原生插件管理器核对；未重复安装。' };
        }
    }
    isBusy = () => Boolean(this.operation);
    save(state) {
        // Persist before an install; if recording fails, do not admit a mutation.
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        writePrivateJsonAtomic(this.journal, state);
        this.state = state;
    }
    async inventory() {
        if (this.options.scope !== 'desktop')
            throw Error('此入口只管理当前 Desktop 插件');
        const manager = this.options.manager();
        if (typeof manager?.listBundles !== 'function' || typeof manager?.installBundle !== 'function')
            throw Error('此 DSH 未提供原生插件更新能力，请在应用中管理插件');
        const list = await manager.listBundles();
        const owners = list.filter(row => [bundleName, '@harness-remote/dsh-wechat-remote'].includes(row.name));
        const own = owners[0];
        if (owners.length !== 1 || own.name !== bundleName || !own.installed || !own.enabled || own.error || own.readOnlyReason || !own.version)
            throw Error('当前安装归属或启用状态已变化，请在原生插件管理器核对');
        return { manager, own };
    }
    status = async () => {
        if (this.operation)
            return { ...this.state };
        // Also detect installs performed in DSH's own manager (no plugin journal).
        // Installed files are not proof that the already-loaded runtime changed.
        if (!this.state.targetVersion) {
            try {
                const { own } = await this.inventory();
                if (own.version !== this.options.runningVersion)
                    return { phase: 'restart-required', targetVersion: own.version,
                        previousVersion: this.options.runningVersion, message: `Desktop 已安装 ${own.version}，仍在运行 ${this.options.runningVersion}。请在任务结束后退出并重新打开 Desktop；无需重新配对。` };
            }
            catch { /* check() reports unavailable inventory; never installs */ }
            return { ...this.state };
        }
        if (this.state.phase === 'failed')
            return { ...this.state, message: this.state.message === '正在核对上次更新结果。'
                    ? '上次更新未完成，可检查更新后重试；原生审批或版本问题请在插件管理器处理。' : this.state.message };
        try {
            const { own } = await this.inventory();
            const target = this.state.targetVersion;
            if (own.version === target) {
                this.state = this.options.runningVersion === target
                    ? { ...this.state, phase: 'complete', message: 'Desktop 插件已更新并生效。' }
                    : this.state.phase === 'restart-required'
                        ? { ...this.state, message: 'Desktop 插件已安装，退出并重新打开 Desktop 后生效。不会自动结束任务。' }
                        : { ...this.state, phase: 'unknown', message: '安装文件已变化，但原生更新结果未确认。请在插件管理器核对，未自动重试。' };
            }
            else if (['preparing', 'installing', 'restart-required', 'complete'].includes(this.state.phase)) {
                this.state = { ...this.state, phase: 'unknown', message: '上次更新结果或安装版本已变化，请先在原生插件管理器核对；未重复安装。' };
            }
        }
        catch {
            return { ...this.state, phase: 'unknown', message: '暂时无法确认安装结果，请恢复连接后重新检查；不要重复安装。' };
        }
        return { ...this.state };
    };
    check = () => {
        if (this.checking)
            return this.checking;
        this.checking = (async () => {
            const status = await this.status();
            const result = await this.options.release();
            let reason = '', canInstall = false;
            this.plan = undefined;
            try {
                if (this.disposed)
                    throw Error('连接已关闭，请重新打开设置');
                if (this.operation || this.options.otherBusy?.())
                    throw Error('正在处理插件更新，请等待完成');
                if (['restart-required', 'unknown'].includes(status.phase))
                    throw Error(status.message);
                const { own } = await this.inventory();
                if (own.version !== this.options.runningVersion)
                    throw Error('安装版本和运行版本不同，请先重新打开 Desktop');
                const release = result.release;
                if (release && result.advice.component === 'plugin' && result.advice.targetVersion === release.version) {
                    if (compareVersions(release.version, own.version) <= 0)
                        throw Error('不会重复安装或降级当前插件');
                    if (!trustedNpmInstaller(release.npmInstaller) || release.npmInstaller.version !== release.version)
                        throw Error('目标版本尚未提供可验证的 Desktop 安装包');
                    this.plan = { ticket: randomBytes(24).toString('hex'), expires: Date.now() + 120000, release: structuredClone(release), revision: result.advice.revision };
                    canInstall = true;
                }
            }
            catch (error) {
                reason = error instanceof Error ? error.message : '当前无法自动更新';
            }
            return { advice: result.advice, channel: result.channel, canInstall, reason, ticket: this.plan?.ticket || '', status };
        })().finally(() => { this.checking = undefined; });
        return this.checking;
    };
    start = (ticket) => {
        if (this.disposed || this.operation || this.options.otherBusy?.())
            throw Error('连接或更新状态已变化，请稍后重新检查');
        const plan = this.plan;
        if (!plan || !/^[a-f0-9]{48}$/.test(ticket) || ticket !== plan.ticket || plan.expires <= Date.now())
            throw Error('更新确认已过期，请重新检查更新');
        this.plan = undefined;
        const state = { phase: 'preparing', jobId: randomBytes(16).toString('hex'), targetVersion: plan.release.version,
            previousVersion: this.options.runningVersion, message: '正在核对版本和任务状态；确认后交由 Desktop 原生插件管理器下载并安装。' };
        this.save(state);
        this.operation = this.run(plan, state).finally(() => { this.operation = undefined; });
        return { ...state };
    };
    async idle() {
        this.lifetime.signal.throwIfAborted();
        const sessions = this.options.sessions();
        if (typeof sessions?.list !== 'function')
            throw Error('无法确认当前任务状态，未更新插件');
        const list = await sessions.list({}, AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]));
        if (!Array.isArray(list?.items) || list.items.some(row => typeof row.running !== 'boolean'))
            throw Error('无法确认当前任务状态，未更新插件');
        if (list.items.some(row => row.running))
            throw Error('Desktop 仍有任务在运行，请任务结束后重新检查更新');
    }
    async run(plan, state) {
        let admitted = false;
        try {
            const result = await this.options.release();
            if (result.advice.revision !== plan.revision || result.advice.targetVersion !== plan.release.version
                || JSON.stringify(result.release) !== JSON.stringify(plan.release))
                throw Error('更新清单已变化，请重新检查确认');
            const before = await this.inventory();
            if (before.own.version !== state.previousVersion)
                throw Error('安装版本已变化，未覆盖或降级');
            await this.idle();
            await this.idle();
            const current = await this.inventory();
            this.lifetime.signal.throwIfAborted();
            // Cordis creates a fresh traceable proxy on each get(). Compare public
            // original identities, retaining the real provider-replacement fence.
            const identity = (manager) => manager[symbols.original] ?? manager;
            const liveManager = this.options.manager();
            if (!liveManager || identity(liveManager) !== identity(current.manager) || identity(current.manager) !== identity(before.manager)
                || current.own.version !== state.previousVersion || this.options.otherBusy?.())
                throw Error('安装状态已变化，未执行旧更新请求');
            this.save({ ...state, phase: 'installing', message: 'Desktop 原生插件管理器正在下载并安装更新，使用应用配置的安装源。网络较慢时请耐心等待，暂勿退出应用或重复安装。' });
            admitted = true;
            // Use the SAME public package-spec entry point as the native install UI.
            // RC7/RC8 pre-downloaded an archive with our own 60s deadline, bypassing
            // the manager's configured registry/fallbacks and failing on slow links
            // before native installation ever started. Do not wrap this call in a
            // plugin deadline, shell installer, forced restart or automatic retry.
            // Lock the user-confirmed version (never latest/ranges). Transport and
            // package integrity now belong to native pnpm, just like a manual native
            // install; this is NOT our previous catalog-SHA256/archive audit. Retain
            // catalog admission above, native compatibility/approval checks (never
            // approvedBuilds), and verify the actual installed version below.
            const outcome = await current.manager.installBundle(`${bundleName}@${plan.release.version}`, { enabled: true, requestId: state.jobId });
            if (outcome.error || !['applied', 'restart-required'].includes(outcome.application) || outcome.bundle !== bundleName) {
                admitted = false; // Native manager returned a definitive refusal/rollback.
                throw Error(outcome.pendingBuilds?.length ? '原生安装需要脚本审批，请在插件管理器查看；未代你批准。'
                    : outcome.error?.code === 'incompatible-version' ? 'DSH 拒绝了不兼容的插件版本；未绕过兼容检查。'
                        : ['network', 'timeout'].includes(outcome.packageResult?.kind ?? '') ? '原生插件管理器下载未完成，请检查网络或应用安装源后重试；未确认更新成功。'
                            : '原生插件管理器未完成更新，请在插件管理器查看安装详情。');
            }
            const after = await this.inventory();
            if (after.own.version !== state.targetVersion)
                throw Error('安装后的版本尚未核实，请在插件管理器核对');
            this.save({ ...state, phase: 'restart-required', message: 'Desktop 插件已安装，退出并重新打开 Desktop 后生效。不会自动结束任务。' });
        }
        catch (error) {
            const failed = { ...state, phase: admitted ? 'unknown' : 'failed',
                message: admitted ? '原生更新结果暂未确认，请在插件管理器核对；未重复安装。' : error instanceof Error ? error.message : '更新未完成，请稍后重试' };
            try {
                this.save(failed);
            }
            catch {
                this.state = { ...failed, phase: 'unknown', message: '更新结果无法保存，请在原生插件管理器核对；未重复安装。' };
            }
        }
    }
    dispose() { this.disposed = true; this.plan = undefined; this.lifetime.abort(); }
}
