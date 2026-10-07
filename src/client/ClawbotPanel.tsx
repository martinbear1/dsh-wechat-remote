import { useEffect, useRef, useState } from 'react'
import type { ClawbotRequest, ClawbotSession, ClawbotStatus } from '../clawbot/contracts.js'
import styles from './HarnessRemoteSettings.module.css'

export type ClawbotCall = (request: ClawbotRequest) => Promise<ClawbotStatus | { sessions: ClawbotSession[] }>
const pairingLabels: Record<string, string> = { wait: '请用微信扫一扫', scaned: '请在微信确认', need_verifycode: '请填写微信显示的验证码',
  expired: '二维码已过期，请取消后重新生成', verify_code_blocked: '验证码暂不可用，请稍后重新配对',
  scaned_but_redirect: '请按微信提示继续确认', binded_redirect: '微信提示已连接，请核对原节点的绑定' }

/** Owner-facing channel controls. Not a second chat UI or a preset selector. */
export function ClawbotPanel({ call }: { call: ClawbotCall }): JSX.Element {
  const [status, setStatus] = useState<ClawbotStatus>()
  const [sessions, setSessions] = useState<ClawbotSession[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const current = useRef(status); current.current = status
  const mounted = useRef(false)
  const foreground = useRef<{ action: string; token: object } | null>(null)
  const polling = useRef<object | null>(null)
  const requestEpoch = useRef(0)
  const run = async (request: ClawbotRequest, silent = false) => {
    // A provider long poll must never swallow an explicit cancel or confirmation.
    // Separate lanes; a foreground action invalidates older display responses.
    if (foreground.current && !(request.action === 'login.cancel' && foreground.current.action === 'login.poll') || silent && polling.current) return
    const token = {}
    if (silent) polling.current = token
    else { foreground.current = { action: request.action, token }; requestEpoch.current++ }
    const epoch = requestEpoch.current
    if (!silent) { setBusy(true); setError('') }
    try {
      const result = await call(request)
      if (!mounted.current || epoch !== requestEpoch.current) return
      if ('sessions' in result) setSessions(result.sessions)
      else { setStatus(result); if (!silent) setSelected(result.target?.id || '') }
    } catch (cause) { if (mounted.current && epoch === requestEpoch.current) setError(cause instanceof Error ? cause.message : '暂时无法读取状态') }
    finally {
      if (silent) { if (polling.current === token) polling.current = null }
      else if (foreground.current?.token === token) { foreground.current = null; if (mounted.current && epoch === requestEpoch.current) setBusy(false) }
    }
  }
  useEffect(() => {
    mounted.current = true
    setStatus(undefined); setSessions([]); setSelected(''); setCode('')
    void run({ action: 'status' })
    const timer = setInterval(() => {
      const login = current.current?.pairing
      if (login && !['expired', 'need_verifycode', 'verify_code_blocked', 'binded_redirect'].includes(login.status))
        void run({ action: 'login.poll', loginId: login.id }, true)
      else void run({ action: 'status' }, true)
    }, 4000)
    return () => { mounted.current = false; requestEpoch.current++; foreground.current = null; polling.current = null; clearInterval(timer) }
  }, [call])
  const refresh = async () => { await run({ action: 'status' }); await run({ action: 'sessions' }) }
  const label = !status ? '待连接' : !status.paired ? '未绑定' : !status.enabled ? '已暂停'
    : status.state === 'ready' ? '已连接' : status.state === 'error' ? '连接异常' : '连接中'
  return <section className={styles.updateCard} aria-label="微信 ClawBot">
    <div className={styles.clawbotHead}><h3 className={styles.updateHeading}><span className={styles.clawbotMark} aria-hidden />微信 ClawBot <small>实验性</small></h3>
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void refresh()}>刷新</button></div>
    <div className={styles.clawbotRow}><span>{label}{status?.target ? ` · ${status.target.title}` : ' · 未选择会话'}</span>
      <label className={styles.clawbotToggle}><input type="checkbox" role="switch" checked={status?.enabled || false} disabled={!status || busy}
        onChange={e => void run({ action: 'enabled', enabled: e.target.checked, expectedRevision: status?.revision })} />启用接入</label></div>
    <p className={styles.clawbotNote}>微信私聊直接连接此节点；不依赖小程序在线，不改变会话的模式和权限。</p>
    <div className={styles.clawbotRow}>
      <select aria-label="ClawBot 目标会话" value={selected} disabled={!status || busy}
        onFocus={() => { if (!sessions.length) void run({ action: 'sessions' }) }} onChange={e => setSelected(e.target.value)}>
        <option value="">选择已有会话</option>
        {status?.target && !sessions.some(s => s.id === status.target!.id) ? <option value={status.target.id}>{status.target.title}</option> : null}
        {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button type="button" className={styles.secondaryButton} disabled={!selected || !status || busy}
        onClick={() => void run({ action: 'route', sessionId: selected, expectedRevision: status?.revision })}>接到此会话</button>
    </div>
    {!status?.pairing && !status?.enabled ? <button type="button" className={styles.primaryButton} disabled={!status || busy}
      onClick={() => void run({ action: 'login.start' })}>{status?.paired ? '重新确认微信连接' : '连接微信 ClawBot'}</button> : null}
    {status?.pairing ? <div className={styles.clawbotPairing}>
      <img src={status.pairing.qrDataUrl} width="180" height="180" alt="微信 ClawBot 官方登录二维码" />
      <div><p>{pairingLabels[status.pairing.status] || '请完成微信确认'}</p>
        {status.pairing.status === 'need_verifycode' ? <form onSubmit={e => { e.preventDefault(); void run({ action: 'login.poll', loginId: status.pairing!.id, verifyCode: code }); setCode('') }}>
          <input aria-label="微信验证码" value={code} autoComplete="off" inputMode="numeric" maxLength={16} onChange={e => setCode(e.target.value)} />
          <button type="submit" className={styles.primaryButton} disabled={busy || !/^\d{1,16}$/.test(code)}>确认验证码</button>
        </form> : null}
        <button type="button" className={styles.secondaryButton} disabled={busy && foreground.current?.action !== 'login.poll'} onClick={() => void run({ action: 'login.cancel', loginId: status.pairing!.id })}>取消配对</button>
      </div>
    </div> : null}
    {status?.message ? <p className={styles.clawbotNote} role="status">{status.message}</p> : null}
    {status?.uncertain ? <p className={styles.clawbotNote}>有 {status.uncertain} 条处理或发送结果待核对，请查看原会话；未自动重复执行。</p> : null}
    {error ? <p className={styles.clawbotError} role="alert">{error}</p> : null}
    {status?.paired ? <details className={styles.assistantDetails}><summary>连接说明与管理</summary>
      <p className={styles.clawbotNote}>支持文字。私聊中发送 /会话、/切换 编号 或 /状态。需要审批时请回到电脑或小程序；小程序遥控开关不影响这里的接入。</p>
      <button type="button" className={styles.secondaryButton} disabled={busy || status.enabled}
        onClick={() => { if (window.confirm('移除此节点保存的 ClawBot 绑定？这不会删除 DSH 会话，也不是腾讯账号端的撤销授权。'
          + (status.pending ? '\n仍有未完成的渠道消息：确认后停止这些消息的处理及续发；电脑上已开始的任务仍会继续，请到原会话核对结果。' : '')))
          void run({ action: 'disconnect', expectedRevision: status.revision, abandonPending: status.pending > 0 }) }}>移除本地绑定</button>
    </details> : null}
  </section>
}
