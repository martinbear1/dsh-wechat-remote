import test from 'node:test'
import assert from 'node:assert/strict'
import { HumanToolsCore, HUMAN_RETENTION_MS } from '../lib/human-tools/core.js'
import { actionReceiptRecovery } from '../lib/human-tools/receipt-recovery.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'

const signal = new AbortController().signal
const origin = { scope: 'session-recovery', generation: '100', callId: 'original', rootCallId: 'original' }
const binding = { schema: 'human.node.binding.v1', nodeId: 'node_recovery_1234567890', ownerSubject: 'owner', accountInstance: 'account', generation: 'binding-one' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 'task_recovery_123456789012', deliveryId: 'delivery_recovery_12345678' }
const selectionRef = { ...taskRef, schema: 'human.members.ref.v1', revision: 1, memberRefs: ['member_recovery_1234567890'] }
const request = (surface, attemptId = 'attempt_recovery_123456') => ({ scope: origin.scope, surfaceId: surface.id, revision: 1, actionId: surface.actions[0].id, attemptId })
const nextOrigin = name => ({ ...origin, callId: name, rootCallId: name })
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function memory() {
  let ledger = { schemaVersion: 1, records: [] }, writes = 0, serial = 0
  return { load: async () => structuredClone(ledger), save: async value => { writes++; ledger = structuredClone(value) },
    id: () => (++serial).toString(16).padStart(32, '0'), get writes() { return writes } }
}
function response(body, phase = 'completed', outcome = 'success') {
  const { scope, sessionGeneration, surfaceId, attemptId, surface } = body
  return { ok: true, schema: 'human.action.recovery.v1', binding: structuredClone(binding), origin: { scope, sessionGeneration, surfaceId, attemptId },
    actionId: surface.actions[0].id, surfaceId, attemptId, surfaceDigest: sha256(canonicalSubmission(surface)), phase,
    ...(phase === 'completed' ? { outcome, ...(outcome === 'success' && surface.actions[0].id === 'share' ? { taskRef }
      : outcome === 'success' && surface.actions[0].id === 'select-members' ? { selectionRef } : {}) } : {}) }
}
async function fixture(t, options = {}) {
  const store = memory(), calls = [], checks = []
  let current = true, now = 1000, currentGeneration = origin.generation
  const transport = { nodeId: binding.nodeId,
    assertIdentity() { if (!current) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) },
    async request(operation, body, active) {
      assert.equal(operation, 'action-result', 'recovery must not grant, publish, select, remind or broadly query')
      active.throwIfAborted(); calls.push(structuredClone(body))
      return options.read ? options.read(body, active) : response(body)
    } }
  const recovery = actionReceiptRecovery(transport, async (scope, generation, active) => {
    active.throwIfAborted(); checks.push({ scope, generation })
    if (scope !== origin.scope || generation !== currentGeneration) throw Object.assign(new Error('changed session'), { code: 'human-origin-conflict' })
  })
  const core = await HumanToolsCore.open(store, store.id, () => now, undefined, recovery)
  t.after(() => core.close())
  const share = await core.create(origin, '作文', '已确认的要求', signal)
  return { core, share, store, calls, checks, recovery, transport,
    revoke() { current = false }, expire() { now += HUMAN_RETENTION_MS }, changeGeneration() { currentGeneration = '101' } }
}

test('missing share ACK is authoritatively recovered before member tool, then durable and idempotent across restart', async t => {
  const f = await fixture(t)
  await f.core.claim(request(f.share), signal)
  const members = await f.core.createMembers(nextOrigin('members'), f.share.id, signal)
  assert.deepEqual(members.targetTaskRef, taskRef)
  assert.equal(f.calls.length, 1); assert.equal(f.checks.length, 2)
  const receipt = f.core.status(origin.scope, f.share.id).receipts[0]
  assert.equal(receipt.outcome, 'success'); assert.deepEqual(receipt.taskRef, taskRef)
  assert.equal(receipt.delivery, 'recorded')
  const before = f.store.writes
  assert.deepEqual(await f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal), receipt)
  assert.equal(f.store.writes, before)
  await f.core.close()
  const reopened = await HumanToolsCore.open(f.store, f.store.id, () => 1001, undefined, async () => assert.fail('already recovered cannot query again'))
  t.after(() => reopened.close())
  assert.deepEqual((await reopened.createMembers(nextOrigin('after-restart'), f.share.id, signal)).targetTaskRef, taskRef)
})

