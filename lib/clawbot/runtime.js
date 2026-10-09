import { createHash, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { ClawbotError } from './contracts.js';
import { formatQuestions, parseQuestionAnswer, validateQuestions } from './question-text.js';
import { ILinkClient } from './ilink.js';
import { validateClawbotData } from './storage.js';
const RETENTION = 7 * 86400_000; // Local deduplication window, not a Tencent guarantee.
const MAX_RECEIPTS = 1000;
const MAX_INPUT = 8000;
const MAX_OUTPUT = 12000;
const LOGIN_LIFETIME = 5 * 60_000; // Local attempt limit, not a Tencent expiry guarantee.
const LOGIN_RETRY_MESSAGE = '暂时无法读取微信绑定状态，正在重试。';
const RESTART_MESSAGE = 'ClawBot 本地记录出现异常，接入已停止。请核对记录后重启组件。';
const activeLoginStatus = (status) => ['wait', 'scaned', 'scaned_but_redirect', 'need_verifycode'].includes(status);
const terminal = (r) => r.state === 'done' || r.state === 'uncertain';
const attentionId = (id, kind) => createHash('sha256').update(`attention\0${id}\0${kind}`).digest('hex');
function sealUnsentAttention(data, id) {
    const ids = new Set([attentionId(id, 'approval'), attentionId(id, 'question')]);
    for (const r of data.receipts)
        if ((ids.has(r.id) || r.parentId === id) && r.state === 'ready') {
            r.state = 'done';
            r.input = '';
            r.output = undefined;
            r.parts = undefined;
            r.contextToken = '';
        }
}
const fail = (code, message) => { throw new ClawbotError(code, message); };
// Fixed local messages only: never expose provider bodies, credentials or URLs.
function pollErrorMessage(code) {
    switch (code) {
        case 'clawbot-auth-expired': return '微信连接已失效，请重新绑定。';
        case 'clawbot-capacity': return '本机收件记录已满，接入已暂停；原记录未删除。';
        case 'clawbot-invalid-response': return '微信返回的数据暂不兼容，正在重试；持续出现时请更新插件。';
        case 'clawbot-response-too-large': return '微信消息超过本地处理上限，正在重试；本批消息尚未接入。';
        case 'clawbot-untrusted-url': return '微信接口地址校验未通过，正在重试；请核对插件版本。';
        case 'clawbot-api-error':
        case 'clawbot-http-error': return '微信服务暂未接受请求，正在重试；不会重复提交已有任务。';
        case 'clawbot-network-error':
        case 'clawbot-timeout': return 'ClawBot 连接暂不可用，正在等待重连；不会重复提交已有任务。';
        default: return 'ClawBot 接入处理异常，正在重试；请核对插件状态。';
    }
}
/** Independently owned channel. No phone connection, relay account, model tool,
 * native preset mutation, or host process lifecycle is used here. */
export class ClawbotRuntime {
    storage;
    host;
    client;
    now;
    access;
    data;
    lifetime = new AbortController();
    polling;
    pollTask;
    worker;
    commandWorker;
    deliveryWorker;
    broken = false;
    login;
    loginPoll;
    loginWatch;
    message = '';
    state = 'disabled';
    closed = false;
    commandQueue = Promise.resolve();
    questions = new Map();
    constructor(storage, host, client = new ILinkClient(), now = Date.now, access) {
        this.storage = storage;
        this.host = host;
        this.client = client;
        this.now = now;
        this.access = access;
        this.data = storage.read();
        // A hot component reload may retain the phone/gateway connection epoch but
        // never restores an in-memory QR attempt. Fence all prior instance replies.
        if (this.data.revision > 0)
            this.commit(d => { d.revision++; });
        // After an interrupted process, neither a host dispatch nor a provider
        // delivery can safely be repeated just because its acknowledgement is lost.
        if (this.data.receipts.some(r => r.state === 'running' || r.state === 'sending')) {
            this.commit(d => {
                for (const r of d.receipts)
                    if (r.state === 'running' || r.state === 'sending') {
                        sealUnsentAttention(d, r.id);
                        r.state = 'uncertain';
                        r.input = '';
                        r.output = undefined;
                        r.parts = undefined;
                        r.contextToken = '';
                    }
            });
            this.message = '有上次中断的处理或发送，未自动重试，请在原会话核对。';
        }
        // Pre-entitlement versions never captured an account owner. Do not adopt
        // their token in the background: the owner must explicitly enable once.
        if (access?.identity && this.data.enabled && !this.data.accessBinding) {
            this.commit(d => { d.enabled = false; d.revision++; });
            this.message = '升级后请核对绑定的微信，并重新启用私聊接入。原绑定和会话已保留。';
        }
        this.resume();
    }
    commit(change) {
        const next = structuredClone(this.data);
        change(next);
        validateClawbotData(next);
        this.storage.write(next);
        this.data = next;
    }
    checkRevision(request) {
        if (request.expectedRevision !== this.data.revision)
            fail('clawbot-conflict', '状态已经变化，请刷新后再操作。');
    }
    checkOperational(request) {
        // Recovering disk space does not recover this stopped runtime. In particular,
        // never return a successful enable/bind receipt while resume() is fenced off.
        const safe = request?.action === 'login.cancel' || request?.action === 'enabled' && request.enabled === false;
        if (this.broken && !safe)
            fail('clawbot-restart-required', RESTART_MESSAGE);
    }
    accessFailure(error) {
        const message = error instanceof Error ? error.message : '暂时无法核对使用资格，请联网后刷新。';
        this.polling?.abort();
        try {
            if (this.data.enabled)
                this.commit(d => { d.enabled = false; d.revision++; });
        }
        catch {
            this.broken = true;
            this.state = 'error';
            this.message = RESTART_MESSAGE;
        }
        try {
            this.retireQuestions();
        }
        catch {
            this.broken = true;
            this.state = 'error';
            this.message = RESTART_MESSAGE;
        }
        if (this.login && activeLoginStatus(this.login.status)) {
            this.commit(d => { d.revision++; });
            this.login.status = 'error';
            this.endLogin(this.login);
        }
        if (!this.broken)
            this.message = message;
        return fail('feature-access-denied', message);
    }
    async authorize() { try {
        await this.access?.authorize();
    }
    catch (error) {
        this.accessFailure(error);
    } ; this.currentAccess(); }
    sameOwner(a, b) { return a.nodeId === b.nodeId && a.accountInstance === b.accountInstance; }
    currentAccess() {
        try {
            this.access?.current();
            const owner = this.access?.identity?.();
            if (owner && ((this.data.accessBinding && !this.sameOwner(this.data.accessBinding, owner)) || (this.login?.owner && !this.sameOwner(this.login.owner, owner))))
                throw new Error('此节点的账号绑定已变化。请移除原本地微信绑定后重新绑定，不会沿用旧账号的连接。');
        }
        catch (error) {
            this.accessFailure(error);
        }
    }
    requiresAccess(request) {
        return !['status', 'sessions', 'login.cancel', 'disconnect'].includes(request.action) && !(request.action === 'enabled' && request.enabled === false);
    }
    snapshot() {
        this.expireLogin();
        return { supported: true, revision: this.data.revision, enabled: this.data.enabled,
            state: !this.data.enabled ? 'disabled' : !this.data.credentials ? 'unpaired' : this.state,
            paired: Boolean(this.data.credentials), bindingState: !this.data.credentials ? 'unpaired' : this.data.authExpired ? 'expired' : 'paired',
            target: this.data.target && { ...this.data.target }, message: this.message,
            pending: this.data.receipts.filter(r => !terminal(r)).length,
            uncertain: this.data.receipts.filter(r => r.state === 'uncertain').length,
            ...(this.login ? { pairing: { id: this.login.id, url: this.login.url, qrDataUrl: this.login.qrDataUrl,
                    status: this.login.status, expiresAt: this.login.started + LOGIN_LIFETIME } } : {}) };
    }
    endLogin(login) {
        if (this.loginWatch?.login === login) {
            clearTimeout(this.loginWatch.timer);
            clearTimeout(this.loginWatch.deadline);
            this.loginWatch = undefined;
        }
        login.abort.abort();
        this.client.forgetQr?.(login.qrcode);
        login.url = '';
        login.qrDataUrl = '';
        login.qrcode = '';
    }
    expireLogin(deadlineElapsed = false) {
        if (this.broken)
            return; // Preserve the restart diagnostic until disposal.
        const login = this.login;
        if (login && activeLoginStatus(login.status) && (deadlineElapsed || this.now() >= login.started + LOGIN_LIFETIME)) {
            this.commit(d => { d.revision++; });
            login.status = 'expired';
            this.endLogin(login);
            this.message = '二维码已过期，请重新生成。';
        }
    }
    /** The node owns a requested login, even while both control pages are closed.
     * Only read its result, for this attempt's bounded lifetime; never restart a
     * login, resend a verification code, or enable message receiving here. */
    watchLogin(login) {
        const watch = { login, failures: 0 };
        this.loginWatch = watch;
        watch.deadline = setTimeout(() => {
            if (this.loginWatch !== watch || this.closed)
                return;
            // The timer enforces the bound even if the computer clock moves back.
            try {
                this.expireLogin(true);
            }
            catch {
                this.failLoginStorage(login);
            }
        }, Math.max(0, login.started + LOGIN_LIFETIME - this.now()));
        watch.deadline.unref?.();
        this.scheduleLoginWatch(login);
    }
    failLoginStorage(login) {
        // Do not turn a background persistence exception into an unhandled timer
        // rejection or an apparently successful binding. Preserve the old file.
        this.broken = true;
        this.state = 'error';
        login.status = 'error';
        this.endLogin(login);
        this.message = '绑定记录未能保存，已停止接入。请核对本地记录后重启组件。';
    }
    scheduleLoginWatch(login) {
        const watch = this.loginWatch;
        if (!watch || watch.login !== login || watch.timer || watch.task || this.closed || this.broken
            || this.login !== login || login.abort.signal.aborted || !activeLoginStatus(login.status)
            || login.status === 'need_verifycode')
            return;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(watch.failures, 4));
        watch.timer = setTimeout(() => {
            watch.timer = undefined;
            if (this.loginWatch !== watch || this.closed || login.abort.signal.aborted
                || !activeLoginStatus(login.status) || login.status === 'need_verifycode')
                return;
            // The existing single-flight lane also handles passive UI reads and
            // explicit verification. Closing a UI cannot abort this node-owned read.
            watch.task = this.control({ action: 'login.poll', loginId: login.id }, this.lifetime.signal)
                .then(() => { watch.failures = 0; })
                .catch(error => {
                if (this.login !== login || login.abort.signal.aborted || this.closed || this.broken)
                    return;
                // An explicit verification submission supersedes this passive read.
                // Its cancellation is not a provider failure and must not cancel the
                // still-pending code submission or erase its next verification state.
                if (error.name === 'AbortError')
                    return;
                try {
                    const retry = ['clawbot-network-error', 'clawbot-timeout', 'clawbot-http-error', 'clawbot-api-error']
                        .includes(error.code || '');
                    const message = retry ? LOGIN_RETRY_MESSAGE
                        : '绑定状态未能确认，请重新生成二维码。';
                    if (this.message !== message || !retry)
                        this.commit(d => { d.revision++; });
                    this.message = message;
                    if (retry)
                        watch.failures++;
                    else {
                        login.status = 'error';
                        this.endLogin(login);
                    }
                }
                catch {
                    this.failLoginStorage(login);
                }
            }).finally(() => {
                watch.task = undefined;
                this.scheduleLoginWatch(login);
            });
        }, delay);
        watch.timer.unref?.();
    }
    async control(request, signal) {
        if (!request || typeof request.action !== 'string')
            fail('clawbot-invalid', '无效的 ClawBot 操作');
        signal.throwIfAborted();
        if (this.closed)
            fail('clawbot-stopped', 'ClawBot 组件已停用');
        if (request.action === 'status')
            return this.snapshot();
        if (request.action === 'sessions')
            return { sessions: await this.host.listSessions(signal) };
        this.checkOperational(request);
        if (this.requiresAccess(request))
            await this.authorize();
        if (request.action === 'login.poll')
            return this.mutate(request, signal);
        const activeLogin = this.login;
        if (request.action === 'login.cancel' && activeLogin && activeLogin.id === request.loginId)
            activeLogin.abort.abort();
        // Serializes control mutations but never a long-running DSH turn.
        const task = this.commandQueue.then(() => this.mutate(request, signal));
        this.commandQueue = task.catch(() => { });
        return task;
    }
    async mutate(request, signal) {
        signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        this.checkOperational(request);
        if (this.requiresAccess(request))
            this.currentAccess();
        switch (request.action) {
            case 'route': {
                this.checkRevision(request);
                if (!request.sessionId)
                    fail('clawbot-invalid', '请选择会话');
                const found = await this.host.describeSession(request.sessionId, signal);
                signal.throwIfAborted();
                this.lifetime.signal.throwIfAborted();
                this.checkOperational(request);
                this.checkRevision(request);
                this.currentAccess();
                if (!found)
                    fail('clawbot-session-missing', '此会话已不可选择，请刷新列表。');
                this.commit(d => { d.target = found; d.revision++; });
                break;
            }
            case 'enabled': {
                this.checkRevision(request);
                if (typeof request.enabled !== 'boolean')
                    fail('clawbot-invalid', '请指定开启或暂停');
                if (this.broken && !this.data.enabled)
                    return this.snapshot();
                this.expireLogin();
                if (request.enabled && this.login && activeLoginStatus(this.login.status))
                    fail('clawbot-login-active', '请先完成或取消微信绑定。');
                if (request.enabled && !this.data.credentials)
                    fail('clawbot-unpaired', '请先绑定微信。');
                if (request.enabled && this.data.authExpired)
                    fail('clawbot-auth-expired', '微信连接已失效，请重新绑定。');
                if (request.enabled && !this.data.target)
                    fail('clawbot-target-required', '请先选择一个会话。');
                const owner = request.enabled ? this.access?.identity?.() : undefined;
                this.commit(d => { d.enabled = request.enabled; if (owner && !d.accessBinding)
                    d.accessBinding = owner; d.revision++; });
                if (this.login && !activeLoginStatus(this.login.status))
                    this.login = undefined;
                if (request.enabled) {
                    this.message = '';
                    this.resume();
                }
                else {
                    this.polling?.abort();
                    this.retireQuestions();
                    if (!this.broken)
                        this.message = '已暂停接入；DSH 中已经开始的任务不会被取消。';
                }
                break;
            }
            case 'login.start': {
                if (request.expectedRevision !== undefined)
                    this.checkRevision(request);
                this.expireLogin();
                // Both control surfaces observe the same attempt. Merely opening the
                // second surface must not rotate a QR that is already being scanned.
                if (this.login && activeLoginStatus(this.login.status))
                    return this.snapshot();
                if (this.data.enabled && this.data.credentials)
                    fail('clawbot-busy', '请先暂停接入，再重新绑定。');
                // Repair the old enabled-without-credentials dead end without touching a
                // running identity or changing the user's eventual start preference.
                if (this.data.enabled)
                    this.commit(d => { d.enabled = false; d.revision++; });
                const abort = new AbortController();
                const owner = this.access?.identity?.();
                const combined = AbortSignal.any([signal, this.lifetime.signal, abort.signal]);
                const qr = await this.client.getQr(combined, this.data.credentials && !this.data.authExpired ? [this.data.credentials.token] : []);
                try {
                    const qrDataUrl = await QRCode.toDataURL(qr.url, { width: 240, margin: 2 });
                    combined.throwIfAborted();
                    this.checkOperational(request);
                    this.currentAccess();
                    if (owner && !this.sameOwner(owner, this.access.identity()))
                        this.accessFailure(new Error('节点或账号已变化，请重新开始绑定。'));
                    this.commit(d => { d.revision++; });
                    this.login = { id: randomUUID(), qrcode: qr.qrcode, url: qr.url, qrDataUrl, status: 'wait', started: this.now(), abort, ...(owner ? { owner } : {}) };
                    this.watchLogin(this.login);
                }
                catch (error) {
                    this.client.forgetQr?.(qr.qrcode);
                    throw error;
                }
                this.message = '请用微信扫一扫扫描电脑上的二维码，并在微信中确认。';
                break;
            }
            case 'login.poll': {
                this.expireLogin();
                const login = this.login;
                if (!login || login.id !== request.loginId)
                    fail('clawbot-login-stale', '绑定已取消或更新，请刷新。');
                if (!activeLoginStatus(login.status))
                    return this.snapshot();
                const previous = this.loginPoll;
                if (previous && previous.login === login) {
                    if (request.verifyCode === undefined)
                        return this.snapshot();
                    if (previous.verifying)
                        fail('clawbot-login-busy', '微信确认码仍在提交，请稍候核对或取消绑定；不要重复提交。');
                    previous.abort.abort();
                }
                const polling = { login: login, abort: new AbortController(), verifying: request.verifyCode !== undefined };
                this.loginPoll = polling;
                const combined = AbortSignal.any([signal, this.lifetime.signal, login.abort.signal, polling.abort.signal]);
                try {
                    const result = await this.client.pollQr(login.qrcode, combined, request.verifyCode);
                    combined.throwIfAborted();
                    if (this.login !== login)
                        return this.snapshot();
                    await this.authorize();
                    combined.throwIfAborted();
                    const finish = this.commandQueue.then(() => { combined.throwIfAborted(); this.completeLogin(login, result); });
                    this.commandQueue = finish.catch(() => { });
                    await finish;
                }
                finally {
                    if (this.loginPoll === polling)
                        this.loginPoll = undefined;
                    this.scheduleLoginWatch(login);
                }
                break;
            }
            case 'login.cancel': {
                if (this.login && (!request.loginId || this.login.id !== request.loginId))
                    fail('clawbot-login-stale', '绑定状态已更新，请刷新。');
                if (this.login) {
                    this.commit(d => { d.revision++; });
                    this.endLogin(this.login);
                }
                this.login = undefined;
                if (!this.broken)
                    this.message = '';
                break;
            }
            case 'disconnect': {
                this.checkRevision(request);
                this.expireLogin();
                if (this.login && activeLoginStatus(this.login.status))
                    fail('clawbot-login-active', '请先取消正在进行的绑定。');
                if (this.data.enabled)
                    fail('clawbot-busy', '请先暂停接入，再移除本地绑定。');
                if (this.data.receipts.some(r => !terminal(r)) && request.abandonPending !== true)
                    fail('clawbot-pending', '仍有待处理或待发消息；须明确确认停止这些渠道消息后才能解绑。电脑上已开始的任务不会被取消。');
                this.commit(d => {
                    for (const r of d.receipts)
                        if (!terminal(r)) {
                            r.state = 'uncertain';
                            r.input = '';
                            r.output = undefined;
                            r.parts = undefined;
                            r.contextToken = '';
                        }
                    d.credentials = null;
                    d.accessBinding = undefined;
                    d.authExpired = false;
                    d.target = null;
                    d.cursor = '';
                    d.revision++;
                });
                this.retireQuestions();
                if (this.login) {
                    this.endLogin(this.login);
                    this.login = undefined;
                }
                this.message = '已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。';
                break;
            }
            default: fail('clawbot-invalid', '不支持的 ClawBot 操作');
        }
        return this.snapshot();
    }
    completeLogin(login, result) {
        this.lifetime.signal.throwIfAborted();
        this.checkOperational();
        this.currentAccess();
        this.expireLogin();
        if (this.login !== login || login.abort.signal.aborted)
            return;
        if (this.data.enabled)
            fail('clawbot-busy', '请先暂停接入，再完成绑定。');
        if (result.credentials) {
            if (this.data.credentials && this.data.credentials.userId !== result.credentials.userId) {
                this.commit(d => { d.revision++; });
                this.endLogin(login);
                this.login = undefined;
                this.message = '此次确认的是另一个微信账号。未替换原绑定；如需换号，请先明确移除本地绑定。';
                fail('clawbot-different-user', this.message);
            }
            if (this.data.credentials && this.data.credentials.accountId !== result.credentials.accountId
                && this.data.receipts.some(r => !terminal(r))) {
                this.commit(d => { d.revision++; });
                this.endLogin(login);
                this.login = undefined;
                this.message = '原连接仍有未完成的消息，未替换本地绑定。请先处理原消息，或确认停止这些消息后移除绑定。';
                fail('clawbot-pending', this.message);
            }
            this.commit(d => {
                if (d.credentials?.accountId !== result.credentials.accountId) {
                    d.cursor = '';
                }
                d.credentials = result.credentials;
                if (login.owner)
                    d.accessBinding = login.owner;
                d.authExpired = false;
                d.revision++;
            });
            this.endLogin(login);
            this.login = undefined;
            this.message = '微信已绑定。选择接入会话并启用私聊接入后即可使用。';
        }
        else if (result.status === 'binded_redirect' && this.data.credentials) {
            this.commit(d => { if (login.owner && !d.accessBinding)
                d.accessBinding = login.owner; d.revision++; });
            this.endLogin(login);
            this.login = undefined;
            this.message = this.data.authExpired ? '原微信连接已失效，请重新绑定。'
                : '微信确认本节点已有绑定。选择会话并开启接入后即可使用。';
        }
        else {
            // Only an actual successful provider read can clear our transient retry
            // notice. A coalesced UI snapshot never reaches this method, and unrelated
            // diagnostics remain intact when the provider has no new message.
            const message = result.message || (this.message === LOGIN_RETRY_MESSAGE ? '' : this.message);
            if (login.status !== result.status || this.message !== message)
                this.commit(d => { d.revision++; });
            login.status = result.status;
            if (!activeLoginStatus(result.status))
                this.endLogin(login);
            this.message = message;
        }
    }
    resume() {
        if (this.closed || this.broken || !this.data.enabled || !this.data.credentials || this.data.authExpired)
            return;
        if (!this.pollTask) {
            const controller = new AbortController();
            this.polling = controller;
            this.pollTask = this.poll(controller.signal).catch(() => {
                if (!this.closed && !controller.signal.aborted) {
                    this.broken = true;
                    this.state = 'error';
                    this.message = 'ClawBot 接入已暂停，请核对本地记录和连接。';
                    this.retireQuestions();
                }
            }).finally(() => {
                this.pollTask = undefined;
                if (this.polling === controller)
                    this.polling = undefined;
                if (controller.signal.aborted && !this.closed && this.data.enabled)
                    this.resume();
            });
        }
        this.work();
    }
    async delay(ms, signal) {
        signal.throwIfAborted();
        await new Promise(resolve => {
            const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, ms);
            timer.unref?.();
            signal.addEventListener('abort', finish, { once: true });
        });
    }
    async poll(signal) {
        let failures = 0;
        while (!signal.aborted && !this.closed && this.data.enabled && this.data.credentials) {
            try {
                await this.authorize();
                signal.throwIfAborted();
                this.state = 'connecting';
                const updates = await this.client.getUpdates(this.data.credentials, this.data.cursor, signal);
                signal.throwIfAborted();
                // A normal long-poll may span the short authority lease. Revalidate
                // before accepting its data; never extend stale cached permission.
                await this.authorize();
                signal.throwIfAborted();
                // Durably accept the entire batch with its cursor. Never acknowledge a
                // batch before enqueueing it or after only accepting part of it.
                this.ingest(updates.messages, updates.cursor);
                failures = 0;
                this.state = 'ready';
                this.message = '';
                this.work();
                if (!updates.messages.length)
                    await this.delay(500, signal);
            }
            catch (error) {
                if (signal.aborted || this.closed)
                    break;
                failures++;
                const code = error.code;
                this.state = 'error';
                this.message = pollErrorMessage(code);
                if (code === 'clawbot-auth-expired' || code === 'clawbot-capacity') {
                    this.commit(d => { d.enabled = false; if (code === 'clawbot-auth-expired')
                        d.authExpired = true; d.revision++; });
                    this.retireQuestions();
                    break;
                }
                await this.delay(Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)), signal);
            }
        }
    }
    /** Exposed for deterministic contract testing, not a public RPC. */
    ingest(messages, cursor) {
        this.currentAccess();
        if (!this.data.credentials)
            fail('clawbot-unpaired', '尚未绑定微信');
        this.commit(d => {
            d.receipts = d.receipts.filter(r => !terminal(r) || this.now() - r.createdAt < RETENTION);
            const seen = new Set(d.receipts.map(r => r.id));
            for (const m of messages) {
                // Binding user identity is a provider identity, never a mini OpenID.
                if (m.userId !== d.credentials.userId)
                    continue;
                const id = createHash('sha256').update(`${d.credentials.accountId}\0${m.userId}\0${m.id}`).digest('hex');
                if (seen.has(id))
                    continue;
                if (d.receipts.length >= MAX_RECEIPTS)
                    fail('clawbot-capacity', 'ClawBot 收件记录已满');
                seen.add(id);
                const invalid = m.unsupported || !m.text.trim() || m.text.length > MAX_INPUT;
                d.receipts.push({ id, userId: m.userId, contextToken: m.contextToken, input: invalid ? '' : m.text,
                    target: d.target && { ...d.target }, revision: d.revision, createdAt: this.now(), state: invalid ? 'ready' : 'pending',
                    ...(invalid ? { output: '首版支持文字消息（最多 8000 字符）。图片、语音和文件请在小程序或电脑继续。' } : {}) });
            }
            d.cursor = cursor;
        });
    }
    work() {
        if (this.closed || this.broken || !this.data.enabled)
            return;
        const failed = () => { this.broken = true; this.state = 'error'; this.message = '本地记录保存失败，接入已停止，请核对原会话后重启组件。'; this.polling?.abort(); this.retireQuestions(); };
        if (!this.worker && this.data.receipts.some(r => r.state === 'pending' && !r.input.trim().startsWith('/')))
            this.worker = this.process(false).catch(failed).finally(() => { this.worker = undefined; this.work(); });
        if (!this.commandWorker && this.data.receipts.some(r => r.state === 'pending' && r.input.trim().startsWith('/')))
            this.commandWorker = this.process(true).catch(failed).finally(() => { this.commandWorker = undefined; this.work(); });
        this.deliver();
    }
    update(id, patch) {
        this.commit(d => { const r = d.receipts.find(r => r.id === id); if (r)
            Object.assign(r, patch); });
    }
    async command(r) {
        this.currentAccess();
        const text = r.input.trim();
        if (!text.startsWith('/'))
            return null;
        if (text === '/帮助' || text === '/help')
            return '/会话：列出可接入的会话\n/切换 编号：切换接入会话\n/状态：查看当前接入\n/回答 问题编号 答案：按提问中的示例回答\n普通文字直接发送到接入会话；审批请在小程序或电脑处理。';
        if (/^\/回答(?:\s|$)/.test(text))
            return this.answerQuestion(r, text);
        if (text === '/状态')
            return `接入会话：${this.data.target?.title || '尚未选择'}。私聊接入${this.data.enabled ? '已启用' : '已暂停'}。`;
        if (text === '/会话') {
            const sessions = await this.host.listSessions(this.lifetime.signal);
            return sessions.length ? sessions.slice(0, 40).map(s => `${this.shortId(s.id)} · ${s.title}`).join('\n') + '\n发送 /切换 编号。' : '当前节点没有可选择的普通会话，请先在 DSH 新建会话。';
        }
        const match = text.match(/^\/切换\s+(\S+)$/);
        if (match) {
            const sessions = await this.host.listSessions(this.lifetime.signal);
            const found = sessions.filter(s => this.shortId(s.id) === match[1]);
            if (found.length !== 1)
                return '编号不存在或不唯一，请发送 /会话 获取当前编号。';
            const target = await this.host.describeSession(found[0].id, this.lifetime.signal);
            // Commands and owner control use the same mutation queue. Already received
            // messages keep their own captured target, even if still waiting to run.
            const operation = this.commandQueue.then(() => {
                this.lifetime.signal.throwIfAborted();
                this.checkOperational();
                this.currentAccess();
                if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running')
                    return;
                this.commit(d => { d.target = target; d.revision++; });
            });
            this.commandQueue = operation.catch(() => { });
            await operation;
            return `已接到「${found[0].title}」。现在发送的文字将进入此会话；先前已接收的消息仍属于原会话。`;
        }
        return '未知 ClawBot 指令。发送 /帮助 查看；首版不把斜杠指令转给 DSH 执行。';
    }
    shortId(id) { return createHash('sha256').update(id).digest('hex').slice(0, 8); }
    /** The native capability lives only while the original observer is alive.
     * Text receipts stay durable, but restart never reconstructs an answerer. */
    question(r, question) {
        if (this.closed || this.broken || question.signal.aborted
            || this.data.receipts.find(item => item.id === r.id)?.state !== 'running')
            return question.handoff();
        const fallback = () => { question.handoff(); this.attention(r, 'question'); };
        if (!this.data.enabled || !this.data.credentials || this.questions.size >= 8
            || !question.id || question.id.length > 256 || !validateQuestions(question.questions))
            return fallback();
        const noticeId = createHash('sha256').update(`question\0${r.id}\0${question.id}`).digest('hex');
        if (this.data.receipts.some(item => item.id === noticeId))
            return question.handoff();
        const codes = question.questions.map(item => 'Q' + createHash('sha256')
            .update(`${noticeId}\0${item.id}`).digest('hex').slice(0, 10).toUpperCase());
        if (new Set(codes).size !== codes.length || [...this.questions.values()].some(batch => batch.codes.some(code => codes.includes(code))))
            return fallback();
        let output;
        try {
            output = formatQuestions(r.target?.title || 'ClawBot', question.questions, codes);
        }
        catch {
            return fallback();
        }
        if (this.data.receipts.length >= MAX_RECEIPTS)
            fail('clawbot-capacity', '本机收件记录已满，请在原会话回答。');
        this.commit(d => {
            d.receipts.push({ id: noticeId, parentId: r.id, userId: r.userId, contextToken: r.contextToken,
                target: r.target, revision: r.revision, createdAt: this.now(), state: 'ready', input: '', output });
        });
        const abort = () => {
            try {
                this.retireQuestion(noticeId);
            }
            catch {
                this.broken = true;
                this.state = 'error';
                this.message = RESTART_MESSAGE;
                this.polling?.abort();
                this.retireQuestions();
            }
        };
        this.questions.set(noticeId, { parent: r, accountId: this.data.credentials.accountId, question, codes,
            answers: new Map(), detach: () => question.signal.removeEventListener('abort', abort) });
        question.signal.addEventListener('abort', abort, { once: true });
        if (question.signal.aborted)
            abort();
        this.deliver();
    }
    retireQuestion(id, handoff = true) {
        const batch = this.questions.get(id);
        if (!batch)
            return;
        batch.detach();
        this.questions.delete(id);
        if (handoff)
            batch.question.handoff();
        if (this.closed || this.broken)
            return;
        const notice = this.data.receipts.find(item => item.id === id);
        // A fragment already handed to Tencent may still arrive. Seal the remaining
        // fragments, never cancel a provider send or pretend its outcome is known.
        if (notice && (notice.state === 'ready' || notice.state === 'sending'))
            this.update(id, {
                state: notice.state === 'sending' ? 'uncertain' : 'done', input: '', output: undefined, parts: undefined, contextToken: '',
            });
    }
    retireQuestions(parentId) {
        let failure;
        for (const [id, batch] of this.questions)
            if (!parentId || batch.parent.id === parentId) {
                try {
                    this.retireQuestion(id);
                }
                catch (error) {
                    failure ??= error;
                }
            }
        if (failure)
            throw failure;
    }
    async answerQuestion(r, text) {
        const match = text.match(/^\/回答\s+(Q[A-F0-9]{10})\s+([\s\S]+)$/i);
        if (!match)
            return '请按提问中的示例回复：/回答 问题编号 答案。自由回答请在内容前加“文字”。';
        const code = match[1].toUpperCase();
        const found = [...this.questions.entries()].find(([, batch]) => batch.codes.includes(code));
        const stale = '这个问题已失效或已处理。请在原会话核对；没有重新发送任务。';
        if (!found)
            return stale;
        const [noticeId, batch] = found, index = batch.codes.indexOf(code), question = batch.question;
        this.currentAccess();
        if (!this.data.enabled || question.signal.aborted || this.data.credentials?.accountId !== batch.accountId
            || r.userId !== batch.parent.userId || this.data.credentials?.userId !== r.userId
            || this.data.receipts.find(item => item.id === batch.parent.id)?.state !== 'running') {
            this.retireQuestion(noticeId);
            return stale;
        }
        if (match[2].trim() === '转原会话') {
            this.retireQuestion(noticeId);
            return `【${batch.parent.target?.title || 'ClawBot'}】\n已交回原会话，请在小程序或电脑回答。本组尚未提交的回答需重新填写；任务未重新发送。`;
        }
        if (batch.answers.has(code))
            return `这一题已经记录，不会重复提交。请继续回答其余问题；要改用原会话，请发送 /回答 ${code} 转原会话。`;
        let answer;
        try {
            answer = parseQuestionAnswer(question.questions[index], match[2].trim());
        }
        catch (error) {
            return error instanceof ClawbotError ? error.message : '答案格式不正确，请按提问中的示例回复。';
        }
        const collected = new Map(batch.answers);
        collected.set(code, answer);
        if (Buffer.byteLength(JSON.stringify({ answers: [...collected.values()] })) > 32 * 1024)
            return `这组答案内容较长，本题尚未记录。请缩短本题回答，或发送 /回答 ${code} 转原会话。`;
        batch.answers.set(code, answer);
        if (batch.answers.size < batch.codes.length)
            return `已记录本题，请继续回答 ${batch.codes.filter(item => !batch.answers.has(item)).join('、')}。全部答完后才会提交。`;
        const value = { answers: batch.codes.map(item => batch.answers.get(item)) };
        // The command's running receipt is already on disk. Retire the capability
        // before the native write: an unknown response is never a replay permit.
        try {
            this.retireQuestion(noticeId, false);
            this.currentAccess();
            await question.answer(value);
            return `【${batch.parent.target?.title || 'ClawBot'}】\n回答已提交。`;
        }
        catch {
            question.handoff();
            return `【${batch.parent.target?.title || 'ClawBot'}】\n未能确认这次回答是否被接收，请在原会话核对。没有自动重试，也没有重新发送任务。`;
        }
    }
    /** Notices reuse the same durable outbox and delivery fences as final replies.
     * At most two per request; no new sender, polling loop or replay permission. */
    attention(r, kind) {
        if (this.closed || this.broken || this.data.receipts.find(item => item.id === r.id)?.state !== 'running')
            return;
        const id = attentionId(r.id, kind);
        if (this.data.receipts.some(item => item.id === id))
            return;
        if (this.data.receipts.length >= MAX_RECEIPTS)
            fail('clawbot-capacity', '本机收件记录已满，请在原会话处理并查看结果。');
        const action = kind === 'approval' ? '确认审批' : '回答问题';
        this.commit(d => {
            d.receipts.push({ id, userId: r.userId, contextToken: r.contextToken, input: '',
                target: r.target, revision: r.revision, createdAt: this.now(), state: 'ready',
                output: `【${r.target?.title || 'ClawBot'}】\n请打开小程序或电脑中的此会话${action}。任务未取消；保持私聊接入开启，会继续等待本次结果（最多 15 分钟）。` });
        });
        this.deliver();
    }
    async process(commands) {
        while (!this.closed && !this.broken && this.data.enabled && this.data.credentials) {
            const r = this.data.receipts.find(r => r.state === 'pending' && r.input.trim().startsWith('/') === commands);
            if (!r)
                return;
            try {
                await this.authorize();
            }
            catch {
                return;
            }
            if (this.closed || this.broken || !this.data.enabled)
                return;
            if (this.data.receipts.find(item => item.id === r.id)?.state === 'pending') {
                this.update(r.id, { state: 'running' });
                let output;
                try {
                    const command = await this.command(r);
                    if (this.broken)
                        return;
                    if (command !== null)
                        output = command;
                    else if (!r.target)
                        output = '尚未选择接入会话。请发送 /会话，或在电脑插件／小程序中选择。';
                    else if (!Number.isSafeInteger(r.target.generation))
                        output = '接入会话需要重新选择，未派发此次输入。';
                    else {
                        this.currentAccess();
                        const result = await this.host.run({ sessionId: r.target.id, expectedGeneration: r.target.generation, requestId: `clawbot-${r.id}`, text: r.input }, this.lifetime.signal, kind => this.attention(r, kind), question => this.question(r, question));
                        output = `【${r.target.title}】\n${result.text || '本轮已结束，没有可发送的文字回复。'}`;
                    }
                }
                catch (error) {
                    if (this.closed || this.broken)
                        return;
                    // Do not leak host paths, tool arguments or arbitrary exception data.
                    output = `【${r.target?.title || 'ClawBot'}】\n${error instanceof ClawbotError ? error.message : '未能确认本轮完整回复。请到原会话查看是否需要审批、仍在运行或已失败；不会自动重复提交。'}`;
                }
                if (this.closed || this.broken)
                    return;
                this.retireQuestions(r.id);
                // Explicit disconnect may seal the old account's in-flight receipt. A late
                // host result must not revive it and send through a different bot.
                if (this.data.receipts.find(item => item.id === r.id)?.state !== 'running')
                    continue;
                const bounded = output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + '\n（回复较长，完整内容请在原会话查看）' : output;
                this.commit(d => {
                    sealUnsentAttention(d, r.id);
                    Object.assign(d.receipts.find(item => item.id === r.id), { state: 'ready', output: bounded, input: '' });
                });
                this.deliver();
            }
        }
    }
    deliver() {
        if (this.deliveryWorker || this.closed || this.broken || !this.data.enabled || !this.data.receipts.some(r => r.state === 'ready'))
            return;
        this.deliveryWorker = this.drain().catch(() => { this.broken = true; this.state = 'error'; this.message = '发送记录保存失败，已停止接入，请核对原会话。'; this.polling?.abort(); this.retireQuestions(); })
            .finally(() => { this.deliveryWorker = undefined; this.deliver(); });
    }
    async drain() {
        while (!this.closed && !this.broken && this.data.enabled && this.data.credentials) {
            const current = this.data.receipts.find(item => item.state === 'ready');
            if (!current)
                return;
            const r = current;
            const parts = current.parts || splitText(current.output || '');
            for (let index = current.sentParts || 0; index < parts.length; index++) {
                try {
                    await this.authorize();
                }
                catch {
                    return;
                }
                if (this.closed || this.broken || !this.data.enabled)
                    return;
                // Authorization may yield while completion retires an unsent notice or
                // disconnect seals the old binding. Never revive the captured receipt.
                const latest = this.data.receipts.find(item => item.id === r.id);
                if (latest?.state !== 'ready' || (latest.sentParts || 0) !== index)
                    break;
                this.update(r.id, { state: 'sending', parts, sentParts: index });
                const sendingCredentials = this.data.credentials;
                try {
                    await this.client.sendText(sendingCredentials, { userId: r.userId, contextToken: r.contextToken,
                        text: parts[index], clientId: `dsh-${r.id.slice(0, 32)}-${index}` }, this.lifetime.signal);
                }
                catch (error) {
                    if (this.closed || this.broken)
                        return;
                    if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending')
                        break;
                    this.update(r.id, { state: 'uncertain', input: '', output: undefined, parts: undefined, contextToken: '' });
                    this.retireQuestion(r.id);
                    // A paused send may finish after same-account reauthentication. Its
                    // old token rejection is not evidence that the replacement is invalid.
                    if (error.code === 'clawbot-auth-expired'
                        && this.data.credentials?.accountId === sendingCredentials.accountId
                        && this.data.credentials?.token === sendingCredentials.token) {
                        this.commit(d => { d.enabled = false; d.authExpired = true; d.revision++; });
                        this.polling?.abort();
                        this.retireQuestions();
                        this.message = '微信连接已失效，请重新绑定。未确认送达的回复请在原会话查看。';
                    }
                    else
                        this.message = '有回复发送结果不确定，未自动重发；完整结果仍在原 DSH 会话。';
                    break;
                }
                if (this.closed || this.broken)
                    return;
                if (this.data.receipts.find(item => item.id === r.id)?.state !== 'sending')
                    break;
                this.update(r.id, { state: index === parts.length - 1 ? 'done' : 'ready', sentParts: index + 1,
                    ...(index === parts.length - 1 ? { output: undefined, parts: undefined, contextToken: '' } : {}) });
            }
        }
    }
    async dispose() {
        if (this.closed)
            return;
        const loginTask = this.loginWatch?.task;
        this.closed = true;
        this.lifetime.abort();
        this.polling?.abort();
        if (this.login)
            this.endLogin(this.login);
        this.login = undefined;
        this.retireQuestions();
        await Promise.allSettled([this.worker, this.commandWorker, this.deliveryWorker, this.pollTask, this.commandQueue, loginTask]);
        this.storage.close();
    }
}
/** Conservative local text chunk size, counted as UTF-8 without splitting emoji. */
export function splitText(text) {
    const parts = [];
    let part = '', bytes = 0;
    for (const char of text) {
        const size = Buffer.byteLength(char);
        if (bytes + size > 1800) {
            parts.push(part);
            part = '';
            bytes = 0;
        }
        ;
        part += char;
        bytes += size;
    }
    if (part)
        parts.push(part);
    return parts.length ? parts : ['（无文字回复）'];
}
