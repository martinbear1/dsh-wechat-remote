import path from 'node:path'
import { dshProfileFacts } from '../dsh-host-context.js'
import { nodeStorageDirectory } from '../node-storage.js'
import { definitionDigest, type AssistantDefinition } from '../assistant-presets/definition.js'
import { resourceAssistant, resourceKey, resourcePresetId, type ResourcePreset } from './contract.js'
import { ResourceStorage } from './storage.js'

export interface ResourceAssistantDefinition {
  id: string; version: number; digest: string; definition: AssistantDefinition; presetId: string; source: 'resource'
}
export interface ResourceAssistantStatus extends ResourceAssistantDefinition {
  state: 'installed' | 'unknown'; nativeState: 'installed' | 'disabled' | 'unknown'; reason?: string
}
export interface ResourceAssistantProvider {
  definitions(signal: AbortSignal): Promise<ResourceAssistantDefinition[]>
  list(signal: AbortSignal, options?: { waitForReady?: boolean }): Promise<ResourceAssistantStatus[]>
}
export function resourceAssistantDefinition(resource: ResourcePreset): ResourceAssistantDefinition | undefined {
  const definition = resourceAssistant(resource)
  return definition ? { id: 'resource_' + resourceKey(resource), version: 1, digest: definitionDigest(definition),
    definition, presetId: resourcePresetId(resource), source: 'resource' } : undefined
}
/** No native registry, network, profile edit or registration. Historic work
 * records remain readable while the resource component itself is disabled. */
export async function readResourceAssistantDefinitions(host: { get(name: string): any }, signal: AbortSignal): Promise<ResourceAssistantDefinition[]> {
  signal.throwIfAborted()
  let profile: ReturnType<typeof dshProfileFacts>
  try { profile = dshProfileFacts(host) } catch { return [] }
  if (!profile) return []
  const storage = new ResourceStorage(path.join(nodeStorageDirectory(profile.home, profile.name), 'private-resources'))
  const saved = await storage.scan()
  signal.throwIfAborted()
  return saved.records.flatMap(({ resource }) => {
    const definition = resourceAssistantDefinition(resource)
    return definition ? [definition] : []
  })
}
