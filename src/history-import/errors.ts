// Only known data/operation codes may cross into the phone's UI or receipts.
// Unknown exceptions can contain source text, paths or credentials.
import { MAX_SHARE_BYTES, MAX_SELECTED_BYTES, MAX_SEED_BYTES, MAX_MESSAGES } from './limits.js'
const MiB = 1024 * 1024
const errors: Record<string, string> = {
  'invalid-request': '请求无效，请重新打开导入页面。',
  'expired': '本次预览已过期，请重新选择分享或文件。',
  'busy': '正在处理另一份导入，请稍后再试。',
  'capacity': '临时数据较多，请关闭其他导入页面后重试。',
  'invalid-operation': '导入标识无效，请重新打开页面。',
  'receipt-capacity': '本节点的导入回执已达到保留上限，请联系开发者整理。',
  'receipt-unavailable': '暂时无法核对已有导入，请到电脑确认，不要重复导入。',
  'operation-conflict': '这个导入操作已用于其他选择，请核对已有结果。',
  'upload-incomplete': '文件尚未传完，请重新选择文件。',
  'invalid-chunk': '文件传输顺序不一致，请重新选择文件。',
  'source-too-large': '解析后的数据超过电脑端本次处理上限，请减少单次导入的内容。',
  'file-too-large': '文件超过本次上传上限（20 MB），请改用单个会话的分享链接。',
  'share-too-large': `分享正文超过电脑端本次读取上限（${MAX_SHARE_BYTES / MiB} MiB），已停止读取，未创建会话。请减少单次分享内容。`,
  'share-unavailable': '暂时无法访问这条分享，请确认链接有效且公开可访问，或稍后再试。',
  'share-empty': '分享没有返回可读取的内容，请确认链接仍有效。',
  'share-invalid-url': '请粘贴 https://chat.deepseek.com/share/ 开头的原始分享链接。',
  'share-timeout': '读取分享超时，请检查电脑网络后重试；尚未创建新会话。',
  'share-network': '电脑暂时无法连接 DeepSeek 分享服务，请检查电脑网络后重试。',
  'share-response-unavailable': 'DeepSeek 当前未返回可读取的会话，请确认分享仍有效且公开可访问，或重新生成分享。',
  'selected-too-large': `所选会话展开后超过电脑端本次处理上限（${MAX_SELECTED_BYTES / MiB} MiB）；未创建会话，请减少单次分享内容。`,
  'conversation-too-large': '原始检索或特殊片段展开后超过电脑端安全处理上限；内容未截断，请减少单次导入内容。',
  'message-limit': `所选会话超过 ${MAX_MESSAGES} 条消息上限（一次提问和一次回答分别计 1 条）；请分段分享导入。`,
  'event-limit': '所选会话包含的历史记录或检索片段过多，超过电脑端本次处理上限；请分段分享导入。',
  'seed-too-large': `会话转换为 DSH 历史记录后超过电脑端本次处理上限（${MAX_SEED_BYTES / MiB} MiB）；请减少单次分享内容。`,
  'unsupported-message-role': '原记录中有无法确认角色的消息，未创建会话。请换用该会话的分享链接。',
  'empty-conversation': '这个会话没有可迁移的消息。',
  'empty-source': '所选文件为空，请重新选择官方导出文件。',
  'cancelled': '本次读取已取消。',
  'parse-timeout': '读取数据超时，请减少单次导入内容后重试。',
  'native-unavailable': '此节点的 DSH 尚不支持这项导入，请更新 DSH。',
  'owner-changed': '账号或节点已变化，请重新选择导入来源。',
  'object-unavailable': '此节点尚不支持导入文件传输，请更新插件或改用分享链接。',
  'invalid-title': '会话名称须为 1 至 160 个字符，不能包含换行或控制字符。',
  'invalid-json': '这份数据不是可读取的完整 JSON，请重新获取分享或官方导出文件。',
  'unsupported-source': '未识别到受支持的 DeepSeek 分享或导出数据，请确认来源。',
  'invalid-zip': '导出压缩包无法完整读取或格式不受支持，请重新下载官方导出文件。',
  'missing-parent': '原始消息链缺少中间记录，无法完整还原；请重新分享完整片段。',
  'cyclic-messages': '原始消息关系异常，无法完整还原；请重新获取分享或导出。',
  'duplicate-message-id': '原始消息标识重复，无法完整还原；请重新获取分享或导出。',
  'duplicate-conversation-id': '导出记录中有重复的会话标识，请重新获取官方导出文件。',
  'too-many-conversations': '导出包中的会话数量超过本次处理上限，请改用单个会话的分享链接。',
  'source-too-complex': '原始数据结构过于复杂，超过电脑端本次处理上限；请减少单次导入内容。',
  'parse-unavailable': '电脑端未能完成数据解析，请减少单次导入内容或稍后重试。',
  'workspace-unavailable': '目标工作区已不存在或不可用，请重新选择工作区。',
  'workspace-changed': '目标工作区在导入前发生变化，请重新选择工作区。',
  'preset-unavailable': '所选会话模式已不存在、被关闭或无法加载，请重新选择可用模式。',
  'model-unavailable': '电脑端尚无可用的默认模型，请先在 DSH 中完成模型设置。',
  'authorization-changed': '使用资格、账号或功能开关在导入前发生变化，请重新确认。',
  'aborted': '导入在创建会话前已取消。',
  'preflight-failed': '电脑端原生会话检查未通过，请联系开发者核对；不会自动重复导入。',
  'invalid-message-id': '原始消息的编号格式暂不受支持，未导入。请联系开发者核对分享格式。',
}
for (const code of ['invalid-share', 'invalid-share-message', 'invalid-fragments', 'invalid-fragment',
  'invalid-fragment-content', 'invalid-files', 'invalid-file', 'invalid-export-conversation', 'invalid-export-node',
  'invalid-export-message', 'invalid-root', 'invalid-child-link', 'invalid-parent-link']) {
  errors[code] = '原始消息结构或字段格式暂不受支持，未导入。请联系开发者核对数据格式。'
}

