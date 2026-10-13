import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { manualRestartInstruction, type InstallationState } from './installation-state.js'
import styles from './HarnessRemoteSettings.module.css'

/** The native activation slot owns dismissal and navigation. This guide only
 * reports current-endpoint activation; it cannot mutate or restart the host. */
export function InstallationResultPanel({ packageName, readInstallation, onDismiss, onOpenDetails }: {
  packageName: string; readInstallation: (packageName: string) => Promise<InstallationState>
  onDismiss: () => void; onOpenDetails?: () => void
}): JSX.Element {
  const [state, setState] = useState<InstallationState | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setState(null)
    void Promise.resolve().then(() => readInstallation(packageName)).then(value => { if (active) setState(value) }, () => { if (active) setState({ phase: 'unknown' }) })
    return () => { active = false }
  }, [packageName, readInstallation, revision])
  return renderInstallationResult({ state, onDismiss, onOpenDetails, onRetry: () => setRevision(value => value + 1) })
}

/** Shared passive view. Rendering/dismissal never reads, installs or restarts. */
export function renderInstallationResult({ state, onDismiss, onOpenDetails, onRetry }: {
  state: InstallationState | null; onDismiss: () => void; onOpenDetails?: () => void; onRetry?: () => void
}): JSX.Element {
  const title = !state ? '正在核对安装结果…' : state.phase === 'restart-required' ? '已安装，需重启当前 DSH 才能生效'
    : state.phase === 'ready' ? '安装已生效' : state.phase === 'disabled' ? '已安装，尚未启用'
    : state.phase === 'incomplete' ? '组件尚未全部就绪' : '安装状态暂未确认'
  return <Modal open title="微信连接 · 安装结果" closeLabel="关闭提示" className={styles.pageDialog} contentClassName={styles.pageDialogContent} onClose={onDismiss}>
    <div className={styles.installationResult} role="status" aria-live="polite">
      <strong>{title}</strong>
      {state?.installedVersion ? <p>已安装 {state.installedVersion}{state.runningVersion ? ` · 当前运行 ${state.runningVersion}` : ''}</p> : null}
      {state?.phase === 'restart-required' ? <><p>{manualRestartInstruction(state.scope)}</p><p className={styles.helpText}>无需重新配对，也不需要再次安装插件。</p></> : null}
      {state?.phase === 'ready' ? <p>当前端可以使用，无需重启。</p> : null}
      {state?.phase === 'disabled' ? <p>请在原生插件管理器中启用微信连接。</p> : null}
      {state?.phase === 'incomplete' ? <><p>请在插件详情查看未启动的组件或安装错误。若刚覆盖安装了新版，可先在任务结束后手动重启；若仍有报错，请保留错误信息核查。</p><p className={styles.helpText}>{manualRestartInstruction(state.scope)}</p></> : null}
      {state?.phase === 'unknown' ? <><p>暂不能确认已生效。若刚安装或更新后页面不可用，请先在任务结束后手动重启当前 DSH，再重新核对。</p><p className={styles.helpText}>{manualRestartInstruction(state.scope)}</p><p className={styles.helpText}>若重启后仍有问题，请在原生插件管理器查看安装详情，并保留错误信息。</p></> : null}
    </div>
    <div className={styles.actions}>
      {onRetry && state && ['incomplete', 'unknown'].includes(state.phase) ? <button type="button" className={styles.secondaryButton} onClick={onRetry}>重新核对</button> : null}
      {onOpenDetails ? <button type="button" className={styles.secondaryButton} onClick={() => { onDismiss(); onOpenDetails() }}>查看插件</button> : null}
      <button type="button" className={styles.primaryButton} onClick={onDismiss}>知道了</button>
    </div>
  </Modal>
}
