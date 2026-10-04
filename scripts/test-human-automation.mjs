import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkflowAutomation } from '../lib/human-workflow/automation-engine.js'
import { automationProposalTools } from '../lib/human-workflow/automation-proposal-tools.js'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'

const signal = new AbortController().signal
const scope = { nodeId: 'node_automation_fixture', sessionId: 'automation_session', sessionGeneration: '100' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const processor = { presetId: 'profession', presetDigest: 'a'.repeat(64), provider: 'provider', model: 'model', permissionPreset: 'workspace-write', fingerprint: 'b'.repeat(64) }
const config = { trigger: 'per-submission', roundId: 'r'.repeat(24), instructions: '逐份阅读实际提交，区分事实和推断，准备主人待审反馈。', existing: 'new-only', allowSessionResume: false, maxRuns: 10, timeoutSeconds: 30, concurrency: 1 }
const draftRef = { schema: 'human.lifecycle.draft.ref.v1', draftId: 'f'.repeat(24), version: 1, digest: 'c'.repeat(64), kind: 'review' }
const submission = (id = 's'.repeat(24), acceptedAt = 1100) => ({ id, version: 1, roundId: config.roundId, state: 'accepted', delivery: 'not-required', acceptedAt, values: { reply: '成员提供的信息' } })
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
function store(initial) { let value = structuredClone(initial); return { async load() { return structuredClone(value) }, async save(v) { value = structuredClone(v) }, get value() { return structuredClone(value) } } }
async function fixture(t, options = {}) {
  const state = options.store || store(), stats = { calls: 0, reconciling: 0, restores: 0 }
  const view = { now: 1000, bindingKey: 'e'.repeat(64), submissions: [], native: { processor, sessionSeq: 1, stoppedAtSeq: 0, archived: false, busy: false, live: true }, ready: true, error: null }
  let stop, identity = true, sequence = 0
  const authority = { assertIdentity() { if (!identity) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) },
    async inspect(_scope, _task, _signal, extra = {}) { authority.assertIdentity(); if (view.error) throw view.error; if (options.inspect) await options.inspect(extra)
      const filtered = view.submissions.filter(s => !extra.submissionId || s.id === extra.submissionId), offset = extra.offset ?? 0, limit = view.pageSize ?? filtered.length
      return { bindingKey: view.bindingKey, asOf: view.now, revision: view.revision ?? 2, rounds: [{ id: config.roundId, title: '本轮', closesAt: null }],
        participants: view.participants ?? [], submissions: filtered.slice(offset, offset + limit), nextOffset: offset + limit < filtered.length ? offset + limit : null }
    }, async ready(...args) { if (options.ready) return options.ready(...args); return view.ready } }
  const native = { probe: () => ({ supported: true }), async inspect() { return structuredClone(view.native) }, createMessage: run => ({ id: `message_${run.id}`, message: { id: `message_${run.id}` } }),
    async run(request, runSignal) { stats.calls++; if (options.run) return options.run(request, runSignal)
      await request.authorize(runSignal); await request.claimed(1); await request.tools[0].execute({}, { signal: runSignal }); return { state: 'succeeded', turn: 1 }
    }, async reconcile() { stats.reconciling++; return options.reconcile?.() || { state: 'unknown' } }, onStop(listener) { stop = listener; return () => {} }, async close() {} }
  const runtime = await WorkflowAutomation.open({ nodeId: scope.nodeId, store: state, authority, native, now: () => view.now,
    randomId: () => (++sequence).toString(16).padStart(32, '0'), tools: (_run, _policy, _authorize, saved) => [{ name: 'human_automation_save', async execute() { await saved({ analysisRevision: 1, draftRef }); return {} } }] })
  t.after(() => runtime.close())
  return { runtime, state, view, stats, native, authority, stop: () => stop(scope.sessionId), rotate: () => { identity = false },
    async approve(patch = {}, revision = 0) { const preview = await runtime.preview(scope, taskRef, { config: { ...config, ...patch }, expectedRevision: revision }, signal)
      return runtime.approve(scope, taskRef, { previewId: preview.previewId, digest: preview.digest, expectedRevision: revision }, signal) },
    status: () => runtime.status(scope, taskRef, signal) }
}

