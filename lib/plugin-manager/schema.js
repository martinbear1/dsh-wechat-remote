export const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export function localized(v, fallback = '') {
    if (typeof v === 'string')
        return v.slice(0, 16384);
    if (!plain(v))
        return fallback;
    for (const key of ['zh-CN', 'zh', 'en', 'en-US'])
        if (typeof v[key] === 'string')
            return v[key].slice(0, 16384);
    return fallback;
}
const primitive = (v) => v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v);
const safeKey = (s) => typeof s === 'string' && s.length > 0 && s.length <= 256 && !['__proto__', 'constructor', 'prototype'].includes(s);
export function readPath(value, path) {
    for (const key of path) {
        if (!plain(value) || !Object.hasOwn(value, key))
            return undefined;
        value = value[key];
    }
    return value;
}
/** Read the native Schemastery uid/refs data envelope, never execute code from a plugin. */
export function formSection(view, title, writable) {
    const fields = [], unsupported = [];
    const envelope = plain(view.schema) ? view.schema : {};
    const refs = plain(envelope.refs) ? envelope.refs : {};
    const resolve = (v) => plain(v) ? v : plain(refs[v]) ? refs[v] : undefined;
    let count = 0;
    const seen = new Set();
    function visit(reference, path, parentSecret = false, parentReadOnly = false) {
        if (++count > 4096 || path.length > 12) {
            unsupported.push({ path, title: path.join('.'), reason: '表单过于复杂，请在电脑端编辑。' });
            return;
        }
        const node = resolve(reference);
        if (!node || seen.has(node)) {
            unsupported.push({ path, title: path.join('.'), reason: '当前表单类型需要电脑端。' });
            return;
        }
        const meta = plain(node.meta) ? node.meta : {};
        if (meta.hidden === true)
            return;
        const readOnly = parentReadOnly || meta.disabled === true;
        const name = localized(meta.title, path.at(-1) || title);
        const secret = parentSecret || meta.role === 'secret' || (Array.isArray(view.secrets) && view.secrets.some((s) => Array.isArray(s.path) && s.path.length <= path.length && s.path.every((k, i) => path[i] === k)));
        seen.add(node);
        if (node.type === 'object' && plain(node.dict) && !secret) {
            for (const [key, child] of Object.entries(node.dict))
                if (safeKey(key))
                    visit(child, [...path, key], false, readOnly);
        }
        else if (node.type === 'intersect' && Array.isArray(node.list) && !secret) {
            for (const child of node.list)
                visit(child, path, false, readOnly);
        }
        else {
            let type, itemType, options;
            if (['string', 'number', 'boolean'].includes(node.type))
                type = node.type;
            if (node.type === 'array' && !secret) {
                const inner = resolve(node.inner);
                if (inner && ['string', 'number', 'boolean'].includes(inner.type) && inner.meta?.role !== 'secret') {
                    type = 'array';
                    itemType = inner.type;
                }
            }
            if (node.type === 'union' && Array.isArray(node.list) && !secret) {
                const nodes = node.list.map(resolve);
                if (nodes.length > 0 && nodes.length <= 100 && nodes.every((n) => n?.type === 'const' && primitive(n.value))) {
                    type = 'enum';
                    options = nodes.map(n => ({ label: localized(n.meta?.description ?? n.meta?.title, String(n.value)), value: n.value }));
                }
            }
            if (!type || !path.length || fields.length >= 256)
                unsupported.push({ path, title: name, reason: '此字段需要电脑端的专用控件。' });
            else {
                const value = readPath(view.value, path);
                const allowedValue = primitive(value) || type === 'array' && Array.isArray(value) && value.length <= 1000 && value.every(primitive);
                fields.push({ path, title: name, type, ...(itemType ? { itemType } : {}), ...(options ? { options } : {}),
                    description: localized(meta.description), required: meta.required === true, readOnly: !writable || readOnly,
                    ...(typeof meta.min === 'number' ? { minimum: meta.min } : {}), ...(typeof meta.max === 'number' ? { maximum: meta.max } : {}),
                    ...(secret ? { secret: true, configured: Array.isArray(view.secrets) && view.secrets.some((s) => s.set && JSON.stringify(s.path) === JSON.stringify(path)) } : allowedValue ? { value } : {}) });
            }
        }
        seen.delete(node);
    }
    visit(envelope.uid ?? envelope, []);
    // Intersections may repeat a path with differing constraints. Do not permit ambiguous writes.
    const duplicates = fields.filter((f, i) => fields.findIndex(x => JSON.stringify(x.path) === JSON.stringify(f.path)) !== i);
    for (const field of duplicates) {
        unsupported.push({ path: field.path, title: field.title, reason: '复合字段需要电脑端编辑。' });
        for (const item of fields)
            if (JSON.stringify(item.path) === JSON.stringify(field.path))
                item.readOnly = true;
    }
    return { ns: String(view.ns), title, revision: view.revision, writable: writable && Number.isSafeInteger(view.revision), customPage: view.autoGenerate === false,
        fields: fields.filter((f, i) => fields.findIndex(x => JSON.stringify(x.path) === JSON.stringify(f.path)) === i), unsupported };
}
export function validateOperations(section, ops) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 100)
        throw new Error('请选择要保存的设置字段。');
    for (const op of ops) {
        if (!plain(op) || !['set', 'unset'].includes(op.op) || !Array.isArray(op.path) || !op.path.length || !op.path.every(safeKey))
            throw new Error('设置路径无效。');
        if (Object.keys(op).some(k => !['op', 'path', 'value'].includes(k)) || op.op === 'unset' && Object.hasOwn(op, 'value'))
            throw new Error('设置操作包含未知字段。');
        const field = section.fields.find(f => JSON.stringify(f.path) === JSON.stringify(op.path));
        if (!section.writable || !field || field.readOnly)
            throw new Error('该字段不能在小程序中编辑。');
        if (op.op === 'unset')
            continue;
        const v = op.value;
        if (field.type === 'enum' ? !field.options?.some(x => x.value === v)
            : field.type === 'array' ? !Array.isArray(v) || v.length > 1000 || v.some(x => typeof x !== field.itemType || !primitive(x))
                : typeof v !== field.type || !primitive(v))
            throw new Error('设置值类型无效。');
        if (typeof v === 'string' && v.length > 65536)
            throw new Error('设置内容过长。');
        if (typeof v === 'number' && (field.minimum !== undefined && v < field.minimum || field.maximum !== undefined && v > field.maximum))
            throw new Error('设置数值超出范围。');
    }
}
