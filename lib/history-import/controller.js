import { randomUUID } from 'node:crypto';
import { countHistoryTurns, selectHistoryBranch } from './source.js';
import { operationIdentifier } from './receipts.js';
import { MAX_IMPORT_BYTES, IMPORT_CHUNK_BYTES } from './share.js';
import { NativeImportPreflightError } from './native.js';
import { validateInputObject } from '../object-crypto.js';
const TTL = 15 * 60_000;
const MEMORY_BYTES = 96 * 1024 * 1024;
const own = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function string(value, max = 512) {
    if (typeof value !== 'string' || !value || value.length > max)
        throw new Error('invalid-request');
    return value;
}
function importObject(input) {
    const name = string(input.name, 255);
    if (!/\.(json|zip)$/i.test(name) || /[\\/\u0000-\u001f\u007f]/.test(name))
        throw new Error('invalid-request');
    // No URL/path/account fields cross into the object loader. The name labels
    // a source only; no file is written or attached to a native DSH session.
    try {
        return validateInputObject(input.descriptor);
    }
    catch {
        throw new Error('invalid-request');
    }
}
function displayTitle(conversation) {
    const clean = (value) => value.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim();
    const original = clean(conversation.title);
    if (original && !/^(?:shared conversation|共享会话)$/i.test(original))
        return original.slice(0, 160);
    const first = clean(conversation.messages.find(message => message.role === 'user' && message.text.trim())?.text ?? '');
    return first ? Array.from(first).slice(0, 32).join('') : 'DeepSeek 网页会话';
}
function requestedTitle(input, conversation) {
    if (input === undefined)
        return displayTitle(conversation);
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(input))
        throw new Error('invalid-title');
    return input.trim();
}
const safeWarnings = {
    'attachment-content-unavailable': '附件仅含原记录，文件内容未包含在内。',
    'search-detail-unavailable': '部分检索记录未包含网页正文。',
    'unknown-fragment-type': '部分特殊片段仅保留为历史资料。',
};
const errors = {
    'invalid-request': '请求无效，请重新打开导入页面。',
    'expired': '本次预览已过期，请重新选择分享或文件。',
    'busy': '正在处理另一份导入，请稍后再试。',
    'capacity': '临时数据较多，请关闭其他导入页面后重试。',
    'invalid-operation': '导入标识无效，请重新打开页面。',
    'receipt-capacity': '本节点的导入回执已达到保留上限，请联系开发者整理。',
    'receipt-unavailable': '暂时无法核对已有导入，请到电脑确认，不要重复导入。',
    'operation-conflict': '这个导入操作已用于其他选择，请核对已有结果。',
    'upload-incomplete': '文件尚未传完，请重新选择文件。',
    'invalid-chunk': '文件传输顺序不一致，请重新选择文件。',
    'source-too-large': '本次数据超过导入大小限制，请改用单个会话的分享链接。',
    'conversation-too-large': '所选会话超过本版导入上限，未截断或创建会话。',
    'unsupported-message-role': '原记录中有无法确认角色的消息，未创建会话。请换用该会话的分享链接。',
    'empty-conversation': '这个会话没有可迁移的消息。',
    'cancelled': '本次读取已取消。',
    'parse-timeout': '读取数据超时，请改用单个会话的分享链接。',
    'native-unavailable': '此节点的 DSH 尚不支持这项导入，请更新 DSH。',
    'owner-changed': '账号或节点已变化，请重新选择导入来源。',
    'object-unavailable': '此节点尚不支持导入文件传输，请更新插件或改用分享链接。',
    'invalid-title': '会话名称须为 1 至 160 个字符，不能包含换行或控制字符。',
};
export function importError(error) {
    const value = error;
    const code = typeof value?.code === 'string' ? value.code : typeof value?.message === 'string' ? value.message : '';
    return { code: 'history-import/' + (errors[code] ? code : 'unavailable'), message: errors[code] || '暂时无法读取或导入这份数据，请核对来源后重试。已有会话不受影响。' };
}
/** Entirely demand-driven. Constructing this controller never reads native
 * sessions, starts a timer, connects to the web, or writes any file. */
