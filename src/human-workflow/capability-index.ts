/** A discoverable inventory, not a workflow runner or an authorization grant.
 * Keep unavailable platform primitives visible without inventing executable tools. */
import type { CapabilityId, CapabilityManifest } from './capabilities.js'
import { fail } from './data.js'

export const CAPABILITY_CATEGORIES = ['groups', 'members', 'messages', 'collection', 'files', 'presentation', 'facts', 'feedback', 'automation', 'workspace'] as const
export type CapabilityCategory = typeof CAPABILITY_CATEGORIES[number]
type Feature = {
  id: string; category: CapabilityCategory; purpose: string; tools: string[]
  requires?: CapabilityId[]; implementation?: 'planned' | 'native-ui-only' | 'not-in-public-contract'
  inputs?: string[]; result: string; userAction: string; boundary: string
}
const features: Feature[] = [
  { id: 'group.choose', category: 'groups', purpose: '首次选择目标群', tools: ['human_task_create', 'human_surface_share'], requires: ['surface.reading-confirmation'],
    inputs: ['omit sourceSurfaceId'], result: 'verified-original-group-context', userAction: 'native-group-selection-and-send-confirmation',
    boundary: '选择并验证群后即可取得群和当前操作者的群内身份，不必等其他成员点卡；选择群不等于已发卡。' },
  { id: 'group.reuse', category: 'groups', purpose: '复用已验证的原群，不重新选群', tools: ['human_task_create', 'human_surface_share'], requires: ['surface.reading-confirmation', 'task.query'],
    inputs: ['same-session successful sourceSurfaceId OR verified workspaceSourceId'], result: 'new-operation-in-original-group', userAction: 'native-send-confirmation',
    boundary: '复用群与新建/延续任务是独立选择；来源卡不是原任务链接替身，也不带来全群名单。' },
  { id: 'group.roster-enumerate', category: 'groups', purpose: '自动导出整群成员及总人数', tools: [], implementation: 'not-in-public-contract',
    result: 'unavailable', userAction: 'none', boundary: '当前公开接口未提供整群枚举。微信卡面人数和开放数据昵称渲染不是可导出的名册。' },
  { id: 'member.observe', category: 'members', purpose: '查询当前任务实际观察到的参与者', tools: ['human_task_participants', 'human_task_lifecycle'], requires: ['task.query'],
    result: 'observed-participant-references', userAction: 'member-enters-and-verifies-group-identity', boundary: '只代表真实记录过的成员；不得补全未知成员、猜姓名或把本人群内ID跨群复用。' },
  { id: 'member.select', category: 'members', purpose: '让主人原生选择成员', tools: ['human_task_select_members', 'human_task_create'], requires: ['action.select-members'],
    inputs: ['existing taskRef or initialRound.audience=owner-select'], result: 'selected-member-references', userAction: 'native-member-selection',
    boundary: '只返回实际所选成员，不要求被选者先打开卡片；不是获取全群名册，选择器无默认勾选名单参数。' },
  { id: 'member.facts', category: 'members', purpose: '查询身份引用、来源及关联事实，供Agent决定后续操作', tools: ['human_task_recipients', 'human_task_lifecycle'], requires: ['recipient.query'],
    inputs: ['taskRef', 'optional roundId', 'offset + snapshot'], result: 'stable-group-member-identities-plus-scoped-action-references-and-evidence', userAction: 'none',
    boundary: 'identity.groupRef/memberRef可用于同授权范围的长期记录与关联，recipientRef绑定当前任务及来源用于动作；两者不能互换。服务端核实群身份，不按姓名猜关联。已知集合不等于全群；观察、确认、提交、送达分别报告，不提供假已读或永久群籍保证。' },
  { id: 'member.directory', category: 'members', purpose: '管理同工作区可核对、可更正的跨任务成员资料', tools: ['human_workspace_directory', 'human_workspace_sync', 'human_workspace_note'], requires: ['workspace.directory'],
    inputs: ['sourceSurfaceId OR workspaceSourceId', 'groupRef/memberRef', 'expectedRevision'], result: 'workspace-scoped-source-facts-and-separate-business-notes', userAction: 'scope-and-name-association-confirmation-when-needed',
    boundary: '目录缓存带来源、时间与覆盖范围；不是全群枚举、实时退群同步或发送权限。业务标注不能改微信身份，跨会话来源由真实工作区核验。' },
  { id: 'audience.all', category: 'members', purpose: '让原群全体成员参与本任务', tools: ['human_task_create'], requires: ['surface.form-collection'],
    inputs: ['initialRound.audience=all-group'], result: 'group-wide-task-audience', userAction: 'native-share-confirmation', boundary: '全群参与资格不是全员ID列表，也不等于已@全员。' },
  { id: 'audience.known', category: 'members', purpose: '把新独立事项交给已准确对应的同群成员', tools: ['human_task_create', 'human_task_recipients', 'human_task_lifecycle'], requires: ['task.audience-known'],
    inputs: ['sourceSurfaceId OR workspaceSourceId', 'initialRound.audience=known-members', 'initialRound.sourceRecipientRefs OR legacy sourceParticipantRefs'], result: 'new-task-with-verified-recipient-audience', userAction: 'native-share-confirmation',
    boundary: '无需重复选群选人；原群、来源任务、身份对应和选择版本必须有效。已原生选中但尚未打开的人也可按准确引用使用；不因此伪造参与记录。群聊中的标题和封面对群可见，不可放私人评价。' },
  { id: 'message.reading', category: 'messages', purpose: '发布需要阅读确认的独立通知', tools: ['human_surface_share'], requires: ['surface.reading-confirmation'],
    result: 'new-reading-confirmation-task', userAction: 'native-share-confirmation', boundary: '会新建独立事项。不要把它当重新分享旧作业入口，更不要为单纯催交额外要求阅读确认。' },
  { id: 'message.remind-participation', category: 'messages', purpose: '提醒已选择但尚未确认参与者', tools: ['human_task_select_members', 'human_task_remind'], requires: ['action.remind-selected-pending'],
    inputs: ['selectionRef'], result: 'separate-native-mentions-and-link', userAction: 'native-send-tap', boundary: '过滤的是参与确认，不是作业提交；一条原生消息可含多个目标，不应说成每人发一条。' },
  { id: 'message.remind-exact', category: 'messages', purpose: '向Agent按用户意图选定的准确成员发送原生提醒', tools: ['human_task_recipients', 'human_task_prepare_reminder'], requires: ['recipient.query'],
    inputs: ['recipientSource=exact-references', 'recipientRefs', 'condition=none', 'type=complete|participate', 'roundId or null'], result: 'separate-native-mentions-and-original-task-link', userAction: 'exact-member-native-preview-and-send-tap',
    boundary: '允许已知集合中的明确子集，不自动筛未交或未读；底层只核实当前身份、原群、权限和内容可见范围。原生群内昵称展示不向Agent导出名单。' },
  { id: 'message.remind-submission', category: 'messages', purpose: '可选：执行时再按提交或反馈事实筛选提醒对象', tools: ['human_task_lifecycle', 'human_task_prepare_reminder'], requires: ['recipient.query'],
    inputs: ['roundId', 'condition', 'participantRefs OR recipientSource'], result: 'separate-native-mentions-and-original-task-link', userAction: 'native-send-tap',
    boundary: '这是可选条件组合，不是唯一提醒入口或固定业务顺序。目标来源与条件分别核实；群卡发送成功、草稿已批准都不是提醒已发出的证据。' },
  { id: 'message.reshare-existing', category: 'messages', purpose: '再次把同一已有任务的原入口发到群里', tools: ['human_task_reshare'], requires: ['task.reshare'],
    inputs: ['sourceSurfaceId OR workspaceSourceId', 'roundId or null'], result: 'independent-share-attempt-for-existing-task', userAction: 'native-share-confirmation', boundary: '保留原内容、对象及提交；不能用human_surface_share替代，它会新建阅读确认事项。私密轮次不群发，发送未知不自动重试。' },
  { id: 'message.mention-all', category: 'messages', purpose: '不提供具体名单直接@全员', tools: [], implementation: 'not-in-public-contract',
    result: 'unavailable', userAction: 'none', boundary: 'notifyGroupMembers需要具体群内ID数组，没有公开的@all参数；全群参与范围不能当作提醒名单。' },
  { id: 'message.share-and-mention-one-call', category: 'messages', purpose: '一次原生调用同时发卡并附带真实@', tools: [], implementation: 'not-in-public-contract',
    result: 'unavailable-as-one-call', userAction: 'separate-native-actions', boundary: '发卡和原生提醒为不同接口；不能把封面上画@当通知，也不能承诺跨页面一次手势有效。' },
  { id: 'message.group-todo', category: 'messages', purpose: '设置微信群待办', tools: [], implementation: 'native-ui-only',
    result: 'wechat-managed-todo', userAction: 'eligible-user-sets-in-wechat', boundary: '未提供Agent自动勾选入口；待办聚合ID不是自动设置权限。' },
  { id: 'collection.create', category: 'collection', purpose: '创建独立的通用资料收集任务', tools: ['human_task_create'], requires: ['surface.form-collection'],
    inputs: ['title', 'body', 'initialRound'], result: 'new-independent-task-and-first-collection', userAction: 'exact-content-and-native-share-confirmation',
    boundary: '同会话可并存多个任务；职业名称不决定表单和流程。只收本次所需字段，不能擅自补要求或改截止时间。' },
  { id: 'collection.fields', category: 'collection', purpose: '组合文本、单多选、布尔、数字、日期、时间和条件字段', tools: ['human_task_create', 'human_task_prepare_round'], requires: ['surface.form-collection'],
    result: 'validated-data-only-form', userAction: 'member-fills-required-inputs', boundary: '字段、条件和展示可组合；不是下发任意JS/HTML，也不要求使用全部字段。' },
  { id: 'collection.continue', category: 'collection', purpose: '为同一事项补交或订正', tools: ['human_task_prepare_round', 'human_task_prepare_review'], requires: ['task.lifecycle'],
    result: 'additional-collection-in-existing-task', userAction: 'owner-publishes-exact-requirements', boundary: '更新原任务不自动发消息；新的独立事项不能因认识成员而塞入旧任务。' },
  { id: 'file.image', category: 'files', purpose: '收取并查看图片附件', tools: ['human_task_create', 'human_task_prepare_round', 'human_task_prepare_review', 'human_submission_image'], requires: ['submission.receive'],
    inputs: ['form.attachment kind=image'], result: 'accepted-then-durably-received-image', userAction: 'member-selects-and-submits', boundary: '图片须完整解码校验；服务端已提交与电脑已收到分别记录，收到不等于已分析。' },
  { id: 'file.document', category: 'files', purpose: '按任务接受图片或常用文档文件', tools: ['human_task_create', 'human_task_prepare_round', 'human_task_prepare_review', 'human_submission_file'], requires: ['submission.file-receive'],
    inputs: ['human.form.v3', 'attachment.kind=file', 'attachment.mediaTypes'], result: 'accepted-then-durably-received-file', userAction: 'member-selects-and-submits',
    boundary: '新任务、同任务补交、私密订正均支持同一v3文件合同；Word指DOCX，不含旧DOC。v1/v2只有图片不是全局限制。样式在form.presentation，字段校验错误不等于收件能力缺失，不能静默降级用户要求。仍以接收器声明为准；文件不执行宏/脚本，收到不证明已阅读或后台能分析。' },
  { id: 'file.multiple', category: 'files', purpose: '一次提交多份附件', tools: [], implementation: 'planned', result: 'not-implemented', userAction: 'none',
    boundary: '当前单附件合同，不得拼虚假上传字段或把ZIP当作已支持的多附件。' },
  { id: 'file.audio-video', category: 'files', purpose: '收取音频视频', tools: [], implementation: 'planned', result: 'not-implemented', userAction: 'none',
    boundary: '需要独立大小、类型、传输和读取合同，不因微信有选择API便宣称产品已支持。' },
  { id: 'presentation.cover', category: 'presentation', purpose: '使用主题相关的授权封面图片', tools: ['human_card_cover_prepare', 'human_task_create', 'human_surface_share'], requires: ['surface.cover-image'],
    inputs: ['authorized workspace image or current-session attachment'], result: 'validated-immutable-public-cover', userAction: 'owner-confirms-exact-public-image',
    boundary: 'Agent用电脑实际工具制作；不捆绑字体/模板/生图器。封面像素不改变群卡原生布局、权限和提醒。' },
  { id: 'presentation.page', category: 'presentation', purpose: '按当前任务组合简洁的内页', tools: ['human_task_create', 'human_task_prepare_round'], requires: ['surface.form-collection'],
    result: 'supported-fields-sections-theme-and-blocks', userAction: 'normal-task-action', boundary: '展示不产生权限或状态；提交状态由服务事实决定，不能被completionText覆盖。' },
  { id: 'facts.task', category: 'facts', purpose: '查看已授权任务和参与记录', tools: ['human_task_list', 'human_task_get', 'human_task_participants'], requires: ['task.query'],
    result: 'freshness-and-observed-coverage', userAction: 'none', boundary: '观察人数不是应交人数；confirmedCount不是提交数。' },
  { id: 'facts.submission', category: 'facts', purpose: '查看实际提交、送达和提醒结果', tools: ['human_task_lifecycle'], requires: ['task.lifecycle'],
    result: 'accepted-received-published-and-notification-facts', userAction: 'none', boundary: '只有accepted提交记录可用于交件统计；参加、点开、已读、已提交、已收到、已分析互不代替。' },
  { id: 'feedback.local-analysis', category: 'feedback', purpose: '保存本地分析草案', tools: ['human_submission_analysis_save', 'human_submission_analysis_list'], requires: ['task.lifecycle'],
    result: 'private-local-analysis', userAction: 'none', boundary: '必须先取得实际资料再分析；草案不是成员事实，也不是已发布反馈。' },
  { id: 'feedback.private-publication', category: 'feedback', purpose: '向对应提交者发布私人反馈', tools: ['human_task_prepare_review'], requires: ['result.private'],
    result: 'owner-and-author-visible-feedback', userAction: 'owner-confirms-exact-feedback', boundary: '不在群封面显示评价；发布反馈不自动通知，订正输入只在确需再次提交时添加。' },
  { id: 'automation.processing', category: 'automation', purpose: '按批准的规则处理资料', tools: ['human_automation_rules', 'human_automation_propose'], requires: ['automation.run'],
    inputs: ['manual OR per-submission OR all-recipients'], result: 'bounded-local-analysis-and-feedback-drafts', userAction: 'explicit-revocable-policy-approval',
    boundary: '指定名单到齐为逐份处理，不是全班汇总；资料类型与模型读取能力另检，不自动发布或催交。' },
  { id: 'automation.deadline', category: 'automation', purpose: '到截止时统一整理处理', tools: [], implementation: 'planned', result: 'not-implemented', userAction: 'none',
    boundary: '当前没有此触发器；普通会话承诺不是持久定时机制。' },
  { id: 'automation.publish', category: 'automation', purpose: '预授权自动发布反馈', tools: [], implementation: 'planned', result: 'not-implemented', userAction: 'separate-future-publication-policy',
    boundary: '分析许可不等于发布许可；需要独立可撤销、版本绑定的发布策略。' },
  { id: 'workspace.records', category: 'workspace', purpose: '保存会话内工作记录与可复用规则', tools: ['human_workflow_save', 'human_workflow_get', 'human_mode_draft', 'human_mode_get'], requires: ['workflow.records', 'mode.packages'],
    result: 'scoped-records-and-optional-rule-packages', userAction: 'mode-activation-only-when-used', boundary: '通用工具不要求教师预设或先造模式；模板可复用，真实会话资料/群权限不因同preset共享。' },
  { id: 'workspace.directory', category: 'workspace', purpose: '让同一真实工作区的会话共享已整理的群和人员资料', tools: ['human_workspace_directory', 'human_workspace_sync', 'human_workspace_note'], requires: ['workspace.directory'],
    result: 'durable-versioned-workspace-directory', userAction: 'business-scope-confirmation-when-needed', boundary: '按节点绑定、真实工作区和来源会话核验；私有实例记忆不自动共享，缓存不作为永久执行凭证。' },
  { id: 'workspace.assistant-design', category: 'workspace', purpose: '从自然语言需求创造可复用职业或助手设计者模式', tools: ['human_assistant_catalog', 'human_assistant_draft', 'human_assistant_get'],
    inputs: ['templateId OR complete data-only definition'], result: 'versioned-reusable-assistant-definition', userAction: 'native-preset-preview-and-install', boundary: '不限内置职业；实际安装取决于原生宿主支持。模式继承通用工具方法，不复制个人资料、不提升权限、不自动执行业务。' },
]

