/** Public native creation/navigation, with a durable current-node launch journal. */
export function nativeAssistantNavigation(get: (name: string) => any,
  call?: (method: 'assistantSessionPrepare' | 'assistantSessionStatus', request: Record<string, unknown>) => Promise<any>) {
  let epoch = 0, busy = false
  const valid = (value: any, presetId: string, workspaceId?: string) => value?.schema === 'human.assistant.session-intent.v1'
    && value.presetId === presetId && value.workspaceId === (workspaceId ?? null) && typeof value.nodeId === 'string'
    && (value.state === 'none' || /^[a-f0-9]{32}$/.test(value.attemptId) && /^session-[a-f0-9-]{36}$/.test(value.sessionId))
  return {
    reset() { epoch++; busy = false },
    workspaces() {
      const list = get('workspaces')?.list?.getSnapshot(), sessions = get('sessions')?.list?.getSnapshot()
      if (list?.phase !== 'ready' || sessions?.phase !== 'ready') throw new Error('工作区还在读取，请稍后再试。')
      const currentSession = Object.values(sessions.byId || {}).find((item: any) => item.retainedBy?.mainView > 0) as any
      const items = [...list.items].sort((a: any, b: any) => workspaceTime(b, sessions.byId) - workspaceTime(a, sessions.byId))
      const preferred = items.find((item: any) => item.sessionIds.includes(currentSession?.id)) || items[0]
      return { items: items.map((item: any) => ({ id: item.workspaceId, name: item.title || item.name || item.path, path: item.path })), preferredId: preferred?.workspaceId || '' }
    },
    async pickWorkspace(lifetime?: AbortSignal) {
      const navigation = get('uiWorkspace'), workspaces = get('workspaces'), generation = epoch
      if (typeof navigation?.pickDirectory !== 'function' || typeof workspaces?.create !== 'function') throw new Error('原生文件夹选择器暂不可用，请先在 DSH 添加工作区。')
      const check = () => { if (generation !== epoch || lifetime?.aborted) throw new Error('连接或页面已变化，请重新选择工作区。') }
      check(); const path = await navigation.pickDirectory(); check()
      if (path === null) return undefined
      if (typeof path !== 'string' || !path) throw new Error('文件夹选择结果无效')
      const workspace = await workspaces.create({ path }); check()
      return workspace.workspaceId as string
    },
    async start(presetId: string, lifetime?: AbortSignal, newIntent = false, workspaceId?: string) {
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
        if (workspaceId !== undefined) {
          const list = get('workspaces')?.list?.getSnapshot()
          if (list?.phase !== 'ready' || !list.items.some((item: any) => item.workspaceId === workspaceId))
            throw new Error('所选工作区已不可用，请重新选择。')
        }
        const selector = { presetId, ...(workspaceId ? { workspaceId } : {}) }
        let intent = await call('assistantSessionStatus', selector); check()
        if (!valid(intent, presetId, workspaceId)) throw new Error('会话创建意图格式无效')
        if (intent.state === 'unknown' || intent.state === 'conflict') throw new Error('上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。')
        const nodeId = intent.nodeId
        if (intent.state === 'none' || newIntent) {
          intent = await call('assistantSessionPrepare', { ...selector, ...(intent.state === 'created' ? { previousAttemptId: intent.attemptId } : {}) }); check()
          if (!valid(intent, presetId, workspaceId) || intent.nodeId !== nodeId) throw new Error('节点或会话创建意图已变化')
          if (intent.dispatch === true && intent.state === 'unknown') {
            const result = await remote.create({ agentPreset: presetId, sessionId: intent.sessionId, ...(workspaceId ? { workspaceId } : {}) }); check()
            if (!result?.ok || result.value?.sessionId !== intent.sessionId || result.value?.agentPreset !== presetId)
              throw new Error('原生宿主未确认指定助手身份和会话，请核对会话列表；不会自动重试。')
          }
          intent = await call('assistantSessionStatus', { attemptId: intent.attemptId }); check()
          if (!valid(intent, presetId, workspaceId) || intent.nodeId !== nodeId) throw new Error('节点或会话创建意图已变化')
        }
        if (intent.state !== 'created') throw new Error('上次新建结果尚未确认，请核对原生会话列表；不会自动再次创建。')
        await sessions.refresh(); check(); navigation.openSession(intent.sessionId)
      } finally { if (generation === epoch) busy = false }
    },
  }
}

function workspaceTime(workspace: any, sessions: Record<string, any>): number {
  const times = workspace.sessionIds.map((id: string) => sessions[id]?.updatedAt).filter(Number.isFinite)
  return times.length ? Math.max(...times) : Date.parse(workspace.createdAt) || 0
}
