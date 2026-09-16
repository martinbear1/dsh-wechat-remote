export function sessionExportAvailable(ctx) {
    return typeof ctx.get('connection')?.createSharedFetchHandler === 'function';
}
/** Only called behind the paired client's authenticated RPC boundary. Use the
 * mounted native route: persistence, attachments and descendants stay DSH-owned.
 * Never fetch a caller-provided URL, read log files, or recreate the ZIP format. */
export async function exportSessionArchive(ctx, scope, signal, maxBytes) {
    if (typeof scope !== 'string' || !scope || scope.length > 256)
        throw new Error('会话无效');
    signal.throwIfAborted();
    const connection = ctx.get('connection');
    const handler = connection?.createSharedFetchHandler?.('/api');
    if (!handler)
        throw new Error('此节点尚不支持手机导出，请在电脑端导出或更新 DSH');
    const url = new URL('http://dsh.local/api/session.export');
    url.searchParams.set('sessionId', scope);
    url.searchParams.set('includeDescendants', 'true');
    const response = await handler.fetch(new Request(url, { method: 'GET', signal }));
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/zip') || !response.body) {
        await response.body?.cancel();
        signal.throwIfAborted();
        throw new Error(response.status === 404 ? '会话不存在或此节点尚未提供原生导出，请在电脑端确认' : '节点暂时无法生成会话归档，请稍后重试');
    }
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => { }); };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks = [];
    let bytes = 0;
    try {
        signal.throwIfAborted();
        for (;;) {
            const chunk = await reader.read();
            signal.throwIfAborted();
            if (chunk.done)
                break;
            bytes += chunk.value.byteLength;
            if (bytes > maxBytes)
                throw new Error('归档超过手机支持的 20 MB，请在电脑端导出');
            chunks.push(chunk.value);
        }
        const filename = /filename="([^"\r\n]+)"/i.exec(response.headers.get('content-disposition') || '')?.[1];
        const name = filename?.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(-160);
        return { data: Buffer.concat(chunks, bytes), name: name?.endsWith('.zip') ? name : 'session-archive.zip' };
    }
    finally {
        signal.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
