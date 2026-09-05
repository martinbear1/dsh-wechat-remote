/** Detached, dependency-free transaction worker. This module is inert on import. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writePrivateJsonAtomic } from './secure-file.js'

const PLUGIN = '@harness-remote/dsh-wechat-remote'
export interface UpdateJob {
  id: string; directory: string; profile: string; home: string; stateFile: string
  cli: string; argv: string[]; execArgv: string[]; executable: string; cwd: string
  pnpm: string; parentPid: number; webPort: number; gatePort: number; localPort: number
  targetVersion: string; previousVersion: string; dshVersion: string
  statusToken: string
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
      || !job.argv.includes(job.cli) || !job.argv.includes('web') || !/^[\w.+-]{1,80}$/.test(job.targetVersion)) throw new Error('更新任务范围校验失败')
  safePlainDirectory(job.profile); safePlainDirectory(job.directory)
  for (const f of [job.executable, job.cli, job.pnpm, job.stateFile]) if (!fs.statSync(f).isFile()) throw new Error('安装运行时已变化')
}
function run(job: UpdateJob, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(job.directory, 'install.log'), 'a', 0o600)
    const child = spawn(job.executable, args, { cwd, env: { ...process.env, CI: 'true' }, stdio: ['ignore', log, log], windowsHide: true })
    fs.closeSync(log)
    const timer = setTimeout(() => { child.kill(); reject(new Error('暂存安装超时，原插件未替换')) }, 180000)
    child.once('error', () => { clearTimeout(timer); reject(new Error('无法启动本机包管理器')) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('暂存安装失败，原插件未替换；诊断日志保留在主机')) })
  })
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
      if (e.isSymbolicLink()) throw new Error('受保护的数据目录含链接，需手工更新')
      if (e.isDirectory()) walk(file)
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
  const state = JSON.parse(fs.readFileSync(job.stateFile, 'utf8'))
  result['$binding'] = createHash('sha256').update(JSON.stringify([state.token, state.wechatBindings])).digest('hex')
  return result
}
function assertPreserved(before: Record<string, string>, after: Record<string, string>): void {
  for (const [key, hash] of Object.entries(before)) if (after[key] !== hash) throw new Error('升级后数据校验不一致；停止自动操作并保留备份')
}
async function describe(job: UpdateJob, deadline?: AbortSignal): Promise<any> {
  const value = await rpc(job, 'wechatHost/describe', { args: { request: {} } }, deadline)
  if (!value?.ok || value.value.agentVersion !== job.dshVersion) throw new Error('DSH 版本或描述服务不匹配')
  return value.value
}
export async function healthy(job: UpdateJob, version: string, timeoutMs = 60000): Promise<void> {
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
function start(job: UpdateJob): ChildProcess {
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
async function stopRestarted(child: ChildProcess): Promise<void> {
  // Retain the process handle and exit state. A failed launch may already have
  // exited during health polling; never kill a newly reused numeric PID.
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return
    await wait(100)
  }
  throw new Error('更新后的 DSH 未按时停止')
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
  const staged = path.join(job.directory, 'profile-staged'), previous = path.join(job.directory, 'profile-before')
  const emit = (phase: string, n: number, message: string) => progress({ phase, progress: n, message, terminal: false })
  let stopped = false, swapped = false, newChild: ChildProcess | undefined
  let before: Record<string, string> = {}, sessionIds: string[] = []
  try {
    emit('staging', 25, '暂存更新与依赖，当前节点仍可使用')
    fs.cpSync(job.profile, staged, { recursive: true, filter: p => !['node_modules', '.harness-remote-update.lock'].includes(path.basename(p)), dereference: false })
    // Relative file/link/workspace dependencies would resolve differently in a
    // staged directory. Refuse them, excluding the one plugin being replaced.
    const manifest = JSON.parse(fs.readFileSync(path.join(staged, 'package.json'), 'utf8'))
    for (const [name, spec] of Object.entries(manifest.dependencies || {})) {
      if (name !== PLUGIN && !/^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(spec))) throw new Error('此 profile 含需手工处理的依赖来源')
    }
    for (const e of fs.readdirSync(staged, { withFileTypes: true })) if (e.isSymbolicLink()) throw new Error('此 profile 配置包含链接，需手工更新')
    const archive = path.join(staged, 'harness-remote-update.tgz')
    fs.copyFileSync(path.join(job.directory, 'release.tgz'), archive)
    manifest.dependencies = { ...manifest.dependencies, [PLUGIN]: 'file:harness-remote-update.tgz' }
    writePrivateJsonAtomic(path.join(staged, 'package.json'), manifest)
    await run(job, [job.pnpm, 'install', '--ignore-scripts', '--no-frozen-lockfile', '--prefer-offline',
      '--config.manage-package-manager-versions=false', '--reporter=append-only'], staged)
    const installed = path.join(staged, 'node_modules', PLUGIN)
    if (!within(staged, fs.realpathSync(installed))) throw new Error('暂存插件不在更新目录内')
    if (JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version !== job.targetVersion) throw new Error('安装后插件版本校验失败')
    for (const name of Object.keys(manifest.dependencies)) if (name !== PLUGIN) {
      const oldFile = path.join(job.profile, 'node_modules', name, 'package.json')
      const newFile = path.join(staged, 'node_modules', name, 'package.json')
      if (hashFile(oldFile) !== hashFile(newFile)) throw new Error('暂存安装试图改变其他插件，需手工更新')
    }
    emit('checking', 50, '确认会话空闲并保存状态')
    if ((await describe(job)).pluginVersion !== job.previousVersion) throw new Error('当前插件在检查后发生变化')
    const list = (await rpc(job, 'session.list')).items
    if (!Array.isArray(list) || list.some((s: any) => s.running !== false)) throw new Error('请等待全部会话结束后再更新')
    sessionIds = list.map((s: any) => s.sessionId).sort()
    await quiesce() // Parent installs a maintenance fence, checks and flushes native sessions.
    before = durableSnapshot(job)
    writePrivateJsonAtomic(path.join(job.directory, 'before-hashes.json'), before)
    emit('backup', 60, '备份配置与数据')
    const backup = path.join(job.directory, 'home-before')
    fs.mkdirSync(backup, { mode: 0o700 })
    // Copy named children; fs.cp correctly rejects copying a parent directly
    // into its own descendant even when a recursive filter excludes that path.
    for (const entry of fs.readdirSync(job.home, { withFileTypes: true })) {
      if (['harness-remote-updates', 'profiles'].includes(entry.name)) continue
      if (entry.isSymbolicLink()) throw new Error('数据目录包含外部链接，请手工备份后更新')
      fs.cpSync(path.join(job.home, entry.name), path.join(backup, entry.name), { recursive: true })
    }
    emit('restarting', 70, '正在重启当前 DSH，连接会暂时断开')
    // Only our still-attached IPC parent is stopped; do not resolve an arbitrary
    // listener and kill it. PID reuse is excluded while that parent is alive.
    if (process.connected !== true || process.ppid !== job.parentPid) throw new Error('启动身份已变化，未停止 DSH')
    await stopChild(job.parentPid); stopped = true
    assertPreserved(before, durableSnapshot(job))
    safePlainDirectory(job.profile)
    fs.renameSync(job.profile, previous)
    try { fs.renameSync(staged, job.profile); swapped = true } catch (error) { fs.renameSync(previous, job.profile); throw error }
    newChild = start(job)
    emit('verifying', 85, '检查插件版本、节点身份和会话')
    await healthy(job, job.targetVersion)
    await verifyFence(job)
    assertPreserved(before, durableSnapshot(job))
    const after = (await rpc(job, 'session.list')).items.map((s: any) => s.sessionId).sort()
    if (JSON.stringify(after) !== JSON.stringify(sessionIds)) throw new Error('重启后会话列表不一致')
    for (const id of sessionIds) await rpc(job, 'session.history', { sessionId: id, maxMessages: 1 })
    writePrivateJsonAtomic(path.join(job.directory, 'verification-complete.json'), { id: job.id })
    return { phase: 'complete', progress: 100, message: '插件更新完成，DSH 已恢复；原节点无需重新配对。', terminal: true, ok: true }
  } catch (error) {
    let rollback = false
    if (stopped) {
      emit('rolling-back', 90, '更新未通过验证，正在恢复原插件')
      try {
        if (newChild) await stopRestarted(newChild)
        if (swapped) {
          fs.renameSync(job.profile, path.join(job.directory, 'profile-failed'))
          fs.renameSync(previous, job.profile)
        }
        start(job); await healthy(job, job.previousVersion)
        assertPreserved(before, durableSnapshot(job)); rollback = true
        writePrivateJsonAtomic(path.join(job.directory, 'verification-complete.json'), { id: job.id })
      } catch { return { phase: 'attention', progress: 100, message: '自动恢复未完成。备份已保留，请按主机更新记录恢复；不要删除节点或数据。', terminal: true, ok: false, rollback: false } }
    }
    return { phase: 'failed', progress: 100, message: (error instanceof Error ? error.message : '更新失败') + (rollback ? '；已恢复原插件。' : '；当前插件未替换。'), terminal: true, ok: false, rollback }
  }
}

async function workerMain(filename: string): Promise<void> {
  const job = JSON.parse(fs.readFileSync(filename, 'utf8')) as UpdateJob
  validateJob(job)
  if (process.ppid !== job.parentPid || !process.connected) throw new Error('Updater requires its initiating parent')
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
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); process.off('message', message); process.off('disconnect', disconnected) }
      const message = (m: any) => { if (m.type === 'start' && m.id === job.id) { cleanup(); resolve() } }
      const disconnected = () => { cleanup(); reject(new Error('Initiating parent disconnected before authorization')) }
      const timer = setTimeout(() => { cleanup(); reject(new Error('Updater start authorization expired')) }, 15000)
      process.on('message', message); process.once('disconnect', disconnected)
      process.send?.({ type: 'ready', origin: `http://127.0.0.1:${(server.address() as any).port}` })
    })
  } catch (error) { server.close(); throw error }
  const quiesce = () => new Promise<void>((resolve, reject) => {
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
  if (process.connected) process.send?.({ type: 'finished' })
  // Keep progress available across DSH restart; no permanent extra service.
  const timer = setTimeout(() => { server.close(); if (process.connected) process.disconnect() }, 120000)
  timer.unref()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void workerMain(process.argv[2]).catch(() => { process.exitCode = 1; if (process.connected) process.disconnect() })
}
