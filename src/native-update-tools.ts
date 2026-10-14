/** On-demand Web installer tools. DSH still owns installation and activation. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { symbols, type Context } from '@deepseek-ai/cordis'
import { resolveInstallRuntime, verifyInstallRuntime, type InstallRuntime } from './install-runtime.js'

interface Entry { options: { id: string; name?: string; config?: Record<string, unknown> } }
interface Editor {
  entries(): Entry[]
  edit(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>
}
interface ToolRecord { schema: 1; owner: 'dsh-wechat-remote'; runtime: InstallRuntime; command: string; digest: string }
const identity = (value: any): object | undefined => value?.[symbols.original] ?? value
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))
function ownedTool(command: unknown, root: string): boolean {
  if (typeof command !== 'string' || path.dirname(path.dirname(command)) !== root) return false
  try {
    const record = read(path.join(path.dirname(command), 'tool.json')) as ToolRecord
    return record.schema === 1 && record.owner === 'dsh-wechat-remote' && record.command === command
      && /^[a-f0-9]{64}$/.test(record.digest)
      && path.basename(path.dirname(command)) === `pnpm-${record.runtime.version}-${record.digest.slice(0, 24)}`
  } catch { return false }
}

/** Same PATH/PATHEXT command discovery as ordinary package commands; no process,
 * network, environment edit or package operation on the normal message path. */
