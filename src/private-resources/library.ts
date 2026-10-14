import { parseResourcePreset, ResourceError, resourceAssistant, resourceError, resourceIdValid, resourceKey, resourcePresetId, resourceVersionValid, validateResourceRelease, type ResourceRelease } from './contract.js'
import { resourceAssistantDefinition, type ResourceAssistantDefinition, type ResourceAssistantStatus } from './assistant-provider.js'
export type { ResourceAssistantDefinition, ResourceAssistantStatus, ResourceAssistantProvider } from './assistant-provider.js'
import { NativeResourceRegistry, type NativeResourceOptions, type ResourceHost } from './native.js'
import { ResourceStorage, type StoredResource } from './storage.js'

export interface ResourceLibraryEntry extends ResourceRelease {
  presetId: string; name: string; description: string; basePreset?: string; access?: 'public' | 'private'
  enabled: boolean; status: 'installed' | 'disabled' | 'unavailable'; message?: string
}
export interface ResourceLibraryOptions extends NativeResourceOptions {
  preinstalled?: () => readonly { content: Uint8Array; release: ResourceRelease }[]
    | Promise<readonly { content: Uint8Array; release: ResourceRelease }[]>
}
/** Offline local library. Delivery grants admit downloads outside this class;
 * installed data is retained. Explicit group capabilities separately follow
 * the current feature authority and never grant access merely by installation. */
