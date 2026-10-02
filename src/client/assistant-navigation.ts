/** Public native creation/navigation, with a durable current-node launch journal. */
export function nativeAssistantNavigation(get: (name: string) => any,
  call?: (method: 'assistantSessionPrepare' | 'assistantSessionStatus', request: Record<string, unknown>) => Promise<any>) {
  let epoch = 0, busy = false
  const valid = (value: any, presetId: string) => value?.schema === 'human.assistant.session-intent.v1'
    && value.presetId === presetId && value.workspaceId === null && typeof value.nodeId === 'string'
    && (value.state === 'none' || /^[a-f0-9]{32}$/.test(value.attemptId) && /^session-[a-f0-9-]{36}$/.test(value.sessionId))
  return {
    reset() { epoch++; busy = false },
    async start(presetId: string, lifetime?: AbortSignal, newIntent = false) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(presetId)) throw new Error('助手身份无效')
      const remote = get('remote.session'), sessions = get('sessions'), navigation = get('uiWorkspace'), layout = get('layout')
      const enabled = get('configForms')?.developerTools?.enabled?.getSnapshot()
      if (!call || enabled !== true || typeof remote?.create !== 'function' || typeof sessions?.refresh !== 'function'
        || typeof navigation?.openSession !== 'function' || typeof layout?.beginNavigation !== 'function')
        throw new Error('当前原生界面未提供助手会话入口，或原生工作模式选择尚未启用；请使用 DSH 的新会话入口选择此预设。')
      if (busy || lifetime?.aborted) return
      const generation = epoch, navigationSignal = layout.beginNavigation() as AbortSignal
      const current = () => generation === epoch && !navigationSignal.aborted && !lifetime?.aborted
      const check = () => { if (!current()) throw new Error('导航或连接已变化，请核对原生会话列表；没有自动跳转。') }
      if (!current()) return
      busy = true
      try {
        let intent = await call('assistantSessionStatus', { presetId }); check()
        if (!valid(intent, presetId)) throw new Error('会话创建意图格式无效')
        if (intent.state === 'unknown' || intent.state === 'conflict') throw new Error('上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。')
        const nodeId = intent.nodeId
        if (intent.state === 'none' || newIntent) {
          intent = await call('assistantSessionPrepare', { presetId, ...(intent.state === 'created' ? { previousAttemptId: intent.attemptId } : {}) }); check()
          if (!valid(intent, presetId) || intent.nodeId !== nodeId) throw new Error('节点或会话创建意图已变化')
          if (intent.dispatch === true && intent.state === 'unknown') {
            const result = await remote.create({ agentPreset: presetId, sessionId: intent.sessionId }); check()
            if (!result?.ok || result.value?.sessionId !== intent.sessionId || result.value?.agentPreset !== presetId)
              throw new Error('原生宿主未确认指定助手身份和会话，请核对会话列表；不会自动重试。')
          }
          intent = await call('assistantSessionStatus', { attemptId: intent.attemptId }); check()
          if (!valid(intent, presetId) || intent.nodeId !== nodeId) throw new Error('节点或会话创建意图已变化')
        }
        if (intent.state !== 'created') throw new Error('上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。')
        await sessions.refresh(); check(); navigation.openSession(intent.sessionId)
      } finally { if (generation === epoch) busy = false }
    },
  }
}
