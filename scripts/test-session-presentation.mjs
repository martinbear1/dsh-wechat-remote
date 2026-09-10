import assert from 'node:assert/strict'
import { presentationProjection, withPresentationProjections } from '../lib/session-presentation.js'
const native = { asOfSeq: 42, values: {
  sessionStats: { turns: 2, steps: 3, toolMs: 40, llmMs: 50, decodeMs: 30, decodeTokens: 20 },
  contextPressure: { pressureTokens: 80, projectedTokens: 90, contextWindow: 100 },
  tokenUsage: { uncachedInputTokens: 5, cacheReadTokens: 10, cacheWriteTokens: 5, outputTokens: 20 },
  plan: { active: true }, todos: [{content:'verify',status:'in_progress'}], goal: null,
} }
const before = JSON.stringify(native), result = withPresentationProjections(native)
assert.equal(JSON.stringify(native), before, 'no mutation of native snapshots')
assert.equal(result.asOfSeq, 42)
assert.equal(result.values['agent.context.v1'].used, 90)
assert.equal(result.values['agent.metrics.v1'].modelMs, 50)
assert.equal(result.values['agent.metrics.v1'].decodeMs, 30)
assert.equal(result.values['agent.metrics.v1'].decodeTokens, 20)
assert.deepEqual(presentationProjection('sessionStats', { decodeMs: -1, decodeTokens: Infinity }).value, {})
assert.equal(presentationProjection('sessionStats', { llmMs: 50 }).value.decodeMs, undefined, 'old hosts must not invent decode time')
assert.deepEqual(result.values['agent.plan.v1'], { steps: [{text:'verify',status:'in_progress'}] })
assert.equal(result.values['agent.goal.v1'], null)
assert.equal(presentationProjection('unknown', {}), null)
assert.deepEqual(presentationProjection('contextPressure', {}).value, {estimated:true})
assert.deepEqual(presentationProjection('sessionStats',{turns:-1,toolMs:NaN}).value,{})
console.log('presentation contract: native fidelity, additive snapshots, missing values, optional facets passed')
