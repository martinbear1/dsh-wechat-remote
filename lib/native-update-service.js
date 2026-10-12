/** Operator-only self update. The native manager owns all profile
 * mutations, approvals, package rollback and activation. No shell, CLI,
 * profile edits, forced restart or change to the other node in this service. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { trustedNpmInstaller, trustedReleaseAsset, compareVersions } from './update-policy.js';
import { auditArchive, downloadRelease } from './update-download.js';
import { writePrivateJsonAtomic } from './secure-file.js';
import { symbols } from '@deepseek-ai/cordis';
const bundleName = 'dsh-wechat-remote';
const coreName = '@harness-remote/dsh-wechat-remote';
/** Capability discovery is read-only and does not query packages or tasks. */
export function supportsNativeUpdates(manager, scope) {
    const candidate = manager;
    return ['desktop', 'web'].includes(scope)
        && typeof candidate?.listBundles === 'function' && typeof candidate?.installBundle === 'function';
}
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
        // Keep the existing Desktop journal and separate Web's result. No startup
        // migration, network check or install is needed for either profile.
        this.directory = path.join(options.home, 'harness-remote-updates', options.scope === 'web' ? 'native-web' : 'native-desktop');
        this.journal = path.join(this.directory, 'status.json');
        // Read-only recovery: startup never installs, retries, or clears an unknown job.
        if (!['desktop', 'web'].includes(options.scope))
            return;
        try {
            const old = JSON.parse(fs.readFileSync(this.journal, 'utf8'));
            if (!/^[a-f0-9]{32}$/.test(old.jobId) || !['preparing', 'installing', 'restart-required', 'complete', 'failed', 'unknown'].includes(old.phase)
                || typeof old.targetVersion !== 'string' || typeof old.previousVersion !== 'string'
                || (old.bundle !== undefined && ![bundleName, coreName].includes(old.bundle)))
                throw Error('invalid journal');
            compareVersions(old.targetVersion, old.previousVersion);
            this.state = { phase: old.phase === 'preparing' ? 'failed' : old.phase, jobId: old.jobId, targetVersion: old.targetVersion, previousVersion: old.previousVersion,
                bundle: old.bundle ?? bundleName, // Older Desktop journals could only update the outer package.
                message: old.phase === 'preparing' ? '上次更新在安装前中断，可重新检查更新；当前插件未被替换。' : '正在核对上次更新结果。' };
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
        if (!['desktop', 'web'].includes(this.options.scope))
            throw Error('此入口只管理当前 Web 或 Desktop 插件');
        const manager = this.options.manager();
        if (!supportsNativeUpdates(manager, this.options.scope))
            throw Error('当前 DSH 未提供原生插件管理器，请先将 DSH 更新到提供该能力的版本，再检查插件更新。');
        const list = await manager.listBundles();
        const owners = list.filter(row => [bundleName, coreName].includes(row.name) && row.installed);
        const own = owners[0];
        if (owners.length > 1)
            throw Error('当前存在两份微信连接安装，请先核对并合并安装；不会自动删除或再添加插件');
        if (owners.length !== 1 || !own.enabled || own.error || own.readOnlyReason || !own.version)
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
                        previousVersion: this.options.runningVersion, bundle: own.name,
                        message: `插件已安装 ${own.version}，仍在运行 ${this.options.runningVersion}。请在任务结束后正常重启当前 DSH；无需重新配对。` };
            }
            catch { /* check() reports unavailable inventory; never installs */ }
            return { ...this.state };
        }
        // A definite refusal (or failure before calling the manager) is not an
        // uncertain mutation. check() will inspect the owner again before retrying.
        if (this.state.phase === 'failed')
            return { ...this.state, message: this.state.message === '正在核对上次更新结果。'
                    ? '上次更新未完成，可检查更新后重试；原生审批或版本问题请在插件管理器处理。' : this.state.message };
        try {
            const { own } = await this.inventory();
            // A completed native transaction can be superseded by a later manual
            // upgrade/migration. Matching live and installed versions establish the
            // current state; an old receipt must not permanently veto future updates.
            // Never infer this for an interrupted or otherwise unconfirmed install.
            if (['complete', 'restart-required'].includes(this.state.phase)
                && own.version === this.options.runningVersion
                && (own.name !== this.state.bundle || own.version !== this.state.targetVersion)) {
                this.state = { phase: 'idle', message: '' };
                return { ...this.state };
            }
            if (own.name !== this.state.bundle)
                return { ...this.state, phase: 'unknown', message: '安装归属已变化，请在原生插件管理器核对；未重复安装。' };
            const target = this.state.targetVersion;
            if (own.version === target) {
                this.state = this.options.runningVersion === target
                    ? { ...this.state, phase: 'complete', message: '当前插件已更新并生效。' }
                    : this.state.phase === 'restart-required'
                        ? { ...this.state, message: this.restartMessage() }
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
                    throw Error('安装版本和运行版本不同，请先正常重启当前 DSH');
                const release = result.release;
                if (release && result.advice.component === 'plugin' && result.advice.targetVersion === release.version) {
                    if (compareVersions(release.version, own.version) <= 0)
                        throw Error('不会重复安装或降级当前插件');
                    if (own.name === bundleName
                        ? !trustedNpmInstaller(release.npmInstaller) || release.npmInstaller.version !== release.version
                        : !trustedReleaseAsset(release.asset, release.version))
                        throw Error('目标版本尚未提供适合当前安装的可验证更新包');
                    this.plan = { ticket: randomBytes(24).toString('hex'), expires: Date.now() + 120000, release: structuredClone(release), revision: result.advice.revision, bundle: own.name };
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
            previousVersion: this.options.runningVersion, bundle: plan.bundle, message: '正在准备更新；安装由当前 DSH 的原生插件管理器处理。' };
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
            throw Error('当前 DSH 仍有任务在运行，请任务结束后重新检查更新');
    }
    restartMessage() { return '插件已安装，请在任务结束后正常重启当前 DSH 后生效。不会自动结束任务。'; }
    async installSpec(plan, jobId) {
        if (plan.bundle === bundleName)
            return `${bundleName}@${plan.release.version}`;
        // A historical core installation must remain the same native bundle. Its
        // verified GitHub artifact also has the existing npm-wrapper fallback.
        // pnpm stores this file: reference in its manifest/lockfile: retain the
        // immutable archive for future package operations, not in an OS temp dir.
        const file = path.join(this.directory, `core-${plan.release.version}-${plan.release.asset.sha256}.tgz`);
        try {
            auditArchive(await fs.promises.readFile(file), plan.release);
            this.lifetime.signal.throwIfAborted();
            return file;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        const archive = await downloadRelease(plan.release, fetch, { signal: this.lifetime.signal });
        const temporary = path.join(this.directory, `${jobId}.tgz.tmp`);
        try {
            await fs.promises.writeFile(temporary, archive, { flag: 'wx', mode: 0o600 });
            try {
                await fs.promises.link(temporary, file);
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
                auditArchive(await fs.promises.readFile(file), plan.release);
            }
        }
        finally {
            await fs.promises.rm(temporary, { force: true });
        }
        return file;
    }
    async run(plan, state) {
        let admitted = false;
        try {
            const result = await this.options.release();
            if (result.advice.revision !== plan.revision || result.advice.targetVersion !== plan.release.version
                || JSON.stringify(result.release) !== JSON.stringify(plan.release))
                throw Error('更新清单已变化，请重新检查确认');
            const before = await this.inventory();
            if (before.own.name !== plan.bundle || before.own.version !== state.previousVersion)
                throw Error('安装归属或版本已变化，未覆盖或降级');
            const spec = await this.installSpec(plan, state.jobId);
            // One live task check after preparation; there is no install fence and
            // no status lookup in ordinary message/connection paths.
            await this.idle();
            const current = await this.inventory();
            this.lifetime.signal.throwIfAborted();
            // Cordis creates a fresh traceable proxy on each get(). Compare public
            // original identities, retaining the real provider-replacement fence.
            const identity = (manager) => manager[symbols.original] ?? manager;
            const liveManager = this.options.manager();
            if (!liveManager || identity(liveManager) !== identity(current.manager) || identity(current.manager) !== identity(before.manager)
                || current.own.name !== plan.bundle || current.own.version !== state.previousVersion || this.options.otherBusy?.())
                throw Error('安装状态已变化，未执行旧更新请求');
            this.save({ ...state, phase: 'installing', message: '原生插件管理器正在安装更新。网络较慢时请耐心等待，暂勿退出 DSH 或重复安装。' });
            admitted = true;
            // Same public entry as native install UI: outer npm exact version uses
            // native transport/registries; historical core uses its verified archive.
            // Never override approvals, wrap native installation in a short plugin
            // timeout, automatically retry, force restart or switch bundle identity.
            const outcome = await current.manager.installBundle(spec, { enabled: true, requestId: state.jobId });
            if (outcome.error || !['applied', 'restart-required'].includes(outcome.application)) {
                admitted = false; // Native manager returned a definitive refusal/rollback.
                throw Error(outcome.pendingBuilds?.length ? '原生安装需要脚本审批，请在插件管理器查看；未代你批准。'
                    : outcome.error?.code === 'incompatible-version' ? 'DSH 拒绝了不兼容的插件版本；未绕过兼容检查。'
                        : ['network', 'timeout'].includes(outcome.packageResult?.kind ?? '') ? '原生插件管理器下载未完成，请检查网络或应用安装源后重试；未确认更新成功。'
                            : '原生插件管理器未完成更新，请在插件管理器查看安装详情。');
            }
            if (outcome.bundle !== plan.bundle)
                throw Error('原生安装返回的归属不一致，请核对插件管理器');
            const after = await this.inventory();
            if (after.own.name !== plan.bundle || after.own.version !== state.targetVersion)
                throw Error('安装后的归属或版本尚未核实，请在插件管理器核对');
            this.save({ ...state, phase: 'restart-required', message: this.restartMessage() });
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
