/** Native 0.2 public contracts: remote.session.create, sessions.refresh and
 * uiWorkspace.openSession. No DOM, hidden seat store or default-preset edits. */
export function nativeAssistantNavigation(get: (name: string) => any) {
  let epoch = 0, busy = false
  const attempts = new Map<string, { state: 'unknown' | 'created'; sessionId?: string }>()
  return {
    reset() {
      epoch++; busy = false
      // A reset is not evidence that the native create did not commit. Retain
      // no-replay tombstones, but never carry a session address to another host.
      for (const presetId of attempts.keys()) attempts.set(presetId, { state: 'unknown' })
    },
    async start(presetId: string, lifetime?: AbortSignal) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(presetId)) throw new Error('助手身份无效')
      const remote = get('remote.session'), sessions = get('sessions'), navigation = get('uiWorkspace'), layout = get('layout')
      const enabled = get('configForms')?.developerTools?.enabled?.getSnapshot()
      if (enabled !== true || typeof remote?.create !== 'function' || typeof sessions?.refresh !== 'function'
        || typeof navigation?.openSession !== 'function' || typeof layout?.beginNavigation !== 'function')
        throw new Error('当前原生界面未提供助手会话入口，或原生工作模式选择尚未启用；请使用 DSH 的新会话入口选择此预设。')
      if (busy || lifetime?.aborted) return
      const prior = attempts.get(presetId)
      if (prior?.state === 'unknown') throw new Error('上次新建结果尚未确认，请先核对原生会话列表；不会自动再次创建。')
      if (prior?.sessionId) { navigation.openSession(prior.sessionId); return }
      const generation = epoch, navigationSignal = layout.beginNavigation() as AbortSignal
      const current = () => generation === epoch && !navigationSignal.aborted && !lifetime?.aborted
      if (!current()) return
      busy = true
      try {
        attempts.set(presetId, { state: 'unknown' })
        const result = await remote.create({ agentPreset: presetId })
        if (!current()) throw new Error('导航或连接已变化，请核对原生会话列表；没有自动跳转。')
        if (!result?.ok || typeof result.value?.sessionId !== 'string' || !result.value.sessionId || result.value.agentPreset !== presetId)
          throw new Error(result?.error?.message || '原生宿主未确认指定助手身份，请核对会话列表。')
        attempts.set(presetId, { state: 'created', sessionId: result.value.sessionId })
        await sessions.refresh()
        if (!current()) return
        navigation.openSession(result.value.sessionId)
      } finally { if (generation === epoch) busy = false }
    },
  }
}
