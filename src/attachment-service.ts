/**
 * WeChat-only acceleration for durable DSH image attachments.
 *
 * DSH's native `session.attachment` remains the authorization boundary and
 * source of truth. After that read succeeds, the plugin encrypts the bytes on
 * the Agent and stores only ciphertext in the private object service. The
 * returned descriptor is usable only by the paired mini program, which obtains
 * a short-lived download ticket through its authenticated control plane.
 *
 * This is an independent Typert Remote. It does not change the DSH/WebUI
 * `session.attachment` contract and it opens no additional port.
 */
import http from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

const MAX_BATCH_ATTACHMENTS = 6
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_NATIVE_RESPONSE_BYTES = Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 256 * 1024
const DEFAULT_TIMEOUT_MS = 60_000
const DESCRIPTOR_REFRESH_MARGIN_MS = 60_000
const MAX_DESCRIPTOR_CACHE = 128
const BATCH_CONCURRENCY = 2
const IMAGE_MEDIA_TYPE = /^image\/(png|jpeg|webp|gif)$/

export interface WechatAttachmentInput {
  readonly attachmentId: string
  readonly mediaType?: string
  readonly name?: string
}

export interface WechatAttachmentBatchRequest {
  readonly sessionId: string
  readonly attachments: readonly WechatAttachmentInput[]
}

export interface PreparedWechatAttachment {
  readonly attachmentId: string
  readonly descriptor: WechatAttachmentObjectDescriptor
}

export interface WechatAttachmentObjectDescriptor {
  readonly v: 1
  readonly scheme: 'xsalsa20-poly1305-chunks-v1'
  readonly objectId: string
  readonly key: string
  readonly noncePrefix: string
  readonly plainBytes: number
  readonly cipherBytes: number
  readonly chunkBytes: number
  readonly contentKind: 'image'
  readonly mediaType: string
  readonly name?: string
  readonly expiresAt: number
}

export interface WechatAttachmentError {
  readonly code:
    | 'invalid-attachment-request'
    | 'attachment-unavailable'
    | 'attachment-object-unavailable'
  readonly message: string
}

export type WechatAttachmentBatchResult =
  | { readonly ok: true; readonly value: { readonly descriptors: readonly PreparedWechatAttachment[] } }
  | { readonly ok: false; readonly error: WechatAttachmentError }

interface NativeAttachmentRef {
  readonly attachmentId?: unknown
  readonly mediaType?: unknown
  readonly bytes?: unknown
  readonly name?: unknown
}

interface NativeAttachmentResponse {
  readonly ok: boolean
  readonly value?: { readonly attachment?: NativeAttachmentRef; readonly data?: unknown }
  readonly error?: { readonly message?: unknown }
}

export interface WechatAttachmentConfig {
  readonly dshPort?: number
  readonly timeoutMs?: number
  readonly storeAttachment?: (
    data: Uint8Array,
    attachment: { readonly attachmentId: string; readonly mediaType: string; readonly name?: string },
    signal: AbortSignal,
  ) => Promise<WechatAttachmentObjectDescriptor>
  /** Pure-test seam; production always uses the native loopback API. */
  readonly readAttachment?: (
    sessionId: string,
    attachmentId: string,
    signal: AbortSignal,
  ) => Promise<NativeAttachmentResponse>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    wechatAttachment: WechatAttachmentService
  }
}

export class WechatAttachmentService extends TypertRemoteService {
  private readonly dshPort: number
  private readonly timeoutMs: number
  private readonly storeAttachment?: WechatAttachmentConfig['storeAttachment']
  private readonly readAttachmentOverride?: WechatAttachmentConfig['readAttachment']
  private readonly cache = new Map<string, {
    readonly descriptor: WechatAttachmentObjectDescriptor
    readonly expiresAt: number
  }>()
  private readonly pending = new Map<string, Promise<PreparedWechatAttachment>>()

  constructor(ctx: Context, config: WechatAttachmentConfig = {}) {
    super(ctx, 'wechatAttachment')
    this.dshPort = Number.isSafeInteger(config.dshPort) && Number(config.dshPort) > 0
      ? Number(config.dshPort)
      : 3080
    this.timeoutMs = Number.isSafeInteger(config.timeoutMs) && Number(config.timeoutMs) > 0
      ? Number(config.timeoutMs)
      : DEFAULT_TIMEOUT_MS
    this.storeAttachment = config.storeAttachment
    this.readAttachmentOverride = config.readAttachment
  }

