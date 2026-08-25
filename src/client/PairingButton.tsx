/**
 * Pairing action UI: the sidebar foot button (icon in the rail, full row
 * when wide) and its modal. The modal shows the one-time QR code plus the
 * two-channel connectivity status (LAN / Tailscale Funnel), fetched from the
 * gate's same-origin endpoints (/pair/code, /gate/status).
 */
import { useEffect, useRef, useState } from 'react'
import styles from './PairingButton.module.css'

interface PairCodeResp {
  code: string
  host: string
  port: number
  qrDataUrl: string
  mode: 'lan' | 'public-relay'
}

interface GateStatusResp {
  lan: { ip: string; port: number }
  tailscale: { installed: boolean; loggedIn: boolean; ip: string | null }
  funnel: { enabled: boolean; url: string | null }
  wechat: { configured: boolean; bindings: number }
  publicRelay: {
    enabled: boolean
    state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline'
    relayOrigin?: string
    lastError?: string
  }
}

export interface PairingButtonProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

const QR_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 21h3v-3h-3z" />
    <path d="M21 14v3h-3v-3z" />
  </svg>
)

function ChannelRow({ label, detail, ok }: { label: string; detail: string; ok: boolean }): JSX.Element {
  return (
    <div className={styles.channel}>
      <span className={ok ? styles.dotOk : styles.dotOff} aria-hidden />
      <span className={styles.channelLabel}>{label}</span>
      <span className={styles.channelDetail}>{detail}</span>
    </div>
  )
}

export function PairingButton({ wide }: PairingButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<PairCodeResp | null>(null)
  const [status, setStatus] = useState<GateStatusResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      // Absolute loopback URL on the gate's LOCAL door (127.0.0.1:3093,
      // loopback-bound): pairing codes are screen secrets and must never be
      // network-readable (the public 3092 door would leak them via Funnel).
      const codeRes = await fetch('http://127.0.0.1:3093/pair/code')
      if (!codeRes.ok) throw new Error(`pair/code ${codeRes.status}`)
      setQr(await codeRes.json() as PairCodeResp)
      setError(null)
    } catch (err) {
      setError('获取配对码失败：门卫服务未运行？')
    }
    try {
      const statusRes = await fetch('http://127.0.0.1:3093/gate/status')
      if (statusRes.ok) setStatus(await statusRes.json() as GateStatusResp)
    } catch {
      // status is best-effort
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh()
    timer.current = window.setInterval(() => void refresh(), 30000)
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [open])

  const lanDetail = status === null
    ? '检测中…'
    : `http://${status.lan.ip}:${status.lan.port}`

  const publicDetail = ((): string => {
    if (status === null) return '检测中…'
    const relay = status.publicRelay || { enabled: false, state: 'disabled' }
    if (!relay.enabled) return '未启用（当前二维码仅供局域网）'
    if (relay.state === 'online') return relay.relayOrigin || '端到端加密中继已在线'
    if (relay.state === 'enrolling') return '正在注册电脑 Agent 身份…'
    if (relay.state === 'connecting') return '正在连接加密中继…'
    return relay.lastError ? `离线：${relay.lastError}` : '公网 Agent 离线'
  })()

  const wechatDetail = ((): string => {
    if (status === null) return '检测中…'
    if (status.publicRelay?.enabled) return '扫码时由云端 wx.login 真实校验；电脑不保存 AppSecret'
    const w = status.wechat || { configured: false, bindings: 0 }
    if (!w.configured) return '局域网旧模式尚未配置微信身份校验'
    return `局域网已绑定 ${w.bindings} 个微信账号`
  })()

  return (
    <>
      <button
        type="button"
        className={styles.button}
        title="扫码连接微信（Harness Remote）"
        onClick={() => setOpen(true)}
      >
        {QR_ICON}
        {wide ? <span className={styles.buttonLabel}>微信连接</span> : null}
      </button>

      {open ? (
        <div className={styles.mask} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div className={styles.modal} role="dialog" aria-modal>
            <div className={styles.head}>
              <h3>扫码连接微信</h3>
              <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="关闭">✕</button>
            </div>
            <p className={styles.hint}>打开微信小程序「Harness Remote」→ 点「扫码配对」扫此二维码</p>
            {qr !== null && error === null
              ? (
                <>
                  <img className={styles.qr} src={qr.qrDataUrl} alt="配对二维码" />
                  <p className={styles.code}>配对码：<code>{qr.code}</code></p>
                </>
              )
              : <p className={styles.err}>{error ?? '加载中…'}</p>}
            <div className={styles.channels}>
              <ChannelRow label="局域网" detail={lanDetail} ok={status !== null && status.lan.ip.length > 0} />
              <ChannelRow
                label="公网"
                detail={publicDetail}
                ok={status !== null && status.publicRelay?.state === 'online'}
              />
              <ChannelRow
                label="微信身份"
                detail={wechatDetail}
                ok={status !== null && status.wechat && status.wechat.bindings > 0}
              />
            </div>
            <p className={styles.footnote}>{qr?.mode === 'public-relay' ? '公网流量端到端加密；中继无法读取 DSH 内容' : '二维码 15 分钟内有效，扫码成功后自动刷新'}</p>
          </div>
        </div>
      ) : null}
    </>
  )
}
