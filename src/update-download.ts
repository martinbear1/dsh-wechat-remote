import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { trustedReleaseAsset, trustedNpmInstaller, type Release } from './update-policy.js'

/** Only availability failures permit changing source or using an eligible bundle.
 * Integrity, policy, cancellation and archive errors must never take that route. */
export class DownloadUnavailableError extends Error {
  constructor(message = '更新包暂时无法下载，请检查网络后重试；当前插件尚未替换', options?: ErrorOptions) {
    super(message, options); this.name = 'DownloadUnavailableError'
  }
}
export interface DownloadOptions {
  signal?: AbortSignal
  // Shared deadline across redirects and both sources, not a new budget per hop.
  timeoutMs?: number
  responseTimeoutMs?: number
  idleTimeoutMs?: number
}
const githubHosts = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']

async function fetchBytes(url: string, maxBytes: number, fetcher: typeof fetch,
  hosts: string[], deadline: number, options: DownloadOptions): Promise<Buffer> {
  let next = url
  for (let i = 0; i < 5; i++) {
    options.signal?.throwIfAborted()
    const u = new URL(next)
    if (u.protocol !== 'https:' || u.username || u.password || u.port
        || !hosts.includes(u.hostname)) throw new Error('更新下载来源不受信任')
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new DownloadUnavailableError()
    const controller = new AbortController()
    const cancel = () => controller.abort(options.signal!.reason)
    options.signal?.addEventListener('abort', cancel, { once: true })
    const totalTimer = setTimeout(() => controller.abort(new Error('更新下载超时')), remaining)
    let activityTimer = setTimeout(() => controller.abort(new Error('更新来源响应超时')), Math.min(remaining, options.responseTimeoutMs ?? 10000))
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      let res: Response
      try { res = await fetcher(next, { signal: controller.signal, redirect: 'manual' }) }
      catch (cause) { options.signal?.throwIfAborted(); throw new DownloadUnavailableError(undefined, { cause }) }
      finally { clearTimeout(activityTimer) }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel()
        const location = res.headers.get('location')
        if (!location) throw new Error('更新来源重定向无效')
        next = new URL(location, next).href
        continue
      }
      if (!res.ok || !res.body) { await res.body?.cancel(); throw new DownloadUnavailableError() }
      if (Number(res.headers.get('content-length')) > maxBytes) { await res.body.cancel(); throw new Error('更新响应超过大小限制') }
      reader = res.body.getReader()
      // Headers alone do not mean a download is progressing. Reset this one
      // timer on actual bytes, so stalled bodies switch sources promptly while
      // slow but active transfers retain the existing overall time budget.
      activityTimer = setTimeout(() => controller.abort(new Error('更新下载长时间没有进展')), options.idleTimeoutMs ?? 15000)
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        let part: ReadableStreamReadResult<Uint8Array>
        try { part = await reader.read() }
        catch (cause) { options.signal?.throwIfAborted(); throw new DownloadUnavailableError(undefined, { cause }) }
        const { done, value } = part
        if (done) break
        size += value.length
        if (size > maxBytes) throw new Error('更新响应超过大小限制')
        chunks.push(value)
        if (value.length) activityTimer.refresh()
      }
      options.signal?.throwIfAborted()
      return Buffer.concat(chunks)
    } catch (error) { try { await reader?.cancel() } catch {} throw error }
    finally {
      clearTimeout(totalTimer); clearTimeout(activityTimer)
      options.signal?.removeEventListener('abort', cancel)
      reader?.releaseLock()
    }
  }
  throw new Error('更新来源重定向过多')
}

export async function boundedFetch(url: string, maxBytes: number, fetcher = fetch): Promise<Buffer> {
  // Catalog/legacy helper keeps its existing trust boundary. npm is allowed ONLY
  // by the explicit installer download path below, not by broadening this helper.
  return fetchBytes(url, maxBytes, fetcher, [...githubHosts, 'relay.xyxfood.xyz'],
    Date.now() + (maxBytes <= 256 * 1024 ? 10000 : 60000), {})
}

function verifyBytes(archive: Buffer, expected: { bytes: number; sha256: string } | undefined): void {
  if (!expected || archive.length !== expected.bytes
      || createHash('sha256').update(archive).digest('hex') !== expected.sha256) throw new Error('更新包校验失败，未修改当前插件')
}

