import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './HarnessRemoteSettings.module.css'

interface Advice { label: string; message: string; severity: string; current: { agentVersion: string; pluginVersion: string }; targetVersion?: string }
interface Job { jobId: string; statusOrigin: string; statusToken: string }
interface Check { advice: Advice; channel?: string; canInstall: boolean; reason: string; ticket: string; activeJob?: Job | null; lastResult?: Progress | null }
interface Progress { phase: string; progress: number; message: string; terminal: boolean; ok?: boolean }
export function PluginUpdateCard({ localOrigin }: { localOrigin: string }): JSX.Element {
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const mounted = useRef(true)
  const busy = Boolean(progress && !progress.terminal)
  const refresh = useCallback(async () => {
    setChecking(true); setError('')
    try {
      const response = await fetch(localOrigin + '/gate/update/check')
      const data = await response.json() as Check & { error?: string }
      if (!response.ok) throw new Error(data.error || '暂时无法检查更新')
      if (mounted.current) {
        setCheck(data)
        if (data.activeJob?.statusOrigin) {
          setJob(data.activeJob); setProgress({ phase: 'recovering', progress: 20, message: '正在恢复更新进度…', terminal: false })
        } else if (data.lastResult) setProgress(data.lastResult)
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '更新检查暂不可用') }
    finally { if (mounted.current) setChecking(false) }
  }, [localOrigin])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false } }, [refresh])
  useEffect(() => {
    if (!job || !busy) return
    let cancelled = false, timer: number | undefined
    const deadline = Date.now() + 10 * 60000
    const poll = async () => {
      try {
        const response = await fetch(job.statusOrigin + '/status', { headers: { Authorization: 'Bearer ' + job.statusToken }, signal: AbortSignal.timeout(4000) })
        if (!response.ok) throw new Error('进度暂不可用')
        const next = await response.json() as Progress
        if (cancelled) return
        setProgress(next)
        if (next.terminal) { setJob(null); return }
      } catch {
        if (cancelled) return
        // A forwarded remote WebUI may not expose the worker's temporary local
        // port. Once DSH returns, recover from the same already-forwarded door.
        try {
          const response = await fetch(localOrigin + '/gate/update/status', { signal: AbortSignal.timeout(3000) })
          const value = await response.json() as { lastResult?: Progress }
          if (!cancelled && value.lastResult) {
            setProgress(value.lastResult)
            if (value.lastResult.terminal) { setJob(null); return }
          }
        } catch { /* DSH itself is restarting; keep the last confirmed phase */ }
        if (Date.now() > deadline) {
          setProgress({ phase: 'unknown', progress: 100, message: '暂时无法确认更新结果。请重新打开此主机 WebUI 检查版本；不要重复安装或删除节点。', terminal: true })
          return
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [job, busy, localOrigin])
  const install = async () => {
    if (!check?.canInstall || busy) return
    if (!window.confirm(`将连接插件更新至 ${check.advice.targetVersion}。会重启当前 DSH，短暂断开所有连接；请先结束运行中的会话。不会更新 DSH 本体、删除会话或改变配对。是否继续？`)) return
    setError(''); setProgress({ phase: 'download', progress: 10, message: '正在下载并验证更新包；当前插件尚未替换', terminal: false })
    try {
      const response = await fetch(localOrigin + '/gate/update/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: check.ticket }) })
      const data = await response.json() as Job & { error?: string }
      if (!response.ok || !data.statusOrigin) throw new Error(data.error || '无法取得更新进度，请重新检查')
      if (mounted.current) setJob(data)
    } catch (e) {
      if (mounted.current) setProgress({ phase: 'failed', progress: 100, message: e instanceof Error ? e.message : '更新未开始，请重新检查', terminal: true, ok: false })
    }
  }
  return <div className={styles.updateCard}>
    <div className={styles.pairingHead}><div><strong>插件更新与兼容</strong>
      <p>只更新连接插件，保留原节点与会话</p></div>
      <button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void refresh()}>{checking ? '检查中…' : '检查更新'}</button></div>
    {check ? <>{check.channel === 'preview' ? <p role="note">仅供隔离测试：已由此主机管理员启用预发布更新，不代表正式发布或正式兼容承诺。</p> : null}<p>DSH {check.advice.current.agentVersion} · 插件 {check.advice.current.pluginVersion}</p>
      <strong className={styles.updateLabel} data-severity={check.advice.severity}>{check.advice.label}</strong>
      <p>{check.advice.message}</p>
      {!check.canInstall ? <p>{check.reason}</p> : <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void install()}>更新插件并重启 DSH</button>}</> : null}
    {error ? <p role="alert">{error}</p> : null}
    {progress ? <div role="status" aria-live="polite"><progress className={styles.updateProgress} max={100} value={progress.progress} /><p>{progress.message}</p>
      {progress.ok ? <button type="button" className={styles.secondaryButton} onClick={() => window.location.reload()}>重新载入 WebUI</button> : null}</div> : null}
    <p className={styles.securityNote}>更新失败会尝试恢复原插件。受管理的服务或未验证的安装方式请按<a href="https://github.com/martinbear1/dsh-wechat-remote#readme" target="_blank" rel="noreferrer">安装说明</a>手工更新。首次从旧插件升级后才会出现此按钮。</p>
  </div>
}
