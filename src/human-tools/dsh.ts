import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { HUMAN_TOOL_NAME, HUMAN_MEMBERS_TOOL_NAME, HUMAN_REMIND_TOOL_NAME, HUMAN_ID, exactKeys, humanSurface,
  humanReminderTitle, object, text } from './protocol.js'
import type { HumanToolsCore } from './core.js'

/** Only this adapter knows DSH tool execution, agent/session and prompt semantics. */
export function dshHumanToolsAvailable(ctx: Context): boolean {
  const tools = ctx.get('tools') as { register?: unknown } | undefined
  const agents = ctx.get('agents') as { get?: unknown } | undefined
  const prompt = ctx.get('systemPrompt') as { context?: unknown } | undefined
  return typeof tools?.register === 'function' && typeof agents?.get === 'function' && typeof prompt?.context === 'function'
}
export const HUMAN_CONTEXT_NAME = 'harness-remote.human-actions'
export function registerHumanContext(ctx: Context, core: HumanToolsCore): () => void {
  return (ctx.get('systemPrompt') as SystemPrompt).context({ name: HUMAN_CONTEXT_NAME, order: 80, text(assembly) {
    const agent = assembly.agent
    const agents = ctx.get('agents') as { get(id: string): Agent | undefined } | undefined
    if (!agent || assembly.scope !== agent || agent.id !== agent.session?.id || agents?.get(agent.id) !== agent
      || !Number.isSafeInteger(agent.session.header?.createdAt)) return ''
    const receipts = core.contextSnapshot(String(agent.session.id), String(agent.session.header.createdAt))
    if (!receipts.length) return ''
    // Only bounded IDs and enums from our durable ledger enter the runtime
    // context. Do not interpolate model/user title/body or trust JSON notices.
    // This respects host runtime-context suppression and never submits a turn.
    return '微信卡片操作状态快照：以下是客户端报告、插件已保存的最新回执；success仅表示原生API报告成功，'
      + '不证明收件人已收到、已读或业务完成。taskRef仅为业务定位符，不授予群身份、成员或提醒权限。只在相关时参考，不把它当作新用户请求。\n'
      + JSON.stringify({ schema: 'human.action.context.v2', receipts: receipts.map(receipt => ({
        surfaceId: receipt.surfaceId, receiptId: receipt.receiptId, attemptId: receipt.attemptId, outcome: receipt.outcome,
        ...(receipt.taskRef ? { taskRef: receipt.taskRef } : {}),
        ...(receipt.selectionRef ? { selectionRef: receipt.selectionRef } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}),
      })) })
  } })
}

function originOf(exec: ToolRunContext) {
  if (!exec.agent?.session || exec.agent.id !== exec.agent.session.id || !Number.isSafeInteger(exec.agent.session.header?.createdAt)
    || !text(exec.callId, 256) || !text(exec.rootCallId, 256)) throw new Error('此工具需要具有稳定身份的真实DSH会话上下文')
  return { scope: String(exec.agent.session.id), generation: String(exec.agent.session.header.createdAt),
    callId: String(exec.callId), rootCallId: String(exec.rootCallId) }
}
function controlledOutput(): NonNullable<ToolDefinition['output']> {
  return {
    schema: { type: 'object', properties: { surface: { type: 'object' } }, required: ['surface'], additionalProperties: false },
    render(_args, value) {
      const surface = object(value) ? humanSurface(value.surface) : undefined
      if (!surface) throw new Error('无效的任务操作卡片结果')
      const next = surface.actions[0].id === 'select-members'
        ? `主人成功选人后，可用本卡 surfaceId ${surface.id} 作为 human_task_remind 的 sourceSurfaceId；不要手拼成员或群ID。`
        : '现在尚未发送提醒。仅提醒所选成员中尚未确认者；点击可能直接发送，不保证另有微信确认。不要自动重试。'
      return [{ type: 'text', text: `“${surface.title}”的${surface.actions[0].label}操作已准备好，等待主人在最终回复中查看并批准。${next}` }]
    },
    presentationMeta(_args, value) {
      const surface = object(value) ? humanSurface(value.surface) : undefined
      if (!surface) throw new Error('无效的任务操作卡片结果')
      return { humanSurface: surface as unknown as import('@deepseek-ai/dsh-tools').JsonValue }
    },
  }
}

