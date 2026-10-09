import { ClawbotError } from './contracts.js';
const QUESTION_FIELDS = new Set(['id', 'question', 'header', 'detail', 'options', 'multiSelect']);
const OPTION_FIELDS = new Set(['label', 'description']);
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const nonempty = (value) => text(value) && !!value.trim();
const optionalText = (value) => value === undefined || text(value);
const unsupported = () => new ClawbotError('clawbot-question-invalid', '此问题暂不支持在私聊中回答，请在小程序或电脑的原会话处理。');
/** A deliberately bounded native-question subset; unknown intent/fields must
 * stay in the native UI rather than being silently reinterpreted as a choice. */
export function validateQuestions(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 8)
        return false;
    const ids = new Set();
    for (const item of value) {
        if (!record(item) || Object.keys(item).some(key => !QUESTION_FIELDS.has(key))
            || !nonempty(item.id) || item.id.length > 256 || /\s/u.test(item.id) || ids.has(item.id)
            || !nonempty(item.question) || !optionalText(item.header) || !optionalText(item.detail)
            || item.multiSelect !== undefined && typeof item.multiSelect !== 'boolean')
            return false;
        ids.add(item.id);
        if (item.options === undefined)
            continue;
        if (!Array.isArray(item.options) || item.options.length > 20)
            return false;
        const labels = new Set();
        for (const option of item.options) {
            if (!record(option) || Object.keys(option).some(key => !OPTION_FIELDS.has(key))
                || !nonempty(option.label) || labels.has(option.label.trim()) || !optionalText(option.description))
                return false;
            labels.add(option.label.trim());
        }
    }
    return true;
}
/** Render only plain text. Question/option content never becomes a command,
 * an executable template, an inferred answer, or an approval decision. */
export function formatQuestions(title, questions, codes) {
    if (!text(title) || !validateQuestions(questions) || !Array.isArray(codes) || codes.length !== questions.length
        || codes.some(code => typeof code !== 'string' || !/^[A-Za-z0-9]{1,40}$/u.test(code))
        || new Set(codes.map(code => code.toUpperCase())).size !== codes.length)
        throw unsupported();
    const indent = (value) => value.replace(/\r\n?/gu, '\n').split('\n').map(line => `  ${line}`).join('\n');
    const lines = [`【${title || 'ClawBot'}】`, '请按每题的问题码回复；编号只对应本题。'];
    questions.forEach((question, index) => {
        const code = codes[index], options = question.options || [];
        lines.push('', `问题 ${index + 1}（${code}）`);
        if (question.header)
            lines.push(indent(question.header));
        lines.push(indent(question.question));
        if (question.detail)
            lines.push(indent(question.detail));
        if (options.length) {
            lines.push(question.multiSelect ? '可多选：' : '请选择一项：');
            options.forEach((option, optionIndex) => {
                lines.push(indent(`${optionIndex + 1}. ${option.label}`));
                if (option.description)
                    lines.push(indent(option.description));
            });
            lines.push(`选择示例：/回答 ${code} ${question.multiSelect && options.length > 1 ? '1,2' : '1'}`);
        }
        lines.push(`${options.length ? '也可文字回答' : '文字回答'}：/回答 ${code} 文字 内容`);
    });
    lines.push('', `本组问题先在私聊回答。改到小程序或电脑，请发送：/回答 ${codes[0]} 转原会话`, '转回后用原生卡片重新作答，本组未提交的回答不会带过去。操作审批始终在原生界面处理。');
    const output = lines.join('\n');
    if (output.length > 12000)
        throw new ClawbotError('clawbot-question-too-long', '问题内容较长，请在小程序或电脑的原会话完整查看并回答。');
    return output;
}
/** Parse only the answer after the explicit command and question code. Native
 * option labels are returned verbatim; numeric-looking free text needs 文字. */
export function parseQuestionAnswer(question, value) {
    if (!validateQuestions([question]))
        throw unsupported();
    const options = question.options || [];
    const invalid = () => new ClawbotError('clawbot-answer-invalid', options.length
        ? `回答格式不正确。请在问题码后填写${question.multiSelect ? '选项编号，如 1,2' : '一个选项编号，如 1'}；自由回答请写“文字 内容”。`
        : '请在问题码后写“文字 内容”，例如“文字 你好”。');
    if (typeof value !== 'string' || value.length > 8000 || !text(value))
        throw invalid();
    const answer = value.trim();
    const custom = answer.match(/^文字\s+([\s\S]+)$/u);
    if (custom) {
        const content = custom[1].trim();
        if (!content)
            throw invalid();
        return { id: question.id, selected: [], custom: content };
    }
    if (!options.length || !/^[1-9]\d*(?:[ \t]*[,，][ \t]*[1-9]\d*)*$/u.test(answer))
        throw invalid();
    const indexes = answer.split(/[,，]/u).map(part => Number(part.trim()));
    if (indexes.some(index => !Number.isSafeInteger(index) || index > options.length)
        || new Set(indexes).size !== indexes.length || !question.multiSelect && indexes.length !== 1)
        throw invalid();
    return { id: question.id, selected: indexes.map(index => options[index - 1].label) };
}
