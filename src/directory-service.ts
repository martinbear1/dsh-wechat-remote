/**
 * 微信小程序专用的电脑目录浏览服务。
 *
 * 这是普通的 DSH Typert Remote Service：它不注册 directoryPicker、不向
 * WebUI 注入目录组件，也不修改 workspace/session 语义。小程序选中路径后
 * 仍须调用 DSH 官方 workspace.create。
 */
import { execFile } from 'node:child_process'
import { mkdir, opendir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import type { Context } from '@deepseek-ai/cordis'
import {
  boundedInsert,
  fullyQualified,
  raceAbort,
  type ListingCandidate,
} from '@deepseek-ai/dsh-host-directory-picker-browse'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_ENTRIES = 1000
const DEFAULT_OPERATION_TIMEOUT_MS = 6500
const MIN_OPERATION_TIMEOUT_MS = 1000
const MAX_OPERATION_TIMEOUT_MS = 30_000

export interface WechatDirectoryRootsRequest {}

export interface WechatDirectoryRoot {
  readonly name: string
  readonly path: string
  readonly kind: 'local' | 'network' | 'filesystem'
  readonly displayRoot?: string
}

export interface WechatDirectoryRootsValue {
  readonly home: string
  readonly roots: readonly WechatDirectoryRoot[]
}

export interface WechatDirectoryRootsError {
  readonly code: 'drive-enumeration-failed'
  readonly message: string
}

export type WechatDirectoryRootsResult =
  | { readonly ok: true; readonly value: WechatDirectoryRootsValue }
  | { readonly ok: false; readonly error: WechatDirectoryRootsError }

export interface WechatDirectoryListRequest {
  readonly path?: string
}

export interface WechatDirectoryCrumb {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

export interface WechatDirectoryEntry {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}

export interface WechatDirectoryListValue {
  readonly path: string
  readonly home: string
  readonly crumbs: readonly WechatDirectoryCrumb[]
  readonly entries: readonly WechatDirectoryEntry[]
  readonly truncated: boolean
}

export interface WechatDirectoryListError {
  readonly code: 'directory-unreadable' | 'directory-timeout' | 'network-unavailable'
  readonly path: string
  readonly message: string
}

export type WechatDirectoryListResult =
  | { readonly ok: true; readonly value: WechatDirectoryListValue }
  | { readonly ok: false; readonly error: WechatDirectoryListError }

export interface WechatDirectoryCreateRequest {
  readonly path: string
  readonly name: string
}

export interface WechatDirectoryCreateValue {
  readonly path: string
}

export interface WechatDirectoryCreateError {
  readonly code: 'directory-exists' | 'directory-create-failed'
  readonly path: string
  readonly message: string
}

export type WechatDirectoryCreateResult =
  | { readonly ok: true; readonly value: WechatDirectoryCreateValue }
  | { readonly ok: false; readonly error: WechatDirectoryCreateError }

export interface WechatDirectoryConfig {
  readonly maxEntries?: number
  readonly operationTimeoutMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    wechatDirectory: WechatDirectoryService
  }
}

interface PowerShellDrive {
  readonly name?: unknown
  readonly path?: unknown
  readonly displayRoot?: unknown
}

/**
 * Host-only directory service exposed through the standard DSH Typert gateway.
 */
export class WechatDirectoryService extends TypertRemoteService {
  private readonly maxEntries: number
  private readonly operationTimeoutMs: number
  private readonly windowsRoots = new Map<string, WechatDirectoryRoot>()
  private windowsRootsPromise?: Promise<readonly WechatDirectoryRoot[]>

  constructor(ctx: Context, config: WechatDirectoryConfig = {}) {
    super(ctx, 'wechatDirectory')
    const requested = config.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.maxEntries = Number.isSafeInteger(requested) && requested > 0
      ? requested
      : DEFAULT_MAX_ENTRIES
    const requestedTimeout = config.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS
    this.operationTimeoutMs = Number.isSafeInteger(requestedTimeout)
      && requestedTimeout >= MIN_OPERATION_TIMEOUT_MS
      && requestedTimeout <= MAX_OPERATION_TIMEOUT_MS
      ? requestedTimeout
      : DEFAULT_OPERATION_TIMEOUT_MS
  }

  /** Enumerate real filesystem roots once; never guess C: through Z:. */
  @Remote('roots')
  async roots(
    request: WechatDirectoryRootsRequest,
    signal: AbortSignal,
  ): Promise<WechatDirectoryRootsResult> {
    try {
      void request
      signal.throwIfAborted()
      if (process.platform !== 'win32') {
        return {
          ok: true,
          value: {
            home: homedir(),
            roots: [{ name: '/', path: '/', kind: 'filesystem' }],
          },
        }
      }

      const roots = await this.readWindowsRoots(signal)
      return { ok: true, value: { home: homedir(), roots } }
    } catch (error) {
      signal.throwIfAborted()
      return {
        ok: false,
        error: {
          code: 'drive-enumeration-failed',
          message: `无法读取电脑磁盘列表：${messageOf(error)}`,
        },
      }
    }
  }

  /** List one directory level with the same bounds and path fence as DSH browse. */
  @Remote('list')
  async list(
    request: WechatDirectoryListRequest,
    signal: AbortSignal,
  ): Promise<WechatDirectoryListResult> {
    const requested = request.path
    const home = homedir()
    const fallbackPath = requested ?? home
    if (requested !== undefined && !fullyQualified(requested)) {
      return unreadable(fallbackPath, '路径不是完全限定的电脑绝对路径')
    }

    const target = resolve(fallbackPath)
    if (await this.isNetworkTarget(target, signal)) {
      return await this.listNetworkDirectory(target, signal)
    }
    const keep = this.maxEntries + 1
    const window: ListingCandidate[] = []
    let evicted = false

    try {
      const opening = opendir(target)
      const level = await raceAbort(opening, signal).catch((error) => {
        opening.then((dir) => dir.close().catch(swallowCloseFailure), () => {})
        throw error
      })
      try {
        for (;;) {
          const dirent = await raceAbort(level.read(), signal)
          if (dirent === null) break
          if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue
          if (boundedInsert(window, {
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            isSymbolicLink: dirent.isSymbolicLink(),
          }, keep)) evicted = true
        }
      } finally {
        const closing = level.close()
        if (signal.aborted) closing.catch(swallowCloseFailure)
        else await closing
      }
    } catch (error) {
      signal.throwIfAborted()
      return unreadable(target, messageOf(error))
    }

    const entries: WechatDirectoryEntry[] = []
    let truncated = evicted
    for (const candidate of window) {
      signal.throwIfAborted()
      const row = await directoryRow(target, candidate, signal)
      if (row === null) continue
      if (entries.length === this.maxEntries) {
        truncated = true
        break
      }
      entries.push(row)
    }

    return {
      ok: true,
      value: {
        path: target,
        home,
        crumbs: ancestryCrumbs(target),
        entries,
        truncated,
      },
    }
  }

  /** Create exactly one child directory; never recurse or accept a path segment. */
  @Remote('create')
  async create(
    request: WechatDirectoryCreateRequest,
    signal: AbortSignal,
  ): Promise<WechatDirectoryCreateResult> {
    if (!fullyQualified(request.path)) {
      return createFailed(request.path, '父目录不是完全限定的电脑绝对路径')
    }
    const parent = resolve(request.path)
    if (
      request.name.trim() === ''
      || request.name === '.'
      || request.name === '..'
      || /[/\\]/.test(request.name)
    ) {
      return createFailed(parent, '文件夹名称必须是单个非空路径段')
    }

    const target = join(parent, request.name)
    if (await this.isNetworkTarget(parent, signal)) {
      return await this.createNetworkDirectory(target, signal)
    }
    try {
      await mkdir(target)
      return { ok: true, value: { path: target } }
    } catch (error) {
      if (errorCode(error) === 'EEXIST') {
        return {
          ok: false,
          error: { code: 'directory-exists', path: target, message: '同名文件夹已经存在' },
        }
      }
      return createFailed(target, messageOf(error))
    }
  }

  /**
   * Share one non-blocking drive snapshot between roots() and the initial home
   * listing. The child process still has its own 8 s kill deadline, while each
   * caller may stop waiting through the Typert request signal.
   */
  private async readWindowsRoots(signal: AbortSignal): Promise<readonly WechatDirectoryRoot[]> {
    if (this.windowsRootsPromise === undefined) {
      const processSignal = new AbortController().signal
      this.windowsRootsPromise = enumerateWindowsRoots(processSignal)
        .then((roots) => {
          this.windowsRoots.clear()
          for (const root of roots) this.windowsRoots.set(root.path.toUpperCase(), root)
          return roots
        })
        .catch((error) => {
          this.windowsRootsPromise = undefined
          throw error
        })
    }
    return await raceAbort(this.windowsRootsPromise, signal)
  }

  /** Treat UNC paths and mapped drives reported with DisplayRoot as network I/O. */
  private async isNetworkTarget(target: string, signal: AbortSignal): Promise<boolean> {
    if (process.platform !== 'win32') return false
    if (target.startsWith('\\\\')) return true
    const match = /^([A-Za-z]):[\\/]/.exec(target)
    if (match === null) return false
    const rootPath = `${match[1].toUpperCase()}:\\`
    let root = this.windowsRoots.get(rootPath)
    if (root === undefined) {
      try {
        await this.readWindowsRoots(signal)
      } catch (error) {
        signal.throwIfAborted()
        // If drive classification itself fails, use the killable worker rather
        // than risk blocking the DSH process on an unknown mounted filesystem.
        return true
      }
      root = this.windowsRoots.get(rootPath)
    }
    return root?.kind === 'network'
  }

  /**
   * Network shares are enumerated in a disposable PowerShell child. A dead
   * mapped drive can therefore be killed without pinning DSH's event loop.
   * The path travels only through base64 environment data; no client text is
   * interpolated into the fixed script.
   */
  private async listNetworkDirectory(
    target: string,
    signal: AbortSignal,
  ): Promise<WechatDirectoryListResult> {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_WECHAT_DIRECTORY_PATH_B64))',
      '$limit = [int]$env:DSH_WECHAT_DIRECTORY_LIMIT',
      '$items = @(Get-ChildItem -LiteralPath $path -Force -Directory -ErrorAction Stop | Select-Object -First ($limit + 1) | ForEach-Object {',
      '  [pscustomobject]@{ name = $_.Name; hidden = (($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0) }',
      '})',
      '[pscustomobject]@{ entries = @($items); truncated = ($items.Count -gt $limit) } | ConvertTo-Json -Depth 4 -Compress',
    ].join('; ')
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: this.operationTimeoutMs,
          signal,
          env: {
            ...process.env,
            DSH_WECHAT_DIRECTORY_PATH_B64: Buffer.from(target, 'utf8').toString('base64'),
            DSH_WECHAT_DIRECTORY_LIMIT: String(this.maxEntries),
          },
        },
      )
      signal.throwIfAborted()
      const decoded = JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim()) as {
        readonly entries?: unknown
        readonly truncated?: unknown
      }
      const rawEntries = Array.isArray(decoded.entries)
        ? decoded.entries
        : decoded.entries === undefined || decoded.entries === null
          ? []
          : [decoded.entries]
      const entries = rawEntries
        .filter(isNetworkEntry)
        .slice(0, this.maxEntries)
        .map((entry) => ({
          name: entry.name,
          path: join(target, entry.name),
          hidden: entry.hidden === true,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
      return {
        ok: true,
        value: {
          path: target,
          home: homedir(),
          crumbs: ancestryCrumbs(target),
          entries,
          truncated: decoded.truncated === true || rawEntries.length > this.maxEntries,
        },
      }
    } catch (error) {
      signal.throwIfAborted()
      if (isChildTimeout(error)) return timedOut(target)
      return networkUnavailable(target)
    }
  }

  /** Create one network-share child in a killable process with the same deadline. */
  private async createNetworkDirectory(
    target: string,
    signal: AbortSignal,
  ): Promise<WechatDirectoryCreateResult> {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_WECHAT_DIRECTORY_PATH_B64))',
      'if (Test-Path -LiteralPath $path) { exit 17 }',
      'New-Item -ItemType Directory -LiteralPath $path -ErrorAction Stop | Out-Null',
    ].join('; ')
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: this.operationTimeoutMs,
          signal,
          env: {
            ...process.env,
            DSH_WECHAT_DIRECTORY_PATH_B64: Buffer.from(target, 'utf8').toString('base64'),
          },
        },
      )
      signal.throwIfAborted()
      return { ok: true, value: { path: target } }
    } catch (error) {
      signal.throwIfAborted()
      if (processExitCode(error) === 17) {
        return {
          ok: false,
          error: { code: 'directory-exists', path: target, message: '同名文件夹已经存在' },
        }
      }
      if (isChildTimeout(error)) {
        return createFailed(target, '网络盘响应超时，已停止创建请求')
      }
      return createFailed(target, '映射的网络位置当前不存在、离线或无权访问')
    }
  }
}

