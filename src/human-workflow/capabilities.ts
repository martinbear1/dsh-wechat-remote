import { copy, fail, identifier } from './data.js'

export type CapabilityStatus = 'available' | 'blocked' | 'planned'
export const CAPABILITY_IDS = ['surface.reading-confirmation', 'action.select-members', 'action.remind-selected-pending',
  'task.query', 'recipient.query', 'mode.packages', 'workflow.records', 'submission.receive', 'result.private', 'automation.run'] as const
export type CapabilityId = typeof CAPABILITY_IDS[number]
export interface WorkflowCapability {
  id: CapabilityId; version: 1; status: CapabilityStatus; description: string; tools: string[]
  ownerApproval: boolean; reason?: string
}
export interface CapabilityManifest {
  schema: 'human.capabilities.v1'; nodeId: string; version: 1; capabilities: WorkflowCapability[]
  cardKinds: ['reading-confirmation']; fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number']
  limits: { fields: 12; choices: 12; titleCharacters: 80; bodyCharacters: 1000 }
}
export type CapabilityAvailability = Partial<Record<'surface.reading-confirmation' | 'action.select-members'
  | 'action.remind-selected-pending' | 'task.query' | 'recipient.query', { status: CapabilityStatus; reason?: string }>>
const catalog: WorkflowCapability[] = [
  { id: 'surface.reading-confirmation', version: 1, status: 'available', description: '准备公开阅读确认群卡；原生发送仍由主人批准。', tools: ['human_surface_share', 'human_mode_prepare_card'], ownerApproval: true },
  { id: 'action.select-members', version: 1, status: 'available', description: '主人原生选择既有任务成员；不是全群名册。', tools: ['human_task_select_members'], ownerApproval: true },
  { id: 'action.remind-selected-pending', version: 1, status: 'available', description: '准备提醒主人原生选择的全部未确认成员；不支持任意子集。', tools: ['human_task_remind'], ownerApproval: true },
  { id: 'task.query', version: 1, status: 'blocked', description: '查询当前节点授权任务和参与事实，返回新鲜度。', tools: ['human_task_list', 'human_task_get', 'human_task_participants'], ownerApproval: false, reason: '需要已认证的节点任务同步连接。' },
  { id: 'recipient.query', version: 1, status: 'planned', description: '按事实条件固定精确对象并准备批准动作。', tools: ['human_task_prepare_action'], ownerApproval: true, reason: '条件对象快照和执行契约尚未接入。' },
  { id: 'mode.packages', version: 1, status: 'available', description: '版本化数据模式、预览、主人批准及回退；不增加宿主权限。', tools: ['human_capabilities', 'human_mode_draft', 'human_mode_list', 'human_mode_get', 'human_mode_preview'], ownerApproval: true },
  { id: 'workflow.records', version: 1, status: 'available', description: '持久保存会话内计划和分析引用；不改写参与者事实。', tools: ['human_workflow_save', 'human_workflow_get', 'human_workflow_list'], ownerApproval: false },
  { id: 'submission.receive', version: 1, status: 'planned', description: '群成员附件接收、校验与持久交付。', tools: [], ownerApproval: false, reason: '尚未实现群任务附件接收。' },
  { id: 'result.private', version: 1, status: 'blocked', description: '个人结果按服务端 ACL 私密发布。', tools: [], ownerApproval: true, reason: '私密发布授权和附件交付尚未开放。' },
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
    cardKinds: ['reading-confirmation'], fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number'],
    limits: { fields: 12, choices: 12, titleCharacters: 80, bodyCharacters: 1000 } }
}
export function availableCapability(manifest: CapabilityManifest, id: string): boolean {
  return manifest.capabilities.some(item => item.id === id && item.version === 1 && item.status === 'available')
}
