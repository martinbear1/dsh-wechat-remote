#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { attachControl, waitForJson, waitForInstallControl } from './native-control.mjs'
import { resolveInstallRuntime, verifyInstallRuntime } from '../lib/install-runtime.js'
import { validateCatalog, releaseMatches, compareVersions } from '../lib/update-policy.js'
import { boundedFetch, downloadRelease, auditArchive } from '../lib/update-download.js'
import { writePrivateJsonAtomic } from '../lib/secure-file.js'
import { control, validateJob, releaseOwnedUpdateLock } from '../lib/update-worker.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageName = '@harness-remote/dsh-wechat-remote'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export function findDsh() {
  const candidates = []
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(dir, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), path.join(dir, '../lib/node_modules/@deepseek-ai/dsh/lib/bin.js'))
    try { candidates.push(fs.realpathSync(path.join(dir, 'dsh'))) } catch {}
  }
  for (const candidate of candidates) {
    try {
      const cli = fs.realpathSync(candidate)
      const manifest = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json'), 'utf8'))
      if (manifest.name === '@deepseek-ai/dsh' && path.basename(cli) === 'bin.js') return cli
    } catch {}
  }
  throw new Error('未找到已安装的 DSH。请先安装并启动 DeepSeek Harness。')
}
function portBusy(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const end = busy => { socket.destroy(); resolve(busy) }
    socket.setTimeout(500, () => end(false)); socket.once('connect', () => end(true)); socket.once('error', () => end(false))
  })
}
async function selectRelease(host, assetsRoot = path.join(root, 'assets'), repair = false) {
  const current = { agentKind: 'dsh', agentVersion: host.dshVersion, pluginVersion: host.pluginVersion,
    platform: { win32: 'windows', darwin: 'macos', linux: 'linux' }[host.platform], arch: host.arch }
  const pinned = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'release.json'), 'utf8'))
  const catalog = validateCatalog(pinned.catalog)
  let releases = catalog.releases
  try {
    const remote = validateCatalog(JSON.parse((await boundedFetch('https://relay.xyxfood.xyz/v1/update-policy', 256 * 1024)).toString('utf8')))
    if (remote.issuedAt <= Date.now() + 300000 && remote.expiresAt > Date.now()) {
      releases = [...releases, ...remote.releases].filter(r => !remote.blocked.some(b => b.pluginVersion === r.version && (!b.dsh || b.dsh.includes(current.agentVersion)) && (!b.platforms || b.platforms.includes(current.platform))))
    }
  } catch { /* Authenticated npm package retains its explicitly tested release. */ }
  const release = releases.filter(r => r.channel === 'stable' && releaseMatches(r, current))
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  if (!release) throw new Error('当前 DSH 版本或系统尚无已验证的插件版本；没有修改现有安装。')
  if (host.pluginVersion !== '0.0.0' && (compareVersions(host.pluginVersion, release.version) > 0
    || (compareVersions(host.pluginVersion, release.version) === 0 && !repair))) return { release, archive: null }
  let archive
  if (release.version === pinned.version) archive = fs.readFileSync(path.join(assetsRoot, 'plugin.tgz'))
  else archive = await downloadRelease(release)
  auditArchive(archive, release)
  return { release, archive }
}
export async function install({ profileName = 'web', cli = findDsh(), assetsRoot, open = true, repair = false } = {}) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileName)) throw new Error('无效的 profile 名称。')
  const runtime = resolveInstallRuntime(root); await verifyInstallRuntime(runtime)
  const home = path.resolve(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))
  fs.mkdirSync(home, { recursive: true, mode: 0o700 })
  if (fs.realpathSync(home) !== home) throw new Error('DSH 数据目录是链接，暂不自动替换安装。')
  const profile = path.join(home, 'profiles', profileName), id = randomBytes(16).toString('hex')
  const directory = path.join(home, 'harness-remote-updates', id), token = randomBytes(24).toString('hex')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  let remove, ref, job, locked = false, authorized = false, launched
  const lockFile = path.join(profile, '.harness-remote-update.lock')
  console.log('正在检查 DSH 与插件…')
  try {
    // Initialize missing profiles through DSH itself, never synthesize a bundle list.
    if (!fs.existsSync(path.join(profile, 'package.json'))) {
      const log = fs.openSync(path.join(directory, 'startup.log'), 'a', 0o600)
      launched = spawn(process.execPath, [cli, '--profile', profileName, '--no-open'], {
        cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
      fs.closeSync(log); launched.on('error', () => {}); launched.unref()
      for (let i = 0; i < 100 && !fs.existsSync(path.join(profile, 'package.json')); i++) await sleep(100)
      if (!fs.existsSync(path.join(profile, 'package.json'))) throw new Error('DSH 未能初始化 profile；详情见本机安装记录。')
      await sleep(2000)
    }
    const fd = fs.openSync(lockFile, 'wx', 0o600); fs.writeFileSync(fd, id); fs.closeSync(fd); locked = true
    const helper = path.join(directory, 'install-control.js')
    fs.copyFileSync(path.join(root, 'lib/install-control.js'), helper)
    writePrivateJsonAtomic(path.join(directory, 'package.json'), { type: 'module' })
    remove = attachControl(profile, helper, { directory, token, pnpm: runtime.cli })
    const handshakeStarted = Date.now()
    try {
      ref = await waitForInstallControl(path.join(directory, 'control-ready.json'), {
        accept: v => Number.isInteger(v.pid) && v.pid > 0 && (!launched || v.pid === launched.pid),
        onWaiting: () => console.log('正在等待 DSH 完成安装准备，请勿重复执行命令…'),
        ensureRunning: async () => {
          if (launched || await portBusy(Number(process.env.DSH_PORT || 3080))) return
          const log = fs.openSync(path.join(directory, 'startup.log'), 'a', 0o600)
          launched = spawn(process.execPath, [cli, '--profile', profileName, '--no-open'], {
            cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
          fs.closeSync(log); launched.on('error', () => {}); launched.unref()
        },
      })
      writePrivateJsonAtomic(path.join(directory, 'handshake.json'), {
        state: 'ready', elapsedMs: Date.now() - handshakeStarted, startedHost: Boolean(launched),
      })
    } catch {
      writePrivateJsonAtomic(path.join(directory, 'handshake.json'), {
        state: 'timeout', elapsedMs: Date.now() - handshakeStarted, startedHost: Boolean(launched),
      })
      throw new Error('DSH 安装准备超时，原插件未替换。本机安装记录：' + path.join(directory, 'handshake.json'))
    }
    job = { controlOrigin: ref.origin, statusToken: token }
    const host = await control(job, 'describe')
    if (host.home !== home || host.profile !== profile || host.cli !== fs.realpathSync(cli) || (launched && host.pid !== launched.pid)) throw new Error('当前 DSH 身份与安装目标不一致，未修改安装。')
    remove(); remove = undefined
    await sleep(600)
    const selected = await selectRelease(host, assetsRoot, repair)
    if (!selected.archive) { console.log(`插件 ${host.pluginVersion} 无需更新。`); return { version: host.pluginVersion, changed: false } }
    console.log(`正在安装插件 ${selected.release.version}，保留原配对与会话…`)
    job = { ...host, id, directory, parentPid: host.pid, pnpm: runtime.cli, targetVersion: selected.release.version,
      previousVersion: host.pluginVersion, statusToken: token, controlOrigin: ref.origin }
    validateJob(job)
    fs.writeFileSync(path.join(directory, 'release.tgz'), selected.archive, { mode: 0o600, flag: 'wx' })
    fs.copyFileSync(path.join(root, 'lib/update-worker.js'), path.join(directory, 'update-worker.js'))
    writePrivateJsonAtomic(path.join(directory, 'job.json'), job)
    await control(job, 'launch')
    const ready = await waitForJson(path.join(directory, 'worker-ready.json'), v => v.id === id)
    const scope = createHash('sha256').update(profileName).digest('hex').slice(0, 24)
    writePrivateJsonAtomic(path.join(home, 'harness-remote-updates', `profile-${scope}.json`), { jobId: id, statusOrigin: ready.origin, statusToken: token })
    writePrivateJsonAtomic(path.join(directory, 'authorized.json'), { id }); authorized = true
    let previous = '', result
    const until = Date.now() + 600000
    while (Date.now() < until) {
      try { result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8')) } catch {}
      if (result?.phase !== previous && result?.phase) { console.log(`${result.progress}% ${result.message}`); previous = result.phase }
      if (result?.terminal) break
      await sleep(500)
    }
    if (!result?.terminal || !result.ok) throw new Error(result?.message || '安装结果待确认，请保留本机安装记录，不要重复安装。')
    if (open) {
      try {
        const origin = `http://127.0.0.1:${host.webPort}`
        const response = await fetch(`http://127.0.0.1:${host.localPort}/gate/update/resume?job=${id}`, { headers: { origin }, signal: AbortSignal.timeout(10000) })
        const value = await response.json(), url = new URL(value.url)
        if (!response.ok || url.origin !== origin || url.pathname !== '/' || url.hash || url.username || url.password) throw new Error('invalid resume')
        const command = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url.href]] : process.platform === 'darwin' ? ['/usr/bin/open', [url.href]] : ['xdg-open', [url.href]]
        const browser = spawn(command[0], command[1], { detached: true, windowsHide: true, stdio: 'ignore' }); browser.on('error', () => {}); browser.unref()
      } catch { console.log('插件已更新；请返回原 DSH WebUI 查看。') }
    }
    return { version: selected.release.version, changed: true }
  } finally {
    remove?.()
    if (ref && !authorized) { try { await control({ controlOrigin: ref.origin, statusToken: token }, 'close') } catch {} }
    if (locked && !authorized) releaseOwnedUpdateLock(lockFile, id)
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), repair = args.includes('--repair')
  if (repair) args.splice(args.indexOf('--repair'), 1)
  if (args.includes('--help') || args.includes('-h')) console.log('安装或升级 DSH 微信连接插件：npx -y dsh-wechat-remote@latest\n可选：--profile <名称>（默认 web）；--repair（重新安装当前兼容版本，不降级）')
  else if (args.length && !(args.length === 2 && args[0] === '--profile')) { console.error('不支持的参数。使用 --help 查看用法。'); process.exitCode = 1 }
  else install({ profileName: args[1] || 'web', repair }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