  @Remote('prepareBatch')
  async prepareBatch(
    request: WechatAttachmentBatchRequest,
    signal: AbortSignal,
  ): Promise<WechatAttachmentBatchResult> {
    const validation = validateRequest(request)
    if (validation) return { ok: false, error: validation }
    if (!this.storeAttachment) {
      return {
        ok: false,
        error: {
          code: 'attachment-object-unavailable',
          message: '公网附件对象加速当前不可用，请回退 DSH 原生附件读取',
        },
      }
    }

    try {
      const output = new Array<PreparedWechatAttachment>(request.attachments.length)
      let cursor = 0
      const workers = Array.from(
        { length: Math.min(BATCH_CONCURRENCY, request.attachments.length) },
        async () => {
          while (cursor < request.attachments.length) {
            signal.throwIfAborted()
            const index = cursor
            cursor += 1
            output[index] = await this.prepareOne(request.sessionId, request.attachments[index], signal)
          }
        },
      )
      await Promise.all(workers)
      return { ok: true, value: { descriptors: output } }
    } catch (error) {
      signal.throwIfAborted()
      const unavailable = error instanceof ObjectTransportUnavailable
      return {
        ok: false,
        error: {
          code: unavailable ? 'attachment-object-unavailable' : 'attachment-unavailable',
          message: unavailable
            ? '公网附件对象加速当前不可用，请回退 DSH 原生附件读取'
            : messageOf(error),
        },
      }
    }
  }

