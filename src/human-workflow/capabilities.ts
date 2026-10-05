import { copy, fail, identifier } from './data.js'
import { workflowCapabilityContracts } from './capability-contracts.js'

export type CapabilityStatus = 'available' | 'blocked' | 'planned'
export const CAPABILITY_IDS = ['surface.reading-confirmation', 'surface.cover-image', 'action.select-members', 'action.remind-selected-pending',
  'surface.form-collection', 'task.audience-select', 'task.audience-known', 'task.lifecycle', 'task.private-publish', 'task.query', 'recipient.query', 'task.reshare', 'workspace.directory', 'assistant.design', 'mode.packages', 'workflow.records', 'submission.receive', 'submission.file-receive', 'result.private', 'automation.run'] as const
export type CapabilityId = typeof CAPABILITY_IDS[number]
export interface WorkflowCapability {
  id: CapabilityId; version: 1; status: CapabilityStatus; description: string; tools: string[]
  ownerApproval: boolean; reason?: string
}
export interface CapabilityManifest {
  schema: 'human.capabilities.v1'; nodeId: string; version: 1; capabilities: WorkflowCapability[]
  cardKinds: ('reading-confirmation' | 'form-collection')[]; fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number']
  limits: { fields: 12; choices: 12; titleCharacters: 80; bodyCharacters: 1000 }
  /** Legacy limits above describe mode templates, not member collection forms. */
  contracts: ReturnType<typeof workflowCapabilityContracts>
}
export type CapabilityAvailability = Partial<Record<'surface.reading-confirmation' | 'surface.cover-image' | 'action.select-members'
  | 'action.remind-selected-pending' | 'task.query' | 'recipient.query' | 'task.reshare' | 'workspace.directory' | 'assistant.design' | 'surface.form-collection' | 'task.audience-select' | 'task.audience-known' | 'task.lifecycle' | 'task.private-publish' | 'submission.receive' | 'submission.file-receive' | 'result.private' | 'automation.run', { status: CapabilityStatus; reason?: string }>>
