import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'

// Product lifecycle/tool tests with controlled transport; not a model-intent or
// real WeChat acceptance test. Cloud/host identity integration is tested separately.
const scope = { nodeId: 'node_private_test', sessionId: 'session_a', sessionGeneration: '100' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'owner', accountInstance: 'instance', generation: 'generation' }
const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
const signal = new AbortController().signal
function memory(initial) { let value = structuredClone(initial); return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next) }, get value() { return structuredClone(value) } } }
function input(suffix = '1') { return { inputProof: 'secret-proof-' + suffix, inputId: 'user-input-' + suffix, contentDigest: 'b'.repeat(64), nativeMessageId: 'native-message-' + suffix,
  idempotencyKey: 'private-operation-' + suffix, assertCurrent() {} } }
const review = () => ({ submissionId: 's'.repeat(24), submissionVersion: 1, feedback: '请补充依据。', correction: null })
const round = () => ({ title: '补充依据', instructions: '请提交补充说明', form: { schema: 'human.form.v1', fields: [{ key: 'reply', label: '说明', kind: 'short-text', required: true, maxLength: 80 }], attachment: null }, closesAt: null, recipientRefs: ['p'.repeat(24)] })
function draft(kind = 'review', content = review()) {
  return { taskRef, draftRef: { schema: 'human.lifecycle.draft.ref.v1', draftId: 'x'.repeat(24), version: 1, kind,
    digest: sha256(canonicalSubmission({ taskRef, kind, expectedRevision: 1, content })) }, expectedRevision: 1, content,
  state: 'draft', approvalStatus: 'ready', currentRevision: 1, expiresAt: 10000 }
}
function exec() { return { agent: { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }, signal, callId: 'call', rootCallId: 'root' } }
async function fixture(t, options = {}) {
  const store = options.store ?? memory(), keyStore = memory(), keys = await ReceiverKeyring.open(keyStore, scope.nodeId), requests = []
  let current = options.draft ?? draft(), origin = scope, mutate = options.mutate
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(route, a) {
    requests.push(structuredClone({ route, input: a }))
    if (route === 'receiver-key') return { binding, bindingKey, key: a.key }
    assert.equal(route, 'lifecycle')
    if (a.operation === 'get') return { taskRef, origin: { scope: origin.sessionId, sessionGeneration: origin.sessionGeneration }, revision: 1,
      rounds: [], submissions: [], participants: [], drafts: [structuredClone(current)], nextOffset: null, binding, bindingKey, asOf: 100 }
    if (a.operation.endsWith('-draft')) { current = draft(a.operation.slice(0, -6), a.content); return { draft: structuredClone(current) } }
    assert.equal(a.operation, 'private-publish')
    if (mutate) return mutate(a, current)
    current = { ...current, state: 'published', approvalStatus: 'published' }
    return { schema: 'human.private.publication.v1', taskRef, draftRef: current.draftRef, state: 'published', inputId: a.inputId,
      nativeMessageId: a.nativeMessageId, operationId: a.idempotencyKey,
      result: current.draftRef.kind === 'review' ? { resultId: 'r'.repeat(24), correctionRoundId: current.content.correction === null ? null : 'c'.repeat(24) } : { roundId: 'r'.repeat(24) },
      inputProof: a.inputProof, ownerSubject: 'MUST-NOT-LEAK' }
  } }
  const lifecycle = await WorkflowLifecycle.open({ transport, keys, store, now: () => 100, workspaceAccess: options.workspaceAccess })
  t.after(async () => { await lifecycle.close(); await keys.close() })
  return { lifecycle, store, requests, transport, keys, get draft() { return current }, set draft(value) { current = value }, set origin(value) { origin = value },
    set mutate(value) { mutate = value }, get writes() { return requests.filter(r => r.input.operation === 'private-publish') } }
}

