import { ClawbotError } from './contracts.js';
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
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_OBSERVATION_MS = 15 * 60 * 1000;
/**
 * Native contracts inspected in installed DSH 0.2.0-rc.1:
 * dsh-api-session-controller/lib/types/commands.js:290-351,547-560:
 * prompt resumes the ordinary Agent, stores requestId as user source.rpcId,
 * and acknowledges admission (not completion). No source credential is added.
 * dsh-agent-loop/lib/index.js:943,1061,1144,1027: committed turn/start,
 * user/message, assistant/message, turn/end are the correlation boundaries.
 * dsh-session/lib/index.js:1400-1473: seq is the next append offset and
 * session/event observers run synchronously after the event enters the log.
 * This adapter owns no Agent/preset/tool; it never opens the phone mux/$events.
 */
export class DshClawbotHost {
    ctx;
    running = new Set();
    constructor(ctx) {
        this.ctx = ctx;
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
        for (const item of result.items) {
            if (!row(item) || !id(item.sessionId) || seen.has(item.sessionId))
                throw fail('unavailable', '原生会话列表不完整，请刷新后重试。');
            seen.add(item.sessionId);
            if (item.origin === 'subagent' || archived.has(item.sessionId) || typeof item.cwd !== 'string' || !item.cwd)
                continue;
            const title = item.projections?.values?.title;
            items.push({ id: item.sessionId, title: typeof title === 'string' && title.trim() ? title.slice(0, 200) : '未命名会话' });
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
        const { generation } = await this.metadata(sessionId, signal);
        signal.throwIfAborted();
        if (this.archived().has(sessionId))
            throw fail('not-found', '此会话已归档，请重新选择。');
        return { ...selected, generation };
    }
    async run(input, signal) {
        if (!id(input.sessionId) || !id(input.requestId) || typeof input.text !== 'string' || !input.text.trim()
            || !Number.isSafeInteger(input.expectedGeneration)
            || Buffer.byteLength(input.text) > MAX_TEXT_BYTES)
            throw fail('invalid-input', '消息或会话标识无效。');
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
            const agent = agents.get(input.sessionId);
            if (agent && (agent.status === 'running' || agent.inbox?.hasPending
                || agent.inbox?.nextTurn?.length || agent.inbox?.nextStep?.length)) {
                throw fail('busy', '此会话正在运行或有排队消息，请先在电脑或小程序处理。');
            }
            return await this.observeAndSubmit(input, generation, cursor, signal);
        }
        finally {
            this.running.delete(input.sessionId);
        }
    }
    observeAndSubmit(input, generation, cursor, signal) {
        return new Promise((resolve, reject) => {
            let settled = false, dispatched = false, accepted = false, currentTurn;
            let matchedTurn, foreignInput = false, finalText, completion;
            let observedSession, eventCount = 0;
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
                    resolve({ text: text });
            };
            const stop = (code, message) => finish(fail(code, message, submission()));
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
                        foreignInput = false;
                        finalText = undefined;
                    }
                    else if (event.type === 'user/message' && data.source?.kind !== 'runtime-context') {
                        if (data.source?.kind === 'user' && data.source.rpcId === input.requestId) {
                            if (matchedTurn !== undefined || currentTurn === undefined || foreignInput
                                || !Array.isArray(data.content) || data.content.length !== 1
                                || data.content[0]?.type !== 'text' || data.content[0].text !== input.text) {
                                return stop('ambiguous-turn', '本次输入与其他输入混合或已变化，未转发无法确认归属的回复。');
                            }
                            matchedTurn = currentTurn;
                        }
                        else {
                            foreignInput = true;
                            if (matchedTurn !== undefined)
                                return stop('ambiguous-turn', '此轮次加入了其他输入，请在电脑或小程序查看完整回复。');
                        }
                    }
                    else if (matchedTurn !== undefined && currentTurn === matchedTurn) {
                        if (event.type === 'approval/asked')
                            return stop('approval-required', '此任务需要你的原生审批，请回电脑或小程序处理；任务未被取消。');
                        if (event.type === 'tool/call' && data.name === 'ask_user_question') {
                            return stop('question-required', '此任务需要回答问题，请回电脑或小程序处理；任务未被取消。');
                        }
                        if (event.type === 'assistant/message' && data.turn === matchedTurn) {
                            const content = data.message?.content;
                            finalText = undefined;
                            if (data.interrupted || !Array.isArray(content) || content.some((part) => part?.type === 'tool-call'))
                                return;
                            const texts = content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text);
                            const text = texts.join('\n').trim();
                            if (Buffer.byteLength(text) > MAX_TEXT_BYTES)
                                return stop('output-unavailable', '回复过长，请在电脑或小程序查看。');
                            if (text)
                                finalText = text;
                        }
                        else if (event.type === 'turn/end' && data.turn === matchedTurn) {
                            if (data.reason?.kind !== 'completed')
                                return stop('interrupted', '本次任务未正常完成，请在电脑或小程序核对状态；没有自动重发。');
                            if (!finalText)
                                return stop('output-unavailable', '本次任务已结束，但没有可确认的最终文字回复，请在电脑或小程序查看。');
                            completion = finalText;
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
                const live = this.ctx.get('sessions')?.get(input.sessionId);
                if (live && !checkSubject(live))
                    return;
                // The installed native prompt has no generation precondition. This
                // immediate check plus event identity checks fail closed for observed
                // resets; they cannot provide CAS inside the native async dispatcher.
                dispatched = true;
                void Promise.resolve(gateway.invoke({ namespace: 'session', method: 'prompt', args: { request: {
                            sessionId: input.sessionId, requestId: input.requestId, mode: 'queue', content: [{ type: 'text', text: input.text }],
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
