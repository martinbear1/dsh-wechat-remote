/** Detached, dependency-free transaction worker. This module is inert on import. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, createPublicKey, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writePrivateJsonAtomic } from './secure-file.js'
import { installProfile, backupProfile, NativeInstallError } from './install-profile.js'
import { INSTALL_PNPM_VERSION, pinInstallRuntime } from './install-runtime.js'
import { validateManager, startManagedHost, stopManagedHost, finishUpdateWorker, type HostManager } from './install-lifecycle.js'

export interface UpdateJob {
  id: string; directory: string; profile: string; home: string; stateFile: string
  cli: string; argv: string[]; execArgv: string[]; executable: string; cwd: string
  pnpm: string; parentPid: number; webPort: number; gatePort: number; localPort: number
  targetVersion: string; previousVersion: string; dshVersion: string
  statusToken: string
  controlOrigin?: string; manager?: HostManager
  identityFile?: string
}
export interface UpdateProgress { phase: string; progress: number; message: string; terminal: boolean; ok?: boolean; rollback?: boolean }
export function releaseOwnedUpdateLock(lock: string, id: string): void {
  try { if (fs.readFileSync(lock, 'utf8') === id) fs.unlinkSync(lock) } catch { /* never remove another job's lock */ }
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const hashFile = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex')
function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}
function safePlainDirectory(p: string): void {
  if (!fs.statSync(p).isDirectory() || fs.lstatSync(p).isSymbolicLink() || fs.realpathSync(p) !== path.resolve(p)) throw new Error('安装目录不是可安全替换的独立目录')
}
export function validateJob(job: UpdateJob): void {
  if (!/^[a-f0-9]{32}$/.test(job.id) || path.basename(job.directory) !== job.id
      || !within(path.join(job.home, 'harness-remote-updates'), job.directory)
      || !within(path.join(job.home, 'profiles'), job.profile)
      || path.dirname(job.profile) !== path.join(job.home, 'profiles')
      || !within(job.home, job.stateFile) || !Number.isInteger(job.parentPid) || job.parentPid < 1
      || ![job.webPort, job.gatePort, job.localPort].every(p => Number.isInteger(p) && p > 0 && p <= 65535)
      || job.argv[0] !== job.cli || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error('更新任务范围校验失败')
  safePlainDirectory(job.profile); safePlainDirectory(job.directory)
  if (job.identityFile && !within(job.home, job.identityFile)) throw new Error('节点身份文件不属于当前 DSH')
  if (job.controlOrigin) {
    const u = new URL(job.controlOrigin)
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('安装控制地址无效')
    validateManager(job.manager!)
  }
  for (const f of [job.executable, job.cli, job.pnpm, ...(job.previousVersion === '0.0.0' ? [] : [job.stateFile])]) if (!fs.statSync(f).isFile()) throw new Error('安装运行时已变化')
}
export async function control(job: UpdateJob, operation: string, input: unknown = {}): Promise<any> {
  let res: Response | undefined
  for (let attempt = 0; attempt < (operation === 'describe' ? 3 : 1); attempt++) {
    try {
      res = await fetch(job.controlOrigin + '/' + operation, { method: 'POST', headers: {
        authorization: `Bearer ${job.statusToken}`, 'content-type': 'application/json', connection: 'close',
      }, body: JSON.stringify(input), signal: AbortSignal.timeout(operation === 'quiesce' ? 20000 : 12000), redirect: 'error' })
      break
    } catch (error) {
      if (operation !== 'describe' || attempt === 2) throw new Error(`安装控制 ${operation} 未完成`, { cause: error })
      await wait(150)
    }
  }
  if (!res) throw new Error('安装控制通道未响应')
  const value = await res.json() as any
  if (!res.ok) throw new Error(value.error || '无法确认当前主机状态')
  return value
}
async function beforeRpc(job: UpdateJob, method: string, payload = {}): Promise<any> {
  return job.controlOrigin ? control(job, 'read', { method, payload }) : rpc(job, method, payload)
}
async function rpc(job: UpdateJob, method: string, payload = {}, deadline?: AbortSignal): Promise<any> {
  const state = JSON.parse(fs.readFileSync(job.stateFile, 'utf8'))
  const res = await fetch(`http://127.0.0.1:${job.gatePort}/api/${method}`, {
    method: 'POST', headers: { authorization: `Bearer ${state.token}`, 'content-type': 'application/json', 'x-harness-update-probe': job.statusToken },
    body: JSON.stringify({ type: 'client-request', rpcId: 'plugin-update-check', method, payload }),
    signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000), redirect: 'error',
  })
  const body = await res.json() as any
  if (!res.ok || !body.result?.ok) throw new Error('主机会话服务未就绪')
  return body.result.value
}
function durableSnapshot(job: UpdateJob): Record<string, string> {
  const result: Record<string, string> = {}
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name)
      if (e.isSymbolicLink()) result[path.relative(job.home, file)] = createHash('sha256').update(fs.readlinkSync(file)).digest('hex')
      else if (e.isDirectory()) walk(file)
      else if (e.isFile()) result[path.relative(job.home, file)] = hashFile(file)
    }
  }
  walk(path.join(job.home, 'sessions')); walk(path.join(job.home, 'attachments')); walk(path.join(job.home, 'harness-remote'))
  for (const e of fs.readdirSync(job.home, { withFileTypes: true })) {
    if (e.isFile() && /(?:identity|settings|credentials|public|gate-wechat)/i.test(e.name) && !e.name.endsWith('.log')) {
      // Pairing pending tickets may legitimately expire. Protect identity,
      // bindings and LAN token, not transient pending QR state.
      const f = path.join(job.home, e.name)
      if (f === job.stateFile) continue
      result[e.name] = hashFile(f)
    }
  }
  if (fs.existsSync(job.stateFile)) {
    const state = JSON.parse(fs.readFileSync(job.stateFile, 'utf8'))
    result['$binding'] = createHash('sha256').update(JSON.stringify([state.token, state.wechatBindings])).digest('hex')
  }
  return result
}
function assertPreserved(before: Record<string, string>, after: Record<string, string>): void {
  for (const [key, hash] of Object.entries(before)) if (after[key] !== hash) throw new Error('升级后数据校验不一致；停止自动操作并保留备份')
}
/** Legacy grants acquire an owner only inside this verified, backed-up upgrade.
 * A later actual identity replacement still invalidates the old grants normally.
 */
