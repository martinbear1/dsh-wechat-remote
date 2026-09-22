import test from 'node:test'
import assert from 'node:assert/strict'
import { HistoryTurnEvidence } from '../lib/history-turn-evidence.js'
import { TurnActivityCompatibility } from '../lib/turn-activity.js'
import { turnDetails } from '../lib/turn-presentation.js'
import { buildBoundedHistoryWindow } from '../lib/history-service.js'

const entry = (seq, type, data) => ({ event: { seq, type, data, time: seq * 100 } })
export const entries = [
  entry(0, 'turn/start', { turn: 1 }),
  entry(1, 'user/message', { id: 'u', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] }),
  entry(2, 'step/start', { turn: 1, step: 0 }),
  entry(3, 'tool/call', { turn: 1, step: 0, callId: 'c', name: 'write', arguments: JSON.stringify({ file_path: '/中文.txt', content: 'x'.repeat(1000000) }) }),
  entry(4, 'tool/result', { turn: 1, step: 0, message: { id: 'result', source: { kind: 'tool', callId: 'c' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }] }] } }),
  entry(5, 'assistant/message', { turn: 1, step: 0, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    stream: [{ type: 'text-chunks', index: 0, time0: 250, dt: [20], texts: ['', 'answer'] }],
    message: { id: 'a', source: { kind: 'assistant', provider: 'deepseek', model: 'test' }, content: [{ type: 'text', text: 'answer' }, { type: 'text', text: '' }, { type: 'reasoning', text: 'thinking' }] } }),
  entry(6, 'step/end', { turn: 1, step: 0 }),
  entry(7, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
]

test('cross-page native facts converge without retaining bodies or rereading history', () => {
  const c = new HistoryTurnEvidence(), original = JSON.stringify(entries)
  assert.deepEqual(c.accept('s', entries.slice(5)).details, [])
  assert(!c.accept('s', entries.slice(3, 5)).activity.some(f => f.process))
  const merged = c.accept('s', entries.slice(0, 3))
  const activity = new TurnActivityCompatibility()
  assert.deepEqual(merged.activity, entries.map(e => activity.accept(e.event)).filter(Boolean))
  assert.deepEqual(merged.details, turnDetails(entries))
  assert.equal(JSON.stringify(entries), original)
  assert(c.sessions.get('s').bytes < 4000, 'a megabyte of tool input is not cached as accounting evidence')
  assert(!JSON.stringify([...c.sessions.get('s').facts]).includes('thinking'))
})

test('a gap, different node session, altered overlap or eviction cannot claim completeness', () => {
  const c = new HistoryTurnEvidence()
  c.accept('s', entries.slice(5)); assert(!c.accept('s', entries.slice(0, 3)).activity.some(f => f.process))
  assert.deepEqual(c.accept('other', entries.slice(3)).details, [])
  c.clear(); c.accept('s', entries)
  const changed = structuredClone(entries.slice(5)); changed[0].event.data.message.id = 'replacement'
  assert.deepEqual(c.accept('s', changed).details, [])
  c.clear(); assert.deepEqual(c.accept('s', entries.slice(5)).details, [])
})

test('native usage function receives original lifecycle, samples and routes across page boundaries', () => {
  const c = new HistoryTurnEvidence(), calls = []
  const fold = events => { calls.push(events); return { totalTokens: 14, uncachedInputTokens: 10, outputTokens: 4 } }
  assert.deepEqual(c.accept('s', entries.slice(4), fold).details, [])
  const merged = c.accept('s', entries.slice(0, 4), fold)
  assert.equal(calls.length, 1)
  assert.deepEqual(merged.details, turnDetails(entries, fold))
  assert.deepEqual(calls[0].map(e => [e.type, e.data.turn, e.data.step, e.data.usage, e.data.message?.source]),
    calls[1].map(e => [e.type, e.data.turn, e.data.step, e.data.usage, e.data.message?.source]))
})

test('a prefix page can disclose a now complete turn whose answer was on a previous page', async () => {
  const c = new HistoryTurnEvidence(), signal = new AbortController().signal
  c.accept('s', entries.slice(4))
  let reads = 0
  const result = await buildBoundedHistoryWindow({ sessionId: 's', beforeSeq: 4 }, async () => {
    reads++; return { ok: true, value: { events: entries.slice(0, 3), hasMore: false } }
  }, signal, undefined, (_a, b) => b, part => c.accept('s', part))
  // seq 3 is deliberately missing; no false accounting despite both ends.
  assert.equal(reads, 1); assert.equal(result.value.facets['agent.turn-details.v1'].length, 0)
  c.clear(); c.accept('s', entries.slice(3))
  const complete = await buildBoundedHistoryWindow({ sessionId: 's', beforeSeq: 3 }, async () => ({ ok: true,
    value: { events: entries.slice(0, 3), hasMore: false } }), signal, undefined, (_a, b) => b, part => c.accept('s', part))
  assert.equal(complete.value.facets['agent.turn-details.v1'][0].messageId, 'a')
  assert(complete.value.facets['agent.turn-activity.v1'].some(f => f.process?.complete))
})
