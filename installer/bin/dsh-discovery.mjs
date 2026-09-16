/** Read-only discovery. A candidate is NOT the installation target until the
 * native, token-bound host handshake confirms its home/profile/CLI/PID.
 * Never run an unvalidated shell shim, fetch a different DSH, or scan a disk. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline/promises'

const execute = promisify(execFile)
const PACKAGE = '@deepseek-ai/dsh'
const clean = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, '')

export function validateDshCli(filename) {
  const cli = fs.realpathSync(path.resolve(filename))
  const root = path.resolve(cli, '../..')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.dsh
  if (manifest.name !== PACKAGE || path.basename(cli) !== 'bin.js' || !fs.statSync(cli).isFile()
      || typeof bin !== 'string' || fs.realpathSync(path.resolve(root, bin)) !== cli) {
    throw new Error('指定路径不是有效的 DSH 启动程序，未修改安装。')
  }
  return { cli, version: String(manifest.version || '') }
}

export function resolveHome(value, fallback = os.homedir()) {
  const raw = String(value || '')
  const configured = raw.trim() ? raw : ''
  return path.resolve(configured === '~' ? fallback : /^~[/\\]/.test(configured)
    ? path.join(fallback, configured.slice(2)) : configured || path.join(fallback, '.dsh'))
}

/** npm's own config resolves .npmrc, custom cache/prefix and Node managers.
 * Query individual public values; never read or log registry credentials. */
async function npmLocation(key, env, cwd) {
  let npm = env.npm_execpath
  if (!npm || !fs.existsSync(npm)) {
    const roots = [path.dirname(process.execPath), ...(env.PATH || '').split(path.delimiter)]
    npm = roots.flatMap(dir => [path.join(dir, 'node_modules/npm/bin/npm-cli.js'),
      path.join(dir, '../lib/node_modules/npm/bin/npm-cli.js')]).find(file => fs.existsSync(file))
  }
  if (!npm) return ''
  try {
    const { stdout } = await execute(process.execPath, [npm, 'config', 'get', key], {
      cwd, env, windowsHide: true, timeout: 10000, maxBuffer: 16384,
    })
    const value = stdout.trim()
    return value && !/[\r\n\0]/.test(value) && path.isAbsolute(value) ? value : ''
  } catch { return '' }
}