test('source recovery applies to group reuse, collection, workspace admission and selection-source reminders', async t => {
  for (const operation of ['share', 'collection', 'workspace']) {
    const f = await fixture(t); await f.core.claim(request(f.share), signal)
    const result = operation === 'share' ? await f.core.create(nextOrigin('new'), '另一任务', '独立内容', signal, f.share.id)
      : operation === 'collection' ? await f.core.createCollection(nextOrigin('new'), '收集', '提交资料',
        { title: '要求', instructions: '填写', form: { schema: 'human.form.v1', fields: [], attachment: null }, closesAt: null, recipientRefs: null }, signal, f.share.id)
        : await f.core.publishedEvidence({ nodeId: binding.nodeId, sessionId: origin.scope, sessionGeneration: origin.generation }, f.share.id, signal)
    assert.deepEqual(operation === 'workspace' ? result.taskRef : result.targetTaskRef, taskRef)
    assert.equal(f.calls.length, 1)
  }
  const f = await fixture(t); await f.core.claim(request(f.share), signal)
  const members = await f.core.createMembers(nextOrigin('members'), f.share.id, signal)
  await f.core.claim(request(members, 'attempt_selected_123456'), signal)
  const reminder = await f.core.createReminder(nextOrigin('reminder'), members.id, '请查看', signal)
  assert.deepEqual(reminder.selectionRef, selectionRef)
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls.map(call => call.surface.actions[0].id), ['share', 'select-members'])
})

test('durable source success is sufficient for tools even with a later missing attempt; explicit status still checks it', async t => {
  let online = false
  const f = await fixture(t, { read: body => {
    if (!online) throw Object.assign(new Error('optional read offline'), { code: 'workflow-network-unavailable' })
    return response(body, 'completed', 'cancelled')
  } })
  await f.core.claim(request(f.share), signal)
  const successful = await f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal)
  const laterAttempt = request(f.share, 'attempt_later_missing_123456')
  await f.core.claim(laterAttempt, signal)
  const members = await f.core.createMembers(nextOrigin('reuse-members'), f.share.id, signal)
  assert.deepEqual(members.targetTaskRef, taskRef)
  assert.deepEqual((await f.core.create(nextOrigin('reuse-share'), '另一任务', '要求', signal, f.share.id)).targetTaskRef, taskRef)
  assert.deepEqual((await f.core.createCollection(nextOrigin('reuse-collection'), '收集', '提交资料',
    { title: '要求', instructions: '填写', form: { schema: 'human.form.v1', fields: [], attachment: null }, closesAt: null, recipientRefs: null },
    signal, f.share.id)).targetTaskRef, taskRef)
  assert.deepEqual((await f.core.publishedEvidence({ nodeId: binding.nodeId, sessionId: origin.scope, sessionGeneration: origin.generation },
    f.share.id, signal)).taskRef, taskRef)
  await f.core.claim(request(members), signal)
  await f.core.ack({ ...request(members), outcome: 'success', selectionRef }, signal)
  await f.core.claim(request(members, 'attempt_member_later_123456'), signal)
  assert.deepEqual((await f.core.createReminder(nextOrigin('reuse-reminder'), members.id, '请查看', signal)).selectionRef, selectionRef)
  assert.equal(f.calls.length, 0, 'source tools must not acquire a new network dependency from unrelated missing attempts')
  for (const surface of [f.share, members])
    await assert.rejects(f.core.reconcileStatus(origin.scope, surface.id, origin.generation, signal), { code: 'workflow-network-unavailable' })
  assert.equal(f.calls.length, 2, 'explicit status must still query each missing attempt')
  online = true
  const current = await f.core.reconcileStatus(origin.scope, f.share.id, origin.generation, signal)
  assert.equal(f.calls.length, 3); assert.equal(f.calls[2].attemptId, laterAttempt.attemptId)
  assert.equal(current.receipts.length, 2); assert.deepEqual(current.receipts[0], successful)
  assert.equal(current.receipts[1].outcome, 'cancelled'); assert.equal(current.receipts[1].attemptId, laterAttempt.attemptId)
  assert.deepEqual((await f.core.createMembers(nextOrigin('after-later-cancellation'), f.share.id, signal)).targetTaskRef, taskRef)
  assert.equal(f.calls.length, 3, 'a separate cancellation cannot erase an earlier valid published source')
  for (const invalid of [{ ...nextOrigin('wrong-session'), scope: 'other' }, { ...nextOrigin('wrong-generation'), generation: '101' }])
    await assert.rejects(f.core.createMembers(invalid, f.share.id, signal))
  f.expire()
  await assert.rejects(f.core.createMembers(nextOrigin('expired'), f.share.id, signal), { code: 'human-surface-unavailable' })
  assert.equal(f.calls.length, 3)
})

