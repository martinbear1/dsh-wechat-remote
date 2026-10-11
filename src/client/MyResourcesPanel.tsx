import { useEffect, useRef, useState } from 'react'
import { initialResourcesView, isResourceUpdate, localActivationUnavailable, MyResourcesStore, resourceKey, type MyResourcesCall } from './my-resources-store.js'
import styles from './HarnessRemoteSettings.module.css'

/** Opening reads local status only; cloud refresh and native installation require an explicit click. */
export function MyResourcesPanel({ call, nodeName, hostName }: { call: MyResourcesCall; nodeName?: string; hostName?: string }): JSX.Element {
  const [snapshot, setSnapshot] = useState(() => ({ call, view: initialResourcesView() }))
  const current = useRef<{ call: MyResourcesCall; store: MyResourcesStore } | null>(null)
  useEffect(() => {
    const store = new MyResourcesStore(call)
    current.current = { call, store }
    setSnapshot({ call, view: store.getSnapshot() })
    const unsubscribe = store.subscribe(() => setSnapshot({ call, view: store.getSnapshot() }))
    void store.load()
    return () => { unsubscribe(); store.dispose(); if (current.current?.store === store) current.current = null }
  }, [call])
  // Do not display or act on a previous connection while the new effect is mounting.
  const view = snapshot.call === call ? snapshot.view : { ...initialResourcesView(), busy: true }
  const activeStore = () => current.current?.call === call ? current.current.store : null
  const { data, busy, error, itemErrors, installing, toggling } = view
  return <section className={styles.assistantsCard} aria-label="我的资源" aria-busy={busy}>
    <div className={styles.assistantsHeading}><h3>我的资源</h3>
      <button type="button" className={styles.assistantTextButton} disabled={busy} onClick={() => void activeStore()?.refresh()}>
        {busy && !installing && !toggling ? '读取中…' : '刷新'}
      </button>
    </div>
    {nodeName ? <p className={styles.clawbotNode}>当前节点：{nodeName}{hostName ? ` · ${hostName}` : ''}</p> : null}
    {!data && !error ? <p role="status">正在读取本地资源…</p> : null}
    {data?.notice ? <p role="status">{data.notice}</p> : null}
    {data && !data.supported && !data.notice ? <p role="status">当前 DSH 暂不支持安装资源，请更新后重试。</p> : null}
    {data?.supported && !data.items.length && !data.notice && !error && !busy ? <p role="status">暂无资源，点击刷新查看已购资源。</p> : null}
    {data?.items.map(item => {
      const key = resourceKey(item.resourceId, item.version)
      const pending = installing === key || item.state === 'installing'
      const installed = item.state === 'installed'
      const retryActivation = localActivationUnavailable(item)
      const canToggle = (installed || retryActivation) && typeof item.enabled === 'boolean'
      const failed = itemErrors[key]
      const label = toggling === key ? '处理中…' : pending ? '安装中…' : retryActivation ? '重试启用' : canToggle ? item.enabled ? '停用' : '启用'
        : installed ? '已安装' : failed || item.state === 'unavailable' ? '重试' : isResourceUpdate(item, data.items) ? '更新' : '安装'
      return <article key={key} className={styles.assistantChoice}>
        <div className={styles.assistantChoiceCopy}>
          <div className={styles.assistantChoiceHead}><strong>{item.name}</strong><span className={styles.assistantUnavailable}>v{item.version}</span></div>
          {item.description ? <p>{item.description}</p> : null}
          {canToggle ? <p>{retryActivation ? item.enabled ? '启用未完成' : '停用未完成' : item.enabled ? '已启用' : '已停用'}</p> : null}
          {item.message && !failed ? <p role="status">{item.message}</p> : null}
          {failed ? <p role="alert">{failed}</p> : null}
        </div>
        <div className={styles.assistantChoiceHead}>
          <button type="button" className={styles.assistantSecondary}
            disabled={busy || !data.supported || (installed && !canToggle) || pending}
            aria-label={`${label} ${item.name} v${item.version}`}
            onClick={() => {
              if (canToggle) void activeStore()?.setEnabled(item.resourceId, item.version, retryActivation || !item.enabled)
              else void activeStore()?.install(item.resourceId, item.version)
            }}>
            {label}
          </button>
          {retryActivation ? <button type="button" className={styles.assistantSecondary}
            disabled={busy || !data.supported} aria-label={`停用 ${item.name} v${item.version}`}
            onClick={() => void activeStore()?.setEnabled(item.resourceId, item.version, false)}>停用</button> : null}
        </div>
      </article>
    })}
    {error ? <p role="alert">{error}</p> : null}
  </section>
}
