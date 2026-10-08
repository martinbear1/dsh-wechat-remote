import { useEffect, useRef, useState } from 'react'
import type { ClawbotRequest, ClawbotSession, ClawbotStatus } from '../clawbot/contracts.js'
import styles from './HarnessRemoteSettings.module.css'

export type ClawbotCall = (request: ClawbotRequest) => Promise<ClawbotStatus | { sessions: ClawbotSession[] }>
const pairingLabels: Record<string, string> = { wait: '用微信「扫一扫」扫描下方二维码', scaned: '请在微信中确认连接',
  need_verifycode: '请输入微信显示的验证码', expired: '二维码已过期', verify_code_blocked: '验证码暂不可用，请稍后重新配对',
  scaned_but_redirect: '请按微信提示继续确认', binded_redirect: '微信已有连接，请核对原节点' }
const activePairing = (pairing: ClawbotStatus['pairing'], now: number) => Boolean(pairing
  && ['wait', 'scaned', 'scaned_but_redirect', 'need_verifycode'].includes(pairing.status)
  && (pairing.expiresAt === undefined || pairing.expiresAt > now))

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
  const run = async (request: ClawbotRequest, silent = false) => {
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
      const result = await call(request)
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
  const label = !status ? '读取中' : expired ? '连接已失效' : !paired ? '未配对' : !status.enabled ? '已暂停'
    : status.state === 'ready' ? '已连接' : status.state === 'error' ? '连接异常' : '连接中'
  const startPairing = () => {
    if (status?.paired && !window.confirm('重新配对当前节点？请留意微信提示，确认新连接可能会替换原来的连接。')) return
    void run({ action: 'login.start' })
  }
  return <section className={styles.updateCard} aria-label="微信 ClawBot">
    <div className={styles.clawbotHead}><h3 className={styles.updateHeading}><span className={styles.clawbotMark} aria-hidden />微信 ClawBot <small>实验性</small></h3>
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void refresh()}>刷新</button></div>
    <p className={styles.clawbotNode}>当前节点：{nodeName || '读取中'}{hostName ? ' · ' + hostName : ''}</p>

    <div className={styles.clawbotSection} aria-label="微信配对">
      <div className={styles.clawbotRow}><strong>微信配对</strong><span role="status">{expired ? '需要重新配对' : paired ? '已配对此节点' : '尚未配对'}</span></div>
      {login ? <div className={styles.clawbotPairing}>
        {loginActive && login.status === 'wait' ? <img src={login.qrDataUrl} width="180" height="180" alt="微信 ClawBot 配对二维码" /> : null}
        <div><p>{!loginActive && login.expiresAt !== undefined && login.expiresAt <= now ? pairingLabels.expired : pairingLabels[login.status] || '请重新生成二维码'}</p>
          {loginActive && login.status === 'need_verifycode' ? <form onSubmit={e => { e.preventDefault(); void run({ action: 'login.poll', loginId: login.id, verifyCode: code }); setCode('') }}>
            <input aria-label="微信验证码" value={code} autoComplete="off" inputMode="numeric" maxLength={16} onChange={e => setCode(e.target.value)} />
            <button type="submit" className={styles.primaryButton} disabled={busy || !/^\d{1,16}$/.test(code)}>确认验证码</button>
          </form> : null}
          {!loginActive ? <button type="button" className={styles.primaryButton} disabled={busy || Boolean(status?.enabled)} onClick={startPairing}>重新生成二维码</button> : null}
          <button type="button" className={styles.secondaryButton} disabled={busy && foreground.current?.action !== 'login.poll'} onClick={() => void run({ action: 'login.cancel', loginId: login.id })}>取消配对</button>
        </div>
      </div> : !paired ? <button type="button" className={styles.primaryButton} disabled={!status || busy || Boolean(status.paired && status.enabled)} onClick={startPairing}>生成配对二维码</button> : null}
    </div>

    <div className={styles.clawbotSection} aria-label="微信消息">
      <div className={styles.clawbotRow}><strong>目标会话</strong>
        <label className={styles.clawbotToggle}><span>{label}</span><input type="checkbox" role="switch" aria-label="接收微信消息" checked={status?.enabled || false} disabled={!status || busy || (!status.enabled && !canEnable)}
          onChange={e => void run({ action: 'enabled', enabled: e.target.checked, expectedRevision: status?.revision })} />接收微信消息</label></div>
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
      {paired && !status?.target ? <p className={styles.clawbotNote}>选择会话后，即可开启微信消息。</p> : null}
    </div>
    {status?.message && (status.state === 'error' || expired) ? <p className={styles.clawbotNote} role="status">{status.message}</p> : null}
    {status?.uncertain ? <p className={styles.clawbotNote}>有 {status.uncertain} 条消息的处理结果待确认，请到原会话查看。</p> : null}
    {error ? <p className={styles.clawbotError} role="alert">{error}</p> : null}
    {status?.paired && !login ? <details className={styles.assistantDetails}><summary>更多管理</summary>
      {status.enabled ? <p className={styles.clawbotNote}>重新配对或移除配对前，请先关闭「接收微信消息」。</p> : null}
      {!expired ? <button type="button" className={styles.secondaryButton} disabled={busy || status.enabled} onClick={startPairing}>重新配对</button> : null}
      <button type="button" className={styles.secondaryButton} disabled={busy || status.enabled}
        onClick={() => { if (window.confirm('移除此节点保存的微信配对？不会删除会话，也不会解除微信端的授权。'
          + (status.pending ? '\n未完成的微信消息将停止处理和发送；电脑上已开始的任务仍会继续，请到原会话查看。' : '')))
          void run({ action: 'disconnect', expectedRevision: status.revision, abandonPending: status.pending > 0 }) }}>移除配对</button>
    </details> : null}
  </section>
}