test('private review and targeted round publish exact effects without leaking runtime authority or sending messages', async t => {
  for (const d of [draft(), draft('review', { ...review(), correction: (({ recipientRefs, ...value }) => value)(round()) }), draft('round', round())]) {
    const f = await fixture(t, { draft: d }), result = await f.lifecycle.publishPrivate(scope, taskRef, d.draftRef, input(), signal)
    assert.equal(result.state, 'published'); assert.equal(result.effects.groupCardState, 'not-sent-by-this-action')
    assert.equal(result.effects.notificationState, 'not-requested-by-this-action')
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].input.inputProof, input().inputProof)
    assert(!Object.hasOwn(f.writes[0].input, 'workspaceRef'))
    assert(!JSON.stringify(result).includes('secret-proof')); assert(!JSON.stringify(result).includes('MUST-NOT-LEAK'))
    assert(!JSON.stringify(f.store.value).includes('secret-proof')); assert(!JSON.stringify(f.store.value).includes('native-message'))
    assert.equal(f.store.value.publications[0].state, 'published')
    const again = await f.lifecycle.publishPrivate(scope, taskRef, d.draftRef, input('2'), signal)
    assert.equal(again.alreadyPublished, true); assert.equal(f.writes.length, 1)
  }
})

test('v2 forwards only native-derived run binding without persisting or exposing it; v1 remains unchanged', async t => {
  for (const runId of [undefined, 'a'.repeat(32)]) {
    const f = await fixture(t), authority = { ...input(), ...(runId ? { runId } : {}) }
    const result = await f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, authority, signal)
    assert.equal(f.writes[0].input.runId, runId)
    assert.equal(Object.hasOwn(f.writes[0].input, 'runId'), runId !== undefined)
    assert(!JSON.stringify(result).includes('runId'))
    assert(!JSON.stringify(f.store.value).includes('runId'))
  }
  for (const runId of ['', 'wrong', 'a'.repeat(31), 'a'.repeat(33), { value: 'a'.repeat(32) }]) {
    const f = await fixture(t)
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, { ...input(), runId }, signal), { code: 'private-input-required' })
    assert.equal(f.requests.length, 0)
  }
})

test('missing proof and foreign session fail before any private write; shared workspace never grants write scope', async t => {
  let sharedReads = 0
  const f = await fixture(t, { workspaceAccess: async () => { sharedReads++; return { sourceScope: { ...scope, sessionId: 'foreign' }, workspaceRef: {} } } })
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, undefined, signal), { code: 'private-input-required' })
  f.origin = { ...scope, sessionId: 'foreign' }
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal), { code: 'lifecycle-response-invalid' })
  assert.equal(sharedReads, 0); assert.equal(f.writes.length, 0)
})

test('public rounds, empty targets, reminders, stale drafts and changed digests cannot use private execution', async t => {
  for (const d of [draft('round', { ...round(), recipientRefs: null }), draft('round', { ...round(), recipientRefs: [] }),
    draft('reminder', { roundId: 'r'.repeat(24), title: '提醒', participantRefs: ['p'.repeat(24)], condition: 'pending-submission' }),
    { ...draft(), expiresAt: 99 }, { ...draft(), expectedRevision: 1, currentRevision: 2, approvalStatus: 'stale' }]) {
    const f = await fixture(t, { draft: d })
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, d.draftRef, input(), signal))
    assert.equal(f.writes.length, 0)
  }
  const f = await fixture(t)
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, { ...f.draft.draftRef, digest: '0'.repeat(64) }, input(), signal), { code: 'private-publication-invalid' })
  assert.equal(f.writes.length, 0)
})

test('input invalidated by interruption during fresh read prevents mutation', async t => {
  const f = await fixture(t); let checks = 0
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, { ...input(), assertCurrent() { if (++checks > 1) throw Object.assign(new Error('changed'), { code: 'current-input-changed' }) } }, signal), { code: 'current-input-changed' })
  assert.equal(f.writes.length, 0)
})

