/** Harness Remote's lazy page inside the native Web Settings navigation. */
import { useId, useSyncExternalStore } from 'react'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './HarnessRemoteSettings.module.css'
import { PluginUpdateCard } from './PluginUpdateCard.tsx'
import { NativeUpdateCard } from './NativeUpdateCard.tsx'
import { CompanionPanel } from './CompanionPanel.tsx'
import { type HarnessRemoteHostDescription,
  type CallPairingManagement } from './pairing-client.js'
import { pageStore, type RemotePageStore } from './remote-page-store.js'
export type { HarnessRemoteHostDescription } from './pairing-client.js'

export interface HarnessRemoteSettingsProps {
  describeHost: () => Promise<HarnessRemoteHostDescription>
  callManagement: CallPairingManagement
  store?: RemotePageStore
}

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

export function HarnessRemoteSettings({
  describeHost,
  callManagement,
  store = pageStore(describeHost, callManagement),
}: HarnessRemoteSettingsProps): JSX.Element {
  const { loadState, qrState, status, runtime, host, localOrigin, qr, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const { refresh: loadStatus, generateQr } = store
  const titleId = useId()

  const relay = status?.publicRelay
  const publicBusy = relay?.state === 'enrolling' || relay?.state === 'connecting'
  const remoteAccessState = relay?.remoteAccess?.status
  const publicReady = relay?.state === 'online' && remoteAccessState === 'active'
  const publicDetail = remoteAccessState === 'suspended'
    ? '账户公网访问已暂停'
    : remoteAccessState === 'expired'
      ? '公网访问已到期'
      : remoteAccessState === 'not_entitled'
        ? '请在小程序中使用自助开通方式'
        : remoteAccessState !== 'active'
          ? '配对后由小程序账户决定'
          : publicReady
            ? '可在外网安全连接'
            : publicBusy
              ? '正在准备远程连接'
              : '暂时离线'

  const lanDoor = runtime?.publicDoor ?? status?.gate?.publicDoor
  const lanReady =
    loadState === 'ready' &&
    Boolean(status?.lan.ip) &&
    lanDoor?.state === 'listening'
  const identityReady = relay?.enabled === true && relay.state !== 'disabled'
  const agentName = status?.agent?.agentName || host?.agentName || 'DeepSeek Harness'
  const hostName = status?.agent?.hostName || host?.computerName || '当前电脑'

  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <div className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden>
            <FishLogo size={28} />
          </span>
          <div className={styles.identityCopy}>
            <h3 id={titleId}>微信连接</h3>
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

      {runtime?.profileScope === 'desktop' && status && (!status.plugin || status.plugin.runningVersion !== status.plugin.installedVersion) ?
        <aside className={styles.companionCard} data-state="self-restart-required" role="status">
          <strong>{status.plugin ? '新版插件尚未生效，请完整重启 Desktop' : '刚升级插件？请先完整重启 Desktop'}</strong>
          {status.plugin ? <p>正在运行 {status.plugin.runningVersion}；已安装 {status.plugin.installedVersion}。</p> :
            <p>当前连接服务尚不能核验运行版本，不能把安装完成当作新版已生效。</p>}
          <p>等当前任务结束后，选择顶部「应用 → 退出」，再重新打开 Desktop。仅关闭窗口、刷新页面或开关插件不能保证新版生效。</p>
          <small>不必重装或重新配对。此操作不会升级或重启 Web。</small>
        </aside> : null}

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
          title="账号连接保护"
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
            <p>打开「Agent远程管理助手」→ 添加节点，扫描配对二维码。</p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={loadState !== 'ready'}
            onClick={() => void generateQr()}
          >
            生成二维码
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
              disabled={qrState === 'loading' || loadState !== 'ready'}
              onClick={() => void generateQr()}
            >
              {qrState === 'loading' ? '生成中…' : '重新生成'}
            </button>
          </div>
          <div className={styles.qrArea}>
            {loadState === 'ready' && qrState === 'ready' && qr !== null ? (
              <img className={styles.qr} src={qr.qrDataUrl} alt="Agent远程管理助手配对二维码" />
            ) : (
              <div className={styles.qrPlaceholder} aria-live="polite">
                {loadState !== 'ready' ? '连接恢复后可查看二维码' : qrState === 'expired' ? '二维码已过期，请重新生成' : qrState === 'error' ? '生成失败' : '正在生成…'}
              </div>
            )}
            {qrState === 'ready' && qr !== null ? (
              <small className={styles.qrValidity}>有效至 {new Date(qr.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 切换页面不重新生成</small>
            ) : null}
          </div>
          <p className={styles.securityNote}>
            {qr?.mode === 'public-relay'
              ? '配对后自动选择更快的连接；远程内容端到端加密。'
              : '当前可通过同一局域网连接。'}
          </p>
        </div>
      )}
      {localOrigin && store.updates ? <PluginUpdateCard store={store.updates} /> : null}
      {runtime?.profileScope === 'desktop' && store.nativeUpdates ? <NativeUpdateCard store={store.nativeUpdates} /> : null}
      <div className={styles.linkedSection}>
        <h4>另一端插件</h4>
        <CompanionPanel describeHost={describeHost} callManagement={callManagement} store={store} />
      </div>
      <p className={styles.securityNote}>设置和插件详情共用当前节点的配对与更新状态；Web 与 Desktop 各自独立。</p>
    </section>
  )
}