test('disabled by default; exact server cutoff + durable receipt gate + duplicate sync dedupe', async t => {
  const h = await fixture(t); h.view.submissions = [submission()]; await h.runtime.drive(); assert.equal(h.stats.calls, 0)
  await h.approve(); h.view.submissions = [submission('a'.repeat(24), 999), submission()]; h.view.ready = false
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); h.view.ready = true
  await h.runtime.drive(); await h.runtime.drive(); const status = await h.status()
  assert.equal(h.stats.calls, 1); assert.equal(status.runs[0].state, 'succeeded'); assert.equal(status.policy.usedRuns, 1)
  assert.equal(h.state.value.runs.length, 1); assert.equal(h.state.value.policies[0].acceptanceCutoff, 1000)
})
test('unknown is not retried and pauses admission of later submissions', async t => {
  const h = await fixture(t, { run: async () => { throw new Error('lost response') } }); await h.approve()
  h.view.submissions = [submission(), submission('a'.repeat(24))]; await h.runtime.drive(); await h.runtime.drive()
  const status = await h.status(); assert.equal(h.stats.calls, 1); assert.equal(status.policy.state, 'paused'); assert.equal(status.runs.filter(r => r.state === 'unknown').length, 1)
})

test('unsupported document automatic reading blocks visibly before any model call', async t => {
  const h = await fixture(t, { ready: async () => { throw Object.assign(new Error('document reading unavailable'), { code: 'automation-document-reading-unavailable' }) } })
  await h.approve(); h.view.submissions = [{ ...submission(), delivery: 'received' }]
  await h.runtime.drive(); await h.runtime.drive()
  const status = await h.status()
  assert.equal(h.stats.calls, 0); assert.equal(status.policy.usedRuns, 0)
  assert.equal(status.policy.state, 'blocked'); assert.match(status.policy.reason, /文档.*自动读取/)
  assert.equal(status.runs.length, 0)
})
test('crash recovery changes dispatch intent to unknown AND pauses active policy', async t => {
  const h = await fixture(t); await h.approve(); h.view.submissions = [submission()]; h.view.native.busy = true; await h.runtime.drive()
  const raw = h.state.value; raw.runs[0].state = 'dispatching'; raw.runs[0].messageId = 'known_message'
  const restored = await fixture(t, { store: store(raw) }); restored.view.submissions = [submission('z'.repeat(24))]
  await restored.runtime.drive(); assert.equal(restored.stats.calls, 0)
  const result = await restored.status(); assert.equal(result.policy.state, 'paused'); assert.equal(result.runs[0].state, 'unknown'); assert.equal(restored.stats.reconciling, 1)
})
test('pause CAS conflict has no hidden halt side effect', async t => {
  const h = await fixture(t); await h.approve(); await assert.rejects(h.runtime.pause(scope, taskRef, 0, signal), { code: 'automation-version-conflict' })
  h.view.submissions = [submission()]; await h.runtime.drive(); assert.equal(h.stats.calls, 1)
})
test('fresh auth failure never returns cached status; offline may return explicitly cached', async t => {
  const h = await fixture(t); await h.approve(); h.view.error = new Error('network offline')
  assert.equal((await h.status()).freshness, 'cached')
  h.view.error = Object.assign(new Error('forbidden'), { code: 'binding_revoked' })
  await assert.rejects(h.status(), { code: 'binding_revoked' }); assert.equal(h.state.value.policies[0].state, 'blocked')
})
test('node/account replacement blocks old approval without calling Agent', async t => {
  const h = await fixture(t); await h.approve(); h.view.submissions = [submission()]; h.view.bindingKey = 'f'.repeat(64)
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); assert.equal(h.state.value.policies[0].state, 'blocked')
})
test('actual model/preset/permissions fingerprint drift needs fresh owner approval', async t => {
  const h = await fixture(t); await h.approve(); h.view.submissions = [submission()]; h.view.native.processor.fingerprint = 'f'.repeat(64)
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); assert.equal(h.state.value.policies[0].state, 'blocked')
})
test('cold session stays queued by default; explicit allowResume is the only admission', async t => {
  const h = await fixture(t); await h.approve(); h.view.native.live = false; h.view.submissions = [submission()]
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); assert.equal(h.state.value.runs[0].state, 'queued')
  h.view.native.live = true; await h.runtime.drive(); assert.equal(h.stats.calls, 1)
})
test('maxRuns is durable and counts dispatched unknown/failure, not a fee budget', async t => {
  const h = await fixture(t); await h.approve({ maxRuns: 1 }); h.view.submissions = [submission(), submission('a'.repeat(24))]
  await h.runtime.drive(); await h.runtime.drive(); assert.equal(h.stats.calls, 1); assert.equal((await h.status()).policy.state, 'exhausted')
})
test('native user stop immediately cancels owned run and durably pauses policy', async t => {
  const entered = deferred(), h = await fixture(t, { run: async (_request, runSignal) => {
    entered.resolve(); await new Promise(resolve => runSignal.addEventListener('abort', resolve, { once: true })); return { state: 'cancelled' }
  } }); await h.approve(); h.view.submissions = [submission()]; const running = h.runtime.drive(); await entered.promise
  h.stop(); await running; assert.equal((await h.status()).policy.state, 'paused'); assert.equal(h.stats.calls, 1)
})
test('authorization rechecks policy version after an awaited receipt check', async t => {
  const waiting = deferred(), release = deferred(); let gate = false
  const h = await fixture(t, { ready: async () => { if (gate) { waiting.resolve(); await release.promise } return true }, run: async (request, s) => {
    gate = true; await request.authorize(s); assert.fail('changed policy must not pass authorize')
  } }); await h.approve(); h.view.submissions = [submission()]; const running = h.runtime.drive(); await waiting.promise
  await h.approve({ instructions: '新的主人要求' }, 1); release.resolve(); await running
  assert.equal(h.stats.calls, 1); assert.equal(h.state.value.runs[0].state, 'unknown')
  assert.equal(h.state.value.policies[0].state, 'active', 'old unknown result cannot pause freshly approved policy version')
  assert.equal(h.state.value.policies[0].usedRuns, 0)
})
test('atomic dispatch admission rejects a policy replacement queued after authorize', async t => {
  const h = await fixture(t); await h.approve(); h.view.submissions = [submission()]
  const create = h.native.createMessage
  h.native.createMessage = (...args) => {
    // Fault injection at the durable queue boundary: represent an already
    // approved newer version queued after authorize but before dispatch CAS.
    void h.runtime.state.update(next => { const p = next.policies[0]; p.policyVersion++; p.revision++; p.usedRuns = 0 }, signal)
    return create(...args)
  }
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); assert.equal(h.state.value.policies[0].usedRuns, 0)
  assert.equal(h.state.value.runs[0].state, 'queued')
})
test('expired/digest-swapped preview cannot approve and restart invalidates previews', async t => {
  const h = await fixture(t); const preview = await h.runtime.preview(scope, taskRef, { config, expectedRevision: 0 }, signal)
  await assert.rejects(h.runtime.approve(scope, taskRef, { previewId: preview.previewId, digest: '0'.repeat(64), expectedRevision: 0 }, signal), { code: 'automation-preview-expired' })
  const restored = await fixture(t, { store: store(h.state.value) }); await assert.rejects(restored.runtime.approve(scope, taskRef, { ...preview, expectedRevision: 0 }, signal), { code: 'automation-preview-expired' })
  h.view.now += 300001; await assert.rejects(h.runtime.approve(scope, taskRef, preview, signal), { code: 'automation-preview-expired' })
})
test('corrupt ledger and another profile/node fail closed', async t => {
  const h = await fixture(t); await h.approve(); const raw = h.state.value; raw.nodeId = 'another_node'
  await assert.rejects(fixture(t, { store: store(raw) }), { code: 'automation-store-invalid' })
  const bad = h.state.value; bad.policies[0].unexpected = true
  await assert.rejects(fixture(t, { store: store(bad) }), { code: 'automation-store-invalid' })
})

