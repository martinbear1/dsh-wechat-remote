const record = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const pathValue = (v) => typeof v === 'string' && v.trim() && v.length <= 4096 ? v : null;
export function mutationPath(name, raw) {
    let a;
    try {
        a = record(JSON.parse(raw));
    }
    catch {
        return null;
    }
    if (name === 'write')
        return typeof a.content === 'string' ? pathValue(a.file_path) : null;
    if (name === 'edit')
        return typeof a.old_string === 'string' && a.old_string.length > 0 && typeof a.new_string === 'string'
            && a.old_string !== a.new_string && (a.replace_all === undefined || typeof a.replace_all === 'boolean') ? pathValue(a.file_path) : null;
    if (name !== 'str_replace_editor')
        return null;
    const valid = a.command === 'create' && typeof a.file_text === 'string'
        || a.command === 'str_replace' && typeof a.old_str === 'string' && a.old_str.length > 0 && (a.new_str === undefined || typeof a.new_str === 'string')
        || a.command === 'insert' && Number.isInteger(a.insert_line) && a.insert_line >= 0 && typeof a.new_str === 'string';
    return valid ? pathValue(a.path) : null;
}
export class TurnActivityCompatibility {
    state;
    accept(event) {
        const d = record(event.data), seq = event.seq;
        if (!Number.isSafeInteger(seq))
            return;
        if (event.type === 'turn/start')
            this.state = { turn: d.turn, start: seq, calls: new Map(), results: new Set(), changes: [], messages: [], visible: [], tools: [], subagents: [], answer: null, step: null };
        const s = this.state;
        if (!s || d.turn !== s.turn)
            return;
        if (event.type === 'step/start') {
            s.step = d.step;
            s.answer = null;
        }
        if (event.type === 'tool/call') {
            if (!s.calls.has(d.callId))
                (d.name === 'subagent' || d.name?.startsWith('subagent_') ? s.subagents : s.tools).push(seq);
            s.calls.set(d.callId, mutationPath(d.name, d.arguments));
        }
        if (event.type === 'tool/result' && (event.surfaceOp === undefined || event.surfaceOp === 'append')) {
            const callId = d.message?.source?.callId ?? d.message?.callId;
            const result = d.message?.content?.[0];
            const path = s.calls.get(callId);
            if (path && result && result.isError !== true && !d.error && !s.results.has(callId)) {
                s.results.add(callId);
                s.changes.push({ seq, path });
                return { schema: 'agent.activity.v1', turn: s.turn, changedFiles: [{ reference: path }] };
            }
        }
        if (event.type === 'assistant/message' && (event.surfaceOp === undefined || event.surfaceOp === 'append')) {
            const content = d.message?.content || [];
            const reply = content.some((b) => b.type === 'text' ? typeof b.text === 'string' && b.text.trim() !== '' : ['image', 'file', 'audio', 'video'].includes(b.type));
            if (reply)
                s.messages.push({ seq, step: d.step });
            if (reply || content.some((b) => b.type === 'reasoning' && b.text?.trim()))
                s.visible.push({ seq, step: d.step });
            if (d.step === s.step)
                s.answer = reply && !content.some((b) => b.type === 'tool-call') ? seq : null;
        }
        if (event.type !== 'turn/end')
            return;
        this.state = undefined;
        // Failed/cancelled turns remain fully visible. Incomplete snapshot prefixes
        // never create this state, and therefore never pretend to be complete.
        if (d.reason?.kind !== 'completed' || !s.answer)
            return;
        const before = (n) => n < s.answer;
        const tools = s.tools.filter(before), subagents = s.subagents.filter(before), messages = s.messages.filter((m) => m.step < s.step);
        const start = Math.min(...tools, ...subagents, ...s.visible.filter((m) => m.step < s.step).map((m) => m.seq));
        return { schema: 'agent.activity.v1', turn: s.turn, answerSeq: s.answer,
            changedFiles: [...new Set(s.changes.filter((c) => c.seq <= s.answer).map((c) => c.path))].map(reference => ({ reference })),
            ...(Number.isFinite(start) ? { process: { startSeq: start, endSeq: s.answer, toolCount: tools.length, subagentCount: subagents.length, messageCount: messages.length, complete: true } } : {}) };
    }
}
