/** Optional public services only: no DOM clicking, internal stores or host edits. */
export async function openPluginPage(get: (name: string) => unknown): Promise<boolean> {
  type Navigation = { openBundle?: (name: string) => void }
  type Manager = { listBundles?: () => Promise<{ ok: boolean; value?: Array<{ name: string; enabled: boolean }> }> }
  try {
    const navigation = get('pluginNavigation') as Navigation | undefined
    // Cordis get() allows optional service lookup, but nested Remote property
    // access still enforces inject. Resolve the declared namespace directly.
    const manager = get('remote.pluginManager') as Manager | undefined
    if (typeof navigation?.openBundle !== 'function' || typeof manager?.listBundles !== 'function') return false
    const result = await manager.listBundles()
    if (!result.ok || !Array.isArray(result.value)) return false
    const owners = result.value.filter(bundle => bundle.enabled && ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote'].includes(bundle.name))
    // An ambiguous install must not route to an arbitrary other owner.
    if (owners.length !== 1) return false
    const current = get('pluginNavigation') as Navigation | undefined
    if (current !== navigation || typeof current.openBundle !== 'function') return false
    current.openBundle(owners[0].name)
    return true
  } catch { return false }
}
