import styles from './HarnessRemoteSettings.module.css'
import type { GateStatus } from './remote-page-store.js'

export function CompanionUpdateCard({ value, onDecide, deciding = false, compact = false }: { value?: GateStatus['companionUpdate']; onDecide?: (action: 'approve' | 'later') => void; deciding?: boolean; compact?: boolean }): JSX.Element | null {
  if (!value || (!compact && value.state === 'idle')) return null
  // Both the sender and receiver show this card. The message names the exact
  // destination; "另一端" in the heading would point at the wrong host on receipt.
  const titles: Record<string, string> = { 'confirmation-required': '是否更新下方指定端的插件？', deferred: '已暂缓此次联动更新', pending: '联动更新待处理', busy: '等待待更新端的任务结束',
    preparing: '正在准备联动更新', installing: '正在安装插件更新', verifying: '正在核验更新后的恢复状态',
    recovering: '正在恢复更新前的插件', 'restart-required': '待更新端需启动或重启确认',
    'self-restart-required': '当前端待重启，尚未生效', unverified: '两端更新状态待核实',
    complete: '两端插件已对齐', unavailable: '联动更新尚未确认成功' }
  const active = ['preparing', 'installing', 'verifying', 'recovering'].includes(value.state)
  const peer = value.versions?.peer === 'desktop' ? 'Desktop' : value.versions?.peer === 'web' ? 'Web' : null
  const target = value.target?.scope === 'desktop' ? 'Desktop' : value.target?.scope === 'web' ? 'Web' : null
  const endpoint = target || '更新端'
  const compactTitles: Record<string, string> = { pending: `等待 ${endpoint} 就绪`, busy: `${endpoint} 有任务，等待空闲`,
    preparing: `正在准备 ${endpoint} 更新`, installing: `正在更新 ${endpoint}`, verifying: `正在核对 ${endpoint} 更新结果`,
    recovering: `正在恢复 ${endpoint} 原版本`, 'restart-required': `${endpoint} 已安装，待启动或重连确认`,
    'self-restart-required': '当前端待重启，尚未生效', unverified: '更新状态待核对', complete: '两端版本已同步', unavailable: '更新未完成，请核对' }
  const confirmable = ['confirmation-required', 'deferred'].includes(value.state)
  if (compact && value.state === 'idle' && !value.versions?.peerInstalled) return <p className={styles.updatePeerNote}>未检测到可同步更新的另一端；当前端可独立使用。</p>
  const summary = value.state === 'idle' ? '未发现待确认的同步更新'
    : compact && confirmable && target && value.target ? `${target} 可更新至 ${value.target.version}${value.state === 'deferred' ? ' · 已暂缓' : ''}`
      : compact && value.state === 'self-restart-required' ? '当前端重启后可检查同步更新'
        : (compact ? compactTitles[value.state] : undefined) || titles[value.state] || '插件更新状态待核对'
  const actions = confirmable && value.offerId && onDecide ? <div className={styles.updateActions}>
    <button type="button" className={styles.primaryButton} disabled={deciding} onClick={() => onDecide('approve')}>{deciding ? '确认中…' : target ? `确认更新 ${target}` : '确认更新指定端'}</button>
    <button type="button" className={styles.secondaryButton} disabled={deciding} onClick={() => onDecide('later')}>稍后再说</button>
  </div> : null
  return <aside className={compact ? styles.companionInline : styles.companionCard} data-state={value.state} role="status" aria-live="polite">
    {compact ? <div className={styles.updateRow}><div className={styles.updateCopy}>
      {peer ? <div className={styles.updateVersions}><strong>{peer} <span className={styles.updateScope}>同一主机</span></strong><span>{value.versions?.peerInstalled ? `已安装 ${value.versions.peerInstalled}` : '安装或启用状态未确认'}</span></div> : null}
      <strong>{summary}</strong></div>{actions}</div> : <strong>{summary}</strong>}
    {compact ? <>
      {value.state !== 'idle' && value.message ? <details className={styles.updateDetails}><summary>详细状态</summary><p>{value.message}</p></details> : null}
    </> : value.message ? <p>{value.message}</p> : null}
    {!compact && value.versions ? <small>{value.versions.current === 'desktop' ? 'Desktop' : 'Web'}：运行 {value.versions.running} · 已安装 {value.versions.installed ?? '未确认'}；{peer}：已安装 {value.versions.peerInstalled ?? '未确认或未启用'}</small> : null}
    {actions ? <>{!compact ? actions : null}<small className={styles.updateChecked}>空闲后更新，连接会短暂中断；保留配对与会话。</small></> : null}
    {active ? <progress aria-label="联动更新进度" /> : null}
    {value.state === 'busy' ? <small>不用手动停止任务。请保持两端运行，空闲后会继续检查。</small>
      : active ? <small>请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。</small>
      : value.state === 'unavailable' ? <small>请在待更新端核对版本，必要时使用其原安装入口。</small> : null}
  </aside>
}
