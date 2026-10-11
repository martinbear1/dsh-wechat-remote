import { createHash, randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { ClawbotError, type ClawbotAttachment, type ClawbotAttention, type ClawbotHost, type ClawbotRequest, type ClawbotStatus } from './contracts.js'
import { ILinkClient } from './ilink.js'
import type { ILinkMessage, ILinkQrResult, ILinkPreparedMedia } from './ilink-types.js'
import { MEDIA_MAX_BYTES, MEDIA_MAX_ITEMS } from './ilink-media.js'
import type { ClawbotData, ClawbotStorage, Receipt } from './storage.js'
import { validateClawbotData } from './storage.js'

const RETENTION = 7 * 86400_000 // Local deduplication window, not a Tencent guarantee.
const MAX_RECEIPTS = 1000
const MAX_INPUT = 8000
const MAX_OUTPUT = 12000
const LOGIN_LIFETIME = 5 * 60_000 // Local attempt limit, not a Tencent expiry guarantee.
const LOGIN_RETRY_MESSAGE = '暂时无法读取微信绑定状态，正在重试。'
const RESTART_MESSAGE = 'ClawBot 本地记录出现异常，接入已停止。请核对记录后重启组件。'
const activeLoginStatus = (status: string) => ['wait', 'scaned', 'scaned_but_redirect', 'need_verifycode'].includes(status)
const terminal = (r: Receipt) => r.state === 'done' || r.state === 'uncertain'
const isCommand = (r: Receipt) => !r.media?.length && r.input.trim().startsWith('/')
const attentionId = (id: string, kind: ClawbotAttention) => createHash('sha256').update(`attention\0${id}\0${kind}`).digest('hex')
const nativeOnlyMessage = (title: string) => `【${title}】\n本次任务的问答或审批请在小程序或电脑的原生卡片中处理。本条消息未发送到会话，也不会稍后补发；待原任务结束后，需要时再发送新消息。`
const sameTarget = (a: Receipt, b: Receipt) => a.userId === b.userId && !!a.target && !!b.target
  && a.target.id === b.target.id && a.target.generation === b.target.generation
function holdInput(r: Receipt, output = nativeOnlyMessage(r.target?.title || 'ClawBot')): void {
  r.state = 'ready'; r.input = ''; r.output = output
}
function holdPending(data: ClawbotData, parent: Receipt, output?: string): void {
  for (const r of data.receipts) if (r.state === 'pending' && !isCommand(r)
    && r.createdAt >= parent.createdAt && sameTarget(r, parent)) holdInput(r, output)
}
function sealUnsentAttention(data: ClawbotData, id: string): void {
  const ids = new Set([attentionId(id, 'approval'), attentionId(id, 'question')])
  for (const r of data.receipts) if ((ids.has(r.id) || r.parentId === id) && r.state === 'ready') {
    r.state = 'done'; r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
  }
}
const fail = (code: string, message: string): never => { throw new ClawbotError(code, message) }
type AccessBinding = NonNullable<ClawbotData['accessBinding']>
type Login = { id: string; qrcode: string; url: string; qrDataUrl: string; status: string; started: number; abort: AbortController; owner?: AccessBinding }
type LoginWatch = { login: Login; timer?: NodeJS.Timeout; deadline?: NodeJS.Timeout; task?: Promise<void>; failures: number }
export interface ClawbotAccess { authorize(): Promise<void>; current(): void; identity?(): AccessBinding }

// Fixed local messages only: never expose provider bodies, credentials or URLs.
function pollErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'clawbot-auth-expired': return '微信连接已失效，请重新绑定。'
    case 'clawbot-capacity': return '本机收件记录已满，接入已暂停；原记录未删除。'
    case 'clawbot-invalid-response': return '微信返回的数据暂不兼容，正在重试；持续出现时请更新插件。'
    case 'clawbot-response-too-large': return '微信消息超过本地处理上限，正在重试；本批消息尚未接入。'
    case 'clawbot-untrusted-url': return '微信接口地址校验未通过，正在重试；请核对插件版本。'
    case 'clawbot-api-error':
    case 'clawbot-http-error': return '微信服务暂未接受请求，正在重试；不会重复提交已有任务。'
    case 'clawbot-network-error':
    case 'clawbot-timeout': return 'ClawBot 连接暂不可用，正在等待重连；不会重复提交已有任务。'
    default: return 'ClawBot 接入处理异常，正在重试；请核对插件状态。'
  }
}

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
  private loginWatch?: LoginWatch
  private message = ''
  private state: ClawbotStatus['state'] = 'disabled'
  private closed = false
  private commandQueue: Promise<unknown> = Promise.resolve()
  private readonly nativeAttention = new Set<string>()
  constructor(private readonly storage: ClawbotStorage, private readonly host: ClawbotHost,
    private readonly client = new ILinkClient(), private readonly now = Date.now, private readonly access?: ClawbotAccess) {
    this.data = storage.read()
    // A hot component reload may retain the phone/gateway connection epoch but
    // never restores an in-memory QR attempt. Fence all prior instance replies.
    if (this.data.revision > 0) this.commit(d => { d.revision++ })
    // RC32's private question capability cannot survive an upgrade. Retire its
    // unsent prompts and possible queued answers, never reinterpret or replay
    // them as new Agent tasks. This only changes the plugin's private outbox.
    if (this.data.receipts.some(r => r.parentId !== undefined)) this.commit(d => {
      const parents = new Set(d.receipts.map(r => r.parentId).filter(Boolean))
      // The original run may have completed after RC32 was paused, while its
      // ambiguous follow-up is still queued. Do not infer new task
      // intent from an old answer-shaped message just because the run ended.
      for (const r of d.receipts) if (parents.has(r.id)) holdPending(d, r,
        `【${r.target?.title || 'ClawBot'}】\n本条升级前待发消息未发送到会话，也不会自动补发。请在小程序或电脑核对原会话后，按需重新发送。`)
      for (const r of d.receipts) if (r.parentId !== undefined) {
        if (r.state === 'ready' || r.state === 'sending') {
          r.state = r.state === 'sending' ? 'uncertain' : 'done'
          r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
        }
        delete r.parentId // One-time retirement, not a permanent block on this session.
      }
    })
    // After an interrupted process, neither a host dispatch nor a provider
    // delivery can safely be repeated just because its acknowledgement is lost.
    if (this.data.receipts.some(r => r.state === 'running' || r.state === 'sending')) {
      this.commit(d => { for (const r of d.receipts) if (r.state === 'running' || r.state === 'sending') {
        sealUnsentAttention(d, r.id)
        r.state = 'uncertain'; r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
      } })
      this.message = '有上次中断的处理或发送，未自动重试，请在原会话核对。'
    }
    // Pre-entitlement versions never captured an account owner. Do not adopt
    // their token in the background: the owner must explicitly enable once.
    if (access?.identity && this.data.enabled && this.data.credentials && !this.data.accessBinding) {
      this.commit(d => { d.enabled = false; d.revision++ })
      this.message = '升级后请核对绑定的微信，并重新启用私聊接入。原绑定和会话已保留。'
    }
    this.resume()
  }
  private commit(change: (next: ClawbotData) => void): void {
    const next = structuredClone(this.data)
    change(next)
    // Download capabilities are only needed before native admission. Do not
    // retain provider URLs/keys in terminal deliveries or blocked inputs.
    for (const r of next.receipts) if (!['pending', 'running'].includes(r.state)) delete r.media
    validateClawbotData(next)
    this.storage.write(next)
    this.data = next
  }
  private checkRevision(request: ClawbotRequest): void {
    if (request.expectedRevision !== this.data.revision)
      fail('clawbot-conflict', '状态已经变化，请刷新后再操作。')
  }
  private checkOperational(request?: ClawbotRequest): void {
    // Recovering disk space does not recover this stopped runtime. In particular,
    // never return a successful enable/bind receipt while resume() is fenced off.
    const safe = request?.action === 'login.cancel' || request?.action === 'enabled' && request.enabled === false
    if (this.broken && !safe) fail('clawbot-restart-required', RESTART_MESSAGE)
  }
  private accessFailure(error: unknown): never {
    const message = error instanceof Error ? error.message : '暂时无法核对使用资格，请联网后刷新。'
    this.polling?.abort()
    try { if (this.data.enabled) this.commit(d => { d.enabled = false; d.revision++ }) }
    catch { this.broken = true; this.state = 'error'; this.message = RESTART_MESSAGE }
    if (this.login && activeLoginStatus(this.login.status)) { this.commit(d => { d.revision++ }); this.login.status = 'error'; this.endLogin(this.login) }
    if (!this.broken) this.message = message
    return fail('feature-access-denied', message)
  }
  private async authorize(): Promise<void> { try { await this.access?.authorize() } catch (error) { this.accessFailure(error) }; this.currentAccess() }
  private sameOwner(a: AccessBinding, b: AccessBinding): boolean { return a.nodeId === b.nodeId && a.accountInstance === b.accountInstance }
  private currentAccess(): void {
    try {
      this.access?.current()
      const owner = this.access?.identity?.()
      if (owner && ((this.data.accessBinding && !this.sameOwner(this.data.accessBinding, owner))
        || (this.login?.owner && activeLoginStatus(this.login.status) && !this.sameOwner(this.login.owner, owner))))
        throw new Error('此节点的账号绑定已变化。请移除原本地微信绑定后重新绑定，不会沿用旧账号的连接。')
    } catch (error) { this.accessFailure(error) }
  }
  private requiresAccess(request: ClawbotRequest): boolean {
    return !['status', 'sessions', 'login.cancel', 'disconnect'].includes(request.action) && !(request.action === 'enabled' && request.enabled === false)
  }
  snapshot(): ClawbotStatus {
    this.expireLogin()
    return { supported: true, revision: this.data.revision, enabled: this.data.enabled, supportsEnableBeforeSetup: true,
      state: !this.data.enabled ? 'disabled' : !this.data.credentials ? 'unpaired' : this.data.authExpired ? 'error'
        : this.login && activeLoginStatus(this.login.status) ? 'connecting' : !this.data.target ? 'disabled' : this.state,
      paired: Boolean(this.data.credentials), bindingState: !this.data.credentials ? 'unpaired' : this.data.authExpired ? 'expired' : 'paired',
      target: this.data.target && { ...this.data.target }, message: this.message,
      pending: this.data.receipts.filter(r => !terminal(r)).length,
      uncertain: this.data.receipts.filter(r => r.state === 'uncertain').length,
      ...(this.login ? { pairing: { id: this.login.id, url: this.login.url, qrDataUrl: this.login.qrDataUrl,
        status: this.login.status, expiresAt: this.login.started + LOGIN_LIFETIME } } : {}) }
  }
  private endLogin(login: Login): void {
    if (this.loginWatch?.login === login) {
      clearTimeout(this.loginWatch.timer); clearTimeout(this.loginWatch.deadline)
      this.loginWatch = undefined
    }
    login.abort.abort()
    this.client.forgetQr?.(login.qrcode)
    login.url = ''; login.qrDataUrl = ''; login.qrcode = ''
  }
  private expireLogin(deadlineElapsed = false): void {
    if (this.broken) return // Preserve the restart diagnostic until disposal.
    const login = this.login
    if (login && activeLoginStatus(login.status) && (deadlineElapsed || this.now() >= login.started + LOGIN_LIFETIME)) {
      this.commit(d => { d.revision++ })
      login.status = 'expired'; this.endLogin(login)
      this.message = '二维码已过期，请重新生成。'
      this.resume()
    }
  }
  /** The node owns a requested login, even while both control pages are closed.
   * Only read its result, for this attempt's bounded lifetime; never restart a
   * login, resend a verification code, or change the node's enabled choice here. */
  private watchLogin(login: Login): void {
    const watch: LoginWatch = { login, failures: 0 }
    this.loginWatch = watch
    watch.deadline = setTimeout(() => {
      if (this.loginWatch !== watch || this.closed) return
      // The timer enforces the bound even if the computer clock moves back.
      try { this.expireLogin(true) }
      catch { this.failLoginStorage(login) }
    }, Math.max(0, login.started + LOGIN_LIFETIME - this.now()))
    watch.deadline.unref?.()
    this.scheduleLoginWatch(login)
  }
  private failLoginStorage(login: Login): void {
    // Do not turn a background persistence exception into an unhandled timer
    // rejection or an apparently successful binding. Preserve the old file.
    this.broken = true; this.state = 'error'
    login.status = 'error'; this.endLogin(login)
    this.message = '绑定记录未能保存，已停止接入。请核对本地记录后重启组件。'
  }
  private scheduleLoginWatch(login: Login): void {
    const watch = this.loginWatch
    if (!watch || watch.login !== login || watch.timer || watch.task || this.closed || this.broken
      || this.login !== login || login.abort.signal.aborted || !activeLoginStatus(login.status)
      || login.status === 'need_verifycode') return
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(watch.failures, 4))
    watch.timer = setTimeout(() => {
      watch.timer = undefined
      if (this.loginWatch !== watch || this.closed || login.abort.signal.aborted
        || !activeLoginStatus(login.status) || login.status === 'need_verifycode') return
      // The existing single-flight lane also handles passive UI reads and
      // explicit verification. Closing a UI cannot abort this node-owned read.
      watch.task = this.control({ action: 'login.poll', loginId: login.id }, this.lifetime.signal)
        .then(() => { watch.failures = 0 })
        .catch(error => {
          if (this.login !== login || login.abort.signal.aborted || this.closed || this.broken) return
          // An explicit verification submission supersedes this passive read.
          // Its cancellation is not a provider failure and must not cancel the
          // still-pending code submission or erase its next verification state.
          if ((error as { name?: string }).name === 'AbortError') return
          try {
            const retry = ['clawbot-network-error', 'clawbot-timeout', 'clawbot-http-error', 'clawbot-api-error']
              .includes((error as { code?: string }).code || '')
            const message = retry ? LOGIN_RETRY_MESSAGE
              : '绑定状态未能确认，请重新生成二维码。'
            if (this.message !== message || !retry) this.commit(d => { d.revision++ })
            this.message = message
            if (retry) watch.failures++
            else { login.status = 'error'; this.endLogin(login); this.resume() }
          } catch { this.failLoginStorage(login) }
        }).finally(() => {
          watch.task = undefined
          this.scheduleLoginWatch(login)
        })
    }, delay)
    watch.timer.unref?.()
  }
  async control(request: ClawbotRequest, signal: AbortSignal): Promise<ClawbotStatus | { sessions: { id: string; title: string }[] }> {
    if (!request || typeof request.action !== 'string') fail('clawbot-invalid', '无效的 ClawBot 操作')
    signal.throwIfAborted()
    if (this.closed) fail('clawbot-stopped', 'ClawBot 组件已停用')
    if (request.action === 'status') return this.snapshot()
    if (request.action === 'sessions') return { sessions: await this.host.listSessions(signal) }
    this.checkOperational(request)
    if (this.requiresAccess(request)) await this.authorize()
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
    this.checkOperational(request)
    if (this.requiresAccess(request)) this.currentAccess()
    switch (request.action) {
      case 'route': {
        this.checkRevision(request)
        if (!request.sessionId) fail('clawbot-invalid', '请选择会话')
        const found = await this.host.describeSession(request.sessionId!, signal)
        signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
        this.checkOperational(request); this.checkRevision(request)
        this.currentAccess()
        if (!found) fail('clawbot-session-missing', '此会话已不可选择，请刷新列表。')
        this.commit(d => { d.target = found!; d.revision++ })
        this.resume()
        break
      }
      case 'enabled': {
        this.checkRevision(request)
        if (typeof request.enabled !== 'boolean') fail('clawbot-invalid', '请指定开启或暂停')
        if (this.broken && !this.data.enabled) return this.snapshot()
        this.expireLogin()
        const owner = request.enabled && this.data.credentials ? this.access?.identity?.() : undefined
        this.commit(d => { d.enabled = request.enabled!; if (owner && !d.accessBinding) d.accessBinding = owner; d.revision++ })
        if (this.login && !activeLoginStatus(this.login.status)) this.login = undefined
        if (request.enabled) { this.message = ''; this.resume() }
        else { this.polling?.abort(); if (!this.broken) this.message = '已暂停接入；DSH 中已经开始的任务不会被取消。' }
        break
      }
      case 'login.start': {
        if (request.expectedRevision !== undefined) this.checkRevision(request)
        this.expireLogin()
        // Both control surfaces observe the same attempt. Merely opening the
        // second surface must not rotate a QR that is already being scanned.
        if (this.login && activeLoginStatus(this.login.status)) return this.snapshot()
        if (this.data.enabled && this.data.credentials) fail('clawbot-busy', '请先暂停接入，再重新绑定。')
        const abort = new AbortController()
        const owner = this.access?.identity?.()
        const combined = AbortSignal.any([signal, this.lifetime.signal, abort.signal])
        const qr = await this.client.getQr(combined, this.data.credentials && !this.data.authExpired ? [this.data.credentials.token] : [])
        try {
          const qrDataUrl = await QRCode.toDataURL(qr.url, { width: 240, margin: 2 })
          combined.throwIfAborted()
          this.checkOperational(request)
          this.currentAccess()
          if (owner && !this.sameOwner(owner, this.access!.identity!())) this.accessFailure(new Error('节点或账号已变化，请重新开始绑定。'))
          this.commit(d => { d.revision++ })
          this.login = { id: randomUUID(), qrcode: qr.qrcode, url: qr.url, qrDataUrl, status: 'wait', started: this.now(), abort, ...(owner ? { owner } : {}) }
          this.watchLogin(this.login)
        } catch (error) { this.client.forgetQr?.(qr.qrcode); throw error }
        this.message = '请用微信扫一扫扫描电脑上的二维码，并在微信中确认。'
        break
      }
      case 'login.poll': {
        this.expireLogin()
        const login = this.login
        if (!login || login.id !== request.loginId) fail('clawbot-login-stale', '绑定已取消或更新，请刷新。')
        if (!activeLoginStatus(login!.status)) return this.snapshot()
        const previous = this.loginPoll
        if (previous && previous.login === login) {
          if (request.verifyCode === undefined) return this.snapshot()
          if (previous.verifying) fail('clawbot-login-busy', '微信确认码仍在提交，请稍候核对或取消绑定；不要重复提交。')
          previous.abort.abort()
        }
        const polling = { login: login!, abort: new AbortController(), verifying: request.verifyCode !== undefined }
        this.loginPoll = polling
        const combined = AbortSignal.any([signal, this.lifetime.signal, login!.abort.signal, polling.abort.signal])
        try {
          const result = await this.client.pollQr(login!.qrcode, combined, request.verifyCode)
          combined.throwIfAborted()
          if (this.login !== login) return this.snapshot()
          await this.authorize()
          combined.throwIfAborted()
          const finish = this.commandQueue.then(() => { combined.throwIfAborted(); this.completeLogin(login!, result) })
          this.commandQueue = finish.catch(() => {}); await finish
        } finally {
          if (this.loginPoll === polling) this.loginPoll = undefined
          this.scheduleLoginWatch(login!)
        }
        break
      }
      case 'login.cancel': {
        if (this.login && (!request.loginId || this.login.id !== request.loginId)) fail('clawbot-login-stale', '绑定状态已更新，请刷新。')
        if (this.login) { this.commit(d => { d.revision++ }); this.endLogin(this.login) }
        this.login = undefined; if (!this.broken) this.message = ''; this.resume(); break
      }
      case 'disconnect': {
        this.checkRevision(request)
        this.expireLogin()
        if (this.login && activeLoginStatus(this.login.status)) fail('clawbot-login-active', '请先取消正在进行的绑定。')
        if (this.data.enabled) fail('clawbot-busy', '请先暂停接入，再移除本地绑定。')
        if (this.data.receipts.some(r => !terminal(r)) && request.abandonPending !== true)
          fail('clawbot-pending', '仍有待处理或待发消息；须明确确认停止这些渠道消息后才能解绑。电脑上已开始的任务不会被取消。')
        this.commit(d => {
          for (const r of d.receipts) if (!terminal(r)) {
            r.state = 'uncertain'; r.input = ''; r.output = undefined; r.parts = undefined; r.contextToken = ''
          }
          d.credentials = null; d.accessBinding = undefined; d.authExpired = false; d.target = null; d.cursor = ''; d.revision++
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
    this.checkOperational()
    this.currentAccess()
    this.expireLogin()
    if (this.login !== login || login.abort.signal.aborted) return
    if (result.credentials) {
      if (this.data.credentials && this.data.credentials.userId !== result.credentials.userId) {
        this.commit(d => { d.revision++ })
        this.endLogin(login); this.login = undefined
        this.message = '此次确认的是另一个微信账号。未替换原绑定；如需换号，请先明确移除本地绑定。'
        this.resume()
        fail('clawbot-different-user', this.message)
      }
      if (this.data.credentials && this.data.credentials.accountId !== result.credentials.accountId
        && this.data.receipts.some(r => !terminal(r))) {
        this.commit(d => { d.revision++ })
        this.endLogin(login); this.login = undefined
        this.message = '原连接仍有未完成的消息，未替换本地绑定。请先处理原消息，或确认停止这些消息后移除绑定。'
        this.resume()
        fail('clawbot-pending', this.message)
      }
      this.commit(d => {
        if (d.credentials?.accountId !== result.credentials!.accountId) {
          d.cursor = ''
        }
        d.credentials = result.credentials!; if (login.owner) d.accessBinding = login.owner; d.authExpired = false; d.revision++
      })
      this.endLogin(login); this.login = undefined
      this.message = ''
      this.resume()
    } else if (result.status === 'binded_redirect' && this.data.credentials) {
      this.commit(d => { if (login.owner && !d.accessBinding) d.accessBinding = login.owner; d.revision++ })
      this.endLogin(login); this.login = undefined
      this.message = this.data.authExpired ? '原微信连接已失效，请重新绑定。'
        : ''
      this.resume()
    } else {
      // Only an actual successful provider read can clear our transient retry
      // notice. A coalesced UI snapshot never reaches this method, and unrelated
      // diagnostics remain intact when the provider has no new message.
      const message = result.message || (this.message === LOGIN_RETRY_MESSAGE ? '' : this.message)
      if (login.status !== result.status || this.message !== message) this.commit(d => { d.revision++ })
      login.status = result.status
      if (!activeLoginStatus(result.status)) this.endLogin(login)
      this.message = message
      this.resume()
    }
  }
  /** enabled is the owner's node-level choice; readiness never rewrites it.
   * An incomplete setup may expose controls, but cannot receive, run or send. */
  private canReceive(): boolean {
    return !this.closed && !this.broken && this.data.enabled && Boolean(this.data.credentials)
      && !this.data.authExpired && Boolean(this.data.target)
      && !(this.login && activeLoginStatus(this.login.status))
  }
  private resume(): void {
    if (!this.canReceive()) return
    if (!this.pollTask) {
      this.state = 'connecting'
      const controller = new AbortController()
      this.polling = controller
      this.pollTask = this.poll(controller.signal).catch(() => {
        if (!this.closed && !controller.signal.aborted) {
          this.broken = true; this.state = 'error'; this.message = 'ClawBot 接入已暂停，请核对本地记录和连接。'
        }
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
    while (!signal.aborted && this.canReceive()) {
      try {
        await this.authorize()
        signal.throwIfAborted()
        if (!this.canReceive()) return
        this.state = 'connecting'
        const updates = await this.client.getUpdates(this.data.credentials!, this.data.cursor, signal)
        signal.throwIfAborted()
        // A normal long-poll may span the short authority lease. Revalidate
        // before accepting its data; never extend stale cached permission.
        await this.authorize()
        signal.throwIfAborted()
        if (!this.canReceive()) return
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
        this.message = pollErrorMessage(code)
        if (code === 'clawbot-auth-expired' || code === 'clawbot-capacity') {
          this.commit(d => { d.enabled = false; if (code === 'clawbot-auth-expired') d.authExpired = true; d.revision++ }); break
        }
        await this.delay(Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)), signal)
      }
    }
  }
  /** Exposed for deterministic contract testing, not a public RPC. */
  ingest(messages: ILinkMessage[], cursor: string): void {
    this.currentAccess()
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
        const invalid = m.unsupported || (!m.text.trim() && !m.media?.length) || m.text.length > MAX_INPUT
        const receipt: Receipt = { id, userId: m.userId, contextToken: m.contextToken, input: invalid ? '' : m.text,
          target: d.target && { ...d.target }, revision: d.revision, createdAt: this.now(), state: invalid ? 'ready' : 'pending',
          ...(invalid ? { output: m.unsupportedReason || '这条消息暂不支持或超过接收上限，未发送到会话。请使用文字、图片或文件，单个附件不超过 10 MB、每条最多 6 个；文字最多 8000 字符。' }
            : m.media?.length ? { media: structuredClone(m.media) } : {}) }
        if (!invalid && !isCommand(receipt) && d.receipts.some(parent => this.nativeAttention.has(parent.id)
          && parent.state === 'running' && sameTarget(receipt, parent))) holdInput(receipt)
        d.receipts.push(receipt)
      }
      d.cursor = cursor
    })
  }
  private work(): void {
    if (!this.canReceive()) return
    const failed = () => { this.broken = true; this.state = 'error'; this.message = '本地记录保存失败，接入已停止，请核对原会话后重启组件。'; this.polling?.abort() }
    if (!this.worker && this.data.receipts.some(r => r.state === 'pending' && !isCommand(r)))
      this.worker = this.process(false).catch(failed).finally(() => { this.worker = undefined; this.work() })
    if (!this.commandWorker && this.data.receipts.some(r => r.state === 'pending' && isCommand(r)))
      this.commandWorker = this.process(true).catch(failed).finally(() => { this.commandWorker = undefined; this.work() })
    this.deliver()
  }
  private update(id: string, patch: Partial<Receipt>): void {
    this.commit(d => { const r = d.receipts.find(r => r.id === id); if (r) Object.assign(r, patch) })
  }
  private async command(r: Receipt): Promise<string | null> {
    this.currentAccess()
    const text = r.input.trim()
    if (!isCommand(r)) return null
    if (text === '/帮助' || text === '/help') return '/会话：列出可接入的会话\n/切换 编号：切换接入会话\n/状态：查看当前接入\n普通文字直接发送到接入会话；问答和审批请在小程序或电脑处理。'
    if (/^\/回答(?:\s|$)/.test(text)) return '问答和审批请在小程序或电脑的原生卡片中处理，微信私聊不代为作答。本条消息未发送到会话。'
    if (text === '/状态') return `接入会话：${this.data.target?.title || '尚未选择'}。私聊接入${this.data.enabled ? '已启用' : '已暂停'}。`
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
        this.checkOperational()
        this.currentAccess()
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running') return
        this.commit(d => { d.target = target; d.revision++ })
      })
      this.commandQueue = operation.catch(() => {}); await operation
      return `已接到「${found[0].title}」。现在发送的文字将进入此会话；先前已接收的消息仍属于原会话。`
    }
    return '未知 ClawBot 指令。发送 /帮助 查看；首版不把斜杠指令转给 DSH 执行。'
  }
  private shortId(id: string): string { return createHash('sha256').update(id).digest('hex').slice(0, 8) }
  /** Notices reuse the same durable outbox and delivery fences as final replies.
   * At most two per request; no new sender, polling loop or replay permission. */
  private attention(r: Receipt, kind: ClawbotAttention): void {
    if (this.closed || this.broken || this.data.receipts.find(item => item.id === r.id)?.state !== 'running') return
    // Passive notification only. Keep potentially ambiguous replies out of the
    // ordinary prompt queue until this observed turn ends; never answer a tool.
    this.nativeAttention.add(r.id)
    const id = attentionId(r.id, kind)
    if (this.data.receipts.some(item => item.id === id)) return
    if (this.data.receipts.length >= MAX_RECEIPTS) fail('clawbot-capacity', '本机收件记录已满，请在原会话处理并查看结果。')
    const action = kind === 'approval' ? '确认审批' : '回答问题'
    this.commit(d => { holdPending(d, r); d.receipts.push({ id, userId: r.userId, contextToken: r.contextToken, input: '',
      target: r.target, revision: r.revision, createdAt: this.now(), state: 'ready',
      output: `【${r.target?.title || 'ClawBot'}】\n请打开小程序或电脑中的此会话${action}。任务未取消；保持私聊接入开启，会继续等待本次结果（最多 15 分钟）。` }) })
    this.deliver()
  }
  private async process(commands: boolean): Promise<void> {
    while (this.canReceive()) {
      const r = this.data.receipts.find(r => r.state === 'pending' && isCommand(r) === commands)
      if (!r) return
      try { await this.authorize() } catch { return }
      if (!this.canReceive()) return
      if (this.data.receipts.find(item => item.id === r.id)?.state === 'pending') {
        this.update(r.id, { state: 'running' })
        let output: string
        const mediaParts: ILinkPreparedMedia[] = []
        try {
          const command = await this.command(r)
          if (this.broken) return
          if (command !== null) output = command
          else if (!r.target) output = '尚未选择接入会话。请发送 /会话，或在电脑插件／小程序中选择。'
          else if (!Number.isSafeInteger(r.target.generation)) output = '接入会话需要重新选择，未派发此次输入。'
          else {
            this.currentAccess()
            const accountId = this.data.credentials!.accountId
            const checkAdmission = () => {
              this.currentAccess()
              if (!this.canReceive() || this.data.credentials?.accountId !== accountId
                || this.data.credentials?.userId !== r.userId || this.data.receipts.find(item => item.id === r.id)?.state !== 'running')
                fail('clawbot-not-submitted', '接入已暂停或绑定已变化，本条消息未发送到会话。')
            }
            const attachments: ClawbotAttachment[] = []
            let totalBytes = 0
            if (r.media && (r.media.length > MEDIA_MAX_ITEMS || typeof this.client.downloadMedia !== 'function'))
              fail('clawbot-media-unavailable', '当前接入暂不能读取此附件，本条消息未发送。')
            for (const media of r.media || []) {
              await this.authorize(); checkAdmission()
              let downloaded: { name: string; data: Uint8Array }
              try { downloaded = await this.client.downloadMedia(media, this.lifetime.signal) }
              catch { fail('clawbot-media-unavailable', '附件未能完整接收或格式暂不支持，本条消息未发送。请在小程序或电脑检查后按需重发。') }
              checkAdmission()
              totalBytes += downloaded!.data.byteLength
              if (!downloaded!.data.byteLength || downloaded!.data.byteLength > MEDIA_MAX_BYTES || totalBytes > 30 * 1024 * 1024)
                fail('clawbot-media-too-large', '单个附件不能超过 10 MB，一条消息的附件总计不能超过 30 MB；本条消息未发送。')
              attachments.push({ kind: media.kind, ...downloaded! })
            }
            // Crash after native admission must not re-download and replay.
            if (r.media) this.update(r.id, { media: undefined })
            checkAdmission()
            const result = await this.host.run({ sessionId: r.target.id, expectedGeneration: r.target.generation!, requestId: `clawbot-${r.id}`, text: r.input,
              ...(attachments.length ? { attachments } : {}), checkAdmission }, this.lifetime.signal,
              kind => this.attention(r, kind))
            output = `【${r.target.title}】\n${result.text || '本轮已结束，没有可发送的文字回复。'}`
            if (result.attachments?.length) {
              // Read-only native deliverables arrive as one bounded snapshot.
              // Upload is separate from sending: no live host paths, bytes or
              // extra filesystem reader are persisted in the channel ledger.
              const sendingCredentials = this.data.credentials
              const checkOutput = () => {
                checkAdmission()
                if (!sendingCredentials || this.data.credentials?.token !== sendingCredentials.token)
                  fail('clawbot-media-unavailable', '微信绑定已变化，未继续准备附件。')
              }
              try {
                if (result.attachments.length > MEDIA_MAX_ITEMS || result.attachments.reduce((n, part) => n + part.data.byteLength, 0) > 30 * 1024 * 1024
                  || typeof this.client.prepareMedia !== 'function') throw Error('unsupported output')
                for (const part of result.attachments) {
                  await this.authorize(); checkOutput()
                  const prepared = await this.client.prepareMedia(sendingCredentials!, { userId: r.userId, ...part }, this.lifetime.signal, checkOutput)
                  checkOutput(); mediaParts.push(prepared)
                }
              } catch {
                // A missing/changed file must not discard the completed reply
                // or cause another Agent run. Already prepared files stay ordered.
                output += '\n部分附件未能准备发送，请在原会话查看；不会自动重新执行任务。'
              }
            }
          }
        } catch (error) {
          if (this.closed || this.broken) return
          // Do not leak host paths, tool arguments or arbitrary exception data.
          output = `【${r.target?.title || 'ClawBot'}】\n${error instanceof ClawbotError ? error.message : '未能确认本轮完整回复。请到原会话查看是否需要审批、仍在运行或已失败；不会自动重复提交。'}`
        } finally { this.nativeAttention.delete(r.id) }
        if (this.closed || this.broken) return
        // Explicit disconnect may seal the old account's in-flight receipt. A late
        // host result must not revive it and send through a different bot.
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running') continue
        const bounded = output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + '\n（回复较长，完整内容请在原会话查看）' : output
        this.commit(d => {
          sealUnsentAttention(d, r.id)
          Object.assign(d.receipts.find(item => item.id === r.id)!, { state: 'ready', output: bounded, input: '',
            ...(mediaParts.length ? { parts: [...splitText(bounded), ...mediaParts], sentParts: 0 } : {}) })
        })
        this.deliver()
      }
    }
  }
  private deliver(): void {
    if (this.deliveryWorker || !this.canReceive() || !this.data.receipts.some(r => r.state === 'ready')) return
    this.deliveryWorker = this.drain().catch(() => { this.broken = true; this.state = 'error'; this.message = '发送记录保存失败，已停止接入，请核对原会话。'; this.polling?.abort() })
      .finally(() => { this.deliveryWorker = undefined; this.deliver() })
  }
  private async drain(): Promise<void> {
    while (this.canReceive()) {
      const current = this.data.receipts.find(item => item.state === 'ready')
      if (!current) return
      const r = current
      const parts = current.parts || splitText(current.output || '')
      for (let index = current.sentParts || 0; index < parts.length; index++) {
        try { await this.authorize() } catch { return }
        if (!this.canReceive()) return
        // Authorization may yield while completion retires an unsent notice or
        // disconnect seals the old binding. Never revive the captured receipt.
        const latest = this.data.receipts.find(item => item.id === r.id)
        if (latest?.state !== 'ready' || (latest.sentParts || 0) !== index) break
        this.update(r.id, { state: 'sending', parts, sentParts: index })
        const sendingCredentials = this.data.credentials!
        try {
          const part = parts[index], target = { userId: r.userId, contextToken: r.contextToken, clientId: `dsh-${r.id.slice(0, 32)}-${index}` }
          if (typeof part === 'string') await this.client.sendText(sendingCredentials, { ...target, text: part }, this.lifetime.signal)
          else await this.client.sendMedia(sendingCredentials, { ...target, media: part }, this.lifetime.signal)
        } catch (error) {
          if (this.closed || this.broken) return
          if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending') break
          this.update(r.id, { state: 'uncertain', input: '', output: undefined, parts: undefined, contextToken: '' })
          // A paused send may finish after same-account reauthentication. Its
          // old token rejection is not evidence that the replacement is invalid.
          if ((error as { code?: string }).code === 'clawbot-auth-expired'
            && this.data.credentials?.accountId === sendingCredentials.accountId
            && this.data.credentials?.token === sendingCredentials.token) {
            this.commit(d => { d.enabled = false; d.authExpired = true; d.revision++ })
            this.polling?.abort()
            this.message = '微信连接已失效，请重新绑定。未确认送达的回复请在原会话查看。'
          } else this.message = '有回复发送结果不确定，未自动重发；完整结果仍在原 DSH 会话。'
          break
        }
        if (this.closed || this.broken) return
        if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending') break
        this.update(r.id, { state: index === parts.length - 1 ? 'done' : 'ready', sentParts: index + 1,
          ...(index === parts.length - 1 ? { output: undefined, parts: undefined, contextToken: '' } : {}) })
      }
    }
  }
  async dispose(): Promise<void> {
    if (this.closed) return
    const loginTask = this.loginWatch?.task
    this.closed = true; this.lifetime.abort(); this.polling?.abort(); if (this.login) this.endLogin(this.login); this.login = undefined
    await Promise.allSettled([this.worker, this.commandWorker, this.deliveryWorker, this.pollTask, this.commandQueue, loginTask])
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
