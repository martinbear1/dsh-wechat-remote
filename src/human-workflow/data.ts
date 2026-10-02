/** Shared bounded data and persistence primitives; no DSH or network authority. */
export interface WorkflowScope { nodeId: string; sessionId: string; sessionGeneration: string }
export interface WorkflowDataStore { load(): Promise<unknown>; save(value: unknown): Promise<void> }
export const fail = (code: string, message: string): Error & { code: string } => Object.assign(new Error(message), { code })
export const copy = <T>(value: T): T => structuredClone(value)
export function row(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
}
export function plain(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
}
export function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(value)
}
export function version(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }
export function revision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
export function scopeValid(value: unknown): value is WorkflowScope {
  return row(value) && exact(value, ['nodeId', 'sessionId', 'sessionGeneration']) && identifier(value.nodeId)
    && plain(value.sessionId, 256) && plain(value.sessionGeneration, 80)
}
export function sameScope(a: WorkflowScope, b: WorkflowScope): boolean {
  return a.nodeId === b.nodeId && a.sessionId === b.sessionId && a.sessionGeneration === b.sessionGeneration
}
export function assertScope(scope: WorkflowScope, nodeId: string): void {
  if (!scopeValid(scope) || scope.nodeId !== nodeId) throw fail('workflow-scope-invalid', '工作流不属于此节点或会话身份无效')
}
export function bounded(value: unknown, maxBytes = 2 * 1024 * 1024): void {
  if (Buffer.byteLength(JSON.stringify(value)) > maxBytes) throw fail('workflow-capacity', '工作流本地存储已达到容量上限')
}
/** One owner per profile file. Dispose drains an in-flight atomic write before
 * a replacement registry can open it. Callers never receive an unsaved result. */
export class StateQueue<T> {
  private tail: Promise<unknown> = Promise.resolve()
  private stopped = false
  constructor(private readonly store: WorkflowDataStore, private state: T) {}
  current(): T { this.available(); return this.state }
  private available(): void { if (this.stopped) throw fail('workflow-disabled', '工作流功能已关闭') }
  close(): Promise<void> { this.stopped = true; return this.tail.then(() => {}) }
  update<R>(change: (next: T) => R, signal: AbortSignal): Promise<R> {
    const result = this.tail.then(async () => {
      this.available(); signal.throwIfAborted()
      const next = copy(this.state), result = change(next)
      bounded(next); signal.throwIfAborted()
      try { await this.store.save(next) } catch (cause) { this.stopped = true; throw cause }
      this.state = next
      this.available(); signal.throwIfAborted()
      return copy(result)
    })
    this.tail = result.catch(() => {})
    return result
  }
}
