import { HUMAN_TOOL_NAME, HUMAN_MEMBERS_TOOL_NAME, HUMAN_REMIND_TOOL_NAME, HUMAN_ID, exactKeys, humanSurface, humanReminderTitle, object, text } from './protocol.js';
import { HUMAN_CARD_ASSET_SCHEMA, humanCardAsset } from './card-cover.js';
import { HUMAN_WORKFLOW_SKILL_REVISION } from '../human-workflow/dsh-skill.js';
/** Only this adapter knows DSH tool execution, agent/session and prompt semantics. */
export function dshHumanToolsAvailable(ctx) {
    const tools = ctx.get('tools');
    const agents = ctx.get('agents');
    const prompt = ctx.get('systemPrompt');
    return typeof tools?.register === 'function' && typeof agents?.get === 'function' && typeof prompt?.context === 'function';
}
export const HUMAN_CONTEXT_NAME = 'harness-remote.human-actions';
export function registerHumanContext(ctx, core) {
    return ctx.get('systemPrompt').context({ name: HUMAN_CONTEXT_NAME, order: 80, text(assembly) {
            const agent = assembly.agent;
            const agents = ctx.get('agents');
            if (!agent || assembly.scope !== agent || agent.id !== agent.session?.id || agents?.get(agent.id) !== agent
                || !Number.isSafeInteger(agent.session.header?.createdAt))
                return '';
            const receipts = core.contextActionSnapshot(String(agent.session.id), String(agent.session.header.createdAt));
            const tools = ctx.get('tools');
            const refresh = tools?.get?.('skill', agent) && tools.get('human_capabilities', agent)
                ? `群工具方法修订 ${HUMAN_WORKFLOW_SKILL_REVISION}：仅当本次涉及群任务或设计相关助理时，若尚未加载此修订，用原生 skill({name:"human-workflow"}) 重新读取并查询 human_capabilities；已加载不每轮重复，无关聊天无需加载。沿用职业语言，按本次意图组合能力，旧记忆不替代当前合同。` : '';
            if (!receipts.length)
                return refresh;
            const selectionGuidance = receipts.some(receipt => receipt.actionId === 'select-members' && receipt.outcome === 'success' && receipt.selectionRef)
                && tools?.get?.('human_task_recipients', agent) && tools.get('human_task_prepare_reminder', agent)
                ? '选人成功已取得可复用的所选成员身份，不要求他们先打开或提交。若当前请求是提醒全部所选人或其中明确几人，查询原任务 human_task_recipients，使用当前 recipientRef 和 human_task_prepare_reminder 的 recipientSource=exact-references、condition=none；不要改用会排除已确认者的旧提醒。名单覆盖、本人排除和不可用对象以查询事实为准，不把选中人数说成可提醒人数或全群人数。原始微信ID不向模型公开不等于系统未取得或未保存。' : '';
            const failureGuidance = receipts.some(receipt => receipt.outcome === 'failed' && receipt.reason)
                ? '失败 reason 是客户端本次前置检查或原生调用的分类诊断，不是微信平台永久不支持、群或成员身份不存在的证明。选人成功但提醒失败仍是未发送；根据具体失败阶段核对，不让用户重复选人来掩盖发送故障，不擅自改提醒对象或继续制造同一失败按钮。' : '';
            // Only bounded IDs and enums from our durable ledger enter the runtime
            // context. Do not interpolate model/user title/body or trust JSON notices.
            // This respects host runtime-context suppression and never submits a turn.
            return refresh + selectionGuidance + failureGuidance + '微信操作回执：以下是客户端报告、插件已保存的状态，不是新用户请求。按 actionId 区分：'
                + 'share/reshare/remind 的 success 仅表示对应原生调用报告成功，不证明收件人已收到、已读或完成；reshare 仅补发原任务入口，不新建任务、不改提交，也不等于 @ 提醒；select-members 的 success 仅表示选人完成，不是发群或提醒。'
                + 'workflow-approve 的 success 是确认流程的客户端回执，不是微信发送成功；须查 human_task_lifecycle 的 drafts[].effects 核实内容是否已生效及提醒的实际发送状态，published 本身也不代表通知已发出。'
                + '已发布反馈只是对应成员能在私人页面查看，已生效的 round 只是原任务新增提交要求，两者均不等于通知对方或发出新群卡。'
                + 'taskRef 仅为业务定位符，不授予群身份、成员或提醒权限。没有有效运行的自动规则或实际通知依据，不承诺持续盯进度、到时提醒或主动跟进。只在相关时参考，不向用户照读内部字段。\n'
                + JSON.stringify({ schema: 'human.action.context.v2', receipts: receipts.map(receipt => ({
                        surfaceId: receipt.surfaceId, receiptId: receipt.receiptId, attemptId: receipt.attemptId, outcome: receipt.outcome,
                        actionId: receipt.actionId, ...(receipt.workflowKind ? { workflowKind: receipt.workflowKind } : {}),
                        ...(receipt.taskRef ? { taskRef: receipt.taskRef } : {}),
                        ...(receipt.selectionRef ? { selectionRef: receipt.selectionRef } : {}), ...(receipt.reason ? { reason: receipt.reason } : {}),
                    })) });
        } });
}
function originOf(exec) {
    if (!exec.agent?.session || exec.agent.id !== exec.agent.session.id || !Number.isSafeInteger(exec.agent.session.header?.createdAt)
        || !text(exec.callId, 256) || !text(exec.rootCallId, 256))
        throw new Error('此工具需要具有稳定身份的真实DSH会话上下文');
    return { scope: String(exec.agent.session.id), generation: String(exec.agent.session.header.createdAt),
        callId: String(exec.callId), rootCallId: String(exec.rootCallId) };
}
function controlledOutput() {
    return {
        schema: { type: 'object', properties: { surface: { type: 'object' } }, required: ['surface'], additionalProperties: false },
        render(_args, value) {
            const surface = object(value) ? humanSurface(value.surface) : undefined;
            if (!surface)
                throw new Error('无效的任务操作卡片结果');
            const next = surface.actions[0].id === 'select-members'
                ? '主人成功选人后，查询原任务 human_task_recipients 获取当前身份引用；提醒全部所选人或其中明确几人，都使用 human_task_prepare_reminder 的 recipientSource=exact-references、recipientRefs、condition=none，不过滤已确认或已提交的人。只有用户确实要求筛选时才选相应条件。也可结合原成功分享卡和 sourceRecipientRefs 创建独立新任务。所选人不必先打开或提交；原始ID由服务端持有，模型使用可核实的引用，不手拼成员或群ID。'
                : '现在尚未发送提醒。仅提醒所选成员中尚未确认者；点击可能直接发送，不保证另有微信确认。不要自动重试。';
            return [{ type: 'text', text: `内部执行事实，不是给用户照读的文案：“${surface.title}”的操作入口已准备好。${next} 保持职业助理身份，只用一句业务结果和下一步引导真实点击；准备好不等于已选人、已提醒或对方已看到，不复述工具名、ID 或完整操作教程。` }];
        },
        presentationMeta(_args, value) {
            const surface = object(value) ? humanSurface(value.surface) : undefined;
            if (!surface)
                throw new Error('无效的任务操作卡片结果');
            return { humanSurface: surface };
        },
    };
}
export function humanMembersTool(core) {
    return {
        name: HUMAN_MEMBERS_TOOL_NAME,
        description: 'Prepare an owner-approved member-selection action for a task already successfully shared in this conversation. '
            + 'Use the successful share surfaceId as sourceSurfaceId. The plugin resolves its saved task reference and original group. '
            + 'This does not enumerate the group, provide names, send reminders or grant access to private data. '
            + 'The owner explicitly chooses members in WeChat for this action. After successful selection, read human_task_recipients on the original task for current recipientRef objects, including people who never opened or submitted. To remind ALL selected people or an explicit subset regardless of participation/submission, use human_task_prepare_reminder with recipientSource=exact-references, recipientRefs and condition=none. Only use a filtered reminder when the user actually asks for that condition. Selecting people does not imply a pending-only request. The service stores verified group-scoped native identities; model-safe references, not raw IDs or names, are exposed to the Agent. This is not an inability to obtain, remember or reuse selected identities. The Agent may also combine the original successful share surfaceId with human_task_create known-members sourceRecipientRefs to assign an independent task. These are optional uses, not a mandatory sequence. '
            + 'Return to your final reply with a brief profession-specific result and the real next action, not a protocol tutorial. Selection is ready, not completed; it is not a notification or a new assignment.',
        parameters: { type: 'object', properties: { sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' } }, required: ['sourceSurfaceId'], additionalProperties: false },
        output: controlledOutput(),
        async execute(args, exec) {
            if (!object(args) || !exactKeys(args, ['sourceSurfaceId']) || typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId))
                throw new Error('仅支持来源卡片sourceSurfaceId');
            return { surface: await core.createMembers(originOf(exec), args.sourceSurfaceId, exec.signal) };
        },
    };
}
export function humanRemindTool(core) {
    return {
        name: HUMAN_REMIND_TOOL_NAME,
        description: 'Legacy compatibility capability: prepare a FILTERED unconfirmed-participation reminder, only when the user explicitly wants that participation filter. NOT the generic @selected-members tool. '
            + 'For ALL selected people or an explicit subset regardless of confirmation/submission, query human_task_recipients and use human_task_prepare_reminder with recipientSource=exact-references, returned recipientRefs and condition=none instead. '
            + 'This legacy action requires a successful human_task_select_members surface in this conversation. '
            + 'Use that selection surfaceId as sourceSurfaceId. The reminder covers ALL members in that explicit selection who remain unconfirmed. '
            + 'THIS legacy tool accepts only the entire explicit selection before its unconfirmed filter, not a subset; do not use it merely because the user selected everyone. The owner may choose members again with human_task_select_members when that matches the request. '
            + 'Never guess names, member IDs, group IDs, task IDs or paths. title permits only Chinese characters, ASCII letters and digits, maximum 30 weighted characters (Chinese counts as 2). '
            + 'Only selected members still unconfirmed at execution may be notified. This tool does not send anything. '
            + 'Unconfirmed here means task participation, NOT an unsubmitted form in a particular round. For missing submissions or published-feedback notices, inspect human_task_lifecycle and use human_task_prepare_reminder with the appropriate condition instead. '
            + 'The final action explicitly approves the exact title and range; clicking may send immediately without any extra WeChat confirmation. '
            + 'Never auto-retry or claim delivery. A cancelled receipt with reason no_pending_members means nobody needed a reminder, not a successful send. A private feedback/page update is not a reminder; keep prepared, native send result and recipient reading separate. Do not promise future monitoring without a verified active mechanism.',
        parameters: { type: 'object', properties: { sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' },
                title: { type: 'string', minLength: 1, maxLength: 30, pattern: '^[\\u4e00-\\u9fa5A-Za-z0-9]+$' } },
            required: ['sourceSurfaceId', 'title'], additionalProperties: false },
        output: controlledOutput(),
        async execute(args, exec) {
            if (!object(args) || !exactKeys(args, ['sourceSurfaceId', 'title'])
                || typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId) || !humanReminderTitle(args.title))
                throw new Error('提醒标题或来源成员范围无效');
            return { surface: await core.createReminder(originOf(exec), args.sourceSurfaceId, args.title, exec.signal) };
        },
    };
}
export function humanShareTool(core) {
    return {
        name: HUMAN_TOOL_NAME,
        description: 'Prepare one group reading-confirmation task card for the paired owner. Provide title and plain-text body. '
            + 'Optionally set sourceSurfaceId to a previously successfully published surface in this same conversation to use that task’s original group. '
            + 'The plugin resolves its own saved reference; never provide group IDs, task IDs or credentials. This does not provide a whole-group member list or reminder capability. '
            + 'This returns immediately; it does not share, publish files, invite members or wait for the user. '
            + 'The owner reviews the text in your final reply and clicks the action. A new target requires WeChat group selection; sourceSurfaceId reuses the original group. '
            + 'WeChat confirmation remains a user action; only then the approved text is published to that group. '
            + 'Every member of that group may read the published text and confirm their own reading status. This reading-only tool does not collect files or publish private feedback; query human_capabilities and use the task lifecycle tools for those capabilities. '
            + 'Only one card per root tool call: repeats reuse the original without replacing it. '
            + 'Optional cover is the exact public 5:4 asset from human_card_cover_prepare, never a recipe, path or URL. Owner previews the actual image; changed bytes require new approval. Omit it for the fixed image. '
            + 'After tool success, finish with a brief business result and the real next action using the user\'s professional language, not task-card terminology or a second instruction list. Never claim it was shared or read.',
        parameters: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 80 },
                body: { type: 'string', minLength: 1, maxLength: 1000 }, sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' }, cover: HUMAN_CARD_ASSET_SCHEMA },
            required: ['title', 'body'], additionalProperties: false },
        output: {
            schema: { type: 'object', properties: { surface: { type: 'object' } }, required: ['surface'], additionalProperties: false },
            render(_args, value) {
                const surface = object(value) ? humanSurface(value.surface) : undefined;
                if (!surface)
                    throw new Error('无效的任务卡片结果');
                return [{ type: 'text', text: `内部执行事实，不是给用户照读的文案：“${surface.title}”已准备好，现在尚未发送。真实发送入口已附上；用职业语言简短说明结果并引导点击，不再复述正文、字段或操作教程。只有主人实际确认发送后才能依据回执报告发送结果，不能声称成员已阅读。` }];
            },
            presentationMeta(_args, value) {
                const surface = object(value) ? humanSurface(value.surface) : undefined;
                if (!surface)
                    throw new Error('无效的任务卡片结果');
                return { humanSurface: surface };
            },
        },
        async execute(args, exec) {
            if (!object(args) || !exactKeys(args, ['title', 'body', ...['sourceSurfaceId', 'cover'].filter(key => Object.hasOwn(args, key))])
                || !text(args.title, 80) || !text(args.body, 1000)
                || Object.hasOwn(args, 'cover') && !humanCardAsset(args.cover)
                || Object.hasOwn(args, 'sourceSurfaceId') && (typeof args.sourceSurfaceId !== 'string' || !HUMAN_ID.test(args.sourceSurfaceId)))
                throw new Error('仅支持有效的title、body和可选sourceSurfaceId、cover字段');
            if (!exec.agent?.session || exec.agent.id !== exec.agent.session.id || !Number.isSafeInteger(exec.agent.session.header?.createdAt)
                || !text(exec.callId, 256) || !text(exec.rootCallId, 256))
                throw new Error('此工具需要具有稳定身份的真实DSH会话上下文');
            return { surface: await core.create({ scope: String(exec.agent.session.id), generation: String(exec.agent.session.header.createdAt), callId: String(exec.callId),
                    rootCallId: String(exec.rootCallId) }, args.title, args.body, exec.signal, args.sourceSurfaceId, humanCardAsset(args.cover)) };
        },
    };
}
