/** Harness Remote's lazy page inside the native Web Settings navigation. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './HarnessRemoteSettings.module.css'
import { PluginUpdateCard } from './PluginUpdateCard.tsx'

interface PairCodeResp {
  code: string
  qrDataUrl: string
  mode: 'lan' | 'public-relay'
  expiresAt: number
}

interface GateDoorInfo {
  port: number
  state: 'starting' | 'listening' | 'unavailable' | 'stopped'
}

interface GateRuntimeInfo {
  localDoor: GateDoorInfo
  publicDoor: GateDoorInfo
}

export interface HarnessRemoteHostDescription {
  computerName: string
  agentName: string
  gate?: GateRuntimeInfo
}

interface HarnessRemoteSettingsProps {
  describeHost: () => Promise<HarnessRemoteHostDescription>
}

interface GateStatusResp {
  gate?: GateRuntimeInfo
  lan: { ip: string; port: number }
  wechat: { configured: boolean; bindings: number }
  publicRelay: {
    enabled: boolean
    state: 'disabled' | 'enrolling' | 'connecting' | 'online' | 'offline'
    remoteAccess?: {
      status: 'active' | 'pending' | 'expired' | 'suspended' | 'not_entitled'
      validUntil?: number | null
    } | null
  }
  agent?: {
    agentName?: string
    hostName?: string
  }
}

type LoadState = 'loading' | 'ready' | 'error'
type QrState = 'idle' | 'loading' | 'ready' | 'error'

const DEFAULT_LOCAL_ORIGIN = 'http://127.0.0.1:3093'

function StatusDot({ ok, busy = false }: { ok: boolean; busy?: boolean }): JSX.Element {
  return (
    <span
      className={styles.statusDot}
      data-state={busy ? 'busy' : ok ? 'ready' : 'off'}
      aria-hidden
    />
  )
}

function Capability({
  title,
  detail,
  ok,
  busy = false,
}: {
  title: string
  detail: string
  ok: boolean
  busy?: boolean
}): JSX.Element {
  return (
    <div className={styles.capability}>
      <StatusDot ok={ok} busy={busy} />
      <div className={styles.capabilityCopy}>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

async function discoverLocalOrigin(
  describeHost: () => Promise<HarnessRemoteHostDescription>,
): Promise<{
  origin: string
  runtime: GateRuntimeInfo | null
  host: HarnessRemoteHostDescription | null
}> {
  try {
    const host = await describeHost()
    const runtime = host.gate
    if (!runtime || !Number.isSafeInteger(runtime.localDoor.port)) {
      return { origin: DEFAULT_LOCAL_ORIGIN, runtime: null, host }
    }
    return {
      origin: `http://127.0.0.1:${runtime.localDoor.port}`,
      runtime,
      host,
    }
  } catch {
    // Older hosts use the documented web/default loopback door.
    return { origin: DEFAULT_LOCAL_ORIGIN, runtime: null, host: null }
  }
}

export function HarnessRemoteSettings({
  describeHost,
}: HarnessRemoteSettingsProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [qrState, setQrState] = useState<QrState>('idle')
  const [status, setStatus] = useState<GateStatusResp | null>(null)
  const [runtime, setRuntime] = useState<GateRuntimeInfo | null>(null)
  const [host, setHost] = useState<HarnessRemoteHostDescription | null>(null)
  const [localOrigin, setLocalOrigin] = useState<string | null>(null)
  const [qr, setQr] = useState<PairCodeResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const loadStatus = useCallback(async (): Promise<void> => {
    try {
      const discovered = await discoverLocalOrigin(describeHost)
      if (!mountedRef.current) return
      setRuntime(discovered.runtime)
      setLocalOrigin(discovered.origin)
      setHost(discovered.host)
      if (
        discovered.runtime !== null &&
        discovered.runtime.localDoor.state !== 'listening'
      ) {
        throw new Error('local-door-unavailable')
      }
      const response = await fetch(`${discovered.origin}/gate/status`)
      if (!response.ok) throw new Error(`gate/status ${response.status}`)
      const next = (await response.json()) as GateStatusResp
      if (!mountedRef.current) return
      setStatus(next)
      setRuntime(next.gate ?? discovered.runtime)
      setLoadState('ready')
      setError(null)
    } catch {
      if (!mountedRef.current) return
      setLoadState('error')
      setError('连接服务暂未就绪。请确认 DSH 正在运行，然后重试。')
    }
  }, [describeHost])

  const generateQr = useCallback(async (): Promise<void> => {
    setQrState('loading')
    setError(null)
    try {
      const discovered = await discoverLocalOrigin(describeHost)
      if (!mountedRef.current) return
      setRuntime(discovered.runtime)
      setHost(discovered.host)
      if (
        discovered.runtime !== null &&
        discovered.runtime.localDoor.state !== 'listening'
      ) {
        throw new Error('local-door-unavailable')
      }
      const [codeResponse, statusResponse] = await Promise.all([
        fetch(`${discovered.origin}/pair/code`),
        fetch(`${discovered.origin}/gate/status`),
      ])
      if (!codeResponse.ok) throw new Error(`pair/code ${codeResponse.status}`)
      const code = (await codeResponse.json()) as PairCodeResp
      if (!mountedRef.current) return
      setQr(code)
      setQrState('ready')
      if (statusResponse.ok) {
        const next = (await statusResponse.json()) as GateStatusResp
        setStatus(next)
        setRuntime(next.gate ?? discovered.runtime)
        setLoadState('ready')
      }
    } catch {
      if (!mountedRef.current) return
      setQr(null)
      setQrState('error')
      setError('暂时无法生成配对码，请稍后重试。')
    }
  }, [describeHost])

  useEffect(() => {
    mountedRef.current = true
    void loadStatus()
    const timer = window.setInterval(() => void loadStatus(), 30000)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [loadStatus])

  useEffect(() => {
    if (qrState !== 'ready' || !qr?.expiresAt) return undefined
    const delay = Math.max(1000, qr.expiresAt - Date.now() - 60_000)
    const timer = window.setTimeout(() => void generateQr(), delay)
    return () => window.clearTimeout(timer)
  }, [generateQr, qr?.expiresAt, qrState])

  const relay = status?.publicRelay
  const publicBusy = relay?.state === 'enrolling' || relay?.state === 'connecting'
  const remoteAccessState = relay?.remoteAccess?.status
  const publicReady = relay?.state === 'online' && remoteAccessState === 'active'
  const publicDetail = remoteAccessState === 'suspended'
    ? '账户公网访问已暂停'
    : remoteAccessState === 'pending'
      ? '体验申请审核中'
      : remoteAccessState === 'expired'
        ? '公网访问已到期'
        : remoteAccessState === 'not_entitled'
          ? '请在小程序中申请体验'
          : remoteAccessState !== 'active'
            ? '配对后由小程序账户决定'
            : publicReady
              ? '可在外网安全连接'
              : publicBusy
                ? '正在准备远程连接'
                : '暂时离线'

  const localDoor = runtime?.localDoor ?? status?.gate?.localDoor
  const lanReady =
    loadState === 'ready' &&
    Boolean(status?.lan.ip) &&
    localDoor?.state === 'listening'
  const identityReady = publicReady || status?.wechat.configured === true
  const agentName = status?.agent?.agentName || host?.agentName || 'DeepSeek Harness'
  const hostName = status?.agent?.hostName || host?.computerName || '当前电脑'

  return (
    <section className={styles.root} aria-labelledby="harness-remote-title">
      <div className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden>
            <FishLogo size={28} />
          </span>
          <div className={styles.identityCopy}>
            <h3 id="harness-remote-title">鲸常在</h3>
            <p>
              {agentName}
              <span aria-hidden> · </span>
              {hostName}
            </p>
          </div>
        </div>
        <span className={styles.overall} data-ready={loadState === 'ready'}>
          <StatusDot ok={loadState === 'ready'} busy={loadState === 'loading'} />
          {loadState === 'loading'
            ? '检测中'
            : loadState === 'ready'
              ? '服务正常'
              : '暂不可用'}
        </span>
      </div>

      <div className={styles.capabilities}>
        <Capability
          title="局域网直连"
          detail={loadState === 'loading' ? '检测中' : lanReady ? '已就绪' : '暂不可用'}
          ok={lanReady}
          busy={loadState === 'loading'}
        />
        <Capability
          title="远程访问"
          detail={publicDetail}
          ok={publicReady}
          busy={publicBusy || loadState === 'loading'}
        />
        <Capability
          title="微信账号保护"
          detail={identityReady ? '已启用' : '配对后启用'}
          ok={identityReady}
          busy={loadState === 'loading'}
        />
      </div>

      {error !== null ? (
        <div className={styles.notice} role="status">
          <span>{error}</span>
          <button type="button" onClick={() => void loadStatus()}>
            重试
          </button>
        </div>
      ) : null}

      {qrState === 'idle' ? (
        <div className={styles.connectCard}>
          <div>
            <strong>添加到微信</strong>
            <p>打开「鲸常在」→ 添加节点，扫描配对码。</p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void generateQr()}
          >
            生成配对码
          </button>
        </div>
      ) : (
        <div className={styles.pairingCard}>
          <div className={styles.pairingHead}>
            <div>
              <strong>扫描二维码</strong>
              <p>小程序「设置 → 添加节点」</p>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={qrState === 'loading'}
              onClick={() => void generateQr()}
            >
              {qrState === 'loading' ? '生成中…' : '重新生成'}
            </button>
          </div>
          <div className={styles.qrArea}>
            {qrState === 'ready' && qr !== null ? (
              <img className={styles.qr} src={qr.qrDataUrl} alt="鲸常在配对二维码" />
            ) : (
              <div className={styles.qrPlaceholder} aria-live="polite">
                {qrState === 'error' ? '生成失败' : '正在生成…'}
              </div>
            )}
            {qrState === 'ready' && qr !== null ? (
              <div className={styles.qrMeta}>
                <span>配对码</span>
                <code>{qr.code}</code>
                <small>15 分钟内有效</small>
              </div>
            ) : null}
          </div>
          <p className={styles.securityNote}>
            {qr?.mode === 'public-relay'
              ? '配对后自动选择更快的连接；远程内容端到端加密。'
              : '当前可通过同一局域网连接。'}
          </p>
        </div>
      )}
      {localOrigin ? <PluginUpdateCard localOrigin={localOrigin} /> : null}
    </section>
  )
}