export class HistoryImportController {
    ports;
    sources = new Map();
    previews = new Map();
    uploads = new Map();
    jobs = new Map();
    lifetime = new AbortController();
    preparing = false;
    readingBytes = 0;
    claiming = false;
    inspection;
    expiryTimer;
    constructor(ports) {
        this.ports = ports;
    }
    now() { return (this.ports.now ?? Date.now)(); }
    dispose() { this.lifetime.abort(); clearTimeout(this.expiryTimer); this.sources.clear(); this.previews.clear(); this.uploads.clear(); }
    expireLater() {
        clearTimeout(this.expiryTimer);
        const times = [...this.sources.values(), ...this.uploads.values()].map(value => value.expiresAt);
        if (!times.length)
            return;
        this.expiryTimer = setTimeout(() => { this.prune(); this.expireLater(); }, Math.max(1, Math.min(...times) - this.now()));
        this.expiryTimer.unref();
    }
    prune() {
        for (const [id, value] of this.sources)
            if (value.expiresAt <= this.now())
                this.sources.delete(id);
        for (const [id, value] of this.previews)
            if (value.expiresAt <= this.now() || !this.sources.has(value.sourceId))
                this.previews.delete(id);
        for (const [id, value] of this.uploads)
            if (value.expiresAt <= this.now())
                this.uploads.delete(id);
    }
    usage() {
        return [...this.sources.values()].reduce((sum, value) => sum + value.bytes, 0)
            + [...this.uploads.values()].reduce((sum, value) => sum + value.data.length, 0)
            + this.readingBytes;
    }
    source(id, owner) { const source = this.sources.get(string(id)); if (!source)
        throw new Error('expired'); if (owner !== undefined && source.owner !== owner)
        throw new Error('owner-changed'); return source; }
    catalog(id, input = {}, owner) {
        if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 120))
            throw new Error('invalid-request');
        const source = this.source(id, owner), cursor = input.cursor ?? 0, query = (input.query ?? '').trim().toLocaleLowerCase();
        if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 10000)
            throw new Error('invalid-request');
        const entries = query ? source.value.conversations.filter(c => displayTitle(c).toLocaleLowerCase().includes(query)) : source.value.conversations;
        return { sourceId: id, expiresAt: source.expiresAt, total: entries.length,
            entries: entries.slice(cursor, cursor + 40).map(c => ({ id: c.id, title: displayTitle(c), messages: c.messages.length, branches: c.leafIds.length,
                ...(c.leafIds.length === 1 ? { turnCount: countHistoryTurns(c.messages) } : {}) })),
            nextCursor: cursor + 40 < entries.length ? cursor + 40 : null };
    }
    async prepare(read, signal, authorization, readingBytes = 0) {
        if (this.preparing)
            throw new Error('busy');
        if (this.sources.size >= 2 || this.usage() + readingBytes > MEMORY_BYTES)
            throw new Error('capacity');
        this.preparing = true;
        this.readingBytes = readingBytes;
        const recheck = async () => {
            signal.throwIfAborted();
            if (readingBytes)
                await authorization.revalidate?.(signal);
            signal.throwIfAborted();
            authorization.assertCurrent();
        };
        try {
            authorization.assertCurrent();
            const data = await read();
            await recheck();
            if (!data.length || data.length > MAX_IMPORT_BYTES)
                throw new Error('source-too-large');
            const parsed = await this.ports.parse(data, signal);
            await recheck();
            if (this.usage() - this.readingBytes + parsed.bytes > MEMORY_BYTES)
                throw new Error('capacity');
            const id = randomUUID();
            this.sources.set(id, { value: parsed.source, bytes: parsed.bytes, expiresAt: this.now() + TTL, owner: authorization.owner });
            this.expireLater();
            return this.catalog(id, {}, authorization.owner);
        }
        finally {
            this.preparing = false;
            this.readingBytes = 0;
        }
    }
    preview(input, owner) {
        const source = this.source(input.sourceId, owner), conversation = source.value.conversations.find(c => c.id === string(input.conversationId));
        if (!conversation)
            throw new Error('invalid-request');
        if (conversation.leafIds.length > 1 && !input.branchId) {
            const cursor = input.branchCursor ?? 0;
            if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > conversation.leafIds.length)
                throw new Error('invalid-request');
            const byId = new Map(conversation.messages.map(m => [m.id, m]));
            return { title: displayTitle(conversation), selectionRequired: true,
                branchTotal: conversation.leafIds.length, branchNextCursor: cursor + 40 < conversation.leafIds.length ? cursor + 40 : null,
                branches: conversation.leafIds.slice(cursor, cursor + 40).map((id, index) => {
                    const path = [];
                    let node = byId.get(id);
                    while (node) {
                        path.push(node);
                        node = node.parentId === null ? undefined : byId.get(node.parentId);
                    }
                    const messages = path.length, turnCount = countHistoryTurns(path);
                    const leaf = byId.get(id);
                    return { id, label: `分支 ${cursor + index + 1} · ${turnCount === undefined ? `${messages} 条消息` : `${turnCount} 轮`} · ${(leaf.text || leaf.reasoning || '附件记录').slice(0, 56)}`, messages, turnCount };
                }) };
        }
        const selected = selectHistoryBranch(conversation, input.branchId === undefined ? undefined : string(input.branchId));
        if (selected.messages.length > 5000 || Buffer.byteLength(JSON.stringify(selected)) > 24 * 1024 * 1024)
            throw new Error('conversation-too-large');
        if (this.previews.size >= 8)
            throw new Error('capacity');
        const id = randomUUID(), expiresAt = source.expiresAt;
        this.previews.set(id, { sourceId: input.sourceId, conversation: selected, branchId: selected.leafIds[0], expiresAt });
        const summary = { messages: selected.messages.length, turnCount: countHistoryTurns(selected.messages), user: 0, assistant: 0, publicReasoning: 0, searches: 0, attachments: 0, characters: 0 };
        for (const message of selected.messages) {
            if (message.role === 'user')
                summary.user++;
            else
                summary.assistant++;
            if (message.reasoning)
                summary.publicReasoning++;
            summary.characters += message.text.length + message.reasoning.length;
            for (const part of message.fragments) {
                if (['SEARCH', 'TOOL_SEARCH', 'TOOL_OPEN'].includes(part.type))
                    summary.searches++;
                summary.attachments += part.files?.length ?? 0;
            }
        }
        return { previewId: id, title: displayTitle(selected), expiresAt, summary,
            warnings: [...new Set(selected.warnings.filter(w => safeWarnings[w]).map(w => safeWarnings[w]))],
            snippets: (selected.messages.length > 4 ? [...selected.messages.slice(0, 2), ...selected.messages.slice(-2)] : selected.messages)
                .map(m => ({ role: m.role, text: (m.text || '（无文字正文）').slice(0, 480) })) };
    }
    receiptView(receipt) {
        return { operationId: receipt.operationId, state: receipt.state,
            ...(receipt.state === 'succeeded' ? { sessionId: receipt.sessionId, workspaceId: receipt.workspaceId } : {}),
            ...(receipt.message ? { message: receipt.message } : {}) };
    }
    sameIntent(receipt, workspaceId, presetId, preview) {
        if (receipt.workspaceId !== workspaceId || receipt.presetId !== presetId
            || preview && (preview.conversation.id !== receipt.conversationId || preview.branchId !== receipt.branchId
                || this.source(preview.sourceId).value.sourceHash !== receipt.sourceHash))
            throw new Error('operation-conflict');
    }
    async status(operationId, signal) {
        const unverifiedOwner = () => ({ operationId, state: 'uncertain', message: '无法确认此操作属于当前账号和节点，请在电脑核对；不会重新导入。' });
        const receipt = await this.ports.receipts.read(operationId);
        if (!receipt)
            return { operationId, state: 'not-found', message: '未找到该操作的回执，请先到电脑核对，不要重复导入。' };
        // Recovery does not require entitlement/opt-in, but still belongs to the
        // authenticated account/node. Legacy receipts never prove new ownership.
        if (!receipt.ownerKey || receipt.ownerKey !== await this.ports.owner(signal))
            return unverifiedOwner();
        signal.throwIfAborted();
        if (this.jobs.has(operationId) || receipt.state === 'failed')
            return this.receiptView(receipt);
        // Even after an app restart or session deletion, report only evidence from
        // native persisted history. Status NEVER calls create/attach/flush/prompt.
        if (this.inspection && this.inspection.operationId !== operationId)
            throw new Error('busy');
        if (!this.inspection) {
            // Only one cold verification at a time, shared by duplicate phone polls.
            // A caller leaving the page must not cancel another caller's read.
            const value = this.ports.inspect(receipt, AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(30_000)]))
                .then(inspected => {
                const state = inspected.state === 'succeeded' ? 'succeeded' : 'uncertain';
                return { ...this.receiptView({ ...receipt, state }), ...(state === 'uncertain' ? { message: '暂未确认完整导入，请到电脑核对；不会自动重建或覆盖。' } : {}) };
            }).finally(() => { this.inspection = undefined; });
            this.inspection = { operationId, value };
        }
        const result = await this.inspection.value;
        if (receipt.ownerKey !== await this.ports.owner(signal))
            return unverifiedOwner();
        signal.throwIfAborted();
        return result;
    }
    async commit(input, signal, authorization) {
        const operationId = operationIdentifier(input.operationId), workspaceId = string(input.workspaceId, 256);
        const presetId = input.presetId === undefined ? undefined : string(input.presetId, 256);
        const old = await this.ports.receipts.read(operationId);
        signal.throwIfAborted();
        authorization.assertCurrent();
        if (old) {
            if (old.ownerKey !== authorization.owner)
                return this.status(operationId, signal);
            this.sameIntent(old, workspaceId, presetId, this.previews.get(input.previewId));
            return this.status(operationId, signal);
        }
        const preview = this.previews.get(string(input.previewId));
        if (!preview)
            throw new Error('expired');
        if (preview.operationId && preview.operationId !== operationId)
            throw new Error('operation-conflict');
        const source = this.source(preview.sourceId, authorization.owner);
        const title = requestedTitle(input.title, preview.conversation);
        if (this.claiming || this.jobs.size)
            throw new Error('busy');
        this.claiming = true;
        try {
            if (!(await this.ports.capabilities()).supported)
                throw new Error('native-unavailable');
            signal.throwIfAborted();
            authorization.assertCurrent();
            const receipt = { schema: 1, operationId, sessionId: 'session-dsimport-' + operationId,
                workspaceId, ...(presetId === undefined ? {} : { presetId }), sourceHash: source.value.sourceHash,
                conversationId: preview.conversation.id, branchId: preview.branchId, state: 'pending', createdAt: this.now(), ownerKey: authorization.owner, title };
            // Remember first intent even if local receipt IO fails; never let a new
            // phone UUID replay an ambiguous old click against this preview.
            preview.operationId = operationId;
            if (!await this.ports.receipts.claim(receipt)) {
                // Another controller can claim between the first read and our exclusive
                // write. Its receipt must match this intent, not merely the phone UUID.
                const claimed = await this.ports.receipts.read(operationId);
                if (!claimed)
                    throw new Error('receipt-unavailable');
                if (claimed.ownerKey !== authorization.owner)
                    return this.status(operationId, signal);
                this.sameIntent(claimed, workspaceId, presetId, preview);
                return this.status(operationId, signal);
            }
            const job = this.run(receipt, preview.conversation, authorization).finally(() => this.jobs.delete(operationId));
            this.jobs.set(operationId, job);
            return this.receiptView(receipt);
        }
        finally {
            this.claiming = false;
        }
    }
    async run(receipt, conversation, authorization) {
        let enteredNative = false;
        try {
            authorization.assertCurrent();
            enteredNative = true;
            await this.ports.commit({ ...receipt, conversation }, this.lifetime.signal, () => authorization.assertCurrent());
            const checked = await this.ports.inspect(receipt, this.lifetime.signal);
            receipt.state = checked.state === 'succeeded' ? 'succeeded' : 'uncertain';
        }
        catch (error) {
            // Only our adapter's positively identified pre-create rejection is safe
            // to finish as failed. An existing ID may belong to a prior ambiguous
            // write, so that case stays uncertain even though this call did not write.
            receipt.state = !enteredNative || error instanceof NativeImportPreflightError && error.code !== 'session-exists' ? 'failed' : 'uncertain';
            if (receipt.state === 'failed')
                receipt.message = '未创建新会话。请核对使用资格、功能开关和电脑上的导入设置后重新选择。';
        }
        if (receipt.state === 'uncertain')
            receipt.message = '暂未确认完整导入，请到电脑核对；不会自动重复创建。';
        // A durable pending intention remains recoverable by read-only native
        // verification if storing the final receipt fails. Never replay the job.
        await this.ports.receipts.save(receipt).catch(() => { });
    }
    async control(action, input, signal) {
        const scopeSignal = AbortSignal.any([signal, this.lifetime.signal]);
        scopeSignal.throwIfAborted();
        if (!own(input))
            throw new Error('invalid-request');
        this.prune();
        const authorization = ['capabilities', 'status', 'release'].includes(action) ? undefined : await this.ports.authorize(scopeSignal);
        scopeSignal.throwIfAborted();
        authorization?.assertCurrent();
        let result;
        switch (action) {
            case 'capabilities':
                result = { ...await this.ports.capabilities(), maxFileBytes: MAX_IMPORT_BYTES, chunkBytes: IMPORT_CHUNK_BYTES,
                    fileDelivery: this.ports.loadObject ? ['chunks', 'object'] : ['chunks'] };
                break;
            case 'share.preview':
                result = await this.prepare(() => this.ports.share(input.url, scopeSignal), scopeSignal, authorization);
                break;
            case 'source.object': {
                if (!this.ports.loadObject)
                    throw new Error('object-unavailable');
                const descriptor = importObject(input);
                result = await this.prepare(async () => {
                    const data = await this.ports.loadObject(descriptor, scopeSignal);
                    if (data.byteLength !== descriptor.plainBytes)
                        throw new Error('invalid-request');
                    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
                    // Reserve ciphertext, decrypted source and the parser worker's input
                    // copy. This is a data budget, not a promise about process RSS.
                }, scopeSignal, authorization, descriptor.cipherBytes + 2 * descriptor.plainBytes);
                break;
            }
            case 'upload.start': {
                if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_IMPORT_BYTES || !/\.(json|zip)$/i.test(string(input.name, 255)))
                    throw new Error('invalid-request');
                if (this.uploads.size >= 2 || this.usage() + input.size > MEMORY_BYTES)
                    throw new Error('capacity');
                const id = randomUUID();
                this.uploads.set(id, { data: Buffer.alloc(input.size), offset: 0, expiresAt: this.now() + TTL, owner: authorization.owner });
                this.expireLater();
                result = { uploadId: id, offset: 0, chunkBytes: IMPORT_CHUNK_BYTES };
                break;
            }
            case 'upload.chunk': {
                const upload = this.uploads.get(string(input.uploadId));
                if (!upload)
                    throw new Error('expired');
                if (upload.owner !== authorization.owner)
                    throw new Error('owner-changed');
                if (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset % IMPORT_CHUNK_BYTES || typeof input.data !== 'string'
                    || !input.data.length || input.data.length > Math.ceil(IMPORT_CHUNK_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))
                    throw new Error('invalid-chunk');
                const bytes = Buffer.from(input.data, 'base64'), end = input.offset + bytes.length;
                if (bytes.toString('base64') !== input.data || bytes.length !== Math.min(IMPORT_CHUNK_BYTES, upload.data.length - input.offset))
                    throw new Error('invalid-chunk');
                if (input.offset < upload.offset) {
                    if (end > upload.offset || !upload.data.subarray(input.offset, end).equals(bytes))
                        throw new Error('invalid-chunk');
                }
                else {
                    if (input.offset !== upload.offset)
                        throw new Error('invalid-chunk');
                    bytes.copy(upload.data, input.offset);
                    upload.offset = end;
                }
                result = { offset: upload.offset };
                break;
            }
            case 'upload.finish': {
                const id = string(input.uploadId), upload = this.uploads.get(id);
                if (!upload)
                    throw new Error('expired');
                if (upload.owner !== authorization.owner)
                    throw new Error('owner-changed');
                if (upload.offset !== upload.data.length)
                    throw new Error('upload-incomplete');
                result = await this.prepare(async () => { this.uploads.delete(id); return upload.data; }, scopeSignal, authorization);
                break;
            }
            case 'source.list':
                result = this.catalog(string(input.sourceId), input, authorization.owner);
                break;
            case 'preview':
                result = this.preview(input, authorization.owner);
                break;
            case 'commit':
                result = await this.commit(input, scopeSignal, authorization);
                break;
            case 'status':
                result = await this.status(operationIdentifier(input.operationId), scopeSignal);
                break;
            case 'release': {
                const owner = await this.ports.owner(scopeSignal);
                if (!owner) {
                    result = { released: false };
                    break;
                }
                const source = input.sourceId && this.sources.get(string(input.sourceId)), upload = input.uploadId && this.uploads.get(string(input.uploadId));
                const preview = input.previewId && this.previews.get(string(input.previewId));
                if (source && source.owner !== owner || upload && upload.owner !== owner || preview && this.source(preview.sourceId).owner !== owner)
                    throw new Error('owner-changed');
                if (input.sourceId)
                    this.sources.delete(string(input.sourceId));
                if (input.uploadId)
                    this.uploads.delete(string(input.uploadId));
                if (input.previewId)
                    this.previews.delete(string(input.previewId));
                this.prune();
                this.expireLater();
                result = { released: true };
                break;
            }
            default: throw new Error('invalid-request');
        }
        return { schema: 'wechat.history-import.v1', ...result };
    }
}
