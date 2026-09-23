import { presentToolResult } from './tool-result-compat.js';
// Metadata consumed by native ui-tool / ui-cordis's central cards. Unknown
// extension metadata is not rendered by WebUI's generic row, so it must not
// turn a short visible tool result into a large-record preview on the phone.
// Keep values uncoerced: the native card models still validate their shape.
function fields(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
    return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}
function rows(value, keys) {
    return Array.isArray(value) ? value.map(row => fields(row, keys)) : value;
}
/** Read-only mobile presentation; original native records remain intact.
 * Resources, turn usage and signed details are derived from the original. */
export function toolRecordPresentation(entry) {
    entry = presentToolResult(entry);
    if (entry.event?.type !== 'tool/result')
        return entry;
    const data = entry.event.data, meta = data?.meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
        return entry;
    const selected = fields(meta, ['path', 'offset', 'lines', 'totalLines', 'lang', 'diffs',
        'shape', 'files', 'paths', 'truncated', 'total', 'answer', 'sources', 'url', 'statusCode',
        'pluginId', 'packageId', 'pluginRunId']);
    if (Object.hasOwn(selected, 'lines'))
        selected.lines = rows(selected.lines, ['number', 'text']);
    if (Object.hasOwn(selected, 'diffs'))
        selected.diffs = rows(selected.diffs, ['path', 'oldText', 'newText']);
    if (Object.hasOwn(selected, 'sources'))
        selected.sources = rows(selected.sources, ['url', 'title', 'snippet', 'publishedAt']);
    if (Array.isArray(selected.files))
        selected.files = selected.files.map((file) => {
            const narrowed = fields(file, ['path', 'matches']);
            return narrowed && typeof narrowed === 'object' && !Array.isArray(narrowed) && Object.hasOwn(narrowed, 'matches')
                ? { ...narrowed, matches: rows(narrowed.matches, ['lineNumber', 'line']) } : narrowed;
        });
    return { ...entry, event: { ...entry.event, data: { ...data, meta: selected } } };
}
