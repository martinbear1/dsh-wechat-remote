import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AssistantStore } from './assistant-store.js'
import styles from './HarnessRemoteSettings.module.css'

const available = (item: any) => item.state === 'installed' && (item.nativeState === undefined || item.nativeState === 'installed')
const stateLabel = (item: any) => available(item) ? '已安装' : item.state === 'draft' ? '待安装'
  : item.nativeState === 'uninstalled' ? '未安装' : item.nativeState === 'disabled' ? '已停用'
    : item.state === 'pending-restart' ? '待重启' : '待核对'

/** Display aliases never rename an approved native preset or create a new ID. */
const displayName = (item: any) => item.templateId === 'designer' || item.id === 'designer' ? '定制我的助手' : item.name

/** Registered inside the official Settings slot. The verified native new-session
 * picker remains the entry to work; this panel only manages assistant modes. */
export function AssistantPresetsPanel({ store }: { store: AssistantStore }): JSX.Element {
  const { catalog, preview, busy, message, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [help, setHelp] = useState('')
  useEffect(() => { void store.load() }, [store])
  const drafts = catalog?.drafts || []
  const active = drafts.filter((item: any) => available(item) && !item.replacement)
  const pending = drafts.filter((item: any) => item.state === 'draft')
  const history = drafts.filter((item: any) => item.source !== 'builtin' && item.state !== 'draft' && (!available(item) || item.replacement))
  const templates = catalog?.templates || []
  const installedFor = (id: string) => active.find((item: any) => item.templateId === id)
  const use = (item: any) => setHelp(`新建会话时，在模式中选择「${item.name}」，再告诉它你想做什么。已有会话不会自动切换。`)
  const template = (item: any) => {
    const installed = installedFor(item.id)
    const included = item.builtin
    return <article className={styles.assistantChoice} key={item.id} data-installed={Boolean(installed)}>
      <div className={styles.assistantChoiceHead}><strong>{displayName(item)}</strong>
        {installed ? <span className={styles.assistantStatus}>{included ? '已内置' : '已安装'}</span> : included ? <span>待就绪</span> : null}</div>
      <p>{item.description}</p>
      {included && !installed ? <p>{included.reason || '内置助手尚未就绪，请刷新状态。'}</p> : null}
      <button type="button" className={installed ? styles.assistantSecondary : styles.assistantPrimary} disabled={busy}
        onClick={() => installed ? use(installed) : included ? void store.load() : void store.choose(item.id)}>
        {installed ? '怎么开始使用' : included ? '刷新状态' : item.id === 'designer' ? '安装定制助手' : `安装${item.name}`}
      </button>
    </article>
  }
  const entry = (item: any) => <div className={styles.assistantEntry} key={`${item.id}:${item.version}`}>
    <div className={styles.assistantEntryHead}><strong>{displayName(item)}</strong><span>{stateLabel(item)}</span></div>
    {item.replacement ? <div><p>已提供内置「{item.replacement.name}」，无需再装同款独立包。</p>
      <p>{item.replacement.warning}</p>
      {item.replacement.canRemoveAfterReview ? <p>核对旧会话后，可在 DSH 插件列表卸载：<code>{item.replacement.bundleName}</code></p> : null}</div> : null}
    {available(item) ? <button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => use(item)}>怎么开始使用</button>
      : item.state === 'draft' ? <button type="button" className={styles.assistantPrimary} disabled={busy} onClick={() => void store.preview(item.id, item.version)}>查看并安装</button>
        : <><button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => void store.verify(item.id, item.version)}>刷新状态</button>
          {item.nativeState === 'uninstalled' && !item.replacement ? <button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => void store.reinstall(item.id, item.version)}>查看并重新安装</button> : null}</>}
    {!available(item) && item.reason ? <details className={styles.assistantDetails}><summary>状态说明</summary><p>{item.reason}</p></details> : null}
  </div>
  return <section className={styles.assistantsCard} aria-label="工作助手" aria-busy={busy}>
    <div className={styles.assistantsHeading}><div><h3>工作助手</h3><p>{templates.some((item: any) => item.builtin) ? '助手已包含在插件里，新建会话时选择即可。' : '选一个助手，安装后用对话开始工作。'}</p></div>
      <button type="button" className={styles.assistantTextButton} disabled={busy} onClick={() => void store.load()}>{busy ? '读取中…' : '刷新'}</button></div>
    {!catalog && !error ? <p role="status">正在读取当前电脑的助手…</p> : null}
    {catalog && !catalog.native?.supported ? <p role="status">{catalog.native?.reason || '当前 DSH 暂不支持安装助手，请先检查版本。'}</p> : null}
    {catalog && (catalog.native?.supported || templates.some((item: any) => item.builtin)) ? <>
      <div className={styles.assistantChoices}>{templates.filter((item: any) => ['teacher', 'project'].includes(item.id)).map(template)}</div>
      {templates.some((item: any) => item.id === 'designer') ? <div className={styles.assistantCustomize}>
        <h4>需要其他职业的助手？</h4><p>用对话定制工作方式，不需要编程。</p>
        {templates.filter((item: any) => item.id === 'designer').map(template)}
      </div> : null}
    </> : null}
    {help ? <p className={styles.assistantHelp} role="status">{help}</p> : null}
    {preview ? <div className={styles.assistantPreview} aria-label="安装助手预览">
      <h4>安装「{preview.definition.name}」</h4><p>{preview.definition.description}</p>
      <p>新增一个可选的助手模式，不改默认模式、已有会话和资料。</p>
      <details className={styles.assistantDetails}><summary>查看工作方式与安装详情</summary>
        <p>{preview.definition.role}</p>
        <ul>{preview.definition.methods.map((method: string, index: number) => <li key={index}>{method}</li>)}</ul>
        <p>助手会逐步了解：</p>
        <ul>{preview.definition.onboarding.map((question: { key: string; label: string; prompt: string }) => <li key={question.key}>{question.label}：{question.prompt}</li>)}</ul>
        <small>第 {preview.version} 版 · 内容摘要 {preview.digest.slice(0, 12)} · 基础模式 {preview.native.basePreset}</small>
        <ul>{(preview.native.warnings || []).map((warning: string, index: number) => <li key={index}>{warning}</li>)}</ul>
      </details>
      <div className={styles.assistantButtons}><button type="button" className={styles.assistantPrimary} disabled={busy} onClick={() => void store.install()}>确认安装</button>
        <button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => store.dismissPreview()}>暂不安装</button></div>
    </div> : null}
    {pending.length ? <div><h4>待安装的助手</h4>{pending.map(entry)}</div> : null}
    {active.some((item: any) => !['teacher', 'project', 'designer'].includes(item.templateId)) ? <div><h4>我已安装的其他助手</h4>
      {active.filter((item: any) => !['teacher', 'project', 'designer'].includes(item.templateId)).map(entry)}</div> : null}
    {history.length || templates.some((item: any) => !['teacher', 'project', 'designer'].includes(item.id)) ? <details className={styles.assistantDetails}>
      <summary>更多助手与安装记录</summary>
      {catalog?.native?.supported ? <div className={styles.assistantChoices}>{templates.filter((item: any) => !['teacher', 'project', 'designer'].includes(item.id)).map(template)}</div> : null}
      {history.length ? <details className={styles.assistantDetails}><summary>以前安装的助手（{history.length}）</summary>
        <p>旧会话可能仍在使用旧模式；卸载前请核对，聊天与资料不会在这里删除。</p>{history.map(entry)}</details> : null}
    </details> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>
}