async function enumerateWindowsRoots(signal: AbortSignal): Promise<WechatDirectoryRoot[]> {
  // 固定脚本，不拼接任何客户端输入。Get-PSDrive 同时覆盖本地卷和映射网络盘，
  // 并过滤掉 Temp 等非盘符 FileSystem PSDrive。
  const script = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -match '^[A-Za-z]$' -and $_.Root -match '^[A-Za-z]:\\\\$' } | ForEach-Object {",
    "  [pscustomobject]@{ name = $_.Name.ToUpperInvariant(); path = $_.Root; displayRoot = $(if ($_.DisplayRoot) { [string]$_.DisplayRoot } else { $null }) }",
    '} | Sort-Object name | ConvertTo-Json -Compress',
  ].join('; ')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 8000, signal },
  )
  signal.throwIfAborted()

  const text = String(stdout).trim()
  if (!text) return []
  const decoded: unknown = JSON.parse(text)
  const rows: readonly PowerShellDrive[] = Array.isArray(decoded) ? decoded : [decoded as PowerShellDrive]
  const unique = new Map<string, WechatDirectoryRoot>()
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.path !== 'string') continue
    const name = row.name.toUpperCase()
    if (!/^[A-Z]$/.test(name) || !/^[A-Za-z]:[\\/]$/.test(row.path)) continue
    const rootPath = `${name}:\\`
    const displayRoot = typeof row.displayRoot === 'string' && row.displayRoot.trim()
      ? row.displayRoot
      : undefined
    unique.set(rootPath, {
      name: `${name}:`,
      path: rootPath,
      kind: displayRoot ? 'network' : 'local',
      ...(displayRoot ? { displayRoot } : {}),
    })
  }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function ancestryCrumbs(target: string): WechatDirectoryCrumb[] {
  const crumbs: WechatDirectoryCrumb[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    crumbs.unshift({
      name: parent === current ? current : basename(current),
      path: current,
      hidden: false,
    })
    if (parent === current) return crumbs
    current = parent
  }
}

