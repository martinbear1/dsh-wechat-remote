import { useSyncExternalStore } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { CompanionUpdateCard } from './CompanionUpdateCard.tsx'
import { type HarnessRemoteHostDescription, type CallPairingManagement } from './pairing-client.js'
import { pageStore, type RemotePageStore } from './remote-page-store.js'
import styles from './HarnessRemoteSettings.module.css'

/** Native plugin activation/detail contribution; no host DOM manipulation. */
export function CompanionPanel({ describeHost, callManagement, onDismiss, onOpenDetails, compact = false, store = pageStore(describeHost, callManagement) }: {
  describeHost: () => Promise<HarnessRemoteHostDescription>; callManagement: CallPairingManagement; onDismiss?: () => void
  onOpenDetails?: () => void; store?: RemotePageStore; compact?: boolean
}): JSX.Element {
  const { status, deciding, decisionError, error: loadError, loadState } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const value = status?.companionUpdate, error = decisionError || loadError
  const content = <div><CompanionUpdateCard value={value} compact={compact} deciding={deciding || loadState !== 'ready'} onDecide={action => void store.decide(action)} />
    {!value && !error ? <p className={styles.helpText}>{loadState === 'loading' ? '正在检查同一主机的另一端…' : '另一端状态未确认；不会自动更新。'}</p>
      : !compact && value?.state === 'idle' ? <p className={styles.helpText}>未发现需要联动更新的另一端。当前节点可独立使用，不会自动安装另一端或启用已停用的插件。</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {onDismiss ? <div className={styles.actions}>
      {onOpenDetails ? <button type="button" className={styles.primaryButton} onClick={onOpenDetails}>前往微信连接</button> : null}
      <button type="button" className={styles.secondaryButton} onClick={onDismiss}>关闭提示（不会确认更新）</button>
    </div> : null}</div>
  // The activation slot renders inline in the native list; its owner does not
  // supply a modal. Use the host primitive, as native activation guides do.
  return onDismiss ? <Modal open title="微信连接 · 联动更新" closeLabel="关闭提示" className={styles.pageDialog} contentClassName={styles.pageDialogContent} onClose={onDismiss}>{content}</Modal> : content
}
