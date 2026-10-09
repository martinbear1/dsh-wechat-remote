/** Tencent/openclaw-weixin 24de5c9: api/types, cdn/pic-decrypt,
 * cdn/aes-ecb, media/media-download, auth/accounts. See third-party notice.
 * Bounds and exact-host restriction are our local policy, not provider limits. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ILinkError } from './ilink-types.js';
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_ITEMS = 6;
const CDN_BASE = 'https://novac2c.cdn.weixin.qq.com/c2c';
function bad() { throw new ILinkError('clawbot-invalid-response', '微信附件信息不完整，未发送到会话'); }
function large() { throw new ILinkError('clawbot-response-too-large', '微信附件超过单个 10 MiB 的处理上限'); }
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function mediaUrl(value, purpose = 'download') {
    if (typeof value !== 'string' || !value || value.length > 8192 || /[\x00-\x20\x7f\\]/u.test(value))
        bad();
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return bad();
    }
    if (url.protocol !== 'https:' || url.hostname !== 'novac2c.cdn.weixin.qq.com'
        || url.port || url.username || url.password || url.hash || url.pathname !== '/c2c/' + purpose || !url.search) {
        throw new ILinkError('clawbot-untrusted-url', '微信附件地址不在允许范围内');
    }
    return url.href;
}
function aesKey(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{22,44}={0,2}$/u.test(value))
        bad();
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64').replace(/=+$/u, '') !== value.replace(/=+$/u, ''))
        bad();
    if (bytes.length === 16)
        return bytes;
    if (bytes.length === 32 && /^[a-fA-F0-9]{32}$/u.test(bytes.toString('ascii')))
        return Buffer.from(bytes.toString('ascii'), 'hex');
    return bad();
}
/** Keep a filename, never a provider-supplied filesystem path or control name. */
function safeName(value, fallback) {
    if (value === undefined || value === '')
        return fallback;
    if (typeof value !== 'string' || value.length > 4096)
        bad();
    let name = value.split(/[\\/]/u).at(-1).replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_').trim().replace(/[. ]+$/u, '');
    if (!name || name === '.' || name === '..')
        return fallback;
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name))
        name = '_' + name;
    const extension = /(?<!^)\.[a-zA-Z0-9]{1,16}$/u.exec(name)?.[0] || '';
    let stem = extension ? name.slice(0, -extension.length) : name;
    while (Buffer.byteLength(stem + extension) > 240)
        stem = [...stem].slice(0, -1).join('');
    name = stem + extension;
    return name || fallback;
}
/** Validate persisted refs as well as fresh provider input before any download. */
export function validateMedia(value) {
    try {
        if (!object(value) || !['image', 'file', 'voice', 'video'].includes(value.kind)
            || typeof value.name !== 'string' || !value.name || safeName(value.name, '') !== value.name
            || value.bytes !== undefined && (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MEDIA_MAX_BYTES)
            || value.md5 !== undefined && (typeof value.md5 !== 'string' || !/^[a-fA-F0-9]{32}$/u.test(value.md5)))
            return false;
        mediaUrl(value.url);
        if (value.aesKey !== undefined)
            aesKey(value.aesKey);
        return value.kind === 'image' || value.aesKey !== undefined;
    }
    catch {
        return false;
    }
}
function opaque(value, max = 4096) {
    return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= max && !/[\s\x00-\x1f\x7f]/u.test(value);
}
/** Outbox validation rejects oversized, cross-shape and malformed persisted references. */
export function validatePreparedMedia(value) {
    try {
        if (!object(value) || !['image', 'file', 'video'].includes(value.kind)
            || typeof value.name !== 'string' || !value.name || safeName(value.name, '') !== value.name
            || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > MEDIA_MAX_BYTES
            || value.cipherBytes !== (Math.floor(value.bytes / 16) + 1) * 16
            || !opaque(value.query) || !opaque(value.accountId, 256) || !opaque(value.userId, 256) || !value.userId.endsWith('@im.wechat')
            || typeof value.aesKey !== 'string')
            return false;
        // Outbound follows Tencent's base64(ASCII hex32), not its inbound raw-key variant.
        const decoded = Buffer.from(value.aesKey, 'base64');
        return decoded.length === 32 && /^[a-f0-9]{32}$/u.test(decoded.toString('ascii')) && decoded.toString('base64') === value.aesKey;
    }
    catch {
        return false;
    }
}
/** One CDN write, with no auth forwarding or retry (including ambiguous failures). */
async function uploadEncrypted(url, data, fetchImpl, signal) {
    signal?.throwIfAborted();
    const controller = new AbortController(), forward = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', forward, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
        const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
            body: new Uint8Array(data), redirect: 'error', signal: controller.signal });
        controller.signal.throwIfAborted();
        await response.body?.cancel();
        controller.signal.throwIfAborted();
        if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== url) {
            throw new ILinkError('clawbot-untrusted-url', '微信附件上传发生了不允许的跳转');
        }
        if (response.status !== 200)
            throw new ILinkError('clawbot-http-error', '微信附件暂时无法上传');
        const query = response.headers.get('x-encrypted-param');
        if (!opaque(query))
            throw new ILinkError('clawbot-invalid-response', '微信附件上传结果无法确认');
        return query;
    }
    catch (error) {
        signal?.throwIfAborted();
        if (timedOut)
            throw new ILinkError('clawbot-timeout', '微信附件上传超时');
        if (error instanceof ILinkError)
            throw error;
        throw new ILinkError('clawbot-network-error', '微信附件上传结果无法确认');
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forward);
    }
}
/** Tencent's getuploadurl -> AES/PKCS7 -> CDN protocol, without local file access. */
export async function prepareMedia(auth, input, fetchImpl, getUploadUrl, signal, check) {
    if (!object(input) || !['image', 'file', 'voice', 'video'].includes(input.kind)
        || !opaque(input.userId, 256) || !input.userId.endsWith('@im.wechat') || input.userId !== auth.userId
        || typeof input.name !== 'string' || !input.name || !(input.data instanceof Uint8Array) || !input.data.byteLength) {
        throw new ILinkError('clawbot-invalid-input', '微信附件缺少有效内容或收件人');
    }
    if (input.data.byteLength > MEDIA_MAX_BYTES)
        large();
    // Snapshot bytes, names and identities before awaiting; callers may change their state.
    const kind = input.kind === 'voice' ? 'file' : input.kind;
    const name = safeName(input.name, 'file.bin'), data = Buffer.from(input.data);
    const accountId = auth.accountId, userId = input.userId;
    const key = randomBytes(16), filekey = randomBytes(16).toString('hex');
    const cipher = createCipheriv('aes-128-ecb', key, null);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const checkpoint = () => { signal?.throwIfAborted(); check?.(); };
    checkpoint();
    const info = await getUploadUrl({ filekey, media_type: kind === 'image' ? 1 : kind === 'video' ? 2 : 3,
        to_user_id: userId, rawsize: data.length, rawfilemd5: createHash('md5').update(data).digest('hex'),
        filesize: encrypted.length, no_need_thumb: true, aeskey: key.toString('hex') });
    checkpoint();
    let url;
    if (info.upload_full_url !== undefined && info.upload_full_url !== '')
        url = mediaUrl(info.upload_full_url, 'upload');
    else {
        if (!opaque(info.upload_param))
            throw new ILinkError('clawbot-invalid-response', '微信附件上传地址不完整');
        url = mediaUrl(CDN_BASE + '/upload?encrypted_query_param=' + encodeURIComponent(info.upload_param) + '&filekey=' + filekey, 'upload');
    }
    checkpoint();
    const query = await uploadEncrypted(url, encrypted, fetchImpl, signal);
    checkpoint();
    return { kind, name, bytes: data.length, cipherBytes: encrypted.length, query,
        aesKey: Buffer.from(key.toString('hex'), 'ascii').toString('base64'), accountId, userId };
}
/** Decode only native direct media fields. Quotes/stickers are not fabricated. */
export function mediaFromItem(item) {
    const kinds = { 2: 'image', 3: 'voice', 4: 'file', 5: 'video' };
    const kind = kinds[item.type];
    if (!kind)
        bad();
    const part = item[kind === 'image' ? 'image_item' : kind === 'voice' ? 'voice_item' : kind === 'file' ? 'file_item' : 'video_item'];
    if (!object(part) || !object(part.media))
        bad();
    const media = part.media;
    let url;
    if (media.full_url !== undefined && media.full_url !== '')
        url = mediaUrl(media.full_url);
    else {
        if (typeof media.encrypt_query_param !== 'string' || !media.encrypt_query_param
            || media.encrypt_query_param.length > 4096 || /[\x00-\x20\x7f]/u.test(media.encrypt_query_param))
            bad();
        url = mediaUrl(CDN_BASE + '/download?encrypted_query_param=' + encodeURIComponent(media.encrypt_query_param));
    }
    let key;
    if (kind === 'image' && part.aeskey !== undefined && part.aeskey !== '') {
        if (typeof part.aeskey !== 'string' || !/^[a-fA-F0-9]{32}$/u.test(part.aeskey))
            bad();
        key = Buffer.from(part.aeskey, 'hex').toString('base64');
    }
    else if (media.aes_key !== undefined && media.aes_key !== '')
        key = aesKey(media.aes_key).toString('base64');
    if (kind !== 'image' && !key)
        bad();
    const voiceExtensions = { 1: 'pcm', 2: 'adpcm', 3: 'feature', 4: 'speex', 5: 'amr', 6: 'silk', 7: 'mp3', 8: 'ogg' };
    const name = kind === 'file' ? safeName(part.file_name, 'file.bin')
        : kind === 'voice' ? 'voice.' + (voiceExtensions[part.encode_type] || 'bin') : kind === 'video' ? 'video.mp4' : 'image.bin';
    const result = { kind, name, url, ...(key ? { aesKey: key } : {}) };
    // File len is the plaintext length. Image sizes can describe variants and are
    // not used as integrity assertions; the streaming cap still applies to all.
    if (kind === 'file' && part.len !== undefined && part.len !== '') {
        if (typeof part.len !== 'string' || !/^\d{1,16}$/u.test(part.len) || !Number.isSafeInteger(Number(part.len)))
            bad();
        result.bytes = Number(part.len);
        if (result.bytes > MEDIA_MAX_BYTES)
            large();
    }
    const md5 = kind === 'file' ? part.md5 : kind === 'video' ? part.video_md5 : undefined;
    if (md5 !== undefined && md5 !== '') {
        if (typeof md5 !== 'string' || !/^[a-fA-F0-9]{32}$/u.test(md5))
            bad();
        result.md5 = md5.toLowerCase();
    }
    if (!validateMedia(result))
        bad();
    return result;
}
function detectedName(media, data) {
    if (media.kind === 'image') {
        const hex = data.subarray(0, 12).toString('hex');
        const ext = hex.startsWith('89504e470d0a1a0a') ? 'png' : hex.startsWith('ffd8ff') ? 'jpg'
            : /^474946383[79]61/u.test(hex) ? 'gif'
                : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
                    : hex.startsWith('424d') ? 'bmp' : undefined;
        return ext ? 'image.' + ext : media.name;
    }
    if (media.kind === 'voice' && media.name === 'voice.bin') {
        if (data.subarray(0, 10).toString('ascii').includes('#!SILK_V3'))
            return 'voice.silk';
        if (data.toString('ascii', 0, 5) === '#!AMR')
            return 'voice.amr';
        if (data.toString('ascii', 0, 4) === 'OggS')
            return 'voice.ogg';
        if (data.toString('ascii', 0, 3) === 'ID3')
            return 'voice.mp3';
        if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE')
            return 'voice.wav';
    }
    return media.name;
}
export async function downloadMedia(media, fetchImpl, signal) {
    if (!validateMedia(media))
        throw new ILinkError('clawbot-invalid-input', '微信附件信息无效，未下载');
    signal?.throwIfAborted();
    const controller = new AbortController(), forward = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', forward, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
        const response = await fetchImpl(media.url, { method: 'GET', redirect: 'error', signal: controller.signal });
        controller.signal.throwIfAborted();
        if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== media.url) {
            await response.body?.cancel();
            throw new ILinkError('clawbot-untrusted-url', '微信附件下载发生了不允许的跳转');
        }
        if (!response.ok || !response.body) {
            await response.body?.cancel();
            throw new ILinkError('clawbot-http-error', '微信附件暂时无法下载，未发送到会话');
        }
        const cap = MEDIA_MAX_BYTES + (media.aesKey ? 16 : 0), length = response.headers.get('content-length');
        if (length && (!/^\d+$/u.test(length) || Number(length) > cap)) {
            await response.body.cancel();
            large();
        }
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        const abortRead = () => { void reader.cancel().catch(() => { }); };
        controller.signal.addEventListener('abort', abortRead, { once: true });
        try {
            while (true) {
                controller.signal.throwIfAborted();
                const part = await reader.read();
                controller.signal.throwIfAborted();
                if (part.done)
                    break;
                size += part.value.byteLength;
                if (size > cap) {
                    await reader.cancel();
                    large();
                }
                chunks.push(part.value);
            }
        }
        finally {
            controller.signal.removeEventListener('abort', abortRead);
            reader.releaseLock();
        }
        let data = Buffer.concat(chunks);
        if (media.aesKey) {
            try {
                const decipher = createDecipheriv('aes-128-ecb', aesKey(media.aesKey), null);
                data = Buffer.concat([decipher.update(data), decipher.final()]);
            }
            catch {
                throw new ILinkError('clawbot-invalid-response', '微信附件解密失败，未发送到会话；请在小程序或电脑上传原文件');
            }
        }
        if (data.length > MEDIA_MAX_BYTES)
            large();
        if (!data.length || media.bytes !== undefined && data.length !== media.bytes
            || media.md5 && createHash('md5').update(data).digest('hex') !== media.md5.toLowerCase()) {
            throw new ILinkError('clawbot-invalid-response', '微信附件完整性校验失败，未发送到会话');
        }
        controller.signal.throwIfAborted();
        return { name: detectedName(media, data), data };
    }
    catch (error) {
        signal?.throwIfAborted();
        if (timedOut)
            throw new ILinkError('clawbot-timeout', '微信附件下载超时，未发送到会话');
        if (error instanceof ILinkError)
            throw error;
        throw new ILinkError('clawbot-network-error', '微信附件暂时无法下载，未发送到会话');
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forward);
    }
}