async function directoryRow(
  parent: string,
  candidate: ListingCandidate,
  signal: AbortSignal,
): Promise<WechatDirectoryEntry | null> {
  const target = join(parent, candidate.name)
  if (!candidate.isDirectory && candidate.isSymbolicLink) {
    try {
      const info = await raceAbort(stat(target), signal)
      if (!info.isDirectory()) return null
    } catch (error) {
      signal.throwIfAborted()
      return null
    }
  }
  return {
    name: candidate.name,
    path: target,
    hidden: process.platform !== 'win32' && candidate.name.startsWith('.'),
  }
}

function unreadable(path: string, detail: string): WechatDirectoryListResult {
  return {
    ok: false,
    error: { code: 'directory-unreadable', path, message: `无法读取目录：${detail}` },
  }
}

function timedOut(path: string): WechatDirectoryListResult {
  return {
    ok: false,
    error: {
      code: 'directory-timeout',
      path,
      message: '网络盘响应超时，已停止读取；可以立即切换其他盘符',
    },
  }
}

function networkUnavailable(path: string): WechatDirectoryListResult {
  return {
    ok: false,
    error: {
      code: 'network-unavailable',
      path,
      message: '映射的网络位置当前不存在、离线或无权访问',
    },
  }
}

function createFailed(path: string, detail: string): WechatDirectoryCreateResult {
  return {
    ok: false,
    error: { code: 'directory-create-failed', path, message: `无法新建文件夹：${detail}` },
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function processExitCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function isChildTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as { readonly killed?: unknown; readonly signal?: unknown; readonly code?: unknown }
  return record.killed === true
    || record.code === 'ETIMEDOUT'
    || (typeof record.signal === 'string' && record.signal !== '')
}

function isNetworkEntry(value: unknown): value is { readonly name: string; readonly hidden?: boolean } {
  if (typeof value !== 'object' || value === null || !('name' in value)) return false
  const name = (value as { readonly name?: unknown }).name
  return typeof name === 'string' && name !== '' && !/[/\\]/.test(name)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function swallowCloseFailure(): void {}

export default WechatDirectoryService
