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
 * 1. 向前补齐到最新轮次的 turn/start，避免工具和生成产物被分页截断；
 * 2. 仅删除 reason.kind=completed 轮次的 assistant/chunk，保留消息、工具、
 *    view、投影与失败/中断轮次的部分输出。
 *
 * 它是微信插件自己的只读 Typert Remote，不修改 DSH 会话、WebUI 或原生
 * session.history 契约，也不新增监听端口。
 */
import http from 'node:http';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
const DEFAULT_PAGE_MESSAGES = 8;
const MAX_PAGE_MESSAGES = 30;
const MAX_PAGES = 64;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
// Above this clear-text size we prepare a compressed transport.  The gateway
// keeps small ZIPs inside the existing E2EE response and sends only genuinely
// large archives through OSS, so transport selection is based on wire size.
const DEFAULT_SNAPSHOT_THRESHOLD_BYTES = 32 * 1024;
let WechatHistoryService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _window_decorators;
    return class WechatHistoryService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _window_decorators = [Remote('window')];
            __esDecorate(this, null, _window_decorators, { kind: "method", name: "window", static: false, private: false, access: { has: obj => "window" in obj, get: obj => obj.window }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        dshPort = __runInitializers(this, _instanceExtraInitializers);
        timeoutMs;
        snapshotThresholdBytes;
        prepareSnapshot;
        constructor(ctx, config = {}) {
            super(ctx, 'wechatHistory');
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
            this.prepareSnapshot = config.prepareSnapshot;
        }
        async window(request, signal) {
            const validation = validateRequest(request);
            if (validation)
                return { ok: false, error: validation };
            try {
                const built = await buildHistoryWindow(request, (payload, pageSignal) => (this.fetchNativePage(payload, pageSignal)), signal);
                if (!built.ok)
                    return built;
                const payloadJson = JSON.stringify(built.value);
                if (request.delivery !== 'inline' && this.prepareSnapshot
                    && Buffer.byteLength(payloadJson) >= this.snapshotThresholdBytes) {
                    try {
                        return { ok: true, value: { snapshotJson: JSON.stringify(await this.prepareSnapshot(payloadJson)) } };
                    }
                    catch {
                        // OSS is an acceleration layer, never the history source of truth.
                        // A role, Bucket, or network outage falls back to the existing E2EE
                        // tunnel response without changing DSH/WebUI behavior.
                    }
                }
                return { ok: true, value: { payloadJson } };
            }
            catch (error) {
                signal.throwIfAborted();
                return {
                    ok: false,
                    error: { code: 'history-unavailable', message: messageOf(error) },
                };
            }
        }
        fetchNativePage(payload, signal) {
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
                request.on('timeout', () => request.destroy(new Error('DSH history request timed out')));
                request.on('error', error => finish(() => reject(error)));
                request.end(body);
            });
        }
    };
})();
export { WechatHistoryService };
/** Exported pure coordinator for deterministic plugin regression tests. */
export async function buildHistoryWindow(request, fetchPage, signal) {
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
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
        signal.throwIfAborted();
        const payload = {
            sessionId: request.sessionId,
            maxMessages,
            ...(cursor === undefined ? {} : { beforeSeq: cursor }),
        };
        const response = await fetchPage(payload, signal);
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
        rawEvents += entries.length;
        if (!tailValue) {
            tailValue = value;
            targetTurn = tailTurnOf(entries);
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
            return {
                ok: true,
                value: {
                    ...(tailValue || {}),
                    events: compactEntries(pages.flat(), completedTurns, durableMessageTurns),
                    hasMore: oldestValue?.hasMore === true,
                    historyStartSeq,
                    historyEndSeq,
                    pages: pages.length,
                    rawEvents,
                },
            };
        }
        if (firstSeq === undefined || firstSeq === previousCursor) {
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
    return null;
}
function eventSeqOf(entry) {
    const seq = entry?.event?.seq;
    return typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : undefined;
}
function tailTurnOf(entries) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
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
