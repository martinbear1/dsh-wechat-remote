import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { verifySessionService } from '../lib/update-session-verification.js'
import { assertPreserved, durableSnapshot } from '../lib/update-worker.js'

function host(ids, history = async () => ({})) {
  const calls = []
  return { calls, read: async (method, payload) => {
    calls.push({ method, payload })
    if (method === 'session.list') return { items: ids.map(sessionId => ({ sessionId, running: false })) }
    assert.equal(method, 'session.history')
    return history(payload.sessionId)
  } }
}

test('native cold catalog can omit a formerly loaded session; remaining history is checked', async () => {
  const h = host(['still-visible'])
  await verifySessionService(h.read, ['native-no-longer-visible', 'still-visible'])
  assert.deepEqual(h.calls, [{ method: 'session.list', payload: undefined },
    { method: 'session.history', payload: { sessionId: 'still-visible', maxMessages: 1 } }])
})

test('native catalog order, additional sessions and a valid empty catalog do not reject an install', async () => {
  for (const ids of [['b', 'a'], ['new', 'a'], []]) {
    const h = host(ids)
    await verifySessionService(h.read, ['a', 'b', 'a'])
    const checked = h.calls.slice(1).map(c => c.payload.sessionId)
    assert.deepEqual(checked, ['a', 'b'].filter(id => ids.includes(id)))
  }
})

test('list transport errors and malformed responses remain failures, not empty catalogs', async () => {
  const unavailable = Error('transport unavailable')
  await assert.rejects(verifySessionService(async () => { throw unavailable }, []), e => e === unavailable)
  for (const items of [undefined, null, {}, [null], [{}], [{ sessionId: '', running: false }],
    [{ sessionId: 'a' }], [{ sessionId: 'a', running: false }, { sessionId: 'a', running: false }]]) {
    await assert.rejects(verifySessionService(async () => ({ items }), []), /无效的会话列表/)
  }
})

test('a previously readable session still exposed by the host must remain readable', async () => {
  const error = Error('history failed')
  await assert.rejects(verifySessionService(host(['a'], async () => { throw error }).read, ['a']), e => e === error)
  const h = host(['previously-unreadable'], async () => { throw error })
  await verifySessionService(h.read, [])
  assert.equal(h.calls.length, 1, 'do not newly require old broken histories to be repaired')
})

test('native catalog omission never excuses changed/deleted histories, attachments, identities or binding', async t => {
  const parent = fs.realpathSync(os.tmpdir())
  const home = fs.mkdtempSync(path.join(parent, 'dsh-update-preservation-'))
  t.after(() => {
    assert.equal(path.dirname(home), parent)
    assert(path.basename(home).startsWith('dsh-update-preservation-'))
    fs.rmSync(home, { recursive: true })
  })
  const stateFile = path.join(home, 'gate-wechat-state.json')
  const fixtures = { 'sessions/project/session/session.v3.jsonl': 'old native history',
    'sessions/project/session/session.v4.jsonl': 'newer native history',
    'attachments/original.txt': 'original attachment', 'harness-remote/instances/web/identity.json': 'original identity' }
  for (const [file, value] of Object.entries(fixtures)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true })
    fs.writeFileSync(path.join(home, file), value)
  }
  fs.writeFileSync(stateFile, JSON.stringify({ token: 'synthetic-token', publicIdentityNodeId: 'synthetic-node' }))
  const job = { home, stateFile }, before = durableSnapshot(job)
  await verifySessionService(host([]).read, ['old-session'])
  assertPreserved(before, durableSnapshot(job))
  for (const [file, value] of Object.entries(fixtures)) {
    const filename = path.join(home, file)
    fs.writeFileSync(filename, 'altered')
    assert.throws(() => assertPreserved(before, durableSnapshot(job)), /数据校验不一致/)
    fs.unlinkSync(filename)
    assert.throws(() => assertPreserved(before, durableSnapshot(job)), /数据校验不一致/)
    fs.writeFileSync(filename, value)
  }
  fs.writeFileSync(stateFile, JSON.stringify({ token: 'different-token', publicIdentityNodeId: 'synthetic-node' }))
  assert.throws(() => assertPreserved(before, durableSnapshot(job)), /数据校验不一致/)
})
