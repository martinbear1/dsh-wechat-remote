import { useRef, useState } from 'react'
import styles from './HarnessRemoteSettings.module.css'

export function WechatShortcut({ wide, openPlugin }: { wide: boolean; openPlugin: () => Promise<boolean> }): JSX.Element {
  const [help, setHelp] = useState(false), [opening, setOpening] = useState(false)
  const pending = useRef(false)
  const open = async () => {
    if (pending.current) return
    pending.current = true; setOpening(true)
    try { if (!await openPlugin()) setHelp(true) }
    finally { pending.current = false; setOpening(false) }
  }
  return <><button type="button" className={styles.sidebarButton} data-wide={wide} title="微信连接" aria-label="微信连接" disabled={opening} onClick={() => void open()}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.2A7.8 7.8 0 0 1 4 11.5a8 8 0 0 1 16 0Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" strokeWidth="2.5" strokeLinecap="round"/></svg>
    {wide ? <span>{opening ? '正在打开…' : '微信连接'}</span> : null}
  </button>{help ? <small role="status">插件详情暂不可用，请打开「设置 → 微信连接」。</small> : null}</>
}
