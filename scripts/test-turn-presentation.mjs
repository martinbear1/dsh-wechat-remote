import assert from 'node:assert/strict'
import { turnDetails } from '../lib/turn-presentation.js'
import { buildHistoryWindow } from '../lib/history-service.js'
const event = (type, data, time, seq) => ({ event: { type, data: { turn: 1, ...data }, time, seq } })
const events = [event('turn/start', {}, 100, 0), event('step/start', { step: 0 }, 110, 1),
  event('assistant/chunk', { step: 0, chunk: { type: 'text-delta', text: 'Hi' } }, 130, 2),
  event('assistant/message', { step: 0, usage: { outputTokens: 10 }, message: { id: 'reply', content: [{ type: 'text', text: 'Hi' }] } }, 1130, 3),
  event('step/end', { step: 0 }, 1150, 4), event('turn/end', { reason: { kind: 'completed' } }, 1200, 5)]
const original = JSON.stringify(events)
let called = 0
const usage = native => { called++; assert.equal(native.length, 6); return { totalTokens: 110, uncachedInputTokens: 20, cacheReadTokens: 80, outputTokens: 10, routes: [{provider:'x',model:'y'}] } }
const detail = turnDetails(events, usage)[0]
assert.deepEqual(detail.timing, { elapsedMs: 1100, firstTokenMs: 20, outputTokensPerSecond: 10 })
assert.equal(detail.usage.total, 110)
assert.equal(detail.usage.cacheWrite, undefined)
assert.equal(detail.messageId, 'reply')
assert.deepEqual(turnDetails(events.slice(1), usage), [])
assert.deepEqual(turnDetails(events.slice(0, -1), usage), [])
assert.equal(turnDetails(events)[0].usage, undefined, 'old core without native fold hides exact usage')
assert.equal(turnDetails(events, () => { throw Error('bad native record') })[0].usage, undefined)
assert.equal(JSON.stringify(events), original)
const built = await buildHistoryWindow({sessionId:'s'}, async () => ({ok:true,value:{events,hasMore:false}}), new AbortController().signal, usage)
assert.equal(built.value.events.some(x => x.event.type === 'assistant/chunk'), false)
assert.deepEqual(built.value.facets['agent.turn-details.v1'][0], detail, 'details precede chunk compaction')
assert.equal(called, 2)
console.log('turn details: native accounting boundary, timing, missing/partial turns, identity, pre-compaction passed')
