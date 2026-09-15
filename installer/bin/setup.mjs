#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { attachControl, waitForJson, waitForInstallControl } from './native-control.mjs'
import { resolveInstallRuntime, verifyInstallRuntime } from '../lib/install-runtime.js'
import { compareVersions } from '../lib/update-policy.js'
import { selectInstallTarget } from './release-selection.mjs'
import { boundedFetch, downloadRelease, auditArchive } from '../lib/update-download.js'
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
  fetchCatalog = () => boundedFetch('https://relay.xyxfood.xyz/v1/update-policy', 256 * 1024)) {
  const current = { agentKind: 'dsh', agentVersion: host.dshVersion, pluginVersion: host.pluginVersion,
    platform: { win32: 'windows', darwin: 'macos', linux: 'linux' }[host.platform], arch: host.arch }
  const pinned = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'release.json'), 'utf8'))
  let remote
  try {
    remote = JSON.parse((await fetchCatalog()).toString('utf8'))
  } catch { /* Authenticated npm package retains its bundled release. */ }
  const release = selectInstallTarget(pinned, remote, current)
  if (host.pluginVersion !== '0.0.0' && (compareVersions(host.pluginVersion, release.version) > 0
    || (compareVersions(host.pluginVersion, release.version) === 0 && !repair))) return { release, archive: null }
  let archive
  if (release.version === pinned.version) archive = fs.readFileSync(path.join(assetsRoot, 'plugin.tgz'))
  else archive = await downloadRelease(release)
  auditArchive(archive, release)
  return { release, archive }
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
    // Initialize missing profiles through DSH itself, never synthesize a bundle list.
    if (!fs.existsSync(path.join(profile, 'package.json'))) {
      if (await mayHaveRunningDsh()) throw new Error('当前目录下没有此 DSH 配置，但检测到 DSH 正在运行。请使用相同的 DSH_HOME／--home 和 --profile，未修改正在运行的实例。')
      cli ||= await chooseDsh()
      const log = fs.openSync(path.join(directory, 'startup.log'), 'a', 0o600)
      launched = spawn(process.execPath, [cli, '--profile', profileName, '--no-open'], {
        cwd: process.cwd(), env: { ...process.env, DSH_HOME: home }, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
      fs.closeSync(log); launched.on('error', () => {}); launched.unref()
      const initializedBy = Date.now() + 180000
      while (!fs.existsSync(path.join(profile, 'package.json')) && Date.now() < initializedBy) {
        if (launched.exitCode !== null || launched.signalCode !== null) break
        await sleep(100)
      }
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
    const selected = await selectRelease(host, assetsRoot, repair)
    if (!selected.archive) { console.log(`插件 ${host.pluginVersion} 无需更新。`); return { version: host.pluginVersion, changed: false } }
    console.log(`正在安装插件 ${selected.release.version}，保留原配对与会话…`)
    job = { ...host, argv: installHostArgv(host), id, directory, parentPid: host.pid, pnpm: runtime.cli, targetVersion: selected.release.version,
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
  if (args.includes('--help') || args.includes('-h')) console.log('安装或升级 DSH 微信连接插件：npx -y dsh-wechat-remote@latest\n请先按原来的方式启动 DSH WebUI，支持全局安装与 npx 启动。\n可选：--profile <名称>（默认 web）；--home <DSH 数据目录>；--dsh-cli <DSH 的 lib/bin.js>；--repair（重新安装，不降级）')
  else Promise.resolve().then(() => install(parseArguments(args))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
