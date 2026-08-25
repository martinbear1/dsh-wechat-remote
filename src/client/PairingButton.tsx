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
  localPort?: number
  profileScope?: string
  qrDataUrl: string
  mode: 'lan' | 'public-relay'
}

interface GateDoorInfo {
  bind: string
  port: number
  state: 'starting' | 'listening' | 'unavailable' | 'stopped'
  errorCode: string | null
  message: string | null
}

interface GateRuntimeInfo {
  profileScope: string
  source: 'legacy-default' | 'profile-derived' | 'environment-override'
  publicDoor: GateDoorInfo
  localDoor: GateDoorInfo
}

interface GateStatusResp {
  gate?: GateRuntimeInfo
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

interface HostDescribeEnvelope {
  result?: {
    ok?: boolean
    value?: { gate?: GateRuntimeInfo }
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
  const [runtime, setRuntime] = useState<GateRuntimeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const refresh = async (): Promise<void> => {
    let localOrigin = 'http://127.0.0.1:3093'
    let discovered = false
    try {
      // Ask this WebUI profile's authenticated Host Remote for the selected
      // LOCAL door. New non-default profiles must never accidentally display
      // the web/default profile's QR from legacy port 3093.
      const rpcId = `wechat-pairing-${Date.now().toString(36)}`
      const describeRes = await fetch('/api/wechatHost.describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId,
          method: 'wechatHost.describe',
          payload: {},
        }),
      })
      if (describeRes.ok) {
        const envelope = await describeRes.json() as HostDescribeEnvelope
        const gate = envelope.result?.ok === true ? envelope.result.value?.gate : undefined
        if (gate && Number.isSafeInteger(gate.localDoor.port)) {
          discovered = true
          setRuntime(gate)
          localOrigin = `http://127.0.0.1:${gate.localDoor.port}`
          if (gate.localDoor.state !== 'listening') {
            setQr(null)
            setStatus(null)
            setError(gate.localDoor.message || `本机配对门 ${gate.localDoor.port} 尚未就绪`)
            return
          }
        }
      }
    } catch {
      // Older .5 hosts do not expose gate runtime metadata; their documented
      // web/default endpoint remains 127.0.0.1:3093.
    }
    try {
      // The LOCAL door is loopback-bound: pairing codes are screen secrets and
      // must never be fetched from the LAN/public door.
      const codeRes = await fetch(`${localOrigin}/pair/code`)
      if (!codeRes.ok) throw new Error(`pair/code ${codeRes.status}`)
      const code = await codeRes.json() as PairCodeResp
      setQr(code)
      if (!discovered && code.profileScope) {
        setRuntime(previous => previous || {
          profileScope: code.profileScope || 'web',
          source: 'legacy-default',
          publicDoor: { bind: '0.0.0.0', port: code.port, state: 'listening', errorCode: null, message: null },
          localDoor: { bind: '127.0.0.1', port: code.localPort || 3093, state: 'listening', errorCode: null, message: null },
        })
      }
      setError(null)
    } catch (err) {
      setQr(null)
      setError(`获取配对码失败：本机配对门 ${localOrigin.replace('http://127.0.0.1:', '')} 不可用`)
    }
    try {
      const statusRes = await fetch(`${localOrigin}/gate/status`)
      if (statusRes.ok) {
        const nextStatus = await statusRes.json() as GateStatusResp
        setStatus(nextStatus)
        if (nextStatus.gate) setRuntime(nextStatus.gate)
      }
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

  const publicDoor = runtime?.publicDoor || status?.gate?.publicDoor
  const lanDetail = publicDoor?.state === 'unavailable'
    ? publicDoor.message || `局域网门 ${publicDoor.port} 不可用`
    : status === null ? '检测中…' : `http://${status.lan.ip}:${status.lan.port}`

  const localDetail = runtime === null
    ? '检测中…'
    : `http://127.0.0.1:${runtime.localDoor.port} · ${runtime.profileScope}`

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
              <ChannelRow
                label="局域网"
                detail={lanDetail}
                ok={status !== null && status.lan.ip.length > 0 && publicDoor?.state !== 'unavailable'}
              />
              <ChannelRow
                label="本机配对门"
                detail={localDetail}
                ok={runtime?.localDoor.state === 'listening'}
              />
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
