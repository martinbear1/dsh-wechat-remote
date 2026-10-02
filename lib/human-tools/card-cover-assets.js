import { createHash } from 'node:crypto';
import { HUMAN_CARD_ASSET_MAX_BYTES, humanCardAsset } from './card-cover.js';
import { assertScope, copy, exact, fail, plain, row, sameScope, scopeValid, StateQueue } from '../human-workflow/data.js';
import { canonicalSubmission } from '../human-workflow/submission-crypto.js';
import { coverTransfer } from './card-cover-upload.js';
export function cardCoverSource(value) {
    if (!row(value))
        return;
    if (value.kind === 'attachment' && exact(value, ['kind', 'attachmentId']) && plain(value.attachmentId, 256))
        return { kind: 'attachment', attachmentId: value.attachmentId };
    if (value.kind === 'workspace' && exact(value, ['kind', 'reference']) && plain(value.reference, 4096)
        && !/[\x00-\x1f:]/.test(value.reference) && !/^[\\/]/.test(value.reference)
        && !value.reference.split(/[\\/]/).some(part => part === '..' || !part))
        return { kind: 'workspace', reference: value.reference };
}
const MAX_RECORDS = 32, RETAIN_MS = 24 * 60 * 60_000;
export const CARD_COVER_LEDGER_MAX_BYTES = 96 * 1024 * 1024;
const hash = (algorithm, value, encoding = 'hex') => createHash(algorithm).update(value).digest(encoding);
const same = (a, b) => canonicalSubmission(a) === canonicalSubmission(b);
function metadata(record) { return { sha256: record.sha256, md5: record.md5, bytes: record.bytes, mediaType: record.mediaType, width: record.width, height: record.height }; }
function matches(record, asset) {
    return record.sha256 === asset.sha256 && record.bytes === asset.bytes && record.mediaType === asset.mediaType && record.width === asset.width && record.height === asset.height;
}
/** One serialized writer per actual node/profile. Commit exact bytes before
 * requesting an OSS object; every retry uses the persisted request and bytes.
 * No model execution, publication, owner download ticket or secret in output. */
