import { parseResourcePreset, ResourceError, resourceError, resourceIdValid, resourceKey, resourcePresetId, resourceVersionValid, validateResourceRelease, type ResourceRelease } from './contract.js'
import { NativeResourceRegistry, type NativeResourceOptions, type ResourceHost } from './native.js'
import { ResourceStorage, type StoredResource } from './storage.js'

export interface ResourceLibraryEntry extends ResourceRelease {
  presetId: string; name: string; description: string; basePreset: string
  enabled: boolean; status: 'installed' | 'disabled' | 'unavailable'; message?: string
}
/** Offline local library. Account entitlements admit downloads outside this
 * class; they never revoke an already installed preset or stop an Agent. */
export class PrivateResourceLibrary {
  private readonly storage: ResourceStorage
  private readonly native: NativeResourceRegistry
  private readonly entries = new Map<string, ResourceLibraryEntry>()
  private problems: string[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private started = false
  private closed = false
  private closing?: Promise<void>
  constructor(host: ResourceHost, directory: string, options: NativeResourceOptions = {}) {
    this.storage = new ResourceStorage(directory); this.native = new NativeResourceRegistry(host, options)
  }
  private queue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => { if (this.closed) throw resourceError('resource-library-closed', '资源组件已停止。'); return run() })
    this.tail = result.catch(() => {}); return result
  }
  start(): Promise<void> {
    return this.queue(async () => {
      if (this.started) return
      this.started = true
      try {
        const stored = await this.storage.scan()
        if (stored.invalid) this.problems = ['部分本地资源无法读取；其他资源不受影响。']
        for (const record of stored.records) { if (this.closed) break; await this.activate(record) }
      } catch { this.problems = ['本地资源目录暂不可读取；其他功能不受影响。'] }
    })
  }
  list(): ResourceLibraryEntry[] { return [...this.entries.values()].map(value => ({ ...value })) }
  issues(): string[] { return [...this.problems] }
  private async activate(stored: StoredResource): Promise<ResourceLibraryEntry> {
    const { resource, release } = stored
    const entry: ResourceLibraryEntry = { ...release, presetId: resourcePresetId(resource), name: resource.name,
      description: resource.description, basePreset: resource.basePreset, enabled: stored.enabled, status: 'unavailable' }
    try {
      if (stored.enabled) { await this.native.register(resource); entry.status = 'installed' }
      else { await this.native.unregister(resource); entry.status = 'disabled' }
    }
    catch (error) { entry.message = error instanceof ResourceError ? error.message : '此预设暂不可用，请核对 DSH 版本与基础模式。' }
    this.entries.set(resourceKey(resource), entry)
    return { ...entry }
  }
  install(bytes: Uint8Array, expected: ResourceRelease): Promise<ResourceLibraryEntry> {
    // Copy before the asynchronous queue so a caller cannot change verified bytes.
    const content = Buffer.from(bytes), release = validateResourceRelease(expected)
    parseResourcePreset(content, release)
    return this.queue(async () => {
      const stored = await this.storage.save(content, release)
      return this.activate(stored)
    })
  }
  setEnabled(resourceId: string, version: string, enabled: boolean): Promise<ResourceLibraryEntry> {
    if (!resourceIdValid(resourceId) || !resourceVersionValid(version) || typeof enabled !== 'boolean')
      throw resourceError('resource-state-invalid', '资源启用设置无效。')
    return this.queue(async () => this.activate(await this.storage.setEnabled({ resourceId, version }, enabled)))
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    // Cancel native diagnostics before joining work that may await the Loader.
    const closing = this.native.close()
    return this.closing = Promise.all([this.tail, closing]).then(() => {})
  }
}
