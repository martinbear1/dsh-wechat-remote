#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolveInstallRuntime, verifyInstallRuntime } from '../lib/install-runtime.js'
import { installProfile, backupProfile, NativeInstallError, assertCliInstallOwner } from '../lib/install-profile.js'
import { compareVersions } from '../lib/update-policy.js'
import { selectInstallTarget } from './release-selection.mjs'
import { boundedFetch, downloadRelease, auditArchive, DownloadUnavailableError } from '../lib/update-download.js'
import { writePrivateJsonAtomic } from '../lib/secure-file.js'
import { offerCompanionUpdate } from '../lib/companion-updates.js'
import { releaseOwnedUpdateLock } from '../lib/update-worker.js'
import { chooseDsh, validateDshCli, resolveHome, mayHaveRunningDsh } from './dsh-discovery.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageName = '@harness-remote/dsh-wechat-remote'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function selectRelease(host, assetsRoot = path.join(root, 'assets'), repair = false,
  fetchCatalog = () => boundedFetch('https://relay.xyxfood.xyz/v1/update-policy', 256 * 1024), fetchPackage = fetch, bundledOnly = false) {
  const current = { agentKind: 'dsh', agentVersion: host.dshVersion, pluginVersion: host.pluginVersion,
    platform: { win32: 'windows', darwin: 'macos', linux: 'linux' }[host.platform], arch: host.arch }
  const pinned = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'release.json'), 'utf8'))
  let remote
  try {
    remote = JSON.parse((await fetchCatalog()).toString('utf8'))
  } catch { /* Authenticated npm package retains its bundled release. */ }
  const selectionTime = Date.now()
  let release = selectInstallTarget(pinned, remote, current, selectionTime, bundledOnly)
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
 * party plugins. Live hosts must use their native plugin manager or be stopped. */
async function installStopped({ cli, home, profile, profileName, directory, id, runtime, assetsRoot, repair, open, bundledOnly, startAfterInstall, assertTarget, onProgress }) {
  const dsh = validateDshCli(cli)
  let version = '0.0.0'
  try { version = JSON.parse(fs.readFileSync(path.join(profile, 'node_modules', packageName, 'package.json'), 'utf8')).version } catch {}
  // A stopped host cannot prove its installed copy is loadable. Re-executing
  // the normal installation command also repairs that copy (never downgrades),
  // using the same backed-up native add rather than a second repair workflow.
  const selected = await selectRelease({ dshVersion: dsh.version, pluginVersion: version, platform: process.platform, arch: process.arch }, assetsRoot, repair || version !== '0.0.0', undefined, undefined, bundledOnly)
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 })
  if (fs.realpathSync(profile) !== profile) throw new Error('无法确认 DSH 配置目录的实际位置。')
  const lock = path.join(profile, '.harness-remote-update.lock')
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, id); fs.closeSync(fd)
  let modified = false, keepLock = false
  try {
    // Recheck immediately before writing: a host may have started during npm
    // discovery/download. Never mutate its dependencies underneath that process.
    if (await mayHaveRunningDsh()) throw new Error('DSH 已开始运行，未替换插件。请正常停止 Web 后重试，或使用 DSH 原生插件管理页。')
    assertTarget()
    if (selected.archive) {
      fs.writeFileSync(path.join(directory, 'release.tgz'), selected.archive, { mode: 0o600, flag: 'wx' })
      backupProfile(profile, path.join(directory, 'profile-before'))
      console.log(`正在通过 DSH 原生方式安装插件 ${selected.release.version}…`)
      onProgress({ phase: 'installing' })
      modified = true
      await installProfile({ profile, directory, cli: dsh.cli, targetVersion: selected.release.version, runtime })
    }
  } catch (error) {
    keepLock = error instanceof NativeInstallError && error.mayStillBeRunning
    if (modified && !keepLock) {
      onProgress({ phase: 'rolling-back' })
      fs.renameSync(profile, path.join(directory, 'profile-failed'))
      fs.renameSync(path.join(directory, 'profile-before'), profile)
    }
    throw error
  } finally { if (!keepLock) releaseOwnedUpdateLock(lock, id) }
  if (startAfterInstall === false) {
    return { version: selected.archive ? selected.release.version : version, changed: Boolean(selected.archive), starting: false }
  }
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
async function installSingle({ profileName = 'web', cli, home: configuredHome, assetsRoot, open = true, repair = false, bundledOnly = false,
  startAfterInstall = true, onProgress = () => {}, assertTarget = () => {} } = {}) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileName)) throw new Error('无效的 profile 名称。')
  if (profileName.toLowerCase() === 'desktop') throw new Error('Desktop 由桌面应用管理。请在其插件管理页安装插件包；未修改 Desktop 或 Web 配置。')
  if (cli) cli = validateDshCli(cli).cli
  const home = resolveHome(configuredHome || process.env.DSH_HOME)
  const profile = path.join(home, 'profiles', profileName)
  assertCliInstallOwner(profile)
  // Admission precedes HMR, locks, runtime verification, download and file writes.
  // A running host is never stopped/disposed/restarted by this installer.
  if (await mayHaveRunningDsh()) throw new Error('检测到 DSH Web 正在运行，未停止或修改节点。请通过原启动方式正常停止 Web（后台服务需暂停自动重启）后重试；原生安装包请使用 DSH 插件管理页。')
  const runtime = resolveInstallRuntime(root); await verifyInstallRuntime(runtime)
  cli ||= await chooseDsh()
  assertTarget()
  fs.mkdirSync(home, { recursive: true, mode: 0o700 })
  if (fs.realpathSync(home) !== home) throw new Error('DSH 数据目录是链接，暂不自动替换安装。')
  const id = randomBytes(16).toString('hex')
  const directory = path.join(home, 'harness-remote-updates', id)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  onProgress({ phase: 'preparing' })
  return installStopped({ cli, home, profile, profileName, directory, id, runtime, assetsRoot, repair, open, bundledOnly, startAfterInstall, assertTarget, onProgress })
}
export async function install(options = {}) {
  const result = await installSingle(options)
  if ((options.profileName || 'web') === 'web' && options.companion !== false) {
    try {
      const home = resolveHome(options.home || process.env.DSH_HOME)
      const offer = offerCompanionUpdate(home, 'web', root, result.version)
      if (offer) console.log('已发现 Desktop 插件可更新，尚未开始。请在 Desktop 的插件页或“设置 → 微信连接”确认；旧版不支持确认时，请使用其原生插件管理器更新。')
    } catch { console.log('Web 已完成安装；另一端未自动更新，仍可使用它自己的原生插件管理入口。') }
  }
  return result
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
  if (args.includes('--help') || args.includes('-h')) console.log('安装或升级 DSH Web 微信连接插件：npx -y dsh-wechat-remote@latest\n仅在 DSH Web 已正常停止时安装；后台服务需先暂停自动重启。运行中的原生安装包请使用插件管理页。请在相同系统账号下执行。Windows 可使用 npx.cmd。\nDesktop 首次安装请使用桌面应用的插件管理页；已安装的 Desktop 可接收同版本更新通知，由桌面应用处理。此命令不直接修改 Desktop，也不支持 --profile desktop。\n可选：--profile <名称>（默认 web）；--home <DSH 数据目录>；--dsh-cli <DSH 的 lib/bin.js>；--repair（重新安装，不降级）')
  else Promise.resolve().then(() => install(parseArguments(args))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
