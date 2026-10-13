/** Open the host's sessionless composer; workspace/preset selection stays native.
 * The native hero slot stages a preset for the NEXT blank session. It is not a
 * default-setting write, a session creation RPC, or a selection on an old chat.
 */
export function nativeAssistantNavigation(get: (name: string) => any) {
  let epoch = 0, busy = false
  return {
    reset() { epoch++; busy = false },
    async start(presetId: string, lifetime?: AbortSignal) {
      // Purchased resources have a bounded resource ID plus a version digest.
      // Keep the existing assistant identity limit; only that concrete resource
      // format may exceed it, and the native picker still must list the exact ID.
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(presetId)
        && !/^hr-resource-[a-z0-9][a-z0-9-]{0,63}-[a-f0-9]{12}$/.test(presetId)) throw new Error('助手身份无效')
      if (busy || lifetime?.aborted) return
      const generation = epoch
      const navigation = get('uiWorkspace'), slots = get('slots')
      const enabled = get('configForms')?.developerTools?.enabled?.getSnapshot()
      const entries = slots?.entries?.('conversation.hero.agentPreset')
      // Fail closed if a future host replaces this single native picker contract.
      const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : undefined
      if (enabled !== true || typeof navigation?.clearMain !== 'function'
        || entry?.options?.locale !== 'settings.agentPreset' || typeof entry?.inject !== 'function')
        throw new Error('当前 DSH 尚未提供快捷入口，请在原生新会话中选择此助手模式。')
      const seat = entry.inject(undefined)
      if (typeof seat?.load !== 'function' || typeof seat?.select !== 'function'
        || typeof seat?.hooks?.agentPresetSeat?.getSnapshot !== 'function')
        throw new Error('当前 DSH 的模式选择入口不兼容，请使用原生新会话入口。')
      const current = () => generation === epoch && !lifetime?.aborted
      busy = true
      try {
        await seat.load()
        if (!current()) return
        const latestEntries = slots.entries('conversation.hero.agentPreset')
        if (!Array.isArray(latestEntries) || latestEntries.length !== 1 || latestEntries[0] !== entry)
          throw new Error('DSH 的模式入口已更新，请重新点击开始使用。')
        const snapshot = seat.hooks.agentPresetSeat.getSnapshot()
        if (snapshot.busy || snapshot.error || !snapshot.options?.some((item: any) => item.id === presetId))
          throw new Error('此助手尚未就绪，请刷新状态后重试。')
        if (get('configForms')?.developerTools?.enabled?.getSnapshot() !== true)
          throw new Error('DSH 的工作模式选择已关闭，请在原生设置中开启后重试。')
        // Detach the old main view BEFORE staging. This preserves existing input
        // drafts and keeps native list-change observers from applying to them.
        // clearMain opens the native hero without creating a session/workspace.
        navigation.clearMain()
        const refusal = await seat.select(presetId)
        if (current() && refusal) throw new Error(refusal)
      } finally { if (generation === epoch) busy = false }
    },
  }
}