export async function discoverDsh({ env = process.env, cwd = process.cwd(), cache, prefix } = {}) {
  const found = new Map()
  const add = (filename, source) => {
    try {
      const item = validateDshCli(filename)
      if (!found.has(item.cli)) found.set(item.cli, { ...item, source })
    } catch { /* A missing/broken cache entry is not a usable DSH. */ }
  }
  for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    add(path.join(dir, 'dsh'), 'PATH') // POSIX symlink, never execute a Windows shim.
    add(path.join(dir, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'PATH')
    add(path.join(dir, '../lib/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'PATH')
    add(path.join(dir, '../@deepseek-ai/dsh/lib/bin.js'), 'PATH') // npm .bin, including Windows.
  }
  for (let dir = path.resolve(cwd);;) {
    add(path.join(dir, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'project')
    add(path.join(dir, 'apps/cli/lib/bin.js'), 'source')
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const locations = await Promise.all([
    cache !== undefined ? cache : env.npm_config_cache || npmLocation('cache', env, cwd),
    prefix !== undefined ? prefix : npmLocation('prefix', env, cwd),
  ])
  if (locations[1]) {
    add(path.join(locations[1], 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'npm-global')
    add(path.join(locations[1], 'lib/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'npm-global')
  }
  const cacheRoot = locations[0]
  if (cacheRoot) {
    try {
      const entries = fs.readdirSync(path.join(cacheRoot, '_npx'), { withFileTypes: true })
      if (entries.length > 512) throw new Error('npx 缓存较多，请先启动要使用的 DSH，再运行安装命令。')
      for (const entry of entries) if (/^[a-f0-9]+$/i.test(entry.name) && entry.isDirectory()) {
        add(path.join(cacheRoot, '_npx', entry.name, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'npx')
      }
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
  }
  return [...found.values()]
}

export async function chooseDsh(options = {}) {
  if (options.cli) return validateDshCli(options.cli).cli
  const candidates = await discoverDsh(options)
  if (!candidates.length) throw new Error('未找到 DSH。请先按原来的方式启动 DSH WebUI，再运行本命令。')
  // A stopped host has no handshake yet. Follow the terminal's ordinary DSH
  // resolution before consulting old NPX cache entries; no version sorting or
  // downloading. This fallback never overrides an already running host.
  const normal = candidates.find(item => item.source === 'PATH')
    || candidates.find(item => item.source === 'npm-global')
    || candidates.find(item => item.source === 'project' || item.source === 'source')
  if (normal) return normal.cli
  if (candidates.length === 1) return candidates[0].cli
  // Multiple cache-only versions are not evidence of the user's choice.
  // A live host normally bypasses this fallback via its native handshake.
  const prompt = options.prompt || (process.stdin.isTTY && process.stdout.isTTY ? async message => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try { return await rl.question(message) } finally { rl.close() }
  } : undefined)
  if (!prompt) throw new Error('找到多份 DSH。请先启动要使用的 DSH，或用 --dsh-cli 指定其 lib/bin.js；未修改插件。')
  const list = candidates.map((item, index) => `${index + 1}. DSH ${clean(item.version)} — ${clean(item.cli)}`).join('\n')
  const answer = String(await prompt(`找到多份 DSH，请选择要使用的一份（直接回车取消）：\n${list}\n编号：`)).trim()
  const index = Number(answer) - 1
  if (!/^\d+$/.test(answer) || !Number.isInteger(index) || !candidates[index]) throw new Error('已取消安装，未修改插件。')
  return candidates[index].cli
}

// POSIX npm/npx normally starts through a bin symlink, not lib/bin.js.
// This is a conservative stop signal only; target authority is the handshake.
export function looksLikeDshProcess(command) {
  return /(?:[/\\](?:dsh|apps[/\\]cli)[/\\]lib[/\\]bin\.js|[/\\](?:\.bin|bin)[/\\]dsh)(?:["'\s]|$)/i.test(command || '')
}

/** Conservatively prevent a second host while a live profile reloads on a
 * non-default port. We use process listings only as a stop signal, never as
 * authority to install, stop a PID, or select another user's data directory. */
export async function mayHaveRunningDsh() {
  try {
    if (process.platform === 'win32') {
      const command = "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='node'\" | Select-Object -ExpandProperty CommandLine | ConvertTo-Json -Compress"
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
        windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
      })
      const data = stdout.trim() ? JSON.parse(stdout) : []
      return [data].flat().some(looksLikeDshProcess)
    }
    if (process.platform === 'linux') {
      for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
        try {
          const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
          if (args.some(looksLikeDshProcess)) return true
        } catch { /* Exited or inaccessible process. */ }
      }
      return false
    }
    const { stdout } = await execute('/bin/ps', ['-axo', 'command='], { timeout: 10000, maxBuffer: 2 * 1024 * 1024 })
    return looksLikeDshProcess(stdout)
  } catch { return true } // Unknown process ownership must never authorize an extra host.
}

export function assertInstallTarget(host, { home, profile, cli, pid }) {
  if (host.home !== home || host.profile !== profile || !Number.isInteger(host.pid) || host.pid < 1
      || host.pid !== pid || (cli && host.cli !== validateDshCli(cli).cli)
      || host.cli !== validateDshCli(host.cli).cli) {
    throw new Error('当前 DSH 身份与安装目标不一致，未修改安装。')
  }
}

/** Preserve arguments but use the validated real entry point for restart.
 * On macOS/Linux argv[0] can be npm's .bin/dsh symlink while host.cli is its
 * canonical target. The worker requires a canonical CLI, as the WebUI updater
 * already does. Never accept a different executable hidden in argv. */
export function installHostArgv(host) {
  if (!Array.isArray(host.argv) || !host.argv.length || !host.argv.every(arg => typeof arg === 'string')
      || validateDshCli(host.argv[0]).cli !== host.cli) {
    throw new Error('DSH 启动参数与安装目标不一致，未修改安装。')
  }
  return [host.cli, ...host.argv.slice(1)]
}
