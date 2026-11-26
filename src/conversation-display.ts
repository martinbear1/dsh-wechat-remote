/** Node-scoped rendering choices over the native ui-chat settings owner.
 * Only presentation metadata rides this service; conversation events are never filtered.
 */
import type { Context } from '@deepseek-ai/cordis'
import { symbols } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { formSection, plain } from './plugin-manager/schema.js'

export const DISPLAY_CAPABILITY = 'conversation.display'
const NAMESPACE = 'ui-chat'
const CHOICES = {
  transcriptView: ['compact', 'standard', 'detailed', 'verbose'],
  collapseTiming: ['completion', 'next-input'],
  foldedReplies: ['all', 'final'],
} as const
type Field = keyof typeof CHOICES
type Data = Record<string, any>
interface NativeSettings {
  writable?: boolean
  describe(options: { redactSecrets: true }): unknown | Promise<unknown>
  mutate(ns: string, ops: { op: 'set'; path: string[]; value: string }[], expectedRevision: number): unknown | Promise<unknown>
}
export interface DisplayHost { get(name: string): unknown }
export interface DisplaySnapshot {
  schema: 'conversation.display.v1'
  scope: 'node'
  provider: 'dsh-native'
  supported: boolean
  writable: boolean
  revision?: number
  generation?: string
  values: Partial<Record<Field, string>>
  options: Partial<Record<Field, string[]>>
  reason?: string
}
export interface DisplayRequest { action: string; inputJson?: string }
export type DisplayResult = { ok: true; valueJson: string } | { ok: false; error: { code: string; message: string } }
class DisplayError extends Error { constructor(readonly code: string, message: string) { super(message) } }
const fail = (code: string, message: string): never => { throw new DisplayError(code, message) }
const nativeIdentity = (value: NativeSettings | undefined) => value && (Reflect.get(value, symbols.original) ?? value)
const empty = (reason: string): DisplaySnapshot => ({ schema: 'conversation.display.v1', scope: 'node', provider: 'dsh-native', supported: false, writable: false, values: {}, options: {}, reason })