export function migrateLegacyGrantOwner(job: UpdateJob): void {
  if (job.previousVersion !== '1.5.5' || !job.identityFile || !fs.existsSync(job.identityFile)) return
  const state = JSON.parse(fs.readFileSync(job.stateFile, 'utf8'))
  if (state.publicIdentityNodeId) return
  const identity = JSON.parse(fs.readFileSync(job.identityFile, 'utf8'))
  const publicKey = createPublicKey(identity.privateKeyPem).export({ format: 'der', type: 'spki' })
  const savedKey = createPublicKey(identity.publicKeyPem).export({ format: 'der', type: 'spki' })
  const nodeId = createHash('sha256').update(publicKey).digest().subarray(0, 18).toString('base64url')
  if (!publicKey.equals(savedKey) || identity.nodeId !== nodeId) throw new Error('旧节点身份校验未通过，未迁移配对')
  writePrivateJsonAtomic(job.stateFile, { ...state, publicIdentityNodeId: nodeId })
}
async function describe(job: UpdateJob, deadline?: AbortSignal): Promise<any> {
  const value = await rpc(job, 'wechatHost/describe', { args: { request: {} } }, deadline)
  if (!value?.ok || value.value.agentVersion !== job.dshVersion) throw new Error('DSH 版本或描述服务不匹配')
  return value.value
}
// Cold native startup on small ARM hosts can legitimately exceed one minute.
// This is a maximum, not a sleep: healthy hosts finish immediately on readiness.
export async function healthy(job: UpdateJob, version: string, timeoutMs = 180000): Promise<void> {
  // A retry count alone is not a time bound: an unresponsive HTTP peer can
  // consume the full per-request timeout on every attempt.
  const deadline = AbortSignal.timeout(timeoutMs)
  while (!deadline.aborted) {
    try {
      if ((await describe(job, deadline)).pluginVersion === version) {
        const list = await rpc(job, 'session.list', {}, deadline)
        if (Array.isArray(list.items)) return
      }
    } catch { /* bounded readiness retry after restarting this instance */ }
    if (!deadline.aborted) await wait(Math.min(500, timeoutMs))
  }
  throw new Error('重启健康检查未通过')
}
async function verifyFence(job: UpdateJob): Promise<void> {
  for (const port of [job.webPort, job.gatePort, job.localPort]) {
    const res = await fetch(`http://127.0.0.1:${port}/gate/status`, { signal: AbortSignal.timeout(5000), redirect: 'error' })
    await res.arrayBuffer()
    if (res.status !== 503) throw new Error('新插件未保持重启验证保护，不能确认安全更新')
  }
}
function start(job: UpdateJob): ChildProcess | undefined {
  if (job.manager && job.manager.kind !== 'process') { startManagedHost(job.manager); return }
  const log = fs.openSync(path.join(job.directory, 'restart.log'), 'a', 0o600)
  const child = spawn(job.executable, [...job.execArgv, ...job.argv], {
    cwd: job.cwd, env: { ...process.env, HARNESS_REMOTE_UPDATE_JOB: job.directory }, stdio: ['ignore', log, log], detached: true, windowsHide: true,
  })
  fs.closeSync(log)
  child.on('error', () => { /* readiness check reports failure, never expose env */ })
  child.unref()
  if (!child.pid) throw new Error('无法启动原 DSH 命令')
  writePrivateJsonAtomic(path.join(job.directory, 'restarted-process.json'), { pid: child.pid, cli: job.cli, home: job.home, webPort: job.webPort })
  return child
}
async function stopOriginal(job: UpdateJob): Promise<void> {
  if (!job.controlOrigin) {
    if (process.connected !== true || process.ppid !== job.parentPid) throw new Error('启动身份已变化，未停止 DSH')
    await stopChild(job.parentPid); return
  }
  const host = await control(job, 'describe')
  if (host.pid !== job.parentPid || host.cli !== job.cli || host.profile !== job.profile) throw new Error('当前 DSH 身份已变化')
  if (job.manager && job.manager.kind !== 'process') stopManagedHost(job.manager)
  else await control(job, 'shutdown')
  for (let i = 0; i < 150; i++) {
    try { process.kill(job.parentPid, 0) } catch { return }
    await wait(100)
  }
  throw new Error('原 DSH 尚未结束，未替换插件')
}
export async function stopRestarted(child: ChildProcess, timeoutMs = 30000, forceTimeoutMs = 5000): Promise<void> {
  // Retain the process handle and exit state. A failed launch may already have
  // exited during health polling; never kill a newly reused numeric PID.
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return
    await wait(Math.min(100, Math.max(1, deadline - Date.now())))
  }
  if (child.exitCode !== null || child.signalCode !== null) return
  // Only this transaction's freshly spawned candidate is eligible for a hard
  // stop, after graceful shutdown failed. Never use a discovered numeric PID or
  // escalate against the user's original host. Keep its retained process handle
  // so Node can recognize exit/PID reuse before signalling. A broken plugin can
  // hang native disposal; leaving that child alive prevents restoring the backup.
  child.kill('SIGKILL')
  const forcedDeadline = Date.now() + forceTimeoutMs
  while (Date.now() < forcedDeadline) {
    if (child.exitCode !== null || child.signalCode !== null) return
    await wait(Math.min(100, Math.max(1, forcedDeadline - Date.now())))
  }
  if (child.exitCode !== null || child.signalCode !== null) return
  throw new Error('更新后的 DSH 未按时停止')
}
interface OwnedNativeLock { filename: string; dev: number; ino: number; pid: number }
/** DSH atomic-write uses a sibling wx file containing its writer PID. Capture
 * proof BEFORE stopping our candidate, never infer ownership from lock age.
 * Linux may be interrupted between exclusive create and writing the PID: only
 * an open descriptor in this exact child proves ownership of that empty file.
 */
