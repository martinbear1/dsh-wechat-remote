/** Same-user installation coordination, not a shared runtime node. Each host
 * applies an offer through its OWN native installation owner. No remote API,
 * phone authorization, profile copying, implicit installation or forced exit. */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { compareVersions } from './update-policy.js'
import { writePrivateJsonAtomic } from './secure-file.js'
import { agentDshHome, agentProfileScope } from './agent-metadata.js'
import { checkedNativeSource as checkedSource, packNativeArchive } from './install-archive.js'
import { LEGACY_UPDATE_MANUAL_MESSAGE, legacyUpdateError } from './install-capabilities.js'

type Scope = 'web' | 'desktop'
const core = '@harness-remote/dsh-wechat-remote', native = 'dsh-wechat-remote'
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/
type Target = { owner: 'cli' | 'native'; version: string }
interface Offer { schema: 2; id: string; from: Scope; to: Scope; version: string; previous: string; source: string }
export type CompanionResult = { state: 'idle' | 'confirmation-required' | 'deferred' | 'pending' | 'busy' | 'preparing' | 'installing' | 'verifying' | 'recovering' | 'restart-required' | 'self-restart-required' | 'complete' | 'unavailable'; message: string; offerId?: string;
  target?: { scope: Scope; fromVersion: string; version: string };
  versions?: { current: Scope; running: string; installed: string | null; peer: Scope; peerInstalled: string | null } }
