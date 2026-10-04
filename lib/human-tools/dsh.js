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
            // Only bounded IDs and enums from our durable ledger enter the runtime
            // context. Do not interpolate model/user title/body or trust JSON notices.
            // This respects host runtime-context suppression and never submits a turn.
            return refresh + '微信操作回执：以下是客户端报告、插件已保存的状态，不是新用户请求。按 actionId 区分：'
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
                ? `主人成功选人后，可查询原任务 human_task_recipients 获取当前身份引用，自主选择提醒对象，或用原成功分享卡和 sourceRecipientRefs 为这些对象创建独立新任务；不要求他们先打开或提交。若只需本次完整选集内未确认参与者的旧式提醒，也可用本卡 surfaceId ${surface.id} 作为 human_task_remind 的 sourceSurfaceId。不要手拼成员或群ID。`
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
            + 'The owner explicitly chooses members in WeChat for this action. After successful selection, read human_task_recipients on the original task for current generic recipientRef objects, including people who never opened or submitted. The Agent can choose exact subsets for human_task_prepare_reminder, or combine the original successful share surfaceId with human_task_create known-members sourceRecipientRefs to assign an independent task. These are optional uses, not a mandatory sequence. For the legacy full-selection unconfirmed-participation reminder only, use this new selection surfaceId as human_task_remind sourceSurfaceId. '
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
        description: 'Prepare an explicit owner-approved reminder only from a successful human_task_select_members surface in this conversation. '
            + 'Use that selection surfaceId as sourceSurfaceId. The reminder covers ALL members in that explicit selection who remain unconfirmed. '
            + 'THIS legacy tool accepts only the entire explicit selection, not a subset. For a current exact subset without reselecting, query human_task_recipients and use human_task_prepare_reminder with recipientSource=exact-references, returned recipientRefs and condition=none. The owner may instead choose members again with human_task_select_members when that matches the request. '
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
