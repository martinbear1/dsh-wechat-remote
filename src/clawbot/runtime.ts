import { createHash, randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { ClawbotError, type ClawbotHost, type ClawbotRequest, type ClawbotStatus } from './contracts.js'
import { ILinkClient } from './ilink.js'
import type { ILinkMessage, ILinkQrResult } from './ilink-types.js'
import type { ClawbotData, ClawbotStorage, Receipt } from './storage.js'
import { validateClawbotData } from './storage.js'

const RETENTION = 7 * 86400_000 // Local deduplication window, not a Tencent guarantee.
const MAX_RECEIPTS = 1000
const MAX_INPUT = 8000
const MAX_OUTPUT = 12000
const LOGIN_LIFETIME = 5 * 60_000 // Local attempt limit, not a Tencent expiry guarantee.
const activeLoginStatus = (status: string) => ['wait', 'scaned', 'scaned_but_redirect', 'need_verifycode'].includes(status)
const terminal = (r: Receipt) => r.state === 'done' || r.state === 'uncertain'
const fail = (code: string, message: string): never => { throw new ClawbotError(code, message) }
type Login = { id: string; qrcode: string; url: string; qrDataUrl: string; status: string; started: number; abort: AbortController }

/** Independently owned channel. No phone connection, relay account, model tool,
 * native preset mutation, or host process lifecycle is used here. */
export class ClawbotRuntime {
  private data: ClawbotData
  private readonly lifetime = new AbortController()
  private polling?: AbortController
  private pollTask?: Promise<void>
  private worker?: Promise<void>
  private commandWorker?: Promise<void>
  private deliveryWorker?: Promise<void>
  private broken = false
  private login?: Login
  private loginPoll?: { login: Login; abort: AbortController; verifying: boolean }
  private message = ''
  private state: ClawbotStatus['state'] = 'disabled'
  private closed = false
  private commandQueue: Promise<unknown> = Promise.resolve()
  constructor(private readonly storage: ClawbotStorage, private readonly host: ClawbotHost,
    private readonly client = new ILinkClient(), private readonly now = Date.now) {
    this.data = storage.read()
    // A hot component reload may retain the phone/gateway connection epoch but
    // never restores an in-memory QR attempt. Fence all prior instance replies.
    if (this.data.revision > 0) this.commit(d => { d.revision++ })
    // After an interrupted process, neither a host dispatch nor a provider
    // delivery can safely be repeated just because its acknowledgement is lost.
    if (this.data.receipts.some(r => r.state === 'running' || r.state === 'sending')) {
      this.commit(d => { for (const r of d.receipts) if (r.state === 'running' || r.state === 'sending') {
        r.state = 'uncertain'; r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
      } })
      this.message = '有上次中断的处理或发送，未自动重试，请在原会话核对。'
    }
    this.resume()
  }
  private commit(change: (next: ClawbotData) => void): void {
    const next = structuredClone(this.data)
    change(next)
    validateClawbotData(next)
    this.storage.write(next)
    this.data = next
  }
  private checkRevision(request: ClawbotRequest): void {
    if (request.expectedRevision !== this.data.revision)
      fail('clawbot-conflict', '状态已经变化，请刷新后再操作。')
  }
  snapshot(): ClawbotStatus {
    this.expireLogin()
    return { supported: true, revision: this.data.revision, enabled: this.data.enabled,
      state: !this.data.enabled ? 'disabled' : !this.data.credentials ? 'unpaired' : this.state,
      paired: Boolean(this.data.credentials), bindingState: !this.data.credentials ? 'unpaired' : this.data.authExpired ? 'expired' : 'paired',
      target: this.data.target && { ...this.data.target }, message: this.message,
      pending: this.data.receipts.filter(r => !terminal(r)).length,
      uncertain: this.data.receipts.filter(r => r.state === 'uncertain').length,
      ...(this.login ? { pairing: { id: this.login.id, url: this.login.url, qrDataUrl: this.login.qrDataUrl,
        status: this.login.status, expiresAt: this.login.started + LOGIN_LIFETIME } } : {}) }
  }
  private endLogin(login: Login): void {
    login.abort.abort()
    this.client.forgetQr?.(login.qrcode)
    login.url = ''; login.qrDataUrl = ''; login.qrcode = ''
  }
  private expireLogin(): void {
    const login = this.login
    if (login && activeLoginStatus(login.status) && this.now() >= login.started + LOGIN_LIFETIME) {
      this.commit(d => { d.revision++ })
      login.status = 'expired'; this.endLogin(login)
      this.message = '二维码已过期，请重新生成。'
    }
  }
  async control(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotStatus | { sessions: { id: string; title: string }[] }> {
    if (!request || typeof request.action !== 'string') fail('clawbot-invalid', '无效的 ClawBot 操作')
    signal.throwIfAborted()
    if (this.closed) fail('clawbot-stopped', 'ClawBot 组件已停用')
    if (request.action === 'status') return this.snapshot()
    if (request.action === 'sessions') return { sessions: await this.host.listSessions(signal) }
    if (request.action === 'login.poll') return this.mutate(request, signal)
    const activeLogin = this.login
    if (request.action === 'login.cancel' && activeLogin && activeLogin.id === request.loginId) activeLogin.abort.abort()
    // Serializes control mutations but never a long-running DSH turn.
    const task = this.commandQueue.then(() => this.mutate(request, signal))
    this.commandQueue = task.catch(() => {})
    return task
  }
  private async mutate(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotStatus> {
    signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
    switch (request.action) {
      case 'route': {
        this.checkRevision(request)
        if (!request.sessionId) fail('clawbot-invalid', '请选择会话')
        const found = await this.host.describeSession(request.sessionId!, signal)
        signal.throwIfAborted(); this.lifetime.signal.throwIfAborted(); this.checkRevision(request)
        if (!found) fail('clawbot-session-missing', '此会话已不可选择，请刷新列表。')
        this.commit(d => { d.target = found!; d.revision++ })
        break
      }
      case 'enabled': {
        this.checkRevision(request)
        if (typeof request.enabled !== 'boolean') fail('clawbot-invalid', '请指定开启或暂停')
        this.expireLogin()
        if (request.enabled && this.login && activeLoginStatus(this.login.status)) fail('clawbot-login-active', '请先完成或取消微信配对。')
        if (request.enabled && !this.data.credentials) fail('clawbot-unpaired', '请先配对微信。')
        if (request.enabled && this.data.authExpired) fail('clawbot-auth-expired', '微信连接已失效，请重新配对。')
        if (request.enabled && !this.data.target) fail('clawbot-target-required', '请先选择一个会话。')
        this.commit(d => { d.enabled = request.enabled!; d.revision++ })
        if (this.login && !activeLoginStatus(this.login.status)) this.login = undefined
        if (request.enabled) { this.message = ''; this.resume() }
        else { this.polling?.abort(); this.message = '已暂停接入；DSH 中已经开始的任务不会被取消。' }
        break
      }
      case 'login.start': {
        if (request.expectedRevision !== undefined) this.checkRevision(request)
        this.expireLogin()
        // Both control surfaces observe the same attempt. Merely opening the
        // second surface must not rotate a QR that is already being scanned.
        if (this.login && activeLoginStatus(this.login.status)) return this.snapshot()
        if (this.data.enabled && this.data.credentials) fail('clawbot-busy', '请先暂停接入，再重新配对。')
        // Repair the old enabled-without-credentials dead end without touching a
        // running identity or changing the user's eventual start preference.
        if (this.data.enabled) this.commit(d => { d.enabled = false; d.revision++ })
        const abort = new AbortController()
        const combined = AbortSignal.any([signal, this.lifetime.signal, abort.signal])
        const qr = await this.client.getQr(combined, this.data.credentials && !this.data.authExpired ? [this.data.credentials.token] : [])
        try {
          const qrDataUrl = await QRCode.toDataURL(qr.url, { width: 240, margin: 2 })
          combined.throwIfAborted()
          this.commit(d => { d.revision++ })
          this.login = { id: randomUUID(), qrcode: qr.qrcode, url: qr.url, qrDataUrl, status: 'wait', started: this.now(), abort }
        } catch (error) { this.client.forgetQr?.(qr.qrcode); throw error }
        this.message = '请用微信扫一扫扫描电脑上的二维码，并在微信中确认。'
        break
      }
      case 'login.poll': {
        this.expireLogin()
        const login = this.login
        if (!login || login.id !== request.loginId) fail('clawbot-login-stale', '配对已取消或更新，请刷新。')
        if (!activeLoginStatus(login!.status)) return this.snapshot()
        const previous = this.loginPoll
        if (previous && previous.login === login) {
          if (request.verifyCode === undefined) return this.snapshot()
          if (previous.verifying) fail('clawbot-login-busy', '微信确认码仍在提交，请稍候核对或取消配对；不要重复提交。')
          previous.abort.abort()
        }
        const polling = { login: login!, abort: new AbortController(), verifying: request.verifyCode !== undefined }
        this.loginPoll = polling
        const combined = AbortSignal.any([signal, this.lifetime.signal, login!.abort.signal, polling.abort.signal])
        try {
          const result = await this.client.pollQr(login!.qrcode, combined, request.verifyCode)
          combined.throwIfAborted()
          if (this.login !== login) return this.snapshot()
          const finish = this.commandQueue.then(() => { combined.throwIfAborted(); this.completeLogin(login!, result) })
          this.commandQueue = finish.catch(() => {}); await finish
        } finally { if (this.loginPoll === polling) this.loginPoll = undefined }
        break
      }
      case 'login.cancel': {
        if (this.login && (!request.loginId || this.login.id !== request.loginId)) fail('clawbot-login-stale', '配对状态已更新，请刷新。')
        if (this.login) { this.commit(d => { d.revision++ }); this.endLogin(this.login) }
        this.login = undefined; this.message = ''; break
      }
      case 'disconnect': {
        this.checkRevision(request)
        this.expireLogin()
        if (this.login && activeLoginStatus(this.login.status)) fail('clawbot-login-active', '请先取消正在进行的配对。')
        if (this.data.enabled) fail('clawbot-busy', '请先暂停接入，再移除本地绑定。')
        if (this.data.receipts.some(r => !terminal(r)) && request.abandonPending !== true)
          fail('clawbot-pending', '仍有待处理或待发消息；须明确确认停止这些渠道消息后才能解绑。电脑上已开始的任务不会被取消。')
        this.commit(d => {
          for (const r of d.receipts) if (!terminal(r)) {
            r.state = 'uncertain'; r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
          }
          d.credentials = null; d.authExpired = false; d.target = null; d.cursor = ''; d.revision++
        })
        if (this.login) { this.endLogin(this.login); this.login = undefined }
        this.message = '已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。'
        break
      }
      default: fail('clawbot-invalid', '不支持的 ClawBot 操作')
    }
    return this.snapshot()
  }
  private completeLogin(login: Login, result: ILinkQrResult): void {
    this.lifetime.signal.throwIfAborted()
    this.expireLogin()
    if (this.login !== login || login.abort.signal.aborted) return
    if (this.data.enabled) fail('clawbot-busy', '请先暂停接入，再完成配对。')
    if (result.credentials) {
      if (this.data.credentials && this.data.credentials.userId !== result.credentials.userId) {
        this.commit(d => { d.revision++ })
        this.endLogin(login); this.login = undefined
        fail('clawbot-different-user', '此次确认的是另一个微信账号。未替换原绑定；如需换号，请先明确移除本地绑定。')
      }
      if (this.data.credentials && this.data.credentials.accountId !== result.credentials.accountId
        && this.data.receipts.some(r => !terminal(r))) {
        this.commit(d => { d.revision++ })
        this.endLogin(login); this.login = undefined
        fail('clawbot-pending', '原连接仍有未完成的消息，未替换本地绑定。请先处理原消息，或确认停止这些消息后移除绑定。')
      }
      this.commit(d => {
        if (d.credentials?.accountId !== result.credentials!.accountId) {
          d.cursor = ''
        }
        d.credentials = result.credentials!; d.authExpired = false; d.revision++
      })
      this.endLogin(login); this.login = undefined
      this.message = '微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。'
    } else if (result.status === 'binded_redirect' && this.data.credentials) {
      this.commit(d => { d.revision++ })
      this.endLogin(login); this.login = undefined
      this.message = this.data.authExpired ? '原微信连接已失效，请重新配对。'
        : '微信确认本节点已有绑定。选择会话并开启接入后即可使用。'
    } else {
      if (login.status !== result.status || result.message && this.message !== result.message) this.commit(d => { d.revision++ })
      login.status = result.status
      if (!activeLoginStatus(result.status)) this.endLogin(login)
      if (result.message) this.message = result.message
    }
  }
  private resume(): void {
    if (this.closed || this.broken || !this.data.enabled || !this.data.credentials || this.data.authExpired) return
    if (!this.pollTask) {
      const controller = new AbortController()
      this.polling = controller
      this.pollTask = this.poll(controller.signal).catch(() => {
        if (!this.closed && !controller.signal.aborted) { this.state = 'error'; this.message = 'ClawBot 接入已暂停，请核对本地记录和连接。' }
      }).finally(() => { this.pollTask = undefined; if (this.polling === controller) this.polling = undefined
        if (controller.signal.aborted && !this.closed && this.data.enabled) this.resume() })
    }
    this.work()
  }
  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
      const timer = setTimeout(finish, ms); timer.unref?.(); signal.addEventListener('abort', finish, { once: true })
    })
  }
  private async poll(signal: AbortSignal): Promise<void> {
    let failures = 0
    while (!signal.aborted && !this.closed && this.data.enabled && this.data.credentials) {
      try {
        this.state = 'connecting'
        const updates = await this.client.getUpdates(this.data.credentials, this.data.cursor, signal)
        signal.throwIfAborted()
        // Durably accept the entire batch with its cursor. Never acknowledge a
        // batch before enqueueing it or after only accepting part of it.
        this.ingest(updates.messages, updates.cursor)
        failures = 0; this.state = 'ready'; this.message = ''; this.work()
        if (!updates.messages.length) await this.delay(500, signal)
      } catch (error) {
        if (signal.aborted || this.closed) break
        failures++
        const code = (error as { code?: string }).code
        this.state = 'error'
        this.message = code === 'clawbot-auth-expired' ? '微信连接已失效，请重新配对。'
          : code === 'clawbot-capacity' ? '本机收件记录已满，接入已暂停；原记录未删除。'
          : 'ClawBot 连接暂不可用，正在等待重连；不会重复提交已有任务。'
        if (code === 'clawbot-auth-expired' || code === 'clawbot-capacity') {
          this.commit(d => { d.enabled = false; if (code === 'clawbot-auth-expired') d.authExpired = true; d.revision++ }); break
        }
        await this.delay(Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)), signal)
      }
    }
  }
  /** Exposed for deterministic contract testing, not a public RPC. */
  ingest(messages: ILinkMessage[], cursor: string): void {
    if (!this.data.credentials) fail('clawbot-unpaired', '尚未绑定微信')
    this.commit(d => {
      d.receipts = d.receipts.filter(r => !terminal(r) || this.now() - r.createdAt < RETENTION)
      const seen = new Set(d.receipts.map(r => r.id))
      for (const m of messages) {
        // Binding user identity is a provider identity, never a mini OpenID.
        if (m.userId !== d.credentials!.userId) continue
        const id = createHash('sha256').update(`${d.credentials!.accountId}\0${m.userId}\0${m.id}`).digest('hex')
        if (seen.has(id)) continue
        if (d.receipts.length >= MAX_RECEIPTS) fail('clawbot-capacity', 'ClawBot 收件记录已满')
        seen.add(id)
        const invalid = m.unsupported || !m.text.trim() || m.text.length > MAX_INPUT
        d.receipts.push({ id, userId: m.userId, contextToken: m.contextToken, input: invalid ? '' : m.text,
          target: d.target && { ...d.target }, revision: d.revision, createdAt: this.now(), state: invalid ? 'ready' : 'pending',
          ...(invalid ? { output: '首版支持文字消息（最多 8000 字符）。图片、语音和文件请在小程序或电脑继续。' } : {}) })
      }
      d.cursor = cursor
    })
  }
  private work(): void {
    if (this.closed || this.broken || !this.data.enabled) return
    const failed = () => { this.broken = true; this.state = 'error'; this.message = '本地记录保存失败，接入已停止，请核对原会话后重启组件。'; this.polling?.abort() }
    if (!this.worker && this.data.receipts.some(r => r.state === 'pending' && !r.input.trim().startsWith('/')))
      this.worker = this.process(false).catch(failed).finally(() => { this.worker = undefined; this.work() })
    if (!this.commandWorker && this.data.receipts.some(r => r.state === 'pending' && r.input.trim().startsWith('/')))
      this.commandWorker = this.process(true).catch(failed).finally(() => { this.commandWorker = undefined; this.work() })
    this.deliver()
  }
  private update(id: string, patch: Partial<Receipt>): void {
    this.commit(d => { const r = d.receipts.find(r => r.id === id); if (r) Object.assign(r, patch) })
  }
  private async command(r: Receipt): Promise<string | null> {
    const text = r.input.trim()
    if (!text.startsWith('/')) return null
    if (text === '/帮助' || text === '/help') return '/会话：列出可连接的会话\n/切换 编号：切换后续输入的会话\n/状态：查看目标\n普通文字直接发送到当前目标。'
    if (text === '/状态') return `当前目标：${this.data.target?.title || '尚未选择'}。接入${this.data.enabled ? '已开启' : '已暂停'}。`
    if (text === '/会话') {
      const sessions = await this.host.listSessions(this.lifetime.signal)
      return sessions.length ? sessions.slice(0, 40).map(s => `${this.shortId(s.id)} · ${s.title}`).join('\n') + '\n发送 /切换 编号。' : '当前节点没有可选择的普通会话，请先在 DSH 新建会话。'
    }
    const match = text.match(/^\/切换\s+(\S+)$/)
    if (match) {
      const sessions = await this.host.listSessions(this.lifetime.signal)
      const found = sessions.filter(s => this.shortId(s.id) === match[1])
      if (found.length !== 1) return '编号不存在或不唯一，请发送 /会话 获取当前编号。'
      const target = await this.host.describeSession(found[0].id, this.lifetime.signal)
      // Commands and owner control use the same mutation queue. Already received
      // messages keep their own captured target, even if still waiting to run.
      const operation = this.commandQueue.then(() => {
        this.lifetime.signal.throwIfAborted()
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running') return
        this.commit(d => { d.target = target; d.revision++ })
      })
      this.commandQueue = operation.catch(() => {}); await operation
      return `已接到「${found[0].title}」。现在发送的文字将进入此会话；先前已接收的消息仍属于原会话。`
    }
    return '未知 ClawBot 指令。发送 /帮助 查看；首版不把斜杠指令转给 DSH 执行。'
  }
  private shortId(id: string): string { return createHash('sha256').update(id).digest('hex').slice(0, 8) }
  private async process(commands: boolean): Promise<void> {
    while (!this.closed && !this.broken && this.data.enabled && this.data.credentials) {
      const r = this.data.receipts.find(r => r.state === 'pending' && r.input.trim().startsWith('/') === commands)
      if (!r) return
      if (r.state === 'pending') {
        this.update(r.id, { state: 'running' })
        let output: string
        try {
          const command = await this.command(r)
          if (command !== null) output = command
          else if (!r.target) output = '尚未选择目标会话。请发送 /会话，或在电脑插件／小程序中选择。'
          else if (!Number.isSafeInteger(r.target.generation)) output = '目标会话需要重新选择，未派发此次输入。'
          else {
            const result = await this.host.run({ sessionId: r.target.id, expectedGeneration: r.target.generation!, requestId: `clawbot-${r.id}`, text: r.input }, this.lifetime.signal)
            output = `【${r.target.title}】\n${result.text || '本轮已结束，没有可发送的文字回复。'}`
          }
        } catch (error) {
          if (this.closed) return
          // Do not leak host paths, tool arguments or arbitrary exception data.
          output = `【${r.target?.title || 'ClawBot'}】\n${error instanceof ClawbotError ? error.message : '未能确认本轮完整回复。请到原会话查看是否需要审批、仍在运行或已失败；不会自动重复提交。'}`
        }
        if (this.closed) return
        // Explicit disconnect may seal the old account's in-flight receipt. A late
        // host result must not revive it and send through a different bot.
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running') continue
        const bounded = output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + '\n（回复较长，完整内容请在原会话查看）' : output
        this.update(r.id, { state: 'ready', output: bounded, input: '' })
        this.deliver()
      }
    }
  }
  private deliver(): void {
    if (this.deliveryWorker || this.closed || this.broken || !this.data.enabled || !this.data.receipts.some(r => r.state === 'ready')) return
    this.deliveryWorker = this.drain().catch(() => { this.broken = true; this.state = 'error'; this.message = '发送记录保存失败，已停止接入，请核对原会话。'; this.polling?.abort() })
      .finally(() => { this.deliveryWorker = undefined; this.deliver() })
  }
  private async drain(): Promise<void> {
    while (!this.closed && !this.broken && this.data.enabled && this.data.credentials) {
      const current = this.data.receipts.find(item => item.state === 'ready')
      if (!current) return
      const r = current
      const parts = current.parts || splitText(current.output || '')
      for (let index = current.sentParts || 0; index < parts.length; index++) {
        if (this.closed || !this.data.enabled) return
        this.update(r.id, { state: 'sending', parts, sentParts: index })
        const sendingCredentials = this.data.credentials!
        try {
          await this.client.sendText(sendingCredentials, { userId: r.userId, contextToken: r.contextToken,
            text: parts[index], clientId: `dsh-${r.id.slice(0, 32)}-${index}` }, this.lifetime.signal)
        } catch (error) {
          if (this.closed) return
          if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending') break
          this.update(r.id, { state: 'uncertain', input: '', output: undefined, parts: undefined, contextToken: '' })
          // A paused send may finish after same-account reauthentication. Its
          // old token rejection is not evidence that the replacement is invalid.
          if ((error as { code?: string }).code === 'clawbot-auth-expired'
            && this.data.credentials?.accountId === sendingCredentials.accountId
            && this.data.credentials?.token === sendingCredentials.token) {
            this.commit(d => { d.enabled = false; d.authExpired = true; d.revision++ })
            this.polling?.abort()
            this.message = '微信连接已失效，请重新配对。未确认送达的回复请在原会话查看。'
          } else this.message = '有回复发送结果不确定，未自动重发；完整结果仍在原 DSH 会话。'
          break
        }
        if (this.closed) return
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending') break
        this.update(r.id, { state: index === parts.length - 1 ? 'done' : 'ready', sentParts: index + 1,
          ...(index === parts.length - 1 ? { output: undefined, parts: undefined, contextToken: '' } : {}) })
      }
    }
  }
  async dispose(): Promise<void> {
    if (this.closed) return
    this.closed = true; this.lifetime.abort(); this.polling?.abort(); if (this.login) this.endLogin(this.login); this.login = undefined
    await Promise.allSettled([this.worker, this.commandWorker, this.deliveryWorker, this.pollTask, this.commandQueue])
    this.storage.close()
  }
}

/** Conservative local text chunk size, counted as UTF-8 without splitting emoji. */
export function splitText(text: string): string[] {
  const parts: string[] = []; let part = '', bytes = 0
  for (const char of text) { const size = Buffer.byteLength(char); if (bytes + size > 1800) { parts.push(part); part = ''; bytes = 0 }; part += char; bytes += size }
  if (part) parts.push(part)
  return parts.length ? parts : ['（无文字回复）']
}