test('missing/pending/failed/cancelled/unknown results never authorize source reuse, and later pending may be rechecked', async t => {
  for (const phase of ['missing', 'pending', 'failed', 'cancelled', 'unknown']) {
    let complete = false
    const f = await fixture(t, { read: body => complete ? response(body) : response(body, ['missing', 'pending'].includes(phase) ? phase : 'completed', phase) })
    await f.core.claim(request(f.share), signal)
    await assert.rejects(f.core.createMembers(nextOrigin('members'), f.share.id, signal), { code: 'human-source-unavailable' })
    assert.equal(f.core.status(origin.scope, f.share.id).receipts.length, ['missing', 'pending'].includes(phase) ? 0 : 1)
    complete = true
    if (['missing', 'pending'].includes(phase)) {
      assert.deepEqual((await f.core.createMembers(nextOrigin('after-completion'), f.share.id, signal)).targetTaskRef, taskRef)
      assert.equal(f.calls.length, 2)
    } else {
      await assert.rejects(f.core.createMembers(nextOrigin('after-completion'), f.share.id, signal), { code: 'human-source-unavailable' })
      assert.equal(f.calls.length, 1, 'terminal history is immutable, not retried or promoted')
    }
  }
})

test('no recovery for unclaimed, wrong-session, wrong-generation, expired, closed or revoked sources', async t => {
  const unclaimed = await fixture(t)
  await assert.rejects(unclaimed.core.createMembers(nextOrigin('members'), unclaimed.share.id, signal), { code: 'human-source-unavailable' })
  assert.equal(unclaimed.calls.length, 0)
  for (const scenario of ['session', 'generation', 'expiry', 'closed', 'revoked']) {
    const f = await fixture(t); await f.core.claim(request(f.share), signal)
    if (scenario === 'expiry') f.expire()
    if (scenario === 'closed') await f.core.close()
    if (scenario === 'revoked') f.revoke()
    await assert.rejects(f.core.createMembers({ ...nextOrigin('members'), ...(scenario === 'session' ? { scope: 'other-workspace-session' } : {}),
      ...(scenario === 'generation' ? { generation: 'other-generation' } : {}) }, f.share.id, signal))
    assert.equal(f.calls.length, 0)
  }
})

test('recovery response validates exact binding, source, action, digest, references and terminal shape', async t => {
  const mutations = [
    r => { r.binding.nodeId = 'other_node' }, r => { r.binding.ownerSubject = '' }, r => { r.origin.scope = 'other-session' },
    r => { r.origin.sessionGeneration = '101' }, r => { r.origin.surfaceId = 'f'.repeat(32) }, r => { r.origin.attemptId = 'attempt_other_123456' },
    r => { r.surfaceId = 'f'.repeat(32) }, r => { r.attemptId = 'attempt_other_123456' }, r => { r.actionId = 'select-members' },
    r => { r.surfaceDigest = 'f'.repeat(64) }, r => { delete r.taskRef }, r => { r.taskRef = { ...taskRef, taskId: 'bad' } },
    r => { r.ok = false }, r => { r.ok = 'true' },
    r => { r.phase = 'pending' }, r => { r.outcome = 'arbitrary' }, r => { r.reason = 'native_call_failed' },
    r => { r.selectionRef = selectionRef }, r => { r.origin.workspaceRef = 'other' }, r => { r.extra = 'not allowed' },
    r => { r.extra = 'x'.repeat(17000) },
  ]
  for (const change of mutations) {
    const f = await fixture(t, { read: body => { const r = response(body); change(r); return r } })
    await f.core.claim(request(f.share), signal)
    const before = f.store.writes
    await assert.rejects(f.core.createMembers(nextOrigin('members'), f.share.id, signal))
    assert.equal(f.store.writes, before); assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [])
  }
})