export function captureCandidateLock(home: string, child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode'>): OwnedNativeLock | undefined {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  const filename = path.join(home, '.credentials.yaml.lock')
  try {
    const info = fs.lstatSync(filename)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 32) return
    const value = fs.readFileSync(filename, 'utf8')
    let owned = value === `${child.pid}\n`
    if (!owned && value === '' && process.platform === 'linux') {
      const directory = `/proc/${child.pid}/fd`
      owned = fs.readdirSync(directory).some(fd => {
        try {
          const file = path.join(directory, fd)
          if (fs.readlinkSync(file) !== filename) return false
          const opened = fs.statSync(file)
          return opened.dev === info.dev && opened.ino === info.ino
        } catch { return false }
      })
    }
    if (owned) return { filename, dev: info.dev, ino: info.ino, pid: child.pid }
  } catch { /* No verifiable owned lock: do not touch any lock. */ }
}
export function retireCandidateLock(lock: OwnedNativeLock | undefined, child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode'>, directory: string): void {
  if (!lock || child.pid !== lock.pid || (child.exitCode === null && child.signalCode === null)) return
  try {
    const info = fs.lstatSync(lock.filename)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.dev !== lock.dev || info.ino !== lock.ino || info.size > 32) return
    const value = fs.readFileSync(lock.filename, 'utf8')
    if (value !== '' && value !== `${lock.pid}\n`) return
    // Keep the proven orphan for audit; never overwrite credentials or restore
    // an older credential file. An unknown/new writer's lock is left untouched.
    const saved = path.join(directory, 'candidate-credentials-lock.before-rollback')
    if (!fs.existsSync(saved)) fs.renameSync(lock.filename, saved)
  } catch { /* Native startup will report any remaining contention safely. */ }
}
async function stopChild(pid: number): Promise<void> {
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0) } catch { return }
    await wait(100)
  }
  throw new Error('DSH 未按时停止，不强制终止其他进程')
}

