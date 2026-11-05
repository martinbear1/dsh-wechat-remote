/** Thin boundary around pinned upstream pure form projections. No timer/store. */
import { taskDraft, newTaskDraft, taskDraftIssue, taskDraftPatch, timingFromDraft, draftTarget, rruleFromDraft } from './editor-native.js';
export function editorView(host, task) {
    const workspaces = host.get('workspaceRegistry')?.list?.() ?? [];
    const projects = workspaces.filter((w) => typeof w.path === 'string' && typeof w.title === 'string')
        .map((w) => ({ value: w.path, label: w.title === 'default-workspace' ? '默认工作区' : w.title }));
    const defaultCwd = (workspaces.find((w) => w.title === 'default-workspace') ?? workspaces[0])?.path ?? '';
    const draft = task ? taskDraft(task) : { ...newTaskDraft(), cwd: defaultCwd };
    return { draft, projects, defaultCwd };
}
export function editorRequest(input, task, customText = false) {
    const bad = () => { throw Object.assign(Error('请检查任务内容、执行位置和时间规则。'), { code: 'invalid_rule' }); };
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return bad();
    const d = input;
    const fields = ['title', 'prompt', 'frequency', 'interval', 'start', 'timeZone', 'rrule', 'retainedTiming', 'weekdays', 'monthDay', 'dailyTime', 'target', 'sessionId', 'cwd'];
    if (Object.keys(d).some(k => !fields.includes(k)) || fields.filter(k => !['retainedTiming', 'weekdays', 'monthDay'].includes(k)).some(k => typeof d[k] !== 'string')
        || !['once', 'minutely', 'hourly', 'daily', 'weekly', 'monthly', 'advanced'].includes(d.frequency)
        || !['session', 'new_once', 'new'].includes(d.target) || !Array.isArray(d.weekdays) || d.weekdays.length > 512 || d.weekdays.some((x) => !Number.isInteger(x))
        || d.frequency === 'weekly' && (d.weekdays.some((x) => x < 1 || x > 7) || new Set(d.weekdays).size !== d.weekdays.length)
        || !Number.isInteger(d.monthDay) || d.rrule.length > 128 * 1024 || d.start.length > 40 || d.timeZone.length > 128 || d.cwd.length > 32768)
        return bad();
    // The original typed opaque rule comes from the Host, never a mobile echo.
    const seeded = task ? taskDraft(task) : undefined;
    const { retainedTiming: _ignored, ...values } = d;
    const draft = { ...values, ...(seeded?.retainedTiming ? { retainedTiming: seeded.retainedTiming } : {}) };
    if (draft.target === 'session' && (!task || task.target.kind !== 'session' || draft.sessionId !== task.target.sessionId))
        return bad();
    const patch = task ? taskDraftPatch(draft, task, true) : undefined;
    if (customText)
        return { rrule: rruleFromDraft(draft, task === undefined) };
    const issue = taskDraftIssue(draft, patch);
    if (issue)
        return bad();
    return task ? patch : { title: draft.title.trim(), prompt: draft.prompt.trim(), timing: timingFromDraft(draft, true), target: draftTarget(draft, undefined) };
}
