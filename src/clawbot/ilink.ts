/**
 * Adapted from Tencent/openclaw-weixin 24de5c9 (MIT).
 * Copyright (C) 2026 Tencent. See THIRD-PARTY-NOTICES/clawbot.txt.
 *
 * This adapter implements HTTP transport, not OpenClaw routing or agent execution.
 * Resource caps and URL restrictions below are local policy, not iLink guarantees.
 * There is no assumption about token TTL, concurrent consumers or exactly-once delivery.
 */
import { randomBytes } from 'node:crypto'
import { ILinkError } from './ilink-types.js'
import type { ILinkCredentials, ILinkMessage, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js'
export { ILinkError } from './ilink-types.js'
export type { ILinkCredentials, ILinkMessage, ILinkQrResult, ILinkText, ILinkUpdates } from './ilink-types.js'

const API_BASE = 'https://ilinkai.weixin.qq.com'
// Wire compatibility version of the extracted upstream code, not this plugin's version.
const CHANNEL_VERSION = '2.4.9'
const CLIENT_VERSION = String((2 << 16) | (4 << 8) | 9)
const BASE_INFO = { channel_version: CHANNEL_VERSION, bot_agent: 'DSHRemote/1.0.0' }
const API_TIMEOUT_MS = 15_000
const POLL_TIMEOUT_MS = 35_000
const MAX_POLL_TIMEOUT_MS = 60_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_MESSAGES = 100
const MAX_TEXT_BYTES = 256 * 1024
const MAX_CURSOR_BYTES = 64 * 1024
const MAX_QR_SESSIONS = 8
const MAX_QR_REDIRECTS = 3
type JsonObject = Record<string, unknown>
type QrState = { baseUrl: string; redirects: number }

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalid(message = '微信返回了无法识别的数据'): never {
  throw new ILinkError('clawbot-invalid-response', message)
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.trim().length > 0)
    && Buffer.byteLength(value, 'utf8') <= maximum
}

function identifier(value: unknown): value is string {
  return boundedString(value, 256) && !/[\s\x00-\x1f\x7f]/u.test(value)
}

function privateUser(value: unknown): value is string {
  return identifier(value) && value.endsWith('@im.wechat')
}

function messageId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/u.test(value) && BigInt(value) <= 0xffffffffffffffffn
}

function secret(value: unknown): value is string {
  return boundedString(value, 16 * 1024) && !/[\s\x00-\x1f\x7f]/u.test(value)
}

function safeUrl(value: unknown, purpose: 'api' | 'qr'): string {
  if (!boundedString(value, 8192) || value !== value.trim() || /[\x00-\x20\x7f\\]/u.test(value)) {
    throw new ILinkError('clawbot-untrusted-url', '微信返回的地址不在允许范围内')
  }
  let parsed: URL
  try { parsed = new URL(value) } catch {
    throw new ILinkError('clawbot-untrusted-url', '微信返回的地址不在允许范围内')
  }
  const root = purpose === 'api' ? 'ilinkai.weixin.qq.com' : 'weixin.qq.com'
  const trusted = parsed.hostname === root || parsed.hostname.endsWith(`.${root}`)
  if (!trusted || parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password
      || parsed.hash || (purpose === 'api' && (parsed.pathname !== '/' || parsed.search))) {
    throw new ILinkError('clawbot-untrusted-url', '微信返回的地址不在允许范围内')
  }
  // QR links are only displayed/encoded. This does not promise same-phone navigation.
  return purpose === 'api' ? parsed.origin : parsed.href
}

function credentials(value: ILinkCredentials): string {
  if (!object(value) || !secret(value.token) || !identifier(value.accountId) || !privateUser(value.userId)) {
    throw new ILinkError('clawbot-invalid-input', '微信连接凭据不完整，请重新连接')
  }
  return safeUrl(value.baseUrl, 'api')
}

function checkApiResult(body: JsonObject, requireSuccess: boolean): void {
  for (const key of ['ret', 'errcode']) {
    if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isSafeInteger(body[key]))) invalid()
  }
  if (body.ret === -14 || body.errcode === -14) {
    throw new ILinkError('clawbot-auth-expired', '微信连接已失效，请重新连接', -14)
  }
  const failure = [body.ret, body.errcode].find((code) => typeof code === 'number' && code !== 0)
  if (typeof failure === 'number') {
    throw new ILinkError('clawbot-api-error', '微信暂未接受此请求', failure)
  }
  if (requireSuccess && body.ret !== 0) invalid('微信没有返回明确的成功结果')
}

