import { DEFAULT_TRUSTED_OBJECT_ORIGINS } from '../public-object-client.js';
import { exact, fail, row } from './data.js';
import { SUBMISSION_CIPHER_MAX } from './submission-crypto.js';
/** Only consumes a node-authenticated claim's one-object ticket. Models and
 * member forms cannot supply this input. No redirects or cross-object races. */
export async function downloadSubmission(ticket, expectedBytes, signal, fetcher = fetch, trustedOrigins = DEFAULT_TRUSTED_OBJECT_ORIGINS) {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 21 || expectedBytes > SUBMISSION_CIPHER_MAX || !row(ticket))
        throw fail('receiver-ticket-invalid', '附件下载授权无效');
    if (ticket.alternatives !== undefined && !Array.isArray(ticket.alternatives))
        throw fail('receiver-ticket-invalid', '附件备用入口无效');
    const candidates = [ticket, ...(Array.isArray(ticket.alternatives) ? ticket.alternatives : [])];
    if (candidates.length > 2)
        throw fail('receiver-ticket-invalid', '附件下载入口过多');
    let pathname;
    const routes = candidates.map((value, index) => {
        if (!row(value) || !exact(value, ['url', 'expiresIn'], index === 0 ? ['headers', 'alternatives'] : ['headers']) || typeof value.url !== 'string' || value.url.length > 8192
            || !Number.isSafeInteger(value.expiresIn) || Number(value.expiresIn) <= 0 || Number(value.expiresIn) > 3600
            || value.headers !== undefined && (!row(value.headers) || Object.keys(value.headers).length))
            throw fail('receiver-ticket-invalid', '附件下载授权无效');
        let url;
        try {
            url = new URL(value.url);
        }
        catch {
            throw fail('receiver-ticket-invalid', '附件下载授权无效');
        }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || !trustedOrigins.includes(url.origin)
            || !/^\/human-tasks\/[A-Za-z0-9_-]{24,96}\.bin$/.test(url.pathname)
            || pathname !== undefined && pathname !== url.pathname)
            throw fail('receiver-ticket-invalid', '附件下载入口不受信任');
        pathname ??= url.pathname;
        return url.href;
    });
    const active = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    for (const url of routes) {
        try {
            const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: active });
            if (!response.ok || !response.body) {
                await response.body?.cancel();
                throw fail('receiver-download-unavailable', '附件下载暂不可用');
            }
            const reader = response.body.getReader(), chunks = [];
            let size = 0;
            try {
                while (true) {
                    active.throwIfAborted();
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.length;
                    if (size > expectedBytes)
                        throw fail('receiver-download-invalid', '附件大小与清单不符');
                    chunks.push(value);
                }
            }
            finally {
                await reader.cancel().catch(() => { });
                reader.releaseLock();
            }
            active.throwIfAborted();
            if (size !== expectedBytes)
                throw fail('receiver-download-invalid', '附件大小与清单不符');
            return Buffer.concat(chunks);
        }
        catch (cause) {
            active.throwIfAborted();
            if (cause.code === 'receiver-download-invalid')
                throw cause;
        }
    }
    throw fail('receiver-download-unavailable', '附件下载暂不可用，请稍后恢复接收');
}
