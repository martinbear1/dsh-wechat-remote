import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { installNativeAutomationGate } from '../lib/human-workflow/automation-native.js'

const source = { kind: 'plugin', plugin: 'harness-remote-human-automation' }
const own = id => ({ id, source, content: [{ type: 'text', text: 'approved automation' }] })
const human = id => ({ id, source: { kind: 'user' }, content: [{ type: 'text', text: 'human instruction' }] })
const signal = new AbortController().signal
function history(entries = []) {
  let readCount = 0, failure = false
  const log = entries.map(([type, data], seq) => ({ seq, type, data }))
  const session = { id: 'native-gate-fixture', get seq() { return log.length }, get events() { readCount++; if (failure) throw new Error('history unavailable'); return log.slice() } }
  return { session, log, get reads() { return readCount }, fail(value = true) { failure = value }, append(type, data) { const event = { seq: log.length, type, data }; log.push(event); return event } }
}
async function setup(t, journal = history()) {
  const ctx = new Context(); new SystemPrompt(ctx, {}); const tools = new ToolRuntime(ctx, { mode: 'native' })
  const agent = { id: journal.session.id, session: journal.session, inbox: { nextTurn: [], nextStep: [] }, send(message) { this.inbox.nextTurn.push(message) } }
  const scope = createScope(ctx, agent); agent.ctx = scope.ctx
  const host = { get: name => name === 'tools' ? tools : undefined, on: (...args) => ctx.on(...args) }
  const off = installNativeAutomationGate(host)
  let calls = 0
  tools.register({ name: 'ordinary_tool', description: '', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: '{}' }] }, async execute() { calls++; return {} } })
  const pre = (turn, messages = []) => ctx.waterfall(scopeTarget(agent, agent), 'agent/pre-step', { agent, turn, messages, signal }, () => Promise.resolve({ kind: 'enter' }))
  const request = turn => ctx.waterfall(scopeTarget(agent, agent), 'agent/request', { agent, turn, signal }, () => Promise.resolve({ kind: 'request' }))
  const call = () => tools.execute({ agent, name: 'ordinary_tool', arguments: {}, callId: 'call', signal })
  const publish = (type, data) => { const event = journal.append(type, data); ctx.emit('session/event', journal.session, event); return event }
  const claim = (turn, message) => ctx.emit(scopeTarget(agent, agent), 'agent/inbox/claimed', { agent, turn, message })
  t.after(async () => { off(); await scope.dispose(); await ctx.fiber.dispose() })
  return { ctx, tools, agent, host, journal, pre, request, call, publish, claim, off, get calls() { return calls } }
}

test('unrelated native/standard turns pass with unreadable history and one failed read per high-water mark', async t => {
  const j = history(); j.fail(); const h = await setup(t, j)
  for (let i = 0; i < 20; i++) {
    assert.equal((await h.pre(1)).kind, 'enter')
    assert.equal((await h.request(1)).kind, 'request')
    assert.equal((await h.call()).isError, false)
  }
  assert.equal(h.calls, 20); assert.equal(j.reads, 1)
  h.publish('turn/start', { turn: 2 }); h.claim(2, { id: 'other', source: { kind: 'plugin', plugin: 'another-native-plugin' } })
  assert.equal((await h.pre(2)).kind, 'enter'); assert.equal((await h.call()).isError, false)
})