/** Direct Host service adapter: no profile file writes, process globals, or alternate transport. */
export class NativeConversationDisplay {
  private writes: Promise<unknown> = Promise.resolve()
  private readonly ownerGenerations = new WeakMap<object, string>()
  constructor(private readonly host: DisplayHost) {}
  private settings(): NativeSettings | undefined {
    const value = this.host.get('settings')
    return plain(value) && typeof value.describe === 'function' && typeof value.mutate === 'function'
      ? value as NativeSettings : undefined
  }
  /** Capability lookup does not enumerate settings or read a Session. */
  available(): boolean { return !!this.settings() }
  private generation(owner: NativeSettings): string {
    const identity = nativeIdentity(owner) as object
    let generation = this.ownerGenerations.get(identity)
    if (!generation) { generation = randomUUID(); this.ownerGenerations.set(identity, generation) }
    return generation
  }
  private async snapshot(signal: AbortSignal): Promise<{ value: DisplaySnapshot; owner?: NativeSettings }> {
    signal.throwIfAborted()
    const owner = this.settings()
    if (!owner) return { value: empty('当前节点没有可同步的原生显示设置。') }
    const forms = await owner.describe({ redactSecrets: true })
    signal.throwIfAborted()
    if (nativeIdentity(owner) !== nativeIdentity(this.settings())) fail('native_unavailable', '电脑设置正在重载，请刷新。')
    if (!Array.isArray(forms) || forms.length > 4096) throw new DisplayError('native_unavailable', '无法读取电脑显示设置，请刷新。')
    const entries = forms.filter(row => plain(row) && row.ns === NAMESPACE)
    if (entries.length !== 1) return { value: empty('当前节点未提供可同步的会话显示设置。'), owner }
    const view = entries[0]
    if (!plain(view.schema) || !plain(view.value) || view.applies !== 'live' || !Number.isSafeInteger(view.revision) || view.revision < 0)
      fail('native_unavailable', '电脑显示设置格式暂不兼容。')
    const section = formSection(view, '会话显示', owner.writable !== false)
    const value: DisplaySnapshot = { schema: 'conversation.display.v1', scope: 'node', provider: 'dsh-native', supported: false, writable: false,
      revision: view.revision, generation: this.generation(owner), values: {}, options: {} }
    // Native clients use different defaults only until a choice has been saved.
    // A Desktop node follows its Desktop default; ordinary Web nodes use detailed.
    const profile = this.host.get('profileContext') as { name?: unknown } | undefined
    const defaults: Record<Field, string> = { transcriptView: profile?.name === 'desktop' ? 'standard' : 'detailed', collapseTiming: 'completion', foldedReplies: 'all' }
    for (const field of Object.keys(CHOICES) as Field[]) {
      const item = section.fields.find(row => row.path.length === 1 && row.path[0] === field && row.type === 'enum' && !row.secret)
      if (!item) continue
      const options = CHOICES[field].filter(choice => item.options?.some(option => option.value === choice))
      if (!options.length) continue
      let saved = item.value
      if (field === 'transcriptView' && (saved === 'normal' || saved === 'expanded')) saved = 'detailed'
      if (saved == null) saved = defaults[field]
      // Future values must not be misrepresented as a saved choice we understand.
      if (typeof saved !== 'string' || !(options as readonly string[]).includes(saved)) continue
      value.values[field] = saved
      if (!item.readOnly && section.writable) value.options[field] = [...options]
      value.supported = true
    }
    value.writable = Object.keys(value.options).length > 0
    if (!value.supported) value.reason = '当前节点未提供可同步的会话显示设置。'
    else if (!value.writable) value.reason = '电脑设置当前为只读。'
    return { value, owner }
  }
  async read(signal: AbortSignal): Promise<DisplaySnapshot> { return (await this.snapshot(signal)).value }
  patch(input: unknown, signal: AbortSignal): Promise<DisplaySnapshot> {
    // Capture the caller's data before queueing, so it cannot change while an earlier write settles.
    if (!plain(input) || Object.keys(input).some(key => !['expectedRevision', 'expectedGeneration', 'changes'].includes(key))
      || typeof input.expectedGeneration !== 'string' || input.expectedGeneration.length < 1 || input.expectedGeneration.length > 128
      || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !plain(input.changes)
      || Object.keys(input.changes).length < 1 || Object.keys(input.changes).length > 3
      || Object.entries(input.changes).some(([key, value]) => !Object.hasOwn(CHOICES, key)
        || typeof value !== 'string' || !(CHOICES[key as Field] as readonly string[]).includes(value)))
      return Promise.reject(new DisplayError('invalid_request', '请选择有效的会话显示设置。'))
    const revision = input.expectedRevision as number, generation = input.expectedGeneration as string, changes = { ...input.changes } as Record<Field, string>
    const task = this.writes.catch(() => undefined).then(async () => {
      const { value, owner } = await this.snapshot(signal)
      if (!owner || !value.supported || !value.writable) fail('native_unavailable', value.reason || '当前节点不能修改显示设置。')
      if (value.revision !== revision || value.generation !== generation) fail('settings_conflict', '显示设置已在其他端修改，请刷新后再选择。')
      const ops = Object.entries(changes).map(([key, choice]) => {
        if (!value.options[key as Field]?.includes(choice)) fail('invalid_request', '该显示选项在当前节点不可用。')
        return { op: 'set' as const, path: [key], value: choice }
      })
      signal.throwIfAborted()
      if (nativeIdentity(owner) !== nativeIdentity(this.settings())) fail('native_unavailable', '电脑设置正在重载，请刷新。')
      await owner!.mutate(NAMESPACE, ops, revision)
      // Native settings/document-updated is already forwarded to both authenticated clients.
      // Read back accepted state; never claim success based only on the requested values.
      return this.read(signal)
    })
    this.writes = task.then(() => undefined, () => undefined)
    return task
  }
}

declare module '@deepseek-ai/cordis' { interface Context { wechatDisplay: WechatDisplayService } }
/** Additive owner-authenticated Remote with a bounded JSON envelope for cross-agent clients. */
export class WechatDisplayService extends TypertRemoteService {
  private readonly adapter: NativeConversationDisplay
  private readonly lifetime = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'wechatDisplay')
    this.adapter = new NativeConversationDisplay(ctx)
    ctx.effect(() => () => { this.lifetime.abort() })
  }
  available(): boolean { return this.adapter.available() }
  @Remote('control')
  async control(request: DisplayRequest, signal: AbortSignal): Promise<DisplayResult> {
    try {
      const active = AbortSignal.any([signal, this.lifetime.signal]); active.throwIfAborted()
      if (!request || !['read', 'patch'].includes(request.action) || request.inputJson !== undefined
        && (typeof request.inputJson !== 'string' || Buffer.byteLength(request.inputJson) > 4096)) fail('invalid_request', '显示设置请求格式无效。')
      let input: unknown = {}
      try { input = JSON.parse(request.inputJson || '{}') } catch { fail('invalid_request', '显示设置请求格式无效。') }
      if (request.action === 'read' && (!plain(input) || Object.keys(input).length)) fail('invalid_request', '读取设置不接受额外字段。')
      const value = request.action === 'read' ? await this.adapter.read(active) : await this.adapter.patch(input, active)
      return { ok: true, valueJson: JSON.stringify(value) }
    } catch (error) {
      const conflict = (error as { code?: unknown })?.code === 'SETTINGS_CONFLICT'
      return { ok: false, error: error instanceof DisplayError ? { code: error.code, message: error.message }
        : conflict ? { code: 'settings_conflict', message: '显示设置已在其他端修改，请刷新后再选择。' }
        : { code: 'native_operation_failed', message: '未能确认显示设置，请刷新核对电脑端当前值。' } }
    }
  }
}
