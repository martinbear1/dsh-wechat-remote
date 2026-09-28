import styles from './HarnessRemoteSettings.module.css'

export function CompanionUpdateCard({ value, onDecide, deciding = false }: { value?: { state: string; message: string; offerId?: string; versions?: { current: string; running: string; installed: string | null; peer: string; peerInstalled: string | null } }; onDecide?: (action: 'approve' | 'later') => void; deciding?: boolean }): JSX.Element | null {
  if (!value || value.state === 'idle' || !value.message) return null
  // Both the sender and receiver show this card. The message names the exact
  // destination; "另一端" in the heading would point at the wrong host on receipt.
  const titles: Record<string, string> = { 'confirmation-required': '是否更新下方指定端的插件？', deferred: '已暂缓此次联动更新', pending: '联动更新待处理', busy: '等待待更新端的任务结束',
    preparing: '正在准备联动更新', installing: '正在安装插件更新', verifying: '正在核验更新后的恢复状态',
    recovering: '正在恢复更新前的插件', 'restart-required': '待更新端需启动或重启确认',
    'self-restart-required': '当前端待重启，尚未生效', unverified: '两端更新状态待核实',
    complete: '两端插件已对齐', unavailable: '联动更新尚未确认成功' }
  const active = ['preparing', 'installing', 'verifying', 'recovering'].includes(value.state)
  return <aside className={styles.companionCard} data-state={value.state} role="status" aria-live="polite">
    <strong>{titles[value.state] || '另一端插件更新状态'}</strong>
    <p>{value.message}</p>
    {value.versions ? <small>{value.versions.current === 'desktop' ? 'Desktop' : 'Web'}：运行 {value.versions.running} · 已安装 {value.versions.installed ?? '未确认'}；{value.versions.peer === 'desktop' ? 'Desktop' : 'Web'}：已安装 {value.versions.peerInstalled ?? '未确认或未启用'}</small> : null}
    {['confirmation-required', 'deferred'].includes(value.state) && value.offerId && onDecide ? <div>
      <button type="button" className={styles.primaryButton} disabled={deciding} onClick={() => onDecide('approve')}>确认并等待空闲后更新</button>
      <button type="button" className={styles.secondaryButton} disabled={deciding} onClick={() => onDecide('later')}>稍后再说</button>
    </div> : null}
    {active ? <progress aria-label="联动更新进度" /> : null}
    {value.state === 'busy' ? <small>不用手动停止任务。请保持两端运行，空闲后会继续检查。</small>
      : active ? <small>请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。</small>
      : value.state === 'unavailable' ? <small>请在待更新端核对版本，必要时使用其原安装入口。</small> : null}
  </aside>
}