export class CardCoverAssets {
    options;
    state;
    lifetime = new AbortController();
    tail = Promise.resolve();
    constructor(options, state) {
        this.options = options;
        this.state = state;
    }
    static async open(options) {
        const raw = await options.store.load(), nodeId = options.transport.nodeId;
        const ledger = { schema: 'human.card.assets.local.v1', nodeId, records: [] };
        if (raw !== undefined) {
            if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'records']) || raw.schema !== ledger.schema || raw.nodeId !== nodeId
                || !Array.isArray(raw.records) || raw.records.length > MAX_RECORDS)
                throw fail('cover-store-invalid', '封面资产账本无效');
            const ids = new Set(), assets = new Set();
            for (const record of raw.records) {
                if (!row(record) || !exact(record, ['scope', 'requestId', 'sourceDigest', 'data', 'sha256', 'md5', 'mediaType', 'bytes', 'width', 'height', 'createdAt', 'state'], ['asset', 'expiresAt'])
                    || !scopeValid(record.scope) || record.scope.nodeId !== nodeId || typeof record.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(record.requestId)
                    || typeof record.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.sourceDigest) || typeof record.data !== 'string'
                    || record.data.length > Math.ceil(HUMAN_CARD_ASSET_MAX_BYTES / 3) * 4 || !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 0
                    || !['local', 'prepared', 'ready'].includes(String(record.state)) || ids.has(record.requestId))
                    throw fail('cover-store-invalid', '封面资产记录无效');
                const bytes = Buffer.from(record.data, 'base64');
                // md5 is intentionally excluded from the public reference.
                const publicMeta = { schema: 'human.card.asset.v1', assetRef: 'a'.repeat(32), sha256: record.sha256, bytes: record.bytes, mediaType: record.mediaType, width: record.width, height: record.height };
                if (!humanCardAsset(publicMeta) || bytes.toString('base64') !== record.data || bytes.length !== record.bytes
                    || hash('sha256', bytes) !== record.sha256 || hash('md5', bytes, 'base64') !== record.md5
                    || record.state === 'local' && (record.asset !== undefined || record.expiresAt !== undefined)
                    || record.state !== 'local' && (!humanCardAsset(record.asset) || !matches(record, record.asset)
                        || !Number.isSafeInteger(record.expiresAt) || Number(record.expiresAt) <= Number(record.createdAt)))
                    throw fail('cover-store-invalid', '封面图片摘要或状态不匹配');
                if (record.asset && assets.has(record.asset.assetRef))
                    throw fail('cover-store-invalid', '封面资产引用重复');
                if (record.asset)
                    assets.add(record.asset.assetRef);
                ids.add(record.requestId);
                ledger.records.push(copy(record));
            }
        }
        return new CardCoverAssets(options, new StateQueue(options.store, ledger, CARD_COVER_LEDGER_MAX_BYTES));
    }
    now() { return (this.options.now ?? Date.now)(); }
    active(scope, signal) {
        assertScope(scope, this.options.transport.nodeId);
        this.options.transport.assertIdentity();
        this.lifetime.signal.throwIfAborted();
        signal.throwIfAborted();
        return AbortSignal.any([signal, this.lifetime.signal]);
    }
    assertAsset(scope, asset) {
        this.active(scope, this.lifetime.signal);
        const record = this.state.current().records.find(record => record.asset?.assetRef === asset.assetRef && sameScope(scope, record.scope));
        if (!humanCardAsset(asset) || !record || record.state !== 'ready' || !same(record.asset, asset) || Number(record.expiresAt) <= this.now())
            throw fail('cover-asset-unavailable', '封面未就绪、已过期或不属于当前会话；请重新准备图片');
    }
    prepare(scope, source, rootCallId, signal) {
        const active = this.active(scope, signal), input = cardCoverSource(source);
        if (!input || !plain(rootCallId, 256))
            return Promise.reject(fail('cover-source-invalid', '封面来源无效'));
        const requestId = hash('sha256', canonicalSubmission([scope, rootCallId])), sourceDigest = hash('sha256', canonicalSubmission(input));
        const work = this.tail.then(async () => {
            this.active(scope, active);
            let record = this.state.current().records.find(item => item.requestId === requestId);
            if (record && record.sourceDigest !== sourceDigest)
                throw fail('cover-source-conflict', '此调用已锁定另一张图片，不能替换');
            if (!record) {
                const image = await this.options.read(scope, input, active);
                this.active(scope, active);
                const data = Buffer.from(image.data), candidate = humanCardAsset({ schema: 'human.card.asset.v1', assetRef: 'a'.repeat(32), sha256: hash('sha256', data),
                    bytes: data.length, mediaType: image.mediaType, width: image.width, height: image.height });
                if (!candidate)
                    throw fail('cover-image-invalid', '封面必须是2MiB内、5:4且边长不超过2048的PNG/JPEG图片');
                record = { scope: copy(scope), requestId, sourceDigest, data: data.toString('base64'), ...metadata({ ...candidate, md5: hash('md5', data, 'base64') }), createdAt: this.now(), state: 'local' };
                const saved = record;
                await this.state.update(next => {
                    next.records = next.records.filter(item => Math.max(item.createdAt + RETAIN_MS, Number(item.expiresAt || 0)) > this.now());
                    if (next.records.length >= MAX_RECORDS)
                        throw fail('cover-capacity', '待用封面已达本机保护上限，请等待过期后再准备');
                    next.records.push(saved);
                }, active);
            }
            if (record.state === 'ready') {
                this.assertAsset(scope, record.asset);
                // Node IDs can outlive a binding/account rotation. A local hit is not
                // fresh authority: reconcile the same cloud asset without another PUT.
                const current = await this.options.transport.request('cover-assets/finalize', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration, assetRef: record.asset.assetRef }, active);
                this.active(scope, active);
                if (!row(current) || current.state !== 'ready' || !same(current.asset, record.asset) || current.expiresAt !== record.expiresAt)
                    throw fail('cover-response-invalid', '封面当前授权无法核对');
                return copy(record.asset);
            }
            if (record.state === 'prepared' && record.asset) {
                // A prior PUT may have committed before a crash. Finalize uses HEAD,
                // not the expired PUT ticket, and never allocates another object.
                try {
                    const reconciled = await this.options.transport.request('cover-assets/finalize', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration, assetRef: record.asset.assetRef }, active);
                    this.active(scope, active);
                    if (!row(reconciled) || reconciled.state !== 'ready' || !same(reconciled.asset, record.asset) || reconciled.expiresAt !== record.expiresAt || Number(reconciled.expiresAt) <= this.now())
                        throw fail('cover-response-invalid', '原封面对象无法确认');
                    await this.state.update(next => { next.records.find(item => item.requestId === requestId).state = 'ready'; }, active);
                    return copy(record.asset);
                }
                catch (cause) {
                    if (!row(cause) || cause.code !== 'cover_upload_missing')
                        throw cause;
                }
            }
            const prepared = await this.options.transport.request('cover-assets/prepare', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration, requestId, ...metadata(record) }, active);
            this.active(scope, active);
            const asset = row(prepared) && humanCardAsset(prepared.asset);
            if (!row(prepared) || !asset || !matches(record, asset) || record.asset && !same(record.asset, asset)
                || !['prepared', 'ready'].includes(String(prepared.state)) || !Number.isSafeInteger(prepared.expiresAt) || Number(prepared.expiresAt) <= this.now())
                throw fail('cover-response-invalid', '封面服务返回的图片规格不一致');
            await this.state.update(next => { const item = next.records.find(item => item.requestId === requestId); item.asset = copy(asset); item.expiresAt = Number(prepared.expiresAt); item.state = prepared.state; }, active);
            if (prepared.state !== 'ready') {
                const image = { data: Buffer.from(record.data, 'base64'), mediaType: record.mediaType, width: record.width, height: record.height };
                if (coverTransfer(prepared.upload, 'PUT', image, record.md5).some(ticket => !new URL(ticket.url).pathname.endsWith(`/${asset.assetRef}.bin`)))
                    throw fail('cover-ticket-invalid', '上传目标与封面资产不匹配');
                await this.options.upload(prepared.upload, image, record.md5, active);
                this.active(scope, active);
                const finished = await this.options.transport.request('cover-assets/finalize', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration, assetRef: asset.assetRef }, active);
                this.active(scope, active);
                if (!row(finished) || finished.state !== 'ready' || !same(finished.asset, asset) || finished.expiresAt !== prepared.expiresAt)
                    throw fail('cover-response-invalid', '封面上传尚未确认，不会发出卡片');
                await this.state.update(next => { next.records.find(item => item.requestId === requestId).state = 'ready'; }, active);
            }
            this.active(scope, active);
            return copy(asset);
        });
        this.tail = work.catch(() => { });
        return work;
    }
    async preview(scope, asset, requestId, signal) {
        const active = this.active(scope, signal);
        this.assertAsset(scope, asset);
        if (!/^[A-Za-z0-9:_-]{16,128}$/.test(requestId))
            throw fail('cover-preview-invalid', '封面预览请求标识无效');
        const result = await this.options.transport.request('cover-assets/download', { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration, assetRef: asset.assetRef, requestId }, active);
        this.active(scope, active);
        this.assertAsset(scope, asset);
        if (!row(result) || !same(result.asset, asset) || !Number.isSafeInteger(result.expiresAt) || Number(result.expiresAt) <= this.now() || !row(result.download))
            throw fail('cover-response-invalid', '封面预览与已批准图片不一致');
        if (coverTransfer(result.download, 'GET').some(ticket => !new URL(ticket.url).pathname.endsWith(`/${asset.assetRef}.bin`)))
            throw fail('cover-ticket-invalid', '预览目标与封面资产不匹配');
        return { asset: copy(asset), download: copy(result.download), expiresAt: result.expiresAt };
    }
    async close() { this.lifetime.abort(fail('cover-disabled', '封面功能已关闭')); await this.tail; await this.state.close(); }
}
