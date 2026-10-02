import { createAgentHttpProof } from '../agent-http-proof.js'
import type { AgentIdentity } from '../public-relay-agent.js'
import { fail, row } from './data.js'

export type WorkflowOperation = 'grant' | 'sync' | 'receiver-key' | 'lifecycle' | 'objects/claim' | 'objects/ack'
export interface WorkflowTransport {
  readonly nodeId: string
  assertIdentity(): void
  request(operation: WorkflowOperation, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}
export function workflowErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    download_ticket_expired: '附件下载凭证已过期；请由主人在任务管理中明确重试收件，不会自动申请新下载。',
    attachment_download_quota: '群附件下载额度暂不足；尚未确认收件，请稍后由主人重试或核对账户额度。',
    usage_ledger_capacity: '附件用量记录已达到容量上限；服务恢复前不能申请下载，尚未确认收件。',
    metering_unavailable: '附件用量服务暂不可用；尚未确认收件，请稍后核对。',
    'receiver-capacity': '电脑收件空间或数量已达到上限；尚未确认交付，未自动删除原始附件。',
    'submission-not-received': '本机尚无完整收件；不会据此运行模型或宣称处理完成。',
    'submission-expired': '附件保管期限已过；仅完整本地原件可恢复收件确认，不会重新签发下载或伪称已收件。',
  }
  return messages[code] || '群任务服务暂不可用'
}
/** Uses the paired node's existing identity, never owner credentials. No
 * redirects, arbitrary endpoints, model-provided URLs or plaintext fallback. */
export class WorkflowHttpTransport implements WorkflowTransport {
  readonly nodeId: string
  private readonly origin: string
  constructor(origin: string, private readonly identity: () => AgentIdentity, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw fail('workflow-origin-invalid', '群任务服务需要可信 HTTPS 源地址')
    this.origin = url.origin
    this.nodeId = identity().nodeId
  }
  assertIdentity(): void {
    if (this.identity().nodeId !== this.nodeId) throw fail('binding_revoked', '节点身份已变化，请重新连接')
  }
  async request(operation: WorkflowOperation, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    this.assertIdentity(); signal.throwIfAborted()
    if (!['grant', 'sync', 'receiver-key', 'lifecycle', 'objects/claim', 'objects/ack'].includes(operation)) throw fail('workflow-request-invalid', '群任务操作不受支持')
    const pathname = `/api/human-tasks/v1/node/${operation}`
    const serialized = JSON.stringify({ ...body, audience: 'human.workflow.node.v1' })
    if (Buffer.byteLength(serialized) > 16384) throw fail('workflow-request-invalid', '群任务请求过大')
    const combined = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    const response = await this.fetcher(`${this.origin}${pathname}`, { method: 'POST', redirect: 'error', signal: combined,
      headers: { 'content-type': 'application/json', ...createAgentHttpProof(this.identity(), 'POST', pathname, serialized) }, body: serialized })
    this.assertIdentity(); combined.throwIfAborted()
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => {})
      throw Object.assign(fail('binding_revoked', '节点授权已失效，任务缓存已停止使用'), { status: response.status })
    }
    if (!response.body) throw fail('workflow-response-invalid', '群任务响应为空')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        combined.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2 * 1024 * 1024) throw fail('workflow-response-invalid', '群任务响应过大')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    this.assertIdentity(); combined.throwIfAborted()
    let result: unknown
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw fail('workflow-response-invalid', '群任务响应格式不受支持') }
    if (!response.ok) {
      // Server text can contain request data. Return only a bounded safe code.
      const error = row(result) && row(result.error) ? result.error.code : row(result) ? result.error : undefined
      const code = typeof error === 'string' && /^[a-z0-9_-]{1,80}$/.test(error) ? error : 'workflow-unavailable'
      throw Object.assign(fail(code, workflowErrorMessage(code)), { status: response.status })
    }
    return result
  }
}
