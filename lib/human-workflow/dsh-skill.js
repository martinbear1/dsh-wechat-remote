/** Trusted package instructions, not generated executable code. Profession
 * templates may reference this skill; task data never rewrites its protocol. */
export const HUMAN_WORKFLOW_SKILL = {
    name: 'human-workflow',
    description: '为当前工作设计群任务规则、逐步收集工作资料、准备需要主人确认的群卡，并查询成员参与事实。',
    whenToUse: '用户希望借助微信群任务收集反馈、协助日常工作，或要求创建可复用的群任务模式时。不限职业。',
    source: 'bundled', provider: 'harness-remote-human-workflow',
    invocation: { modelInvocable: true, userInvocable: true },
    content: `# 群工作流工具使用方法

先调用 human_capabilities，按当前节点实际可用的能力工作。blocked 和 planned 不是已实现功能，不编造对应按钮或结果。

## 分清模板与具体工作

DSH 原生 preset 是职业工作方法、提示词和原生插件组合。human_mode_* 管理的是群任务规则包，不是创建 DSH preset 的接口。不得把建立任务模式说成已创建职业预设。

同一职业模板可以复用，具体用户、班级或项目的资料必须放在独立工作记录中。即使目录名或 preset 一样，也不能借用其他会话、节点或角色的数据。跨会话业务加入目前尚未开放。

## 创建和启用任务规则

1. 了解用户目标、参与者需要做什么、哪些资料公开。只问完成当前步骤必要的问题。
2. 用 human_mode_draft 按工具声明的固定字段建立规则包；用 onboarding 描述逐步询问的问题，不把真实班级或客户资料写进可复用模板。
3. 用 human_mode_preview 校验能力、字段和卡片映射。说明等待主人在手机群任务模式页预览批准，Agent 没有自批工具。
4. 调用 human_mode_list/get 确认本会话已激活的准确 id、version、digest。不要假设生成草稿就已启用。

## 形成具体工作记忆

使用 human_workflow_save 保存用户确认的信息、计划和分析，使用 CAS expectedRevision 更新。新建记录绑定主人启用的模式版本。读取 human_workflow_get/list 恢复资料，按照 pending onboarding 问题继续询问，不要求用户一次填完整张表。

这些记录是业务资料和 Agent 分析，不是成员确认、上传或电脑收件的事实。姓名是用户自述资料，不是已核实身份。当前没有成员自助登记表单、附件收件、目录自动初始化或授权自动运行，不声称已经完成这些动作。

## 用真实工具出卡

调用 human_mode_prepare_card，使用扁平参数 id、version、digest、values；不要像 human_workflow_save 新建时那样嵌套在 mode 对象里。values 符合 inputSchema。工具生成 humanSurface；正常结束最终回复，提示主人检查并点击发送。不手拼 JSON、Markdown 或链接冒充可执行按钮，不生成 JS、WXML 或任意回调地址。

首次分享由主人选择群；同会话已有成功卡片可传 sourceSurfaceId 复用原任务群。分享回执只表示原生调用结果，不代表成员已收到或完成。不能自动重试结果不明的分享或提醒。

## 根据事实继续工作

使用 human_task_list/get/participants 查询本会话授权任务。明确 freshness 是否最新；缓存过期时不能断言当前完成状态。人数仅为实际观察到的参与者，不是全群名单；不把主人算入参与者完成率。

用 human_task_select_members 准备主人原生选人，再用 human_task_remind 准备向该完整选集内未确认者的提醒。两步都等待明确批准，不猜姓名、群 ID 或成员 ID，不擅自缩小或扩张旧批准范围。

分析可引用已同步的任务和准确版本，再保存为工作记录。计划、分析、操作回执和成员事实分别说明，不能混称任务完成。不自动唤醒被停止的 Agent，不把系统回调写成用户新消息。
`,
};
/** Older hosts without the native skill seam retain the typed tools. Do not
 * invent filesystem roots or install another skill implementation for them. */
export function registerHumanWorkflowSkill(host) {
    const skills = host.get('skills');
    if (typeof skills?.register !== 'function')
        return;
    return skills.register(HUMAN_WORKFLOW_SKILL);
}
