/** Read-only operator diagnostics. Reports stay in this host's memory. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import styles from './HarnessRemoteSettings.module.css'
import { diagnosticCheckLabel, failureAdvice, failureDescription, formatConnectionDiagnosticReport } from '../connection-diagnostic-contract.js'
import type { RemotePageStore } from './remote-page-store.js'

const statusLabel = { pass: '通过', fail: '失败', 'not-tested': '未检测', cancelled: '已取消' }

export function ConnectionDiagnostics({ store }: { store: RemotePageStore }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return <details className={styles.updateDetails} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>连接帮助</summary>
    {expanded ? <DiagnosticContent store={store} /> : null}
  </details>
}

/** Not mounted until the user expands help. Opening help never starts a check. */
function DiagnosticContent({ store }: { store: RemotePageStore }): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribeDiagnostics, store.getSnapshot, store.getSnapshot)
  const { diagnosticState, diagnosticReport } = snapshot
  const [preview, setPreview] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => () => store.cancelDiagnostic(true), [store])
  useEffect(() => { setPreview(false); setCopied('idle') }, [diagnosticReport])
  const running = diagnosticState === 'running'
  const text = diagnosticReport ? formatConnectionDiagnosticReport(diagnosticReport) : ''
  const copyReport = async () => {
    if (!preview || !diagnosticReport || !text) return
    try {
      await navigator.clipboard.writeText(text)
      if (store.getSnapshot().diagnosticReport === diagnosticReport) setCopied('copied')
    } catch {
      if (store.getSnapshot().diagnosticReport === diagnosticReport) setCopied('failed')
    }
  }
  return <section aria-label="连接诊断">
    <div className={styles.updateRow}>
      <h3 className={styles.updateHeading}>连接诊断</h3>
      <div className={styles.updateActions}>
        <button type="button" className={styles.secondaryButton} disabled={running} onClick={() => void store.diagnose()}>{running ? '检测中…' : '检查连接'}</button>
        {running ? <button type="button" className={styles.secondaryButton} onClick={() => store.cancelDiagnostic()}>取消</button> : null}
      </div>
    </div>
    <p className={styles.helpText}>检查结果仅供参考，不影响配对或连接，也不改配置。会访问中继健康接口，对方可见出口 IP；报告不自动上传。</p>
    <div role="status" aria-live="polite">
      {diagnosticState === 'cancelled' ? <p>已取消本次检查。</p> : null}
      {diagnosticState === 'unsupported' ? <p>当前 DSH 或插件不支持此诊断入口，请更新后重新打开应用。</p> : null}
      {diagnosticState === 'error' ? <p>未能取得诊断结果。请确认当前 DSH 和插件正在运行，再检查连接。</p> : null}
      {diagnosticReport ? <>
        <p className={styles.helpText}>检查于 {new Date(diagnosticReport.startedAt).toLocaleString()}，以下为该次检查结果。</p>
        <ul>{diagnosticReport.checks.map(check => <li key={check.id}>
          {diagnosticCheckLabel(check.id)}：{statusLabel[check.status]}
          {check.code ? ` · ${failureDescription(check.code)}` : null}
          {check.httpStatus ? ` · HTTP ${check.httpStatus}` : null}
          {check.systemCode ? ` · ${check.systemCode}` : null}
          {check.status === 'fail' ? <p className={styles.helpText}>{failureAdvice(check.code ?? 'unknown')}</p> : null}
        </li>)}</ul>
        <p className={styles.helpText}>基础检查通过不等于首次配对成功；未单独测试 WebSocket 握手、手机认领或票据签名。</p>
        <button type="button" className={styles.secondaryButton} aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? '收起报告' : '预览诊断报告'}</button>
        {preview ? <>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 280, overflow: 'auto', fontSize: 12 }}>{text}</pre>
          <button type="button" className={styles.secondaryButton} onClick={() => void copyReport()}>{copied === 'copied' ? '已复制' : '复制诊断报告'}</button>
          {copied === 'failed' ? <p className={styles.helpText}>复制未成功，可以选中上方报告手动复制。</p> : null}
        </> : null}
      </> : null}
    </div>
  </section>
}