const catalog: WorkflowCapability[] = [
  { id: 'surface.reading-confirmation', version: 1, status: 'available', description: '准备公开阅读确认群卡；可引用已准备的公开封面，原生发送仍由主人批准。', tools: ['human_surface_share', 'human_mode_prepare_card'], ownerApproval: true },
  { id: 'surface.cover-image', version: 1, status: 'blocked', description: '安全接入明确选择的当前会话或工作区PNG/JPEG成品，核验格式、去元数据并保存准确图片摘要，上传私有临时封面；Agent可用电脑实际工具制作图片，插件不提供字体、绘制引擎或模板。主人须预览最终图片批准公开，不是自动发群。', tools: ['human_card_cover_prepare'], ownerApproval: true, reason: '需要本机封面资产账本、图片校验与云端临时对象服务。' },
  { id: 'action.select-members', version: 1, status: 'available', description: '主人原生选择既有任务成员；不是全群名册。', tools: ['human_task_select_members'], ownerApproval: true },
  { id: 'action.remind-selected-pending', version: 1, status: 'available', description: '准备提醒主人原生选择的全部未确认参与者；不支持任意子集。参与确认不是表单提交，催交或已发布反馈提醒使用 recipient.query。', tools: ['human_task_remind'], ownerApproval: true },
  { id: 'task.query', version: 1, status: 'blocked', description: '查询当前节点授权任务和参与事实，返回新鲜度。', tools: ['human_task_list', 'human_task_get', 'human_task_participants'], ownerApproval: false, reason: '需要已认证的节点任务同步连接。' },
  { id: 'surface.form-collection', version: 1, status: 'blocked', description: '首发群任务、表单与可选已准备公开封面一同批准发布，图片要求需本机原生收件支持。', tools: ['human_task_create'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'task.audience-select', version: 1, status: 'blocked', description: '首发也可由主人先选群再原生选人，本任务仅所选成员参与；后续轮次不扩大范围，非全群名册。最多20人为当前产品限额。', tools: ['human_task_create'], ownerApproval: true, reason: '需要任务生命周期服务和支持原生名单选择的小程序/云端。' },
  { id: 'task.audience-known', version: 1, status: 'blocked', description: '向来源任务中已明确对应的1..20名成员新建独立任务：来源可为同会话成功任务，或同一真实工作区目录中显式共享、经宿主与云端重新核验的来源任务。复用原群及服务端核实的群身份；无需重复选群选人，仍须主人确认内容和原生发送。共享来源不等于任意跨会话或跨工作区权限。不是成员选择器预选，不枚举全群，不自动@；取得群ID不等于取得群名单。', tools: ['human_task_create', 'human_task_lifecycle'], ownerApproval: true, reason: '需要来源任务、真实成员映射，以及支持known-members的小程序/云端；跨会话来源还须真实工作区目录与新鲜授权核验。' },
  { id: 'task.lifecycle', version: 1, status: 'blocked', description: '查询准确轮次与提交、保存本地分析、准备新轮次审批；服务端在线核验。', tools: ['human_task_lifecycle', 'human_submission_analysis_save', 'human_submission_analysis_list', 'human_task_prepare_round'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'task.private-publish', version: 1, status: 'blocked', description: '依当前真实用户对话执行原会话准确私人方案：个人反馈或有明确对象的补充要求；不发送群卡或@，不用于后台自动发布。宿主验证输入来源，云端验证可撤销会话许可与任务归属。available只表示实现已接入，本回合输入先查human_private_update_status；状态ready不替代云端本次许可核验，不接收模型自报approved。', tools: ['human_private_update_status', 'human_task_publish_private'], ownerApproval: true, reason: '需要可信当前用户输入接入和私人发布服务；当前会话另须主人开启按对话更新私人页面（可关闭，最长7天）。' },
  { id: 'recipient.query', version: 1, status: 'blocked', description: '查询当前任务已知成员的核实身份引用、来源、观察/确认及提交/送达事实。Agent根据用户意图选择准确对象再准备提醒，不强制未交筛选；另提供可选执行时条件筛选。不会导出全群名单、猜姓名或伪造已读。查询只读，发送须主人真实点击。', tools: ['human_task_recipients', 'human_task_prepare_reminder'], ownerApproval: true, reason: '需要任务生命周期服务与对应提醒实现。' },
  { id: 'mode.packages', version: 1, status: 'available', description: '版本化数据模式、预览、主人批准及回退；不增加宿主权限。', tools: ['human_capabilities', 'human_mode_draft', 'human_mode_list', 'human_mode_get', 'human_mode_preview'], ownerApproval: true },
  { id: 'workflow.records', version: 1, status: 'available', description: '持久保存会话内计划和分析引用；不改写参与者事实。', tools: ['human_workflow_save', 'human_workflow_get', 'human_workflow_list'], ownerApproval: false },
  { id: 'workspace.directory', version: 1, status: 'blocked', description: '在真实工作区内按来源同步群及已知成员，维护带来源的业务标注并跨会话查询；不枚举全群，不自动赋予发送权限。', tools: ['human_workspace_directory', 'human_workspace_sync', 'human_workspace_note'], ownerApproval: false, reason: '需要真实原生工作区身份、持久目录和支持工作区来源的群服务。' },
  { id: 'assistant.design', version: 1, status: 'blocked', description: '设计和保存可复用的数据化助手模式，可选模板或自定义完整定义，不要求先安装教师模式。此状态只表示设计工具就绪；原生预设预览和安装支持另由human_assistant_catalog.native核对，安装仍需主人确认。', tools: ['human_assistant_catalog', 'human_assistant_draft', 'human_assistant_get'], ownerApproval: false, reason: '助手设计服务未启用或所需工具尚未注册；原生安装支持须另行核对。' },
  { id: 'task.reshare', version: 1, status: 'blocked', description: '补发原任务或已发布公开收集阶段的入口，保留原内容、对象和提交；不另造任务、不自动提醒，原生发送仍需点击。', tools: ['human_task_reshare'], ownerApproval: true, reason: '需要可核验的原来源及支持独立补发尝试的群服务。' },
  { id: 'submission.receive', version: 1, status: 'blocked', description: '独立离线公钥加密图片，校验后持久收件；用原生图片引用供当前模型读取。', tools: ['human_submission_image'], ownerApproval: false, reason: '需要原生图片存储/解码和任务收件服务。' },
  { id: 'submission.file-receive', version: 1, status: 'blocked', description: '按通用文件合同收取图片或常用文档，校验后持久保存并提供受控本地文件引用；文件不自动执行，收到不等于模型已读或自动分析已支持。', tools: ['human_submission_file'], ownerApproval: false, reason: '需要支持文件清单版本、对应格式校验与受控文件读取的收件器及三端合同。' },
  { id: 'result.private', version: 1, status: 'blocked', description: '个人结果经主人核对发布，服务端按提交者 ACL 返回；云端可读明文结果。', tools: ['human_task_prepare_review'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'automation.run', version: 1, status: 'blocked', description: 'Agent 可提议手动、逐份或指定名单到齐规则，主人精确预览批准后才生效。到齐规则一次冻结版本并逐份分析，不是跨成员汇总；不自动发布、订正或催交。', tools: ['human_automation_rules', 'human_automation_propose'], ownerApproval: true, reason: '需要可核对的原生运行接口和持久自动处理账本。' },
]
export function createCapabilityManifest(nodeId: string, availability: CapabilityAvailability = {}): CapabilityManifest {
  if (!identifier(nodeId)) throw fail('workflow-scope-invalid', '节点标识无效')
  const capabilities = copy(catalog).map(item => {
    const selected = availability[item.id as keyof CapabilityAvailability]
    if (!selected) return item
    if (!['available', 'blocked', 'planned'].includes(selected.status)) throw fail('capability-invalid', '能力状态无效')
    const { reason: _reason, ...base } = item
    return { ...base, status: selected.status, ...(selected.reason ? { reason: selected.reason } : {}) }
  })
  return { schema: 'human.capabilities.v1', nodeId, version: 1, capabilities,
    cardKinds: ['reading-confirmation', ...(capabilities.some(item => item.id === 'surface.form-collection' && item.status === 'available') ? ['form-collection' as const] : [])], fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number'],
    limits: { fields: 12, choices: 12, titleCharacters: 80, bodyCharacters: 1000 }, contracts: workflowCapabilityContracts() }
}
export function availableCapability(manifest: CapabilityManifest, id: string): boolean {
  return manifest.capabilities.some(item => item.id === id && item.version === 1 && item.status === 'available')
}
