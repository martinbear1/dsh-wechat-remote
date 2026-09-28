import { useSyncExternalStore } from 'react'
import type { NativeUpdateStore } from './native-update-store.js'
import styles from './HarnessRemoteSettings.module.css'

export function NativeUpdateCard({ store }: { store: NativeUpdateStore }): JSX.Element {
  const { check, status, checking, starting, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const busy = starting || status?.phase === 'preparing' || status?.phase === 'installing'
  const pending = status && ['preparing', 'installing', 'restart-required', 'unknown'].includes(status.phase)
  const installed = status?.phase === 'restart-required' || status?.phase === 'complete'
  const phaseLabel = status?.phase === 'restart-required' ? '已安装，待重新打开 Desktop'
    : status?.phase === 'unknown' ? '更新结果待核对'
    : busy ? '正在更新 Desktop 插件' : status?.phase === 'complete' ? '更新已生效' : ''
  return <div className={styles.updateCard}>
    <div className={styles.pairingHead}><strong>当前端插件更新 · Desktop</strong>
      <button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void store.refresh()}>{checking ? '检查中…' : '检查更新'}</button></div>
    {check ? <>{check.channel === 'preview' ? <span className={styles.updateLabel} data-severity="recommended">预览通道</span> : null}
      <div className={styles.updateVersions}><span>DSH <strong>{check.advice.current.agentVersion}</strong></span><span>运行中的插件 <strong>{check.advice.current.pluginVersion}</strong></span></div>
      <strong className={styles.updateLabel} data-severity={installed ? 'none' : check.advice.severity}>{phaseLabel || check.advice.label}</strong>
      {installed && status.targetVersion ? <p>已安装版本 {status.targetVersion}</p>
        : !pending && check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}</p> : null}
      {!pending && check.reason ? <p>{check.reason}</p> : null}
      {!pending && check.canInstall ? <><p className={styles.helpText}>仅更新当前 Desktop 插件，由原生插件管理器使用应用配置的安装源下载并安装指定版本。配对和会话保留，不更新 Web，不自动退出应用；安装完成后需重新打开 Desktop。</p>
        <button type="button" className={styles.primaryButton} disabled={busy || checking} onClick={() => void store.install()}>更新 Desktop 插件</button></> : null}
      <small className={styles.updateChecked}>最近检查 {new Date(check.advice.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
    </> : null}
    {status?.phase !== 'idle' && status ? <div role="status" aria-live="polite">{busy ? <progress className={styles.updateProgress} aria-label="Desktop 插件更新中" /> : null}<p>{status.message}</p></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>
}