test('unknown response is durably query-only across retries and process reconstruction', async t => {
  const f = await fixture(t, { mutate: async () => { throw new Error('network lost') } }), ref = f.draft.draftRef
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, ref, input(), signal), /network lost/)
  assert.equal(f.store.value.publications[0].state, 'attempted')
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, ref, input('2'), signal), { code: 'private-publication-unknown' })
  const reopened = await fixture(t, { store: memory(f.store.value) })
  await assert.rejects(reopened.lifecycle.publishPrivate(scope, taskRef, ref, input('3'), signal), { code: 'private-publication-unknown' })
  assert.equal(f.writes.length, 1); assert.equal(reopened.writes.length, 0)
  reopened.draft = { ...reopened.draft, state: 'published', approvalStatus: 'published' }
  assert.equal((await reopened.lifecycle.publishPrivate(scope, taskRef, ref, input('4'), signal)).alreadyPublished, true)
  assert.equal(reopened.writes.length, 0); assert.equal(reopened.store.value.publications[0].state, 'published')
})

test('malformed success and mismatched operation remain unknown and cannot be repeated', async t => {
  for (const change of [r => { r.operationId = 'different-operation' }, r => { r.nativeMessageId = 'different-message' },
    r => { r.taskRef = { ...taskRef, taskId: 'w'.repeat(24) } }, r => { r.result = { resultId: 'r'.repeat(24), correctionRoundId: 'unexpected' } }]) {
    const f = await fixture(t, { mutate: async a => { const r = { schema: 'human.private.publication.v1', taskRef, draftRef: draft().draftRef, state: 'published', inputId: a.inputId, nativeMessageId: a.nativeMessageId, operationId: a.idempotencyKey, result: { resultId: 'r'.repeat(24), correctionRoundId: null } }; change(r); return r } })
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal), { code: 'private-publication-unknown' })
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input('2'), signal), { code: 'private-publication-unknown' })
    assert.equal(f.writes.length, 1)
  }
})

test('concurrent identical draft requests write at most once', async t => {
  const f = await fixture(t), ref = f.draft.draftRef
  const values = await Promise.allSettled([f.lifecycle.publishPrivate(scope, taskRef, ref, input(), signal), f.lifecycle.publishPrivate(scope, taskRef, ref, input('2'), signal)])
  assert.equal(values.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.writes.length, 1)
})

test('structured definitive refusal allows only a new real input after an exact fresh query, never automatic retry', async t => {
  for (const [code, status] of [['private_updates_disabled', 403], ['private_input_expired', 410], ['lifecycle_conflict', 409], ['private_update_capacity', 429],
    ['invalid_private_run', 409], ['private_run_conflict', 409], ['private_run_expired', 410]]) {
    const f = await fixture(t, { mutate: async () => { throw Object.assign(new Error(code), { code, status }) } }), ref = f.draft.draftRef
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, ref, input(), signal), { code })
    assert.equal(f.store.value.publications[0].state, 'rejected')
    f.mutate = undefined
    for (const next of [input(), { ...input('2'), inputId: input().inputId }, { ...input('2'), nativeMessageId: input().nativeMessageId }, { ...input('2'), idempotencyKey: input().idempotencyKey }])
      await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, ref, next, signal), { code: 'private-new-input-required' })
    assert.equal(f.writes.length, 1)
    assert.equal((await f.lifecycle.publishPrivate(scope, taskRef, ref, input('2'), signal)).state, 'published')
    assert.equal(f.writes.length, 2)
  }
})

test('5xx, bare codes and unexpected failure statuses cannot clear an unknown attempt', async t => {
  for (const error of [Object.assign(new Error('x'), { code: 'private_updates_disabled', status: 500 }), Object.assign(new Error('x'), { code: 'private_updates_disabled' }), Object.assign(new Error('x'), { code: 'unknown_failure', status: 400 })]) {
    const f = await fixture(t, { mutate: async () => { throw error } })
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal))
    await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input('2'), signal), { code: 'private-publication-unknown' })
    assert.equal(f.store.value.publications[0].state, 'attempted'); assert.equal(f.writes.length, 1)
  }
})

