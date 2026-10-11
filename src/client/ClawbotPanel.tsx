import { useEffect, useRef, useState } from 'react'
import type { ClawbotRequest, ClawbotSession, ClawbotStatus } from '../clawbot/contracts.js'
import { featureLeaseAllows } from './feature-client.js'
import styles from './HarnessRemoteSettings.module.css'

export type ClawbotCall = (request: ClawbotRequest) => Promise<ClawbotStatus | { sessions: ClawbotSession[] }>
const pairingLabels: Record<string, string> = { wait: '打开微信首页「＋ → 扫一扫」', scaned: '已扫码，请在微信中确认',
  need_verifycode: '请输入微信显示的验证码', expired: '绑定码已过期', verify_code_blocked: '验证码暂不可用，请稍后重新绑定',
  scaned_but_redirect: '请按微信提示继续确认', binded_redirect: '微信已有连接，请核对原节点' }
const activePairing = (pairing: ClawbotStatus['pairing'], now: number) => Boolean(pairing
  && ['wait', 'scaned', 'scaned_but_redirect', 'need_verifycode'].includes(pairing.status)
  && (pairing.expiresAt === undefined || pairing.expiresAt > now))
// Only exact, already-rendered routine messages are quiet. In particular a
// refused account replacement can leave state=disabled and paired=true: never
// hide its warning (or a future provider warning) based on that state alone.
const quietMessages = new Set([
  '正在继续微信确认流程', '请用手机微信扫描二维码并确认连接',
  '请继续完成手机微信中的确认', '请输入手机微信显示的数字验证码',
  '二维码已过期，请重新生成。',
  '请用微信扫一扫扫描电脑上的二维码，并在微信中确认。',
  '已暂停接入；DSH 中已经开始的任务不会被取消。',
  '微信已绑定。选择目标会话并开启接入后，即可在 ClawBot 私聊。',
  '微信确认本节点已有绑定。选择会话并开启接入后即可使用。',
  '原微信连接已失效，请重新绑定。',
  '微信连接已失效，请重新绑定。',
  '已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。',
])
// Terminal receipts are history, not current channel failures. Only exact known
// notices with matching receipt counts move into history; safety errors stay visible.
const historyMessages = new Set([
  '有回复发送结果不确定，未自动重发；完整结果仍在原 DSH 会话。',
  '有上次中断的处理或发送，未自动重试，请在原会话核对。',
])

