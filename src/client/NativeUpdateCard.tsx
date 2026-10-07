import { useSyncExternalStore } from 'react'
import type { NativeUpdateStore } from './native-update-store.js'
import styles from './HarnessRemoteSettings.module.css'

export function NativeUpdateCard({ store, embedded = false }: { store: NativeUpdateStore; embedded?: boolean }): JSX.Element {
  const { check, status, checking, starting, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const busy = starting || status?.phase === 'preparing' || status?.phase === 'installing'
  const pending = status && ['preparing', 'installing', 'restart-required', 'unknown'].includes(status.phase)
  const installed = status?.phase === 'restart-required' || status?.phase === 'complete'
  const phaseLabel = status?.phase === 'restart-required' ? '已安装，待重新打开 Desktop'
    : status?.phase === 'unknown' ? '更新结果待核对'
    : busy ? '正在更新 Desktop 插件' : status?.phase === 'complete' ? '更新已生效' : ''
  return <div className={embedded ? styles.updateEndpoint : styles.updateCard}>
    <div className={styles.pairingHead}><strong>Desktop <span className={styles.updateScope}>当前端</span></strong>
      <button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void store.refresh()}>{checking ? '检查中…' : '检查更新'}</button></div>
    {check ? <>{check.channel === 'preview' ? <span className={styles.updateLabel} data-severity="recommended">预览通道</span> : null}
      <div className={styles.updateVersions}><span>DSH <strong>{check.advice.current.agentVersion || '未确认'}</strong></span><span>插件运行 <strong>{check.advice.current.pluginVersion || '未确认'}</strong></span>{installed && status.targetVersion && status.targetVersion !== check.advice.current.pluginVersion ? <span>已安装 <strong>{status.targetVersion}</strong></span> : null}</div>
      <strong className={styles.updateLabel} data-severity={status?.phase === 'complete' ? 'none' : pending ? status?.phase === 'unknown' ? 'unknown' : 'info' : check.advice.severity}>{phaseLabel || check.advice.label}</strong>
      {!installed && !pending && check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}</p> : null}
      {!pending && check.reason ? <p>{check.reason}</p> : null}
      {!pending && check.canInstall ? <><div className={styles.updateActions}><button type="button" className={styles.primaryButton} disabled={busy || checking} onClick={() => void store.install()}>更新 Desktop 插件</button></div>
        <small className={styles.updateChecked}>仅更新 Desktop，保留配对与会话；完成后需退出并重新打开。</small></> : null}
      {check.advice.checkedAt ? <small className={styles.updateChecked}>检查于 {new Date(check.advice.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small> : null}
    </> : null}
    {status?.phase !== 'idle' && status ? <div role="status" aria-live="polite">{busy ? <progress className={styles.updateProgress} aria-label="Desktop 插件更新中" /> : null}<p>{status.message}</p></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>
}