test('real proposal tool schemas save editable drafts only, owner preview/approve is still necessary', async t => {
  const f = await fixture(t), agent = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }
  const tools = automationProposalTools({ nodeId: scope.nodeId, runtime: f.runtime, assertAgent: exec => assert.equal(exec.agent, agent) })
  for (const tool of tools) { assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema) }
  assert.deepEqual(tools.map(t => t.name), ['human_automation_propose', 'human_automation_rules'])
  const exec = { agent, signal, callId: 'call', rootCallId: 'call' }
  const draft = await tools[0].execute({ taskRef, config, expectedRevision: 0 }, exec)
  f.view.submissions = [submission()]; await f.runtime.drive(); assert.equal(f.stats.calls, 0)
  const edited = await tools[0].execute({ taskRef, config: { ...config, instructions: '主人讨论后修改工作要求' }, expectedRevision: 0 }, exec)
  assert.notEqual(draft.digest, edited.digest)
  assert.equal((await f.runtime.proposals(scope, taskRef, signal)).proposals.length, 1)
  await f.approve({ instructions: edited.config.instructions }); await f.runtime.drive(); assert.equal(f.stats.calls, 1)
  await assert.rejects(tools[0].execute({ taskRef, config, expectedRevision: 0 }, exec), { code: 'automation-version-conflict' })
  await assert.rejects(f.runtime.propose(scope, taskRef, { config: { ...config, trigger: 'arbitrary-code' }, expectedRevision: 1 }, signal), { code: 'automation-config-invalid' })
})