export function commandAvailable(command: string, env = process.env): boolean {
  const key = Object.keys(env).find(key => key.toLowerCase() === 'path')
  const extensions = process.platform === 'win32' ? ['', ...(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')] : ['']
  const roots = path.isAbsolute(command) ? [''] : (env[key || 'PATH'] || '').split(path.delimiter).filter(Boolean)
  return roots.some(root => extensions.some(extension => {
    try {
      const file = path.isAbsolute(command) ? command + extension : path.join(root.replace(/^"|"$/g, ''), command + extension)
      if (!fs.statSync(file).isFile()) return false
      fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
      return true
    } catch { return false }
  }))
}

/** Content-addressed, immutable cache OUTSIDE the plugin being replaced. No npm
 * install, global PATH edits or npx cache dependency. Completed tools are retained
 * because a native configuration or package operation may still refer to them. */
export async function persistentUpdateTool(home: string, owner = fileURLToPath(new URL('../', import.meta.url))): Promise<ToolRecord> {
  const source = resolveInstallRuntime(owner)
  const launcher = process.platform === 'win32'
    ? '@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%~dp0node.exe" "%~dp0pnpm-package\\bin\\pnpm.mjs" %*\r\n'
    : '#!/bin/sh\nbase=${0%/*}\nexec "$base/node" "$base/pnpm-package/bin/pnpm.mjs" "$@"\n'
  let packageRoot = path.dirname(source.cli)
  while (!fs.existsSync(path.join(packageRoot, 'package.json'))) packageRoot = path.dirname(packageRoot)
  const files: string[] = []
  const walk = async (relative: string): Promise<void> => {
    const file = path.join(packageRoot, relative), stat = await fs.promises.lstat(file)
    if (stat.isDirectory()) for (const name of (await fs.promises.readdir(file)).sort()) await walk(path.join(relative, name))
    else if (stat.isFile()) files.push(relative)
    else throw Error('安装工具包含不支持的文件，未修改 DSH 配置。')
  }
  // Published pnpm runtime, not development artifacts or a second dependency tree.
  for (const name of ['package.json', 'LICENSE', 'bin', 'dist']) await walk(name)
  const hash = async (packageDir: string, executable: string) => {
    const digest = createHash('sha256')
    digest.update('dsh-wechat-native-tool-v1\0').update(launcher).update('\0')
    const append = async (file: string) => {
      if (!(await fs.promises.lstat(file)).isFile()) throw Error('安装工具文件被重定向，未覆盖。')
      for await (const bytes of fs.createReadStream(file)) digest.update(bytes)
    }
    for (const file of files) { digest.update(file.replaceAll('\\', '/')).update('\0'); await append(path.join(packageDir, file)) }
    await append(executable)
    return digest.digest('hex')
  }
  const content = await hash(packageRoot, source.executable)
  const root = path.join(fs.realpathSync(home), 'harness-remote-tools')
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  if (fs.lstatSync(root).isSymbolicLink()) throw Error('安装工具目录被重定向，未修改 DSH 配置。')
  const target = path.join(root, `pnpm-${source.version}-${content.slice(0, 24)}`)
  const executable = path.join(target, process.platform === 'win32' ? 'node.exe' : 'node')
  const command = path.join(target, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const runtime = { ...source, executable, cli: path.join(target, 'pnpm-package', path.relative(packageRoot, source.cli)) }
  const record: ToolRecord = { schema: 1, owner: 'dsh-wechat-remote', runtime, command, digest: content }
  const inspect = async () => {
    if (fs.lstatSync(target).isSymbolicLink() || JSON.stringify(read(path.join(target, 'tool.json'))) !== JSON.stringify(record)) throw Error('已有安装工具记录不一致，未覆盖。')
    if (await hash(path.join(target, 'pnpm-package'), executable) !== content || await fs.promises.readFile(command, 'utf8') !== launcher) throw Error('已有安装工具校验失败，未覆盖。')
    await verifyInstallRuntime(runtime)
    return record
  }
  if (fs.existsSync(target)) return inspect()
  const stage = fs.mkdtempSync(path.join(root, '.stage-'))
  try {
    for (const file of files) {
      const output = path.join(stage, 'pnpm-package', file)
      await fs.promises.mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
      await fs.promises.copyFile(path.join(packageRoot, file), output, fs.constants.COPYFILE_EXCL)
    }
    await fs.promises.copyFile(source.executable, path.join(stage, path.basename(executable)), fs.constants.COPYFILE_EXCL)
    await fs.promises.chmod(path.join(stage, path.basename(executable)), 0o700)
    // Relative, ASCII entry: Unicode/space-containing Windows Node paths never
    // pass through the batch file's code page. The actual arguments stay native.
    fs.writeFileSync(path.join(stage, path.basename(command)), launcher, { flag: 'wx', mode: 0o700 })
    fs.writeFileSync(path.join(stage, 'tool.json'), JSON.stringify(record), { flag: 'wx', mode: 0o600 })
    await verifyInstallRuntime({ ...runtime, executable: path.join(stage, path.basename(executable)), cli: path.join(stage, 'pnpm-package', path.relative(packageRoot, source.cli)) })
    try { fs.renameSync(stage, target) }
    catch (error) { if (!fs.existsSync(target)) throw error }
    return await inspect()
  } finally {
    if (path.dirname(stage) !== root || !path.basename(stage).startsWith('.stage-')) throw Error('Invalid owned tool staging path')
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

/** Called only by an explicit update, before native install admission. The
 * public configEditor handles validation, profile locks, reload and rollback. */
export async function prepareNativeUpdateTools<T extends object>(ctx: Pick<Context, 'get'>, home: string, scope: string, manager: T): Promise<T> {
  const currentManager = () => ctx.get('pluginManager') as T | undefined
  if (identity(currentManager()) !== identity(manager)) throw Error('安装服务已变化，请重新检查更新。')
  const profile = ctx.get('profileContext') as { packageManager?: unknown } | undefined
  if (scope !== 'web' || profile?.packageManager) return manager
  const editor = ctx.get('configEditor') as Editor | undefined
  if (typeof editor?.entries !== 'function' || typeof editor.edit !== 'function') return manager
  const entries = editor.entries().filter(row => row.options.name === '@deepseek-ai/dsh-plugin-manager')
  if (entries.length !== 1) return manager // Don't guess a custom provider's settings.
  const entry = entries[0], configured = entry.options.config?.pnpmCommand
  const command = configured === undefined ? 'pnpm' : configured
  const toolsRoot = path.join(fs.realpathSync(home), 'harness-remote-tools')
  const managed = ownedTool(command, toolsRoot)
  // Preserve explicit user commands, including policy-controlled commands which
  // are temporarily unavailable; never silently replace them with our tool.
  if (!managed && command !== 'pnpm') return manager
  if (!managed && commandAvailable('pnpm')) return manager
  const tool = await persistentUpdateTool(home)
  if (identity(currentManager()) !== identity(manager)) throw Error('准备期间安装服务已变化，请重新检查更新。')
  if (command === tool.command) return manager
  await editor.edit(entry, current => {
    if ((current.pnpmCommand ?? 'pnpm') !== command) throw Error('安装工具配置已变化，未覆盖新配置。')
    return { ...current, pnpmCommand: tool.command }
  })
  const replacement = currentManager()
  const live = (ctx.get('configEditor') as Editor | undefined)?.entries().find(row => row.options.id === entry.options.id)
  if (!replacement || live?.options.name !== entry.options.name || live?.options.config?.pnpmCommand !== tool.command) throw Error('DSH 尚未应用安装工具配置，请重新检查更新。')
  return replacement
}
