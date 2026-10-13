/** Page-local resource controls. No entitlement polling, automatic install or session mutation. */
export interface MyResourceItem {
  resourceId: string
  version: string
  name: string
  description: string
  presetId?: string
  installedVersion?: string
  enabled?: boolean
  state: 'available' | 'installing' | 'installed' | 'unavailable'
  /** Backend-owned display copy, never raw installer exceptions. */
  message?: string
}
export interface MyResourcesState { supported: boolean; notice?: string; items: MyResourceItem[] }
export type MyResourcesRequest = { op: 'status' | 'refresh' }
  | { op: 'install'; resourceId: string; version: string }
  | { op: 'setEnabled'; resourceId: string; version: string; enabled: boolean }
export type MyResourcesResult = { ok: true; value: MyResourcesState } | { ok: false; error: { code: string; message: string } }
export type MyResourcesCall = (request: MyResourcesRequest) => Promise<MyResourcesResult>
export interface MyResourcesView {
  data: MyResourcesState | null
  busy: boolean
  installing: string | null
  toggling: string | null
  error: string
  itemErrors: Record<string, string>
  /** UI evidence only: an empty local status is not an empty cloud catalog. */
  catalogRead: boolean
}
export const resourceKey = (resourceId: string, version: string): string => `${resourceId}@${version}`
export const localActivationUnavailable = (item: MyResourceItem): boolean => item.state === 'unavailable'
  && Boolean(item.presetId) && typeof item.enabled === 'boolean'