test('publication tool closes model arguments and never accepts a model approval/proof or absent host input', async t => {
  const f = await fixture(t), e = exec()
  let callbacks = 0
  const tools = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.lifecycle, core: {}, assertAgent() {}, ownerInput: async () => { callbacks++; return input() } })
  const tool = tools.find(t => t.name === 'human_task_publish_private')
  assertSupportedJsonSchema(tool.parameters)
  for (const key of ['approved', 'inputProof', 'inputId', 'nativeMessageId', 'runId', 'scope', 'workspaceRef'])
    await assert.rejects(tool.execute({ taskRef, draftRef: f.draft.draftRef, [key]: true }, e), { code: 'lifecycle-arguments-invalid' })
  assert.equal(callbacks, 0)
  const absent = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.lifecycle, core: {}, assertAgent() {} }).find(t => t.name === tool.name)
  await assert.rejects(absent.execute({ taskRef, draftRef: f.draft.draftRef }, e), { code: 'private-input-unavailable' })
  assert.equal(f.writes.length, 0)
  assert.equal((await tool.execute({ taskRef, draftRef: f.draft.draftRef }, e)).state, 'published')
  assert.equal(callbacks, 1)
})

test('scope changing while host derives input never reaches private publication', async t => {
  const f = await fixture(t), e = exec()
  const tool = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.lifecycle, core: {}, assertAgent() {}, ownerInput: async () => { e.agent.session.header.createdAt++; return input() } }).find(t => t.name === 'human_task_publish_private')
  await assert.rejects(tool.execute({ taskRef, draftRef: f.draft.draftRef }, e), { code: 'workflow-scope-invalid' })
  assert.equal(f.requests.length, 0)
})

test('silent private preparation returns exact reference, with no mandatory surface or publication', async t => {
  for (const [kind, content] of [['review', review()], ['round', round()]]) {
    const f = await fixture(t); let surfaces = 0
    const tool = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.lifecycle, core: { createWorkflow() { surfaces++; throw new Error('must not create card') } }, assertAgent() {} }).find(t => t.name === 'human_task_prepare_' + kind)
    const value = await tool.execute({ taskRef, expectedRevision: 1, content, preview: 'none' }, exec())
    assert.equal(value.schema, 'human.workflow.prepared.v1'); assert.deepEqual(value.draftRef, f.draft.draftRef)
    assert.deepEqual(tool.output.presentationMeta({}, value), {}); assert.match(tool.output.render({}, value)[0].text, /human_task_publish_private/)
    assert.equal(surfaces, 0); assert.equal(f.writes.length, 0)
  }
})

test('silent prepare cannot hide a public round or a native reminder', async t => {
  const f = await fixture(t), tools = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.lifecycle, core: {}, assertAgent() {} })
  await assert.rejects(tools.find(t => t.name === 'human_task_prepare_round').execute({ taskRef, expectedRevision: 1, content: { ...round(), recipientRefs: null }, preview: 'none' }, exec()), { code: 'private-publication-invalid' })
  await assert.rejects(tools.find(t => t.name === 'human_task_prepare_reminder').execute({ taskRef, expectedRevision: 1, content: {}, preview: 'none' }, exec()), { code: 'lifecycle-arguments-invalid' })
  assert.equal(f.requests.length, 0)
})

