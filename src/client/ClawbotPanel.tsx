import { useEffect, useRef, useState } from 'react'
import type { ClawbotRequest, ClawbotSession, ClawbotStatus } from '../clawbot/contracts.js'
import styles from './HarnessRemoteSettings.module.css'

export type ClawbotCall = (request: ClawbotRequest) => Promise<ClawbotStatus | { sessions: ClawbotSession[] }>
const pairingLabels: Record<string, string> = { wait: '打开微信首页「＋ → 扫一扫」', scaned: '已扫码，请在微信中确认',
  need_verifycode: '请输入微信显示的验证码', expired: '二维码已过期', verify_code_blocked: '验证码暂不可用，请稍后重新配对',
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
  '原微信连接已失效，请重新配对。',
  '微信连接已失效，请重新配对。',
  '已移除此节点的本地绑定。未完成的渠道消息已停止续发；电脑上已开始的任务仍会继续。这不是腾讯账号端的撤销授权。',
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
  const current = useRef(status); current.current = status
  const selectedByUser = useRef(false)
  const mounted = useRef(false)
  const foreground = useRef<{ action: string; token: object } | null>(null)
  const polling = useRef<object | null>(null)
  const refreshing = useRef<object | null>(null)
  const requestEpoch = useRef(0)
  const run = async (request: ClawbotRequest, silent = false, pauseBefore = false) => {
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
    setStatus(undefined); setSessions([]); setSelected(''); setCode(''); setError('')
    void run({ action: 'status' })
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time)
      const login = current.current?.pairing
      // Status polling continues without a locally-created attempt: a QR code
      // requested from the phone appears here too, without clicking Refresh.
      if (login && activePairing(login, time) && login.status !== 'need_verifycode')
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
  const canEnable = Boolean(paired && status?.target && !loginActive)
  const label = !status ? '读取中' : loginActive ? '配对完成后可开启' : expired ? '请重新配对' : !paired ? '配对后可开启' : !status?.target ? '选择会话后可开启' : !status.enabled ? '已暂停'
    : status.state === 'ready' ? '接收中' : status.state === 'error' ? '连接异常' : '连接中'
  const pairingState = !status ? '读取中' : loginActive
    ? login?.status === 'wait' ? '等待扫码' : login?.status === 'need_verifycode' ? '等待确认码' : '等待微信确认'
    : expired ? '连接已失效' : paired ? '已配对此节点' : '未配对'
  // An expired/finished replacement attempt must not mask a valid binding.
  const showPairing = Boolean(login && (loginActive || !paired))
  const pairingLabel = login && (!loginActive && login.expiresAt !== undefined && login.expiresAt <= now
    ? pairingLabels.expired : pairingLabels[login.status] || '请重新显示配对码')
  const startPairing = () => {
    if (!status || loginActive) return
    if (status.paired && !window.confirm((status.enabled ? '将先暂停接收微信消息，再重新配对当前节点。' : '重新配对当前节点？')
      + '\n微信可能提示替换已有连接，请核对后确认。完成后需手动开启接收。')) return
    void run({ action: 'login.start', expectedRevision: status.revision }, false, status.paired && status.enabled)
  }
  const disconnect = () => {
    if (!status?.paired) return
    if (!window.confirm((status.enabled ? '将先暂停接收微信消息，再移除此节点的配对。' : '移除此节点的配对？')
      + '\n不会删除会话，也不会解除微信端的授权。'
      + (status.pending ? '\n未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。' : ''))) return
    void run({ action: 'disconnect', expectedRevision: status.revision, abandonPending: status.pending > 0 }, false, status.enabled)
  }
  return <section className={`${styles.updateCard} ${styles.clawbotCard}`} aria-label="微信 ClawBot">
    <div className={styles.clawbotHead}><h3 className={styles.updateHeading}><span className={styles.clawbotMark} aria-hidden />微信 ClawBot <small>实验性</small></h3>
      <button type="button" aria-label="刷新" className={styles.clawbotTextButton} disabled={busy} onClick={() => void refresh()}><span aria-hidden>↻ </span>刷新</button></div>
    <p className={styles.clawbotNode}>当前节点：{nodeName || '读取中'}{hostName ? ' · ' + hostName : ''}</p>

    <div className={styles.clawbotSection} aria-label="微信配对">
      <div className={styles.clawbotRow}><strong>微信配对</strong><span className={styles.clawbotStatus} data-state={loginActive ? 'pending' : expired ? 'expired' : paired ? 'paired' : 'unpaired'} role="status">{pairingState}</span></div>
      {showPairing && login ? <div className={styles.clawbotPairing}>
        {loginActive && login.status === 'wait' ? <img src={login.qrDataUrl} width="180" height="180" alt="微信 ClawBot 配对二维码" /> : null}
        <div className={styles.clawbotPairingCopy}><strong role="status">{pairingLabel}</strong>
          {loginActive && login.status === 'wait' ? <p className={styles.clawbotNote}>扫描此二维码，在微信中确认连接。</p> : null}
          {loginActive && login.status === 'need_verifycode' ? <form onSubmit={e => { e.preventDefault(); void run({ action: 'login.poll', loginId: login.id, verifyCode: code }); setCode('') }}>
            <input aria-label="微信验证码" value={code} autoComplete="off" inputMode="numeric" maxLength={16} onChange={e => setCode(e.target.value)} />
            <button type="submit" className={styles.primaryButton} disabled={busy || !/^\d{1,16}$/.test(code)}>确认验证码</button>
          </form> : null}
          <div className={styles.clawbotActions}>
            {!loginActive ? <button type="button" className={styles.primaryButton} disabled={busy} onClick={startPairing}>{expired ? '重新配对' : '重新显示配对码'}</button> : null}
            {loginActive ? <button type="button" className={styles.clawbotTextButton} disabled={busy && foreground.current?.action !== 'login.poll'} onClick={() => void run({ action: 'login.cancel', loginId: login.id })}>取消配对</button> : null}
          </div>
        </div>
      </div> : !paired ? <div className={styles.clawbotPairingEntry}>
        <p className={styles.clawbotNote}>用微信首页「＋ → 扫一扫」扫码连接。</p>
        <button type="button" className={styles.primaryButton} disabled={!status || busy} onClick={startPairing}>{expired ? '重新配对' : '显示配对码'}</button>
      </div> : null}
    </div>

    <div className={styles.clawbotSection} aria-label="微信消息">
      <div className={styles.clawbotRow}><strong>目标会话</strong></div>
      <div className={styles.clawbotRow}>
        <select aria-label="ClawBot 目标会话" value={selected} disabled={!status || (busy && foreground.current?.action !== 'sessions')}
          onFocus={() => void run({ action: 'sessions' })} onChange={e => { selectedByUser.current = true; setSelected(e.target.value) }}>
          <option value="">选择已有会话</option>
          {status?.target && !sessions.some(s => s.id === status.target!.id) ? <option value={status.target.id}>{status.target.title}</option> : null}
          {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <button type="button" className={styles.secondaryButton} disabled={!selected || !status || busy || selected === status.target?.id}
          onClick={() => void run({ action: 'route', sessionId: selected, expectedRevision: status?.revision })}>接到此会话</button>
      </div>
      <div className={styles.clawbotReceiveRow}>
        <div><strong>接收微信消息</strong><p className={styles.clawbotNote} role="status">{label}</p></div>
        <label className={styles.clawbotToggle}>
          <input type="checkbox" role="switch" aria-label="接收微信消息" checked={status?.enabled || false} disabled={!status || busy || (!status.enabled && !canEnable)}
            onChange={e => void run({ action: 'enabled', enabled: e.target.checked, expectedRevision: status?.revision })} />
          <span className={styles.clawbotSwitchTrack} aria-hidden />
        </label>
      </div>
    </div>
    {status?.message && !quietMessages.has(status.message) ? <p className={styles.clawbotNote} role="status">{status.message}</p> : null}
    {status?.uncertain ? <p className={styles.clawbotNote}>有 {status.uncertain} 条消息的处理结果待确认，请到原会话查看。</p> : null}
    {error ? <p className={styles.clawbotError} role="alert">{error}</p> : null}
    {status?.paired && !loginActive ? <details className={styles.clawbotManage}><summary>配对管理</summary>
      <div className={styles.clawbotActions}>
        {!expired ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={startPairing}>重新配对</button> : null}
        <button type="button" className={styles.clawbotTextButton} disabled={busy} onClick={disconnect}>移除配对</button>
      </div>
    </details> : null}
  </section>
}
