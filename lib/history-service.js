var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/**
 * 微信小程序专用的会话历史语义窗口。
 *
 * DSH 原生 session.history 会保留生成期 assistant/chunk；一个长工具轮次
 * 可能因此达到数 MB。局域网尚可接受，公网 E2EE 中继却会把这些已经被
 * assistant/message 取代的增量完整搬到手机。本服务仍以 DSH 原生历史为
 * 唯一数据源，只在电脑端完成两项确定性变换：
 *
 * window 保留旧客户端的完整轮次契约；page 是显式选择的有界分页，
 * 不补齐整轮、不走 OSS。大正文的只读引用由 detail 按需读取。
 * 两者都只移除已完成且有持久回复替代的生成增量；原始会话保持不变。
 *
 * 它是微信插件自己的只读 Typert Remote，不修改 DSH 会话、WebUI 或原生
 * session.history 契约，也不新增监听端口。
 */
import http from 'node:http';
import { resourcePresentation } from './agent-resources.js';
import { TurnActivityCompatibility } from './turn-activity.js';
import { assistantRecordPresentation } from './assistant-stream-compat.js';
import { archiveHistoryJsonAsync, HISTORY_ARCHIVE_ENTRY } from './history-archive.js';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createHistoryPageReader, resolveTypertGateway } from './dsh-protocol-compat.js';
import { nativeTurnUsage, turnDetails } from './turn-presentation.js';
import { HistoryReadBudget } from './history-read-budget.js';
import { HistoryRecords } from './history-records.js';
import { HistoryTurnEvidence } from './history-turn-evidence.js';
import { resolveDshSessionAddress } from './dsh-session-address.js';
const DEFAULT_PAGE_MESSAGES = 8;
const MAX_PAGE_MESSAGES = 30;
const MAX_PAGES = 64;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
// Above this clear-text size the history service prepares a compressed
// transport. Small ZIPs stay inside the existing E2EE response; only
// genuinely large archives are handed to object storage.
const DEFAULT_SNAPSHOT_THRESHOLD_BYTES = 32 * 1024;
// Compressed history has one transport policy, owned here beside pagination.
// Small archives stay in the authenticated Remote response. Larger archives
// use private object storage when it is reachable. The released mini program
// accepts at most 512 KiB of Base64, hence the 384 KiB binary ceiling.
const FAST_INLINE_ARCHIVE_MAX_BYTES = 96 * 1024;
const COMPATIBLE_INLINE_ARCHIVE_MAX_BYTES = 384 * 1024;
// Opt-in pages bound presentation work and the first-screen transfer. The
// legacy complete-turn contract remains unchanged for installed clients.
const BOUNDED_PAGE_BYTES = 128 * 1024;
const BOUNDED_PAGE_EVENTS = 256;
let WechatHistoryService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _page_decorators;
    let _detail_decorators;
    let _window_decorators;
    return class WechatHistoryService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _page_decorators = [Remote('page')];
            _detail_decorators = [Remote('detail')];
            _window_decorators = [Remote('window')];
            __esDecorate(this, null, _page_decorators, { kind: "method", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: obj => "detail" in obj, get: obj => obj.detail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _window_decorators, { kind: "method", name: "window", static: false, private: false, access: { has: obj => "window" in obj, get: obj => obj.window }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        reads = (__runInitializers(this, _instanceExtraInitializers), new HistoryReadBudget());
        records = new HistoryRecords();
        turnEvidence = new HistoryTurnEvidence();
        hostContext;
        dshPort;
        timeoutMs;
        snapshotThresholdBytes;
        storeSnapshot;
        constructor(ctx, config = {}) {
            super(ctx, 'wechatHistory');
            this.hostContext = ctx;
            this.dshPort = Number.isSafeInteger(config.dshPort) && Number(config.dshPort) > 0
                ? Number(config.dshPort)
                : 3080;
            this.timeoutMs = Number.isSafeInteger(config.timeoutMs) && Number(config.timeoutMs) > 0
                ? Number(config.timeoutMs)
                : DEFAULT_TIMEOUT_MS;
            this.snapshotThresholdBytes = Number.isSafeInteger(config.snapshotThresholdBytes)
                && Number(config.snapshotThresholdBytes) >= 16 * 1024
                ? Number(config.snapshotThresholdBytes)
                : DEFAULT_SNAPSHOT_THRESHOLD_BYTES;
            this.storeSnapshot = config.storeSnapshot;
            ctx.effect(() => () => { this.records.clear(); this.turnEvidence.clear(); });
        }
        /** Host-only presentation shared by history and realtime peers.
         * Not a Remote: identity is issued here, and detail() rechecks access. */
        presentRecord(sessionId, original, displayed = original, call) {
            return this.records.present(sessionId, original, displayed, call);
        }
        /** New clients explicitly opt into a bounded page contract. This endpoint
         * never uploads history to OSS or recursively completes a partial turn. */
        async page(request, signal) {
            const validation = validateRequest(request);
            if (validation)
                return { ok: false, error: validation };
            if (!resolveTypertGateway(this.hostContext))
                return { ok: false, error: {
                        code: 'invocation-unavailable', message: '当前 DSH 使用旧版历史接口',
                    } };
            signal = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs || DEFAULT_TIMEOUT_MS)]);
            let release;
            try {
                release = await this.reads.acquire(signal);
                const usage = await nativeTurnUsage();
                const built = await buildBoundedHistoryWindow(request, this.createPageReader(request.sessionId, signal), signal, usage, (original, displayed, call) => this.presentRecord(request.sessionId, original, displayed, call), entries => this.turnEvidence.accept(request.sessionId, entries, usage));
                signal.throwIfAborted();
                if (!built.ok)
                    return built;
                const payloadJson = JSON.stringify(built.value);
                return Buffer.byteLength(payloadJson) < this.snapshotThresholdBytes
                    ? { ok: true, value: { payloadJson } }
                    : inlineArchive(payloadJson, await archiveHistoryJsonAsync(payloadJson, signal));
            }
            catch (error) {
                signal.throwIfAborted();
                return { ok: false, error: { code: error?.code === 'history-busy' ? 'history-busy' : 'history-unavailable', message: messageOf(error) } };
            }
            finally {
                release?.();
            }
        }
        async detail(request, signal) {
            const validation = validateRequest(request);
            if (validation)
                return { ok: false, error: validation };
            signal = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs || DEFAULT_TIMEOUT_MS)]);
            let release;
            try {
                release = await this.reads.acquire(signal);
                const gateway = resolveTypertGateway(this.hostContext);
                if (!gateway)
                    throw new Error('此节点尚不支持记录详情读取');
                await resolveDshSessionAddress(gateway, request.sessionId, signal);
                const read = this.createPageReader(request.sessionId, signal);
                const value = await this.records.read(request, async (seq) => {
                    const result = await read({ sessionId: request.sessionId, beforeSeq: seq + 1, maxMessages: 1 }, signal);
                    if (!result.ok)
                        throw new Error(String(result.error?.message || '原生记录不可读取'));
                    return result.value?.events?.find(entry => eventSeqOf(entry) === seq);
                }, signal);
                return { ok: true, value: { payloadJson: JSON.stringify(value) } };
            }
            catch (error) {
                signal.throwIfAborted();
                return { ok: false, error: { code: error?.code === 'history-busy' ? 'history-busy' : 'history-detail-unavailable', message: messageOf(error) } };
            }
            finally {
                release?.();
            }
        }
        // COMPAT(history-window-v1): released clients still use the complete-turn
        // endpoint, including OSS snapshots. Retire only with their support policy;
        // page()/detail() never need OSS. Coordinate with the mini-program's
        // docs/COMPATIBILITY-RETIREMENT.md, not the shared image/file object service.
        async window(request, signal) {
            const validation = validateRequest(request);
            if (validation)
                return { ok: false, error: validation };
            // One budget covers native pagination, compression and object delivery.
            // A timeout on each page separately could otherwise occupy the host for minutes.
            signal = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs || DEFAULT_TIMEOUT_MS)]);
            let release;
            try {
                release = await this.reads.acquire(signal);
                signal.throwIfAborted();
                const fetchPage = this.createPageReader(request.sessionId, signal);
                const usageFold = await nativeTurnUsage();
                signal.throwIfAborted();
                let maxMessages = request.maxMessages ?? DEFAULT_PAGE_MESSAGES;
                const legacyInline = request.delivery === 'inline' && request.acceptInlineArchive !== true;
                let objectStoreUnavailable = !this.storeSnapshot || request.delivery === 'inline';
                while (true) {
                    const candidate = { ...request, maxMessages };
                    const built = await buildHistoryWindow(candidate, fetchPage, signal, usageFold);
                    signal.throwIfAborted();
                    if (!built.ok)
                        return built;
                    const payloadJson = JSON.stringify(built.value);
                    if (legacyInline
                        || Buffer.byteLength(payloadJson) < this.snapshotThresholdBytes) {
                        return { ok: true, value: { payloadJson } };
                    }
                    const archive = await archiveHistoryJsonAsync(payloadJson, signal);
                    if (archive.byteLength <= FAST_INLINE_ARCHIVE_MAX_BYTES) {
                        return inlineArchive(payloadJson, archive);
                    }
                    if (!objectStoreUnavailable && this.storeSnapshot) {
                        try {
                            return { ok: true, value: {
                                    snapshotJson: JSON.stringify(await this.storeSnapshot(payloadJson, archive, signal)),
                                } };
                        }
                        catch {
                            signal.throwIfAborted();
                            // Object storage accelerates history; it is not the source of
                            // truth. Mark it unavailable for this request so adaptive paging
                            // never repeats a failing network probe for every smaller window.
                            objectStoreUnavailable = true;
                        }
                    }
                    if (archive.byteLength <= COMPATIBLE_INLINE_ARCHIVE_MAX_BYTES) {
                        return inlineArchive(payloadJson, archive);
                    }
                    if (maxMessages <= 1) {
                        return {
                            ok: false,
                            error: {
                                code: 'history-unavailable',
                                message: '当前网络无法传输这一条超大历史记录，请稍后重试或在电脑端查看',
                            },
                        };
                    }
                    maxMessages = nextHistoryWindowSize(maxMessages);
                }
            }
            catch (error) {
                signal.throwIfAborted();
                return {
                    ok: false,
                    error: { code: error instanceof Error && 'code' in error && error.code === 'history-busy'
                            ? 'history-busy' : 'history-unavailable', message: messageOf(error) },
                };
            }
            finally {
                release?.();
            }
        }
        createPageReader(sessionId, signal) {
            const gateway = resolveTypertGateway(this.hostContext);
            if (!gateway)
                return (payload, pageSignal) => this.fetchNativePage(payload, pageSignal);
            const read = createHistoryPageReader(gateway, sessionId, signal);
            return async (payload) => ({ ok: true, value: await read(payload) });
        }
        fetchNativePage(payload, signal) {
            signal.throwIfAborted();
            const body = Buffer.from(JSON.stringify({
                type: 'client-request',
                rpcId: `wechat-history-${Date.now().toString(36)}`,
                method: 'session.history',
                payload,
            }));
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (callback) => {
                    if (settled)
                        return;
                    settled = true;
                    signal.removeEventListener('abort', abort);
                    callback();
                };
                const request = http.request({
                    host: '127.0.0.1',
                    port: this.dshPort,
                    path: '/api/session.history',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': body.length,
                        accept: 'application/json',
                        'accept-encoding': 'identity',
                        'user-agent': 'HarnessRemote-WechatHistory/1',
                    },
                    timeout: this.timeoutMs,
                }, response => {
                    const chunks = [];
                    let bytes = 0;
                    response.on('data', (chunk) => {
                        bytes += chunk.length;
                        if (bytes > MAX_RESPONSE_BYTES) {
                            response.destroy(new Error('DSH history page exceeds 32 MiB'));
                            return;
                        }
                        chunks.push(Buffer.from(chunk));
                    });
                    response.on('end', () => {
                        try {
                            if (response.statusCode !== 200)
                                throw new Error(`DSH history HTTP ${response.statusCode || 0}`);
                            const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                            if (!envelope.result || typeof envelope.result.ok !== 'boolean') {
                                throw new Error('DSH history returned an invalid response');
                            }
                            finish(() => resolve(envelope.result));
                        }
                        catch (error) {
                            finish(() => reject(error));
                        }
                    });
                    response.on('error', error => finish(() => reject(error)));
                });
                const abort = () => { request.destroy(new Error('History request aborted')); };
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted)
                    abort();
                request.on('timeout', () => request.destroy(new Error('DSH history request timed out')));
                request.on('error', error => finish(() => reject(error)));
                request.end(body);
            });
        }
    };
})();
export { WechatHistoryService };
function inlineArchive(payloadJson, archive) {
    return {
        ok: true,
        value: {
            snapshotJson: JSON.stringify({
                contentKind: 'history-json',
                contentEncoding: 'zip',
                archiveEntry: HISTORY_ARCHIVE_ENTRY,
                originalBytes: Buffer.byteLength(payloadJson),
                archiveBase64: Buffer.from(archive).toString('base64'),
            }),
        },
    };
}
function nextHistoryWindowSize(current) {
    return Math.max(1, Math.floor(current / 2));
}
/** Exported pure coordinator for deterministic plugin regression tests. */
export async function buildHistoryWindow(request, fetchPage, signal, usageFold) {
    const validation = validateRequest(request);
    if (validation)
        return { ok: false, error: validation };
    const maxMessages = request.maxMessages ?? DEFAULT_PAGE_MESSAGES;
    const pages = [];
    const completedTurns = new Set();
    const durableMessageTurns = new Set();
    let cursor = request.beforeSeq;
    let previousCursor;
    let targetTurn;
    let tailValue;
    let oldestValue;
    let historyStartSeq;
    let historyEndSeq;
    let rawEvents = 0;
    let rawBytes = 0;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
        signal.throwIfAborted();
        const payload = {
            sessionId: request.sessionId,
            maxMessages,
            ...(cursor === undefined ? {} : { beforeSeq: cursor }),
        };
        const response = await fetchPage(payload, signal);
        signal.throwIfAborted();
        if (!response.ok || !response.value) {
            return {
                ok: false,
                error: {
                    code: 'history-unavailable',
                    message: typeof response.error?.message === 'string'
                        ? response.error.message
                        : 'DSH 会话历史不可用',
                },
            };
        }
        const value = response.value;
        const entries = Array.isArray(value.events) ? Array.from(value.events) : [];
        rawBytes += Buffer.byteLength(JSON.stringify(value));
        if (rawBytes > MAX_RESPONSE_BYTES) {
            return { ok: false, error: { code: 'history-unavailable', message: '当前历史窗口过大，请缩小范围后重试' } };
        }
        rawEvents += entries.length;
        if (!tailValue) {
            tailValue = value;
            targetTurn = firstTurnOf(entries);
            historyEndSeq = eventSeqOf(entries[entries.length - 1]);
        }
        oldestValue = value;
        const firstSeq = eventSeqOf(entries[0]);
        if (firstSeq !== undefined)
            historyStartSeq = firstSeq;
        markCompletedTurns(entries, completedTurns);
        markDurableMessageTurns(entries, durableMessageTurns);
        pages.unshift(entries);
        if (targetTurn === undefined || hasTurnStart(entries, targetTurn)
            || value.hasMore !== true || entries.length === 0) {
            const collected = pages.flat();
            const targetStart = collected.findIndex(entry => entry.event?.type === 'turn/start'
                && String(entry.event.data?.turn) === targetTurn);
            // Backfill can overshoot into an even older turn. Leave that prefix for
            // the next cursor instead of returning another half-turn (or recursively
            // loading the entire session). Preserve the full origin when reached.
            const trim = oldestValue?.hasMore === true && targetStart > 0 ? targetStart : 0;
            const windowEntries = collected.slice(trim);
            historyStartSeq = eventSeqOf(windowEntries[0]);
            return {
                ok: true,
                value: {
                    ...(tailValue || {}),
                    events: projectHistoryEntries(compactEntries(windowEntries, completedTurns, durableMessageTurns)),
                    facets: { 'agent.turn-details.v1': turnDetails(windowEntries, usageFold) },
                    hasMore: trim > 0 || oldestValue?.hasMore === true,
                    historyStartSeq,
                    historyEndSeq,
                    pages: pages.length,
                    rawEvents,
                },
            };
        }
        if (firstSeq === undefined || (previousCursor !== undefined && firstSeq >= previousCursor)
            || (cursor !== undefined && firstSeq >= cursor)) {
            return {
                ok: false,
                error: { code: 'history-pagination-invalid', message: 'DSH 历史分页没有继续前进' },
            };
        }
        previousCursor = firstSeq;
        cursor = firstSeq;
    }
    return {
        ok: false,
        error: { code: 'history-pagination-invalid', message: 'DSH 单轮历史超过安全分页上限' },
    };
}
/** One native read followed by a contiguous, byte-bounded presentation suffix.
 * Native data stays intact. Large records have explicit readonly detail refs.
 * Transcript append-source groups are indivisible; model-context replacements
 * retain their references without pulling older context into a display page. */