export function capabilityCatalog(manifest: CapabilityManifest, category?: unknown, detail: unknown = 'summary') {
  if (category !== undefined && !CAPABILITY_CATEGORIES.includes(category as CapabilityCategory)
    || !['summary', 'full'].includes(String(detail))) throw fail('capability-query-invalid', '请选择有效的能力分类和详情级别')
  const entries = features.filter(item => category === undefined || item.category === category).map(item => {
    const dependencies = (item.requires || []).map(id => manifest.capabilities.find(capability => capability.id === id))
    const ready = dependencies.every(capability => capability?.status === 'available')
    const status = item.implementation || (ready ? 'available' : 'blocked')
    const base = { id: item.id, category: item.category, purpose: item.purpose, status, tools: item.tools,
      ...(status === 'blocked' ? { reason: dependencies.filter(capability => capability?.status !== 'available').map(capability => capability?.reason || '所需节点能力尚未就绪').join('；') } : {}) }
    return detail === 'summary' ? base : { ...base, requires: item.requires || [], inputs: item.inputs || [],
      result: item.result, userAction: item.userAction, boundary: item.boundary }
  })
  return structuredClone({ schema: 'human.capability.catalog.v1', categories: [...CAPABILITY_CATEGORIES], category: category || null,
    statusMeaning: 'node-implementation-not-device-verification-or-authorization', platformReadiness: 'per-operation-unknown',
    reusableAcrossPresets: true, sharesOtherSessionAuthority: false, fixedWorkflow: false,
    entries, ...(detail === 'full' ? { contracts: categoryContracts(manifest, category as CapabilityCategory | undefined) } : {}) })
}

function categoryContracts(manifest: CapabilityManifest, category?: CapabilityCategory) {
  const c = manifest.contracts
  if (!category) return c
  const common = { platformReadiness: c.platformReadiness, workflow: c.workflow }
  switch (category) {
    case 'groups': case 'members': return { ...common, audience: c.audience, recipientFacts: c.recipientFacts, workspaceDirectory: c.workspaceDirectory }
    case 'messages': return { ...common, reminders: c.reminders, reshare: c.reshare, messageCard: c.presentation.messageCard }
    case 'collection': case 'files': return { ...common, memberForm: c.memberForm }
    case 'presentation': return { ...common, presentation: c.presentation }
    case 'automation': case 'feedback': return { ...common, processing: c.processing, workflowPreview: c.workflowPreview }
    case 'workspace': return { ...common, modeTemplate: c.modeTemplate, workspaceDirectory: c.workspaceDirectory }
    case 'facts': return { ...common, recipientFacts: c.recipientFacts }
  }
}
