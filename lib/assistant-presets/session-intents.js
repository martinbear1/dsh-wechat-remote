import { randomBytes, randomUUID } from 'node:crypto';
import { copy, exact, fail, identifier, plain, revision, row, StateQueue } from '../human-workflow/data.js';
const attemptIdValid = (id) => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const same = (a, b) => a.presetId === b.presetId && a.workspaceId === (b.workspaceId ?? null);
/** A durable owner intent is not proof native create ran. Only its original
 * response authorizes one caller to invoke native create; every later caller
 * can inspect, never automatically replay. Explicit new intent needs a CAS on
 * the previous confirmed intent. No session log or native config is written. */
export class AssistantSessionIntents {
    options;
    state;
    lifetime = new AbortController();
    constructor(options, state) {
        this.options = options;
        this.state = state;
    }
    static async open(options) {
        const raw = await options.store.load();
        const ledger = { schema: 'human.assistant.session-intents.v1', nodeId: options.nodeId, intents: [] };
        if (raw !== undefined) {
            const bad = () => fail('assistant-session-store-invalid', '会话创建意图账本不可用；未覆盖原文件，也不会重新创建');
            if (!row(raw) || !exact(raw, ['schema', 'nodeId', 'intents']) || raw.schema !== ledger.schema || raw.nodeId !== options.nodeId
                || !Array.isArray(raw.intents) || raw.intents.length > 2048)
                throw bad();
            const ids = new Set(), sessions = new Set();
            for (const i of raw.intents) {
                if (!row(i) || !exact(i, ['attemptId', 'sessionId', 'presetId', 'workspaceId', 'state', 'createdAt'], ['sessionGeneration'])
                    || !attemptIdValid(i.attemptId) || ids.has(i.attemptId) || typeof i.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(i.sessionId)
                    || sessions.has(i.sessionId) || !plain(i.presetId, 64) || !/^[a-z][a-z0-9_-]{0,63}$/.test(i.presetId)
                    || i.workspaceId !== null && !identifier(i.workspaceId) || !['unknown', 'created', 'conflict'].includes(String(i.state)) || !revision(i.createdAt)
                    || i.sessionGeneration !== undefined && (typeof i.sessionGeneration !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(i.sessionGeneration))
                    || i.state === 'created' && i.sessionGeneration === undefined)
                    throw bad();
                ids.add(i.attemptId);
                sessions.add(i.sessionId);
            }
            ledger.intents = copy(raw.intents);
        }
        return new AssistantSessionIntents(options, new StateQueue(options.store, ledger));
    }
    active(signal) { this.options.assertIdentity(); this.lifetime.signal.throwIfAborted(); signal.throwIfAborted(); return AbortSignal.any([signal, this.lifetime.signal]); }
    view(intent, dispatch = false) {
        return { schema: 'human.assistant.session-intent.v1', nodeId: this.options.nodeId, ...copy(intent), dispatch,
            ...(intent.state === 'unknown' && !dispatch ? { message: '上次新建结果尚未确认；只核对原生会话，不自动重新创建。' }
                : intent.state === 'conflict' ? { message: '原生会话身份或工作区已变化，请在原生会话列表核对。' } : {}) };
    }
    async prepare(request, signal) {
        const active = this.active(signal);
        if (!row(request) || !exact(request, ['presetId'], ['workspaceId', 'previousAttemptId']) || !plain(request.presetId, 64)
            || !/^[a-z][a-z0-9_-]{0,63}$/.test(request.presetId) || request.workspaceId !== undefined && !identifier(request.workspaceId)
            || request.previousAttemptId !== undefined && !attemptIdValid(request.previousAttemptId))
            throw fail('assistant-session-input-invalid', '会话创建意图无效');
        if (!this.options.supported())
            throw fail('assistant-session-unsupported', '宿主缺少原生会话核对能力；请使用 DSH 自带的新会话入口');
        if (!await this.options.installed(request.presetId))
            throw fail('assistant-not-installed', '只能使用此节点已确认安装的助手或当前原生默认预设');
        this.active(active);
        if (request.workspaceId !== undefined && !this.options.workspace(request.workspaceId))
            throw fail('assistant-workspace-unavailable', '所选原生工作区已不可用');
        const result = await this.state.update(next => {
            this.active(active);
            const previous = next.intents.slice().reverse().find(i => same(i, request));
            if (previous && (request.previousAttemptId === undefined || previous.attemptId !== request.previousAttemptId))
                return this.view(previous);
            if (request.previousAttemptId !== undefined && (!previous || previous.state !== 'created'))
                throw fail('assistant-session-conflict', '只能在确认上一会话后明确新建另一个独立会话');
            if (next.intents.length >= 2048)
                throw fail('assistant-session-capacity', '会话创建意图已达到上限；请使用原生新会话入口，不会删除未确认记录');
            const value = { attemptId: randomBytes(16).toString('hex'), sessionId: `session-${randomUUID()}`, presetId: request.presetId,
                workspaceId: request.workspaceId ?? null, state: 'unknown', createdAt: (this.options.now ?? Date.now)() };
            next.intents.push(value);
            return this.view(value, true);
        }, active);
        this.active(active);
        return result;
    }
    async status(request, signal) {
        const active = this.active(signal);
        const raw = request;
        if (!row(raw) || !(exact(raw, ['attemptId']) && attemptIdValid(raw.attemptId)
            || exact(raw, ['presetId'], ['workspaceId']) && typeof raw.presetId === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(raw.presetId)
                && (raw.workspaceId === undefined || identifier(raw.workspaceId))))
            throw fail('assistant-session-input-invalid', '会话创建意图无效');
        const intent = 'attemptId' in request ? this.state.current().intents.find(i => i.attemptId === request.attemptId)
            : this.state.current().intents.slice().reverse().find(i => same(i, request));
        if (!intent) {
            if ('attemptId' in request)
                throw fail('assistant-session-not-found', '此节点没有该会话创建意图');
            return { schema: 'human.assistant.session-intent.v1', nodeId: this.options.nodeId, presetId: request.presetId,
                workspaceId: request.workspaceId ?? null, state: 'none', dispatch: false };
        }
        const attemptId = intent.attemptId;
        if (!this.options.supported())
            throw fail('assistant-session-unsupported', '宿主缺少原生只读会话核对能力');
        let inspected;
        try {
            inspected = await this.options.inspect(intent.sessionId, active);
        }
        catch {
            this.active(active);
            return this.view({ ...intent, state: 'unknown' });
        }
        this.active(active);
        let state = 'conflict', sessionGeneration = intent.sessionGeneration;
        if (row(inspected) && row(inspected.meta) && Array.isArray(inspected.events)) {
            const header = inspected.meta;
            let preset = header.agentPreset;
            for (const event of inspected.events)
                if (row(event) && event.type === 'agent-preset/selected' && row(event.data))
                    preset = event.data.agentPreset;
            const workspace = intent.workspaceId === null ? undefined : this.options.workspace(intent.workspaceId);
            if (header.id === intent.sessionId && revision(header.createdAt) && header.origin !== 'subagent' && header.parentSession === undefined
                && preset === intent.presetId && (sessionGeneration === undefined || sessionGeneration === String(header.createdAt))
                && (intent.workspaceId === null || workspace && header.cwd === workspace.path && workspace.sessionIds.includes(intent.sessionId))) {
                state = 'created';
                sessionGeneration = String(header.createdAt);
            }
        }
        return this.state.update(next => {
            this.active(active);
            const value = next.intents.find(i => i.attemptId === attemptId);
            value.state = state;
            if (sessionGeneration !== undefined)
                value.sessionGeneration = sessionGeneration;
            return this.view(value);
        }, active);
    }
    async close() { this.lifetime.abort(); await this.state.close(); }
}