test('readiness is an isolated read-only safe projection, not proof of intent or current cloud permission', async t => {
  const f = await fixture(t); let reads = 0
  const options = { nodeId: scope.nodeId, lifecycle: f.lifecycle, core: {}, assertAgent() {}, ownerInputStatus: async () => {
    reads++; return { schema: 'human.private.update.status.v1', state: 'ready', expiresAt: 10000, inputProof: 'do-not-leak', ownerSubject: 'secret-owner' }
  } }
  const tool = lifecycleTools(options).find(t => t.name === 'human_private_update_status')
  assertSupportedJsonSchema(tool.parameters)
  const result = await tool.execute({}, exec())
  assert.deepEqual(result, { schema: 'human.private.update.status.v1', state: 'ready', expiresAt: 10000, cloudPermission: 'revalidated-at-publication' })
  assert.equal(f.requests.length, 0); assert.equal(f.store.value, undefined); assert.equal(reads, 1)
  await assert.rejects(tool.execute({ approved: true }, exec()), { code: 'lifecycle-arguments-invalid' })
  const unsupported = lifecycleTools({ ...options, ownerInputStatus: undefined }).find(t => t.name === tool.name)
  assert.equal((await unsupported.execute({}, exec())).state, 'unavailable')
  const missing = lifecycleTools({ ...options, ownerInputStatus: async () => ({ schema: 'human.private.update.status.v1', state: 'no-current-input' }) }).find(t => t.name === tool.name)
  assert.equal((await missing.execute({}, exec())).state, 'no-current-input')
  const e = exec(), stale = lifecycleTools({ ...options, ownerInputStatus: async () => { e.agent.session.header.createdAt++; return result } }).find(t => t.name === tool.name)
  await assert.rejects(stale.execute({}, e), { code: 'workflow-scope-invalid' })
})

test('bounded journal never evicts unknown attempts, while verified published entries can make room', async t => {
  const seed = await fixture(t); await seed.lifecycle.publishPrivate(scope, taskRef, seed.draft.draftRef, input(), signal)
  const full = seed.store.value, base = full.publications[0]
  full.publications = Array.from({ length: 256 }, (_, index) => ({ ...base, draftRef: { ...base.draftRef, draftId: String(index).padStart(24, 'a') }, state: 'attempted' }))
  const f = await fixture(t, { store: memory(full) })
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal), { code: 'private-publication-capacity' })
  assert.equal(f.writes.length, 0); assert.deepEqual(f.store.value.publications, full.publications)
  full.publications[0].state = 'published'
  const room = await fixture(t, { store: memory(full) })
  await room.lifecycle.publishPrivate(scope, taskRef, room.draft.draftRef, input(), signal)
  assert.equal(room.store.value.publications.length, 256); assert.equal(room.writes.length, 1)
  assert(!room.store.value.publications.some(p => p.draftRef.draftId === full.publications[0].draftRef.draftId))
})

test('published state after a prior refusal is recovered instead of replaying the corrected request', async t => {
  const f = await fixture(t, { mutate: async () => { throw Object.assign(new Error('disabled'), { code: 'private_updates_disabled', status: 403 }) } })
  await assert.rejects(f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal), { code: 'private_updates_disabled' })
  f.draft = { ...f.draft, state: 'published', approvalStatus: 'published' }
  const result = await f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input('2'), signal)
  assert.equal(result.alreadyPublished, true); assert.equal(f.writes.length, 1)
  assert.equal(f.store.value.publications[0].state, 'published'); assert(!Object.hasOwn(f.store.value.publications[0], 'rejection'))
})

test('legacy ledger loads, but duplicate, corrupt and foreign publication rows fail closed', async t => {
  const f = await fixture(t); await f.lifecycle.publishPrivate(scope, taskRef, f.draft.draftRef, input(), signal)
  for (const change of [v => v.publications.push(structuredClone(v.publications[0])), v => { v.publications[0].inputProof = 'forbidden' },
    v => { v.publications[0].scope.nodeId = 'foreign' }, v => { v.publications[0].state = 'rejected' }]) {
    const bad = f.store.value; change(bad)
    await assert.rejects(WorkflowLifecycle.open({ store: memory(bad), keys: f.keys, transport: f.transport }), { code: 'lifecycle-store-invalid' })
  }
  const legacy = await WorkflowLifecycle.open({ store: memory({ schema: 'human.lifecycle.local.v1', nodeId: scope.nodeId, analyses: [] }), keys: f.keys, transport: f.transport })
  await legacy.close()
})