/** SemVer precedence only; null means the server supplied an unknown version shape. */
export function compareResourceVersions(left: string, right: string): number | null {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  const a = pattern.exec(left), b = pattern.exec(right)
  if (!a || !b || [a, b].some(match => match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0'))) return null
  const numeric = (x: string, y: string) => x.length - y.length || (x === y ? 0 : x > y ? 1 : -1)
  for (let index = 1; index <= 3; index++) { const order = numeric(a[index], b[index]); if (order) return order }
  if (!a[4] || !b[4]) return !a[4] && !b[4] ? 0 : !a[4] ? 1 : -1
  const ap = a[4].split('.'), bp = b[4].split('.')
  for (let index = 0; index < Math.max(ap.length, bp.length); index++) {
    const x = ap[index], y = bp[index]
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1
    if (x === y) continue
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    return nx && ny ? numeric(x, y) : nx !== ny ? nx ? -1 : 1 : x > y ? 1 : -1
  }
  return 0
}
const newerVersion = (left: string, right: string): boolean => (compareResourceVersions(left, right) ?? 0) > 0
export const isResourceUpdate = (item: MyResourceItem, items: MyResourceItem[]): boolean => item.state === 'available'
  && items.some(local => local.resourceId === item.resourceId && local.state === 'installed' && newerVersion(item.version, local.version))
export const isLocalResource = (item: MyResourceItem): boolean => item.state === 'installed' || Boolean(item.presetId) || typeof item.enabled === 'boolean'
export interface MyResourceGroup {
  resourceId: string
  local: MyResourceItem[]
  delivery: MyResourceItem[]
  /** Latest known local version, not the version of every existing session. */
  primary: MyResourceItem
  update?: MyResourceItem
}
/** Presentation grouping only. Never changes activation, downloaded files, preset IDs or sessions. */
export function groupResources(items: readonly MyResourceItem[]): { local: MyResourceGroup[]; delivery: MyResourceGroup[] } {
  const families = new Map<string, MyResourceItem[]>()
  for (const item of items) { const family = families.get(item.resourceId) ?? []; family.push(item); families.set(item.resourceId, family) }
  const local: MyResourceGroup[] = [], delivery: MyResourceGroup[] = []
  const newestFirst = (a: MyResourceItem, b: MyResourceItem) => {
    const aKnown = compareResourceVersions(a.version, a.version) !== null, bKnown = compareResourceVersions(b.version, b.version) !== null
    return aKnown !== bKnown ? aKnown ? -1 : 1 : compareResourceVersions(b.version, a.version) ?? a.version.localeCompare(b.version)
  }
  for (const [resourceId, family] of families) {
    const installed = family.filter(isLocalResource).sort(newestFirst), available = family.filter(item => !isLocalResource(item)).sort(newestFirst)
    const primary = installed[0] ?? available[0]
    const update = installed.length ? available.find(item => item.state === 'available' && newerVersion(item.version, installed[0].version)) : undefined
    const group: MyResourceGroup = { resourceId, local: installed, delivery: available, primary, ...(update ? { update } : {}) }
    if (installed.length) local.push(group)
    else delivery.push(group)
  }
  const byName = (a: MyResourceGroup, b: MyResourceGroup) => a.primary.name.localeCompare(b.primary.name) || a.resourceId.localeCompare(b.resourceId)
  return { local: local.sort(byName), delivery: delivery.sort(byName) }
}
export const initialResourcesView = (): MyResourcesView => ({ data: null, busy: false, installing: null, toggling: null, error: '', itemErrors: {}, catalogRead: false })
const errors: Record<string, string> = {
  'resources-unavailable': '资源服务暂未就绪，请稍后刷新。',
  'resources-unbound': '请先在小程序中绑定当前节点。',
  'resources-forbidden': '当前账号无法领取此资源，请核对绑定账号。',
  'resources-network': '暂时无法连接资源服务，已安装资源不受影响。',
  'resources-invalid': '资源信息暂不可用，请刷新后重试。',
  'resources-install-failed': '安装未完成，请重试。',
  'resources-conflict': '本地已有不同版本，请刷新后核对。',
  'resources-busy': '资源正在安装，请稍后刷新查看。',
  'resources-closed': '当前节点已变化，请重新打开我的资源。',
}
function message(cause: unknown, op: MyResourcesRequest['op']): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  return Object.hasOwn(errors, code) ? errors[code] : op === 'install' ? '暂时无法确认安装结果，请刷新后查看。'
    : op === 'setEnabled' ? '暂时无法确认启停结果，请刷新后查看。' : '暂时无法读取资源，请稍后刷新。'
}
function validState(value: MyResourcesState): boolean {
  return Boolean(value && typeof value.supported === 'boolean' && Array.isArray(value.items)
    && (value.notice === undefined || typeof value.notice === 'string')
    && value.items.every(item => item && ['resourceId', 'version', 'name', 'description'].every(key => typeof item[key as keyof MyResourceItem] === 'string')
      && item.resourceId && item.version && ['available', 'installing', 'installed', 'unavailable'].includes(item.state)
      && (item.enabled === undefined || typeof item.enabled === 'boolean')
      && ['presetId', 'installedVersion', 'message'].every(key => item[key as keyof MyResourceItem] === undefined || typeof item[key as keyof MyResourceItem] === 'string'))
    && new Set(value.items.map(item => resourceKey(item.resourceId, item.version))).size === value.items.length)
}

export class MyResourcesStore {
  private state = initialResourcesView()
  private listeners = new Set<() => void>()
  private disposed = false
  private flight?: Promise<void>
  constructor(private readonly call: MyResourcesCall) {}
  getSnapshot = (): MyResourcesView => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(patch: Partial<MyResourcesView>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  /** A changed node uses a new store; old receipts never enter its resource list. */
  dispose = () => { this.disposed = true; this.flight = undefined; this.listeners.clear() }
  private run(request: MyResourcesRequest): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.flight) return this.flight
    const targetKey = 'resourceId' in request ? resourceKey(request.resourceId, request.version) : null
    const installing = request.op === 'install' ? targetKey : null
    const toggling = request.op === 'setEnabled' ? targetKey : null
    const itemErrors = { ...this.state.itemErrors }
    if (targetKey) delete itemErrors[targetKey]
    // Defer invocation until flight is assigned, including synchronously reentrant subscribers.
    const operation = Promise.resolve().then(async () => {
      if (this.disposed) return
      try {
        const result = await this.call(request)
        if (this.disposed) return
        if (!result?.ok) throw result && 'error' in result ? result.error : undefined
        if (!validState(result.value)) throw { code: 'resources-invalid' }
        const nextErrors: Record<string, string> = {}
        if (request.op === 'install' || request.op === 'setEnabled') {
          const item = result.value.items.find(item => item.resourceId === request.resourceId && item.version === request.version)
          // A download acknowledgement or an unchanged available item is not proof of native installation.
          if (request.op === 'install' && (!item || item.state === 'available')) nextErrors[targetKey!] = '安装结果尚未确认，请刷新后查看。'
          if (request.op === 'setEnabled' && (!item || item.state !== 'installed' || item.enabled !== request.enabled)
            && !(item?.state === 'unavailable' && item.message)) nextErrors[targetKey!] = '启停结果尚未确认，请刷新后查看。'
        }
        this.set({ data: result.value, itemErrors: nextErrors,
          ...(request.op === 'refresh' || request.op === 'install' ? { catalogRead: true } : {}) })
      } catch (cause) {
        if (this.disposed) return
        const text = message(cause, request.op)
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
        // Refresh and install can both discover a revoked grant/changed identity.
        // Discard delivery cards, retaining every known local installation fact.
        const clearDelivery = (request.op === 'refresh' || request.op === 'install')
          && ['resources-unbound', 'resources-forbidden', 'resources-closed'].includes(code)
        const data = clearDelivery && this.state.data
          ? { ...this.state.data, items: this.state.data.items.filter(item => item.state === 'installed' || item.presetId || typeof item.enabled === 'boolean') }
          : this.state.data
        // Ordinary network failures leave the last local/native facts and catalog visible.
        this.set({ data, ...(clearDelivery ? { error: text, itemErrors: {}, catalogRead: false }
          : targetKey ? { itemErrors: { ...this.state.itemErrors, [targetKey]: text } } : { error: text }) })
      } finally {
        if (!this.disposed) { this.flight = undefined; this.set({ busy: false, installing: null, toggling: null }) }
      }
    })
    this.flight = operation
    this.set({ busy: true, installing, toggling, error: '', itemErrors })
    return operation
  }
  load = () => this.run({ op: 'status' })
  refresh = () => this.run({ op: 'refresh' })
  install = (resourceId: string, version: string): Promise<void> => {
    const item = this.state.data?.items.find(item => item.resourceId === resourceId && item.version === version)
    if (!this.state.data?.supported || !item || item.state === 'installed' || item.state === 'installing' || localActivationUnavailable(item)) return Promise.resolve()
    return this.run({ op: 'install', resourceId, version })
  }
  setEnabled = (resourceId: string, version: string, enabled: boolean): Promise<void> => {
    const item = this.state.data?.items.find(item => item.resourceId === resourceId && item.version === version)
    if (!this.state.data?.supported || !item || typeof item.enabled !== 'boolean'
      || (!localActivationUnavailable(item) && (item.state !== 'installed' || item.enabled === enabled))) return Promise.resolve()
    return this.run({ op: 'setEnabled', resourceId, version, enabled })
  }
}
