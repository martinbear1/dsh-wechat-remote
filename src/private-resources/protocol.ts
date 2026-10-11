export interface ResourceItem {
  resourceId: string
  version: string
  name: string
  description: string
  presetId?: string
  enabled?: boolean
  state: 'available' | 'installing' | 'installed' | 'unavailable'
  message?: string
}
export interface ResourceState { supported: boolean; notice?: string; items: ResourceItem[] }
export type ResourceRequest = { op: 'status' } | { op: 'refresh' }
  | { op: 'install'; resourceId: string; version: string }
  | { op: 'setEnabled'; resourceId: string; version: string; enabled: boolean }
export type ResourceResult = { ok: true; value: ResourceState } | { ok: false; error: { code: string; message: string } }
