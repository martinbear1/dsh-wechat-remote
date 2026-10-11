import { createHash } from 'node:crypto';
import { ClawbotError } from './contracts.js';
import { assertColdSessionPresetAvailable } from '../dsh-host-contract.js';
import { REPLY_TEXT_MAX_BYTES } from './reply-text.js';
/** A receipt for observing a run, never authority to replay its prompt. */
export class DshClawbotHostError extends ClawbotError {
    submission;
    constructor(code, message, submission) {
        super('clawbot-host/' + code, message);
        this.submission = submission;
        this.name = 'DshClawbotHostError';
    }
}
const row = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0
    && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
const fail = (code, message, submission = 'not-submitted') => new DshClawbotHostError(code, message, submission);
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_OBSERVATION_MS = 15 * 60 * 1000;
const imageType = (data) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')))
        return 'image/gif';
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
        return 'image/webp';
};
const nativeImage = (value, name) => row(value) && value.name === name
    && /^sha256:[a-f0-9]{64}$/.test(value.attachmentId) && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mediaType)
    && [value.bytes, value.width, value.height].every(number => Number.isSafeInteger(number) && number > 0);
const nativeFile = (value) => row(value) && /^sha256:[a-f0-9]{64}$/.test(value.attachmentId)
    && typeof value.name === 'string' && !!value.name && !/[\\/\u0000-\u001f]/.test(value.name)
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_MEDIA_BYTES;
/**
 * Native contracts inspected in installed DSH 0.2.0-rc.1:
 * dsh-api-session-controller/lib/types/commands.js:290-351,547-560:
 * prompt resumes the ordinary Agent, stores requestId as user source.rpcId,
 * and acknowledges admission (not completion). No source credential is added.
 * dsh-agent-loop/lib/index.js:943,1061,1144,1027: committed turn/start,
 * user/message, assistant/message, turn/end are the correlation boundaries.
 * dsh-session/lib/index.js:1400-1473: seq is the next append offset and
 * session/event observers run synchronously after the event enters the log.
 * This adapter owns no Agent/preset/tool; it never opens the phone mux/$events
 * or registers a user-questions/approval answerer. Native cards keep ownership.
 */
