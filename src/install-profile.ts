/** Native DSH profile installation, staged outside the active profile. */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writePrivateJsonAtomic } from './secure-file.js'
import { INSTALL_PNPM_VERSION, type InstallRuntime } from './install-runtime.js'

export const PLUGIN_PACKAGE = '@harness-remote/dsh-wechat-remote'
export interface ProfileInstall {
  profile: string; directory: string; cli: string; targetVersion: string
  runtime: InstallRuntime
}
export function safeProfileName(value: string): boolean { return /^[A-Za-z0-9_-]{1,80}$/.test(value) }
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** A staged profile must remain valid after its directory is atomically moved. */
export function assertRelocatableProfile(root: string): void {
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const relative = path.relative(root, fs.realpathSync(file))
        if (path.isAbsolute(fs.readlinkSync(file)) || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new Error('插件依赖包含不可迁移的链接，未修改当前安装。')
        }
      } else if (entry.isDirectory()) walk(file)
    }
  }
  walk(root)
}

/** Private, per-operation PATH entry; never edit a global shim or shell profile. */
export function installToolPath(directory: string, runtime: InstallRuntime): string {
  const bin = path.join(directory, 'tool-bin'); fs.mkdirSync(bin, { mode: 0o700 })
  const runner = path.join(bin, 'pnpm-run.cjs')
  fs.writeFileSync(runner, `require('node:child_process').spawnSync(${JSON.stringify(runtime.executable)},[${JSON.stringify(runtime.cli)},...process.argv.slice(2)],{stdio:'inherit',shell:false,windowsHide:true}).status===0?process.exit(0):process.exit(1)\n`, { mode: 0o600 })
  if (process.platform === 'win32') {
    // npm/DSH uses a .cmd shim on Windows. No user-controlled package or path
    // arguments are interpolated into this file; the native command gets a
    // fixed relative tarball spec and an allowlisted profile name.
    if (/["\r\n]/.test(runtime.executable)) throw new Error('Node 安装路径不受支持。')
    fs.writeFileSync(path.join(bin, 'pnpm.cmd'), `@echo off\r\n"${runtime.executable.replace(/%/g, '%%')}" "%~dp0pnpm-run.cjs" %*\r\n`, { mode: 0o700 })
  } else {
    const quote = (s: string) => "'" + s.replace(/'/g, "'\"'\"'") + "'"
    fs.writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\nexec ${quote(runtime.executable)} ${quote(runner)} "$@"\n`, { mode: 0o700 })
  }
  return bin
}

export function runNativePlugin(cli: string, profile: string, home: string, toolPath: string,
  runtime: InstallRuntime, logFile: string): Promise<void> {
  if (!safeProfileName(profile)) throw new Error('无效的 DSH profile 名称。')
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logFile, 'a', 0o600)
    const child = spawn(runtime.executable, [cli, 'plugin', '--profile', profile, 'add',
      'file:harness-remote-update.tgz', '--ignore-scripts', '--config.frozen-lockfile=false', '--prefer-offline',
      '--config.manage-package-manager-versions=false', '--reporter=append-only'], {
      cwd: home, shell: false, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, DSH_HOME: home, PATH: toolPath + path.delimiter + (process.env.PATH || ''),
        CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false' },
    })
    fs.closeSync(log)
    const timer = setTimeout(() => { child.kill(); reject(new Error('下载或安装超时，原插件未替换。')) }, 240000)
    child.once('error', () => { clearTimeout(timer); reject(new Error('无法启动 DSH 原生安装程序。')) })
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('安装未完成，原插件未替换；详情已保留在本机安装日志。')) })
  })
}

export async function stageProfile(job: ProfileInstall): Promise<string> {
  const scope = path.basename(job.profile)
  if (!safeProfileName(scope) || !fs.statSync(job.directory).isDirectory()) throw new Error('安装目标不明确。')
  const stagingHome = path.join(job.directory, 'staging-home'), staged = path.join(stagingHome, 'profiles', scope)
  fs.mkdirSync(staged, { recursive: true, mode: 0o700 })
  if (fs.existsSync(job.profile)) {
    if (fs.lstatSync(job.profile).isSymbolicLink() || fs.realpathSync(job.profile) !== path.resolve(job.profile)) throw new Error('不支持自动替换链接形式的 profile。')
    fs.cpSync(job.profile, staged, { recursive: true, dereference: false,
      filter: p => !['node_modules', '.harness-remote-update.lock'].includes(path.basename(p)) })
  }
  let before: any = null
  const filename = path.join(staged, 'package.json')
  if (fs.existsSync(filename)) {
    before = JSON.parse(fs.readFileSync(filename, 'utf8'))
    for (const [name, spec] of Object.entries(before.dependencies || {})) {
      if (name !== PLUGIN_PACKAGE && !/^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(spec))) throw new Error('其他插件使用了本地链接或特殊来源，未修改当前安装。')
    }
    for (const e of fs.readdirSync(staged, { withFileTypes: true })) if (e.isSymbolicLink()) throw new Error('profile 配置包含链接，未修改当前安装。')
    if (before.packageManager && !/^pnpm@\d+\.\d+\.\d+(?:\+.*)?$/.test(before.packageManager)) throw new Error('当前 profile 使用了其他包管理器，未修改安装。')
    // DSH resolves the profile before forwarding `plugin add`. Point only this
    // dependency at the already-audited local release so it cannot first fetch
    // the obsolete GitHub checkout from the previous profile's manifest.
    writePrivateJsonAtomic(filename, { ...before, dependencies: { ...before.dependencies,
      [PLUGIN_PACKAGE]: 'file:harness-remote-update.tgz' }, packageManager: `pnpm@${INSTALL_PNPM_VERSION}` })
  }
  fs.copyFileSync(path.join(job.directory, 'release.tgz'), path.join(staged, 'harness-remote-update.tgz'))
  const tools = installToolPath(job.directory, job.runtime)
  await runNativePlugin(job.cli, scope, stagingHome, tools, job.runtime, path.join(job.directory, 'install.log'))
  const installed = fs.realpathSync(path.join(staged, 'node_modules', PLUGIN_PACKAGE))
  const relative = path.relative(staged, installed)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('暂存插件不在安装目录内。')
  if (JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version !== job.targetVersion) throw new Error('安装后插件版本不匹配。')
  const after = JSON.parse(fs.readFileSync(filename, 'utf8'))
  if (!after.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE)) throw new Error('DSH 尚未将插件注册为原生 profile 层。')
  for (const name of Object.keys(before?.dependencies || {})) if (name !== PLUGIN_PACKAGE) {
    if (hash(path.join(job.profile, 'node_modules', name, 'package.json')) !== hash(path.join(staged, 'node_modules', name, 'package.json'))) throw new Error('安装试图改变其他插件，原安装保持不变。')
  }
  assertRelocatableProfile(staged)
  return staged
}
