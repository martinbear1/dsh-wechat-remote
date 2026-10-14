import { useEffect, useState, useSyncExternalStore } from 'react'
import { nativeUpdateFailed, nativeUpdatePending, type NativeUpdateStore, type RestartNotice } from './native-update-store.js'
import type { NativeUpdateStatus } from '../native-update-service.js'
import styles from './HarnessRemoteSettings.module.css'
import { manualRestartInstruction } from './installation-state.js'
import { renderInstallationResult } from './InstallationResultPanel.js'
import { InstallationRestartNotice, type InstallationRestartProps } from './InstallationRestartNotice.js'

/** First mounted view takes the shared, one-shot notice. No RPC or gate. */
function UpdateResultNotice({ store, status, scope }: { store: NativeUpdateStore; status: NativeUpdateStatus | null; scope: string }): JSX.Element | null {
  const [notice, setNotice] = useState<{ owner: NativeUpdateStore; value: RestartNotice } | null>(null)
  useEffect(() => {
    try { const value = store.takeRestartNotice?.(); if (value) setNotice({ owner: store, value }) }
    catch { /* An auxiliary result view cannot interrupt the update/page. */ }
  }, [store, status])
  if (notice?.owner !== store || status?.phase !== 'restart-required' || status.jobId !== notice.value.jobId) return null
  return renderInstallationResult({ state: { phase: 'restart-required', installedVersion: notice.value.installedVersion,
    runningVersion: notice.value.runningVersion, ...(scope === 'web' || scope === 'desktop' ? { scope } : {}) },
    onDismiss: () => setNotice(null) })
}

export function NativeUpdateCard({ store, scope = 'desktop', embedded = false, installation, current }: { store: NativeUpdateStore; scope?: string; embedded?: boolean; installation?: InstallationRestartProps; current?: { agentVersion?: string; pluginVersion?: string } }): JSX.Element {
  const desktop = scope === 'desktop'
  const label = desktop ? 'Desktop' : 'Web'
  const { check, status, checking, starting, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const failed = nativeUpdateFailed(status)
  const busy = starting || !failed && (status?.phase === 'preparing' || status?.phase === 'installing')
  const pending = nativeUpdatePending(status, check)
  const canStart = !pending && check?.canInstall
  const installed = !failed && (status?.phase === 'restart-required' || status?.phase === 'complete')
  const knownVersions = check?.advice.current ?? current
  // complete is the service's positive runtime confirmation, unlike merely
  // installed files. Keep that fact visible while its advice refresh settles.
  const versions = !failed && status?.phase === 'complete' && status.targetVersion
    ? { ...knownVersions, pluginVersion: status.targetVersion } : knownVersions
  const phaseLabel = failed ? '更新未完成'
    : status?.phase === 'restart-required' ? desktop ? '已安装，待重新打开 Desktop' : '已安装，待重启 Web 服务'
    : status?.phase === 'unknown' ? '更新结果待核对'
    : busy ? `正在更新 ${label} 插件` : status?.phase === 'complete' ? '更新已生效' : ''
  return <div className={embedded ? styles.updateEndpoint : styles.updateCard}>
    {status?.phase !== 'restart-required' && installation ? <InstallationRestartNotice {...installation} /> : null}
    <div className={styles.updateRow}><div className={styles.updateCopy}><strong>{label} <span className={styles.updateScope}>当前端</span></strong>
      {versions ? <div className={styles.updateVersions}><span>DSH <strong>{versions.agentVersion || '未确认'}</strong></span><span>插件运行 <strong>{versions.pluginVersion || '未确认'}</strong></span>{installed && status.targetVersion && status.targetVersion !== versions.pluginVersion ? <span>已安装 <strong>{status.targetVersion}</strong></span> : null}{check?.channel === 'preview' ? <span>预览通道</span> : null}</div> : null}</div>
      <div className={styles.updateControl}><button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void store.refresh()}>{checking ? '检查中…' : '检查更新'}</button>
        {check ? <strong className={styles.updateLabel} data-severity={failed ? 'required' : status?.phase === 'complete' ? 'none' : status?.phase === 'unknown' ? 'unknown' : pending ? 'info' : check.advice.severity}>{phaseLabel || check.advice.label}</strong> : null}
        </div></div>
    {check ? <>
      {!installed && !pending && check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}</p> : null}
      {!pending && check.reason ? <p>{check.reason}</p> : null}
      {canStart ? <><div className={styles.updateActions}><button type="button" className={styles.primaryButton} disabled={busy || checking} onClick={() => void store.install()}>更新 {label} 插件</button></div>
        <small className={styles.updateChecked}>仅更新当前端，保留配对与会话；{desktop ? '若提示需要重启，再正常退出并重新打开当前 DSH。' : '若提示需要重启，再正常重启当前 DSH Web 服务；刷新网页不能替代服务重启。'}</small></> : null}
    </> : null}
    {status?.phase !== 'idle' && status ? <div role="status" aria-live="polite">{busy ? <progress className={styles.updateProgress} aria-label={`${label} 插件更新中`} /> : null}
      {status.phase === 'restart-required' ? <p className={styles.updateNote}>{manualRestartInstruction(scope)} 无需重新配对。</p>
        : status.phase !== 'complete' ? <p>{status.message}</p> : null}</div> : null}
    {error ? <p role="alert">{error}</p> : null}
    <UpdateResultNotice store={store} status={status} scope={scope} />
  </div>
}
