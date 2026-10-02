import { copy, fail, identifier } from './data.js'

export type CapabilityStatus = 'available' | 'blocked' | 'planned'
export const CAPABILITY_IDS = ['surface.reading-confirmation', 'action.select-members', 'action.remind-selected-pending',
  'surface.form-collection', 'task.lifecycle', 'task.query', 'recipient.query', 'mode.packages', 'workflow.records', 'submission.receive', 'result.private', 'automation.run'] as const
export type CapabilityId = typeof CAPABILITY_IDS[number]
export interface WorkflowCapability {
  id: CapabilityId; version: 1; status: CapabilityStatus; description: string; tools: string[]
  ownerApproval: boolean; reason?: string
}
export interface CapabilityManifest {
  schema: 'human.capabilities.v1'; nodeId: string; version: 1; capabilities: WorkflowCapability[]
  cardKinds: ('reading-confirmation' | 'form-collection')[]; fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number']
  limits: { fields: 12; choices: 12; titleCharacters: 80; bodyCharacters: 1000 }
}
export type CapabilityAvailability = Partial<Record<'surface.reading-confirmation' | 'action.select-members'
  | 'action.remind-selected-pending' | 'task.query' | 'recipient.query' | 'surface.form-collection' | 'task.lifecycle' | 'submission.receive' | 'result.private', { status: CapabilityStatus; reason?: string }>>
const catalog: WorkflowCapability[] = [
  { id: 'surface.reading-confirmation', version: 1, status: 'available', description: '准备公开阅读确认群卡；原生发送仍由主人批准。', tools: ['human_surface_share', 'human_mode_prepare_card'], ownerApproval: true },
  { id: 'action.select-members', version: 1, status: 'available', description: '主人原生选择既有任务成员；不是全群名册。', tools: ['human_task_select_members'], ownerApproval: true },
  { id: 'action.remind-selected-pending', version: 1, status: 'available', description: '准备提醒主人原生选择的全部未确认成员；不支持任意子集。', tools: ['human_task_remind'], ownerApproval: true },
  { id: 'task.query', version: 1, status: 'blocked', description: '查询当前节点授权任务和参与事实，返回新鲜度。', tools: ['human_task_list', 'human_task_get', 'human_task_participants'], ownerApproval: false, reason: '需要已认证的节点任务同步连接。' },
  { id: 'surface.form-collection', version: 1, status: 'blocked', description: '首发群任务与固定表单一同批准发布，图片要求需本机原生收件支持。', tools: ['human_task_create'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'task.lifecycle', version: 1, status: 'blocked', description: '查询准确轮次与提交、保存本地分析、准备新轮次审批；服务端在线核验。', tools: ['human_task_lifecycle', 'human_submission_analysis_save', 'human_submission_analysis_list', 'human_task_prepare_round'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'recipient.query', version: 1, status: 'blocked', description: '按当前轮次未交/已发布反馈事实固定精确对象，主人审核后再原生提醒。', tools: ['human_task_prepare_reminder'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'mode.packages', version: 1, status: 'available', description: '版本化数据模式、预览、主人批准及回退；不增加宿主权限。', tools: ['human_capabilities', 'human_mode_draft', 'human_mode_list', 'human_mode_get', 'human_mode_preview'], ownerApproval: true },
  { id: 'workflow.records', version: 1, status: 'available', description: '持久保存会话内计划和分析引用；不改写参与者事实。', tools: ['human_workflow_save', 'human_workflow_get', 'human_workflow_list'], ownerApproval: false },
  { id: 'submission.receive', version: 1, status: 'blocked', description: '独立离线公钥加密图片，校验后持久收件；用原生图片引用供当前模型读取。', tools: ['human_submission_image'], ownerApproval: false, reason: '需要原生图片存储/解码和任务收件服务。' },
  { id: 'result.private', version: 1, status: 'blocked', description: '个人结果经主人核对发布，服务端按提交者 ACL 返回；云端可读明文结果。', tools: ['human_task_prepare_review'], ownerApproval: true, reason: '需要任务生命周期服务。' },
  { id: 'automation.run', version: 1, status: 'planned', description: '主人策略批准后的自动模型处理。', tools: [], ownerApproval: true, reason: '当前只支持用户发起的 Agent 工作，不自动唤醒。' },
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
    limits: { fields: 12, choices: 12, titleCharacters: 80, bodyCharacters: 1000 } }
}
export function availableCapability(manifest: CapabilityManifest, id: string): boolean {
  return manifest.capabilities.some(item => item.id === id && item.version === 1 && item.status === 'available')
}
