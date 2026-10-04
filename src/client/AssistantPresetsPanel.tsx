import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AssistantStore } from './assistant-store.js'
import styles from './HarnessRemoteSettings.module.css'

/** Registered inside the plugin's official Settings slot, never a shell patch. */
export function AssistantPresetsPanel({ store, start }: { store: AssistantStore; start?: (presetId: string, lifetime?: AbortSignal, newIntent?: boolean) => Promise<void> }): JSX.Element {
  const { catalog, preview, busy, message, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [launching, setLaunching] = useState(false), [launchError, setLaunchError] = useState('')
  const lifecycle = useRef<AbortController>()
  useEffect(() => { const controller = new AbortController(); lifecycle.current = controller; return () => controller.abort() }, [])
  const open = async (presetId: string, newIntent = false) => {
    if (!start || launching || !lifecycle.current || lifecycle.current.signal.aborted) return
    const signal = lifecycle.current.signal
    setLaunching(true); setLaunchError('')
    try { await start(presetId, signal, newIntent) } catch (e) { if (!signal.aborted) setLaunchError(e instanceof Error ? e.message : '请检查原生会话列表') }
    finally { if (!signal.aborted) setLaunching(false) }
  }
  return <section className={styles.companionCard} aria-label="工作助手">
    <strong>工作助手</strong>
    <p>选一个现成助手，预览后安装为 DSH 原生工作模式。具体身份、班级或项目资料在开始会话后再逐步告诉它。</p>
    <p>想设计其他助手？选择「助手设计师」，安装后用普通语言告诉它想解决什么工作。它会准备可重复使用的模式，生成的草稿也会出现在这里；不需要开发知识。</p>
    <button type="button" disabled={busy} onClick={() => void store.load()}>{catalog ? '刷新助手目录' : '查看可用助手'}</button>
    {catalog && !catalog.native?.supported ? <p role="status">{catalog.native?.reason || '此宿主尚不支持原生预设安装'}</p> : null}
    {catalog?.native?.supported ? <div className={styles.actions}>{catalog.templates.map((item: any) =>
      <button key={item.id} type="button" disabled={busy} title={item.description} onClick={() => void store.choose(item.id)}>{item.name}</button>)}</div> : null}
    {preview ? <div>
      <h4>{preview.definition.name}</h4><p>{preview.definition.description}</p><p>{preview.definition.role}</p>
      <small>第 {preview.version} 版 · 内容摘要 {preview.digest.slice(0, 12)}</small>
      <ul>{preview.definition.methods.map((method: string, index: number) => <li key={index}>{method}</li>)}</ul>
      <p>开始工作后逐步了解：</p>
      <ul>{preview.definition.onboarding.map((question: { key: string; label: string; prompt: string }) => <li key={question.key}>{question.label}：{question.prompt}</li>)}</ul>
      <p>搭配技能：群工作流。沿用基础模式：{preview.native.basePreset}。</p>
      <ul>{(preview.native.warnings || []).map((warning: string, index: number) => <li key={index}>{warning}</li>)}</ul>
      <button type="button" disabled={busy} onClick={() => void store.install()}>确认，安装这个原生预设</button>
    </div> : null}
    {catalog?.drafts.map((item: any) => <div key={`${item.id}:${item.version}`}>
      <p>{item.name} · 第 {item.version} 版 · {item.state === 'installed' ? '已生效' : item.state === 'draft' ? '待确认' : '待核对'}</p>
      {item.state === 'draft' ? <button type="button" disabled={busy} onClick={() => void store.preview(item.id, item.version)}>预览</button>
        : <button type="button" disabled={busy} onClick={() => void store.verify(item.id, item.version)}>核对安装状态</button>}
      {item.state === 'installed' && start ? <><button type="button" disabled={busy || launching} onClick={() => void open(item.presetId)}>开始或打开已创建会话</button>
        <button type="button" disabled={busy || launching} onClick={() => void open(item.presetId, true)}>另开独立工作会话</button></> : null}
    </div>)}
    {message ? <p role="status">{message}</p> : null}
    {error || launchError ? <p role="alert">{error || launchError}</p> : null}
    <small>普通入口跨重启核对并打开已创建会话；明确选择“另开独立工作会话”才另建实例。结果未知时只核对，不自动重建。不会改动默认模式或已有会话。</small>
  </section>
}
