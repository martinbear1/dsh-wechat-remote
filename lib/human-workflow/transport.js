import { createAgentHttpProof } from '../agent-http-proof.js';
import { fail, row } from './data.js';
import { HUMAN_CARD_REQUEST_MAX_BYTES, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES } from '../human-tools/capacity.js';
/** These authenticated resource denials do not revoke the whole node. Keep
 * this allowlist tied to the actual node routes; a code on another endpoint,
 * any 401, or an unreadable/unrecognized 403 remains fail-closed. */
const RESOURCE_DENIAL_OPERATIONS = {
    invalid_recipients: ['lifecycle'],
    workspace_registration_required: ['grant', 'workspace', 'lifecycle', 'objects/claim', 'objects/ack'],
    workspace_scope_mismatch: ['grant', 'workspace', 'lifecycle', 'objects/claim', 'objects/ack'],
    source_scope_mismatch: ['workspace', 'lifecycle', 'objects/claim', 'objects/ack'],
};
const FORBIDDEN_ERROR_MAX_BYTES = 16 * 1024;
export function workflowErrorMessage(code) {
    const messages = {
        'workflow-unavailable': '群任务服务暂不可用；请核对连接和服务状态。结果未确认时不要直接重发。',
        'workflow-network-unavailable': '群任务网络连接暂不可用；请核对连接。结果未确认时不要直接重发。',
        'workflow-timeout': '群任务请求超时，操作结果尚未确认；请先核对当前任务状态，不要直接重发。',
        lifecycle_conflict: '任务状态已更新。请重新读取本任务的当前版本与事实，只重新准备仍需要的操作；旧确认不能批准新内容。',
        draft_expired: '这份待确认内容已过期。请先核对是否已生效；仍需执行时重新准备并让用户确认，不复用旧批准。',
        draft_changed: '待确认内容与原版本不一致。请重新读取并核对准确内容，不使用旧按钮批准变化后的内容。',
        recipient_snapshot_changed: '成员或提交记录已变化，请从第一页重新查询，不要合并不同时间的名单。',
        recipient_snapshot_required: '继续查询成员时须沿用上一页的快照。',
        recipient_unavailable: '指定成员的原群身份暂不可用，请重新核对，不会替换成其他成员。',
        selection_changed: '成员选择已经变化，请重新核对本次对象。',
        recipients_changed: '指定对象目前不符合本次提醒条件，或已没有需要提醒的人。请重新查询当前成员和提交事实；这不是服务宕机，不会自动换人、扩大范围或重发。',
        invalid_recipients: '指定对象不符合当前任务或提交要求的范围。请重新查询准确成员引用并核对用户意图；本次未执行，不会改选其他人，也不表示节点配对已撤销。',
        workspace_registration_required: '当前工作区尚未登记这份会话来源。请通过工作区工具核对并登记真实来源；不修改会话标识或借用其他工作区资料。',
        workspace_scope_mismatch: '会话来源不属于所请求的工作区。本次访问被拒绝，请回到正确工作区核对来源；不会切换工作区或扩大权限。',
        source_scope_mismatch: '任务来源不属于本次授权的节点、会话或共享工作区。本次访问被拒绝，请核对准确来源；不改写身份或扩大权限。',
        invalid_lifecycle: '任务参数结构未通过校验。请核对字段层级、类型及当前工具合同；不据此判断附件不支持，也不静默改变用户要求。',
        invalid_form: '表单参数未通过校验。请核对版本、字段及附件合同；参数错误不代表接收电脑不支持文档。',
        download_ticket_expired: '附件下载凭证已过期；请由主人在任务管理中明确重试收件，不会自动申请新下载。',
        attachment_download_quota: '群附件下载额度暂不足；尚未确认收件，请稍后由主人重试或核对账户额度。',
        usage_ledger_capacity: '附件用量记录已达到容量上限；服务恢复前不能申请下载，尚未确认收件。',
        metering_unavailable: '附件用量服务暂不可用；尚未确认收件，请稍后核对。',
        'receiver-capacity': '电脑收件空间或数量已达到上限；尚未确认交付，未自动删除原始附件。',
        receiver_format_unsupported: '服务端尚未确认接收电脑具备所需文件格式的收件能力；请核对版本、连接及能力登记。不是表单结构错误，也不代表文件已送达。',
        'submission-file-invalid': '附件未通过格式或有界结构校验，未确认送达；请核对原文件后重新提交。',
        'submission-image-invalid': '图片未通过完整校验，未确认送达；请核对原文件后重新提交。',
        'submission-manifest-invalid': '附件说明未通过验证，未确认送达；请核对原提交。',
        'submission-integrity-invalid': '附件完整性未通过验证，未确认送达；请核对原提交。',
        'submission-context-invalid': '附件与原提交的关联不一致，未确认送达；请核对原提交。',
        'receiver-file-mismatch': '文件格式或大小与已提交记录不一致，未确认送达；请核对原提交。',
        'submission-not-received': '本机尚无完整收件；不会据此运行模型或宣称处理完成。',
        'submission-expired': '附件保管期限已过；仅完整本地原件可恢复收件确认，不会重新签发下载或伪称已收件。',
        cover_upload_expired: '封面上传凭证已过期；请明确重新准备封面，未自动换图或发送。',
        cover_download_expired: '封面预览凭证已过期；请重新点击预览，未发送群卡。',
        cover_asset_expired: '封面资产已过期，请重新准备并核对，未自动替换。',
        cover_quota: '封面临时存储或预览次数已达保护限额，请稍后再试；未发送群卡。',
        cover_upload_missing: '尚未确认原封面上传完成，请核对原操作；未发送群卡。',
        cover_storage_unavailable: '封面存储暂不可用，请核对原操作；不会自动更换图片或发送。',
        cover_ticket_unknown: '封面传输凭证结果待核对，未自动重新申请或发送。',
        cover_ticket_pending: '封面传输凭证正在准备，请核对原操作。',
    };
    return Object.hasOwn(messages, code) ? messages[code]
        : '操作未完成，请核对返回的错误类型与当前任务状态；不要据此假定服务宕机、改变用户要求或重复发送。';
}
/** Uses the paired node's existing identity, never owner credentials. No
 * redirects, arbitrary endpoints, model-provided URLs or plaintext fallback. */
