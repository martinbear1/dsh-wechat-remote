/** Public share reader only. Never accepts a generic URL or a login credential. */
import { MAX_FILE_BYTES, MAX_SHARE_BYTES, sizeLimitError } from './limits.js';
export { MAX_SHARE_BYTES };
export const MAX_IMPORT_BYTES = MAX_FILE_BYTES;
export const IMPORT_CHUNK_BYTES = 192 * 1024;
export function shareIdentifier(input) {
    if (typeof input !== 'string' || input.length > 512)
        throw new Error('share-invalid-url');
    let url;
    try {
        url = new URL(input.trim());
    }
    catch {
        throw new Error('share-invalid-url');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'chat.deepseek.com' || url.port || url.username || url.password
        || url.search || url.hash || !/^\/share\/[A-Za-z0-9]{8,128}$/.test(url.pathname)) {
        throw new Error('share-invalid-url');
    }
    return url.pathname.slice('/share/'.length);
}
export async function readPublicShare(input, signal, fetchImpl = fetch) {
    const id = shareIdentifier(input);
    const ownSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    try {
        ownSignal.throwIfAborted();
        const response = await fetchImpl('https://chat.deepseek.com/api/v0/share/content?share_id=' + id, {
            method: 'GET', redirect: 'error', signal: ownSignal, credentials: 'omit', headers: { accept: 'application/json' },
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error('share-unavailable');
        }
        const declaredBytes = Number(response.headers.get('content-length'));
        if (declaredBytes > MAX_SHARE_BYTES) {
            await response.body?.cancel();
            throw sizeLimitError('share-too-large', declaredBytes, MAX_SHARE_BYTES);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('share-empty');
        const chunks = [];
        let bytes = 0;
        try {
            while (true) {
                ownSignal.throwIfAborted();
                const part = await reader.read();
                if (part.done)
                    break;
                bytes += part.value.byteLength;
                if (bytes > MAX_SHARE_BYTES)
                    throw sizeLimitError('share-too-large', bytes, MAX_SHARE_BYTES);
                chunks.push(part.value);
            }
            ownSignal.throwIfAborted();
            return Buffer.concat(chunks, bytes);
        }
        finally {
            await reader.cancel().catch(() => { });
        }
    }
    catch (error) {
        if (signal.aborted)
            throw new Error(signal.reason?.name === 'TimeoutError' ? 'share-timeout' : 'cancelled');
        if (ownSignal.aborted)
            throw new Error('share-timeout');
        if (error instanceof TypeError)
            throw new Error('share-network');
        throw error;
    }
}
