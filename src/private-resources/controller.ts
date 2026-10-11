import { PrivateResourceLibrary } from './library.js'
import { parseResourcePreset, ResourceError, resourceIdValid, resourceVersionValid } from './contract.js'
import { ResourceDeliveryClient, type DeliveryCatalog } from './source.js'
import type { ResourceItem, ResourceRequest, ResourceState } from './protocol.js'

const key = (item: { resourceId: string; version: string }) => `${item.resourceId}@${item.version}`
export class ResourceController {
  private catalog?: DeliveryCatalog
  private busy = false
  constructor(private readonly library: PrivateResourceLibrary, private readonly delivery: ResourceDeliveryClient) {}
  snapshot(): ResourceState {
    const items = new Map<string, ResourceItem>()
    for (const item of this.catalog?.items ?? []) items.set(key(item), { resourceId: item.resourceId,
      version: item.version, name: item.name, description: item.description, state: 'available' })
    for (const item of this.library.list()) items.set(key(item), { resourceId: item.resourceId,
      version: item.version, name: item.name, description: item.description, presetId: item.presetId,
      state: item.status === 'disabled' ? 'installed' : item.status, enabled: item.enabled, ...(item.message ? { message: item.message } : {}) })
    return { supported: true, items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
      ...(this.library.issues().length ? { notice: this.library.issues()[0] } : {}) }
  }
  async control(request: ResourceRequest, signal: AbortSignal): Promise<ResourceState> {
    if (!request || !['status', 'refresh', 'install', 'setEnabled'].includes(request.op))
      throw new ResourceError('resources-invalid', '资源操作无效。')
    signal.throwIfAborted()
    if (request.op === 'status') return this.snapshot()
    if (this.busy) throw new ResourceError('resources-busy', '资源操作尚未完成，请稍后再试。')
    this.busy = true
    try {
      if (request.op === 'refresh') {
        this.catalog = await this.delivery.catalog(signal)
      } else {
        if (!resourceIdValid(request.resourceId) || !resourceVersionValid(request.version))
          throw new ResourceError('resources-invalid', '资源版本无效。')
        if (request.op === 'setEnabled') {
          if (typeof request.enabled !== 'boolean') throw new ResourceError('resources-invalid', '资源操作无效。')
          await this.library.setEnabled(request.resourceId, request.version, request.enabled)
        } else {
          // Re-authorize this exact version on install; cached cards grant nothing.
          const catalog = await this.delivery.catalog(signal)
          this.catalog = catalog
          const release = catalog.items.find(item => key(item) === key(request))
          if (!release) throw new ResourceError('resources-forbidden', '此版本暂不可领取，请刷新资源。')
          const bytes = await this.delivery.download(release, catalog.accountInstance, signal)
          const preset = parseResourcePreset(bytes, release)
          if (preset.name !== release.name || preset.description !== release.description)
            throw new ResourceError('resources-invalid', '资源说明与下载内容不一致。')
          signal.throwIfAborted()
          await this.library.install(bytes, release)
        }
      }
      return this.snapshot()
    } catch (error) {
      // Clear remote cards on confirmed revocation in every network operation,
      // including installation. Local files remain an independent offline fact.
      if (error instanceof ResourceError && ['resources-forbidden', 'resources-closed'].includes(error.code)) this.catalog = undefined
      throw error
    } finally { this.busy = false }
  }
}