/** Actual cross-platform transaction; archive must have already passed audit. */
export async function executeUpdate(job: UpdateJob, progress: (p: UpdateProgress) => void,
  quiesce: () => Promise<void>): Promise<UpdateProgress> {
  validateJob(job)
  const previous = path.join(job.directory, 'profile-before')
  const emit = (phase: string, n: number, message: string) => progress({ phase, progress: n, message, terminal: false })
  let stopped = false, disposed = false, modified = false, newChild: ChildProcess | undefined
  let before: Record<string, string> = {}, sessionIds: string[] = [], readableIds: string[] = []
  try {
    emit('preparing', 25, '准备安装工具，当前节点仍可使用')
    const runtime = await pinInstallRuntime({ executable: job.executable, cli: job.pnpm, version: INSTALL_PNPM_VERSION }, job.directory)
    // The next host validates this job after the old package was replaced.
    // Its runtime reference must not point into that now-obsolete package.
    job.pnpm = runtime.cli
    writePrivateJsonAtomic(path.join(job.directory, 'job.json'), job)
    emit('checking', 50, '确认会话空闲并保存状态')
    const old = job.controlOrigin ? await control(job, 'describe') : await describe(job)
    if (old.pluginVersion !== job.previousVersion) throw new Error('当前插件在检查后发生变化')
    const list = (await beforeRpc(job, 'session.list')).items
    if (!Array.isArray(list) || list.some((s: any) => s.running !== false)) throw new Error('请等待全部会话结束后再更新')
    sessionIds = list.map((s: any) => s.sessionId).sort()
    // A history already unreadable before an update is not a new regression.
    for (const sessionId of sessionIds) {
      try { await beforeRpc(job, 'session.history', { sessionId, maxMessages: 1 }); readableIds.push(sessionId) } catch { /* baseline unavailable */ }
    }
    await quiesce() // Parent installs a maintenance fence, checks and flushes native sessions.
    disposed = Boolean(job.controlOrigin)
    before = durableSnapshot(job)
    writePrivateJsonAtomic(path.join(job.directory, 'before-hashes.json'), before)
    emit('installing', 60, '正在安装插件，当前 DSH 连接会暂时断开')
    // Only our still-attached IPC parent is stopped; do not resolve an arbitrary
    // listener and kill it. PID reuse is excluded while that parent is alive.
    await stopOriginal(job); stopped = true
    assertPreserved(before, durableSnapshot(job))
    // Only the profile is changed by native plugin add. Keep a rollback copy
    // with verbatim links; sessions, credentials and pairing stay in place.
    backupProfile(job.profile, previous)
    migrateLegacyGrantOwner(job)
    safePlainDirectory(job.profile)
    modified = true
    await installProfile({ profile: job.profile, directory: job.directory, cli: job.cli, targetVersion: job.targetVersion, runtime })
    emit('restarting', 75, '安装完成，正在恢复当前 DSH')
    newChild = start(job)
    emit('verifying', 85, '检查插件版本、节点身份和会话')
    await healthy(job, job.targetVersion)
    await verifyFence(job)
    assertPreserved(before, durableSnapshot(job))
    const after = (await rpc(job, 'session.list')).items.map((s: any) => s.sessionId).sort()
    if (JSON.stringify(after) !== JSON.stringify(sessionIds)) throw new Error('重启后会话列表不一致')
    for (const id of readableIds) await rpc(job, 'session.history', { sessionId: id, maxMessages: 1 })
    writePrivateJsonAtomic(path.join(job.directory, 'verification-complete.json'), { id: job.id })
    return { phase: 'complete', progress: 100, message: '插件更新完成，DSH 已恢复；原节点无需重新配对。', terminal: true, ok: true }
  } catch (error) {
    let rollback = false
    writePrivateJsonAtomic(path.join(job.directory, 'failure.json'), { message: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined, cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined })
    // Never restore files underneath a package manager that may still write.
    if (error instanceof NativeInstallError && error.mayStillBeRunning) return {
      phase: 'attention', progress: 100, message: error.message, terminal: true, ok: false, rollback: false,
    }
    if (job.controlOrigin && !disposed) {
      try { disposed = (await control(job, 'describe')).quiesced === true } catch {}
    }
    if (stopped || disposed) {
      emit('rolling-back', 90, '更新未通过验证，正在恢复原插件')
      try {
        if (!stopped) { await stopOriginal(job); stopped = true }
        if (newChild) {
          const ownedLock = captureCandidateLock(job.home, newChild)
          await stopRestarted(newChild)
          retireCandidateLock(ownedLock, newChild, job.directory)
        }
        else if (modified && job.manager && job.manager.kind !== 'process') stopManagedHost(job.manager)
        if (modified) {
          fs.renameSync(job.profile, path.join(job.directory, 'profile-failed'))
          fs.renameSync(previous, job.profile)
        }
        start(job); await healthy(job, job.previousVersion)
        assertPreserved(before, durableSnapshot(job)); rollback = true
        writePrivateJsonAtomic(path.join(job.directory, 'verification-complete.json'), { id: job.id })
      } catch (rollbackError) {
        // Keep the second failure as well; otherwise a slow stop is
        // indistinguishable from a failed profile restore or failed restart.
        try { writePrivateJsonAtomic(path.join(job.directory, 'rollback-failure.json'), {
          message: rollbackError instanceof Error ? rollbackError.message : 'unknown',
          stack: rollbackError instanceof Error ? rollbackError.stack : undefined,
        }) } catch { /* diagnostics must not hide the transaction outcome */ }
        return { phase: 'attention', progress: 100, message: '自动恢复未完成。备份已保留，请按主机更新记录恢复；不要删除节点或数据。', terminal: true, ok: false, rollback: false }
      }
    }
    return { phase: 'failed', progress: 100, message: (error instanceof Error ? error.message : '更新失败') + (rollback ? '；已恢复原插件。' : '；当前插件未替换。'), terminal: true, ok: false, rollback }
  }
}

