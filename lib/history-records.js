import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { historyDetailDocument, historyRecordPreview } from './history-record-presentation.js';
import { toolRecordPresentation } from './tool-record-presentation.js';
// Normal inline tools share the existing 128 KiB page budget. Reserve 32 KiB
// for page identity/facets; do not impose the detail reader's 16 KiB chunk size
// on ordinary central-pane content. Total page and transport limits are unchanged.
export const HISTORY_RECORD_BYTES = 96 * 1024;
export const HISTORY_DETAIL_CHUNK_BYTES = 16 * 1024;
const CACHE_BYTES = 32 * 1024 * 1024;
const REFERENCE_TTL = 30 * 60_000;
const CACHE_TTL = 5 * 60_000;
const failure = (message) => Object.assign(new Error(message), { code: 'history-detail-unavailable' });
function snapshot(entry, call) {
    const document = historyDetailDocument(entry, call);
    const json = JSON.stringify(document);
    return { parts: document.parts.map(({ text, ...metadata }) => ({ metadata, text: Buffer.from(text) })),
        bytes: Buffer.byteLength(json), digest: createHash('sha256').update(json).digest('hex') };
}
/** Node-local readonly references. Session, sequence, matching call and the
 * entire presentation snapshot are pinned. No arbitrary path or native call. */
export class HistoryRecords {
    secret = randomBytes(32);
    cache = new Map();
    cachedBytes = 0;
    clear() { this.cache.clear(); this.cachedBytes = 0; }
    remember(value) {
        const existing = this.cache.get(value.digest);
        if (existing) {
            this.cachedBytes -= existing.value.bytes;
            this.cache.delete(value.digest);
        }
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.expires <= now || this.cachedBytes + value.bytes > CACHE_BYTES || this.cache.size >= 16) {
                this.cachedBytes -= entry.value.bytes;
                this.cache.delete(key);
            }
        }
        if (value.bytes <= CACHE_BYTES) {
            this.cache.set(value.digest, { value, expires: now + CACHE_TTL });
            this.cachedBytes += value.bytes;
        }
    }
    present(sessionId, entry, displayed = entry, call) {
        displayed = toolRecordPresentation(displayed);
        // Only the actual presentation consumes the phone's page budget. Native
        // records can retain megabytes of token samples behind a short reply;
        // those samples must not turn that complete reply into a partial preview.
        if (Buffer.byteLength(JSON.stringify(displayed)) <= HISTORY_RECORD_BYTES)
            return displayed;
        const seq = entry.event?.seq;
        if (!Number.isSafeInteger(seq) || seq < 0)
            throw failure('历史记录缺少原生序号');
        const source = snapshot(entry, call);
        this.remember(source);
        const payload = Buffer.from(JSON.stringify({ sessionId, seq, callSeq: call?.event?.seq,
            digest: source.digest, bytes: source.bytes, expires: Date.now() + REFERENCE_TTL })).toString('base64url');
        const reference = payload + '.' + createHmac('sha256', this.secret).update(payload).digest('base64url');
        const partial = { ...historyRecordPreview(displayed), detail: {
                schema: 'agent.history-detail.v1', reference, seq, bytes: source.bytes, format: 'parts',
            } };
        if (Buffer.byteLength(JSON.stringify(partial)) > HISTORY_RECORD_BYTES)
            throw failure('记录的标识或关联信息超过手机单条展示上限，请在电脑端查看');
        return partial;
    }
    async read(request, load, signal) {
        signal.throwIfAborted();
        const { reference, sessionId } = request;
        const offset = request.offset ?? 0, part = request.part ?? 0;
        if (typeof reference !== 'string' || reference.length > 4096 || !Number.isSafeInteger(offset) || offset < 0
            || !Number.isSafeInteger(part) || part < 0)
            throw failure('详情请求无效');
        const [payload, signature, extra] = reference.split('.');
        const actual = Buffer.from(signature || '', 'base64url');
        const expected = createHmac('sha256', this.secret).update(payload || '').digest();
        if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected))
            throw failure('详情引用无效，请刷新会话');
        const identity = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (identity.sessionId !== sessionId || identity.expires <= Date.now())
            throw failure('详情引用已失效，请刷新会话');
        let cached = this.cache.get(identity.digest);
        if (!cached || cached.expires <= Date.now()) {
            const original = await load(identity.seq);
            signal.throwIfAborted();
            if (!original || original.event?.seq !== identity.seq)
                throw failure('原始记录已不可读取，请刷新会话');
            const call = identity.callSeq === undefined ? undefined : await load(identity.callSeq);
            signal.throwIfAborted();
            if (identity.callSeq !== undefined && call?.event?.seq !== identity.callSeq)
                throw failure('工具调用已不可读取，请刷新会话');
            const value = snapshot(original, call);
            if (value.bytes !== identity.bytes || value.digest !== identity.digest)
                throw failure('原始记录已变化，请刷新会话');
            this.remember(value);
            cached = { value, expires: Date.now() + CACHE_TTL };
        }
        const source = cached.value.parts[part];
        if (!source || offset > source.text.length)
            throw failure('详情位置无效');
        const bytes = source.text;
        if (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)
            throw failure('详情位置不是有效文字边界');
        let end = Math.min(bytes.length, offset + HISTORY_DETAIL_CHUNK_BYTES);
        while (end < bytes.length && (bytes[end] & 0xc0) === 0x80)
            end--;
        return { ...source.metadata, schema: 'agent.history-detail.v1', seq: identity.seq, part,
            partCount: cached.value.parts.length, offset, nextOffset: end, bytes: bytes.length,
            text: bytes.subarray(offset, end).toString('utf8'), eof: end === bytes.length };
    }
}