function knownCode(error: unknown): string | undefined {
  const value = error as { code?: unknown; message?: unknown; name?: unknown }
  const code = value?.name === 'TimeoutError' ? 'share-timeout' : value?.name === 'AbortError' ? 'cancelled'
    : typeof value?.code === 'string' ? value.code : typeof value?.message === 'string' ? value.message : ''
  return Object.hasOwn(errors, code) ? code : undefined
}
export function importError(error: unknown): { code: string; message: string } {
  const code = knownCode(error)
  return { code: 'history-import/' + (code ?? 'unavailable'),
    message: code ? errors[code] + sizeDiagnostic(error, code) + shapeDiagnostic(error) : '暂时无法读取或导入这份数据，请核对来源后重试。已有会话不受影响。' }
}
function shapeDiagnostic(error: unknown): string {
  const value = (error as { diagnostic?: { messagePosition?: unknown; messageCount?: unknown; field?: unknown } })?.diagnostic
  if (!value || typeof value.messagePosition !== 'number' || !Number.isSafeInteger(value.messagePosition)
    || typeof value.messageCount !== 'number' || !Number.isSafeInteger(value.messageCount)
    || value.messagePosition < 1 || value.messageCount < value.messagePosition || value.messageCount > 10000
    || !['message', 'message_id', 'parent_id', 'fragments'].includes(value.field as string)) return ''
  return `（结构诊断 S2：第 ${value.messagePosition}/${value.messageCount} 条，${value.field}；不含会话正文。）`
}
function sizeDiagnostic(error: unknown, code: string): string {
  if (!['share-too-large', 'file-too-large', 'source-too-large', 'selected-too-large', 'seed-too-large'].includes(code)) return ''
  const value = error as { actualBytes?: unknown; limitBytes?: unknown }
  const actual = value?.actualBytes, limit = value?.limitBytes
  if (typeof actual !== 'number' || !Number.isSafeInteger(actual) || typeof limit !== 'number'
    || !Number.isSafeInteger(limit) || limit <= 0 || actual <= limit) return ''
  // Stream/seed readers stop as soon as a limit is crossed; never imply that
  // we downloaded or measured the complete response beyond that point.
  return `（本阶段已检测到至少 ${(actual / MiB).toFixed(1)} MiB，上限 ${(limit / MiB).toFixed(0)} MiB。）`
}
/** Only call after a positively identified rejection before native creation.
 * Never convert an ambiguous write into a safe-to-retry failure. */
export function preflightMessage(error: unknown): string {
  const code = knownCode(error)
  return '未创建新会话。' + (code ? errors[code] + sizeDiagnostic(error, code) : '电脑端导入检查未通过，请重新核对来源、工作区与会话模式。')
}
