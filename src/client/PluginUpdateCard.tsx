import { useSyncExternalStore } from 'react'
import styles from './HarnessRemoteSettings.module.css'
import type { WebUpdateStore } from './web-update-store.js'

/** Both entry pages render this view; requests and progress live in one store. */
export function PluginUpdateCard({ store, embedded = false, current }: { store: WebUpdateStore; embedded?: boolean; current?: { agentVersion?: string; pluginVersion?: string } }): JSX.Element {
  const { check, checking, progress, error, copied, resumeFailed } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const busy = Boolean(progress && !progress.terminal)
  const pending = busy || progress?.phase === 'unknown' || check?.mode === 'busy'
  const versions = check?.advice.current ?? current
  return <div className={embedded ? styles.updateEndpoint : styles.updateCard}>
    <div className={styles.updateRow}><div className={styles.updateCopy}><strong>Web <span className={styles.updateScope}>当前端</span></strong>
      {versions ? <div className={styles.updateVersions}><span>DSH <strong>{versions.agentVersion || '未确认'}</strong></span><span>插件运行 <strong>{versions.pluginVersion || '未确认'}</strong></span>{check?.channel === 'preview' ? <span>预览通道</span> : null}</div> : null}</div>
      <div className={styles.updateControl}><button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void store.refresh()}>{checking ? '检查中…' : '检查更新'}</button>
        {check && !checking ? <strong className={styles.updateLabel} data-severity={pending ? 'unknown' : check.advice.severity} role="status">{busy ? '正在更新 Web 插件' : pending ? '更新状态待核对' : check.advice.label}</strong> : null}
        </div></div>
    {check ? <>{!checking ? <>
        {!pending && check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}{check.mode === 'manual' ? ' · 需手动更新' : ''}</p> : null}
        {!pending && (check.advice.severity === 'unknown' || check.advice.severity === 'required' || check.mode === 'manual')
          ? <details><summary>{check.mode === 'manual' ? '手动更新说明' : '查看说明'}</summary>
            {check.reason ? <p>{check.reason}</p> : null}<p>{check.advice.message}</p></details> : null}
        {!pending && check.mode === 'manual' && check.manualCommand ? <div className={styles.updateCommand}><code>{check.manualCommand}</code><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void store.copyCommand()}>{copied ? '已复制' : '复制命令'}</button></div> : null}
        {!pending && check.canInstall ? <><div className={styles.updateActions}><button type="button" className={styles.primaryButton} disabled={busy || Boolean(error)} onClick={() => void store.install()}>更新 Web 并重启</button></div><small className={styles.updateChecked}>仅更新 Web，保留配对与会话；连接会短暂中断。</small></> : null}
      </> : null}</> : null}
    {error ? <p role="alert">{error}</p> : null}
    {progress ? <div role="status" aria-live="polite">{!progress.terminal || progress.ok === true ? <progress className={styles.updateProgress} max={100} value={progress.progress} /> : null}<p>{progress.message}</p>
      {resumeFailed ? <p role="alert">插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。</p> : null}</div> : null}
  </div>
}