export async function buildBoundedHistoryWindow(request, fetchPage, signal, usageFold, present = (_original, displayed) => displayed, metadata) {
    const validation = validateRequest(request);
    if (validation)
        return { ok: false, error: validation };
    signal.throwIfAborted();
    const response = await fetchPage({ sessionId: request.sessionId,
        maxMessages: request.maxMessages ?? DEFAULT_PAGE_MESSAGES,
        ...(request.beforeSeq === undefined ? {} : { beforeSeq: request.beforeSeq }),
    }, signal);
    signal.throwIfAborted();
    if (!response.ok || !response.value)
        return { ok: false, error: {
                code: 'history-unavailable', message: String(response.error?.message || 'DSH 会话历史不可用'),
            } };
    const value = response.value, entries = value.events;
    if (!Array.isArray(entries) || !validPageOrder(entries, request.beforeSeq) || !entries.length && value.hasMore === true) {
        return { ok: false, error: { code: 'history-pagination-invalid', message: 'DSH 历史分页范围无效' } };
    }
    const completed = new Set(), durable = new Set();
    markCompletedTurns(entries, completed);
    markDurableMessageTurns(entries, durable);
    const projected = projectHistoryEntries(compactEntries(entries, completed, durable));
    const originals = new Map(entries.map(entry => [eventSeqOf(entry), entry]));
    const calls = new Map(entries.filter(entry => entry.event?.type === 'tool/call').map(entry => [entry.event?.data?.callId, entry]));
    const rendered = new Map();
    const row = (entry) => {
        const seq = Number(eventSeqOf(entry));
        const callId = entry.event?.data?.message?.source?.callId;
        const call = callId === undefined ? undefined : calls.get(callId);
        if (!rendered.has(seq))
            rendered.set(seq, present(originals.get(seq), entry, call && Number(eventSeqOf(call)) < seq ? call : undefined));
        return rendered.get(seq);
    };
    const facets = metadata?.(entries) ?? { details: turnDetails(entries, usageFold), activity: [] };
    const to = Number.isSafeInteger(value.historyEndSeq) ? Number(value.historyEndSeq) : eventSeqOf(entries.at(-1));
    let selected = [], accepted;
    // Add one complete transcript source group at a time, newest to oldest. Final JSON
    // size (including views/projections/facets/references) owns the wire budget.
    for (let end = projected.length; end > 0;) {
        let start = end - 1, from = Number(eventSeqOf(projected[start]));
        for (let i = end - 1; i >= start; i--) {
            const event = projected[i].event;
            // DSH's transcript uses append events, including older logs without a
            // surface marker. Replacement sources belong to the model context, not
            // a visible message group; native follow/page may leave them on an older
            // page. Keep the event/reference intact, but do not expand this page for it.
            if (event?.surfaceOp !== undefined && event.surfaceOp !== 'append')
                continue;
            const sources = event?.sourceEventSeqs;
            if (Array.isArray(sources))
                for (const source of sources) {
                    if (Number.isSafeInteger(source) && source >= 0 && source < from) {
                        while (start > 0 && Number(eventSeqOf(projected[start])) > source)
                            start--;
                        from = Number(eventSeqOf(projected[start]));
                        if (from > source)
                            return { ok: false, error: { code: 'history-pagination-invalid', message: '原生历史来源组不完整' } };
                    }
                }
        }
        const next = projected.slice(start, end).map(row).concat(selected);
        const coverageFrom = start === 0 ? eventSeqOf(entries[0]) : from;
        const visibleTurns = new Set(next.map(entry => String(entry.event?.data?.turn)));
        const candidate = {
            ...value, events: next,
            facets: { 'agent.turn-details.v1': facets.details.filter(detail => visibleTurns.has(detail.turnId)),
                'agent.turn-activity.v1': facets.activity.filter(view => visibleTurns.has(String(view.turn))) },
            hasMore: start > 0 || value.hasMore === true, historyStartSeq: coverageFrom, historyEndSeq: to,
            pages: 1, rawEvents: entries.length,
            coverage: { schema: 'wechat.history-page.v1', fromSeq: coverageFrom, throughSeq: to },
        };
        if (next.length > BOUNDED_PAGE_EVENTS || Buffer.byteLength(JSON.stringify(candidate)) > BOUNDED_PAGE_BYTES)
            break;
        accepted = candidate;
        selected = next;
        end = start;
        signal.throwIfAborted();
    }
    if (!projected.length) {
        const empty = { ...value, events: [], hasMore: value.hasMore === true,
            historyStartSeq: eventSeqOf(entries[0]), historyEndSeq: to, pages: 1, rawEvents: entries.length,
            coverage: { schema: 'wechat.history-page.v1', fromSeq: eventSeqOf(entries[0]), throughSeq: to } };
        if (Buffer.byteLength(JSON.stringify(empty)) <= BOUNDED_PAGE_BYTES)
            return { ok: true, value: empty };
    }
    return accepted ? { ok: true, value: accepted } : { ok: false, error: {
            code: 'history-unavailable', message: '原生历史分组或状态信息超过单页预算，请在电脑端查看',
        } };
}
function validPageOrder(entries, beforeSeq) {
    let previous = -1;
    for (const entry of entries) {
        const seq = eventSeqOf(entry);
        if (seq === undefined || seq <= previous || beforeSeq !== undefined && seq >= beforeSeq)
            return false;
        previous = seq;
    }
    return true;
}
function projectHistoryEntries(entries) {
    const activity = new TurnActivityCompatibility();
    return entries.map(entry => {
        const resources = resourcePresentation((entry.event || {}));
        const turnActivity = activity.accept(entry.event || {});
        const projected = assistantRecordPresentation(entry);
        return resources || turnActivity ? { ...projected, view: { ...(projected.view || {}),
                ...(turnActivity ? { agentActivity: turnActivity } : {}),
                ...(resources ? { agentResources: resources } : {}), } } : projected;
    });
}
function validateRequest(request) {
    if (!request || typeof request.sessionId !== 'string'
        || request.sessionId.length < 1 || request.sessionId.length > 256
        || /[\u0000-\u001f\u007f]/.test(request.sessionId)) {
        return { code: 'invalid-history-request', message: '会话标识无效' };
    }
    if (request.beforeSeq !== undefined
        && (!Number.isSafeInteger(request.beforeSeq) || request.beforeSeq < 0)) {
        return { code: 'invalid-history-request', message: '历史游标无效' };
    }
    if (request.maxMessages !== undefined
        && (!Number.isSafeInteger(request.maxMessages)
            || request.maxMessages < 1 || request.maxMessages > MAX_PAGE_MESSAGES)) {
        return { code: 'invalid-history-request', message: '历史窗口大小无效' };
    }
    if (request.delivery !== undefined && request.delivery !== 'auto' && request.delivery !== 'inline') {
        return { code: 'invalid-history-request', message: '历史传输方式无效' };
    }
    if (request.acceptInlineArchive !== undefined && typeof request.acceptInlineArchive !== 'boolean') {
        return { code: 'invalid-history-request', message: '历史传输能力无效' };
    }
    return null;
}
function eventSeqOf(entry) {
    const seq = entry?.event?.seq;
    return typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : undefined;
}
function firstTurnOf(entries) {
    for (let index = 0; index < entries.length; index += 1) {
        const turn = entries[index]?.event?.data?.turn;
        if (turn !== undefined && turn !== null)
            return String(turn);
    }
    return undefined;
}
function hasTurnStart(entries, targetTurn) {
    return entries.some(entry => entry.event?.type === 'turn/start'
        && String(entry.event.data?.turn) === targetTurn);
}
function markCompletedTurns(entries, completedTurns) {
    for (const entry of entries) {
        const event = entry.event;
        const reason = event?.data?.reason;
        if (event?.type === 'turn/end' && reason && typeof reason === 'object'
            && reason.kind === 'completed') {
            completedTurns.add(String(event.data?.turn));
        }
    }
}
function markDurableMessageTurns(entries, durableTurns) {
    for (const entry of entries) {
        const event = entry.event;
        if (event?.type === 'assistant/message' && event.data?.turn !== undefined) {
            durableTurns.add(String(event.data.turn));
        }
    }
}
function compactEntries(entries, completedTurns, durableMessageTurns) {
    if (completedTurns.size === 0 || durableMessageTurns.size === 0)
        return Array.from(entries);
    return entries.filter(entry => {
        const event = entry.event;
        return event?.type !== 'assistant/chunk'
            || !completedTurns.has(String(event.data?.turn))
            || !durableMessageTurns.has(String(event.data?.turn));
    });
}
function messageOf(error) {
    return error instanceof Error && error.message ? error.message : String(error || 'DSH 会话历史不可用');
}
export default WechatHistoryService;
