import { useSyncExternalStore } from 'react'
import styles from './HarnessRemoteSettings.module.css'
import type { WebUpdateStore } from './web-update-store.js'

/** Both entry pages render this view; requests and progress live in one store. */
export function PluginUpdateCard({ store }: { store: WebUpdateStore }): JSX.Element {
  const { check, checking, progress, error, copied, resumeFailed } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const busy = Boolean(progress && !progress.terminal)
  return <div className={styles.updateCard}>
    <div className={styles.pairingHead}><div><strong>当前端插件更新</strong></div>
      <button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void store.refresh()}>{checking ? '检查中…' : '检查更新'}</button></div>
    {check ? <>{check.channel === 'preview' ? <span className={styles.updateLabel} data-severity="recommended">预览通道</span> : null}
      <div className={styles.updateVersions}><span>DSH <strong>{check.advice.current.agentVersion || '未知'}</strong></span><span>插件 <strong>{check.advice.current.pluginVersion || '未知'}</strong></span></div>
      {!checking ? <><strong className={styles.updateLabel} data-severity={check.advice.severity} role="status">{check.advice.label}</strong>
        {check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}{check.mode === 'manual' ? ' · 需手动更新' : ''}</p> : null}
        {check.advice.severity === 'unknown' || check.advice.severity === 'required' || check.mode === 'manual' || check.mode === 'busy'
          ? <details><summary>{check.mode === 'manual' ? '手动更新说明' : '查看说明'}</summary>
            {check.reason ? <p>{check.reason}</p> : null}<p>{check.advice.message}</p></details> : null}
        {check.mode === 'manual' && check.manualCommand ? <div className={styles.updateCommand}><code>{check.manualCommand}</code><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void store.copyCommand()}>{copied ? '已复制' : '复制命令'}</button></div> : null}
        {check.canInstall ? <><button type="button" className={styles.primaryButton} disabled={busy || Boolean(error)} onClick={() => void store.install()}>更新并重启</button><small className={styles.updateChecked}>只更新当前 Web 插件；会短暂断开连接，保留原配对和会话</small></> : null}
        {check.advice.checkedAt && check.advice.severity !== 'unknown' ? <small className={styles.updateChecked}>最近检查 {new Date(check.advice.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small> : null}
      </> : null}</> : null}
    {error ? <p role="alert">{error}</p> : null}
    {progress ? <div role="status" aria-live="polite">{!progress.terminal || progress.ok === true ? <progress className={styles.updateProgress} max={100} value={progress.progress} /> : null}<p>{progress.message}</p>
      {resumeFailed ? <p role="alert">插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。</p> : null}</div> : null}
  </div>
}
