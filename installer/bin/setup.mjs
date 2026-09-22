#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { attachControl, waitForJson, waitForInstallControl } from './native-control.mjs'
import { resolveInstallRuntime, verifyInstallRuntime } from '../lib/install-runtime.js'
import { installProfile, backupProfile, NativeInstallError } from '../lib/install-profile.js'
import { compareVersions } from '../lib/update-policy.js'
import { selectInstallTarget } from './release-selection.mjs'
import { boundedFetch, downloadRelease, auditArchive, DownloadUnavailableError } from '../lib/update-download.js'
import { writePrivateJsonAtomic } from '../lib/secure-file.js'
import { control, validateJob, releaseOwnedUpdateLock } from '../lib/update-worker.js'
import { chooseDsh, validateDshCli, resolveHome, mayHaveRunningDsh, assertInstallTarget, installHostArgv } from './dsh-discovery.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageName = '@harness-remote/dsh-wechat-remote'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function portBusy(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const end = busy => { socket.destroy(); resolve(busy) }
    socket.setTimeout(500, () => end(false)); socket.once('connect', () => end(true)); socket.once('error', () => end(false))
  })
}
export async function selectRelease(host, assetsRoot = path.join(root, 'assets'), repair = false,
  fetchCatalog = () => boundedFetch('https://relay.xyxfood.xyz/v1/update-policy', 256 * 1024), fetchPackage = fetch) {
  const current = { agentKind: 'dsh', agentVersion: host.dshVersion, pluginVersion: host.pluginVersion,
    platform: { win32: 'windows', darwin: 'macos', linux: 'linux' }[host.platform], arch: host.arch }
  const pinned = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'release.json'), 'utf8'))
  let remote
  try {
    remote = JSON.parse((await fetchCatalog()).toString('utf8'))
  } catch { /* Authenticated npm package retains its bundled release. */ }
  const selectionTime = Date.now()
  let release = selectInstallTarget(pinned, remote, current, selectionTime)
  if (host.pluginVersion !== '0.0.0' && (compareVersions(host.pluginVersion, release.version) > 0
    || (compareVersions(host.pluginVersion, release.version) === 0 && !repair))) return { release, archive: null }
  let archive
  if (release.version === pinned.version) archive = fs.readFileSync(path.join(assetsRoot, 'plugin.tgz'))
  else {
    try { archive = await downloadRelease(release, fetchPackage) }
    catch (error) {
      if (!(error instanceof DownloadUnavailableError)) throw error
      // Keep BOTH local and valid online withdrawals when falling back. Dropping
      // the catalog here would accidentally reinstall a known-broken bundle.
      // Retain rules accepted at selection even if their catalog expires while
      // a slow download is in flight; expiry must not erase a known withdrawal.
      const bundled = selectInstallTarget(pinned, remote, current, selectionTime, true)
      if (host.pluginVersion !== '0.0.0' && compareVersions(host.pluginVersion, bundled.version) > 0) throw error
      release = bundled
      console.log(`较新版本暂时无法下载，使用安装器内置的 ${release.version}；未升级到线上最新版本。`)
      if (host.pluginVersion === release.version && !repair) return { release, archive: null }
      archive = fs.readFileSync(path.join(assetsRoot, 'plugin.tgz'))
    }
  }
  auditArchive(archive, release)
  return { release, archive }
}

/** With no running host, native plugin add needs neither HMR nor healthy third-
 * party plugins. Reuse the same installation core; only live hosts need disposal. */
