import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeScheduledTasks } from '../lib/scheduled-tasks/native.js'
const signal = new AbortController().signal
const row = (patch = {}) => ({ id: 'task', title: 'Name', prompt: 'Instruction', kind: 'daily',
  time: '09:00:00.000', timeZone: 'Asia/Shanghai', scheduledAt: '2099-01-01T01:00:00Z',
  target: { kind: 'session', sessionId: 's' }, involvedSessionIds: ['s'], status: 'active', updatedAt: 'revision-1', ...patch })
function fixture(items = [row()]) {
  const calls = []
  const service = { catalog: async () => items, view: async ({ id }) => items.find(x => x.id === id),
    history: async input => { calls.push(['history', input]); return { records: [], retention: {} } },
    create: async (...args) => { calls.push(['create', ...args]); return row() },
    edit: async (request, actor, cancel) => {
      calls.push(['edit', request, actor, cancel])
      const item = items.find(x => x.id === request.id)
      if (request.expectedUpdatedAt !== (item.updatedAt ?? null)) return { id: item.id, code: 'schedule_conflict' }
      return request.action === 'delete' ? { id: item.id, deleted: true } : { ...item, title: request.patch.title ?? item.title }
    } }
  let current = service
  const adapter = new NativeScheduledTasks({ get: name => name === 'schedule' ? current : name === 'sessions' ? { get: id => id === 's' ? {} : undefined } : undefined })
  return { adapter, items, calls, service, replace: value => { current = value } }
}
test('modern catalog retains paused/RRULE/new targets without fabricating a session or dropping a row', async () => {
  const f = fixture([row(), row({ id: 'rule', kind: 'rrule', rrule: 'DTSTART:20990101T090000Z\nRRULE:FREQ=DAILY', status: 'paused', target: { kind: 'new', create: {} } }),
    row({ id: 'new-once', status: 'ended', target: { kind: 'new_once', sessionId: 'reserved', create: {} } })])
  assert.equal(f.adapter.status().protocolVersion, 2); assert.equal(f.adapter.status().capabilities.pause, true)
  const result = await f.adapter.control('catalog', { protocolVersion: 2 }, signal)
  assert.equal(result.total, 3); assert.deepEqual(result.items.map(x => x.status), ['active', 'paused', 'ended'])
  assert.equal(result.items[1].sessionId, undefined); assert.equal(result.items[2].sessionId, undefined)
  assert.equal(result.items[1].rrule, f.items[1].rrule); assert(result.items.every(x => !Object.hasOwn(x, 'prompt')))
  await assert.rejects(f.adapter.control('catalog', {}, signal), { code: 'operation_unavailable' })
  assert.equal(f.items.length, 3)
})
test('released phone schema preserves representable tasks and native edit revisions', async () => {
  const f = fixture(), detail = await f.adapter.control('detail', { sessionId: 's', id: 'task' }, signal)
  assert.equal(detail.item.status, 'active'); assert.equal(detail.expected.updatedAt, 'revision-1')
  await f.adapter.control('update', { sessionId: 's', id: 'task', expected: detail.expected, title: 'Changed' }, signal)
  assert.deepEqual(f.calls[0], ['edit', { id: 'task', action: 'update', patch: { title: 'Changed' }, expectedUpdatedAt: 'revision-1' }, undefined, signal])
  f.items[0].status = 'ended'
  assert.equal((await f.adapter.control('catalog', {}, signal)).items[0].status, 'inactive')
})
test('native create receives typed timing and explicit existing target, never the new-session default', async () => {
  const f = fixture()
  for (const request of [{ after_seconds: 60 }, { at: '2099-01-01T00:00:00Z' }, { every_seconds: 90 },
    { daily: { time: '09:00', time_zone: 'UTC' } }, { weekly: { time: '09:00', time_zone: 'UTC', weekdays: [1] } },
    { cron: { expression: '0 9 * * *', time_zone: 'UTC' } }]) {
    await f.adapter.control('create', { sessionId: 's', request: { title: 'Name', prompt: 'Instruction', ...request } }, signal)
  }
  assert.deepEqual(f.calls.map(c => c[1].timing.kind), ['after', 'at', 'every', 'daily', 'weekly', 'cron'])
  for (const call of f.calls) { assert.deepEqual(call[1].target, { kind: 'session', sessionId: 's' }); assert.equal(call[2], undefined); assert.equal(call[3], signal) }
  await assert.rejects(f.adapter.control('create', { sessionId: 's', request: { title: 'N', prompt: 'P', at: 'a', after_seconds: 1 } }, signal), { code: 'invalid_selector' })
})
test('modern text edits and pause keep native rule/target unchanged; conflict cannot become success', async () => {
  const original = row({ kind: 'rrule', rrule: 'DTSTART:20990101T090000Z\nRRULE:FREQ=DAILY', target: { kind: 'new', create: { cwd: '/project' } } })
  const f = fixture([original]), expected = { id: 'task', updatedAt: 'revision-1' }
  await f.adapter.control('update', { protocolVersion: 2, id: 'task', expected, prompt: 'Edited', active: false }, signal)
  assert.deepEqual(f.calls[0][1].patch, { prompt: 'Edited', active: false })
  const result = await f.adapter.control('update', { protocolVersion: 2, id: 'task', expected: { id: 'task', updatedAt: 'stale' }, title: 'Stale' }, signal)
  assert.equal(result.code, 'schedule_conflict'); assert.equal(result.record, undefined)
  await assert.rejects(f.adapter.control('update', { protocolVersion: 2, id: 'task', expected: { id: 'task' }, title: 'Missing revision' }, signal), { code: 'invalid_request' })
  assert.equal(original.rrule, f.items[0].rrule)
})
test('history and deletion use host identity and observed revision, without reserved-session activation', async () => {
  const f = fixture([row({ target: { kind: 'new_once', sessionId: 'reserved', create: {} } })])
  await f.adapter.control('history', { protocolVersion: 2, id: 'task', limit: 2 }, signal)
  assert.deepEqual(f.calls[0], ['history', { id: 'task', limit: 2 }])
  await f.adapter.control('delete', { protocolVersion: 2, id: 'task', expected: { id: 'task', updatedAt: 'revision-1' } }, signal)
  assert.equal(f.calls[1][1].expectedUpdatedAt, 'revision-1')
  await assert.rejects(f.adapter.control('delete', { protocolVersion: 2, id: 'task' }, signal), { code: 'invalid_request' })
})
test('active session clocks match native UI involvement without changing execution targets', async () => {
  const f = fixture([row({ target: { kind: 'new', create: {} } }), row({ id: 'paused', status: 'paused', involvedSessionIds: ['other'] })])
  assert.deepEqual(await f.adapter.control('sessionFlags', { sessionIds: ['s', 'other', 'reserved'] }, signal), { sessionIds: ['s'] })
  f.items.push(row({ id: 'destination', target: { kind: 'session', sessionId: 'other' }, involvedSessionIds: ['s', 'other'] }))
  assert.deepEqual(await f.adapter.control('sessionFlags', { sessionIds: ['s', 'other'] }, signal), { sessionIds: ['s','other'] })
})
test('provider withdrawal during native read forbids any subsequent edit', async () => {
  const f = fixture(); f.service.view = async () => { f.replace(undefined); return row() }
  await assert.rejects(f.adapter.control('update', { protocolVersion: 2, id: 'task', expected: { id: 'task', updatedAt: 'revision-1' }, title: 'Late' }, signal), { code: 'schedule_disabled' })
  assert.deepEqual(f.calls, [])
})
