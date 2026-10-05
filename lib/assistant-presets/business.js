import { randomBytes } from 'node:crypto';
import { assertScope, bounded, copy, exact, fail, plain, row, sameScope, scopeValid, StateQueue, version } from '../human-workflow/data.js';
import { assistantDefinition } from './definition.js';
import { assistantFieldPath, assistantObject } from './validation.js';
const sameRef = (a, b) => a.id === b.id && a.version === b.version && a.digest === b.digest;
const textOrEmpty = (value, max) => value === '' || plain(value, max);
function content(value, keys) {
    const code = 'assistant-business-content-invalid';
    const checked = assistantObject(value, ['title', 'answers', 'memory'], [], { path: 'content', code });
    if (!plain(checked.title, 80))
        throw fail(code, 'content.title 必须是 1–80 字符的非空文本，不能包含控制字符。');
    if (!row(checked.answers))
        throw fail(code, 'content.answers 必须是本助手引导问题的答案对象；没有答案可用 {}，不能用数组或空值。');
    if (Object.keys(checked.answers).length > 12)
        throw fail(code, 'content.answers 最多包含 12 个本助手的问题键；请先读取 human_assistant_work_get 核对。');
    for (const [key, answer] of Object.entries(checked.answers)) {
        const path = assistantFieldPath('content.answers', key);
        if (!keys.includes(key))
            throw fail(code, `${path} 不是本助手的问题键；请用 human_assistant_work_get 核对已有答案和待答问题，不要改用猜测的字段。`);
        if (!plain(answer, 1000))
            throw fail(code, `${path} 必须是 1–1000 字符的非空文本，不能包含控制字符。`);
    }
    if (!textOrEmpty(checked.memory, 8000))
        throw fail(code, 'content.memory 必须是最多 8000 字符的文本，可为空字符串，不能包含控制字符；修改时保留无关的已有记忆。');
    bounded(checked, 24 * 1024);
    return copy(checked);
}
export class AssistantBusinessRecords {
    state;
    options;
    now;
    randomId;
    constructor(state, options) {
        this.state = state;
        this.options = options;
        this.now = options.now || Date.now;
        this.randomId = options.randomId || (() => randomBytes(16).toString('hex'));
    }
    static async open(store, options) {
        options.assertIdentity();
        if (typeof options.nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(options.nodeId))
            throw fail('assistant-business-scope-invalid', '节点身份无效');
        const raw = await store.load();
        options.assertIdentity();
        const ledger = raw === undefined ? { schema: 'human.assistant.business-ledger.v1', nodeId: options.nodeId, records: [] }
            : validateLedger(raw, options);
        return new AssistantBusinessRecords(new StateQueue(store, ledger), options);
    }
    close() { return this.state.close(); }
    current(scope, presetId) {
        this.options.assertIdentity();
        assertScope(scope, this.options.nodeId);
        if (!plain(presetId, 128))
            throw fail('assistant-business-preset-unavailable', '当前会话没有已安装的职业助手身份');
        const installed = this.options.registry.installedForPreset(presetId);
        if (!installed || installed.state !== 'installed' || installed.presetId !== presetId)
            throw fail('assistant-business-preset-unavailable', '当前真实原生预设不是已确认安装的职业助手');
        const definition = assistantDefinition(installed.definition);
        return { definition, ref: { id: installed.id, version: installed.version, digest: installed.digest } };
    }
    checkedRecord(scope, presetId) {
        const installed = this.current(scope, presetId), record = this.state.current().records.find(item => sameScope(item.scope, scope));
        if (!record)
            throw fail('assistant-business-not-started', '当前会话尚未建立独立工作实例，请先建档');
        if (record.presetId !== presetId || !sameRef(record.assistant, installed.ref))
            throw fail('assistant-business-preset-mismatch', '已有工作实例绑定其他助手版本，不能借用或覆盖其资料');
        return { record, ...installed };
    }
    start(scope, presetId, signal) {
        signal.throwIfAborted();
        this.current(scope, presetId);
        return this.state.update(ledger => {
            const installed = this.current(scope, presetId), existing = ledger.records.find(item => sameScope(item.scope, scope));
            if (existing) {
                if (existing.presetId !== presetId || !sameRef(existing.assistant, installed.ref))
                    throw fail('assistant-business-preset-mismatch', '当前会话已有另一个助手的工作实例，请开启新会话');
                return existing;
            }
            if (ledger.records.length >= 64)
                throw fail('assistant-business-capacity', '本节点工作实例数量已达到上限');
            const id = this.randomId(), time = this.now();
            if (!/^[A-Za-z0-9_-]{16,128}(?![\s\S])/.test(id) || ledger.records.some(record => record.id === id))
                throw fail('assistant-business-id-invalid', '工作实例标识生成失败');
            const record = { schema: 'human.assistant.business.v1', authority: 'local-business-notes',
                id, revision: 1, scope: copy(scope), presetId, assistant: installed.ref,
                content: { title: `${installed.definition.name}工作实例`, answers: {}, memory: '' }, createdAt: time, updatedAt: time };
            ledger.records.push(record);
            return record;
        }, signal);
    }
    get(scope, presetId) {
        const { record, definition } = this.checkedRecord(scope, presetId);
        return { ...copy(record), onboarding: { status: 'self-reported',
                pendingQuestions: definition.onboarding.filter(item => !Object.hasOwn(record.content.answers, item.key)).map(copy),
                meaning: '本记录是当前会话的业务资料和工作记忆，不证明微信成员身份，也不授予共享、发送或访问权限。' } };
    }
    save(scope, presetId, request, signal) {
        signal.throwIfAborted();
        this.checkedRecord(scope, presetId);
        assistantObject(request, ['expectedRevision', 'content'], [], { code: 'assistant-business-save-invalid', moveTo: {
                title: 'content.title', answers: 'content.answers', memory: 'content.memory',
            } });
        if (!version(request.expectedRevision))
            throw fail('assistant-business-save-invalid', 'expectedRevision 必须是当前记录的正整数版本；请先读取当前记录，不要猜版本。');
        return this.state.update(ledger => {
            const installed = this.current(scope, presetId), record = ledger.records.find(item => sameScope(item.scope, scope));
            if (!record || record.presetId !== presetId || !sameRef(record.assistant, installed.ref))
                throw fail('assistant-business-preset-mismatch', '当前工作实例身份已变化');
            if (record.revision !== request.expectedRevision)
                throw fail('assistant-business-conflict', '业务资料已有新版本，请读取后合并，不能覆盖较新的记忆');
            if (record.revision === Number.MAX_SAFE_INTEGER)
                throw fail('assistant-business-capacity', '业务资料版本已达到上限');
            record.content = content(request.content, installed.definition.onboarding.map(question => question.key));
            record.revision++;
            record.updatedAt = this.now();
            return record;
        }, signal);
    }
}
function validateLedger(value, options) {
    const invalid = () => fail('assistant-business-store-invalid', '业务资料账本无效或不属于当前节点，未覆盖原文件');
    if (!row(value) || !exact(value, ['schema', 'nodeId', 'records']) || value.schema !== 'human.assistant.business-ledger.v1'
        || value.nodeId !== options.nodeId || !Array.isArray(value.records) || value.records.length > 64)
        throw invalid();
    const scopes = new Set(), ids = new Set();
    for (const r of value.records) {
        if (!row(r) || !exact(r, ['schema', 'authority', 'id', 'revision', 'scope', 'presetId', 'assistant', 'content', 'createdAt', 'updatedAt'])
            || r.schema !== 'human.assistant.business.v1' || r.authority !== 'local-business-notes'
            || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}(?![\s\S])/.test(r.id) || ids.has(r.id)
            || !version(r.revision) || !scopeValid(r.scope) || r.scope.nodeId !== options.nodeId || !plain(r.presetId, 128)
            || !row(r.assistant) || !exact(r.assistant, ['id', 'version', 'digest']) || !version(r.assistant.version)
            || !Number.isSafeInteger(r.createdAt) || Number(r.createdAt) < 0 || !Number.isSafeInteger(r.updatedAt)
            || Number(r.updatedAt) < Number(r.createdAt))
            throw invalid();
        const scopeKey = JSON.stringify([r.scope.nodeId, r.scope.sessionId, r.scope.sessionGeneration]);
        if (scopes.has(scopeKey))
            throw invalid();
        try {
            const template = options.registry.get({ id: r.assistant.id, version: r.assistant.version });
            if (template.digest !== r.assistant.digest || template.presetId !== r.presetId)
                throw invalid();
            content(r.content, assistantDefinition(template.definition).onboarding.map(question => question.key));
        }
        catch {
            throw invalid();
        }
        ids.add(r.id);
        scopes.add(scopeKey);
    }
    bounded(value);
    return copy(value);
}