/** One bounded tar reader for both artifacts. No filesystem extraction or execution. */
function visitArchive(archive: Buffer, visit: (name: string, data: Buffer) => void): Set<string> {
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 })
  if (tar.length % 512 !== 0) throw new Error('更新包记录不完整')
  const seen = new Set<string>(), files = new Set<string>()
  let entries = 0, ended = false
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(b => b === 0)) {
      if (tar.subarray(offset).some(b => b !== 0)) throw new Error('更新包结束标记无效')
      ended = true; break
    }
    if (++entries > 5000) throw new Error('更新包文件数量异常')
    const field = (start: number, size: number) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '')
    const name = (field(345, 155) ? field(345, 155) + '/' : '') + field(0, 100)
    const type = field(156, 1)
    const sizeText = field(124, 12).trim()
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('更新包大小字段无效')
    const size = parseInt(sizeText, 8)
    const sumText = field(148, 8).trim()
    const sum = [...header].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0)
    if (!/^[0-7]+$/.test(sumText) || parseInt(sumText, 8) !== sum) throw new Error('更新包头校验失败')
    if (!name.startsWith('package/') || /[\\:\x00-\x1f]/.test(name)
        || name.split('/').some(part => part === '..' || part === '.')
        || name.split('/').some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
        || !['0', '', '5'].includes(type) || seen.has(name.toLowerCase())
        || !Number.isSafeInteger(size) || size < 0 || (type === '5' && size !== 0)
        || offset + 512 + Math.ceil(size / 512) * 512 > tar.length) throw new Error('更新包包含不安全的路径或文件类型')
    seen.add(name.toLowerCase())
    if (type !== '5') {
      files.add(name)
      visit(name, tar.subarray(offset + 512, offset + 512 + size))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (!ended) throw new Error('更新包缺少结束标记')
  return files
}
function readManifest(data: Buffer): Record<string, unknown> {
  if (data.length > 65536) throw new Error('更新包清单过大')
  return JSON.parse(data.toString('utf8'))
}

/** Audit the plugin BEFORE any package manager sees it. */
export function auditArchive(archive: Buffer, release: Release): void {
  verifyBytes(archive, release.asset)
  let manifest: Record<string, unknown> | undefined
  const files = visitArchive(archive, (name, data) => {
    if (name === 'package/package.json') manifest = readManifest(data)
  })
  if (!manifest || manifest.name !== '@harness-remote/dsh-wechat-remote' || manifest.version !== release.version
      || !files.has('package/lib/index.js') || !files.has('package/lib/client.js')) throw new Error('更新包名称、版本或入口不匹配')
  const scripts = manifest.scripts as Record<string, string> | undefined
  if (['preinstall', 'install', 'postinstall', 'prepare'].some(name => scripts?.[name])) throw new Error('更新包包含不允许的安装脚本')
}

export function pluginFromInstaller(archive: Buffer, release: Release): Buffer {
  if (!trustedNpmInstaller(release.npmInstaller)) throw new Error('备用安装包来源不受信任')
  verifyBytes(archive, release.npmInstaller)
  let manifest: Record<string, unknown> | undefined, plugin: Buffer | undefined
  visitArchive(archive, (name, data) => {
    if (name === 'package/package.json') manifest = readManifest(data)
    if (name === 'package/assets/plugin.tgz') {
      if (data.length !== release.asset?.bytes) throw new Error('内置插件大小不匹配')
      // Copy only the payload so the outer ~50 MiB tar can be released before
      // inner auditing. Never execute the installer or unpack it to disk.
      plugin = Buffer.from(data)
    }
  })
  if (!manifest || manifest.name !== 'dsh-wechat-remote' || manifest.version !== release.npmInstaller!.version || !plugin) throw new Error('备用安装包名称、版本或内置插件不匹配')
  auditArchive(plugin, release)
  return plugin
}

/** Also used by the publication gate to verify the alternate independently. */
export async function downloadNpmRelease(release: Release, fetcher = fetch, options: DownloadOptions = {}): Promise<Buffer> {
  if (!trustedReleaseAsset(release.asset, release.version) || !trustedNpmInstaller(release.npmInstaller)) throw new Error('备用安装包来源不受信任')
  const source = release.npmInstaller!
  const body = await fetchBytes(source.url, source.bytes, fetcher, ['registry.npmjs.org'], Date.now() + (options.timeoutMs ?? 60000), options)
  options.signal?.throwIfAborted()
  return pluginFromInstaller(body, release)
}

export async function downloadRelease(release: Release, fetcher = fetch, options: DownloadOptions = {}): Promise<Buffer> {
  if (!trustedReleaseAsset(release.asset, release.version)) throw new Error('暂无可验证的正式更新包')
  if (release.npmInstaller !== undefined && !trustedNpmInstaller(release.npmInstaller)) throw new Error('备用安装包来源不受信任')
  const deadline = Date.now() + (options.timeoutMs ?? 120000)
  let body: Buffer
  try {
    body = await fetchBytes(release.asset!.url, release.asset!.bytes, fetcher, githubHosts,
      Math.min(deadline, Date.now() + 60000), options)
  } catch (error) {
    options.signal?.throwIfAborted()
    if (!(error instanceof DownloadUnavailableError) || !release.npmInstaller) throw error
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw error
    return downloadNpmRelease(release, fetcher, { ...options, timeoutMs: Math.min(remaining, 60000) })
  }
  // Integrity failure does NOT switch sources; only transport failures do.
  auditArchive(body, release)
  return body
}
