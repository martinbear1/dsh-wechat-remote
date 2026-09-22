/** File-operation ceilings, not normal-path delays. Ordinary RPCs keep theirs. */
export const OBJECT_UPLOAD_BUDGET_MS = 180_000;
export const OBJECT_DOWNLOAD_BUDGET_MS = 150_000;
export const OBJECT_PREPARE_BUDGET_MS = OBJECT_UPLOAD_BUDGET_MS + 30_000;
export function objectRpcBudget(method, payload) {
    if (method === 'agentInputs/upload')
        return OBJECT_DOWNLOAD_BUDGET_MS + 30_000;
    if (method === 'agentResources/prepare' || method === 'agentResources/prepareArchive')
        return OBJECT_PREPARE_BUDGET_MS;
    if (method === 'wechatAttachment/prepareBatch') {
        const attachments = payload?.args?.request?.attachments;
        const count = Array.isArray(attachments) ? Math.max(1, Math.min(6, attachments.length)) : 6;
        return Math.ceil(count / 2) * OBJECT_PREPARE_BUDGET_MS;
    }
    return undefined;
}
