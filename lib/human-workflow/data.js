export const fail = (code, message) => Object.assign(new Error(message), { code });
export const copy = (value) => structuredClone(value);
export function row(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exact(value, required, optional = []) {
    return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
export function plain(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export function identifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(value);
}
export function version(value) { return Number.isSafeInteger(value) && Number(value) > 0; }
export function revision(value) { return Number.isSafeInteger(value) && Number(value) >= 0; }
export function scopeValid(value) {
    return row(value) && exact(value, ['nodeId', 'sessionId', 'sessionGeneration']) && identifier(value.nodeId)
        && plain(value.sessionId, 256) && plain(value.sessionGeneration, 80);
}
export function sameScope(a, b) {
    return a.nodeId === b.nodeId && a.sessionId === b.sessionId && a.sessionGeneration === b.sessionGeneration;
}
export function assertScope(scope, nodeId) {
    if (!scopeValid(scope) || scope.nodeId !== nodeId)
        throw fail('workflow-scope-invalid', '工作流不属于此节点或会话身份无效');
}
export function bounded(value, maxBytes = 2 * 1024 * 1024) {
    if (Buffer.byteLength(JSON.stringify(value)) > maxBytes)
        throw fail('workflow-capacity', '工作流本地存储已达到容量上限');
}
/** One owner per profile file. Dispose drains an in-flight atomic write before
 * a replacement registry can open it. Callers never receive an unsaved result. */
export class StateQueue {
    store;
    state;
    maxBytes;
    tail = Promise.resolve();
    stopped = false;
    constructor(store, state, maxBytes = 2 * 1024 * 1024) {
        this.store = store;
        this.state = state;
        this.maxBytes = maxBytes;
    }
    current() { this.available(); return this.state; }
    available() { if (this.stopped)
        throw fail('workflow-disabled', '工作流功能已关闭'); }
    close() { this.stopped = true; return this.tail.then(() => { }); }
    update(change, signal) {
        const result = this.tail.then(async () => {
            this.available();
            signal.throwIfAborted();
            const next = copy(this.state), result = change(next);
            bounded(next, this.maxBytes);
            signal.throwIfAborted();
            try {
                await this.store.save(next);
            }
            catch (cause) {
                this.stopped = true;
                throw cause;
            }
            this.state = next;
            this.available();
            signal.throwIfAborted();
            return copy(result);
        });
        this.tail = result.catch(() => { });
        return result;
    }
}