interface Coordinator { status(): CompanionResult; decide(id: string, action: 'approve' | 'later'): void; dispose(): void }
const manualWeb = (): CompanionResult => ({ state: 'unavailable', message: LEGACY_UPDATE_MANUAL_MESSAGE })
const pending = (): CompanionResult => ({ state: 'pending', message: '另一端将在其原生更新入口可用时处理；当前节点不受影响。' })
function scopeOf(value: string): Scope | undefined {
  return value === 'desktop' ? 'desktop' : value === 'web' || value === 'default' ? 'web' : undefined
}
function read(file: string): any { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function root(home: string): string { return path.join(home, 'harness-remote', 'installation-offers') }
// Presentation metadata only: decisions still authorize the exact immutable
// offer ID. Both endpoints can display an offer, so never infer its destination
// from the endpoint currently rendering the settings page.
function offerTarget(offer: Offer): NonNullable<CompanionResult['target']> {
  return { scope: offer.to, fromVersion: offer.previous, version: offer.version }
}
function recordResult(home: string, scope: Scope, offer: Offer, value: CompanionResult): boolean {
  const directory = root(home), file = path.join(directory, `result-${scope}.json`)
  try { if (read(path.join(directory, `${scope}.json`)).id !== offer.id) return false }
  catch { return false }
  try {
    const last = read(file)
    if (last.id === offer.id && last.state === 'complete'
        && !['complete', 'recovering', 'unavailable'].includes(value.state)) return false
  } catch { /* first receipt */ }
  writePrivateJsonAtomic(file, { schema: 2, id: offer.id, version: offer.version, ...value, target: offerTarget(offer) })
  return true
}
/** Only already enabled installations participate. Do not re-enable a plugin,
 * create another profile, downgrade, or guess which mixed owner to replace. */
export function companionTarget(home: string, scope: Scope): Target | undefined {
  const profile = path.join(home, 'profiles', scope)
  let manifest: any
  try { manifest = read(path.join(profile, 'package.json')) } catch { return }
  const dependencies = manifest.dependencies || {}, enabled = manifest.dsh?.profile?.bundles
  if (!Array.isArray(enabled)) return
  const owners = [core, native].filter(name => Object.hasOwn(dependencies, name))
  if (owners.length !== 1 || !enabled.includes(owners[0])) return
  const owner = owners[0]
  if (scope === 'desktop' && owner !== native) return
  try {
    const installed = read(path.join(profile, 'node_modules', owner, 'package.json'))
    if (installed.name !== owner || !versionPattern.test(installed.version)) return
    return { owner: owner === core ? 'cli' : 'native', version: installed.version }
  } catch { return }
}
/** Called after an explicit CLI install or first activation of a native bundle.
 * Capture the existing peer version: a later manual rollback invalidates this
 * offer instead of becoming an unwanted automatic re-upgrade. */
export function offerCompanionUpdate(home: string, from: Scope, source: string, version: string): Offer | undefined {
  const to = from === 'web' ? 'desktop' : 'web', peer = companionTarget(home, to)
  // Old receivers can execute schema-2 offers. Do not publish a CLI Web offer
  // at all; the current UI derives a manual notice from read-only peer versions.
  if (!peer || peer.owner === 'cli' || compareVersions(version, peer.version) <= 0) return
  if (source) source = checkedSource(source, version)
  else if (from !== 'web' || !versionPattern.test(version)) throw new Error('只有 Web 可通知原生 Desktop 获取同版本 npm 包')
  const directory = root(home), file = path.join(directory, `${to}.json`)
  try {
    const existing = read(file)
    if (existing.schema === 2 && existing.from === from && existing.version === version && existing.previous === peer.version) {
      // The core may start before the CLI finishes and offer an npm-only source.
      // Let the completed installer supply its validated local archive, but
      // never change an approved/in-flight transaction's immutable source.
      // A replacement gets a new ID below: old UI decisions cannot approve it.
      if (!source || existing.source || decision(home, existing) === 'approve') return existing
    }
    if (versionPattern.test(existing.version) && compareVersions(existing.version, version) > 0) return
  } catch { /* first offer */ }
  // Older receivers reject schema 2: they must not act before the new UI's
  // explicit confirmation. Never publish a schema-1 automatic-update offer.
  const offer: Offer = { schema: 2, id: randomBytes(16).toString('hex'), from, to, source, version, previous: peer.version }
  writePrivateJsonAtomic(file, offer)
  return offer
}
export function validateCompanionOffer(home: string, scope: Scope, offer: Offer): Target {
  if (offer.schema !== 2 || !/^[a-f0-9]{32}$/.test(offer.id) || offer.to !== scope
      || offer.from !== (scope === 'web' ? 'desktop' : 'web') || !versionPattern.test(offer.version)
      || !versionPattern.test(offer.previous) || compareVersions(offer.version, offer.previous) <= 0) throw new Error('联动更新请求无效')
  const current = read(path.join(root(home), `${scope}.json`))
  if (['schema', 'id', 'from', 'to', 'version', 'previous', 'source'].some(key => current[key] !== (offer as any)[key])) {
    throw new Error('联动更新请求已变化，未执行旧请求')
  }
  const target = companionTarget(home, scope)
  if (!target || ![offer.previous, offer.version].includes(target.version)) throw new Error('另一端的安装、版本或启用状态已变化，未替换插件')
  if (offer.source) {
    if (target.version !== offer.version) checkedSource(offer.source, offer.version)
  } else if (scope !== 'desktop' || offer.from !== 'web') throw new Error('联动安装来源无效')
  return target
}
function decision(home: string, offer: Offer): string | undefined {
  try { const value = read(path.join(root(home), `decision-${offer.to}.json`)); return value.id === offer.id ? value.action : undefined } catch { return }
}
export function assertCompanionApproved(home: string, offer: Offer): void {
  if (validateCompanionOffer(home, offer.to, offer).owner === 'cli') throw legacyUpdateError()
  if (decision(home, offer) !== 'approve') throw new Error('尚未确认另一端更新，未执行安装')
}
export function decideCompanionOffer(home: string, offer: Offer, action: 'approve' | 'later'): void {
  if (validateCompanionOffer(home, offer.to, offer).owner === 'cli') throw legacyUpdateError()
  if (!['approve', 'later'].includes(action)) throw new Error('无效的更新选择')
  // Approval is tied to the exact immutable offer; a new version/source never
  // inherits it. Once admitted, "later" cannot cancel a transaction mid-write.
  if (decision(home, offer) === 'approve') return
  if (action === 'approve') recordResult(home, offer.to, offer, pending())
  writePrivateJsonAtomic(path.join(root(home), `decision-${offer.to}.json`), { id: offer.id, action })
}
function confirmation(home: string, offer: Offer): CompanionResult | undefined {
  if (companionTarget(home, offer.to)?.owner === 'cli') return manualWeb()
  const choice = decision(home, offer)
  if (choice === 'approve') return
  return { state: choice === 'later' ? 'deferred' : 'confirmation-required', offerId: offer.id, target: offerTarget(offer),
    message: `${offer.to === 'web' ? 'Web' : 'Desktop'} 插件可从 ${offer.previous} 更新至 ${offer.version}。确认后会等待任务空闲，更新时连接将短暂断开；保留原配对和会话。当前尚未更新。` }
}
/** Never hand a peer's live directory to pnpm: local folder installs can link
 * the two profiles. Install a verified, immutable tarball kept outside both
 * profiles, so updating/removing the source cannot break the recipient. */
export async function stageCompanionArchive(home: string, source: string, version: string): Promise<string> {
  return packNativeArchive(source, version, path.join(root(home), 'artifacts'))
}
/** Native manager errors (including build approval) remain refusals. No extra
 * scripts are approved, and downloaded is never reported as running. */
export async function applyNativeCompanion(home: string, scope: Scope, runningVersion: string, offer: Offer,
  services: { list(): Promise<{ items: { running: boolean }[] }>; install(spec: string): Promise<any>;
    stage?: typeof stageCompanionArchive; signal?: AbortSignal; progress?(value: CompanionResult): void }): Promise<CompanionResult> {
  services.signal?.throwIfAborted()
  const target = validateCompanionOffer(home, scope, offer)
  if (target.owner !== 'native') throw new Error('此节点应由 Web 安装器更新')
  if (runningVersion === offer.version) {
    if (target.version !== offer.version) throw new Error('磁盘安装已变化，未覆盖或重新升级')
    return { state: 'complete', message: '两端插件已对齐。' }
  }
  if (target.version === offer.version) return { state: 'restart-required', message: '另一端插件已安装，重启该应用后生效。' }
  if (runningVersion !== offer.previous) throw new Error('运行版本与安装版本不同，未执行联动更新')
  const notice = confirmation(home, offer)
  if (notice) return notice
  const list = await services.list()
  services.signal?.throwIfAborted()
  if (!Array.isArray(list?.items) || list.items.some(row => typeof row.running !== 'boolean')) throw new Error('无法确认另一端的会话状态')
  if (list.items.some(row => row.running)) return { state: 'busy', message: '另一端正在执行任务，任务结束后再处理更新。' }
  services.progress?.({ state: 'preparing', message: '正在准备另一端的插件更新；任务空闲并完成复核后才会安装。' })
  // The core-only Web updater has no outer installer directory. In that case
  // the Desktop owner resolves the exact public package using its ordinary
  // registry, compatibility checks and build-approval policy.
  const archive = offer.source
    ? await (services.stage ?? stageCompanionArchive)(home, offer.source, offer.version)
    : `${native}@${offer.version}`
  services.signal?.throwIfAborted()
  validateCompanionOffer(home, scope, offer)
  // Packing can take time. Do not update when a task started meanwhile.
  const current = await services.list()
  services.signal?.throwIfAborted()
  if (!Array.isArray(current?.items) || current.items.some(row => typeof row.running !== 'boolean')) throw new Error('无法确认另一端的会话状态')
  if (current.items.some(row => row.running)) return { state: 'busy', message: '另一端正在执行任务，任务结束后再处理更新。' }
  // Recheck after EVERY asynchronous preparation step, including the final
  // idle query. A new offer, manual install or disable wins over this attempt.
  const ready = validateCompanionOffer(home, scope, offer)
  if (ready.owner !== target.owner || ready.version !== offer.previous) throw new Error('另一端的安装已变化，未重复安装')
  services.progress?.({ state: 'installing', message: '正在通过原生插件管理器更新，请暂勿退出应用或重复安装。' })
  const result = await services.install(archive)
  if (!['applied', 'restart-required'].includes(result?.application) || result.error || result.bundle !== native) {
    throw new Error('原生插件管理器未完成更新，请在该应用的插件管理页查看原因或完成审批')
  }
  if (companionTarget(home, scope)?.version !== offer.version) throw new Error('原生安装后的版本校验未通过')
  return { state: 'restart-required', message: '另一端插件已安装，重启该应用后生效。' }
}
/** No service daemon and no polling scanner: one fiber-owned file watcher plus
 * native agent-idle events. Old peers without this receiver keep their native
 * manual entry; CLI Web never receives an executable update offer. */
export function mountCompanionUpdates(ctx: any, version: string, options: { isUpdating?(): boolean } = {}): Coordinator {
  try { return mount(ctx, version, options) } catch {
    // Coordination is optional. Its filesystem failure must not prevent
    // pairing, authentication or the host's ordinary plugin manager.
    return { status: () => ({ state: 'unavailable', message: '联动更新暂不可用，仍可分别使用原生更新入口。' }), decide() { throw new Error('联动更新不可用') }, dispose() {} }
  }
}
function mount(ctx: any, version: string, options: { isUpdating?(): boolean }): Coordinator {
  const home = agentDshHome(ctx), scope = scopeOf(agentProfileScope(ctx))
  let status: CompanionResult = { state: 'idle', message: '' }, stopped = false, busy = false, recheck = false
  const lifetime = new AbortController()
  if (!scope) return { status: () => status, decide() { throw new Error('当前安装不支持联动更新') }, dispose() {} }
  const directory = root(home), inbox = path.join(directory, `${scope}.json`)
  const ownChanged = () => { const own = companionTarget(home, scope); return own && own.version !== version }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const receipt = (offer: Offer, value: CompanionResult) => {
    if (stopped) return
    // An older asynchronous attempt must not overwrite the latest receipt,
    // nor undo a new runtime's proof of successful activation.
    try { if (recordResult(home, scope, offer, value)) status = { ...value, target: offerTarget(offer) } }
    catch { status = { state: 'unavailable', message: '联动更新结果无法保存，请在该节点的原生插件管理页核对。' } }
  }
  const check = async () => {
    if (stopped || ownChanged()) return
    if (options.isUpdating?.()) return
    if (busy) { recheck = true; return }
    if (!existsInbox()) return
    busy = true
    let offer: Offer | undefined
    try {
      offer = read(inbox)
      const target = validateCompanionOffer(home, scope, offer!)
      if (version === offer!.version) {
        if (target.version !== version) throw new Error('磁盘安装已变化')
        receipt(offer!, { state: 'complete', message: '两端插件已对齐。' }); return
      }
      const notice = confirmation(home, offer!)
      if (notice) { receipt(offer!, notice); return }
      try {
        const last = read(path.join(directory, `result-${scope}.json`))
        if (last.id === offer!.id && ['unavailable', 'complete'].includes(last.state)) { status = last; return }
        if (last.id === offer!.id && last.state === 'restart-required' && version !== offer!.version) { status = last; return }
      } catch { /* first attempt */ }
      if (target.owner === 'native') {
        const manager = ctx.get('pluginManager'), controller = ctx.get('sessionController')
        if (!manager?.installBundle || !controller?.list) { receipt(offer!, pending()); return }
        receipt(offer!, await applyNativeCompanion(home, scope, version, offer!, {
          signal: lifetime.signal,
          progress: value => receipt(offer!, value),
          list: () => controller.list({}, AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)])),
          install: spec => manager.installBundle(spec),
        }))
      } else receipt(offer!, manualWeb())
    } catch (error) {
      if (stopped) return
      status = { state: 'unavailable', message: '联动更新未完成；请在对应应用的插件管理页核对，当前节点不受影响。' }
      if (offer && /^[a-f0-9]{32}$/.test(offer.id)) receipt(offer, status)
    } finally {
      busy = false
      if (recheck && !stopped) { recheck = false; queueMicrotask(() => { void check() }) }
    }
  }
  function existsInbox() { return fs.existsSync(inbox) }
  const watcher = fs.watch(directory, (_event, filename) => {
    if ([`${scope}.json`, `decision-${scope}.json`].includes(String(filename))) void check()
  })
  watcher.on('error', () => { status = { state: 'unavailable', message: '联动更新通知不可用，仍可分别使用原生更新入口。' } })
  const cleanups: (() => void)[] = []
  try {
    // turn/end precedes driver drain/checkpoint. Only agent/status establishes
    // real idleness; coalesce events arriving during an outstanding check.
    const off = ctx.on?.('agent/status', (event: any) => { if (event?.status === 'idle') void check() })
    if (typeof off === 'function') cleanups.push(off)
    // Native services can become available after this plugin's initial mount.
    const dependency = ctx.inject?.(['pluginManager', 'sessionController'], () => { void check() })
    if (dependency?.dispose) cleanups.push(() => { void Promise.resolve(dependency.dispose()).catch(() => {}) })
  } catch (error) { stopped = true; lifetime.abort(); watcher.close(); cleanups.forEach(fn => fn()); throw error }
  const kickoff = setImmediate(() => {
    if (stopped || ownChanged()) return
    // Only the native wrapper carries the full installer. The ordinary Web
    // core never invents an npm source or broadcasts incomplete package bytes.
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
    try {
      let packageName: string | undefined
      try { packageName = read(path.join(source, 'package.json')).name } catch { /* core-only Web */ }
      const ownPackage = read(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json')).name
      if (packageName === native || (scope === 'web' && ownPackage === core)) {
        const seen = path.join(directory, `offered-${scope}.json`)
        let previous: any
        try { previous = read(seen) } catch {}
        if (previous?.version !== version) {
          const offer = offerCompanionUpdate(home, scope, packageName === native ? source : '', version)
          writePrivateJsonAtomic(seen, { version })
        }
      }
    } catch { /* core-only install has no wrapper; explicit installer publishes */ }
    void check()
  })
  const reportedStatus = (): CompanionResult => {
    // Report a peer outcome to the initiating host, without mistaking this
    // host's successful upgrade for completion on the peer.
    const to = scope === 'web' ? 'desktop' : 'web'
    try {
      const offer = read(path.join(directory, `${to}.json`))
      if (offer.from === scope && offer.version === version) {
        const peer = validateCompanionOffer(home, to, offer)
        if (peer.version !== version) {
          const notice = confirmation(home, offer)
          if (notice) return notice
        }
        const last = read(path.join(directory, `result-${to}.json`))
        if (last.schema === 2 && last.id === offer.id && ['pending', 'busy', 'preparing', 'installing', 'verifying', 'recovering', 'restart-required', 'complete', 'unavailable'].includes(last.state)) {
          if (['complete', 'restart-required'].includes(last.state) && peer.version !== version) {
            return { state: 'unavailable', message: '另一端的安装已变化，请在该应用内核对；当前节点不受影响。' }
          }
          return { state: last.state, target: offerTarget(offer), message: `${to === 'web' ? 'Web' : 'Desktop'}：${String(last.message).slice(0, 240)}` }
        }
      }
    } catch { /* no peer receipt */ }
    try {
      const offer = read(path.join(directory, `${to}.json`))
      if (offer.from === scope && offer.version === version) {
        try { validateCompanionOffer(home, to, offer) }
        catch { return { state: 'unavailable', message: '另一端的安装或启用状态已变化，未继续更新；当前节点不受影响。' } }
        return { ...pending(), target: offerTarget(offer) }
      }
    } catch {}
    return status
  }
  return { status: () => {
    const own = companionTarget(home, scope), to = scope === 'web' ? 'desktop' : 'web', peer = companionTarget(home, to)
    const versions = { current: scope, running: version, installed: own?.version ?? null, peer: to, peerInstalled: peer?.version ?? null } as const
    if (own && own.version !== version) return { state: 'self-restart-required', versions,
      message: `当前 ${scope === 'desktop' ? 'Desktop' : 'Web'} 已安装 ${own.version}，仍在运行 ${version}。请在任务结束后重启当前应用；另一端尚未因此更新。` }
    if (peer?.owner === 'cli' && compareVersions(version, peer.version) > 0) {
      return { ...manualWeb(), versions, target: { scope: to, fromVersion: peer.version, version } }
    }
    const result = reportedStatus()
    if (result.state === 'complete' && (!own || !peer || own.version !== peer.version || own.version !== version)) {
      return { state: 'unavailable', versions, message: '两端版本或启用状态已变化，旧的完成记录不再代表当前已对齐。请分别核对，不会自动覆盖任何一端。' }
    }
    return { ...result, versions }
  }, decide(id, action) {
    if (stopped) throw new Error('连接服务已停止')
    if (ownChanged()) throw new Error('当前安装版本尚未生效，请重启当前应用后再确认')
    const to = scope === 'web' ? 'desktop' : 'web'
    const offers = [to, scope].flatMap(key => { try { return [read(path.join(directory, `${key}.json`))] } catch { return [] } })
    const offer = offers.find(item => item.id === id)
    if (!offer) throw new Error('更新通知已过期，请刷新后重试')
    decideCompanionOffer(home, offer, action)
    void check()
  }, dispose() { stopped = true; lifetime.abort(); clearImmediate(kickoff); watcher.close(); cleanups.forEach(fn => fn()) } }
}