export class PrivateResourceLibrary {
  private readonly storage: ResourceStorage
  private readonly native: NativeResourceRegistry
  private readonly entries = new Map<string, ResourceLibraryEntry>()
  private readonly records = new Map<string, StoredResource>()
  private readonly publicIds = new Set<string>()
  private prepared?: Promise<void>
  private groupSuspended = false
  private problems: string[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private started = false
  private closed = false
  private closing?: Promise<void>
  constructor(host: ResourceHost, directory: string, private readonly options: ResourceLibraryOptions = {}) {
    this.storage = new ResourceStorage(directory); this.native = new NativeResourceRegistry(host, options)
  }
  private queue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => { if (this.closed) throw resourceError('resource-library-closed', '资源组件已停止。'); return run() })
    this.tail = result.catch(() => {}); return result
  }
  /** Only bounded local files and bundled resource data are used here. Business history validation may
   * await this phase while HumanTools and the native Loader are still starting. */
  prepare(): Promise<void> {
    return this.prepared ??= (async () => {
      try {
        const stored = await this.storage.scan()
        if (stored.invalid) this.problems = ['部分本地资源无法读取；其他资源不受影响。']
        let bundled: readonly { content: Uint8Array; release: ResourceRelease }[] = []
        try {
          bundled = await this.options.preinstalled?.() ?? []
          for (const item of bundled) parseResourcePreset(item.content, item.release)
          for (const item of bundled) this.publicIds.add(item.release.resourceId)
        } catch { bundled = []; this.problems.push('预装资源暂不可用；其他资源不受影响。') }
        for (const record of stored.records) {
          if (this.closed) break
          this.records.set(resourceKey(record.resource), record)
          this.entries.set(resourceKey(record.resource), this.entry(record))
        }
        for (const item of bundled) {
          if (this.closed) break
          // A saved disabled release or a newer cloud release wins permanently.
          if ([...this.records.values()].some(record => record.resource.resourceId === item.release.resourceId)) continue
          try {
            const record = await this.storage.save(Buffer.from(item.content), item.release)
            if (this.closed) break
            this.records.set(resourceKey(record.resource), record)
            this.entries.set(resourceKey(record.resource), this.entry(record))
          } catch { this.problems.push('预装资源暂不可用；其他资源不受影响。') }
        }
      } catch { this.problems = ['本地资源目录暂不可读取；其他功能不受影响。'] }
    })()
  }
  start(): Promise<void> {
    return this.queue(async () => {
      if (this.started) return
      await this.prepare(); this.started = true
      for (const record of this.records.values()) { if (this.closed) break; await this.activate(record) }
    })
  }
  list(): ResourceLibraryEntry[] { return [...this.entries.values()].map(value => ({ ...value })) }
  issues(): string[] { return [...this.problems] }
  private entry(stored: StoredResource): ResourceLibraryEntry {
    const { resource, release } = stored
    return { ...release, presetId: resourcePresetId(resource), name: resource.name,
      description: resource.description, ...('basePreset' in resource ? { basePreset: resource.basePreset } : {}),
      ...(this.publicIds.has(resource.resourceId) ? { access: 'public' as const } : {}),
      enabled: stored.enabled, status: stored.enabled ? 'unavailable' : 'disabled' }
  }
  private async activate(stored: StoredResource): Promise<ResourceLibraryEntry> {
    const { resource } = stored, entry = this.entry(stored)
    this.records.set(resourceKey(resource), stored)
    try {
      if (stored.enabled && resourceAssistant(resource) && this.groupSuspended)
        throw resourceError('resource-group-unavailable', '请先开启本节点的微信群协作助手。')
      if (stored.enabled) { await this.native.register(resource); entry.status = 'installed' }
      else { await this.native.unregister(resource); entry.status = 'disabled' }
    }
    catch (error) { entry.message = error instanceof ResourceError ? error.message : '此预设暂不可用，请核对 DSH 版本并重试。' }
    this.entries.set(resourceKey(resource), entry)
    return { ...entry }
  }
  async definitions(signal: AbortSignal): Promise<ResourceAssistantDefinition[]> {
    signal.throwIfAborted(); await this.prepare(); signal.throwIfAborted()
    if (this.closed) return []
    return [...this.records.values()].flatMap(({ resource }) => {
      const definition = resourceAssistantDefinition(resource)
      return definition ? [definition] : []
    })
  }
  async assistantStatus(signal: AbortSignal, options: { waitForReady?: boolean } = {}): Promise<ResourceAssistantStatus[]> {
    const definitions = await this.definitions(signal), result: ResourceAssistantStatus[] = []
    for (const definition of definitions) {
      signal.throwIfAborted()
      const record = this.records.get(definition.id.slice('resource_'.length))!
      if (!record.enabled) { result.push({ ...definition, state: 'unknown', nativeState: 'disabled', reason: '此资源已停用。' }); continue }
      const ready = options.waitForReady !== false && !this.groupSuspended && await this.native.groupReady(record.resource, signal)
      result.push({ ...definition, state: ready ? 'installed' : 'unknown', nativeState: ready ? 'installed' : 'unknown',
        ...(ready ? {} : { reason: '群协作能力尚未就绪，请核对本节点的群助手状态。' }) })
    }
    return result
  }
  /** Called by the optional feature-service lifetime, not by catalog queries.
   * It cannot change saved user choices or reactivate a disabled resource. */
  setGroupAvailable(available: boolean): Promise<void> {
    this.groupSuspended = !available
    const suspended = available ? Promise.resolve() : this.native.suspendGroups()
    return this.queue(async () => {
      await suspended
      if (!this.started) return
      for (const record of this.records.values()) if (resourceAssistant(record.resource)) {
        if (this.closed) break
        await this.activate(record)
      }
    })
  }
  install(bytes: Uint8Array, expected: ResourceRelease): Promise<ResourceLibraryEntry> {
    // Copy before the asynchronous queue so a caller cannot change verified bytes.
    const content = Buffer.from(bytes), release = validateResourceRelease(expected)
    parseResourcePreset(content, release)
    return this.queue(async () => {
      await this.prepare()
      const stored = await this.storage.save(content, release)
      return this.activate(stored)
    })
  }
  setEnabled(resourceId: string, version: string, enabled: boolean): Promise<ResourceLibraryEntry> {
    if (!resourceIdValid(resourceId) || !resourceVersionValid(version) || typeof enabled !== 'boolean')
      throw resourceError('resource-state-invalid', '资源启用设置无效。')
    return this.queue(async () => { await this.prepare(); return this.activate(await this.storage.setEnabled({ resourceId, version }, enabled)) })
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    // Cancel native diagnostics before joining work that may await the Loader.
    const closing = this.native.close()
    return this.closing = Promise.all([this.tail, this.prepared, closing]).then(() => {})
  }
}
