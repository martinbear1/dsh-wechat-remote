/** Bind the page to its own Host. No port scan or default-Web fallback. */
export interface GateDoorInfo {
  port: number
  state: 'starting' | 'listening' | 'unavailable' | 'stopped'
}
export interface GateRuntimeInfo {
  profileScope?: string
  management?: 'authenticated-rpc' | 'loopback' | 'unavailable'
  localDoor: GateDoorInfo
  publicDoor: GateDoorInfo
}
export interface HarnessRemoteHostDescription {
  computerName: string
  agentName: string
  agentInstanceId?: string
  agentVersion?: string
  pluginVersion?: string
  gate?: GateRuntimeInfo
}
export type CallPairingManagement = (endpoint: 'status' | 'pair-code' | 'companion-decision' | 'update-check' | 'update-start' | 'update-status', payload?: { offerId: string; action: 'approve' | 'later' } | { ticket: string }) => Promise<unknown>

export async function resolvePairingClient(
  describeHost: () => Promise<HarnessRemoteHostDescription>,
  callManagement: CallPairingManagement,
  fetchImpl: typeof fetch = fetch,
) {
  const host = await describeHost(), runtime = host.gate
  if (!runtime) throw new Error('当前节点没有提供配对入口')
  const desktop = runtime.profileScope === 'desktop'
  const port = runtime.localDoor?.port
  const localOrigin = Number.isSafeInteger(port) && port >= 1 && port <= 65535
    ? `http://127.0.0.1:${port}` : null
  if (runtime.management === 'authenticated-rpc') {
    return { host, runtime, localOrigin: desktop ? null : localOrigin,
      status: () => callManagement('status'), pairCode: () => callManagement('pair-code'),
      decide: (offerId: string, action: 'approve' | 'later') => callManagement('companion-decision', { offerId, action }) }
  }
  // COMPAT: old Web hosts still use their explicitly described local door.
  // An absent/failed description never authorizes trying port 3093.
  if (desktop || runtime.management === 'unavailable' || !localOrigin
      || runtime.localDoor.state !== 'listening') throw new Error('当前节点配对入口尚未就绪')
  const read = async (route: string): Promise<unknown> => {
    const response = await fetchImpl(localOrigin + route, { cache: 'no-store' })
    if (!response.ok) throw new Error(`配对请求失败 (${response.status})`)
    return response.json()
  }
  return { host, runtime, localOrigin,
    status: () => read('/gate/status'), pairCode: () => read('/pair/code'),
    decide: async (offerId: string, action: 'approve' | 'later') => {
      const response = await fetchImpl(localOrigin + '/gate/companion/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId, action }) })
      if (!response.ok) throw new Error('更新通知已变化，请刷新后重试')
      return response.json()
    } }
}
