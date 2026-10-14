import { createHash } from 'node:crypto'
import { symbols } from '@deepseek-ai/cordis'
import type { ScheduledCatalog, ScheduledItem, ScheduledRecord, ScheduledStatus, ScheduledSummary } from './protocol.js'

type Row = Record<string, any>
export interface ScheduleHost { get(name: string): any }
interface ScheduleCore {
  catalog(): Promise<ScheduledItem[]>
  history(request: Row): Promise<unknown>
  create?(sessionId: string, request: Row, signal?: AbortSignal): Promise<ScheduledRecord>
  update?(request: Row, signal?: AbortSignal): Promise<unknown>
  delete?(request: Row, signal?: AbortSignal): Promise<unknown>
}
export class ScheduleAdapterError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ScheduleAdapterError' }
}
function fail(code: string, message: string): never { throw new ScheduleAdapterError(code, message) }
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const own = (v: Row, key: string): boolean => Object.prototype.hasOwnProperty.call(v, key)
function keys(v: Row, allowed: string[]): void {
  if (Object.keys(v).some(key => !allowed.includes(key))) fail('invalid_request', '请求包含不支持的字段。')
}
function id(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > 512 || /[\u0000-\u001f]/u.test(v)) fail('invalid_request', '任务或会话标识无效。')
}
function limit(v: unknown, fallback: number): number {
  if (v === undefined) return fallback
  if (!Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > 100) fail('invalid_request', '每页数量应为 1 至 100。')
  return Number(v)
}
function jsonSize(v: unknown): number { return Buffer.byteLength(JSON.stringify(v), 'utf8') }
function record(item: ScheduledItem): ScheduledRecord {
  const { sessionId: _sessionId, status: _status, lastDelivery: _lastDelivery, ...value } = item
  return value
}
function summary(item: ScheduledItem): ScheduledSummary {
  const { prompt: _prompt, ...value } = item
  return value
}
function validateCatalog(value: unknown): asserts value is ScheduledItem[] {
  if (!Array.isArray(value) || value.some(item => !object(item)
    || typeof item.id !== 'string' || typeof item.sessionId !== 'string'
    || typeof item.title !== 'string' || typeof item.prompt !== 'string'
    || typeof item.scheduledAt !== 'string' || !['active', 'inactive'].includes(item.status)
    || !['after', 'at', 'every', 'daily', 'weekly', 'cron'].includes(item.kind))) {
    fail('native_unavailable', '当前 DSH 的自动化任务接口暂不兼容。')
  }
}
function content(v: Row): void {
  if (own(v, 'title') && (typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 120)) fail('invalid_prompt', '任务名称应为 1 至 120 个字符。')
  // A mobile transport budget, not an official DSH restriction. Never truncate.
  if (own(v, 'prompt') && (typeof v.prompt !== 'string' || !v.prompt.trim() || Buffer.byteLength(v.prompt, 'utf8') > 128 * 1024)) fail('invalid_prompt', '任务内容不能为空，且不能超过手机端单次传输上限。')
}

/** Only queries live core services. Turning off the official bundle immediately
 * makes future calls unavailable, without deleting its tasks or keeping a
 * stale service reference. Reads never activate Agents or read Session logs. */
