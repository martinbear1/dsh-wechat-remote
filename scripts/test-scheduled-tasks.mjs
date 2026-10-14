import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/scheduled-tasks/native.ts'], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { NativeScheduledTasks, scheduledError } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'))
const signal = new AbortController().signal
const item = (index = 0) => ({ id: `schedule-${index}`, sessionId: `session-${index % 2}`, title: `Task ${index}`, prompt: 'private task text', kind: 'daily', time: '09:00:00.000', timeZone: 'Asia/Shanghai', scheduledAt: '2099-01-01T01:00:00.000Z', status: index % 2 ? 'inactive' : 'active' })
function fixture(items = [item()]) {
  let calls = [], current
  const services = { schedule: { async catalog() { calls.push(['catalog']); return items }, async history(input) { calls.push(['history', input]); return { id: input.id, records: [], retention: { days: 30, records: 200 }, earlierRecordsUnavailable: false, earlierRecordsPruned: false } },
    async create(id, input, actualSignal) { calls.push(['create', id, input, actualSignal]); return { ...input, id: 'created' } },
    async update(input, actualSignal) { calls.push(['update', input, actualSignal]); return { id: input.id, updated: false, code: 'schedule_conflict' } },
    async delete(input, actualSignal) { calls.push(['delete', input, actualSignal]); return { id: input.id, deleted: true } } },
    sessions: { get: id => id === 'session-live' ? { id } : undefined }, sessionPersistence: { stat: async id => id === 'session-cold' ? { size: 10 } : undefined } }
  current = services.schedule
  const adapter = new NativeScheduledTasks({ get: name => name === 'schedule' ? current : services[name] })
  return { adapter, services, calls, setCurrent: value => { current = value }, items }
}
test('disabled official service hides capability; no owned timer or schedule persistence', async () => {
  const f = fixture(); f.setCurrent(undefined)
  assert.equal(f.adapter.status().enabled, false)
  assert.deepEqual(f.calls, [])
  await assert.rejects(f.adapter.control('catalog', {}, signal), { code: 'schedule_disabled' })
  assert.equal(f.adapter.status().capabilities.pause, false)
})
test('catalog is bounded, summary-only and cursor rejects changes instead of skipping tasks', async () => {
  const f = fixture(Array.from({ length: 203 }, (_, index) => item(index)))
  const first = await f.adapter.control('catalog', { limit: 100 }, signal)
  assert.equal(first.items.length, 100); assert.equal(first.total, 203)
  assert(first.items.every(value => !Object.hasOwn(value, 'prompt')))
  const second = await f.adapter.control('catalog', { cursor: first.nextCursor, limit: 100 }, signal)
  assert.equal(second.items[0].id, 'schedule-100')
  f.items.unshift(item(300))
  await assert.rejects(f.adapter.control('catalog', { cursor: second.nextCursor }, signal), { code: 'catalog_changed' })
})
test('filters and visible-session flags come from true native catalog', async () => {
  const f = fixture([item(0), item(1), item(2)])
  const active = await f.adapter.control('catalog', { status: 'active' }, signal)
  assert.deepEqual(active.items.map(v => v.id), ['schedule-0', 'schedule-2'])
  assert.deepEqual(await f.adapter.control('sessionFlags', { sessionIds: ['session-0', 'session-1', 'missing', 'session-0'] }, signal), { sessionIds: ['session-0'] })
  await assert.rejects(f.adapter.control('sessionFlags', { sessionIds: Array(201).fill('x') }, signal), { code: 'invalid_request' })
})
test('detail binds exact session and returns native CAS record without catalog fields', async () => {
  const f = fixture(), { item: actual, expected } = await f.adapter.control('detail', { sessionId: 'session-0', id: 'schedule-0' }, signal)
  assert.equal(actual.prompt, 'private task text')
  assert.equal(expected.id, 'schedule-0'); assert(!Object.hasOwn(expected, 'sessionId')); assert(!Object.hasOwn(expected, 'status'))
  await assert.rejects(f.adapter.control('detail', { sessionId: 'wrong', id: 'schedule-0' }, signal), { code: 'schedule_not_found' })
})
test('history forwards native exclusive cursor and retention, never marks a model completion', async () => {
  const f = fixture(), request = { sessionId: 'session-0', id: 'schedule-0', limit: 3, before: 'message-older' }
  const value = await f.adapter.control('history', request, signal)
  assert.deepEqual(f.calls[0], ['history', request]); assert.equal(value.retention.days, 30)
  assert.equal(f.adapter.status().historyKind, 'delivery')
  await assert.rejects(f.adapter.control('history', { ...request, limit: 101 }, signal), { code: 'invalid_request' })
})
test('create only calls native core for existing explicit live/cold sessions', async () => {
  const f = fixture(), request = { title: 'Name', prompt: 'Instruction', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } }
  for (const sessionId of ['session-live', 'session-cold']) await f.adapter.control('create', { sessionId, request }, signal)
  assert.equal(f.calls.filter(v => v[0] === 'create').length, 2)
  assert.equal(f.calls[0][3], signal)
  await assert.rejects(f.adapter.control('create', { sessionId: 'missing', request }, signal), { code: 'session_not_found' })
  await assert.rejects(f.adapter.control('create', { request }, signal), { code: 'invalid_request' })
  assert.equal(f.calls.length, 2)
})
test('update preserves exact expected and conflict; delete passes signal without creating replacements', async () => {
  const f = fixture(), expected = { ...item() }; delete expected.sessionId; delete expected.status
  const update = { sessionId: 'session-0', id: 'schedule-0', expected, title: 'Changed' }
  assert.equal((await f.adapter.control('update', update, signal)).code, 'schedule_conflict')
  assert.equal(f.calls[0][1], update); assert.equal(f.calls[0][2], signal)
  assert.equal((await f.adapter.control('delete', { sessionId: 'session-0', id: 'schedule-0' }, signal)).deleted, true)
  assert.equal(f.calls[1][0], 'delete')
  await assert.rejects(f.adapter.control('pause', { sessionId: 'session-0', id: 'schedule-0' }, signal), { code: 'invalid_request' })
})
test('core replaced/unmounted during read or create preflight invalidates stale results', async () => {
  const f = fixture(), pending = Promise.withResolvers()
  f.services.schedule.catalog = () => pending.promise
  const read = f.adapter.control('catalog', {}, signal); f.setCurrent(undefined); pending.resolve([item()])
  await assert.rejects(read, { code: 'schedule_disabled' })
  f.setCurrent(f.services.schedule)
  f.services.sessionPersistence.stat = async () => { f.setCurrent(undefined); return {} }
  await assert.rejects(f.adapter.control('create', { sessionId: 'session-cold', request: { title: 'x', prompt: 'x', after_seconds: 60 } }, signal), { code: 'schedule_disabled' })
  assert(!f.calls.some(v => v[0] === 'create'))
})
test('aborted request and closed adapter never admit new native mutation', async () => {
  const f = fixture(), abort = new AbortController(); abort.abort()
  await assert.rejects(f.adapter.control('delete', { sessionId: 's', id: 't' }, abort.signal))
  f.adapter.close(); assert.equal(f.adapter.status().enabled, false)
  await assert.rejects(f.adapter.control('delete', { sessionId: 's', id: 't' }, signal), { code: 'schedule_disabled' })
  assert.equal(f.calls.length, 0)
})
test('transport errors disclose no host paths and unknown results never invite automatic replay', () => {
  assert.deepEqual(scheduledError(new Error('secret host path')), { code: 'schedule_unavailable', message: '暂时无法确认操作结果，请刷新核对；不要重复提交。' })
  assert.equal(scheduledError({ code: 'invalid_time_zone', message: 'internal' }).message, '请选择有效时区。')
})