export class WorkflowHttpTransport {
    identity;
    fetcher;
    nodeId;
    origin;
    constructor(origin, identity, fetcher = fetch) {
        this.identity = identity;
        this.fetcher = fetcher;
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
            throw fail('workflow-origin-invalid', '群任务服务需要可信 HTTPS 源地址');
        this.origin = url.origin;
        this.nodeId = identity().nodeId;
    }
    assertIdentity() {
        if (this.identity().nodeId !== this.nodeId)
            throw fail('binding_revoked', '节点身份已变化，请重新连接');
    }
    async request(operation, body, signal) {
        this.assertIdentity();
        signal.throwIfAborted();
        if (!['grant', 'sync', 'workspace', 'receiver-key', 'lifecycle', 'objects/claim', 'objects/ack', 'cover-assets/prepare', 'cover-assets/finalize', 'cover-assets/download'].includes(operation))
            throw fail('workflow-request-invalid', '群任务操作不受支持');
        const pathname = `/api/human-tasks/v1/node/${operation}`;
        const serialized = JSON.stringify({ ...body, audience: 'human.workflow.node.v1' });
        const requestLimit = ['grant', 'lifecycle'].includes(operation) ? HUMAN_CARD_REQUEST_MAX_BYTES : 16384;
        if (Buffer.byteLength(serialized) > requestLimit)
            throw fail('workflow-request-invalid', '群任务请求过大');
        const combined = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
        const response = await this.fetcher(`${this.origin}${pathname}`, { method: 'POST', redirect: 'error', signal: combined,
            headers: { 'content-type': 'application/json', ...createAgentHttpProof(this.identity(), 'POST', pathname, serialized) }, body: serialized });
        this.assertIdentity();
        combined.throwIfAborted();
        const revoked = () => Object.assign(fail('binding_revoked', '节点授权已失效，任务缓存已停止使用'), { status: response.status });
        if (response.status === 401) {
            await response.body?.cancel().catch(() => { });
            throw revoked();
        }
        if (!response.body)
            throw response.status === 403 ? revoked() : fail('workflow-response-invalid', '群任务响应为空');
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try {
            while (true) {
                combined.throwIfAborted();
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.byteLength;
                const limit = response.status === 403 ? FORBIDDEN_ERROR_MAX_BYTES
                    : operation === 'lifecycle' ? HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES : 2 * 1024 * 1024;
                if (size > limit)
                    throw response.status === 403 ? revoked() : fail('workflow-response-invalid', '群任务响应过大');
                chunks.push(value);
            }
        }
        catch (error) {
            this.assertIdentity();
            combined.throwIfAborted();
            if (response.status === 403)
                throw revoked();
            throw error;
        }
        finally {
            await reader.cancel().catch(() => { });
            reader.releaseLock();
        }
        this.assertIdentity();
        combined.throwIfAborted();
        let result;
        try {
            result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        catch {
            throw response.status === 403 ? revoked() : fail('workflow-response-invalid', '群任务响应格式不受支持');
        }
        if (!response.ok) {
            // Server text can contain request data. Return only a bounded safe code.
            const error = row(result) && row(result.error) ? result.error.code : row(result) ? result.error : undefined;
            const code = typeof error === 'string' && /^[a-z0-9_-]{1,80}$/.test(error) ? error : 'workflow-request-failed';
            if (response.status === 403 && !(Object.hasOwn(RESOURCE_DENIAL_OPERATIONS, code)
                && RESOURCE_DENIAL_OPERATIONS[code].includes(operation)))
                throw revoked();
            throw Object.assign(fail(code, workflowErrorMessage(code)), { status: response.status });
        }
        return result;
    }
}
