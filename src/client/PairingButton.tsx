/**
 * Pairing action UI: the sidebar foot button (icon in the rail, full row
 * when wide) and its modal. The modal shows the one-time QR code plus the
 * LAN and identity-pinned public-relay status, fetched from the
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
  wechat: { configured: boolean; bindings: number }
  publicRelay: {
    enabled: boolean
    state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline'
  }
  agent?: {
    agentName?: string
    hostName?: string
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
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 21h3v-3h-3z" />
    <path d="M21 14v3h-3v-3z" />
  </svg>
)

function ChannelRow({
  label,
  detail,
  ok,
}: {
  label: string
  detail: string
  ok: boolean
}): JSX.Element {
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
      // LOCAL door. Non-default profiles must never accidentally display the
      // web/default profile's QR from its compatibility port 3093.
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
        const envelope = (await describeRes.json()) as HostDescribeEnvelope
        const gate =
          envelope.result?.ok === true ? envelope.result.value?.gate : undefined
        if (gate && Number.isSafeInteger(gate.localDoor.port)) {
          discovered = true
          setRuntime(gate)
          localOrigin = `http://127.0.0.1:${gate.localDoor.port}`
          if (gate.localDoor.state !== 'listening') {
            setQr(null)
            setStatus(null)
            setError('连接服务暂未就绪，请稍后重试')
            return
          }
        }
      }
    } catch {
      // Older installed hosts do not expose gate runtime metadata; their documented
      // web/default endpoint remains 127.0.0.1:3093.
    }
    try {
      // The LOCAL door is loopback-bound: pairing codes are screen secrets and
      // must never be fetched from the LAN/public door.
      const codeRes = await fetch(`${localOrigin}/pair/code`)
      if (!codeRes.ok) throw new Error(`pair/code ${codeRes.status}`)
      const code = (await codeRes.json()) as PairCodeResp
      setQr(code)
      if (!discovered && code.profileScope) {
        setRuntime(
          (previous) =>
            previous || {
              profileScope: code.profileScope || 'web',
              source: 'legacy-default',
              publicDoor: {
                bind: '0.0.0.0',
                port: code.port,
                state: 'listening',
                errorCode: null,
                message: null,
              },
              localDoor: {
                bind: '127.0.0.1',
                port: code.localPort || 3093,
                state: 'listening',
                errorCode: null,
                message: null,
              },
            },
        )
      }
      setError(null)
    } catch (err) {
      setQr(null)
      setError('暂时无法生成配对码，请确认 DSH 正在运行后重试')
    }
    try {
      const statusRes = await fetch(`${localOrigin}/gate/status`)
      if (statusRes.ok) {
        const nextStatus = (await statusRes.json()) as GateStatusResp
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
  const lanReady =
    status !== null &&
    status.lan.ip.length > 0 &&
    publicDoor?.state !== 'unavailable'
  const lanDetail =
    status === null ? '检测中…' : lanReady ? '已就绪' : '暂不可用'

  const publicDetail = ((): string => {
    if (status === null) return '检测中…'
    const relay = status.publicRelay || { enabled: false, state: 'disabled' }
    if (!relay.enabled) return '未启用'
    if (relay.state === 'online') return '已就绪'
    if (relay.state === 'enrolling') return '正在准备…'
    if (relay.state === 'connecting') return '正在连接…'
    return '暂不可用'
  })()

  const wechatDetail = ((): string => {
    if (status === null) return '检测中…'
    if (status.publicRelay?.state === 'online') return '已启用'
    if (status.publicRelay?.enabled) return '等待远程连接'
    const w = status.wechat || { configured: false, bindings: 0 }
    if (!w.configured) return '配对凭证保护'
    return '已启用'
  })()

  const agentName = status?.agent?.agentName || 'DeepSeek Harness'
  const hostName = status?.agent?.hostName || '当前电脑'

  return (
    <>
      <button
        type="button"
        className={styles.button}
        title="连接 Harness Remote"
        onClick={() => setOpen(true)}
      >
        {QR_ICON}
        {wide ? <span className={styles.buttonLabel}>连接微信</span> : null}
      </button>

      {open ? (
        <div
          className={styles.mask}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal>
            <div className={styles.head}>
              <h3>添加到 Harness Remote</h3>
              <button
                type="button"
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <p className={styles.hint}>
              打开微信小程序，进入「添加节点」扫描二维码
            </p>
            <div className={styles.agent}>
              <span className={styles.agentName}>{agentName}</span>
              <span className={styles.agentHost}>{hostName}</span>
            </div>
            {qr !== null && error === null ? (
              <>
                <img
                  className={styles.qr}
                  src={qr.qrDataUrl}
                  alt="配对二维码"
                />
                <p className={styles.code}>
                  配对码 <code>{qr.code}</code>
                  <span>15 分钟内有效</span>
                </p>
              </>
            ) : (
              <p className={styles.err}>{error ?? '加载中…'}</p>
            )}
            <div className={styles.channels}>
              <ChannelRow label="局域网直连" detail={lanDetail} ok={lanReady} />
              <ChannelRow
                label="远程访问"
                detail={publicDetail}
                ok={status !== null && status.publicRelay?.state === 'online'}
              />
              <ChannelRow
                label="微信账号保护"
                detail={wechatDetail}
                ok={
                  status !== null &&
                  (status.publicRelay?.state === 'online' ||
                    status.wechat?.configured === true)
                }
              />
            </div>
            <p className={styles.footnote}>
              {qr?.mode === 'public-relay'
                ? '自动选择更快连接；远程内容端到端加密'
                : '当前仅支持同一网络连接'}
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