test('late phone ACK is not blocked by recovery and concurrent tools durably converge without replay', async t => {
  const entered = deferred(), release = deferred()
  const f = await fixture(t, { read: async body => { entered.resolve(); await release.promise; return response(body) } })
  await f.core.claim(request(f.share), signal)
  const one = f.core.createMembers(nextOrigin('members-one'), f.share.id, signal)
  const two = f.core.createMembers(nextOrigin('members-two'), f.share.id, signal)
  await entered.promise
  const receipt = await f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal)
  release.resolve()
  const results = await Promise.all([one, two])
  assert.equal(f.calls.length, 1, 'concurrent consumers share one exact result read')
  assert(results.every(surface => surface.targetTaskRef.taskId === taskRef.taskId))
  assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [receipt])
  assert.equal(f.store.writes, 5, 'one source + claim + receipt + two tools; no duplicate receipt writes')
})

test('late cancellation conflicts, origin changes, abort and disposal cannot convert recovery into permission', async t => {
  for (const scenario of ['cancelled', 'generation', 'abort', 'dispose']) {
    const entered = deferred(), release = deferred(), controller = new AbortController()
    const f = await fixture(t, { read: async body => { entered.resolve(); await release.promise; return response(body) } })
    await f.core.claim(request(f.share), signal)
    const pending = f.core.createMembers(nextOrigin('members'), f.share.id, controller.signal)
    await entered.promise
    if (scenario === 'cancelled') await f.core.ack({ ...request(f.share), outcome: 'cancelled' }, signal)
    if (scenario === 'generation') f.changeGeneration()
    if (scenario === 'abort') controller.abort()
    if (scenario === 'dispose') await f.core.close()
    release.resolve(); await assert.rejects(pending)
    const ledger = await f.store.load()
    assert.equal(ledger.records.length, 1)
    assert.equal(ledger.records[0].attempts[0].receipt?.outcome, scenario === 'cancelled' ? 'cancelled' : undefined)
  }
})

test('transient recovery errors leave the claim intact and may recover on later explicit tool use', async t => {
  let attempts = 0
  const f = await fixture(t, { read: body => { if (++attempts === 1) throw new Error('network unavailable'); return response(body) } })
  await f.core.claim(request(f.share), signal)
  await assert.rejects(f.core.createMembers(nextOrigin('members'), f.share.id, signal), /network unavailable/)
  assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [])
  assert.deepEqual((await f.core.createMembers(nextOrigin('retry-members'), f.share.id, signal)).targetTaskRef, taskRef)
})

test('owner status and a tool share one read; cancelling one reader does not cancel another', async t => {
  const entered = deferred(), release = deferred(), controller = new AbortController()
  const f = await fixture(t, { read: async body => { entered.resolve(); await release.promise; return response(body) } })
  await f.core.claim(request(f.share), signal)
  const status = f.core.reconcileStatus(origin.scope, f.share.id, origin.generation, controller.signal)
  const tool = f.core.createMembers(nextOrigin('members'), f.share.id, signal)
  await entered.promise; controller.abort(); await assert.rejects(status)
  release.resolve()
  assert.deepEqual((await tool).targetTaskRef, taskRef); assert.equal(f.calls.length, 1)
  assert.equal((await f.core.reconcileStatus(origin.scope, f.share.id, origin.generation, signal)).receipts[0].outcome, 'success')
  assert.equal(f.calls.length, 1, 'already durable success needs no network')
})

test('unsupported old server is not a completion or a new dependency for existing receipt path', async t => {
  const f = await fixture(t, { read: () => { throw Object.assign(new Error('not found'), { status: 404 }) } })
  await f.core.claim(request(f.share), signal)
  assert.deepEqual((await f.core.reconcileStatus(origin.scope, f.share.id, origin.generation, signal)).receipts, [])
  await f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal)
  assert.deepEqual((await f.core.createMembers(nextOrigin('members'), f.share.id, signal)).targetTaskRef, taskRef)
  assert.equal(f.calls.length, 1)
})

test('selection recovery cannot adopt another task or a missing selection reference', async t => {
  for (const invalid of ['missing', 'other-task', 'unknown-member-key']) {
    const f = await fixture(t, { read: body => {
      const r = response(body)
      if (body.surface.actions[0].id === 'select-members') {
        if (invalid === 'missing') delete r.selectionRef
        if (invalid === 'other-task') r.selectionRef = { ...selectionRef, taskId: 'other_task_123456789012345' }
        if (invalid === 'unknown-member-key') r.selectionRef = { ...selectionRef, nativeId: 'never-trusted' }
      }
      return r
    } })
    await f.core.claim(request(f.share), signal)
    const members = await f.core.createMembers(nextOrigin('members'), f.share.id, signal)
    await f.core.claim(request(members), signal)
    await assert.rejects(f.core.createReminder(nextOrigin('reminder'), members.id, '请查看', signal), { code: 'human-recovery-invalid' })
    assert.deepEqual(f.core.status(origin.scope, members.id).receipts, [])
  }
})