  private async prepareOne(
    sessionId: string,
    requested: WechatAttachmentInput,
    signal: AbortSignal,
  ): Promise<PreparedWechatAttachment> {
    const cacheKey = `${sessionId}\0${requested.attachmentId}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() + DESCRIPTOR_REFRESH_MARGIN_MS) {
      return { attachmentId: requested.attachmentId, descriptor: cached.descriptor }
    }
    const active = this.pending.get(cacheKey)
    if (active) return await waitFor(active, signal)

    // Shared work uses its own deadline so one cancelled caller does not abort
    // another caller waiting for the same content-addressed attachment.
    const operationSignal = AbortSignal.timeout(this.timeoutMs)
    const operation = this.prepareFresh(sessionId, requested, operationSignal)
    this.pending.set(cacheKey, operation)
    void operation.finally(() => {
      if (this.pending.get(cacheKey) === operation) this.pending.delete(cacheKey)
    }).catch(() => { /* the waiting caller observes the original rejection */ })
    return await waitFor(operation, signal)
  }

  private async prepareFresh(
    sessionId: string,
    requested: WechatAttachmentInput,
    signal: AbortSignal,
  ): Promise<PreparedWechatAttachment> {
    const response = this.readAttachmentOverride
      ? await this.readAttachmentOverride(sessionId, requested.attachmentId, signal)
      : await this.fetchNativeAttachment(sessionId, requested.attachmentId, signal)
    if (!response.ok || !response.value) {
      throw new Error(typeof response.error?.message === 'string'
        ? response.error.message
        : 'DSH 原生附件读取失败')
    }
    const decoded = decodeNativeAttachment(response, requested)
    let descriptor: WechatAttachmentObjectDescriptor
    try {
      descriptor = await this.storeAttachment!(decoded.data, decoded.attachment, signal)
    } catch (error) {
      throw new ObjectTransportUnavailable(messageOf(error))
    }
    const expiresAt = descriptor.expiresAt
    if (!Number.isSafeInteger(expiresAt) || Number(expiresAt) <= Date.now()) {
      throw new ObjectTransportUnavailable('公网对象服务返回了无效的到期时间')
    }
    const cacheKey = `${sessionId}\0${requested.attachmentId}`
    this.cache.set(cacheKey, { descriptor, expiresAt: Number(expiresAt) })
    while (this.cache.size > MAX_DESCRIPTOR_CACHE) {
      const oldest = this.cache.keys().next().value as string | undefined
      if (!oldest) break
      this.cache.delete(oldest)
    }
    return { attachmentId: requested.attachmentId, descriptor }
  }

  private fetchNativeAttachment(
    sessionId: string,
    attachmentId: string,
    signal: AbortSignal,
  ): Promise<NativeAttachmentResponse> {
    const body = Buffer.from(JSON.stringify({
      type: 'client-request',
      rpcId: `wechat-attachment-${Date.now().toString(36)}`,
      method: 'session.attachment',
      payload: { sessionId, attachmentId },
    }))
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        callback()
      }
      const request = http.request({
        host: '127.0.0.1',
        port: this.dshPort,
        path: '/api/session.attachment',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': body.length,
          accept: 'application/json',
          'accept-encoding': 'identity',
          'user-agent': 'HarnessRemote-WechatAttachment/1',
        },
        timeout: this.timeoutMs,
      }, response => {
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > MAX_NATIVE_RESPONSE_BYTES) {
            response.destroy(new Error('DSH attachment response exceeds the 20 MiB limit'))
            return
          }
          chunks.push(Buffer.from(chunk))
        })
        response.on('end', () => {
          try {
            if (response.statusCode !== 200) throw new Error(`DSH attachment HTTP ${response.statusCode || 0}`)
            const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              readonly result?: NativeAttachmentResponse
            }
            if (!envelope.result || typeof envelope.result.ok !== 'boolean') {
              throw new Error('DSH attachment returned an invalid response')
            }
            finish(() => resolve(envelope.result as NativeAttachmentResponse))
          } catch (error) {
            finish(() => reject(error))
          }
        })
        response.on('error', error => finish(() => reject(error)))
      })
      const abort = (): void => { request.destroy(new Error('Attachment request aborted')) }
      signal.addEventListener('abort', abort, { once: true })
      request.on('timeout', () => request.destroy(new Error('DSH attachment request timed out')))
      request.on('error', error => finish(() => reject(error)))
      request.end(body)
    })
  }
}

/** Pure native-contract validator used by regression tests. */
export function decodeNativeAttachment(
  response: NativeAttachmentResponse,
  requested: WechatAttachmentInput,
): {
  readonly data: Uint8Array
  readonly attachment: { readonly attachmentId: string; readonly mediaType: string; readonly name?: string }
} {
  const ref = response.value?.attachment
  if (!response.ok || !ref || ref.attachmentId !== requested.attachmentId
    || typeof ref.mediaType !== 'string' || !IMAGE_MEDIA_TYPE.test(ref.mediaType)
    || !Number.isSafeInteger(ref.bytes) || Number(ref.bytes) < 1
    || Number(ref.bytes) > MAX_ATTACHMENT_BYTES
    || typeof response.value?.data !== 'string') {
    throw new Error('DSH 原生附件响应无效')
  }
  return {
    data: strictBase64(response.value.data, Number(ref.bytes)),
    attachment: {
      attachmentId: requested.attachmentId,
      mediaType: ref.mediaType,
      ...(typeof ref.name === 'string' && ref.name.length <= 255 ? { name: ref.name } : {}),
    },
  }
}

function validateRequest(request: WechatAttachmentBatchRequest): WechatAttachmentError | null {
  if (!request || !safeIdentifier(request.sessionId)) {
    return { code: 'invalid-attachment-request', message: '会话标识无效' }
  }
  if (!Array.isArray(request.attachments) || request.attachments.length < 1
    || request.attachments.length > MAX_BATCH_ATTACHMENTS) {
    return { code: 'invalid-attachment-request', message: '附件批次必须包含 1 至 6 张图片' }
  }
  const seen = new Set<string>()
  for (const item of request.attachments) {
    if (!item || !safeIdentifier(item.attachmentId) || seen.has(item.attachmentId)
      || (item.mediaType !== undefined && (typeof item.mediaType !== 'string' || !IMAGE_MEDIA_TYPE.test(item.mediaType)))
      || (item.name !== undefined && (typeof item.name !== 'string' || item.name.length > 255))) {
      return { code: 'invalid-attachment-request', message: '附件批次参数无效' }
    }
    seen.add(item.attachmentId)
  }
  return null
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value)
}

function strictBase64(value: string, expectedBytes: number): Uint8Array {
  if (value.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 8
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('DSH 原生附件数据编码无效')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== expectedBytes) throw new Error('DSH 原生附件长度不一致')
  return new Uint8Array(decoded)
}

async function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return await new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason || new Error('Attachment request aborted'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) },
    )
  })
}

class ObjectTransportUnavailable extends Error {}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || '附件读取失败')
}

export default WechatAttachmentService
