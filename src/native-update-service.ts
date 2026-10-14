/** Operator-only self update. The native manager owns all profile
 * mutations, approvals, package rollback and activation. No shell, CLI,
 * profile edits, forced restart or change to the other node in this service. */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { trustedNpmInstaller, trustedReleaseAsset, compareVersions, type Release, type UpdateAdvice } from './update-policy.js'
import { auditArchive, auditNativeRelease, downloadNativeRelease, downloadRelease } from './update-download.js'
import { writePrivateJsonAtomic } from './secure-file.js'
import { symbols } from '@deepseek-ai/cordis'

const bundleName = 'dsh-wechat-remote'
const coreName = '@harness-remote/dsh-wechat-remote'
const inPlaceUpdateUnsupported = '当前 DSH 不支持通过此方式覆盖更新，现有插件未改动。'
type Owner = typeof bundleName | typeof coreName
type Phase = 'idle' | 'preparing' | 'installing' | 'restart-required' | 'complete' | 'failed' | 'unknown'
interface NativeReceipt { application: string; changed?: boolean; errorCode?: string; bundle?: string; needsApproval?: boolean; packageKind?: string }
export interface NativeUpdateStatus { phase: Phase; message: string; jobId?: string; targetVersion?: string; previousVersion?: string; bundle?: Owner; nativeResult?: NativeReceipt }
interface Bundle { name: string; version?: string; installed: boolean; enabled: boolean; error?: unknown; readOnlyReason?: unknown }
interface NativeOutcome { application: string; changed?: boolean; bundle?: string; error?: { code?: string }; pendingBuilds?: string[]; packageResult?: { kind?: string } }
interface Manager {
  listBundles(): Promise<Bundle[]>
  installBundle(spec: string, options: { enabled: true; requestId: string }): Promise<NativeOutcome>
  waitForInstall?(requestId: string): Promise<NativeOutcome | null>
}
// Cordis can return a new traceable proxy for the same live provider.
const managerIdentity = (manager: Manager): object => (manager as any)[symbols.original] ?? manager
/** Capability discovery is read-only and does not query packages or tasks. */
export function supportsNativeUpdates(manager: unknown, scope: string): manager is Manager {
  const candidate = manager as Partial<Manager> | null | undefined
  return ['desktop', 'web'].includes(scope)
    && typeof candidate?.listBundles === 'function' && typeof candidate?.installBundle === 'function'
}
export interface NativeUpdateOptions {
  home: string; scope: string; runningVersion: string
  manager(): Manager | undefined
  sessions(): { list(request: object, signal: AbortSignal): Promise<{ items: { running: boolean }[] }> } | undefined
  release(): Promise<{ advice: UpdateAdvice; release?: Release; channel: 'stable' | 'preview' }>
}
export class NativeUpdateService {
  private state: NativeUpdateStatus = { phase: 'idle', message: '' }
  private plan?: { ticket: string; expires: number; release: Release; revision: string; bundle: Owner }
  private checking?: Promise<unknown>
  private operation?: Promise<void>
  private disposed = false
  private lifetime = new AbortController()
  private observation?: { jobId: string; manager: object; outcome: 'pending' | 'absent' | 'settled' | 'unavailable' }
  // Evidence from this live native provider, not a guessed version/capability.
  // Never persist it across a host restart or provider/installation change.
  private refusedUpdate?: { manager: object; bundle: string; installedVersion: string; target: string }
  private readonly directory: string
  private readonly journal: string
  constructor(private options: NativeUpdateOptions) {
    // Keep the existing Desktop journal and separate Web's result. No startup
    // migration, network check or install is needed for either profile.
    this.directory = path.join(options.home, 'harness-remote-updates', options.scope === 'web' ? 'native-web' : 'native-desktop')
    this.journal = path.join(this.directory, 'status.json')
    // Read-only recovery: startup never installs, retries, or clears an unknown job.
    if (!['desktop', 'web'].includes(options.scope)) return
    try {
      const old = this.readJournal()
      this.state = old.phase === 'preparing'
        ? { ...old, phase: 'failed', message: '上次更新在安装前中断，可重新检查更新；当前插件未被替换。' } : old
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.state = { phase: 'unknown', message: '无法读取上次更新记录，请在原生插件管理器核对；未重复安装。' }
    }
  }
  isBusy = (): boolean => Boolean(this.operation)
  private readJournal(): NativeUpdateStatus {
    const old = JSON.parse(fs.readFileSync(this.journal, 'utf8'))
    if (!/^[a-f0-9]{32}$/.test(old.jobId) || !['preparing', 'installing', 'restart-required', 'complete', 'failed', 'unknown'].includes(old.phase)
        || typeof old.targetVersion !== 'string' || typeof old.previousVersion !== 'string'
        || (old.bundle !== undefined && ![bundleName, coreName].includes(old.bundle))) throw Error('invalid journal')
    compareVersions(old.targetVersion, old.previousVersion)
    if (old.nativeResult !== undefined && (!old.nativeResult || !['applied', 'restart-required', 'failed', 'cancelled'].includes(old.nativeResult.application)
        || (old.nativeResult.changed !== undefined && typeof old.nativeResult.changed !== 'boolean'))) throw Error('invalid receipt')
    const receipt = old.nativeResult
    const label = (value: unknown): string | undefined => typeof value === 'string' && /^[\w@./-]{1,160}$/.test(value) ? value : undefined
    const nativeResult: NativeReceipt | undefined = receipt === undefined ? undefined : {
      application: receipt.application, changed: receipt.changed, errorCode: label(receipt.errorCode), bundle: label(receipt.bundle),
      needsApproval: receipt.needsApproval === true, packageKind: label(receipt.packageKind),
    }
    const nativeFailed = nativeResult && ['failed', 'cancelled'].includes(nativeResult.application)
    // Whitelist the public receipt. Do not forward arbitrary historical journal
    // fields or native package-manager diagnostics through management responses.
    return { jobId: old.jobId, targetVersion: old.targetVersion, previousVersion: old.previousVersion,
      bundle: old.bundle ?? bundleName, phase: nativeFailed ? 'failed' : old.phase, nativeResult,
      message: nativeFailed && (old.phase === 'complete' || old.phase === 'restart-required')
        ? '原生更新未完成；请查看插件管理器中的安装结果。'
        : typeof old.message === 'string' && old.message.length <= 1000 ? old.message : '正在核对上次更新结果。' }
  }
  private save(state: NativeUpdateStatus, continuation = false) {
    // Synchronous compare + replace protects same-process HMR generations. This
    // is NOT a cross-process lock around DSH package operations.
    if (continuation) {
      const current = this.readJournal()
      if (current.jobId !== state.jobId || current.nativeResult) return
    }
    // Persist before an install; if recording fails, do not admit a mutation.
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    writePrivateJsonAtomic(this.journal, state)
    this.state = state
  }
  private settle(state: NativeUpdateStatus, outcome: NativeOutcome) {
    const nativeResult: NativeReceipt = { application: outcome.application, changed: outcome.changed,
      errorCode: outcome.error?.code, bundle: outcome.bundle, needsApproval: Boolean(outcome.pendingBuilds?.length), packageKind: outcome.packageResult?.kind }
    const success = !outcome.error && ['applied', 'restart-required'].includes(outcome.application)
    const partial = !success && outcome.changed === true
    const message = success ? this.restartMessage()
      : partial ? '安装文件已改变，但新版启用未完成；未自动回退或重复安装，请在 DSH 插件管理器查看详情。'
      : outcome.error?.code === 'already-installed' ? inPlaceUpdateUnsupported
      : outcome.pendingBuilds?.length ? '原生安装需要脚本审批，请在插件管理器查看；未代你批准。'
      : outcome.error?.code === 'incompatible-version' ? 'DSH 拒绝了不兼容的插件版本；未绕过兼容检查。'
      : ['network', 'timeout'].includes(outcome.packageResult?.kind ?? '') ? '原生插件管理器下载未完成，请检查网络或应用安装源后重试；未确认更新成功。'
      : '原生插件管理器未完成更新，请在插件管理器查看安装详情。'
    this.save({ ...state, nativeResult, phase: success ? 'restart-required' : 'failed', message }, true)
  }
  private observe(manager: Manager, state: NativeUpdateStatus) {
    if (!state.jobId || state.nativeResult || typeof manager.waitForInstall !== 'function') return
    const identity = managerIdentity(manager)
    if (this.observation?.jobId === state.jobId && this.observation.manager === identity) return
    const observation: NonNullable<NativeUpdateService['observation']> = { jobId: state.jobId, manager: identity, outcome: 'pending' }
    this.observation = observation
    // Never await the native applying phase in gate startup/status: HMR may be
    // waiting for this very gate to finish mounting. This is observation only.
    void manager.waitForInstall(state.jobId).then(outcome => {
      observation.outcome = outcome ? 'settled' : 'absent'
      if (outcome) this.settle(state, outcome)
    }).catch(() => { observation.outcome = 'unavailable' /* no inference from an unreadable result */ })
  }
  private async inventory() {
    if (!['desktop', 'web'].includes(this.options.scope)) throw Error('此入口只管理当前 Web 或 Desktop 插件')
    const manager = this.options.manager()
    if (!supportsNativeUpdates(manager, this.options.scope)) throw Error('当前 DSH 未提供原生插件管理器，请先将 DSH 更新到提供该能力的版本，再检查插件更新。')
    const list = await manager.listBundles()
    const owners = list.filter(row => [bundleName, coreName].includes(row.name) && row.installed)
    const own = owners[0]
    if (owners.length > 1) throw Error('当前存在两份微信连接安装，请先核对并合并安装；不会自动删除或再添加插件')
    if (owners.length !== 1 || !own.enabled || own.error || own.readOnlyReason || !own.version) throw Error('当前安装归属或启用状态已变化，请在原生插件管理器核对')
    return { manager, own }
  }
  private updateTarget(bundle: string, release: Release) {
    return JSON.stringify([release.version, bundle === bundleName ? release.npmInstaller : release.asset])
  }
  private isRefused(manager: Manager, own: Bundle, release: Release) {
    const refusal = this.refusedUpdate
    if (!refusal) return false
    if (refusal.manager !== managerIdentity(manager) || refusal.bundle !== own.name || refusal.installedVersion !== own.version) {
      this.refusedUpdate = undefined
      return false
    }
    return refusal.target === this.updateTarget(own.name, release)
  }
  status = async (): Promise<NativeUpdateStatus> => {
    if (this.operation) return { ...this.state }
    // A new gate can mount before the old instance receives DSH's final reply.
    // Re-read that instance's receipt, rather than keeping a startup snapshot.
    try {
      const latest = this.readJournal()
      this.state = latest.phase === 'preparing'
        ? { ...latest, phase: 'failed', message: '上次更新在安装前中断，可重新检查更新；当前插件未被替换。' } : latest
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { ...this.state, phase: 'unknown', message: '暂时无法读取更新记录，请稍后检查；未重复安装。' }
    }
    // Also detect installs performed in DSH's own manager (no plugin journal).
    // Installed files are not proof that the already-loaded runtime changed.
    if (!this.state.targetVersion) {
      try {
        const { own } = await this.inventory()
        if (own.version !== this.options.runningVersion) return { phase: 'restart-required', targetVersion: own.version,
          previousVersion: this.options.runningVersion, bundle: own.name as Owner,
          message: `插件已安装 ${own.version}，仍在运行 ${this.options.runningVersion}。请在任务结束后正常重启当前 DSH；无需重新配对。` }
      } catch { /* check() reports unavailable inventory; never installs */ }
      return { ...this.state }
    }
    if (!this.state.nativeResult && ['installing', 'unknown'].includes(this.state.phase)) {
      const manager = this.options.manager()
      if (manager) this.observe(manager, this.state)
      const observation = this.observation
      const pending = manager && observation && observation.jobId === this.state.jobId
        && observation.manager === managerIdentity(manager) && observation.outcome === 'pending'
      return { ...this.state, phase: pending ? 'installing' : 'unknown',
        message: pending ? 'DSH 仍在处理这次更新，正在等待最终结果；未重复安装。'
          : '上次更新结果尚未确认，请在 DSH 插件管理器核对；未自动重试。' }
    }
    if (this.state.nativeResult && !['applied', 'restart-required'].includes(this.state.nativeResult.application)) return { ...this.state }
    // A definite refusal (or failure before calling the manager) is not an
    // uncertain mutation. check() will inspect the owner again before retrying.
    if (this.state.phase === 'failed') return { ...this.state, message: this.state.message === '正在核对上次更新结果。'
      ? '上次更新未完成，可检查更新后重试；原生审批或版本问题请在插件管理器处理。' : this.state.message }
    try {
      const { own } = await this.inventory()
      // A completed native transaction can be superseded by a later manual
      // upgrade/migration. Matching live and installed versions establish the
      // current state; an old receipt must not permanently veto future updates.
      // Never infer this for an interrupted or otherwise unconfirmed install.
      if (['complete', 'restart-required'].includes(this.state.phase)
          && own.version === this.options.runningVersion
          && own.version !== this.state.previousVersion
          && (own.name !== this.state.bundle || own.version !== this.state.targetVersion)) {
        this.state = { phase: 'idle', message: '' }
        return { ...this.state }
      }
      if (own.name !== this.state.bundle) return { ...this.state, phase: 'unknown', message: '安装归属已变化，请在原生插件管理器核对；未重复安装。' }
      if (this.state.nativeResult && this.state.nativeResult.bundle !== this.state.bundle) return { ...this.state, phase: 'unknown', message: '原生安装返回的归属不一致，请核对插件管理器；未重复安装。' }
      const target = this.state.targetVersion
      if (own.version === target) {
        this.state = this.options.runningVersion === target
          ? { ...this.state, phase: 'complete', message: '当前插件已更新并生效。' }
          : this.state.phase === 'restart-required'
            ? { ...this.state, message: this.restartMessage() }
            : { ...this.state, phase: 'unknown', message: '安装文件已变化，但原生更新结果未确认。请在插件管理器核对，未自动重试。' }
      } else if (['preparing', 'installing', 'restart-required', 'complete'].includes(this.state.phase)) {
        this.state = { ...this.state, phase: 'unknown', message: '安装版本尚未确认或已变化，请先在原生插件管理器核对；未重复安装。' }
      }
    } catch { return { ...this.state, phase: 'unknown', message: '暂时无法确认安装结果，请恢复连接后重新检查；不要重复安装。' } }
    return { ...this.state }
  }
  check = (): Promise<unknown> => {
    if (this.checking) return this.checking
    this.checking = (async () => {
      await this.status()
      const result = await this.options.release()
      // A read-only native observation can finish while the release catalog is
      // loading. Use that result now, not a stale "installing" snapshot.
      const status = await this.status()
      let reason = '', canInstall = false
      this.plan = undefined
      try {
        if (this.disposed) throw Error('连接已关闭，请重新打开设置')
        if (this.operation) throw Error('正在处理插件更新，请等待完成')
        if (['preparing', 'installing', 'restart-required'].includes(status.phase)) throw Error(status.message)
        const { manager, own } = await this.inventory()
        if (own.version !== this.options.runningVersion) throw Error('安装版本和运行版本不同，请先正常重启当前 DSH')
        const release = result.release
        if (status.phase === 'unknown') {
          // Losing an old receipt must not permanently disable FUTURE releases.
          // This does not declare the old job successful or retry its target.
          // Require an explicit absent reply from this exact native provider,
          // a healthy current owner and a distinct release newer than both.
          const observed = this.observation
          if (!release || status.nativeResult || !status.jobId || !status.targetVersion || own.name !== status.bundle
              || observed?.jobId !== status.jobId || observed.manager !== managerIdentity(manager) || observed.outcome !== 'absent'
              || compareVersions(release.version, status.targetVersion) <= 0
              || compareVersions(release.version, own.version!) <= 0) throw Error(status.message)
        }
        if (release && result.advice.component === 'plugin' && result.advice.targetVersion === release.version) {
          if (compareVersions(release.version, own.version!) <= 0) throw Error('不会重复安装或降级当前插件')
          if (own.name === bundleName
            ? !trustedNpmInstaller(release.npmInstaller) || release.npmInstaller!.version !== release.version
            : !trustedReleaseAsset(release.asset, release.version)) throw Error('目标版本尚未提供适合当前安装的可验证更新包')
          if (this.isRefused(manager, own, release)) throw Error(inPlaceUpdateUnsupported)
          this.plan = { ticket: randomBytes(24).toString('hex'), expires: Date.now() + 120000, release: structuredClone(release), revision: result.advice.revision, bundle: own.name as Owner }
          canInstall = true
        }
      } catch (error) { reason = error instanceof Error ? error.message : '当前无法自动更新' }
      return { advice: result.advice, channel: result.channel, canInstall, reason, ticket: this.plan?.ticket || '', status }
    })().finally(() => { this.checking = undefined })
    return this.checking
  }
  start = (ticket: string): NativeUpdateStatus => {
    if (this.disposed || this.operation) throw Error('连接或更新状态已变化，请稍后重新检查')
    const plan = this.plan
    if (!plan || !/^[a-f0-9]{48}$/.test(ticket) || ticket !== plan.ticket || plan.expires <= Date.now()) throw Error('更新确认已过期，请重新检查更新')
    this.plan = undefined
    const state: NativeUpdateStatus = { phase: 'preparing', jobId: randomBytes(16).toString('hex'), targetVersion: plan.release.version,
      previousVersion: this.options.runningVersion, bundle: plan.bundle, message: '正在准备更新；安装由当前 DSH 的原生插件管理器处理。' }
    this.save(state)
    this.operation = this.run(plan, state).finally(() => { this.operation = undefined })
    return { ...state }
  }
  private async idle() {
    this.lifetime.signal.throwIfAborted()
    const sessions = this.options.sessions()
    if (typeof sessions?.list !== 'function') throw Error('无法确认当前任务状态，未更新插件')
    const list = await sessions.list({}, AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]))
    if (!Array.isArray(list?.items) || list.items.some(row => typeof row.running !== 'boolean')) throw Error('无法确认当前任务状态，未更新插件')
    if (list.items.some(row => row.running)) throw Error('当前 DSH 仍有任务在运行，请任务结束后重新检查更新')
  }
  private restartMessage() { return '插件已安装，请在任务结束后正常重启当前 DSH 后生效。不会自动结束任务。' }
  private async installSpec(plan: NonNullable<NativeUpdateService['plan']>): Promise<string> {
    // Use one immutable native archive path for both host generations. Alpha3
    // documents tarball replacement, while known registry names are refused.
    // Never rename the bundle or retry a refusal using a randomized file name.
    const outer = plan.bundle === bundleName
    const audit = (bytes: Buffer) => outer ? auditNativeRelease(bytes, plan.release) : auditArchive(bytes, plan.release)
    // pnpm stores this file: reference in its manifest/lockfile: retain the
    // immutable archive for future package operations, not in an OS temp dir.
    const key = `${outer ? 'bundle' : 'core'}-${plan.release.version}-${(outer ? plan.release.npmInstaller : plan.release.asset)!.sha256}`
    const legacy = path.join(this.directory, `${key}.tgz`)
    try {
      // Older lockfiles may already refer to this flat path. Keep and reuse it;
      // never move it or overwrite an unreadable/invalid existing archive.
      audit(await fs.promises.readFile(legacy))
      this.lifetime.signal.throwIfAborted()
      return legacy
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const target = path.join(this.directory, key), file = path.join(target, 'release.tgz')
    const existing = async (): Promise<string | undefined> => {
      try { audit(await fs.promises.readFile(file)); return file }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        try { await fs.promises.lstat(target) }
        catch (missing) { if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return; throw missing }
        throw Error('已有更新包目录不完整，未覆盖该目录或替换插件。')
      }
    }
    const cached = await existing()
    this.lifetime.signal.throwIfAborted()
    if (cached) return cached
    const archive = await (outer ? downloadNativeRelease : downloadRelease)(plan.release, fetch, { signal: this.lifetime.signal })
    // Publish a complete nonempty directory, not a partially written file.
    // Directory rename cannot replace another complete nonempty publication;
    // unlike hard links it does not require a hardlink-capable filesystem.
    const temporary = await fs.promises.mkdtemp(path.join(this.directory, '.stage-'))
    const staged = path.join(temporary, 'release.tgz')
    try {
      await fs.promises.writeFile(staged, archive, { flag: 'wx', mode: 0o600 })
      audit(await fs.promises.readFile(staged))
      this.lifetime.signal.throwIfAborted()
      const appeared = await existing()
      if (appeared) return appeared
      try { await fs.promises.rename(temporary, target) }
      catch (error) {
        // Collision error codes differ across filesystems. Only a complete,
        // verified winner is reusable; any other failure stays a failure.
        const winner = await existing()
        if (winner) return winner
        throw error
      }
    } finally {
      // Only our own staging file/directory. Never remove the published path
      // or recursively delete anything retained by DSH's file: dependency.
      await fs.promises.rm(staged, { force: true }).catch(() => {})
      await fs.promises.rmdir(temporary).catch(() => {})
    }
    return file
  }
  private async run(plan: NonNullable<NativeUpdateService['plan']>, state: NativeUpdateStatus) {
    let admitted = false
    try {
      const result = await this.options.release()
      if (result.advice.revision !== plan.revision || result.advice.targetVersion !== plan.release.version
          || JSON.stringify(result.release) !== JSON.stringify(plan.release)) throw Error('更新清单已变化，请重新检查确认')
      const before = await this.inventory()
      if (before.own.name !== plan.bundle || before.own.version !== state.previousVersion) throw Error('安装归属或版本已变化，未覆盖或降级')
      const spec = await this.installSpec(plan)
      // One live task check after preparation; there is no install fence and
      // no status lookup in ordinary message/connection paths.
      await this.idle()
      const current = await this.inventory()
      this.lifetime.signal.throwIfAborted()
      // Cordis creates a fresh traceable proxy on each get(). Compare public
      // original identities, retaining the real provider-replacement fence.
      const liveManager = this.options.manager()
      if (!liveManager || managerIdentity(liveManager) !== managerIdentity(current.manager) || managerIdentity(current.manager) !== managerIdentity(before.manager)
          || current.own.name !== plan.bundle || current.own.version !== state.previousVersion) throw Error('安装状态已变化，未执行旧更新请求')
      if (this.isRefused(current.manager, current.own, plan.release)) throw Error(inPlaceUpdateUnsupported)
      this.save({ ...state, phase: 'installing', message: '原生插件管理器正在安装更新。网络较慢时请耐心等待，暂勿退出 DSH 或重复安装。' }, true)
      if (this.readJournal().jobId !== state.jobId) throw Error('已有其他更新请求，未执行旧请求')
      admitted = true
      // Same public entry as native install UI, same installed bundle identity.
      // Never override approvals, wrap native installation in a short plugin
      // timeout, automatically retry, force restart or switch bundle identity.
      const outcome = await current.manager.installBundle(spec, { enabled: true, requestId: state.jobId! })
      if (outcome.error?.code === 'already-installed' && outcome.changed !== true) {
          this.refusedUpdate = { manager: managerIdentity(current.manager), bundle: plan.bundle,
            installedVersion: state.previousVersion!, target: this.updateTarget(plan.bundle, plan.release) }
      }
      // The old gate may already be disposed. Save the native final result with
      // the captured job, without accessing services through its dead context.
      // A changed:true failure is NOT native rollback. Do not automatically make
      // a second install: DSH exposes no atomic target-update + old-version undo.
      this.settle(state, outcome)
    } catch (error) {
      const failed: NativeUpdateStatus = { ...state, phase: admitted ? 'unknown' : 'failed',
        message: admitted ? '原生更新结果暂未确认，请在插件管理器核对；未重复安装。' : error instanceof Error ? error.message : '更新未完成，请稍后重试' }
      try { this.save(failed, true) } catch { this.state = { ...failed, phase: 'unknown', message: '更新结果无法保存，请在原生插件管理器核对；未重复安装。' } }
    }
  }
  dispose() { this.disposed = true; this.plan = undefined; this.refusedUpdate = undefined; this.lifetime.abort() }
}