test('failed durable recovery write never returns a tool or advertises unsaved receipt', async t => {
  const f = await fixture(t)
  await f.core.claim(request(f.share), signal)
  const before = await f.store.load()
  f.store.save = async () => { throw new Error('durable write failed') }
  await assert.rejects(f.core.createMembers(nextOrigin('members'), f.share.id, signal), /durable write failed/)
  assert.deepEqual(await f.store.load(), before)
  assert.deepEqual(f.core.contextSnapshot(origin.scope, origin.generation), [])
  await assert.rejects(f.core.createMembers(nextOrigin('later'), f.share.id, signal), { code: 'human-tools-disabled' })
})

test('a durable phone ACK wins a concurrent transport-only cloud read failure after serial recheck', async t => {
  for (const code of ['workflow-network-unavailable', 'workflow-timeout']) {
    const entered = deferred(), release = deferred(), saved = deferred(), releaseSave = deferred()
    const f = await fixture(t, { read: async () => {
      entered.resolve(); await release.promise
      throw Object.assign(new Error('read unavailable'), { code })
    } })
    await f.core.claim(request(f.share), signal)
    const originalSave = f.store.save
    f.store.save = async value => {
      if (value.records.some(record => record.surface.id === f.share.id && record.attempts.some(attempt => attempt.receipt))) {
        saved.resolve(); await releaseSave.promise
      }
      return originalSave(value)
    }
    const pending = f.core.createMembers(nextOrigin('members'), f.share.id, signal)
    await entered.promise
    const ack = f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal)
    await saved.promise
    let settled = false
    const observed = pending.finally(() => { settled = true })
    release.resolve(); await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false, 'must wait for durable ACK write, not use in-progress data')
    releaseSave.resolve(); const receipt = await ack
    assert.deepEqual((await observed).targetTaskRef, taskRef)
    assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [receipt])
    assert.equal(f.calls.length, 1); assert.equal(f.store.writes, 4)
  }
})

test('durable success does not soften cancellation, revocation, origin conflicts, malformed recovery or HTTP denials', async t => {
  for (const scenario of ['cancel', 'revoked', 'generation', 'action_source_mismatch', 'human-recovery-invalid', 'http-denial', 'unclassified']) {
    const entered = deferred(), release = deferred(), controller = new AbortController()
    const f = await fixture(t, { read: async body => {
      entered.resolve(); await release.promise
      if (scenario === 'human-recovery-invalid') return { ...response(body), surfaceDigest: 'f'.repeat(64) }
      const code = scenario === 'action_source_mismatch' ? scenario : scenario === 'unclassified' ? 'other-failure' : 'workflow-network-unavailable'
      throw Object.assign(new Error('read failed'), { code, ...(scenario === 'http-denial' ? { status: 503 } : {}) })
    } })
    await f.core.claim(request(f.share), signal)
    const pending = f.core.createMembers(nextOrigin('members'), f.share.id, controller.signal)
    const rejected = assert.rejects(pending)
    await entered.promise
    const receipt = await f.core.ack({ ...request(f.share), outcome: 'success', taskRef }, signal)
    if (scenario === 'cancel') controller.abort()
    if (scenario === 'revoked') f.revoke()
    if (scenario === 'generation') f.changeGeneration()
    release.resolve(); await rejected
    assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [receipt])
    assert.equal((await f.store.load()).records.length, 1, 'no member action may be released')
  }
})

test('a local failed, cancelled, unknown or reference-less receipt never becomes success after a failed cloud read', async t => {
  for (const outcome of ['failed', 'cancelled', 'unknown', 'success']) {
    const entered = deferred(), release = deferred()
    const f = await fixture(t, { read: async () => {
      entered.resolve(); await release.promise
      throw Object.assign(new Error('read unavailable'), { code: 'workflow-network-unavailable' })
    } })
    await f.core.claim(request(f.share), signal)
    const pending = f.core.createMembers(nextOrigin('members'), f.share.id, signal)
    const rejected = assert.rejects(pending, { code: 'workflow-network-unavailable' })
    await entered.promise
    const receipt = await f.core.ack({ ...request(f.share), outcome }, signal)
    release.resolve(); await rejected
    assert.deepEqual(f.core.status(origin.scope, f.share.id).receipts, [receipt])
    assert.equal((await f.store.load()).records.length, 1)
  }
})
