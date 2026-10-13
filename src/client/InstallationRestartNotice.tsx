import { useEffect, useState } from 'react'
import { manualRestartInstruction, pendingRestart, type InstallationState } from './installation-state.js'
import styles from './HarnessRemoteSettings.module.css'

export interface InstallationRestartProps {
  readInstallation?: () => Promise<InstallationState>
  runningVersion?: string
  installedVersion?: string
  scope?: string
  hostIdentity?: string
}

/** Supplement the native activation modal when the host hides it on details.
 * One existing read per mounted host/runtime, no timer, approval or action. */
export function InstallationRestartNotice({ readInstallation, runningVersion, installedVersion, scope, hostIdentity }: InstallationRestartProps): JSX.Element | null {
  const [read, setRead] = useState<{ reader: typeof readInstallation; running?: string; scope?: string; host?: string; state: InstallationState } | null>(null)
  useEffect(() => {
    let active = true
    if (readInstallation && runningVersion) {
      void Promise.resolve().then(readInstallation).then(state => {
        if (active) setRead({ reader: readInstallation, running: runningVersion, scope, host: hostIdentity, state })
      }, () => { /* Auxiliary guidance cannot fail the page or block a workflow. */ })
    }
    return () => { active = false }
  }, [readInstallation, runningVersion, scope, hostIdentity])
  const current = read && read.reader === readInstallation && read.running === runningVersion
    && read.scope === scope && read.host === hostIdentity ? read.state : undefined
  // Native inventory is authoritative for the installed owner. The loaded
  // older host may still describe the old package path in a pnpm store.
  const result = pendingRestart(runningVersion, current?.installedVersion ?? installedVersion, scope)
  if (!result || current?.phase === 'disabled') return null
  return <div className={styles.updateEndpoint} role="status" aria-live="polite">
    <strong className={styles.updateLabel} data-severity="info">已安装，需重启当前 DSH 才能生效</strong>
    <p>已安装 {result.installedVersion} · 当前运行 {result.runningVersion}</p>
    <p className={styles.updateNote}>{manualRestartInstruction(result.scope)} 无需重新配对，也不需要再次安装插件。</p>
  </div>
}
