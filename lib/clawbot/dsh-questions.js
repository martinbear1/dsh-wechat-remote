import { randomUUID } from 'node:crypto';
import { ClawbotError } from './contracts.js';
import { validateQuestions } from './question-text.js';
const row = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 8192) => typeof value === 'string' && value.length > 0
    && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const closedError = () => new ClawbotError('clawbot-host/question-closed', '此问题已结束或已转交电脑或小程序，请查看最新消息。');
function questionsOf(request) {
    // Timed/continued questions and any decision intent own different native
    // lifecycles. Delegate them intact; never turn them into private approvals.
    if (!keys(request, ['questions', 'agent', 'signal']) || !validateQuestions(request.questions))
        return;
    if (Buffer.byteLength(JSON.stringify(request.questions)) > 32 * 1024)
        return;
    return structuredClone(request.questions);
}
function validAnswer(value, questions) {
    if (!row(value) || !keys(value, ['answers']) || !Array.isArray(value.answers)
        || value.answers.length !== questions.length || Buffer.byteLength(JSON.stringify(value)) > 32 * 1024)
        return false;
    const seen = new Set();
    return value.answers.every((answer) => {
        if (!row(answer) || !keys(answer, ['id', 'selected', 'custom']) || seen.has(answer.id))
            return false;
        const q = questions.find(item => item.id === answer.id);
        if (!q || !Array.isArray(answer.selected) || answer.selected.length > 20
            || answer.custom !== undefined && !text(answer.custom, 16384))
            return false;
        seen.add(answer.id);
        const labels = new Set(answer.selected);
        return labels.size === answer.selected.length
            && answer.selected.every((label) => typeof label === 'string' && q.options?.some(option => option.label === label))
            && (q.multiSelect === true || answer.selected.length <= 1 && !(answer.selected.length && answer.custom !== undefined));
    });
}
/** Native user-questions answerer: claim an owned plain question, or call
 * next() once to delegate. No global Remote Event client, shadow card, prompt,
 * host cancellation, approval decision, or late-answer steering is created. */
export class DshQuestionBridge {
    ctx;
    owns;
    onQuestion;
    fallback;
    assertAccess;
    pending = new Set();
    off;
    closed = false;
    get ready() { return !!this.off && !this.closed; }
    constructor(ctx, owns, onQuestion, fallback, assertAccess) {
        this.ctx = ctx;
        this.owns = owns;
        this.onQuestion = onQuestion;
        this.fallback = fallback;
        this.assertAccess = assertAccess;
    }
    start() {
        if (this.closed)
            return false;
        if (this.off)
            return true;
        try {
            this.off = this.ctx.on('user-questions/request', (source, next) => {
                if (!this.ready || !row(source) || !row(source.agent) || !this.owned(source.agent))
                    return next();
                let questions;
                try {
                    questions = questionsOf(source);
                }
                catch { /* unknown payload stays native */ }
                if (!questions || source.signal !== undefined && !(source.signal instanceof AbortSignal)
                    || this.pending.size >= 8) {
                    this.notice();
                    return next();
                }
                if (source.signal?.aborted)
                    return Promise.reject(source.signal.reason ?? new Error('native question aborted'));
                return this.claim(source, questions, next);
            }, { global: true, prepend: true });
            return true;
        }
        catch {
            this.close();
            return false;
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.off?.();
        this.off = undefined;
        // Snapshot before delegation: next() can synchronously dispatch another
        // question. A closed answerer must neither claim it nor iterate over it.
        for (const pending of [...this.pending])
            pending.handoff();
    }
    notice() { try {
        this.fallback();
    }
    catch { /* preserve native request outcome */ } }
    owned(agent) { try {
        return this.owns(agent);
    }
    catch {
        return false;
    } }
    claim(source, questions, next) {
        const lifetime = new AbortController();
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        let active = true;
        const release = () => {
            active = false;
            this.pending.delete(pending);
            source.signal?.removeEventListener('abort', abort);
            lifetime.abort();
        };
        const abort = () => {
            if (!active)
                return;
            release();
            // The user-questions service restores ASK_ABORTED from its original
            // request signal. No new native answerer should see an aborted request.
            reject(source.signal.reason ?? new Error('native question aborted'));
        };
        const handoff = () => {
            if (!active)
                return;
            if (source.signal?.aborted) {
                abort();
                return;
            }
            release();
            try {
                resolve(next());
            }
            catch (error) {
                reject(error);
            }
            this.notice();
        };
        const pending = { handoff };
        const question = { id: randomUUID(), questions: structuredClone(questions), signal: lifetime.signal, handoff,
            answer: async (value) => {
                if (!active || this.closed || source.signal?.aborted || !this.owned(source.agent)) {
                    handoff();
                    throw closedError();
                }
                if (!validAnswer(value, questions))
                    throw new ClawbotError('clawbot-host/question-invalid-answer', '回答与当前问题不匹配，请按问题提示重新填写。');
                this.assertAccess?.();
                // No await between ownership/access validation and the one native
                // resolution. It resumes this ask() call, never a fresh Agent prompt.
                const answer = structuredClone(value);
                release();
                resolve(answer);
            } };
        this.pending.add(pending);
        source.signal?.addEventListener('abort', abort, { once: true });
        if (source.signal?.aborted)
            abort();
        else
            try {
                this.onQuestion(question);
            }
            catch {
                handoff();
            }
        return promise;
    }
}
