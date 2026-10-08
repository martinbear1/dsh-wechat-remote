import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { FeatureCall, FeatureView } from './feature-client.js'
import { featureLeaseAllows } from './feature-client.js'
import type { AssistantStore } from './assistant-store.js'
import styles from './HarnessRemoteSettings.module.css'

const available = (item: any) => item.state === 'installed' && (item.nativeState === undefined || item.nativeState === 'installed')
const stateLabel = (item: any) => available(item) ? '已安装' : item.state === 'draft' ? '待安装'
  : item.nativeState === 'uninstalled' ? '未安装' : item.nativeState === 'disabled' ? '已停用'
    : item.state === 'pending-restart' ? '待重启' : '待核对'

/** Display aliases never rename an approved native preset or create a new ID. */
const displayName = (item: any) => item.templateId === 'designer' || item.id === 'designer' ? '定制我的助手' : item.name

function Help({ label, children }: { label: string; children: string }): JSX.Element {
  const tooltipId = useId()
  return <span className={styles.assistantHelpAnchor}><button type="button" className={styles.assistantHelpButton}
    aria-label={label} aria-describedby={tooltipId}>?</button><span id={tooltipId} className={styles.assistantTooltip} role="tooltip">{children}</span></span>
}

/** Native-mode shortcuts, not a second conversation or preset implementation. */
export function AssistantPresetsPanel({ store, featureCall }: { store: AssistantStore; featureCall?: FeatureCall }): JSX.Element {
  const { catalog, preview, busy, message, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const lifetime = useRef<AbortController>()
  const [feature, setFeature] = useState<FeatureView>()
  const [accessError, setAccessError] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const featureFlight = useRef(false)
  const featureEpoch = useRef(0)
  const refreshFeature = async (enabled?: boolean) => {
    if (!featureCall || featureFlight.current) return
    featureFlight.current = true
    const epoch = featureEpoch.current
    setAccessBusy(true)
    try {
      const next = await featureCall(enabled === undefined ? { action: 'status' } : { action: 'group.enabled', enabled })
      if (epoch !== featureEpoch.current) return
      setFeature(next); setAccessError('')
      if (enabled !== undefined) void store.load()
    } catch (cause) {
      if (epoch === featureEpoch.current) { setFeature(undefined); setAccessError(cause instanceof Error ? cause.message : '暂时无法核对资格。') }
    } finally { if (epoch === featureEpoch.current) { featureFlight.current = false; setAccessBusy(false) } }
  }
  useEffect(() => {
    featureEpoch.current++; featureFlight.current = false; setFeature(undefined)
    void refreshFeature()
    const timer = setInterval(() => void refreshFeature(), 15000)
    return () => { featureEpoch.current++; featureFlight.current = false; clearInterval(timer) }
  }, [featureCall])
  const access = feature?.features.group_assistant
  const allowed = featureLeaseAllows(feature, access)
  const unlocked = allowed && feature?.groupEnabled === true
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; void store.load(); return () => controller.abort() }, [store])
  const drafts = catalog?.drafts || []
  const active = drafts.filter((item: any) => available(item) && !item.replacement)
  const pending = drafts.filter((item: any) => item.state === 'draft')
  const history = drafts.filter((item: any) => item.source !== 'builtin' && item.state !== 'draft' && (!available(item) || item.replacement))
  const templates = catalog?.templates || []
  const installedFor = (id: string) => active.find((item: any) => item.templateId === id)
  const use = (item: any) => void store.start(item.presetId, lifetime.current?.signal)
  const instructions = (item: any) => item.id === 'designer' || item.templateId === 'designer'
    ? '先打开定制会话，说清职业和工作习惯；助手会设计可复用的模式。确认安装后，再用新模式开启工作会话。不会自动安装或发送消息。'
    : `先选工作区，再用「${item.name}」开始空白会话。手机连接此电脑后可继续该会话；发卡与提醒需在小程序设置中开启「微信群协作助手」。`
  const template = (item: any) => {
    const installed = installedFor(item.id)
    const included = item.builtin
    const current = drafts.find((entry: any) => entry.templateId === item.id && entry.source === 'builtin')
    return <article className={styles.assistantChoice} key={item.id} data-installed={Boolean(installed)}>
      <div className={styles.assistantChoiceCopy}><div className={styles.assistantChoiceHead}><strong>{displayName(item)}</strong>
        <Help label={`${displayName(item)}使用说明`}>{instructions(item)}</Help></div>
      <p>{item.id === 'designer' ? '用对话设计适合自己职业的助手模式' : item.description}</p></div>
      {!installed && included ? <span className={styles.assistantUnavailable} title={current?.reason || included.reason}>{current?.nativeState === 'disabled' ? '已停用' : '待就绪'}</span> : null}
      <button type="button" className={styles.secondaryButton} disabled={busy || Boolean(included && !installed)}
        onClick={() => installed ? use(installed) : included ? void store.load() : void store.choose(item.id)}>
        {installed ? item.id === 'designer' ? '开始定制' : '开始使用' : included ? '开始使用' : '安装'}
      </button>
    </article>
  }
  const entry = (item: any) => <div className={styles.assistantEntry} key={`${item.id}:${item.version}`}>
    <div className={styles.assistantEntryHead}><strong>{displayName(item)}</strong><span>{stateLabel(item)}</span></div>
    {item.replacement ? <div><p>已提供内置「{item.replacement.name}」，无需再装同款独立包。</p>
      <p>{item.replacement.warning}</p>
      {item.replacement.canRemoveAfterReview ? <p>核对旧会话后，可在 DSH 插件列表卸载：<code>{item.replacement.bundleName}</code></p> : null}</div> : null}
    {available(item) ? <button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => use(item)}>开始使用</button>
      : item.state === 'draft' ? <button type="button" className={styles.assistantPrimary} disabled={busy} onClick={() => void store.preview(item.id, item.version)}>查看并安装</button>
        : <><button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => void store.verify(item.id, item.version)}>刷新状态</button>
          {item.nativeState === 'uninstalled' && !item.replacement ? <button type="button" className={styles.assistantSecondary} disabled={busy} onClick={() => void store.reinstall(item.id, item.version)}>查看并重新安装</button> : null}</>}
    {!available(item) && item.reason ? <details className={styles.assistantDetails}><summary>状态说明</summary><p>{item.reason}</p></details> : null}
  </div>
  return <section className={styles.assistantsCard} aria-label="微信群协作助手" aria-busy={busy}>
    <div className={styles.assistantsHeading}><div className={styles.assistantChoiceHead}><h3>微信群协作助手</h3>
      <Help label="电脑助手与手机群协作">{'需要群协作资格、有效公网访问和剩余流量。开启本节点助手后，再在小程序设置中开启手机入口。暂停不删除资料，不取消 DSH 已开始的任务。'}</Help></div>
      <button type="button" className={styles.assistantTextButton} disabled={busy || accessBusy} onClick={() => { void refreshFeature(); void store.load() }}>{busy || accessBusy ? '读取中…' : '刷新'}</button></div>
    <div className={styles.clawbotReceiveRow}>
      <div><strong>启用本节点助手</strong><p className={styles.clawbotNote} role="status">{accessError || (!allowed ? access?.message || '请联网核对资格，在小程序设置中兑换体验码。' : feature?.groupEnabled ? '已开启' : '有使用资格，尚未开启')}</p></div>
      <label className={styles.clawbotToggle}>
        <input type="checkbox" role="switch" aria-label="启用本节点助手" checked={feature?.groupEnabled || false}
          disabled={accessBusy || !featureCall || !allowed && !feature?.groupEnabled} onChange={event => void refreshFeature(event.target.checked)} />
        <span className={styles.clawbotSwitchTrack} aria-hidden />
      </label>
    </div>
    <fieldset className={styles.assistantFeatureBody} disabled={!unlocked || accessBusy} aria-label="助手功能">
    {!catalog && !error ? <p role="status">正在读取当前电脑的助手…</p> : null}
    {catalog && !catalog.native?.supported ? <p role="status">{catalog.native?.reason || '当前 DSH 暂不支持安装助手，请先检查版本。'}</p> : null}
    {catalog && (catalog.native?.supported || templates.some((item: any) => item.builtin)) ? <>
      <div className={styles.assistantChoices}>{templates.filter((item: any) => ['teacher', 'project'].includes(item.id)).map(template)}</div>
      {templates.some((item: any) => item.id === 'designer') ? <div className={styles.assistantCustomize}>
        {templates.filter((item: any) => item.id === 'designer').map(template)}
      </div> : null}
    </> : null}
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
    </fieldset>
  </section>
}