test('cold claimed producer replay is denied in empty continuation, direct request and native tools', async t => {
  const j = history([
    ['agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own('cold')] }],
    ['turn/start', { turn: 1 }],
    ['agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] }],
  ]), h = await setup(t, j)
  for (let i = 0; i < 20; i++) {
    assert.equal((await h.pre(1)).kind, 'reject')
    await assert.rejects(h.request(1), { code: 'automation-replay-denied' })
    assert.equal((await h.call()).isError, true)
  }
  assert.equal(h.calls, 0); assert.equal(j.reads, 1, 'seed once, not three full scans per continuation')
})

test('an unrelated malformed history entry cannot erase otherwise valid producer evidence', async t => {
  const j = history([['turn/start', { turn: 1 }], ['user/message', own('recognized')]])
  j.log.push(null)
  const h = await setup(t, j)
  assert.equal((await h.pre(1)).kind, 'reject'); assert.equal((await h.call()).isError, true)
  await assert.rejects(h.request(1), { code: 'automation-replay-denied' })
})

test('a past producer turn does not contaminate the next ordinary turn or another session', async t => {
  const h = await setup(t)
  h.publish('turn/start', { turn: 1 }); h.claim(1, own('past'))
  assert.equal((await h.pre(1)).kind, 'reject')
  h.publish('turn/end', { turn: 1, reason: { kind: 'blocked' } })
  h.publish('turn/start', { turn: 2 }); h.claim(2, human('next'))
  assert.equal((await h.pre(2)).kind, 'enter'); assert.equal((await h.request(2)).kind, 'request'); assert.equal((await h.call()).isError, false)
  const sibling = { ...h.agent, session: history().session }
  const siblingScope = createScope(h.ctx, sibling); sibling.ctx = siblingScope.ctx
  t.after(() => siblingScope.dispose())
  assert.equal((await h.tools.execute({ agent: sibling, name: 'ordinary_tool', arguments: {}, callId: 'sibling-call', signal })).isError, false,
    'the same global gate does not transfer old producer evidence to a new Session object, even with the same logical ID')
  assert.equal(h.journal.reads, 1, 'live events maintain the index without new snapshots')
})

test('recognized producer stays blocked through unreadable history; fresh native turn clears only active restriction', async t => {
  const j = history([['turn/start', { turn: 5 }], ['user/message', own('known')]]), h = await setup(t, j)
  assert.equal((await h.pre(5)).kind, 'reject')
  j.fail(); j.append('request/header', {})
  for (let i = 0; i < 10; i++) { assert.equal((await h.call()).isError, true); await assert.rejects(h.request(5), { code: 'automation-replay-denied' }) }
  assert.equal(j.reads, 2, 'one failed recovery at the changed native sequence')
  h.publish('turn/end', { turn: 5 }); h.publish('turn/start', { turn: 6 })
  assert.equal((await h.call()).isError, false); assert.equal((await h.pre(6)).kind, 'enter')
  assert.equal((await h.request(5)).kind, 'request', 'a stale payload alone is not evidence of an executable native replay; native driver owns current-turn consistency')
  h.claim(6, own('known'))
  await assert.rejects(h.request(6), { code: 'automation-replay-denied' }, 'the same old SOURCE reclaimed in the current turn still requires a new lease')
})

test('unknown-history cache cannot hide a later live producer claim or pre-step message', async t => {
  const j = history(); j.fail(); const h = await setup(t, j)
  assert.equal((await h.pre(1)).kind, 'enter')
  h.claim(1, own('late-claim'))
  assert.equal((await h.pre(1)).kind, 'reject'); assert.equal((await h.call()).isError, true)
  h.publish('turn/end', { turn: 1 }); h.publish('turn/start', { turn: 2 })
  assert.equal((await h.pre(2, [own('late-step')])).kind, 'reject'); assert.equal((await h.call()).isError, true)
})

test('missed native publications are recovered by sequence and never replay a cold producer', async t => {
  const j = history(), h = await setup(t, j)
  assert.equal((await h.call()).isError, false)
  j.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own('missed')] })
  j.append('turn/start', { turn: 1 })
  j.append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  assert.equal((await h.call()).isError, true); assert.equal((await h.pre(1)).kind, 'reject'); assert.equal(j.reads, 2)
  h.publish('request/header', {})
  assert.equal((await h.call()).isError, true); assert.equal(j.reads, 2)
})

test('a missed-event gap before live publication recovers queued producer evidence', async t => {
  const j = history(), h = await setup(t, j)
  assert.equal((await h.call()).isError, false)
  j.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own('gap')] })
  j.append('turn/start', { turn: 3 })
  h.publish('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  assert.equal((await h.pre(3)).kind, 'reject'); assert.equal((await h.call()).isError, true); assert.equal(j.reads, 2)
})

test('a failed gap read is not marked covered; later success rebuilds the missed producer prefix', async t => {
  const j = history(), h = await setup(t, j)
  assert.equal((await h.call()).isError, false)
  j.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own('lost-before-failure')] })
  j.append('turn/start', { turn: 4 })
  j.append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  j.fail(); h.publish('request/header', {})
  assert.equal((await h.call()).isError, false, 'unknown native context alone must not block ordinary modes')
  const failedReads = j.reads
  j.fail(false); h.publish('request/completed', {})
  assert.equal(j.reads, failedReads + 1, 'uncovered prefix retried on the next native high-water mark')
  assert.equal((await h.pre(4)).kind, 'reject'); assert.equal((await h.call()).isError, true)
  await assert.rejects(h.request(4), { code: 'automation-replay-denied' })
})

