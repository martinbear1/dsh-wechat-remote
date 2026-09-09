import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './HarnessRemoteSettings.module.css'

interface Advice { label: string; message: string; severity: string; code?: string; checkedAt?: number; expiresAt?: number; current: { agentVersion: string; pluginVersion: string }; targetVersion?: string }
interface Job { jobId: string; statusOrigin: string; statusToken: string }
interface Check { advice: Advice; channel?: string; canInstall: boolean; mode?: 'none' | 'automatic' | 'manual' | 'busy'; reason: string; manualCommand?: string; ticket: string; activeJob?: Job | null; lastResult?: Progress | null }
interface Progress { phase: string; progress: number; message: string; terminal: boolean; ok?: boolean }
export function PluginUpdateCard({ localOrigin }: { localOrigin: string }): JSX.Element {
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [copied, setCopied] = useState(false)
  const [resumeJob, setResumeJob] = useState<string | null>(null)
  const [resumeFailed, setResumeFailed] = useState(false)
  const installing = useRef(false)
  const mounted = useRef(true)
  const refreshId = useRef(0)
  const busy = Boolean(progress && !progress.terminal)
  const refresh = useCallback(async () => {
    const id = ++refreshId.current
    setChecking(true); setError(''); setCopied(false)
    try {
      const response = await fetch(localOrigin + '/gate/update/check', { signal: AbortSignal.timeout(10000) })
      const data = await response.json() as Check & { error?: string }
      if (!response.ok) throw new Error(data.error || '暂时无法检查更新')
      if (!data.advice?.current || typeof data.advice.label !== 'string') throw new Error('更新检查返回信息不完整')
      if (mounted.current && refreshId.current === id) {
        setCheck(data)
        if (data.activeJob?.statusOrigin) {
          setJob(data.activeJob); setProgress({ phase: 'recovering', progress: 20, message: '正在恢复更新进度…', terminal: false })
        } else if (data.lastResult) setProgress(data.lastResult)
      }
    } catch (e) { if (mounted.current && refreshId.current === id) { setCheck(null); setError(e instanceof Error ? e.message : '暂时无法检查更新') } }
    finally { if (mounted.current && refreshId.current === id) setChecking(false) }
  }, [localOrigin])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; refreshId.current++ } }, [refresh])
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
        if (next.terminal) { setJob(null); if (next.ok) setResumeJob(job.jobId); void refresh(); return }
      } catch {
        if (cancelled) return
        // A forwarded remote WebUI may not expose the worker's temporary local
        // port. Once DSH returns, recover from the same already-forwarded door.
        try {
          const response = await fetch(localOrigin + '/gate/update/status', { signal: AbortSignal.timeout(3000) })
          const value = await response.json() as { lastResult?: Progress }
          if (!cancelled && value.lastResult) {
            setProgress(value.lastResult)
            if (value.lastResult.terminal) { setJob(null); if (value.lastResult.ok) setResumeJob(job.jobId); void refresh(); return }
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
  }, [job, busy, localOrigin, refresh])
  useEffect(() => {
    if (!resumeJob) return
    let cancelled = false, timer: number | undefined
    const deadline = Date.now() + 30000
    setResumeFailed(false)
    const resume = async () => {
      try {
        const response = await fetch(localOrigin + '/gate/update/resume?job=' + encodeURIComponent(resumeJob), { signal: AbortSignal.timeout(3000) })
        if (!response.ok) throw new Error('尚未恢复')
        const data = await response.json() as { url?: string }
        if (!data.url) throw new Error('缺少恢复地址')
        const url = new URL(data.url)
        if (url.origin !== window.location.origin || url.pathname !== '/' || url.username || url.password || url.hash) throw new Error('恢复地址不匹配')
        if (!cancelled) window.location.replace(url.href)
      } catch {
        if (cancelled) return
        if (Date.now() >= deadline) { setResumeFailed(true); return }
        timer = window.setTimeout(() => void resume(), 1000)
      }
    }
    void resume()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [resumeJob, localOrigin])
  const install = async () => {
    if (!check?.canInstall || busy || checking || error || installing.current) return
    installing.current = true
    setError(''); setProgress({ phase: 'download', progress: 10, message: '正在下载并验证更新包；当前插件尚未替换', terminal: false })
    try {
      const response = await fetch(localOrigin + '/gate/update/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: check.ticket }) })
      const data = await response.json() as Job & { error?: string }
      if (!response.ok || !data.statusOrigin) throw new Error(data.error || '无法取得更新进度，请重新检查')
      if (mounted.current) setJob(data)
    } catch (e) {
      if (mounted.current) setProgress({ phase: 'failed', progress: 100, message: e instanceof Error ? e.message : '更新未开始，请重新检查', terminal: true, ok: false })
    } finally { installing.current = false }
  }
  const copyCommand = async () => {
    if (!check?.manualCommand || checking || busy) return
    try { await navigator.clipboard.writeText(check.manualCommand); if (mounted.current) setCopied(true) }
    catch { if (mounted.current) setError('复制失败，请手动选中下方命令复制。') }
  }
  return <div className={styles.updateCard}>
    <div className={styles.pairingHead}><div><strong>插件更新</strong></div>
      <button type="button" className={styles.secondaryButton} disabled={checking || busy} onClick={() => void refresh()}>{checking ? '检查中…' : '检查更新'}</button></div>
    {check ? <>{check.channel === 'preview' ? <span className={styles.updateLabel} data-severity="recommended">预览通道</span> : null}
      <div className={styles.updateVersions}><span>DSH <strong>{check.advice.current.agentVersion || '未知'}</strong></span><span>插件 <strong>{check.advice.current.pluginVersion || '未知'}</strong></span></div>
      {!checking ? <><strong className={styles.updateLabel} data-severity={check.advice.severity} role="status">{check.advice.label}</strong>
        {check.advice.targetVersion ? <p>可更新至 {check.advice.targetVersion}{check.mode === 'manual' ? ' · 需手动更新' : ''}</p> : null}
        {check.advice.severity === 'unknown' || check.advice.severity === 'required' || check.mode === 'manual' || check.mode === 'busy'
          ? <details><summary>{check.mode === 'manual' ? '手动更新说明' : '查看说明'}</summary>
            {check.reason ? <p>{check.reason}</p> : null}<p>{check.advice.message}</p></details> : null}
        {check.mode === 'manual' && check.manualCommand ? <div className={styles.updateCommand}><code>{check.manualCommand}</code><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void copyCommand()}>{copied ? '已复制' : '复制命令'}</button></div> : null}
        {check.canInstall ? <><button type="button" className={styles.primaryButton} disabled={busy || Boolean(error)} onClick={() => void install()}>更新并重启</button><small className={styles.updateChecked}>会短暂断开连接，保留原配对和会话</small></> : null}
        {check.advice.checkedAt && check.advice.severity !== 'unknown' ? <small className={styles.updateChecked}>最近检查 {new Date(check.advice.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small> : null}
      </> : null}</> : null}
    {error ? <p role="alert">{error}</p> : null}
    {progress ? <div role="status" aria-live="polite"><progress className={styles.updateProgress} max={100} value={progress.progress} /><p>{progress.message}</p>
      {resumeFailed ? <p role="alert">插件已完成更新，但未能自动打开 WebUI。请使用 DSH 启动时显示的地址打开，无需重复更新。</p> : null}</div> : null}
  </div>
}
