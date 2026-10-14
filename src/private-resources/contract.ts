import { createHash } from 'node:crypto'
import { assistantDefinition, type AssistantDefinition } from '../assistant-presets/definition.js'

export const RESOURCE_MAX_BYTES = 2 * 1024 * 1024
export const RESOURCE_PROMPT_MAX_BYTES = 1024 * 1024
interface ResourcePresetData {
  kind: 'preset'
  resourceId: string
  version: string
  name: string
  description: string
  systemPrompt: string
}
/** Capabilities are data, not module specifiers. Only shipped code can map a
 * known capability into a native composition. Historical v1 means ordinary. */
export type ResourcePreset = ResourcePresetData & (({ basePreset: string } & ({ schemaVersion: 1 } | {
  schemaVersion: 2; capabilities: []
} | { schemaVersion: 2; capabilities: ['wechat-group']; assistant: AssistantDefinition })) | {
  schemaVersion: 3; runtime: 'chat'; compactionPrompt: string
})
export function resourceAssistant(resource: ResourcePreset): AssistantDefinition | undefined {
  return resource.schemaVersion === 2 && resource.capabilities[0] === 'wechat-group' && 'assistant' in resource
    ? structuredClone(resource.assistant) : undefined
}
export interface ResourceRelease { resourceId: string; version: string; sha256: string; bytes: number }
export class ResourceError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ResourceError' }
}
export const resourceError = (code: string, message: string) => new ResourceError(code, message)
export const resourceSha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
export const resourceIdValid = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
export function resourceVersionValid(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128) return false
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value)
  return !!match && (!match[4] || match[4].split('.').every(part => !/^\d+$/.test(part) || part === '0' || part[0] !== '0'))
}
const plain = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
export const resourcePromptValid = (value: unknown): value is string => typeof value === 'string'
  && !!value.trim() && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value)
  && Buffer.byteLength(value) <= RESOURCE_PROMPT_MAX_BYTES
export function validateResourceRelease(value: ResourceRelease): ResourceRelease {
  if (!value || !resourceIdValid(value.resourceId) || !resourceVersionValid(value.version)
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
    || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > RESOURCE_MAX_BYTES)
    throw resourceError('resource-release-invalid', '资源版本信息无效。')
  return { resourceId: value.resourceId, version: value.version, sha256: value.sha256, bytes: value.bytes }
}
/** Strict data schema. No module names, executable expressions or tool scripts
 * can enter the native composition through this transport. Prompt text is data. */
export function parseResourcePreset(bytes: Uint8Array, expected?: ResourceRelease): ResourcePreset {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > RESOURCE_MAX_BYTES)
    throw resourceError('resource-size-invalid', '预设文件大小无效。')
  if (expected) {
    validateResourceRelease(expected)
    if (bytes.byteLength !== expected.bytes || resourceSha256(bytes) !== expected.sha256)
      throw resourceError('resource-integrity', '下载内容与资源版本不一致，请重新下载。')
  }
  let value: any
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw resourceError('resource-json-invalid', '资源不是有效的 UTF-8 JSON 预设。') }
  const keys = ['schemaVersion', 'kind', 'resourceId', 'version', 'name', 'description', 'systemPrompt']
  if (value?.schemaVersion === 3) keys.push('runtime', 'compactionPrompt')
  else keys.push('basePreset')
  if (value?.schemaVersion === 2) {
    keys.push('capabilities')
    if (!Array.isArray(value.capabilities) || value.capabilities.length > 1
      || value.capabilities.length === 1 && value.capabilities[0] !== 'wechat-group')
      throw resourceError('resource-preset-invalid', '资源能力声明无效。')
    if (value.capabilities.length) {
      keys.push('assistant')
      try {
        const definition = assistantDefinition(value.assistant)
        if (definition.name !== value.name || definition.description !== value.description || definition.basePreset !== value.basePreset)
          throw new Error('resource assistant identity mismatch')
      } catch { throw resourceError('resource-preset-invalid', '群资源的助手规格无效。') }
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key)) || ![1, 2, 3].includes(value.schemaVersion) || value.kind !== 'preset'
    || !resourceIdValid(value.resourceId) || !resourceVersionValid(value.version)
    || !plain(value.name, 120) || !value.name.trim() || !plain(value.description, 2000)
    || (value.schemaVersion === 3 ? value.runtime !== 'chat' || !resourcePromptValid(value.compactionPrompt)
      : !plain(value.basePreset, 256) || !value.basePreset.trim() || /[\r\n\t]/.test(value.basePreset))
    || !resourcePromptValid(value.systemPrompt)
    || expected && (value.resourceId !== expected.resourceId || value.version !== expected.version))
    throw resourceError('resource-preset-invalid', '资源内容不符合预设格式。')
  return value as ResourcePreset
}
export const resourceKey = (value: Pick<ResourcePreset, 'resourceId' | 'version'>) => resourceSha256(`${value.resourceId}\0${value.version}`)
export const resourcePresetId = (value: Pick<ResourcePreset, 'resourceId' | 'version'>) => `hr-resource-${value.resourceId}-${resourceSha256(value.version).slice(0, 12)}`