/** Keep uint64 message IDs exact, following the upstream scanner before JSON.parse. */
function parseJson(raw: string): unknown {
  const idFields = new Set(['message_id', 'msg_id', 'svr_id'])
  let output = '', index = 0
  while (index < raw.length) {
    if (raw[index] !== '"') { output += raw[index++]; continue }
    const start = index++
    let escaped = false
    while (index < raw.length) {
      const char = raw[index++]
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') break
    }
    const token = raw.slice(start, index)
    output += token
    let cursor = index
    while (/\s/u.test(raw[cursor] ?? '')) cursor++
    if (raw[cursor] !== ':') continue
    const key: unknown = JSON.parse(token)
    if (typeof key !== 'string' || !idFields.has(key)) continue
    output += raw.slice(index, cursor + 1)
    cursor++
    while (/\s/u.test(raw[cursor] ?? '')) output += raw[cursor++]
    const numberStart = cursor
    if (raw[cursor] === '-') cursor++
    while (/\d/u.test(raw[cursor] ?? '')) cursor++
    if (cursor > numberStart && !(cursor === numberStart + 1 && raw[numberStart] === '-')) {
      const digits = raw.slice(numberStart, cursor)
      // Prevent invalid JSON numbers (e.g. 01) from becoming valid quoted strings.
      if (!/^-?(?:0|[1-9]\d*)$/u.test(digits)) invalid()
      output += `"${digits}"`
      index = cursor
    } else index = numberStart
  }
  return JSON.parse(output)
}

async function readJson(response: Response, signal: AbortSignal): Promise<JsonObject> {
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel()
    throw new ILinkError('clawbot-response-too-large', '微信响应超过本地处理上限')
  }
  if (!response.body) invalid()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const onAbort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new ILinkError('clawbot-response-too-large', '微信响应超过本地处理上限')
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    const result = parseJson(decoded)
    if (!object(result)) invalid()
    return result
  } catch (error) {
    if (error instanceof ILinkError) throw error
    invalid()
  }
}

function normalizeMessage(value: unknown): ILinkMessage | undefined {
  if (!object(value)) invalid()
  if (value.group_id !== undefined && value.group_id !== null && typeof value.group_id !== 'string') invalid()
  // Explicitly exclude group events and bot echoes; never execute them as a direct user command.
  if ((typeof value.group_id === 'string' && value.group_id !== '') || value.message_type === 2) return undefined
  if (value.message_type !== 1 || !privateUser(value.from_user_id) || !secret(value.context_token)) invalid()
  if (!Array.isArray(value.item_list) || value.item_list.length === 0 || value.item_list.length > 100) invalid()
  const items = value.item_list
  if (items.some((item) => !object(item))) invalid()
  const id = value.message_id ?? items.find((item) => messageId(item.msg_id))?.msg_id
  if (!messageId(id)) invalid('微信消息缺少有效标识，已停止处理此批消息')
  const text: string[] = []
  let unsupported = false
  for (const item of items) {
    if (typeof item.type !== 'number' || !Number.isSafeInteger(item.type)) invalid()
    if (item.type === 1) {
      if (!object(item.text_item) || !boundedString(item.text_item.text, MAX_TEXT_BYTES, true)) invalid()
      text.push(item.text_item.text)
    } else unsupported = true
  }
  const joined = text.join('\n')
  if (!boundedString(joined, MAX_TEXT_BYTES, true)) invalid()
  if (!joined.trim()) unsupported = true
  return { id, userId: value.from_user_id, contextToken: value.context_token, text: joined,
    ...(unsupported ? { unsupported: true } : {}) }
}

export class ILinkClient {
  private readonly fetchImpl: typeof fetch
  private readonly qrStates = new Map<string, QrState>()
  // Only a timeout hint is retained; credentials, user content and verification codes are not cached.
  private nextPollTimeout = POLL_TIMEOUT_MS

