/** Public share reader only. Never accepts a generic URL or a login credential. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const IMPORT_CHUNK_BYTES = 192 * 1024;
export function shareIdentifier(input) {
    if (typeof input !== 'string' || input.length > 512)
        throw new Error('请粘贴 DeepSeek 官方分享链接');
    let url;
    try {
        url = new URL(input.trim());
    }
    catch {
        throw new Error('分享链接格式不正确');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'chat.deepseek.com' || url.port || url.username || url.password
        || url.search || url.hash || !/^\/share\/[A-Za-z0-9]{8,128}$/.test(url.pathname)) {
        throw new Error('只支持 https://chat.deepseek.com/share/ 开头的原始分享链接');
    }
    return url.pathname.slice('/share/'.length);
}
export async function readPublicShare(input, signal, fetchImpl = fetch) {
    const id = shareIdentifier(input);
    const ownSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    ownSignal.throwIfAborted();
    const response = await fetchImpl('https://chat.deepseek.com/api/v0/share/content?share_id=' + id, {
        method: 'GET', redirect: 'error', signal: ownSignal, credentials: 'omit', headers: { accept: 'application/json' },
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error('暂时无法读取分享，请确认链接仍有效，或改用官方导出文件');
    }
    if (Number(response.headers.get('content-length')) > MAX_IMPORT_BYTES) {
        await response.body?.cancel();
        throw new Error('分享内容过大，请改用官方导出文件');
    }
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('分享没有返回内容');
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            ownSignal.throwIfAborted();
            const part = await reader.read();
            if (part.done)
                break;
            bytes += part.value.byteLength;
            if (bytes > MAX_IMPORT_BYTES)
                throw new Error('分享内容超过本次导入大小限制');
            chunks.push(part.value);
        }
        ownSignal.throwIfAborted();
        return Buffer.concat(chunks, bytes);
    }
    finally {
        await reader.cancel().catch(() => { });
    }
}