async function workerMain(filename: string): Promise<void> {
  const job = JSON.parse(fs.readFileSync(filename, 'utf8')) as UpdateJob
  validateJob(job)
  if (!job.controlOrigin && (process.ppid !== job.parentPid || !process.connected)) throw new Error('Updater requires its initiating parent')
  let status: UpdateProgress = { phase: 'starting', progress: 20, message: '正在准备更新', terminal: false }
  const record = (value: UpdateProgress) => {
    status = value
    // The progress journal is not part of the profile transaction. A transient
    // Windows file-sharing failure must not abort rollback itself.
    try { writePrivateJsonAtomic(path.join(job.directory, 'result.json'), value) }
    catch (error) { console.error('Update progress journal unavailable:', (error as NodeJS.ErrnoException).code || 'write-failed') }
  }
  const server = http.createServer((req, res) => {
    const origin = String(req.headers.origin || '')
    const allowed = [`http://127.0.0.1:${job.webPort}`, `http://localhost:${job.webPort}`, `http://[::1]:${job.webPort}`].includes(origin)
    if (!allowed || req.headers.host !== `127.0.0.1:${(server.address() as any).port}`) { res.writeHead(403); res.end(); return }
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin')
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Headers', 'Authorization')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (req.method !== 'GET' || req.url !== '/status' || req.headers.authorization !== `Bearer ${job.statusToken}`) { res.writeHead(403); res.end(); return }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(status))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    if (job.controlOrigin) {
      writePrivateJsonAtomic(path.join(job.directory, 'worker-ready.json'), { id: job.id, origin: `http://127.0.0.1:${(server.address() as any).port}` })
      let authorized = false
      for (let i = 0; i < 150; i++) {
        try { authorized = JSON.parse(fs.readFileSync(path.join(job.directory, 'authorized.json'), 'utf8')).id === job.id } catch {}
        if (authorized) break
        await wait(100)
      }
      if (!authorized || (await control(job, 'describe')).pid !== job.parentPid) throw new Error('Updater start authorization expired')
    } else await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); process.off('message', message); process.off('disconnect', disconnected) }
      const message = (m: any) => { if (m.type === 'start' && m.id === job.id) { cleanup(); resolve() } }
      const disconnected = () => { cleanup(); reject(new Error('Initiating parent disconnected before authorization')) }
      const timer = setTimeout(() => { cleanup(); reject(new Error('Updater start authorization expired')) }, 15000)
      process.on('message', message); process.once('disconnect', disconnected)
      process.send?.({ type: 'ready', origin: `http://127.0.0.1:${(server.address() as any).port}` })
    })
  } catch (error) { server.close(); throw error }
  const quiesce = () => job.controlOrigin ? control(job, 'quiesce').then(() => {}) : new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { process.off('message', handler); reject(new Error('无法确认会话状态已保存')) }, 15000)
    const handler = (message: any) => {
      if (message.type !== 'quiesced') return
      clearTimeout(timeout); process.off('message', handler)
      message.ok ? resolve() : reject(new Error('有会话正在运行或无法确认持久化，请稍后重试'))
    }
    process.on('message', handler); process.send?.({ type: 'quiesce' })
  })
  try { record(await executeUpdate(job, record, quiesce)) }
  catch (error) {
    console.error('Update transaction ended unexpectedly:', (error as NodeJS.ErrnoException).code || (error as Error).name || 'unknown')
    record({ phase: 'attention', progress: 100, terminal: true, ok: false,
      message: '更新被异常中断，无法确认恢复结果。请保留主机更新目录并检查原插件备份，不要删除节点或重复安装。' })
  }
  const lock = path.join(job.profile, '.harness-remote-update.lock')
  releaseOwnedUpdateLock(lock, job.id)
  if (job.controlOrigin) { try { await control(job, 'close') } catch {} }
  if (process.connected) process.send?.({ type: 'finished' })
  // Keep progress available across DSH restart; no permanent extra service.
  const timer = setTimeout(() => {
    server.close(); if (process.connected) process.disconnect()
    finishUpdateWorker(job.manager, job.directory)
  }, 120000)
  timer.unref()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void workerMain(process.argv[2]).catch(() => { process.exitCode = 1; if (process.connected) process.disconnect() })
}