test('incomplete recovery without a later real boundary cannot clear a witnessed producer claim', async t => {
  const j = history(); j.fail(); const h = await setup(t, j)
  h.claim(7, own('witnessed'))
  assert.equal((await h.pre(7)).kind, 'reject')
  j.log.push(null)
  j.append('request/header', {})
  j.fail(false); h.publish('request/completed', {})
  assert.equal((await h.pre(7)).kind, 'reject'); assert.equal((await h.call()).isError, true)
  h.publish('turn/end', { turn: 6 })
  assert.equal((await h.call()).isError, true, 'a different turn end cannot erase the recognized current source')
  h.publish('turn/end', { turn: 7 }); h.publish('turn/start', { turn: 8 })
  assert.equal((await h.call()).isError, false)
})

test('partial older turn start cannot erase a newer SOURCE claim without readable native high-water evidence', async t => {
  const j = history(); j.fail(); const h = await setup(t, j)
  h.claim(7, own('newer-known'))
  j.log.push(null); j.append('turn/start', { turn: 6 })
  j.fail(false); h.publish('request/header', {})
  assert.equal((await h.pre(7)).kind, 'reject'); assert.equal((await h.call()).isError, true)
  h.publish('turn/start', { turn: 8 })
  assert.equal((await h.pre(8)).kind, 'enter'); assert.equal((await h.call()).isError, false)
})

test('long finished history and many producer claims do not contaminate the next ordinary turn', async t => {
  const entries = []
  for (let turn = 0; turn < 2000; turn++) entries.push(['turn/start', { turn }], ['user/message', own(`past-${turn}`)], ['turn/end', { turn }])
  entries.push(['turn/start', { turn: 2000 }], ['user/message', human('current')])
  const j = history(entries), h = await setup(t, j)
  assert.equal((await h.call()).isError, false)
  for (let i = 0; i < 2000; i++) h.claim(2000, own(`unexpected-${i}`))
  assert.equal((await h.call()).isError, true)
  h.publish('turn/end', { turn: 2000 }); h.publish('turn/start', { turn: 2001 })
  assert.equal((await h.call()).isError, false); assert.equal(j.reads, 1)
})

test('gate pending projection retains no ordinary message/content objects', () => {
  const moduleUrl = new URL('../lib/human-workflow/automation-native.js', import.meta.url).href
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { installNativeAutomationGate } from ${JSON.stringify(moduleUrl)};
    const callbacks = new Map(); let reference;
    const host = { get() { return undefined }, on(name, callback) { callbacks.set(name, callback); return () => callbacks.delete(name) } };
    const session = { seq: 1, get events() {
      const message = { id: 'ordinary', source: { kind: 'user' }, content: [{ type: 'text', text: 'x'.repeat(1000000) }] };
      reference = new WeakRef(message);
      return [{ seq: 0, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [message] } }];
    } };
    const close = installNativeAutomationGate(host), agent = { session };
    await callbacks.get('agent/pre-step')({ agent, turn: 1, messages: [] }, async () => ({ kind: 'enter' }));
    for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); global.gc(); }
    assert.equal(reference.deref(), undefined, 'plugin index must not retain ordinary message/source/content objects');
    close();
  `], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error))
})

test('canceled queued automation does not label the human wake-latch turn as producer work', async t => {
  const j = history([
    ['agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [own('cancelled')] }],
    ['turn/start', { turn: 1 }],
    ['agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' }],
    ['user/message', human('actual-human')],
  ]), h = await setup(t, j)
  assert.equal((await h.pre(1)).kind, 'enter'); assert.equal((await h.request(1)).kind, 'request'); assert.equal((await h.call()).isError, false)
})

test('shared native gate remains active until the last service/adapter reference closes', async t => {
  const h = await setup(t), closeSecond = installNativeAutomationGate(h.host)
  h.publish('turn/start', { turn: 1 }); h.claim(1, own('still-blocked'))
  h.off(); assert.equal((await h.pre(1)).kind, 'reject')
  closeSecond(); assert.equal((await h.pre(1)).kind, 'enter')
})
