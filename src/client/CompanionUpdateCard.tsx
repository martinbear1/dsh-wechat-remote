import styles from './HarnessRemoteSettings.module.css'

export function CompanionUpdateCard({ value }: { value?: { state: string; message: string } }): JSX.Element | null {
  if (!value || value.state === 'idle' || !value.message) return null
  const titles: Record<string, string> = { pending: '另一端插件更新待处理', busy: '等待另一端任务结束',
    preparing: '正在准备另一端插件更新', installing: '正在更新另一端插件', verifying: '正在核验另一端恢复',
    recovering: '正在恢复另一端原插件', 'restart-required': '另一端待启动或重启确认',
    complete: '两端插件已对齐', unavailable: '另一端未确认更新成功' }
  const active = ['preparing', 'installing', 'verifying', 'recovering'].includes(value.state)
  return <aside className={styles.companionCard} data-state={value.state} role="status" aria-live="polite">
    <strong>{titles[value.state] || '另一端插件更新状态'}</strong>
    <p>{value.message}</p>
    {active ? <progress aria-label="另一端插件更新进度" /> : null}
    {value.state === 'busy' ? <small>不用手动停止任务。请保持两端运行，空闲后会继续检查。</small>
      : active ? <small>请保持两端当前状态，暂勿退出、重启或重复安装。关闭本设置页不会取消更新。</small>
      : value.state === 'unavailable' ? <small>当前节点可继续使用；请在另一端核对版本，必要时使用其原安装入口。</small> : null}
  </aside>
}
