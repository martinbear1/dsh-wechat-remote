/**
 * Compatibility ONLY for the released Mini Program's model-only equality check.
 * Native IDs, projections, defaults on disk, and slash-style Remote RPCs stay native.
 * No mutable/global alias table: Web/Desktop, reconnect and hot reload cannot share
 * stale identity state. Labels never determine routing; exact native IDs do.
 */
type RecordValue = Record<string, unknown>
export const LEGACY_MODEL_FORMAT = 'legacy-provider-model-v1'
export const NATIVE_MODEL_FORMAT = 'native-v1'
const separator = ' · '

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function failure(message: string): never {
  throw Object.assign(new Error(message), { code: 'adapter/model-identity-invalid' })
}

export function modelIdentityFormat(request: RecordValue): string {
  const format = request.modelIdentity ?? LEGACY_MODEL_FORMAT
  if (format !== LEGACY_MODEL_FORMAT && format !== NATIVE_MODEL_FORMAT) {
    failure('不支持此模型标识格式；未更改模型')
  }
  return format as string
}

function component(value: string): string {
  // Escape the separator character and escape character themselves, retaining
  // readable Unicode. Thus IDs containing punctuation cannot collide.
  return value.replace(/%/g, '%25').replace(/·/g, '%B7')
    .replace(/[\u0000-\u001f\u007f]/g, char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
}

export function legacyModelAlias(provider: string, model: string): string {
  return component(provider) + separator + component(model)
}

function groupsOf(catalog: unknown): RecordValue[] {
  const groups = record(catalog)?.groups
  if (!Array.isArray(groups)) failure('主机模型目录无效；请刷新模型列表')
  const providers = new Set<string>()
  for (const candidate of groups) {
    const group = record(candidate)
    if (!group || typeof group.id !== 'string' || !group.id || providers.has(group.id) || !Array.isArray(group.models)) {
      failure('主机提供方目录无效；请刷新模型列表')
    }
    providers.add(group.id)
    const models = new Set<string>()
    for (const candidate of group.models) {
      const model = record(candidate)
      if (!model || typeof model.id !== 'string' || !model.id || models.has(model.id)) {
        failure('主机模型目录包含无效或重复标识；未猜测模型')
      }
      models.add(model.id)
    }
  }
  return groups as RecordValue[]
}

export function legacyModelSelection(value: unknown): unknown {
  const selection = record(value)
  if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') return value
  return { ...selection, model: legacyModelAlias(selection.provider, selection.model), nativeModel: selection.model }
}

export function presentModelCatalog(catalog: RecordValue, current: unknown, format: string): RecordValue {
  const groups = groupsOf(catalog)
  const aliases = format === LEGACY_MODEL_FORMAT && groups.length > 1
  const selection = (value: unknown) => {
    const selected = record(value)
    // A removed provider must not accidentally check the sole remaining
    // provider's same-named model. Keep the unavailable native intent visible.
    const missingProvider = groups.length === 1 && selected && selected.provider !== groups[0].id
    return format === LEGACY_MODEL_FORMAT && (aliases || missingProvider) ? legacyModelSelection(value) : value
  }
  return {
    ...catalog,
    groups: aliases ? groups.map(group => ({ ...group, models: (group.models as RecordValue[]).map(model => ({
      ...model,
      id: legacyModelAlias(group.id as string, model.id as string),
      name: `${group.name || group.id}${separator}${model.name || model.id}`,
      nativeModel: model.id,
    })) })) : groups,
    default: selection(catalog.default),
    current: selection(current),
    // Per-response negotiation (not OS/version guessing or global state).
    // A future Mini requests native-v1 and MUST verify this acknowledgement.
    modelIdentity: { version: 1, format, aliases, supportedFormats: [LEGACY_MODEL_FORMAT, NATIVE_MODEL_FORMAT] },
  }
}

export function needsModelAliasResolution(request: RecordValue): boolean {
  return modelIdentityFormat(request) === LEGACY_MODEL_FORMAT
    && typeof request.model === 'string' && request.model.includes(separator)
}

export function resolveModelAlias(catalog: unknown, request: RecordValue): { model: string; aliased: boolean } {
  const groups = groupsOf(catalog)
  const group = groups.find(group => group.id === request.provider)
  if (!group || typeof request.model !== 'string') failure('该提供方已不可用；请刷新模型列表后重新选择')
  const models = group.models as RecordValue[]
  const raw = models.find(model => model.id === request.model)
  const aliased = models.find(model => legacyModelAlias(group.id as string, model.id as string) === request.model)
  // Old clients can retain raw IDs over a plugin upgrade. If a real raw ID is
  // also another model's alias, neither interpretation is safe. Require refresh.
  if (raw && aliased && raw.id !== aliased.id) failure('模型标识有歧义；请刷新模型列表后重新选择')
  if (aliased) return { model: aliased.id as string, aliased: true }
  if (raw) return { model: raw.id as string, aliased: false }
  failure('模型或提供方已变化；请刷新模型列表后重新选择，未更改模型')
}
