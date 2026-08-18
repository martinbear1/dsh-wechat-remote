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
}

interface GateStatusResp {
  lan: { ip: string; port: number }
  tailscale: { installed: boolean; loggedIn: boolean; ip: string | null }
  funnel: { enabled: boolean; url: string | null }
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

  const tailscaleDetail = ((): string => {
    if (status === null) return '检测中…'
    const ts = status.tailscale
    if (!ts.installed) return '未安装 Tailscale'
    if (!ts.loggedIn) return '未登录 Tailscale'
    if (status.funnel.enabled && status.funnel.url) return status.funnel.url
    if (ts.ip) return `Tailscale ${ts.ip}`
    return '已登录（未开启 Funnel）'
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
            <p className={styles.hint}>打开微信小程序「Harness Remote」→ 设置 → 扫码配对，扫描电脑上的二维码</p>
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
                detail={tailscaleDetail}
                ok={status !== null && status.funnel.enabled && status.funnel.url !== null}
              />
            </div>
            <p className={styles.footnote}>二维码 15 分钟内有效，扫码成功后自动刷新</p>
          </div>
        </div>
      ) : null}
    </>
  )
}