export class DshClawbotHost {
    ctx;
    assertAccess;
    running = new Set();
    constructor(ctx, assertAccess) {
        this.ctx = ctx;
        this.assertAccess = assertAccess;
    }
    gateway() {
        const gateway = this.ctx.get('typertGateway');
        if (typeof gateway?.invoke !== 'function')
            throw fail('unavailable', '当前节点的原生会话接口尚未就绪。');
        return gateway;
    }
    archived() {
        const values = this.ctx.get('workspaceRegistry')?.archivedSessionIds;
        if (!Array.isArray(values) || !values.every(id))
            throw fail('unavailable', '无法核对原生会话归档状态。');
        return new Set(values);
    }
    /** Selectable ordinary sessions, including cold ones; admission decides writability. */
    async listSessions(signal) {
        signal.throwIfAborted();
        const result = await this.gateway().invoke({ namespace: 'session', method: 'list', args: { _request: {} }, signal });
        signal.throwIfAborted();
        const archived = this.archived();
        if (!Array.isArray(result?.items))
            throw fail('unavailable', '无法读取原生会话列表。');
        const seen = new Set(), items = [];
        const registry = this.ctx.get('workspaceRegistry');
        const workspaces = typeof registry?.list === 'function' ? registry.list() : [];
        for (const item of result.items) {
            if (!row(item) || !id(item.sessionId) || seen.has(item.sessionId))
                throw fail('unavailable', '原生会话列表不完整，请刷新后重试。');
            seen.add(item.sessionId);
            if (item.origin === 'subagent' || archived.has(item.sessionId) || typeof item.cwd !== 'string' || !item.cwd)
                continue;
            const title = item.projections?.values?.title;
            const matches = Array.isArray(workspaces) ? workspaces.filter(workspace => row(workspace) && id(workspace.id)
                && Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(item.sessionId)) : [];
            const workspace = matches.length === 1 ? matches[0] : undefined;
            const workspaceTitle = workspace && (typeof workspace.name === 'string' && workspace.name.trim() ? workspace.name
                : typeof workspace.path === 'string' ? workspace.path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) : undefined);
            items.push({ id: item.sessionId, title: typeof title === 'string' && title.trim() ? title.slice(0, 200) : '未命名会话',
                ...(workspace && workspaceTitle ? { workspaceId: workspace.id, workspaceTitle: workspaceTitle.slice(0, 200) } : {}) });
        }
        return items;
    }
    async metadata(sessionId, signal) {
        const query = this.ctx.get('sessionQuery');
        if (typeof query?.observeSession !== 'function')
            throw fail('unavailable', '当前宿主缺少可核对的原生会话观察接口。');
        // Metadata only: selecting a cold Session must not read or expose its transcript.
        const observation = await query.observeSession(sessionId, { signal, projectionMode: 'none' });
        try {
            const header = observation?.header;
            if (!row(header) || header.id !== sessionId || header.origin === 'subagent'
                || !Number.isSafeInteger(header.createdAt) || typeof header.cwd !== 'string' || !header.cwd
                || !Number.isSafeInteger(observation.cursor) || observation.cursor < -1
                || typeof observation[Symbol.dispose] !== 'function')
                throw fail('unavailable', '无法核对本次会话身份。');
            return { generation: header.createdAt, cursor: observation.cursor };
        }
        finally {
            observation?.[Symbol.dispose]?.();
        }
    }
    async describeSession(sessionId, signal) {
        if (!id(sessionId))
            throw fail('invalid-input', '会话标识无效。');
        const selected = (await this.listSessions(signal)).find(item => item.id === sessionId);
        if (!selected)
            throw fail('not-found', '此会话已不存在、已归档或属于子代理，请重新选择普通会话。');
        await this.checkPreset(sessionId, signal);
        const { generation } = await this.metadata(sessionId, signal);
        signal.throwIfAborted();
        if (this.archived().has(sessionId))
            throw fail('not-found', '此会话已归档，请重新选择。');
        return { ...selected, generation };
    }
    async checkPreset(sessionId, signal) {
        try {
            await assertColdSessionPresetAvailable(this.ctx, sessionId, signal);
        }
        catch (error) {
            signal.throwIfAborted();
            if (row(error) && error.code === 'adapter/session-preset-unavailable')
                throw fail('preset-unavailable', '此会话的原模式已停用或不可用，本条消息未发送。请在电脑恢复原模式，或选择其他可用会话。');
            throw fail('unavailable', '暂时无法核对会话模式，本条消息未发送，请在电脑或小程序核对。');
        }
    }
    async run(input, signal, onAttention) {
        if (!id(input.sessionId) || !id(input.requestId) || typeof input.text !== 'string'
            || !Number.isSafeInteger(input.expectedGeneration)
            || Buffer.byteLength(input.text) > REPLY_TEXT_MAX_BYTES || input.attachments !== undefined && !Array.isArray(input.attachments)
            || (input.attachments?.length ?? 0) > 6 || !input.text.trim() && !input.attachments?.length)
            throw fail('invalid-input', '消息或会话标识无效。');
        let total = Buffer.byteLength(input.text);
        for (const part of input.attachments ?? []) {
            if (!row(part) || !['image', 'file', 'voice', 'video'].includes(part.kind)
                || typeof part.name !== 'string' || !part.name.trim() || Buffer.byteLength(part.name) > 240 || /[\\/\u0000-\u001f]/.test(part.name)
                || !(part.data instanceof Uint8Array) || part.data.byteLength < 1 || part.data.byteLength > MAX_MEDIA_BYTES
                || (total += part.data.byteLength) > MAX_INPUT_BYTES || part.kind === 'image' && !imageType(part.data))
                throw fail('invalid-input', '附件格式或大小不符合要求：最多 6 个，单个 10 MB、合计 30 MB。');
        }
        // Own one bounded immutable snapshot across asynchronous admission checks.
        input = { ...input, attachments: input.attachments?.map(part => ({ ...part, data: Uint8Array.from(part.data) })) };
        signal.throwIfAborted();
        if (this.running.has(input.sessionId))
            throw fail('busy', '此会话仍在处理上一条渠道消息，请先在电脑或小程序核对。');
        this.running.add(input.sessionId);
        try {
            if (!(await this.listSessions(signal)).some(item => item.id === input.sessionId)) {
                throw fail('not-found', '此会话已不存在、已归档或属于子代理，请重新选择普通会话。');
            }
            const agents = this.ctx.get('agents'), sessions = this.ctx.get('sessions');
            if (typeof agents?.get !== 'function'
                || typeof sessions?.get !== 'function')
                throw fail('unavailable', '当前宿主缺少可核对的原生会话观察接口。');
            const { generation, cursor } = await this.metadata(input.sessionId, signal);
            if (generation !== input.expectedGeneration)
                throw fail('session-changed', '所选会话已重置，本条旧消息没有发送；请重新选择会话。');
            signal.throwIfAborted();
            if (this.archived().has(input.sessionId))
                throw fail('not-found', '此会话已归档，请重新选择。');
            await this.checkPreset(input.sessionId, signal);
            signal.throwIfAborted();
            const prepared = input.attachments?.length ? await this.prepareInput(input, generation, signal)
                : { content: [{ type: 'text', text: input.text }] };
            const result = await this.observeAndSubmit(input, generation, cursor, prepared, signal, onAttention);
            return await this.readOutputs(input.sessionId, generation, result, signal, input.checkAdmission);
        }
        finally {
            this.running.delete(input.sessionId);
        }
    }
    /** Read only this completed turn's native presentation declarations. Paths
     * never come from model prose or tool reads and never leave this adapter. */
    async readOutputs(sessionId, generation, result, signal, checkAdmission) {
        signal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
        const attachments = [];
        let omitted = result.omitted, total = 0;
        const check = () => {
            signal.throwIfAborted();
            checkAdmission?.();
            this.assertAccess?.();
            const session = this.ctx.get('sessions')?.get(sessionId);
            if (session !== result.session || session.header?.createdAt !== generation || this.archived().has(sessionId))
                throw fail('session-changed', '会话已变化，文件未回传；请在原会话查看。', 'accepted');
        };
        const append = (name, bytes) => {
            if (typeof name !== 'string' || !name.trim() || /[\\/\u0000-\u001f]/.test(name)
                || !(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_MEDIA_BYTES
                || attachments.length >= 6 || total + bytes.byteLength > MAX_INPUT_BYTES)
                throw Error('output limit');
            const data = Buffer.from(bytes), image = imageType(data);
            const mp4 = /\.mp4$/i.test(name) && data.length >= 16 && data.readUInt32BE(0) >= 16
                && data.readUInt32BE(0) <= data.length && data.subarray(4, 8).toString('ascii') === 'ftyp'
                && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(data.subarray(8, 12).toString('ascii'));
            total += data.length;
            attachments.push({ kind: image ? 'image' : mp4 ? 'video' : 'file', name, data });
        };
        for (const reference of result.files) {
            let transferId, resources;
            try {
                check();
                resources = this.ctx.get('agentResources');
                if (!['resolve', 'prepare', 'chunk', 'release'].every(key => typeof resources?.[key] === 'function'))
                    throw Error('no native resource reader');
                const unpack = (value) => {
                    if (!value?.ok || typeof value.valueJson !== 'string')
                        throw Error('resource unavailable');
                    const parsed = JSON.parse(value.valueJson);
                    if (!row(parsed))
                        throw Error('resource unavailable');
                    return parsed;
                };
                const resolved = unpack(await resources.resolve({ scope: sessionId, reference }, signal));
                check();
                if (resolved.kind !== 'file' || typeof resolved.id !== 'string' || !resolved.id || resolved.id.length > 12000
                    || !Number.isSafeInteger(resolved.bytes) || resolved.bytes < 1 || resolved.bytes > MAX_MEDIA_BYTES
                    || total + resolved.bytes > MAX_INPUT_BYTES || attachments.length >= 6)
                    throw Error('output limit');
                const prepared = unpack(await resources.prepare({ scope: sessionId, id: resolved.id, delivery: 'chunks' }, signal));
                transferId = prepared.transferId;
                check();
                if (!id(transferId) || prepared.delivery !== 'chunks' || !Number.isSafeInteger(prepared.bytes)
                    || prepared.bytes < 1 || prepared.bytes > MAX_MEDIA_BYTES || total + prepared.bytes > MAX_INPUT_BYTES
                    || !Number.isSafeInteger(prepared.chunkBytes) || prepared.chunkBytes < 1 || prepared.chunkBytes > 1024 * 1024
                    || !/^[a-f0-9]{64}$/.test(prepared.sha256))
                    throw Error('invalid native snapshot');
                const bytes = Buffer.alloc(prepared.bytes);
                for (let offset = 0; offset < bytes.length; offset += prepared.chunkBytes) {
                    const chunk = unpack(await resources.chunk({ scope: sessionId, transferId, offset }, signal));
                    check();
                    if (chunk.offset !== offset || typeof chunk.data !== 'string')
                        throw Error('invalid native chunk');
                    const data = Buffer.from(chunk.data, 'base64');
                    if (data.toString('base64') !== chunk.data || data.length !== Math.min(prepared.chunkBytes, bytes.length - offset))
                        throw Error('invalid native chunk');
                    data.copy(bytes, offset);
                }
                if (createHash('sha256').update(bytes).digest('hex') !== prepared.sha256)
                    throw Error('invalid native snapshot');
                append(prepared.name, bytes);
            }
            catch {
                omitted = true;
            }
            finally {
                if (id(transferId)) {
                    try {
                        await resources?.release({ scope: sessionId, transferId });
                    }
                    catch { /* bounded native snapshot expires */ }
                }
            }
        }
        for (const ref of result.images) {
            try {
                check();
                if (attachments.length >= 6 || ref.bytes > MAX_MEDIA_BYTES || total + ref.bytes > MAX_INPUT_BYTES)
                    throw Error('output limit');
                const value = await this.ctx.get('attachments')?.readImage(ref, signal);
                check();
                if (!(value?.data instanceof Uint8Array) || value.data.byteLength !== ref.bytes
                    || 'sha256:' + createHash('sha256').update(value.data).digest('hex') !== ref.attachmentId)
                    throw Error('image unavailable');
                append(ref.name, value.data);
            }
            catch {
                omitted = true;
            }
        }
        // Missing, moved or oversized files do not turn a completed DSH task into
        // an error or cause replay. The final text remains usable on every host.
        const notices = [...result.notices, ...(omitted ? ['部分文件未能回传微信，请在电脑或小程序查看。'] : [])];
        return { text: result.text, ...(attachments.length ? { attachments } : {}), ...(notices.length ? { notices } : {}) };
    }
    async prepareInput(input, generation, signal) {
        const content = input.text.trim() ? [{ type: 'text', text: input.text }] : [];
        let session, agent;
        const check = () => {
            signal.throwIfAborted();
            input.checkAdmission?.();
            this.assertAccess?.();
            if (this.archived().has(input.sessionId))
                throw fail('not-found', '此会话已归档，本条消息未发送。');
            const live = this.ctx.get('sessions')?.get(input.sessionId), current = this.ctx.get('agents')?.get(input.sessionId);
            if (live && (live.header?.createdAt !== generation || live.header?.origin === 'subagent')
                || session && session !== live || agent && agent !== current || current?.session && current.session !== live)
                throw fail('session-changed', '准备附件时会话已变化，本条消息未发送。');
            session ??= live;
            agent ??= current;
        };
        check();
        for (const part of input.attachments ?? []) {
            check();
            if (part.kind === 'image') {
                content.push({ type: 'image', mediaType: imageType(part.data), data: Buffer.from(part.data).toString('base64'), name: part.name });
            }
            else {
                const uploads = this.ctx.get('fileUploads');
                if (typeof uploads?.uploadStream !== 'function')
                    throw fail('unavailable', '此节点尚不支持原生文件附件，请更新电脑端后重试。');
                let saved;
                try {
                    saved = await uploads.uploadStream({ sessionId: input.sessionId, name: part.name, signal,
                        data: (async function* () { check(); yield part.data; })() });
                }
                catch {
                    signal.throwIfAborted();
                    throw fail('attachment-unavailable', '附件未能保存到原会话，本条消息未发送。');
                }
                check();
                if (!id(saved?.receiptId) || !nativeFile(saved?.file) || saved.file.bytes !== part.data.byteLength
                    || saved.file.attachmentId !== 'sha256:' + createHash('sha256').update(part.data).digest('hex'))
                    throw fail('attachment-unavailable', '无法确认原生附件保存结果，本条消息未发送。');
                content.push({ type: 'file', receiptId: saved.receiptId });
            }
        }
        const current = await this.metadata(input.sessionId, signal);
        if (current.generation !== generation)
            throw fail('session-changed', '准备附件时会话已重置，本条消息未发送。');
        check();
        // Native uploads own their durable objects and staged receipts. Never delete
        // shared attachment files or edit the host's receipt table on a failed send.
        return { content, session };
    }
    observeAndSubmit(input, generation, cursor, prepared, signal, onAttention) {
        return new Promise((resolve, reject) => {
            let settled = false, dispatched = false, accepted = false, currentTurn;
            let matchedTurn, finalText, completion;
            let observedSession = prepared.session, eventCount = 0;
            const files = new Set();
            let images = [], omitted = false, finalInterrupted = false;
            const notices = [];
            const attention = new Set();
            const offs = [];
            const submission = () => accepted ? 'accepted' : dispatched ? 'unknown' : 'not-submitted';
            const finish = (error, text) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
                for (const off of offs.splice(0)) {
                    try {
                        off();
                    }
                    catch { /* no observer may remain */ }
                }
                if (error)
                    reject(error);
                else
                    resolve({ text: text, session: observedSession, files: [...files], images, omitted, notices });
            };
            const stop = (code, message) => finish(fail(code, message, submission()));
            const notify = (kind) => {
                if (!onAttention)
                    return stop(kind + '-required', kind === 'approval'
                        ? '此任务需要你的原生审批，请回电脑或小程序处理；任务未被取消。'
                        : '此任务需要回答问题，请回电脑或小程序处理；任务未被取消。');
                if (attention.has(kind))
                    return;
                attention.add(kind);
                // The durable matching input proves ownership. The notice does not
                // decide an approval, answer a question or end this run's observation.
                try {
                    onAttention(kind);
                }
                catch {
                    stop('attention-unavailable', '未能保存待处理提醒。任务未被取消，请在电脑或小程序处理并查看结果。');
                }
            };
            const abort = () => stop('observation-stopped', dispatched
                ? '已停止等待回复；电脑端任务可能仍在继续，请在电脑或小程序核对，勿重复发送。'
                : '已停止发送。');
            const timer = setTimeout(() => stop('observation-timeout', '等待本次回复超时；任务可能仍在继续，请在电脑或小程序核对，勿重复发送。'), MAX_OBSERVATION_MS);
            timer.unref();
            const checkSubject = (session) => {
                if (session?.id !== input.sessionId)
                    return false;
                if (session.header?.createdAt !== generation || session.header?.origin === 'subagent'
                    || this.ctx.get('sessions')?.get(input.sessionId) !== session
                    || observedSession && observedSession !== session) {
                    stop('session-changed', '会话实例已变化，未转发无法确认归属的回复；请在电脑或小程序核对。');
                    return false;
                }
                observedSession = session;
                return true;
            };
            try {
                offs.push(this.ctx.on('session/event', (session, event) => {
                    if (settled || completion !== undefined || !dispatched || !checkSubject(session) || !row(event))
                        return;
                    if (!Number.isSafeInteger(event.seq) || event.seq <= cursor)
                        return;
                    if (++eventCount > 100_000)
                        return stop('output-unavailable', '本次任务事件过多，请在电脑或小程序查看结果。');
                    const data = event.data;
                    if (!row(data))
                        return;
                    if (event.type === 'turn/start') {
                        if (matchedTurn !== undefined)
                            return stop('ambiguous-turn', '本次轮次边界发生变化，未转发无法确认归属的回复。');
                        currentTurn = Number.isSafeInteger(data.turn) ? data.turn : undefined;
                        finalText = undefined;
                    }
                    else if (event.type === 'user/message') {
                        // The host's committed request receipt, not a second comparison of
                        // normalized prompt content, identifies our turn. Native context,
                        // skill/subagent messages and the owner's same-session follow-ups
                        // are ordinary inputs to that turn, not a reason to hide its reply.
                        if (data.source?.kind !== 'user' || data.source.rpcId !== input.requestId)
                            return;
                        if (matchedTurn !== undefined || currentTurn === undefined)
                            return stop('ambiguous-turn', '无法确认本次消息的轮次，请在原会话查看。');
                        matchedTurn = currentTurn;
                    }
                    else if (matchedTurn !== undefined && currentTurn === matchedTurn) {
                        if (event.type === 'deliverables/presented' && data.turn === matchedTurn && id(data.callId) && Array.isArray(data.files)) {
                            for (const file of data.files) {
                                if (!row(file) || typeof file.path !== 'string' || !file.path.trim() || file.path.length > 4096 || /[\u0000-\u001f]/.test(file.path)) {
                                    omitted = true;
                                    continue;
                                }
                                if (files.has(file.path))
                                    continue;
                                if (files.size >= 6) {
                                    omitted = true;
                                    continue;
                                }
                                files.add(file.path);
                            }
                            return;
                        }
                        if (event.type === 'approval/asked')
                            return notify('approval');
                        if (event.type === 'tool/call' && data.name === 'ask_user_question') {
                            return notify('question');
                        }
                        if (event.type === 'assistant/message' && data.turn === matchedTurn) {
                            const content = data.message?.content;
                            finalText = undefined;
                            images = [];
                            finalInterrupted = data.interrupted === true;
                            if (!Array.isArray(content))
                                return;
                            const texts = content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text);
                            const text = texts.join('');
                            if (Buffer.byteLength(text) > REPLY_TEXT_MAX_BYTES)
                                return stop('output-unavailable', '回复超过本地传输上限，请在原会话查看。');
                            if (text)
                                finalText = text;
                            for (const part of content)
                                if (part?.type === 'image') {
                                    const ref = part.attachment;
                                    if (!nativeImage(ref, ref?.name) || images.length >= 6) {
                                        omitted = true;
                                        continue;
                                    }
                                    const suffix = ref.mediaType === 'image/jpeg' ? 'jpg' : ref.mediaType.slice(6);
                                    images.push({ ...ref, name: typeof ref.name === 'string' && ref.name.trim() ? ref.name : `image-${images.length + 1}.${suffix}` });
                                }
                        }
                        else if (event.type === 'turn/end' && data.turn === matchedTurn) {
                            const interrupted = data.reason?.kind !== 'completed' || finalInterrupted;
                            if (interrupted) {
                                const message = data.reason?.kind === 'max-tokens' ? '本轮回复达到长度上限。'
                                    : ['aborted', 'cancelled'].includes(data.reason?.kind) || finalInterrupted ? '本轮已停止。'
                                        : '本轮未正常完成，请在原会话查看状态。';
                                if (!finalText && !files.size && !images.length)
                                    return stop('interrupted', message);
                                // DSH displays durable partial text/images too, with a separate
                                // stop marker. Preserve that content instead of replacing it.
                                notices.push(message);
                            }
                            if (!finalText && !files.size && !images.length)
                                return stop('output-unavailable', '本次任务已结束，但没有可确认的最终文字回复，请在电脑或小程序查看。');
                            completion = finalText || '';
                            if (accepted)
                                finish(undefined, completion);
                        }
                    }
                    if (event.type === 'turn/end' && data.turn === currentTurn && matchedTurn === undefined)
                        currentTurn = undefined;
                }, { global: true }));
                offs.push(this.ctx.on('session/disposed', (session) => {
                    if (!settled && session?.id === input.sessionId)
                        stop('session-changed', '会话已卸载，无法确认本次回复，请在电脑或小程序核对。');
                }, { global: true }));
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) {
                    abort();
                    return;
                }
                // Native prompt checks its signal only before admission. Deliberately
                // detach this signal from the external observer once dispatch starts.
                // No cancel, preset selection, ownerInput proof or fallback retry exists.
                const gateway = this.gateway();
                if (this.archived().has(input.sessionId)) {
                    stop('not-found', '此会话已归档，本条消息未发送。');
                    return;
                }
                const live = this.ctx.get('sessions')?.get(input.sessionId);
                if (live && !checkSubject(live))
                    return;
                // Queue through the host even while an earlier turn is running. The
                // native inbox owns scheduling; only our committed rpcId starts reply
                // collection, so an earlier or unrelated turn is never forwarded.
                // The installed native prompt has no generation precondition. This
                // immediate check plus event identity checks fail closed for observed
                // resets; they cannot provide CAS inside the native async dispatcher.
                input.checkAdmission?.();
                this.assertAccess?.();
                dispatched = true;
                void Promise.resolve(gateway.invoke({ namespace: 'session', method: 'prompt', args: { request: {
                            sessionId: input.sessionId, requestId: input.requestId, mode: 'queue', content: prepared.content,
                        } }, signal: new AbortController().signal })).then((receipt) => {
                    if (settled)
                        return;
                    if (!row(receipt) || receipt.accepted !== true)
                        return stop('delivery-unknown', '无法确认电脑是否接收本次消息，请在电脑或小程序核对，勿重复发送。');
                    accepted = true;
                    if (completion !== undefined)
                        finish(undefined, completion);
                }, (error) => {
                    if (settled)
                        return;
                    const code = row(error) ? error.code : undefined;
                    if (code === 'session/agent-busy' || code === 'session/writer-held') {
                        stop('busy', '原生会话当前被占用或不能接收此消息，请在电脑或小程序核对；没有自动重发。');
                    }
                    else if (code === 'session/attachment-invalid') {
                        finish(fail('attachment-rejected', '当前模型或原生会话不支持此附件，本条消息未发送。请在电脑或小程序检查附件和所选模型。', 'not-submitted'));
                    }
                    else
                        stop('delivery-unknown', '本次发送未获得可确认的接收结果，请在电脑或小程序核对，勿重复发送。');
                });
            }
            catch {
                stop('delivery-unknown', dispatched
                    ? '本次发送结果不明，请在电脑或小程序核对，勿重复发送。'
                    : '未能建立本次回复观察，请稍后在电脑或小程序核对。');
            }
        });
    }
}
