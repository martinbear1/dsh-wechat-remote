import { fail, row } from '../human-workflow/data.js';
/** Report bounded field paths, never submitted values or a copy of business memory. */
export function assistantFieldPath(parent, key) {
    return /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key) ? `${parent}.${key}`
        : `${parent}[${JSON.stringify(key.slice(0, 80))}${key.length > 80 ? '…' : ''}]`;
}
export function assistantObject(value, required, optional = [], options = {}) {
    const path = options.path || 'arguments', code = options.code || 'assistant-arguments-invalid';
    if (!row(value))
        throw fail(code, `${path} 必须是对象，不能是空值或数组；请按工具 schema 修正，不要改写业务内容。`);
    const missing = required.filter(key => !Object.hasOwn(value, key));
    const unsupported = Object.keys(value).filter(key => !required.includes(key) && !optional.includes(key));
    if (missing.length || unsupported.length) {
        const details = [
            ...missing.slice(0, 4).map(key => `缺少 ${assistantFieldPath(path, key)}`),
            ...unsupported.slice(0, 4).map(key => `不支持 ${assistantFieldPath(path, key)}`
                + (options.moveTo && Object.hasOwn(options.moveTo, key) ? `，应放在 ${options.moveTo[key]}` : '')),
        ];
        throw fail(code, details.join('；') + '。未保存；请保留已有业务资料，只修正参数结构。');
    }
    return value;
}
