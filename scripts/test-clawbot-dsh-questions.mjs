/** Isolated native answerer contracts. No real node, account or message. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/dsh-questions.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { DshQuestionBridge } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'))
const tick = () => new Promise(setImmediate)
const deferred = () => Promise.withResolvers()
const qs = () => [{ id: 'a', question: 'Choose a color', options: [{ label: 'Red', description: 'Warm' }, { label: 'Blue' }] },
  { id: 'b', question: 'Your note', detail: 'Plain text' },
  { id: 'c', question: 'Select several', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }]
const answer = () => ({ answers: [{ id: 'a', selected: ['Blue'] }, { id: 'b', selected: [], custom: '中文说明' },
  { id: 'c', selected: ['A', 'B'], custom: 'And another' }] })
function fixture(onQuestion) {
  const received = [], agent = { id: 's1' }
  let listener, fallback = 0, allowed = true, owned = true
  const ctx = { get() { throw Error('no host service or global transport access allowed') }, on(name, fn, options) {
    assert.equal(name, 'user-questions/request'); assert.deepEqual(options, { global: true, prepend: true })
    listener = fn; return () => { listener = undefined }
  } }
  const bridge = new DshQuestionBridge(ctx, value => { if (owned === 'throw') throw Error('host service replaced'); return owned && value === agent }, value => { received.push(value); onQuestion?.(value) },
    () => { fallback++ }, () => { if (!allowed) throw Error('access denied') })
  return { bridge, received, agent, get fallback() { return fallback }, get listener() { return listener },
    set allowed(value) { allowed = value }, set owned(value) { owned = value },
    ask(questions = qs(), extras = {}, target = agent, nextHandler) {
      const d = deferred(), controller = new AbortController(), source = { agent: target, questions, signal: controller.signal, ...extras }
      let nextCalls = 0
      const next = () => { nextCalls++; return nextHandler ? nextHandler() : d.promise }
      const result = listener ? listener(source, next) : next()
      return { ...d, controller, source, result, get nextCalls() { return nextCalls } }
    },
  }
}

test('native scoped claim returns one whole answer batch without calling another answerer or creating a prompt', async () => {
  const h = fixture(); assert.equal(h.bridge.start(), true)
  const native = h.ask(); assert.equal(native.nextCalls, 0); assert.equal(h.received.length, 1)
  const question = h.received[0]; assert.deepEqual(question.questions, qs())
  await question.answer(answer()); assert.deepEqual(await native.result, answer())
  assert.equal(question.signal.aborted, true); assert.equal(native.nextCalls, 0)
  await assert.rejects(question.answer(answer()), /已结束/); question.handoff(); h.bridge.close()
  assert.equal(native.nextCalls, 0); assert.equal(h.fallback, 0)
})

test('explicit handoff delegates exactly once, preserves native result, and rejects late private replies', async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(), q = h.received[0]
  q.handoff(); q.handoff(); h.bridge.close(); assert.equal(native.nextCalls, 1)
  assert.equal(native.controller.signal.aborted, false); assert.equal(q.signal.aborted, true)
  await assert.rejects(q.answer(answer()), /已结束/)
  const reply = answer(); native.resolve(reply); assert.equal(await native.result, reply)
})

test('foreign agents, local turns, missing subjects, and already-pending requests are untouched', async () => {
  const h = fixture(), old = h.ask(); assert.equal(old.nextCalls, 1)
  h.bridge.start(); const foreign = h.ask(qs(), {}, { id: 's2' }); assert.equal(foreign.result, foreign.promise)
  const missing = h.ask(qs(), { agent: undefined }); assert.equal(missing.result, missing.promise)
  h.owned = false; const local = h.ask(); assert.equal(local.result, local.promise)
  assert.equal(h.received.length, 0); assert.equal(h.fallback, 0)
  const reply = answer(); for (const item of [old, foreign, missing, local]) {
    assert.equal(item.nextCalls, 1); item.resolve(reply); assert.equal(await item.result, reply)
  }
  h.bridge.close()
})

for (const [name, questions, extras] of [
  ['plan review', [{ id: 'a', question: 'Approve?', detail: 'delete files', intent: { kind: 'plan-review', approve: 'yes' }, options: [{ label: 'yes' }] }], {}],
  ['unknown intent', [{ id: 'a', question: 'Confirm?', intent: { kind: 'new-intent' } }], {}],
  ['timed question', qs(), { wait: { callId: 'call1', timed: true } }],
  ['duplicate IDs', [{ id: 'a', question: 'One' }, { id: 'a', question: 'Two' }], {}],
  ['ambiguous labels', [{ id: 'a', question: 'Pick', options: [{ label: 'x' }, { label: 'x' }] }], {}],
  ['oversized detail', [{ id: 'a', question: 'One', detail: 'x'.repeat(40000) }], {}],
]) test(`${name} stays in the original native answerer chain`, async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(questions, extras)
  assert.equal(h.received.length, 0); assert.equal(h.fallback, 1); assert.equal(native.nextCalls, 1)
  assert.equal(native.result, native.promise)
  const reply = { answers: [] }; native.resolve(reply); assert.equal(await native.result, reply); h.bridge.close()
})

test('native optional empty display strings and repeated ordinary questions are independent', async () => {
  const h = fixture(); h.bridge.start()
  for (let i = 0; i < 70; i++) {
    const native = h.ask([{ id: 'a', question: 'Pick', header: '', detail: '', options: [{ label: 'X', description: '' }] }])
    await h.received[i].answer({ answers: [{ id: 'a', selected: ['X'] }] }); await native.result
    assert.equal(native.nextCalls, 0)
  }
  assert.equal(new Set(h.received.map(q => q.id)).size, 70); assert.equal(h.fallback, 0); h.bridge.close()
})

test('native request abort ends only the claimed question, without delegate, answer, or host cancellation', async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(), reason = Error('native caller ended')
  const rejection = assert.rejects(native.result, error => error === reason)
  native.controller.abort(reason); await rejection
  assert.equal(h.received[0].signal.aborted, true); assert.equal(native.nextCalls, 0)
  await assert.rejects(h.received[0].answer(answer()), /已结束/); h.bridge.close(); assert.equal(native.nextCalls, 0)
})

test('close and private callback failure hand back ownership without aborting the native request', async () => {
  for (const failure of [false, true]) {
    const h = fixture(failure ? () => { throw Error('cannot present') } : undefined); h.bridge.start()
    const native = h.ask(); h.bridge.close(); h.bridge.close()
    assert.equal(h.received[0].signal.aborted, true); assert.equal(native.nextCalls, 1)
    assert.equal(native.controller.signal.aborted, false); assert.equal(h.listener, undefined)
    native.resolve(answer()); assert.deepEqual(await native.result, answer())
  }
})

test('late ownership loss delegates instead of applying a private reply to another turn', async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(); h.owned = false
  await assert.rejects(h.received[0].answer(answer()), /已结束/); assert.equal(native.nextCalls, 1)
  native.resolve(answer()); await native.result; h.bridge.close()
})

test('ownership lookup failures delegate exactly once and never replace native outcomes', async () => {
  const h = fixture(); h.bridge.start(); h.owned = 'throw'
  const untouched = h.ask(); assert.equal(untouched.nextCalls, 1); assert.equal(untouched.result, untouched.promise)
  h.owned = true; const claimed = h.ask(); h.owned = 'throw'
  await assert.rejects(h.received[0].answer(answer()), /已结束/); assert.equal(claimed.nextCalls, 1)
  for (const pending of [untouched, claimed]) { pending.resolve(answer()); await pending.result }
  h.bridge.close()
})

test('validates original question IDs/options, multiplicity, custom answers, and explicit skip', async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(), q = h.received[0]
  for (const invalid of [
    { answers: [] }, { answers: [...answer().answers, answer().answers[0]] },
    { answers: answer().answers.map((v, i) => i ? v : { id: 'wrong', selected: ['Blue'] }) },
    { answers: answer().answers.map((v, i) => i ? v : { id: 'a', selected: ['Not offered'] }) },
    { answers: answer().answers.map((v, i) => i ? v : { id: 'a', selected: ['Blue', 'Red'] }) },
    { answers: answer().answers.map((v, i) => i ? v : { id: 'a', selected: ['Blue'], custom: 'also' }) },
  ]) await assert.rejects(q.answer(invalid), /不匹配/)
  assert.equal(native.nextCalls, 0); assert.equal(q.signal.aborted, false)
  const skipped = { answers: qs().map(v => ({ id: v.id, selected: [] })) }
  await q.answer(skipped); assert.deepEqual(await native.result, skipped); h.bridge.close()
})

test('access denial makes no native answer and caller may hand off safely', async () => {
  const h = fixture(); h.bridge.start(); const native = h.ask(); h.allowed = false
  await assert.rejects(h.received[0].answer(answer()), /access denied/); assert.equal(native.nextCalls, 0)
  h.received[0].handoff(); assert.equal(native.nextCalls, 1)
  native.resolve(answer()); await native.result; h.bridge.close()
})

test('close cannot re-claim questions synchronously dispatched by a delegated native answerer', async () => {
  const h = fixture(); h.bridge.start(); let nested
  const native = h.ask(qs(), {}, h.agent, () => { nested = h.ask(); return nested.result })
  h.bridge.close(); assert.equal(h.received.length, 1); assert.equal(nested.nextCalls, 1)
  nested.resolve(answer()); assert.deepEqual(await native.result, answer())
})

test('synchronous native delegate failure is preserved without duplicate next', async () => {
  const h = fixture(); h.bridge.start(); const reason = Error('native delegate failed')
  const native = h.ask(qs(), {}, h.agent, () => { throw reason })
  const rejection = assert.rejects(native.result, error => error === reason)
  h.received[0].handoff(); h.bridge.close(); await rejection; assert.equal(native.nextCalls, 1)
})

test('concurrent claimed questions are bounded and overflow delegates natively', async () => {
  const h = fixture(); h.bridge.start(); const pending = Array.from({ length: 9 }, () => h.ask())
  assert.equal(h.received.length, 8); assert.equal(pending[8].nextCalls, 1)
  h.bridge.close(); for (const native of pending) { assert.equal(native.nextCalls, 1); native.resolve(answer()); await native.result }
})