  constructor(options: { fetch?: typeof fetch } = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request(baseUrl: string, endpoint: string, options: {
    body?: JsonObject; token?: string; signal?: AbortSignal; timeoutMs?: number; requireSuccess?: boolean
  }): Promise<JsonObject> {
    options.signal?.throwIfAborted()
    const url = new URL(endpoint, `${safeUrl(baseUrl, 'api')}/`).href
    const controller = new AbortController()
    const forwardAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', forwardAbort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? API_TIMEOUT_MS)
    const headers: Record<string, string> = {
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': CLIENT_VERSION,
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers.AuthorizationType = 'ilink_bot_token'
      headers['X-WECHAT-UIN'] = Buffer.from(String(randomBytes(4).readUInt32BE()), 'utf8').toString('base64')
      if (options.token) headers.Authorization = `Bearer ${options.token}`
    }
    try {
      const response = await this.fetchImpl(url, { method: options.body === undefined ? 'GET' : 'POST',
        headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        redirect: 'error', signal: controller.signal })
      controller.signal.throwIfAborted()
      if (response.redirected || (response.status >= 300 && response.status < 400)
          || (response.url && response.url !== url)) {
        await response.body?.cancel()
        throw new ILinkError('clawbot-untrusted-url', '微信接口发生了不允许的跳转')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new ILinkError(response.status === 401 || response.status === 403
          ? 'clawbot-auth-expired' : 'clawbot-http-error', '微信接口请求失败', undefined, response.status)
      }
      const body = await readJson(response, controller.signal)
      checkApiResult(body, options.requireSuccess ?? false)
      return body
    } catch (error) {
      options.signal?.throwIfAborted()
      if (timedOut) throw new ILinkError('clawbot-timeout', '等待微信响应超时')
      if (error instanceof ILinkError) throw error
      throw new ILinkError('clawbot-network-error', '暂时无法连接微信，请稍后重试')
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', forwardAbort)
    }
  }

  async getQr(signal?: AbortSignal, localTokens: string[] = []): Promise<{ qrcode: string; url: string }> {
    if (!Array.isArray(localTokens)) throw new ILinkError('clawbot-invalid-input', '本地微信凭据列表无效')
    // Caller supplies only this node's tokens, oldest first. Match upstream's
    // most-recent-first list, bounded to ten; never inspect another application's store.
    const recentTokens: string[] = []
    for (let index = localTokens.length - 1; index >= 0 && recentTokens.length < 10; index--) {
      const token = typeof localTokens[index] === 'string' ? localTokens[index].trim() : ''
      if (secret(token)) recentTokens.push(token)
    }
    const body = await this.request(API_BASE, 'ilink/bot/get_bot_qrcode?bot_type=3', {
      body: { local_token_list: recentTokens }, signal,
    })
    if (!secret(body.qrcode)) invalid()
    const url = safeUrl(body.qrcode_img_content, 'qr')
    // Bound abandoned local login state; this is not the provider's QR expiration policy.
    if (this.qrStates.size >= MAX_QR_SESSIONS) this.qrStates.delete(this.qrStates.keys().next().value!)
    this.qrStates.set(body.qrcode, { baseUrl: API_BASE, redirects: 0 })
    return { qrcode: body.qrcode, url }
  }

  async pollQr(qrcode: string, signal?: AbortSignal, verifyCode?: string): Promise<ILinkQrResult> {
    if (!secret(qrcode) || (verifyCode !== undefined && !/^\d{1,16}$/u.test(verifyCode))) {
      throw new ILinkError('clawbot-invalid-input', '微信连接参数不完整或验证码格式不正确')
    }
    const state = this.qrStates.get(qrcode)
    if (!state) throw new ILinkError('clawbot-invalid-input', '请重新获取微信连接二维码')
    let body: JsonObject
    try {
      const query = `qrcode=${encodeURIComponent(qrcode)}`
        + (verifyCode === undefined ? '' : `&verify_code=${encodeURIComponent(verifyCode)}`)
      body = await this.request(state.baseUrl, `ilink/bot/get_qrcode_status?${query}`, {
        signal, timeoutMs: POLL_TIMEOUT_MS,
      })
    } catch (error) {
      if (error instanceof ILinkError && error.code === 'clawbot-timeout') return { status: 'wait' }
      throw error
    }
    const status = body.status
    if (status === 'scaned_but_redirect') {
      if (!boundedString(body.redirect_host, 253) || !/^[a-zA-Z0-9.-]+$/u.test(body.redirect_host)) invalid()
      const baseUrl = safeUrl(`https://${body.redirect_host}`, 'api')
      if (++state.redirects > MAX_QR_REDIRECTS) invalid('微信连接跳转次数超过本地上限')
      state.baseUrl = baseUrl
      return { status, message: '正在继续微信确认流程' }
    }
    if (status === 'confirmed') {
      if (!secret(body.bot_token) || !identifier(body.ilink_bot_id) || !privateUser(body.ilink_user_id)) invalid()
      const result: ILinkCredentials = { token: body.bot_token, accountId: body.ilink_bot_id,
        userId: body.ilink_user_id, baseUrl: safeUrl(body.baseurl ?? state.baseUrl, 'api') }
      this.qrStates.delete(qrcode)
      return { status, credentials: result }
    }
    const messages: Record<string, string> = {
      wait: '请用手机微信扫描二维码并确认连接',
      scaned: '请继续完成手机微信中的确认',
      need_verifycode: '请输入手机微信显示的数字验证码',
      verify_code_blocked: '验证码尝试次数过多，请重新获取二维码',
      expired: '二维码已失效，请重新获取',
      binded_redirect: '微信提示已连接，请使用已有连接或重新发起连接',
    }
    if (typeof status !== 'string' || !Object.hasOwn(messages, status)) invalid('微信返回了未知的连接状态')
    if (['expired', 'verify_code_blocked', 'binded_redirect'].includes(status)) this.qrStates.delete(qrcode)
    return { status, message: messages[status] }
  }

  /** Forget an ended local attempt; never calls an account-unbind endpoint. */
  forgetQr(qrcode: string): void { this.qrStates.delete(qrcode) }

  async getUpdates(auth: ILinkCredentials, cursor: string, signal?: AbortSignal): Promise<ILinkUpdates> {
    const baseUrl = credentials(auth)
    if (!boundedString(cursor, MAX_CURSOR_BYTES, true)) throw new ILinkError('clawbot-invalid-input', '微信消息游标无效')
    let body: JsonObject
    try {
      body = await this.request(baseUrl, 'ilink/bot/getupdates', { body: {
        get_updates_buf: cursor, base_info: { ...BASE_INFO },
      }, token: auth.token, signal, timeoutMs: this.nextPollTimeout, requireSuccess: true })
    } catch (error) {
      if (error instanceof ILinkError && error.code === 'clawbot-timeout') return { cursor, messages: [] }
      throw error
    }
    if (body.get_updates_buf !== undefined && !boundedString(body.get_updates_buf, MAX_CURSOR_BYTES, true)) invalid()
    if (body.msgs !== undefined && (!Array.isArray(body.msgs) || body.msgs.length > MAX_MESSAGES)) invalid('微信消息批次超过本地处理上限')
    const hint = body.longpolling_timeout_ms
    if (hint !== undefined) {
      if (typeof hint !== 'number' || !Number.isSafeInteger(hint) || hint <= 0) invalid()
      this.nextPollTimeout = Math.min(hint, MAX_POLL_TIMEOUT_MS)
    }
    // Validate the entire batch before returning its cursor; never silently truncate it.
    const messages = ((body.msgs ?? []) as unknown[]).map(normalizeMessage)
      .filter((message): message is ILinkMessage => message !== undefined)
    return { cursor: body.get_updates_buf ? body.get_updates_buf as string : cursor, messages }
  }

  async sendText(auth: ILinkCredentials, text: ILinkText, signal?: AbortSignal): Promise<void> {
    const baseUrl = credentials(auth)
    if (!object(text) || !privateUser(text.userId) || !identifier(text.clientId)
        || !secret(text.contextToken) || !boundedString(text.text, MAX_TEXT_BYTES)) {
      throw new ILinkError('clawbot-invalid-input', '微信消息缺少收件人、上下文或有效文本')
    }
    // A failed/ambiguous send is returned to the caller; transport never retries a write.
    await this.request(baseUrl, 'ilink/bot/sendmessage', { token: auth.token, signal, requireSuccess: true,
      body: { msg: { from_user_id: '', to_user_id: text.userId, client_id: text.clientId,
        message_type: 2, message_state: 2, context_token: text.contextToken,
        item_list: [{ type: 1, text_item: { text: text.text } }] }, base_info: { ...BASE_INFO } },
    })
  }
}