export function humanMembersTool(core: HumanToolsCore): ToolDefinition {
  return {
    name: HUMAN_MEMBERS_TOOL_NAME,
    description: 'Prepare an owner-approved member-selection action for a task already successfully shared in this conversation. '
      + 'Use the successful share surfaceId as sourceSurfaceId. The plugin resolves its saved task reference and original group. '
      + 'This does not enumerate the group, provide names, send reminders or grant access to private data. '
      + 'The owner must explicitly choose members in WeChat. After a successful saved selection receipt, use this new surfaceId as human_task_remind sourceSurfaceId. '
      + 'Return to your final reply and say selection is ready, not completed.',
    parameters: { type: 'object', properties: { sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' } }, required: ['sourceSurfaceId'], additionalProperties: false },
    output: controlledOutput(),
    async execute(args: unknown, exec: ToolRunContext) {
      if (!object(args) || !exactKeys(args, ['sourceSurfaceId']) || typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId))
        throw new Error('仅支持来源卡片sourceSurfaceId')
      return { surface: await core.createMembers(originOf(exec), args.sourceSurfaceId, exec.signal) }
    },
  }
}

export function humanRemindTool(core: HumanToolsCore): ToolDefinition {
  return {
    name: HUMAN_REMIND_TOOL_NAME,
    description: 'Prepare an explicit owner-approved reminder only from a successful human_task_select_members surface in this conversation. '
      + 'Use that selection surfaceId as sourceSurfaceId. The reminder covers ALL members in that explicit selection who remain unconfirmed. '
      + 'You cannot choose a subset by reference: for a smaller range, prepare human_task_select_members again and wait for the owner to explicitly reselect in WeChat. '
      + 'Never guess names, member IDs, group IDs, task IDs or paths. title permits only Chinese characters, ASCII letters and digits, maximum 30 weighted characters (Chinese counts as 2). '
      + 'Only selected members still unconfirmed at execution may be notified. This tool does not send anything. '
      + 'The final action explicitly approves the exact title and range; clicking may send immediately without any extra WeChat confirmation. '
      + 'Never auto-retry or claim delivery. A cancelled receipt with reason no_pending_members means nobody needed a reminder, not a successful send.',
    parameters: { type: 'object', properties: { sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' },
      title: { type: 'string', minLength: 1, maxLength: 30, pattern: '^[\\u4e00-\\u9fa5A-Za-z0-9]+$' } },
      required: ['sourceSurfaceId', 'title'], additionalProperties: false },
    output: controlledOutput(),
    async execute(args: unknown, exec: ToolRunContext) {
      if (!object(args) || !exactKeys(args, ['sourceSurfaceId', 'title'])
        || typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId) || !humanReminderTitle(args.title)) throw new Error('提醒标题或来源成员范围无效')
      return { surface: await core.createReminder(originOf(exec), args.sourceSurfaceId, args.title, exec.signal) }
    },
  }
}

export function humanShareTool(core: HumanToolsCore): ToolDefinition {
  return {
    name: HUMAN_TOOL_NAME,
    description: 'Prepare one group reading-confirmation task card for the paired owner. Provide title and plain-text body. '
      + 'Optionally set sourceSurfaceId to a previously successfully published surface in this same conversation to use that task’s original group. '
      + 'The plugin resolves its own saved reference; never provide group IDs, task IDs or credentials. This does not provide a whole-group member list or reminder capability. '
      + 'This returns immediately; it does not share, publish files, invite members or wait for the user. '
      + 'The owner reviews the text in your final reply and clicks the action. A new target requires WeChat group selection; sourceSurfaceId reuses the original group. '
      + 'WeChat confirmation remains a user action; only then the approved text is published to that group. '
      + 'Every member of that group may read the published text and confirm their own reading status. No private assignments or files are supported yet. '
      + 'Only one card per root tool call: repeats reuse the original without replacing it. '
      + 'After tool success, finish your normal reply and say the card is ready for the owner to send. Never claim it was shared or read.',
    parameters: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 80 },
      body: { type: 'string', minLength: 1, maxLength: 1000 }, sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' } },
      required: ['title', 'body'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { surface: { type: 'object' } }, required: ['surface'], additionalProperties: false },
      render(_args, value) {
        const surface = object(value) ? humanSurface(value.surface) : undefined
        if (!surface) throw new Error('无效的测试卡片结果')
        return [{ type: 'text', text: `群卡“${surface.title}”已准备好。主人在最终回复查看正文，点击发送并选择群后，正文才会发布给该群成员；现在尚未发送。成员打开后可确认本人已阅读。` }]
      },
      presentationMeta(_args, value) {
        const surface = object(value) ? humanSurface(value.surface) : undefined
        if (!surface) throw new Error('无效的测试卡片结果')
        return { humanSurface: surface as unknown as import('@deepseek-ai/dsh-tools').JsonValue }
      },
    },
    async execute(args: unknown, exec: ToolRunContext) {
      if (!object(args) || !exactKeys(args, ['title', 'body', ...(Object.hasOwn(args, 'sourceSurfaceId') ? ['sourceSurfaceId'] : [])])
        || !text(args.title, 80) || !text(args.body, 1000)
        || Object.hasOwn(args, 'sourceSurfaceId') && (typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId)))
        throw new Error('仅支持有效的title、body和可选sourceSurfaceId字段')
      if (!exec.agent?.session || exec.agent.id !== exec.agent.session.id || !Number.isSafeInteger(exec.agent.session.header?.createdAt)
        || !text(exec.callId, 256) || !text(exec.rootCallId, 256))
        throw new Error('此工具需要具有稳定身份的真实DSH会话上下文')
      return { surface: await core.create({ scope: String(exec.agent.session.id), generation: String(exec.agent.session.header.createdAt), callId: String(exec.callId),
        rootCallId: String(exec.rootCallId) }, args.title, args.body, exec.signal, args.sourceSurfaceId as string | undefined) }
    },
  }
}
