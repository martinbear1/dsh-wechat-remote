import { copy, fail, identifier } from './data.js';
import { workflowCapabilityContracts } from './capability-contracts.js';
export const CAPABILITY_IDS = ['surface.reading-confirmation', 'surface.cover-image', 'action.select-members', 'action.remind-selected-pending',
    'surface.form-collection', 'task.audience-select', 'task.audience-known', 'task.lifecycle', 'task.query', 'recipient.query', 'mode.packages', 'workflow.records', 'submission.receive', 'result.private', 'automation.run'];
const catalog = [
    { id: 'surface.reading-confirmation', version: 1, status: 'available', description: '准备公开阅读确认群卡；可引用已准备的公开封面，原生发送仍由主人批准。', tools: ['human_surface_share', 'human_mode_prepare_card'], ownerApproval: true },
    { id: 'surface.cover-image', version: 1, status: 'blocked', description: '安全接入明确选择的当前会话或工作区PNG/JPEG成品，核验格式、去元数据并保存准确图片摘要，上传私有临时封面；Agent可用电脑实际工具制作图片，插件不提供字体、绘制引擎或模板。主人须预览最终图片批准公开，不是自动发群。', tools: ['human_card_cover_prepare'], ownerApproval: true, reason: '需要本机封面资产账本、图片校验与云端临时对象服务。' },
    { id: 'action.select-members', version: 1, status: 'available', description: '主人原生选择既有任务成员；不是全群名册。', tools: ['human_task_select_members'], ownerApproval: true },
    { id: 'action.remind-selected-pending', version: 1, status: 'available', description: '准备提醒主人原生选择的全部未确认成员；不支持任意子集。', tools: ['human_task_remind'], ownerApproval: true },
    { id: 'task.query', version: 1, status: 'blocked', description: '查询当前节点授权任务和参与事实，返回新鲜度。', tools: ['human_task_list', 'human_task_get', 'human_task_participants'], ownerApproval: false, reason: '需要已认证的节点任务同步连接。' },
    { id: 'surface.form-collection', version: 1, status: 'blocked', description: '首发群任务、表单与可选已准备公开封面一同批准发布，图片要求需本机原生收件支持。', tools: ['human_task_create'], ownerApproval: true, reason: '需要任务生命周期服务。' },
    { id: 'task.audience-select', version: 1, status: 'blocked', description: '首发也可由主人先选群再原生选人，本任务仅所选成员参与；后续轮次不扩大范围，非全群名册。最多20人为当前产品限额。', tools: ['human_task_create'], ownerApproval: true, reason: '需要任务生命周期服务和支持原生名单选择的小程序/云端。' },
    { id: 'task.audience-known', version: 1, status: 'blocked', description: '向同会话来源任务中已明确对应的1..20名成员新建独立任务，复用原群及服务端核实的群身份；无需重复选群选人，仍须主人确认内容和原生发送。不是成员选择器预选，不枚举全群，不自动@；取得群ID不等于取得群名单。', tools: ['human_task_create', 'human_task_lifecycle'], ownerApproval: true, reason: '需要来源任务、真实成员映射，以及支持known-members的小程序/云端。' },
    { id: 'task.lifecycle', version: 1, status: 'blocked', description: '查询准确轮次与提交、保存本地分析、准备新轮次审批；服务端在线核验。', tools: ['human_task_lifecycle', 'human_submission_analysis_save', 'human_submission_analysis_list', 'human_task_prepare_round'], ownerApproval: true, reason: '需要任务生命周期服务。' },
    { id: 'recipient.query', version: 1, status: 'blocked', description: '按当前未交/已发布反馈事实固定精确对象；或复用已发布指定任务的固定名单提醒尚未打开/未提交者。独立主人点击发送原生@和任务链接，不是发卡附带参数，不枚举全群。', tools: ['human_task_prepare_reminder'], ownerApproval: true, reason: '需要任务生命周期服务与对应提醒实现。' },
    { id: 'mode.packages', version: 1, status: 'available', description: '版本化数据模式、预览、主人批准及回退；不增加宿主权限。', tools: ['human_capabilities', 'human_mode_draft', 'human_mode_list', 'human_mode_get', 'human_mode_preview'], ownerApproval: true },
    { id: 'workflow.records', version: 1, status: 'available', description: '持久保存会话内计划和分析引用；不改写参与者事实。', tools: ['human_workflow_save', 'human_workflow_get', 'human_workflow_list'], ownerApproval: false },
    { id: 'submission.receive', version: 1, status: 'blocked', description: '独立离线公钥加密图片，校验后持久收件；用原生图片引用供当前模型读取。', tools: ['human_submission_image'], ownerApproval: false, reason: '需要原生图片存储/解码和任务收件服务。' },
    { id: 'result.private', version: 1, status: 'blocked', description: '个人结果经主人核对发布，服务端按提交者 ACL 返回；云端可读明文结果。', tools: ['human_task_prepare_review'], ownerApproval: true, reason: '需要任务生命周期服务。' },
    { id: 'automation.run', version: 1, status: 'blocked', description: 'Agent 可提议手动、逐份或指定名单到齐规则，主人精确预览批准后才生效。到齐规则一次冻结版本并逐份分析，不是跨成员汇总；不自动发布、订正或催交。', tools: ['human_automation_rules', 'human_automation_propose'], ownerApproval: true, reason: '需要可核对的原生运行接口和持久自动处理账本。' },
];
export function createCapabilityManifest(nodeId, availability = {}) {
    if (!identifier(nodeId))
        throw fail('workflow-scope-invalid', '节点标识无效');
    const capabilities = copy(catalog).map(item => {
        const selected = availability[item.id];
        if (!selected)
            return item;
        if (!['available', 'blocked', 'planned'].includes(selected.status))
            throw fail('capability-invalid', '能力状态无效');
        const { reason: _reason, ...base } = item;
        return { ...base, status: selected.status, ...(selected.reason ? { reason: selected.reason } : {}) };
    });
    return { schema: 'human.capabilities.v1', nodeId, version: 1, capabilities,
        cardKinds: ['reading-confirmation', ...(capabilities.some(item => item.id === 'surface.form-collection' && item.status === 'available') ? ['form-collection'] : [])], fieldKinds: ['short-text', 'long-text', 'choice', 'boolean', 'number'],
        limits: { fields: 12, choices: 12, titleCharacters: 80, bodyCharacters: 1000 }, contracts: workflowCapabilityContracts() };
}
export function availableCapability(manifest, id) {
    return manifest.capabilities.some(item => item.id === id && item.version === 1 && item.status === 'available');
}
