import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { OtherEndpointInfo } from '../other-endpoint-info.js'
import { ActionButton, StatusLabel } from './PluginUi.js'
import styles from './OtherEndpointSummary.module.css'

export type ReadOtherEndpoint = (signal: AbortSignal) => Promise<OtherEndpointInfo>
const stableConnection = { subscribe: (_listener: () => void) => () => {}, getSnapshot: () => 0 }
interface Snapshot { reader: ReadOtherEndpoint; generation: number; busy: boolean; value?: OtherEndpointInfo; error?: boolean }

export function OtherEndpointSummary({ readOtherEndpoint, connection = stableConnection }: {
  readOtherEndpoint?: ReadOtherEndpoint
  connection?: typeof stableConnection
}): JSX.Element | null {
  const generation = useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => { flight.current?.abort(); flight.current = null }, [readOtherEndpoint, generation])
  const state = snapshot?.reader === readOtherEndpoint && snapshot?.generation === generation ? snapshot : null
  const read = async () => {
    if (!readOtherEndpoint || flight.current) return
    const controller = new AbortController()
    flight.current = controller
    const owner = { reader: readOtherEndpoint, generation }
    setSnapshot({ ...owner, busy: true, value: state?.value })
    const current = () => !controller.signal.aborted && flight.current === controller && connection.getSnapshot() === generation
    try {
      const value = await readOtherEndpoint(controller.signal)
      if (current()) setSnapshot({ ...owner, busy: false, value })
    } catch { if (current()) setSnapshot({ ...owner, busy: false, error: true }) }
    finally { if (flight.current === controller) flight.current = null }
  }
  if (!readOtherEndpoint) return null
  const value = state?.value
  const label = value?.scope === 'desktop' ? 'Desktop' : value?.scope === 'web' ? 'Web' : '另一端'
  return <details className={styles.summary} onToggle={event => {
    if (event.currentTarget.open && !state && !flight.current) void read()
  }}>
    <summary>同机另一端</summary>
    <div className={styles.row} aria-live="polite">
      {state?.busy ? <StatusLabel state="ongoing">正在读取版本</StatusLabel>
        : !value || state?.error || value.state === 'unknown' ? <span>暂时无法读取版本</span>
          : value.state === 'not-found' ? <span>未发现同机 {label} 配置</span>
            : <><strong>{label}</strong><span>DSH {value.dshVersion ?? '版本未知'}</span>
              <span>{value.pluginState === 'installed' ? `插件 ${value.pluginVersion}`
                : value.pluginState === 'not-installed' ? '未安装微信连接' : '插件版本未知'}</span>
              {value.pluginState === 'installed' ? <StatusLabel state={value.update.state === 'available' ? 'warning' : value.update.state === 'none' ? 'done' : 'off'}>
                {value.update.state === 'available' ? `可更新至正式版 ${value.update.targetVersion}`
                  : value.update.state === 'none' ? '暂无正式版更新' : '正式版更新暂不可查'}
              </StatusLabel> : null}</>}
      <ActionButton variant="ghost" disabled={Boolean(state?.busy)} onClick={() => void read()}>刷新</ActionButton>
    </div>
  </details>
}
