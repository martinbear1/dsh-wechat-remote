import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { turnDetails } = await import(process.env.HARNESS_TURN_PRESENTATION_MODULE
  ? pathToFileURL(path.resolve(process.env.HARNESS_TURN_PRESENTATION_MODULE)).href
  : new URL('../lib/turn-presentation.js', import.meta.url).href)
const e = (seq, type, time, data = {}) => ({ seq, type, time, data: { turn: 1, ...data } })
const tokens = (input, output) => ({ inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: input + output })
const text = (time, value) => ({ type: 'chunk', time, chunk: { type: 'text-delta', index: 0, text: value } })
const sample = (time, usage) => ({ type: 'chunk', time, chunk: { type: 'usage', usage } })
const message = (seq, time, step = 1, stream = [text(1000, 'answer')]) => e(seq, 'assistant/message', time, {
  step, stream, usage: tokens(20, 30), message: { id: 'answer-' + seq, role: 'assistant',
    source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text: 'answer' }] },
})
const retried = () => [e(0, 'turn/start', 0), e(1, 'step/start', 100, { step: 1 }),
  e(2, 'assistant/attempt', 400, { step: 1, stream: [text(200, 'first'), sample(350, tokens(10, 5))] }),
  e(3, 'llm/retry', 450, { step: 1 }), e(4, 'llm/retry-started', 800, { step: 1 }),
  message(5, 1300), e(6, 'step/end', 1400, { step: 1 }), e(7, 'turn/end', 1500)]
const rows = events => events.map(event => ({ event }))
const expected = { elapsedMs: 1500, firstTokenMs: 100, outputTokensPerSecond: 30 / 1.1 }

test('compact failed attempt retains first token through retry; only settled output feeds speed', () => {
  assert.deepEqual(turnDetails(rows(retried()))[0].timing, expected)
})

test('bounded history facts preserve attempt first-token evidence after removing stream bytes', () => {
  const events = retried()
  delete events[2].data.stream
  delete events[5].data.stream
  assert.deepEqual(turnDetails(rows(events), undefined, new Map([[2, 200], [5, 1000]]))[0].timing, expected)
})

test('legacy durable chunks keep the same retry timing and do not double count', () => {
  const events = retried()
  events[2] = e(2, 'assistant/chunk', 200, { step: 1, chunk: { type: 'text-delta', index: 0, text: 'first' } })
  assert.deepEqual(turnDetails(rows(events))[0].timing, expected)
})

test('an attempt without a token does not replace the eventual first-token reading', () => {
  const events = retried()
  events[2].data.stream = [text(200, ''), sample(350, tokens(10, 5))]
  assert.deepEqual(turnDetails(rows(events))[0].timing, { elapsedMs: 1500, firstTokenMs: 900, outputTokensPerSecond: 100 })
})

test('failed/cancelled unassembled attempt does not disclose a timed completed reply', () => {
  for (const kind of ['error', 'aborted', 'interrupted']) {
    const events = retried().slice(0, 3)
    events.push(e(3, 'step/end', 500, { step: 1 }), e(4, 'turn/end', 600, { reason: { kind } }))
    assert.deepEqual(turnDetails(rows(events)), [])
  }
})

test('step boundary clears prior attempt timing and rejects unrelated step evidence', () => {
  const events = [e(0, 'turn/start', 0), e(1, 'step/start', 100, { step: 1 }),
    e(2, 'assistant/attempt', 400, { step: 1, stream: [text(200, 'first')] }),
    e(3, 'step/end', 500, { step: 1 }), e(4, 'step/start', 700, { step: 2 }),
    e(5, 'assistant/attempt', 800, { step: 1, stream: [text(750, 'stale step')] }),
    message(6, 1300, 2), e(7, 'step/end', 1400, { step: 2 }), e(8, 'turn/end', 1500)]
  assert.deepEqual(turnDetails(rows(events))[0].timing, { elapsedMs: 1500, firstTokenMs: 300, outputTokensPerSecond: 100 })
})

test('incomplete pages stay unavailable even if an attempt carries a token', () => {
  assert.deepEqual(turnDetails(rows(retried().slice(1))), [])
  assert.deepEqual(turnDetails(rows(retried().slice(0, -1))), [])
})

test('official installed runtime oracle agrees on retry, failures and settled output accounting',
  { skip: !process.env.HARNESS_DSH_RUNTIME_DIR }, async () => {
    const modules = path.join(process.env.HARNESS_DSH_RUNTIME_DIR, 'node_modules/@deepseek-ai')
    const { sessionStatsProjectionDefinition: native } = await import(pathToFileURL(path.join(modules, 'dsh-session-stats/lib/types/projection.js')).href)
    const { deriveTurnTokenUsage } = await import(pathToFileURL(path.join(modules, 'dsh-token-meter/lib/types/client.js')).href)
    const events = retried(), stats = native.wire.view(events.reduce((s, event) => native.apply(s, event), native.init()))
    const detail = turnDetails(rows(events), deriveTurnTokenUsage)[0]
    assert.equal(detail.timing.firstTokenMs, stats.ttftMs / stats.ttftSteps)
    assert.equal(detail.timing.outputTokensPerSecond, stats.decodeTokens / (stats.decodeMs / 1000))
    assert.equal(detail.usage.total, 65)
    assert.equal(detail.usage.output, 35, 'accounting includes attempts; speed intentionally uses settled output only')
    const first = message(2, 300, 1, [text(200, 'first step')])
    first.data.usage = tokens(5, 10)
    const crossStep = [e(0, 'turn/start', 0), e(1, 'step/start', 100, { step: 1 }), first,
      e(3, 'step/end', 400, { step: 1 }), e(4, 'step/start', 500, { step: 2 }),
      e(5, 'assistant/attempt', 750, { step: 2, stream: [text(700, 'retry prefix'), sample(740, tokens(10, 5))] }),
      e(6, 'llm/retry', 800, { step: 2 }), e(7, 'llm/retry-started', 900, { step: 2 }),
      message(8, 1200, 2, [text(1000, 'second step')]), e(9, 'step/end', 1250, { step: 2 }), e(10, 'turn/end', 1300)]
    const multi = native.wire.view(crossStep.reduce((s, event) => native.apply(s, event), native.init()))
    assert.equal(multi.ttftMs, 300); assert.equal(multi.ttftSteps, 2)
    assert.equal(multi.decodeMs, 600); assert.equal(multi.decodeTokens, 40)
    const crossDetail = turnDetails(rows(crossStep), deriveTurnTokenUsage)[0]
    assert.equal(crossDetail.timing.firstTokenMs, 100, 'turn extension is the first settled step, not the session average')
    assert.equal(crossDetail.timing.outputTokensPerSecond, multi.decodeTokens / (multi.decodeMs / 1000))
    for (const kind of ['error', 'aborted', 'interrupted']) {
      const ended = events.slice(0, 3)
      ended.push(e(3, 'step/end', 500, { step: 1 }), e(4, 'turn/end', 600, { reason: { kind } }))
      const stats = native.wire.view(ended.reduce((s, event) => native.apply(s, event), native.init()))
      assert.equal(stats.steps, 1); assert.equal(stats.ttftSteps, 0); assert.equal(stats.decodeTokens, 0)
      assert.deepEqual(turnDetails(rows(ended), deriveTurnTokenUsage), [])
    }
  })