test('manual proposal does not pause existing policy until owner approves; then no further dispatch', async t => {
  const f = await fixture(t); await f.approve()
  const proposed = await f.runtime.propose(scope, taskRef, { config: { ...config, trigger: 'manual' }, expectedRevision: 1 }, signal)
  assert.equal(f.runtime.policies(scope)[0].state, 'active')
  await f.approve(proposed.config, 1); assert.equal(f.runtime.policies(scope)[0].state, 'paused')
  f.view.submissions = [submission()]; await f.runtime.drive(); assert.equal(f.stats.calls, 0)
})

test('21-person roster requires complete stable cross-page snapshot, freezes latest versions and never retriggers', async t => {
  const f = await fixture(t), refs = Array.from({ length: 21 }, (_, i) => `participant_${i}`.padEnd(24, '_'))
  f.view.participants = refs.map(participantRef => ({ participantRef })); f.view.pageSize = 20
  await f.approve({ trigger: 'all-recipients', recipientRefs: refs, maxRuns: 30 })
  f.view.submissions = refs.slice(0, 20).map((participantRef, i) => ({ ...submission(`submission_${i}`.padEnd(24, '_')), participantRef }))
  await f.runtime.drive(); assert.equal(f.stats.calls, 0); assert.equal(f.runtime.policies(scope)[0].batch, undefined)
  f.view.submissions.push({ ...submission('last_submission'.padEnd(24, '_')), participantRef: refs[20] })
  f.view.submissions.push({ ...submission('latest_submission'.padEnd(24, '_')), version: 2, participantRef: refs[0] })
  f.view.ready = false; await f.runtime.drive(); assert.equal(f.stats.calls, 0); f.view.ready = true
  await f.runtime.drive(); assert.equal(f.stats.calls, 4)
  const policy = f.runtime.policies(scope)[0]; assert.equal(policy.batch.selections.length, 21)
  assert.equal(policy.batch.selections.find(s => s.participantRef === refs[0]).submissionVersion, 2)
  for (let n = 0; n < 6; n++) await f.runtime.drive()
  assert.equal(f.stats.calls, 21); assert.equal(f.runtime.policies(scope)[0].state, 'exhausted')
  f.view.submissions.push({ ...submission('new_after_batch'.padEnd(24, '_')), version: 3, participantRef: refs[0] })
  await f.runtime.drive(); assert.equal(f.stats.calls, 21)
  const reloaded = await fixture(t, { store: store(f.state.value) }); reloaded.view.participants = f.view.participants; reloaded.view.submissions = f.view.submissions
  await reloaded.runtime.drive(); assert.equal(reloaded.stats.calls, 0)
})

test('roster revision race, invented participant, new-only old submission and insufficient budget fail closed', async t => {
  let h
  h = await fixture(t, { inspect: async extra => { if (extra.offset) h.view.revision = 3 } })
  const refs = ['a'.repeat(24), 'b'.repeat(24)]; h.view.participants = refs.map(participantRef => ({ participantRef }))
  await assert.rejects(h.approve({ trigger: 'all-recipients', recipientRefs: ['x'.repeat(24)] }), { code: 'automation-recipients-invalid' })
  await assert.rejects(h.approve({ trigger: 'all-recipients', recipientRefs: refs, maxRuns: 1 }), { code: 'automation-config-invalid' })
  await h.approve({ trigger: 'all-recipients', recipientRefs: refs }); h.view.pageSize = 1
  h.view.submissions = refs.map((participantRef, i) => ({ ...submission(String(i).repeat(24), i ? 1100 : 999), participantRef }))
  await h.runtime.drive(); assert.equal(h.stats.calls, 0); assert.equal(h.runtime.policies(scope)[0].batch, undefined)
  await h.runtime.drive(); assert.equal(h.stats.calls, 0) // old submission still excluded
})

test('proposal tool withholds late result after genuine cancellation or session-generation change', async t => {
  for (const kind of ['cancel', 'generation']) {
    const f = await fixture(t), gate = deferred(), entered = deferred(), save = f.state.save
    f.state.save = async value => { entered.resolve(); await gate.promise; await save(value) }
    const controller = new AbortController(), agent = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }
    const tool = automationProposalTools({ nodeId: scope.nodeId, runtime: f.runtime, assertAgent() {} })[0]
    const operation = tool.execute({ taskRef, config, expectedRevision: 0 }, { agent, signal: controller.signal })
    await entered.promise
    if (kind === 'cancel') controller.abort(); else agent.session.header.createdAt = 200
    gate.resolve(); await assert.rejects(operation)
    assert.equal(f.state.value.proposals[0].scope.sessionGeneration, '100', 'saved draft stays bound to old real generation')
    assert.equal(f.runtime.policies(scope).length, 0); assert.equal(f.stats.calls, 0)
  }
})
