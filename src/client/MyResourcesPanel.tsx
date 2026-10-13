import { useEffect, useRef, useState } from 'react'
import { groupResources, initialResourcesView, localActivationUnavailable, MyResourcesStore, resourceKey,
  type MyResourceItem, type MyResourcesCall } from './my-resources-store.js'
import { ActionButton, SectionHeading, StatusLabel } from './PluginUi.js'
import ui from './PluginUi.module.css'
import styles from './MyResourcesPanel.module.css'

interface StartState { call: MyResourcesCall; key: string; busy: boolean; error: string }
interface StopIntent { call: MyResourcesCall; item: MyResourceItem }
interface Props {
  call: MyResourcesCall
  nodeName?: string
  hostName?: string
  onStart?: (presetId: string, signal: AbortSignal) => Promise<void>
}

/** Local reads on open; downloads, activation and new conversations require separate clicks. */
export function MyResourcesPanel({ call, nodeName, hostName, onStart }: Props): JSX.Element {
  const [snapshot, setSnapshot] = useState(() => ({ call, view: initialResourcesView() }))
  const [startState, setStartState] = useState<StartState | null>(null)
  const [stopIntent, setStopIntent] = useState<StopIntent | null>(null)
  const starting = useRef<AbortController | null>(null)
  const current = useRef<{ call: MyResourcesCall; store: MyResourcesStore } | null>(null)
  useEffect(() => {
    const store = new MyResourcesStore(call)
    current.current = { call, store }
    setSnapshot({ call, view: store.getSnapshot() })
    const unsubscribe = store.subscribe(() => setSnapshot({ call, view: store.getSnapshot() }))
    void store.load()
    return () => {
      unsubscribe(); store.dispose(); starting.current?.abort(); starting.current = null
      if (current.current?.store === store) current.current = null
    }
  }, [call])
  // Old connection data and captured handlers cannot act on a newly selected node.
  const view = snapshot.call === call ? snapshot.view : { ...initialResourcesView(), busy: true }
  const activeStore = () => current.current?.call === call ? current.current.store : null
  const { data, error, itemErrors, installing, toggling, catalogRead } = view
  const activeStart = startState?.call === call ? startState : null
  const busy = view.busy || Boolean(activeStart?.busy)
  const groups = groupResources(data?.items ?? [])
  const hasItems = Boolean(data?.items.length)
  const start = (item: MyResourceItem) => {
    if (!onStart || !item.presetId || !item.enabled || item.state !== 'installed' || busy || !activeStore() || starting.current) return
    const controller = new AbortController(), key = resourceKey(item.resourceId, item.version)
    starting.current = controller
    setStartState({ call, key, busy: true, error: '' })
    void Promise.resolve().then(async () => {
      if (!controller.signal.aborted && activeStore()) await onStart(item.presetId!, controller.signal)
    }).then(() => {
      if (!controller.signal.aborted && activeStore()) setStartState({ call, key, busy: false, error: '' })
    }, () => {
      if (!controller.signal.aborted && activeStore()) setStartState({ call, key, busy: false, error: '暂时无法打开会话，请重试。' })
    }).finally(() => { if (starting.current === controller) starting.current = null })
  }
  const stop = (item: MyResourceItem, historic: boolean) => {
    if (busy || !activeStore()) return
    if (historic && item.enabled) setStopIntent({ call, item })
    else void activeStore()?.setEnabled(item.resourceId, item.version, false)
  }
  const status = (item: MyResourceItem) => localActivationUnavailable(item)
    ? <StatusLabel state="warning">{item.enabled ? '启用未完成' : '停用未完成'}</StatusLabel>
    : item.state === 'installed' ? <StatusLabel state={item.enabled ? 'done' : 'off'}>{typeof item.enabled !== 'boolean' ? '已安装' : item.enabled ? '已启用' : '已停用'}</StatusLabel>
    : null
  const feedback = (item: MyResourceItem) => {
    const key = resourceKey(item.resourceId, item.version), failed = itemErrors[key]
    const startError = activeStart?.key === key ? activeStart.error : ''
    return <>
      {item.message && !failed ? <p className={ui.warning} role="status">{item.message}</p> : null}
      {failed ? <p className={ui.error} role="alert">{failed}</p> : null}
      {startError ? <p className={ui.error} role="alert">{startError}</p> : null}
    </>
  }
  const controls = (item: MyResourceItem, options: { update?: boolean; history?: boolean; historic?: boolean } = {}) => {
    const key = resourceKey(item.resourceId, item.version), pending = installing === key || item.state === 'installing'
    const retry = localActivationUnavailable(item), installed = item.state === 'installed'
    const canToggle = (installed || retry) && typeof item.enabled === 'boolean'
    const canStart = !options.history && installed && item.enabled && item.presetId && onStart
    const opening = !options.history && activeStart?.key === key && activeStart.busy
    const label = opening ? '打开中…' : toggling === key ? '处理中…' : pending ? '安装中…' : retry ? '重试启用'
      : canStart ? '开始使用' : canToggle ? item.enabled ? '停用' : '启用' : installed ? '已安装'
      : itemErrors[key] || item.state === 'unavailable' ? '重试' : options.update ? '更新' : '安装'
    return <div className={ui.cardActions}>
      <ActionButton disabled={busy || !data?.supported || installed && !canToggle || pending}
        aria-label={`${label} ${item.name} v${item.version}`}
        onClick={() => {
          if (!activeStore() || busy) return
          if (canStart) start(item)
          else if (canToggle) {
            if (!retry && item.enabled) stop(item, Boolean(options.historic))
            else void activeStore()?.setEnabled(item.resourceId, item.version, true)
          } else void activeStore()?.install(item.resourceId, item.version)
        }}>{label}</ActionButton>
      {retry ? <ActionButton disabled={busy || !data?.supported} aria-label={`停用 ${item.name} v${item.version}`}
        onClick={() => stop(item, Boolean(options.historic))}>停用</ActionButton> : null}
    </div>
  }
  const versionRow = (item: MyResourceItem, options: { history?: boolean; historic?: boolean; update?: boolean; controls?: boolean } = {}) =>
    <div key={resourceKey(item.resourceId, item.version)} className={styles.versionRow}>
      <div className={styles.versionCopy}><div className={styles.versionHeading}><span>v{item.version}</span>{status(item)}</div>
        {item.description ? <p className={ui.copy}>{item.description}</p> : null}{feedback(item)}</div>
      {options.controls === false ? null : controls(item, options)}
    </div>
  const intent = stopIntent?.call === call ? stopIntent : null
  return <section className={ui.panel} aria-label="我的资源" aria-busy={busy}>
    <SectionHeading icon="resources" title="我的资源" actions={<ActionButton variant="ghost" disabled={busy}
      onClick={() => void activeStore()?.refresh()}>{view.busy && !installing && !toggling ? '读取中…' : '刷新'}</ActionButton>} />
    {nodeName ? <p className={`${ui.meta} ${styles.node}`}>当前节点：{nodeName}{hostName ? ` · ${hostName}` : ''}</p> : null}
    {!data && !error ? <p className={ui.copy} role="status">正在读取本地资源…</p> : null}
    {data?.notice ? <p className={ui.warning} role="status">{data.notice}</p> : null}
    {data && !data.supported && !data.notice ? <p className={ui.warning} role="status">当前 DSH 暂不支持安装资源，请更新后重试。</p> : null}
    {groups.local.length ? <div className={styles.collection} aria-label="已安装的预设">
      <h4 className={styles.sectionTitle}>已安装</h4>
      <div className={ui.grid}>{groups.local.map(group => {
        const item = group.primary
        const otherDelivery = group.delivery.filter(release => release !== group.update)
        const historyErrors = group.local.some(release => itemErrors[resourceKey(release.resourceId, release.version)])
        return <article key={group.resourceId} className={ui.card} data-resource-id={group.resourceId}>
          <div className={styles.versionHeading}><h4>{item.name}</h4><span className={ui.meta}>v{item.version}</span></div>
          {item.description ? <p className={ui.copy}>{item.description}</p> : null}
          <div className={styles.primaryActions}>{status(item)}{item.state === 'installed' && item.enabled && (!onStart || !item.presetId) ? null : controls(item)}</div>{feedback(item)}
          {group.update ? <div className={styles.update}>
            <div className={styles.versionCopy}><span className={ui.copy}>可更新至 v{group.update.version}</span>{feedback(group.update)}</div>
            {controls(group.update, { update: true })}
          </div> : null}
          <details className={ui.details}>
            <summary>版本记录{historyErrors ? ' · 有操作未完成' : ''}</summary>
            <p className={ui.copy}>旧会话使用对应版本，停用后可能无法继续打开。</p>
            {group.local.map(release => versionRow(release, { history: true, historic: release !== item,
              controls: release !== item || item.enabled === true && !localActivationUnavailable(item) }))}
            {otherDelivery.length ? <><p className={styles.historyLabel}>其他可安装版本</p>{otherDelivery.map(release => versionRow(release))}</> : null}
          </details>
        </article>
      })}</div>
      {groups.local.some(group => group.update || group.local.length > 1) ? <p className={`${ui.copy} ${styles.note}`}>新聊天可使用新版，已有聊天保留原版本。</p> : null}
    </div> : null}
    {groups.delivery.length ? <div className={styles.collection} aria-label="可安装的资源">
      <h4 className={styles.sectionTitle}>可安装的资源</h4>
      <div>{groups.delivery.map(group => <article key={group.resourceId} className={styles.deliveryRow} data-resource-id={group.resourceId}>
        <div className={styles.versionCopy}><div className={styles.versionHeading}><strong>{group.primary.name}</strong><span className={ui.meta}>v{group.primary.version}</span></div>
          {group.primary.description ? <p className={ui.copy}>{group.primary.description}</p> : null}{feedback(group.primary)}
          {group.delivery.length > 1 ? <details className={ui.details}><summary>版本记录</summary>
            {group.delivery.slice(1).map(item => versionRow(item))}
          </details> : null}
        </div>{controls(group.primary)}
      </article>)}</div>
    </div> : null}
    {data?.supported && !busy && !data.notice && !error ? !catalogRead && !groups.delivery.length
      ? <p className={`${ui.copy} ${styles.note}`}>点击刷新查看已购资源与更新。</p>
      : catalogRead && !hasItems ? <p className={ui.copy} role="status">暂无可安装的资源。</p> : null : null}
    {intent ? <div className={styles.confirm} role="alert">
      <p>使用「{intent.item.name}」v{intent.item.version} 的已有会话可能无法继续，确认停用？</p>
      <div className={ui.cardActions}><ActionButton disabled={busy} onClick={() => {
        if (!activeStore() || busy) return
        setStopIntent(null)
        void activeStore()?.setEnabled(intent.item.resourceId, intent.item.version, false)
      }}>确认停用</ActionButton><ActionButton disabled={busy} variant="ghost" onClick={() => setStopIntent(null)}>取消</ActionButton></div>
    </div> : null}
    {error ? <p className={ui.error} role="alert">{error}</p> : null}
  </section>
}
