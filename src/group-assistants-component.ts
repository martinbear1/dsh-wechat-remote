import type { Context } from '@deepseek-ai/cordis'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { agentDshHome, agentProfileScope } from './agent-metadata.js'
import { nodeStorageDirectory } from './node-storage.js'
import { writePrivateJsonAtomic } from './secure-file.js'
import { hostFeatureAccess } from './feature-access.js'
import { BUILTIN_ASSISTANTS, type BuiltinTemplateId } from './assistant-presets/builtins.js'
import { BuiltinAssistantComponent, type BuiltinAssistantHost } from './assistant-presets/builtin-component.js'

export const name = 'wechat-group-assistants'
export const inject = ['agentPresets', 'loader', 'profileContext', 'wechatFeatures']
type Preferences = Record<BuiltinTemplateId, boolean>
const preferences = (enabled: boolean): Preferences => ({ teacher: enabled, project: enabled, designer: enabled })
const validTemplate = (value: unknown): value is BuiltinTemplateId => BUILTIN_ASSISTANTS.some(item => item.templateId === value)

/** Only three local booleans, never a native profile/Agent/default-preset edit.
 * Separate from node opt-in: entitlement loss, the top switch and component
 * hot unload must not silently reset individual choices. */
export class GroupAssistantPreferences {
  private enabled = preferences(true)
  private issue = ''
  constructor(private readonly file: string) {
    try {
      if (statSync(file).size > 4096) throw new Error('oversized assistant preferences')
      const value = JSON.parse(readFileSync(file, 'utf8'))
      if (value?.schemaVersion !== 1 || !value.enabled || BUILTIN_ASSISTANTS.some(item => typeof value.enabled[item.templateId] !== 'boolean'))
        throw new Error('invalid assistant preferences')
      this.enabled = Object.fromEntries(BUILTIN_ASSISTANTS.map(item => [item.templateId, value.enabled[item.templateId]])) as Preferences
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      this.enabled = preferences(false)
      this.issue = '助手启停偏好未能读取，请重新选择要启用的助手；已有会话和资料保留。'
    }
  }
  get(templateId: BuiltinTemplateId): boolean { return this.enabled[templateId] }
  get notice(): string { return this.issue }
  set(templateId: BuiltinTemplateId, enabled: boolean): void {
    if (!validTemplate(templateId) || typeof enabled !== 'boolean') throw new Error('助手启停参数无效。')
    if (this.enabled[templateId] === enabled && !this.issue) return
    const next = { ...this.enabled, [templateId]: enabled }
    // Commit before changing the observed state; failed writes never claim success.
    writePrivateJsonAtomic(this.file, { schemaVersion: 1, enabled: next })
    this.enabled = next; this.issue = ''
  }
}

declare module '@deepseek-ai/cordis' { interface Context { wechatGroupAssistants: GroupAssistantsController } }

/** One native component owns the three stable preset declarations. Their old
 * status services remain available to the existing catalog/phone contract. */
export class GroupAssistantsController {
  private readonly preferences: GroupAssistantPreferences
  private readonly components: BuiltinAssistantComponent[]
  private closed = false
  private closing?: Promise<void>
  get active(): boolean { return !this.closed }
  constructor(private readonly host: BuiltinAssistantHost, preferenceFile: string) {
    if (host.get('wechatGroupAssistants')?.active) throw new Error('群协作组件已运行。')
    this.preferences = new GroupAssistantPreferences(preferenceFile)
    this.components = []
    try {
      for (const item of BUILTIN_ASSISTANTS) this.components.push(new BuiltinAssistantComponent(host, item.templateId, {
        managed: true, enabled: () => this.preferences.get(item.templateId), reason: () => this.preferences.notice,
      }))
      host.provide('wechatGroupAssistants', this)
      host.effect(() => () => this.close(), 'Group assistant presets')
    } catch (error) {
      this.closed = true
      void Promise.allSettled(this.components.map(component => component.close()))
      throw error
    }
    // Publish presence before notifying the effective gate. Never await global
    // Loader readiness from native component activation itself.
    this.componentsChanged()
    void this.notify()
    // A physical component may have stayed off past the cached lease. Resume
    // the existing demand-driven gate once, without blocking native activation.
    void Promise.resolve().then(() => {
      if (!this.closed) return hostFeatureAccess(this.host).refresh()
    }).catch(() => {})
  }
  private componentsChanged(): void {
    try { hostFeatureAccess(this.host).componentsChanged() } catch { /* backend may already have stopped */ }
  }
  notify(): Promise<void> {
    if (this.closed) return this.closing || Promise.resolve()
    return Promise.all(this.components.map(component => component.notify())).then(() => {})
  }
  async setEnabled(templateId: BuiltinTemplateId, enabled: boolean, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (this.closed) throw new Error('群协作组件已停用。')
    if (!validTemplate(templateId) || typeof enabled !== 'boolean') throw new Error('助手启停参数无效。')
    // This is also enforced by the authenticated feature-control endpoint.
    // Turning one card on never turns on the node or bypasses its entitlement.
    if (enabled) hostFeatureAccess(this.host).assertCurrent('group_assistant')
    this.preferences.set(templateId, enabled)
    await this.notify()
    signal?.throwIfAborted()
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    this.componentsChanged()
    return this.closing = Promise.all(this.components.map(component => component.close())).then(() => {})
  }
}

export function apply(ctx: Context): void {
  new GroupAssistantsController(ctx as unknown as BuiltinAssistantHost,
    path.join(nodeStorageDirectory(agentDshHome(ctx), agentProfileScope(ctx)), 'group-assistant-preferences-v1.json'))
}
