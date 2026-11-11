import { resolveExactArrayProjection } from './dsh-subagent-projection.js';
function descriptor(ctx, method) {
    return ctx.get('typert')?.local?.get?.(method);
}
export async function interruptMobileChild(ctx, gateway, request, resolveAddress) {
    if (!descriptor(ctx, 'subagents/interruptByUser'))
        return gateway.invoke(request);
    const { childSessionId, parentSessionId, mode } = request.args;
    const child = await resolveAddress(childSessionId);
    if (child.kind !== 'subagent' || child.parentSessionId !== parentSessionId || child.mode !== 'continuable' || mode !== child.mode) {
        throw new Error('子会话与当前父会话不匹配，未停止任务。请刷新后重试。');
    }
    request.signal?.throwIfAborted();
    return gateway.invoke({ ...request, method: 'interruptByUser', args: { childSessionId } });
}
/** Undefined means keep the original ordinary Session prompt. No trial writes. */
export async function promptMobileChild(ctx, gateway, request, resolveAddress) {
    const method = descriptor(ctx, 'subagents/prompt');
    if (!method)
        return;
    const prompt = request.args.request;
    const live = ctx.get('sessions')?.get?.(prompt.sessionId);
    // A cold header is sufficient; stat neither acquires a writer nor replays history.
    const persistence = ctx.get('sessionPersistence');
    const header = live?.header ?? (await persistence?.stat?.(prompt.sessionId, { signal: request.signal }))?.header;
    if (header?.origin !== 'subagent')
        return;
    const child = await resolveAddress(prompt.sessionId);
    if (child.kind !== 'subagent' || child.mode !== 'continuable')
        throw new Error('此子代理不支持续聊。');
    if (!['queue', 'steer'].includes(prompt.mode) || !Array.isArray(prompt.content) || !prompt.content.length
        || prompt.content.some((part) => !['text', 'image'].includes(part?.type))) {
        throw new Error('子代理续聊支持文字和图片，请检查消息内容。');
    }
    const native = {
        requestId: prompt.requestId, childSessionId: child.childSessionId, delivery: prompt.mode, content: prompt.content,
        ...(prompt.clientTimeZone === undefined ? {} : { clientTimeZone: prompt.clientTimeZone }),
    };
    // Earlier Hosts require both address fields. Inspect the running codec;
    // permissive codecs that strip the old fields get only the modern payload.
    const codec = method.parameters?.find((p) => p.wire === 'request')?.codec;
    const schema = typeof codec?.create === 'function' ? codec.create() : codec?.schema;
    const addressed = { ...native, parentSessionId: child.parentSessionId, mode: child.mode };
    const decoded = schema?.safeParse(addressed);
    const legacy = decoded?.success && decoded.data?.parentSessionId === child.parentSessionId && decoded.data?.mode === child.mode;
    if (!legacy && !schema?.safeParse(native)?.success)
        throw new Error('子代理续聊接口暂不可用，请刷新后重试。');
    request.signal?.throwIfAborted();
    const receipt = await gateway.invoke({ ...request, namespace: 'subagents', method: 'prompt', args: { request: legacy ? addressed : native } });
    if (typeof receipt?.messageId !== 'string' || !receipt.messageId)
        throw new Error('未收到子代理的消息回执，请查看会话记录。');
    return { accepted: true };
}
export async function archiveMobileSession(ctx, gateway, request) {
    if (typeof ctx.get('worktrees')?.cleanupOf !== 'function')
        return gateway.invoke(request);
    const sessionId = request.args?.request?.sessionId;
    const projection = await gateway.invoke({ ...request, namespace: 'session', method: 'projections', args: { request: { sessionId } } });
    const exact = await resolveExactArrayProjection(ctx, sessionId, projection, request.signal, 'worktree');
    const entries = exact?.values?.worktree;
    if (exact?.kind !== 'sequenced' || !Number.isSafeInteger(exact.asOfSeq) || exact.asOfSeq < -1
        || !Array.isArray(entries) || entries.some(entry => typeof entry?.owned !== 'boolean')) {
        throw new Error('无法确认工作树归属，请在电脑端核对后归档。');
    }
    if (entries.some(entry => entry.owned)) {
        throw Object.assign(new Error('此会话创建过 Git 工作树，归档可能清理检出目录。请在电脑端确认后归档。'), {
            code: 'adapter/worktree-archive-confirmation-required',
        });
    }
    request.signal?.throwIfAborted();
    // The released phone archives idle sessions. Do not let a forced archive
    // stop an in-flight checkout after the ownership snapshot was read.
    if (request.args.request.stopActivity === true) {
        return gateway.invoke({ ...request, args: { ...request.args, request: { ...request.args.request, stopActivity: false } } });
    }
    return gateway.invoke(request);
}