export class NativeScheduledTasks {
  private closed = false
  constructor(private readonly host: ScheduleHost) {}
  close(): void { this.closed = true }
  private current(): ScheduleCore | undefined {
    if (this.closed) return
    const service = this.host.get('schedule')
    if (service && typeof service.catalog === 'function' && typeof service.history === 'function') return service
  }
  status(): ScheduledStatus {
    const service = this.current()
    const sessions = this.host.get('sessions'), persistence = this.host.get('sessionPersistence')
    return { supported: true, enabled: !!service, historyKind: 'delivery', capabilities: {
      create: !!service && typeof service.create === 'function' && (typeof sessions?.get === 'function' || typeof persistence?.stat === 'function'),
      update: !!service && typeof service.update === 'function', delete: !!service && typeof service.delete === 'function', pause: false,
    } }
  }
  private core(): ScheduleCore {
    return this.current() ?? fail('schedule_disabled', '此节点未开启 DSH 自动化任务，或原生服务尚未就绪。')
  }
  private same(service: ScheduleCore, signal: AbortSignal): void {
    signal.throwIfAborted()
    const current = this.current()
    // Cordis returns a fresh contextual proxy on every get(). Its exported
    // original symbol compares provider identity without calling unwrapped
    // methods or bypassing lifecycle/context tracing.
    const identity = (value: ScheduleCore | undefined) => value && ((value as any)[symbols.original] ?? value)
    if (identity(current) !== identity(service)) fail('schedule_disabled', 'DSH 自动化任务状态已变化，请刷新。')
  }
  private async catalog(service: ScheduleCore, signal: AbortSignal): Promise<ScheduledItem[]> {
    const items = await service.catalog()
    this.same(service, signal); validateCatalog(items)
    return items
  }
  async control(action: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    if (!object(input)) fail('invalid_request', '请求格式无效。')
    if (action === 'status') { keys(input, []); return this.status() }
    const service = this.core()
    if (action === 'sessionFlags') {
      keys(input, ['sessionIds'])
      if (!Array.isArray(input.sessionIds) || input.sessionIds.length > 200) fail('invalid_request', '请分批查询当前显示的会话。')
      input.sessionIds.forEach(id)
      const wanted = new Set<string>(input.sessionIds)
      const present = new Set((await this.catalog(service, signal)).filter(item => item.status === 'active').map(item => item.sessionId))
      return { sessionIds: [...wanted].filter(value => present.has(value)) }
    }
    if (action === 'catalog') {
      keys(input, ['status', 'sessionId', 'limit', 'cursor'])
      const status = input.status ?? 'all', count = limit(input.limit, 50)
      if (!['all', 'active', 'inactive'].includes(status)) fail('invalid_request', '任务筛选条件无效。')
      if (input.sessionId !== undefined) id(input.sessionId)
      const items = (await this.catalog(service, signal)).filter(item => (status === 'all' || item.status === status)
        && (input.sessionId === undefined || input.sessionId === item.sessionId)).map(summary)
      const revision = createHash('sha256').update(JSON.stringify([status, input.sessionId ?? null, items])).digest('hex')
      let offset = 0
      if (input.cursor !== undefined) {
        if (typeof input.cursor !== 'string' || input.cursor.length > 256) fail('invalid_request', '分页标识无效。')
        const parts = /^([a-f0-9]{64}):([0-9]+)$/.exec(input.cursor)
        if (!parts) fail('invalid_request', '分页标识无效。')
        if (parts[1] !== revision) fail('catalog_changed', '任务列表已变化，请刷新。')
        offset = Number(parts[2])
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) fail('invalid_request', '分页标识无效。')
      }
      const page: ScheduledSummary[] = []; let bytes = 0
      for (let index = offset; index < items.length && page.length < count; index++) {
        const size = jsonSize(items[index])
        if (bytes + size > 128 * 1024) {
          if (!page.length) fail('response_too_large', '该任务信息较大，请到电脑端查看。')
          break
        }
        page.push(items[index]); bytes += size
      }
      const next = offset + page.length
      return { items: page, total: items.length, ...(next < items.length ? { nextCursor: `${revision}:${next}` } : {}) } satisfies ScheduledCatalog
    }
    if (action === 'detail') {
      keys(input, ['sessionId', 'id']); id(input.sessionId); id(input.id)
      const item = (await this.catalog(service, signal)).find(item => item.id === input.id && item.sessionId === input.sessionId)
      if (!item) fail('schedule_not_found', '任务不存在，或已被删除。')
      return { item, expected: record(item) }
    }
    if (action === 'history') {
      keys(input, ['sessionId', 'id', 'limit', 'before']); id(input.sessionId); id(input.id)
      if (input.before !== undefined) id(input.before)
      const result = await service.history({ ...input, limit: limit(input.limit, 20) })
      this.same(service, signal)
      return result
    }
    if (action === 'create') {
      keys(input, ['sessionId', 'request']); id(input.sessionId)
      if (!object(input.request)) fail('invalid_request', '任务规则无效。')
      keys(input.request, ['title', 'prompt', 'after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'])
      if (!own(input.request, 'title') || !own(input.request, 'prompt')) fail('invalid_prompt', '请填写任务名称和内容。')
      content(input.request)
      if (typeof service.create !== 'function' || !this.status().capabilities.create) fail('operation_unavailable', '当前 DSH 不支持从此入口新建任务。')
      const live = this.host.get('sessions')?.get?.(input.sessionId)
      const stored = live ? true : await this.host.get('sessionPersistence')?.stat?.(input.sessionId, { signal })
      this.same(service, signal)
      if (!live && !stored) fail('session_not_found', '关联会话不存在，请先选择已有会话。')
      // Native create validates recurrence/time zone/selector and owns all
      // persistence + scheduling. No new Session, prompt or task replay here.
      return service.create(input.sessionId, input.request, signal)
    }
    if (action === 'update') {
      keys(input, ['sessionId', 'id', 'expected', 'title', 'prompt', 'change']); id(input.sessionId); id(input.id)
      if (!object(input.expected) || input.expected.id !== input.id) fail('invalid_request', '请刷新任务详情后再编辑。')
      content(input)
      if (typeof service.update !== 'function') fail('operation_unavailable', '当前 DSH 不支持从此入口编辑任务。')
      this.same(service, signal)
      // Keep the exact observed native record for the native FIFO/CAS check.
      return service.update(input, signal)
    }
    if (action === 'delete') {
      keys(input, ['sessionId', 'id']); id(input.sessionId); id(input.id)
      if (typeof service.delete !== 'function') fail('operation_unavailable', '当前 DSH 不支持从此入口删除任务。')
      this.same(service, signal)
      return service.delete(input, signal)
    }
    fail('invalid_request', '不支持此操作。')
  }
}

const messages: Record<string, string> = {
  invalid_prompt: '请检查任务名称和内容。', invalid_selector: '请选择一种定时方式。',
  invalid_rule: '请检查任务时间规则。', invalid_time_zone: '请选择有效时区。',
  not_future: '运行时间必须晚于当前时间。', time_out_of_range: '运行时间超出支持范围。',
  frequency_too_high: '任务执行间隔过短。', schedule_not_found: '任务不存在，或已被删除。',
  schedule_ended: '任务已结束，不能继续编辑。', schedule_conflict: '任务已变化，请刷新后重新编辑。',
}
export function scheduledError(error: unknown): { code: string; message: string } {
  if (error instanceof ScheduleAdapterError) return { code: error.code, message: error.message }
  if (object(error) && typeof error.code === 'string' && own(messages, error.code)) return { code: error.code, message: messages[error.code] }
  return { code: 'schedule_unavailable', message: '暂时无法确认操作结果，请刷新核对；不要重复提交。' }
}