/** Owner-facing channel controls. Not a second chat UI or a preset selector. */
export function ClawbotPanel({ call, nodeName, hostName }: { call: ClawbotCall; nodeName?: string; hostName?: string }): JSX.Element {
  const [status, setStatus] = useState<ClawbotStatus>()
  const [sessions, setSessions] = useState<ClawbotSession[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [now, setNow] = useState(Date.now)
  const [manageOpen, setManageOpen] = useState(false)
  const current = useRef(status); current.current = status
  const selectedByUser = useRef(false)
  const mounted = useRef(false)
  const foreground = useRef<{ action: string; token: object } | null>(null)
  const polling = useRef<object | null>(null)
  const refreshing = useRef<object | null>(null)
  const requestEpoch = useRef(0)
  const run = async (request: ClawbotRequest, silent = false, pauseBefore = false) => {
    if ((['login.start', 'login.poll', 'route'].includes(request.action) || request.action === 'enabled' && request.enabled)
      && !featureLeaseAllows(current.current?.access, current.current?.access)) return
    // A provider long poll must never swallow an explicit cancel or confirmation.
    // Separate lanes; a foreground action invalidates older display responses.
    const lane = request.action === 'login.poll' ? polling : refreshing
    if ((foreground.current && !(request.action === 'login.cancel' && foreground.current.action === 'login.poll')) || (silent && lane.current)) return
    const token = {}
    if (silent) lane.current = token
    else { foreground.current = { action: request.action, token }; requestEpoch.current++ }
    const epoch = requestEpoch.current
    if (!silent) { setBusy(true); setError('') }
    try {
      let actionRequest = request
      if (pauseBefore) {
        // A single confirmed management action may pause first. Never continue
        // after a failed/stale pause or on another node, and never auto-resume.
        const paused = await call({ action: 'enabled', enabled: false, expectedRevision: request.expectedRevision })
        if (!mounted.current || epoch !== requestEpoch.current) return
        if ('sessions' in paused || paused.enabled || paused.revision <= (request.expectedRevision ?? -1)
          || (current.current && paused.revision < current.current.revision))
          throw new Error('状态已变化，请刷新后重试。')
        current.current = paused; setStatus(paused)
        actionRequest = { ...request, expectedRevision: paused.revision }
      }
      const result = await call(actionRequest)
      if (!mounted.current || epoch !== requestEpoch.current) return
      if ('sessions' in result) setSessions(result.sessions)
      else {
        if (current.current && result.revision < current.current.revision) return
        const previous = current.current
        current.current = result; setStatus(result)
        setError('')
        if (previous?.pairing?.id !== result.pairing?.id) setCode('')
        if (!selectedByUser.current || request.action === 'route') {
          selectedByUser.current = false; setSelected(result.target?.id || '')
        }
      }
    } catch (cause) {
      if (mounted.current && epoch === requestEpoch.current &&
        (request.action !== 'login.poll' || current.current?.pairing?.id === request.loginId))
        setError(cause instanceof Error ? cause.message : '暂时无法读取状态')
    }
    finally {
      if (silent) { if (lane.current === token) lane.current = null }
      else if (foreground.current?.token === token) { foreground.current = null; if (mounted.current && epoch === requestEpoch.current) setBusy(false) }
    }
  }
  useEffect(() => {
    mounted.current = true; current.current = undefined; selectedByUser.current = false
    setStatus(undefined); setSessions([]); setSelected(''); setCode(''); setError(''); setManageOpen(false)
    void run({ action: 'status' })
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time)
      const login = current.current?.pairing
      // Status polling continues without a locally-created attempt: a QR code
      // requested from the phone appears here too, without clicking Refresh.
      if (featureLeaseAllows(current.current?.access, current.current?.access, time) && login && activePairing(login, time) && login.status !== 'need_verifycode')
        void run({ action: 'login.poll', loginId: login.id }, true)
      // The provider request can long-poll. It must not block another device's
      // cancellation, newly requested QR, route change or revoked credentials.
      void run({ action: 'status' }, true)
    }, 4000)
    return () => { mounted.current = false; requestEpoch.current++; foreground.current = null; polling.current = null; refreshing.current = null; clearInterval(timer) }
  }, [call])
  const refresh = async () => { await run({ action: 'status' }); await run({ action: 'sessions' }) }
  const login = status?.pairing
  const loginActive = activePairing(login, now)
  const expired = status?.bindingState === 'expired'
  const paired = Boolean(status?.paired && !expired)
  const allowed = featureLeaseAllows(status?.access, status?.access, now)
  const canEnable = Boolean(allowed && (status?.supportsEnableBeforeSetup || paired && status?.target && !loginActive))
  const accessNotice = status && !allowed ? status.access?.message || '暂时无法核对使用资格' : ''
  const historicalNotice = Boolean(status?.uncertain && historyMessages.has(status.message))
  const filteredNotice = status?.message && !quietMessages.has(status.message) && !historicalNotice ? status.message : ''
  const notice = filteredNotice || (status?.enabled && status.state === 'error' && !expired ? '连接异常，请刷新后重试。' : '')
  const pairingState = !status ? '读取中' : loginActive
    ? login?.status === 'wait' ? '等待扫码' : login?.status === 'need_verifycode' ? '等待确认码' : '等待微信确认'
    : expired ? '绑定已失效' : paired ? '已绑定此节点' : '未绑定'
  // An expired/finished replacement attempt must not mask a valid binding.
  const showPairing = Boolean(login && (loginActive || !paired))
  const pairingLabel = login && (!loginActive && login.expiresAt !== undefined && login.expiresAt <= now
    ? pairingLabels.expired : pairingLabels[login.status] || '请重新显示绑定码')
  const groups = new Map<string, { title: string; sessions: ClawbotSession[] }>()
  for (const session of sessions) {
    const key = session.workspaceId || ''
    const group = groups.get(key) || { title: session.workspaceTitle || '未分组', sessions: [] }
    group.sessions.push(session); groups.set(key, group)
  }
  const sessionTitle = (session: ClawbotSession) => !session.title || /^(未命名|新会话|New chat|Untitled)$/i.test(session.title)
    ? `${session.title || '未命名'} · ${session.id.slice(-8)}` : session.title
  const startPairing = () => {
    if (!status || !allowed || loginActive) return
    if (status.paired && !window.confirm((status.enabled ? '将先暂停私聊接入，再重新绑定当前节点。' : '重新绑定当前节点？')
      + '\n微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。')) return
    void run({ action: 'login.start', expectedRevision: status.revision }, false, status.paired && status.enabled)
  }
  const disconnect = () => {
    if (!status?.paired) return
    if (!window.confirm((status.enabled ? '将先暂停私聊接入，再移除此节点的绑定。' : '移除此节点的绑定？')
      + '\n不会删除会话，也不会解除微信端的授权。'
      + (status.pending ? '\n未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。' : ''))) return
    void run({ action: 'disconnect', expectedRevision: status.revision, abandonPending: status.pending > 0 }, false, status.enabled)
  }
  return <section className={`${styles.updateCard} ${styles.clawbotCard}`} aria-label="微信 ClawBot 私聊接线">
    <div className={styles.clawbotHead}><h3 className={styles.updateHeading}><span className={styles.clawbotMark} aria-hidden />微信 ClawBot 私聊接线 <small>实验性</small></h3>
      <div className={styles.clawbotHeadActions}>
        <button type="button" aria-label="刷新" className={styles.clawbotTextButton} disabled={busy} onClick={() => void refresh()}><span aria-hidden>↻ </span>刷新</button>
        <label className={styles.clawbotToggle} title="开启或暂停当前节点的 ClawBot 私聊接线">
          <input type="checkbox" role="switch" aria-label="启用当前节点的 ClawBot 私聊接线" checked={status?.enabled || false} disabled={!status || busy || (!status.enabled && !canEnable)}
            onChange={e => void run({ action: 'enabled', enabled: e.target.checked, expectedRevision: status?.revision })} />
          <span className={styles.clawbotSwitchTrack} aria-hidden />
        </label>
      </div></div>
    <p className={styles.clawbotNode}>当前节点：{nodeName || '读取中'}{hostName ? ' · ' + hostName : ''}</p>

    <div className={styles.clawbotSection} aria-label="节点绑定">
      <div className={styles.clawbotRow}><strong>节点绑定</strong><div className={styles.clawbotHeadActions}>
        <span className={styles.clawbotStatus} data-state={loginActive ? 'pending' : expired ? 'expired' : paired ? 'paired' : 'unpaired'} role="status">{pairingState}</span>
        {status?.paired && !loginActive ? <button type="button" className={styles.clawbotTextButton} aria-label="绑定管理" aria-expanded={manageOpen} onClick={() => setManageOpen(!manageOpen)}>管理</button> : null}
      </div></div>
      {status?.paired && !loginActive && manageOpen ? <div className={styles.clawbotActions} aria-label="绑定管理操作">
        {!expired ? <button type="button" className={styles.secondaryButton} disabled={!allowed || busy} onClick={startPairing}>重新绑定</button> : null}
        <button type="button" className={styles.clawbotTextButton} disabled={busy} onClick={disconnect}>移除绑定</button>
      </div> : null}
      {showPairing && login ? <div className={styles.clawbotPairing}>
        {loginActive && login.status === 'wait' ? <img src={login.qrDataUrl} width="180" height="180" alt="微信 ClawBot 节点绑定码" /> : null}
        <div className={styles.clawbotPairingCopy}><strong role="status">{pairingLabel}</strong>
          {loginActive && login.status === 'wait' ? <p className={styles.clawbotNote}>用微信首页扫一扫扫描此码，再确认绑定。此码不是小程序配对码。</p> : null}
          {loginActive && login.status === 'need_verifycode' ? <form onSubmit={e => { e.preventDefault(); void run({ action: 'login.poll', loginId: login.id, verifyCode: code }); setCode('') }}>
            <input aria-label="微信验证码" value={code} autoComplete="off" inputMode="numeric" maxLength={16} onChange={e => setCode(e.target.value)} />
            <button type="submit" className={styles.primaryButton} disabled={!allowed || busy || !/^\d{1,16}$/.test(code)}>确认验证码</button>
          </form> : null}
          <div className={styles.clawbotActions}>
            {!loginActive ? <button type="button" className={styles.primaryButton} disabled={!allowed || busy} onClick={startPairing}>{expired ? '重新绑定' : '重新显示绑定码'}</button> : null}
            {loginActive ? <button type="button" className={styles.clawbotTextButton} disabled={busy && foreground.current?.action !== 'login.poll'} onClick={() => void run({ action: 'login.cancel', loginId: login.id })}>取消绑定</button> : null}
          </div>
        </div>
      </div> : !paired ? <div className={styles.clawbotPairingEntry}>
        <p className={styles.clawbotNote}>用微信首页「＋ → 扫一扫」扫描此处的 ClawBot 绑定码。</p>
        <button type="button" className={styles.primaryButton} disabled={!status || !allowed || busy} onClick={startPairing}>{expired ? '重新绑定' : '显示绑定码'}</button>
      </div> : null}
    </div>

    <div className={styles.clawbotSection} aria-label="微信消息">
      <div className={styles.clawbotRow}><strong>接入会话</strong></div>
      <div className={styles.clawbotRow}>
        <select aria-label="ClawBot 目标会话" value={selected} disabled={!status || (busy && foreground.current?.action !== 'sessions')}
          onFocus={() => void run({ action: 'sessions' })} onChange={e => { selectedByUser.current = true; setSelected(e.target.value) }}>
          <option value="">请选择接入会话</option>
          {status?.target && !sessions.some(s => s.id === status.target!.id) ? <option value={status.target.id}>{status.target.title}</option> : null}
          {[...groups].map(([key, group]) => <optgroup key={key} label={group.title}>
            {group.sessions.map(s => <option key={s.id} value={s.id}>{sessionTitle(s)}</option>)}
          </optgroup>)}
        </select>
        <button type="button" className={styles.secondaryButton} disabled={!allowed || !selected || !status || busy || selected === status.target?.id}
          onClick={() => void run({ action: 'route', sessionId: selected, expectedRevision: status?.revision })}>接到此会话</button>
      </div>
    </div>
    {accessNotice && accessNotice !== notice ? <p className={styles.clawbotNote} role="status">{accessNotice}</p> : null}
    {notice ? <p className={styles.clawbotNote} role="status">{notice}</p> : null}
    {status?.uncertain ? <details className={styles.clawbotHistory}><summary>消息记录（{status.uncertain}）</summary>
      <p className={styles.clawbotNote}>历史消息的处理或回复送达结果未确认，未自动重复执行或发送。请核对当时的 DSH 会话和微信记录；不影响新消息。</p>
    </details> : null}
    {error ? <p className={styles.clawbotError} role="alert">{error}</p> : null}
  </section>
}
