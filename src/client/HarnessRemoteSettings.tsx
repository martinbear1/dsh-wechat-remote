/** Harness Remote's lazy page inside the native Web Settings navigation. */
import { useId, useSyncExternalStore } from 'react'
import { FishLogo, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './HarnessRemoteSettings.module.css'
import ui from './PluginUi.module.css'
import { ActionButton, StatusLabel } from './PluginUi.js'
import { PluginUpdateCard } from './PluginUpdateCard.tsx'
import { NativeUpdateCard } from './NativeUpdateCard.tsx'
import { InstallationRestartNotice } from './InstallationRestartNotice.js'
import type { InstallationState } from './installation-state.js'
import { type HarnessRemoteHostDescription,
  type CallPairingManagement } from './pairing-client.js'
import { pageStore, type RemotePageStore } from './remote-page-store.js'
import { AssistantPresetsPanel } from './AssistantPresetsPanel.tsx'
import type { AssistantStore } from './assistant-store.js'
import { ClawbotPanel, type ClawbotCall } from './ClawbotPanel.js'
import type { FeatureCall } from './feature-client.js'
import { ConnectionDiagnostics } from './ConnectionDiagnostics.js'
import type { ConnectionDiagnosticStore } from './connection-diagnostic-store.js'
import { MyResourcesPanel } from './MyResourcesPanel.js'
import type { MyResourcesCall } from './my-resources-store.js'
import { OtherEndpointSummary, type ReadOtherEndpoint } from './OtherEndpointSummary.js'
const absentResourceConnection = { subscribe: (_listener: () => void) => () => {}, getSnapshot: () => 0 }
export type { HarnessRemoteHostDescription } from './pairing-client.js'

export interface HarnessRemoteSettingsProps {
  describeHost: () => Promise<HarnessRemoteHostDescription>
  callManagement: CallPairingManagement
  store?: RemotePageStore
  diagnostics?: ConnectionDiagnosticStore
  assistants?: AssistantStore
  clawbotCall?: ClawbotCall
  featureCall?: FeatureCall
  resourcesCall?: MyResourcesCall
  startResource?: (presetId: string, signal: AbortSignal) => Promise<void>
  readOtherEndpoint?: ReadOtherEndpoint
  resourceConnection?: { subscribe: (listener: () => void) => () => void; getSnapshot: () => number }
  readInstallation?: () => Promise<InstallationState>
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
    <Tooltip label={`${title}：${detail}`} side="bottom">
      <span className={styles.capability} tabIndex={0}>
        <StatusLabel state={busy ? 'ongoing' : ok ? 'done' : 'off'}>{title}</StatusLabel>
        <span className={styles.capabilityDetail}>{detail}</span>
      </span>
    </Tooltip>
  )
}

export function HarnessRemoteSettings({
  describeHost,
  callManagement,
  store = pageStore(describeHost, callManagement),
  diagnostics,
  assistants,
  clawbotCall,
  featureCall,
  resourcesCall,
  startResource,
  readOtherEndpoint,
  resourceConnection = absentResourceConnection,
  readInstallation,
}: HarnessRemoteSettingsProps): JSX.Element {
  const resourceGeneration = useSyncExternalStore(resourceConnection.subscribe, resourceConnection.getSnapshot, resourceConnection.getSnapshot)
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
  const installation = { readInstallation, runningVersion: status?.plugin?.runningVersion ?? host?.pluginVersion,
    installedVersion: status?.plugin?.installedVersion ?? host?.installedPluginVersion,
    scope: runtime?.profileScope, hostIdentity: host?.agentInstanceId ?? host?.computerName }
  const currentVersion = { agentVersion: host?.agentVersion, pluginVersion: installation.runningVersion }

  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <section className={ui.panel} aria-label="连接与管理">
      <div className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden>
            <FishLogo size={22} />
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
        <StatusLabel state={loadState === 'loading' ? 'ongoing' : loadState === 'ready' ? 'done' : 'error'}>
          {loadState === 'loading'
            ? '检测中'
            : loadState === 'ready'
              ? '服务正常'
              : '暂不可用'}
        </StatusLabel>
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
          title="账号连接保护"
          detail={identityReady ? '已启用' : '配对后启用'}
          ok={identityReady}
          busy={loadState === 'loading'}
        />
      </div>

      {error !== null ? (
        <div className={styles.notice} role="status">
          <span>{error}</span>
          <ActionButton onClick={() => void loadStatus()}>重试</ActionButton>
        </div>
      ) : null}

        <div className={styles.pairingCard}>
          <div className={styles.pairingHead}>
            <div>
              <strong>添加到微信</strong>
              <p>打开「Agent远程管理助手」小程序 → 添加节点，扫码配对。</p>
              {qrState === 'ready' && qr ? <p className={styles.securityNote}>
                {qr?.mode === 'public-relay' ? '远程内容端到端加密。' : '当前可通过同一局域网连接。'}
              </p> : null}
            </div>
            <ActionButton
              variant={qrState === 'idle' ? 'primary' : 'outline'}
              disabled={qrState === 'loading' || loadState !== 'ready'}
              onClick={() => void generateQr()}
            >
              {qrState === 'loading' ? '生成中…' : qrState === 'idle' ? '生成二维码' : '重新生成'}
            </ActionButton>
          </div>
          {qrState !== 'idle' ? <div className={styles.qrArea}>
            {loadState === 'ready' && qrState === 'ready' && qr !== null ? (
              <img className={styles.qr} src={qr.qrDataUrl} alt="Agent远程管理助手配对二维码" />
            ) : (
              <div className={styles.qrPlaceholder} aria-live="polite">
                {loadState !== 'ready' ? '连接恢复后可查看二维码' : qrState === 'expired' ? '二维码已过期，请重新生成' : qrState === 'error' ? '生成失败' : '正在生成…'}
              </div>
            )}
            {qrState === 'ready' && qr !== null ? (
              <small className={styles.qrValidity}>有效至 {new Date(qr.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
            ) : null}
          </div> : null}
        </div>
      <section className={styles.updateSection} aria-label="插件更新">
        <h3 className={styles.updateHeading}>插件更新</h3>
        {!store.nativeUpdates ? <InstallationRestartNotice {...installation} /> : null}
        {localOrigin && store.updates ? <PluginUpdateCard store={store.updates} current={currentVersion} embedded /> : null}
        {store.nativeUpdates ? <NativeUpdateCard store={store.nativeUpdates} scope={runtime?.profileScope} installation={installation} current={currentVersion} embedded /> : null}
        <OtherEndpointSummary readOtherEndpoint={readOtherEndpoint} connection={resourceConnection} />
      </section>
      {diagnostics ? <div className={styles.connectionHelp}><ConnectionDiagnostics store={diagnostics} /></div> : null}
      </section>
      {assistants ? <AssistantPresetsPanel store={assistants} featureCall={featureCall} /> : null}
      {clawbotCall ? <ClawbotPanel call={clawbotCall} /> : null}
      {resourcesCall ? <MyResourcesPanel key={resourceGeneration} call={resourcesCall} onStart={startResource} /> : null}
    </section>
  )
}
