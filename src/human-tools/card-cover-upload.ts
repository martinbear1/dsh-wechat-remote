import { createHash } from 'node:crypto'
import { DEFAULT_TRUSTED_OBJECT_ORIGINS } from '../public-object-client.js'
import { fail, row } from '../human-workflow/data.js'
import type { CardCoverImage } from './card-cover-assets.js'

/** Only cloud-issued, same-object private OSS tickets. No model destination,
 * redirects, bearer headers or upload of files other than the pinned bytes. */
export function coverTransfer(value: unknown, method: 'GET' | 'PUT', image?: CardCoverImage, md5?: string): { url: string; headers: Record<string, string> }[] {
  if (!row(value) || value.alternatives !== undefined && (!Array.isArray(value.alternatives) || value.alternatives.length > 1)) throw fail('cover-ticket-invalid', '封面传输凭证无效')
  const entries = [value, ...(Array.isArray(value.alternatives) ? value.alternatives : [])].map(input => {
    if (!row(input) || typeof input.url !== 'string' || !Number.isSafeInteger(input.expiresIn) || Number(input.expiresIn) <= 0 || Number(input.expiresIn) > 300 || !row(input.headers)) throw fail('cover-ticket-invalid', '封面传输凭证无效')
    let url: URL; try { url = new URL(input.url) } catch { throw fail('cover-ticket-invalid', '封面传输地址无效') }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !DEFAULT_TRUSTED_OBJECT_ORIGINS.includes(url.origin)
      || !/^\/human-tasks\/[A-Za-z0-9_-]{24,64}\.bin$/.test(url.pathname)) throw fail('cover-ticket-invalid', '封面传输地址不受信任')
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(input.headers)) {
      const name = key.toLowerCase()
      if (method === 'GET' || Object.hasOwn(headers, name) || typeof value !== 'string'
        || !['content-type', 'content-length', 'content-md5', 'x-oss-forbid-overwrite'].includes(name)) throw fail('cover-ticket-invalid', '封面传输请求头无效')
      headers[name] = value
    }
    if (method === 'PUT' && (!image || headers['content-type'] !== image.mediaType || headers['content-length'] !== String(image.data.byteLength)
      || headers['content-md5'] !== md5 || headers['x-oss-forbid-overwrite'] !== 'true')) throw fail('cover-ticket-invalid', '封面上传摘要或大小不匹配')
    return { url: url.href, headers }
  })
  if (entries.length === 2 && (new URL(entries[0]!.url).pathname !== new URL(entries[1]!.url).pathname || new URL(entries[0]!.url).origin === new URL(entries[1]!.url).origin)) throw fail('cover-ticket-invalid', '封面备用地址必须指向同一对象')
  return entries
}
export async function uploadCardCover(ticket: unknown, image: CardCoverImage, md5: string, signal: AbortSignal, fetcher = fetch): Promise<void> {
  if (createHash('md5').update(image.data).digest('base64') !== md5) throw fail('cover-image-invalid', '封面上传前图片已变化')
  const entries = coverTransfer(ticket, 'PUT', image, md5)
  // One PUT admission per invocation. An uncertain response is reconciled by
  // finalize rather than blindly writing an alternate route or a new object.
  const entry = entries[0]!, active = AbortSignal.any([signal, AbortSignal.timeout(60_000)])
  try {
    const response = await fetcher(entry.url, { method: 'PUT', headers: entry.headers, body: Buffer.from(image.data), redirect: 'error', signal: active })
    await response.body?.cancel(); signal.throwIfAborted()
    if (!response.ok && response.status !== 409) throw fail('cover-upload-unavailable', '封面上传未确认，请核对原准备操作')
  } catch (cause) {
    signal.throwIfAborted()
    if (row(cause) && cause.code === 'cover-upload-unavailable') throw cause
    // Timeout/transport loss can happen after OSS committed. Caller finalizes
    // this exact asset, never treats a missing response as successful publish.
  }
}