async function installStopped({ cli, home, profile, profileName, directory, id, runtime, assetsRoot, repair, open }) {
  const dsh = validateDshCli(cli)
  let version = '0.0.0'
  try { version = JSON.parse(fs.readFileSync(path.join(profile, 'node_modules', packageName, 'package.json'), 'utf8')).version } catch {}
  const selected = await selectRelease({ dshVersion: dsh.version, pluginVersion: version, platform: process.platform, arch: process.arch }, assetsRoot, repair)
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 })
  if (fs.realpathSync(profile) !== profile) throw new Error('无法确认 DSH 配置目录的实际位置。')
  const lock = path.join(profile, '.harness-remote-update.lock')
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, id); fs.closeSync(fd)
  let modified = false, keepLock = false
  try {
    // Recheck immediately before writing: a host may have started during npm
    // discovery/download. Never mutate its dependencies underneath that process.
    if (await mayHaveRunningDsh()) throw new Error('DSH 已开始运行，请重新执行安装命令以连接该实例。')
    if (selected.archive) {
      fs.writeFileSync(path.join(directory, 'release.tgz'), selected.archive, { mode: 0o600, flag: 'wx' })
      backupProfile(profile, path.join(directory, 'profile-before'))
      console.log(`正在通过 DSH 原生方式安装插件 ${selected.release.version}…`)
      modified = true
      await installProfile({ profile, directory, cli: dsh.cli, targetVersion: selected.release.version, runtime })
    }
  } catch (error) {
    keepLock = error instanceof NativeInstallError && error.mayStillBeRunning
    if (modified && !keepLock) {
      fs.renameSync(profile, path.join(directory, 'profile-failed'))
      fs.renameSync(path.join(directory, 'profile-before'), profile)
    }
    throw error
  } finally { if (!keepLock) releaseOwnedUpdateLock(lock, id) }
  // Use DSH's own browser opening behavior. Startup failure does not undo an
  // otherwise successful native add; an unrelated plugin can fail to boot.
  const logFile = path.join(directory, 'startup.log'), log = fs.openSync(logFile, 'a', 0o600)
  const env = { ...process.env, DSH_HOME: home }
  delete env.HARNESS_REMOTE_UPDATE_JOB
  const child = spawn(process.execPath, [dsh.cli, '--profile', profileName, ...(open ? [] : ['--no-open'])],
    { cwd: process.cwd(), env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
  fs.closeSync(log)
  let launchError
  child.on('error', error => { launchError = error }); child.unref()
  await sleep(1200)
  const starting = !launchError && child.pid && child.exitCode === null && child.signalCode === null
  const installedVersion = selected.archive ? selected.release.version : version
  console.log(`插件 ${installedVersion} 已安装。${starting ? '已启动 DSH，请等待 WebUI 就绪。' : `DSH 未能启动，请查看：${logFile}`}`)
  return { version: installedVersion, changed: Boolean(selected.archive), starting: Boolean(starting) }
}
export async function install({ profileName = 'web', cli, home: configuredHome, assetsRoot, open = true, repair = false } = {}) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileName)) throw new Error('无效的 profile 名称。')
  if (cli) cli = validateDshCli(cli).cli
  const runtime = resolveInstallRuntime(root); await verifyInstallRuntime(runtime)
  const home = resolveHome(configuredHome || process.env.DSH_HOME)
  fs.mkdirSync(home, { recursive: true, mode: 0o700 })
  if (fs.realpathSync(home) !== home) throw new Error('DSH 数据目录是链接，暂不自动替换安装。')
  const profile = path.join(home, 'profiles', profileName), id = randomBytes(16).toString('hex')
  const directory = path.join(home, 'harness-remote-updates', id), token = randomBytes(24).toString('hex')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  let remove, ref, job, locked = false, authorized = false, launched
  const lockFile = path.join(profile, '.harness-remote-update.lock')
  console.log('正在检查 DSH 与插件…')
  try {
    if (!await mayHaveRunningDsh()) {
      cli ||= await chooseDsh()
      return await installStopped({ cli, home, profile, profileName, directory, id, runtime, assetsRoot, repair, open })
    }
    // A live host must identify the same home/profile; never synthesize a second
    // profile just because this terminal inherited different environment values.
    if (!fs.existsSync(path.join(profile, 'package.json'))) {
      throw new Error('当前目录下没有此 DSH 配置，但检测到 DSH 正在运行。请使用相同的 DSH_HOME／--home 和 --profile，未修改正在运行的实例。')
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
          if (launched || await portBusy(Number(process.env.DSH_PORT || 3080)) || await mayHaveRunningDsh()) return
          cli ||= await chooseDsh()
          const log = fs.openSync(path.join(directory, 'startup.log'), 'a', 0o600)
          launched = spawn(process.execPath, [cli, '--profile', profileName, '--no-open'], {
            cwd: process.cwd(), env: { ...process.env, DSH_HOME: home }, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
          fs.closeSync(log); launched.on('error', () => {}); launched.unref()
        },
      })
      if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(ref.origin) || Number(new URL(ref.origin).port) > 65535) {
        ref = undefined
        throw new Error('DSH 安装握手地址无效，未修改插件。')
      }
      writePrivateJsonAtomic(path.join(directory, 'handshake.json'), {
        state: 'ready', elapsedMs: Date.now() - handshakeStarted, startedHost: Boolean(launched),
      })
    } catch (error) {
      if (error.code !== 'DSH_HANDSHAKE_TIMEOUT') throw error
      writePrivateJsonAtomic(path.join(directory, 'handshake.json'), {
        state: 'timeout', elapsedMs: Date.now() - handshakeStarted, startedHost: Boolean(launched),
      })
      throw new Error('DSH 安装准备超时，原插件未替换。本机安装记录：' + path.join(directory, 'handshake.json'))
    }
    job = { controlOrigin: ref.origin, statusToken: token }
    const host = await control(job, 'describe')
    // The authenticated live host is authoritative. A global install or cached
    // version found on PATH must not override the actual npx/local/source host.
    // Explicit choices and installer-started hosts still require an exact match.
    assertInstallTarget(host, { home, profile, cli, pid: launched?.pid || ref.pid })
    remove(); remove = undefined
    await sleep(600)
    let selected = await selectRelease(host, assetsRoot, repair)
    if (!selected.archive && host.pluginVersion === selected.release.version) {
      // A version string on disk is not proof that a prior restart completed.
      // Re-running the normal command must also repair a stuck installed copy.
      let ready = false
      try {
        const response = await fetch(`http://127.0.0.1:${host.localPort}/gate/status`, { signal: AbortSignal.timeout(5000), redirect: 'error' })
        await response.arrayBuffer(); ready = response.ok
      } catch {}
      if (!ready) {
        console.log('检测到已安装插件尚未就绪，正在重新安装修复…')
        selected = await selectRelease(host, assetsRoot, true)
      }
    }
    if (!selected.archive) { console.log(`插件 ${host.pluginVersion} 无需更新。`); return { version: host.pluginVersion, changed: false } }
    console.log(`正在安装插件 ${selected.release.version}，保留原配对与会话…`)
    job = { ...host, argv: installHostArgv(host), id, directory, parentPid: host.pid, pnpm: runtime.cli, targetVersion: selected.release.version,
      previousVersion: host.pluginVersion, statusToken: token, controlOrigin: ref.origin }
    validateJob(job)
    fs.writeFileSync(path.join(directory, 'release.tgz'), selected.archive, { mode: 0o600, flag: 'wx' })
    fs.copyFileSync(path.join(root, 'lib/update-worker.js'), path.join(directory, 'update-worker.js'))
    if (host.pluginVersion === '0.0.0') fs.copyFileSync(path.join(root, 'lib/native-recovery.js'), path.join(directory, 'native-recovery.js'))
    writePrivateJsonAtomic(path.join(directory, 'job.json'), job)
    await control(job, 'launch')
    const ready = await waitForJson(path.join(directory, 'worker-ready.json'), v => v.id === id)
    const scope = createHash('sha256').update(profileName).digest('hex').slice(0, 24)
    writePrivateJsonAtomic(path.join(home, 'harness-remote-updates', `profile-${scope}.json`), { jobId: id, statusOrigin: ready.origin, statusToken: token })
    writePrivateJsonAtomic(path.join(directory, 'authorized.json'), { id }); authorized = true
    let previous = '', result
    // Native download/install has its own bounded deadline; allow its restart
    // and possible rollback to finish before reporting an unknown outcome.
    const until = Date.now() + 1200000
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
    try { remove?.() }
    finally {
      if (ref && !authorized) { try { await control({ controlOrigin: ref.origin, statusToken: token }, 'close') } catch {} }
      if (locked && !authorized) releaseOwnedUpdateLock(lockFile, id)
    }
  }
}
export function parseArguments(args) {
  const options = {}, seen = new Set()
  const names = { '--profile': 'profileName', '--dsh-cli': 'cli', '--home': 'home' }
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (seen.has(flag)) throw new Error('参数重复。使用 --help 查看用法。')
    seen.add(flag)
    if (flag === '--repair') options.repair = true
    else if (names[flag] && args[i + 1] && !args[i + 1].startsWith('--')) options[names[flag]] = args[++i]
    else throw new Error('不支持的参数。使用 --help 查看用法。')
  }
  return options
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) console.log('安装或升级 DSH 微信连接插件：npx -y dsh-wechat-remote@latest\n支持全局安装与 npx 使用的 DSH，已启动或关闭均可；请在相同系统账号下执行。Windows 可使用 npx.cmd。\n可选：--profile <名称>（默认 web）；--home <DSH 数据目录>；--dsh-cli <DSH 的 lib/bin.js>；--repair（重新安装，不降级）')
  else Promise.resolve().then(() => install(parseArguments(args))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
