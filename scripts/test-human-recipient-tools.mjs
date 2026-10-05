import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { humanRecipientRef, humanReminderPreview, humanSurface } from '../lib/human-tools/protocol.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { WorkflowLifecycle, lifecycleReminderContent, lifecycleReminderPreview, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_recipients_123456', sessionId: 'recipients_session', sessionGeneration: '100' }
const origin = { scope: scope.sessionId, generation: scope.sessionGeneration, callId: 'generic-call', rootCallId: 'generic-root' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'owner', accountInstance: 'instance', generation: 'generation' }
const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
const ref = (source = 'observed', id = 'p') => ({ schema: 'human.recipient.ref.v1', taskId: taskRef.taskId,
  deliveryId: taskRef.deliveryId, source, ref: id.repeat(24), revision: source === 'selection' ? 3 : 0 })
const content = () => ({ roundId: null, title: '请查看安排', condition: 'none', recipientSource: 'exact-references',
  recipientRefs: [ref('selection', 'a'), ref('observed', 'b')], type: 'participate' })
function store(initial) { let value = structuredClone(initial), writes = 0; return {
  load: async () => structuredClone(value), save: async next => { value = structuredClone(next); writes++ },
  get value() { return structuredClone(value) }, get writes() { return writes },
} }
function draft(value = content(), changes = {}) {
  const item = { taskRef, expectedRevision: 1, content: structuredClone(value), expiresAt: Date.now() + 60000,
    state: 'draft', context: { taskTitle: '英语活动', reminderTargetCount: 17 }, ...changes }
  return { ...item, draftRef: { schema: 'human.lifecycle.draft.ref.v1', draftId: 'f'.repeat(24), version: 1, kind: 'reminder',
    digest: sha256(canonicalSubmission({ taskRef: item.taskRef, kind: 'reminder', expectedRevision: item.expectedRevision, content: item.content })) } }
}
async function fixture(t, { change, noContext = false, deny = false, facts } = {}) {
  const requests = [], keys = await ReceiverKeyring.open(store(), scope.nodeId)
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(endpoint, input) {
    requests.push(structuredClone({ endpoint, input }))
    if (endpoint === 'receiver-key') return { binding, bindingKey, key: input.key }
    if (endpoint === 'lifecycle' && input.operation === 'recipients' && facts) {
      const value = factsReply(input, facts.count); facts.change?.(value); return value
    }
    if (endpoint === 'lifecycle' && input.operation === 'get') return { taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration },
      binding, bindingKey, revision: 1, asOf: 100, rounds: [], participants: [], submissions: [], drafts: [], nextOffset: null }
    if (endpoint === 'lifecycle' && input.operation === 'reminder-draft') {
      if (deny) throw Object.assign(new Error('Stale recipient selection'), { code: 'recipient_reference_stale' })
      const value = draft(input.content); if (noContext) delete value.context; change?.(value)
      return { draft: value }
    }
    assert.fail(`unexpected operation ${endpoint}/${input.operation}`)
  } }
  const runtime = await WorkflowLifecycle.open({ transport, keys, store: store() })
  t.after(async () => { await runtime.close(); await keys.close() })
  return { runtime, requests, prepare: value => runtime.prepare(scope, taskRef, 'reminder', 1, value, 'generic-reminder-request', signal) }
}

test('recipient references preserve exact task/source/revision without raw routing identities or coercion', () => {
  for (const source of ['observed', 'selection', 'audience']) {
    const input = ref(source), result = humanRecipientRef(input)
    assert.deepEqual(result, input); result.ref = 'z'.repeat(24); assert.notDeepEqual(result, input)
  }
  for (const bad of [null, {}, { ...ref(), schema: 'human.recipient.ref.v2' }, { ...ref(), taskId: 'guessed' },
    { ...ref(), ref: 'name' }, { ...ref(), ref: 'p'.repeat(24) + '\n' }, { ...ref(), source: 'all-group' },
    { ...ref(), revision: 1 }, { ...ref('audience'), revision: 2 }, { ...ref('selection'), revision: 0 },
    { ...ref('selection'), revision: 1.5 }, { ...ref('selection'), revision: '3' }, { ...ref('selection'), revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...ref(), roomid: 'raw' }, { ...ref(), group_openid: 'raw' }, { ...ref(), name: '甲' }, { ...ref(), approved: true }])
    assert.equal(humanRecipientRef(bad), undefined, JSON.stringify(bad))
})

test('generic exact targets are independent from completion filters and allow explicit bounded subsets', () => {
  for (const roundId of [null, 'r'.repeat(24)]) for (const type of ['complete', 'participate']) {
    const value = { ...content(), roundId, type, recipientRefs: [ref('selection')] }
    assert.deepEqual(lifecycleReminderContent(value), value)
  }
  for (const value of [
    { ...content(), condition: 'pending-submission' }, { ...content(), condition: 'result-published' },
    { ...content(), recipientRefs: [] }, { ...content(), recipientRefs: [ref(), ref()] },
    { ...content(), recipientRefs: Array.from({ length: 21 }, (_, n) => ref('selection', String.fromCharCode(65 + n))) },
    { ...content(), type: 'at-all' }, { ...content(), roundId: '' }, { ...content(), roundId: undefined },
    { ...content(), participantRefs: ['p'.repeat(24)] }, { ...content(), selectionRef: {} }, { ...content(), approved: true },
    { ...content(), recipientRefs: [{ ...ref(), revision: 9 }] },
  ]) assert.equal(lifecycleReminderContent(value), undefined)
})

test('preparation retains exact mixed-source intent, never manufactures participation or sends', async t => {
  const f = await fixture(t), value = content(), result = await f.prepare(value)
  assert.deepEqual(result.content, value)
  assert.equal(result.draftRef.digest, draft(value).draftRef.digest)
  assert.equal(f.requests.filter(item => item.input.operation === 'reminder-draft').length, 1)
  assert(!f.requests.some(item => /publish|claim|notify|select|share/.test(item.endpoint + item.input.operation)))
  assert.deepEqual(value, content())
  const preview = lifecycleReminderPreview(result)
  assert.deepEqual(preview, { schema: 'human.reminder.preview.v1', title: value.title, taskTitle: '英语活动',
    condition: 'none', type: 'participate', recipientSource: 'exact-references', recipientCount: 2 })
  assert.equal(preview.participantRefs, undefined); assert.equal(preview.recipientRefs, undefined)
  assert.deepEqual(humanReminderPreview(preview), preview)
})

test('malformed or cross-task targets fail without drafting; server denial never widens or retries targets', async t => {
  const f = await fixture(t)
  for (const value of [{ ...content(), recipientRefs: [] }, { ...content(), recipientRefs: [{ ...ref(), taskId: 'x'.repeat(24) }] },
    { ...content(), recipientRefs: [{ ...ref(), deliveryId: 'y'.repeat(24) }] }])
    await assert.rejects(f.prepare(value), { code: 'lifecycle-reminder-invalid' })
  assert(!f.requests.some(item => item.input.operation === 'reminder-draft'))
  const denied = await fixture(t, { deny: true })
  await assert.rejects(denied.prepare(content()), { code: 'recipient_reference_stale' })
  assert.equal(denied.requests.filter(item => item.input.operation === 'reminder-draft').length, 1)
})

test('returned draft and inline context cannot silently replace checked intent or its task', async t => {
  for (const change of [
    item => { item.content.recipientRefs = [ref('audience', 'z')] },
    item => { item.content.recipientRefs = [ref('audience', 'z')]; item.draftRef = draft(item.content).draftRef },
    item => { item.taskRef = { ...taskRef, taskId: 'x'.repeat(24) }; item.draftRef = draft(item.content, { taskRef: item.taskRef }).draftRef },
    item => { item.context.taskTitle = '' }, item => { item.context.roomid = 'raw' },
    item => { item.context.reminderTargetCount = 21 }, item => { item.draftRef.digest = '0'.repeat(64) },
  ]) {
    const f = await fixture(t, { change }); await assert.rejects(f.prepare(content()), { code: 'lifecycle-response-invalid' })
  }
  const old = await fixture(t, { noContext: true }); assert.equal(lifecycleReminderPreview(await old.prepare(content())), undefined)
  assert.equal(lifecycleReminderPreview({ ...draft(), draftRef: { ...draft().draftRef, kind: 'round' } }), undefined)
  const preview = lifecycleReminderPreview(draft())
  for (const value of [{ ...preview, condition: 'pending-submission' }, { ...preview, type: 'invalid' }, { ...preview, recipientCount: null },
    { ...preview, recipientCount: 0 }, { ...preview, recipientCount: 21 }, { ...preview, roomid: 'raw' }, { ...preview, title: '非法@标题' }])
    assert.equal(humanReminderPreview(value), undefined)
})

test('workflow surface persists exact draft, root replay cannot replace it, claim is not publication or send', async t => {
  const disk = store({ schemaVersion: 1, records: [] }), core = await HumanToolsCore.open(disk, () => randomBytes(16).toString('hex'))
  t.after(() => core.close())
  const value = draft(), preview = lifecycleReminderPreview(value)
  const surface = await core.createWorkflow(origin, taskRef, value.draftRef, signal, preview)
  assert(humanSurface(surface)); assert.deepEqual(surface.workflowRef, value.draftRef)
  assert.equal(disk.value.records[0].attempts.length, 0)
  const replay = await core.createWorkflow({ ...origin, callId: 'same-root-other-subcall' }, taskRef, value.draftRef, signal,
    { ...preview, title: '不同展示', recipientCount: 1 })
  assert.deepEqual(replay, surface); assert.equal(disk.writes, 1)
  for (const [target, draftRef] of [[{ ...taskRef, taskId: 'x'.repeat(24) }, value.draftRef],
    [taskRef, { ...value.draftRef, digest: '0'.repeat(64) }], [taskRef, { ...value.draftRef, draftId: 'y'.repeat(24) }]])
    await assert.rejects(core.createWorkflow(origin, target, draftRef, signal, preview), { code: 'human-target-conflict' })
  await assert.rejects(core.createWorkflow({ ...origin, generation: '200' }, taskRef, value.draftRef, signal, preview), { code: 'human-origin-conflict' })
  const request = { scope: origin.scope, surfaceId: surface.id, revision: 1, actionId: 'workflow-approve', attemptId: 'attempt_generic_123456' }
  const claim = await core.claim(request, signal)
  assert.deepEqual(claim.surface.workflowRef, value.draftRef)
  assert.equal(disk.value.records[0].attempts[0].receipt, undefined)
  assert.deepEqual(core.contextSnapshot(origin.scope, origin.generation), [])
  assert.equal(claim.grant, undefined); assert.equal(claim.published, undefined)
  await core.close()
  const reopened = await HumanToolsCore.open(disk, () => randomBytes(16).toString('hex')); t.after(() => reopened.close())
  assert.deepEqual(reopened.forResult(origin.scope, origin.rootCallId, origin.generation), surface)
  assert.deepEqual(await reopened.claim(request, signal), claim)
  await assert.rejects(reopened.claim({ ...request, actionId: 'share' }, signal), { code: 'human-action-invalid' })
  await assert.rejects(reopened.claim({ ...request, attemptId: 'attempt_other_123456' }, signal), { code: 'human-action-in-progress' })
  assert.equal(disk.value.records[0].attempts.length, 1)
  assert.equal(humanSurface({ ...surface, workflowRef: { ...surface.workflowRef, kind: 'review' } }), undefined)
  assert.equal(humanSurface({ ...surface, reminderPreview: { ...preview, approved: true } }), undefined)
})

test('real DSH schema and execution offer inline default, explicit page and no-context page fallback', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const registry = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const f = await fixture(t), core = await HumanToolsCore.open(store({ schemaVersion: 1, records: [] }), () => randomBytes(16).toString('hex'))
  const definitions = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.runtime, core, assertAgent: exec => assert.equal(exec.agent, agent) })
  for (const tool of definitions) { assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema); registry.register(tool) }
  t.after(async () => { await core.close(); await ctx.fiber.dispose() })
  const tool = definitions.find(item => item.name === 'human_task_prepare_reminder'), branches = tool.parameters.properties.content.oneOf
  const generic = branches.find(item => item.properties.recipientSource?.const === 'exact-references')
  assert(generic); assert.equal(generic.properties.condition.const, 'none')
  assert.equal(branches[0], generic, 'the general unfiltered branch is presented before optional business predicates')
  assert.deepEqual(generic.properties.type.enum, ['complete', 'participate'])
  assert.deepEqual(tool.parameters.properties.preview.enum, ['inline', 'page'])
  for (const preview of [undefined, 'inline', 'page']) {
    const args = { taskRef, expectedRevision: 1, content: content(), ...(preview ? { preview } : {}) }
    const result = await registry.execute({ name: tool.name, arguments: args, agent, callId: 'preview_' + preview, signal })
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.equal(Boolean(result.meta.humanSurface.reminderPreview), preview !== 'page')
    assert.equal(result.meta.humanSurface.workflowRef.digest, draft().draftRef.digest)
  }
  const noContext = await fixture(t, { noContext: true })
  const fallback = lifecycleTools({ nodeId: scope.nodeId, lifecycle: noContext.runtime, core, assertAgent() {} }).find(item => item.name === tool.name)
  const result = await fallback.execute({ taskRef, expectedRevision: 1, content: content() }, { agent, signal, callId: 'fallback', rootCallId: 'fallback' })
  assert.equal(result.surface.reminderPreview, undefined)
  const before = f.requests.length
  await assert.rejects(tool.execute({ taskRef, expectedRevision: 1, content: content(), preview: 'auto-send' },
    { agent, signal, callId: 'bad-preview', rootCallId: 'bad-preview' }), { code: 'lifecycle-arguments-invalid' })
  assert.equal(f.requests.length, before)
})

test('DSH selected-member facts compose into one exact reminder for all selected people without prior opens or silent status filtering', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const registry = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const selected = ['a', 'b', 'c', 'd'].map(id => ref('selection', id))
  const f = await fixture(t, { facts: { count: 4, change: value => {
    value.recipients = selected.map((item, index) => {
      const value = factRow('selection', ['a', 'b', 'c', 'd'][index])
      if (index < 2) {
        value.participantRef = item.ref; value.sources.push('observed')
        value.observedAt = 10; value.identityVerifiedAt = 9; value.confirmedAt = index === 0 ? 15 : null
      }
      return value
    })
  } } })
  const core = await HumanToolsCore.open(store({ schemaVersion: 1, records: [] }), () => randomBytes(16).toString('hex'))
  t.after(async () => { await core.close(); await ctx.fiber.dispose() })
  const definitions = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.runtime, core, assertAgent: exec => assert.equal(exec.agent, agent) })
  for (const tool of definitions) registry.register(tool)
  const evidence = await registry.execute({ name: 'human_task_recipients', arguments: { taskRef }, agent, callId: 'read-selected', signal })
  assert.equal(evidence.isError, false, JSON.stringify(evidence))
  const current = JSON.parse(evidence.content[0].text)
  assert.equal(current.recipients.length, 4)
  assert.equal(current.recipients[0].confirmedAt, 15)
  assert(current.recipients.slice(2).every(item => item.observedAt === null && item.participantRef === null && item.canTarget))
  assert.equal(current.coverage.completeGroupRoster, false)
  const requested = { ...content(), recipientRefs: current.recipients.map(item => item.recipientRef) }
  const prepared = await registry.execute({ name: 'human_task_prepare_reminder', arguments: { taskRef, expectedRevision: 1, content: requested },
    agent, callId: 'remind-all-selected', signal })
  assert.equal(prepared.isError, false, JSON.stringify(prepared))
  const sentToCloud = f.requests.filter(item => item.input.operation === 'reminder-draft')
  assert.equal(sentToCloud.length, 1)
  assert.deepEqual(sentToCloud[0].input.content.recipientRefs, selected, 'all four selected identities remain in the exact action')
  assert.equal(sentToCloud[0].input.content.condition, 'none')
  assert.equal(sentToCloud[0].input.content.roundId, null)
  assert.equal(prepared.meta.humanSurface.reminderPreview.recipientCount, 4)
  assert.equal(prepared.meta.humanSurface.actions[0].id, 'workflow-approve')
  assert(!f.requests.some(item => /publish|claim|notify|share|select/.test(item.input.operation || '')), 'preparation does not send or repeat member selection')
  assert.equal(core.contextSnapshot(scope.sessionId, scope.sessionGeneration).length, 0, 'no fabricated native success receipt')
})

test('late generic preparation withholds action after session replacement or cancellation', async t => {
  for (const cancel of [false, true]) {
    const disk = store({ schemaVersion: 1, records: [] }), core = await HumanToolsCore.open(disk, () => randomBytes(16).toString('hex'))
    t.after(() => core.close())
    const agent = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }
    const abort = new AbortController()
    const runtime = { async prepare() { if (cancel) abort.abort(); else agent.session.header.createdAt = 200; return draft() } }
    const tool = lifecycleTools({ nodeId: scope.nodeId, lifecycle: runtime, core, assertAgent() {} }).find(item => item.name === 'human_task_prepare_reminder')
    await assert.rejects(tool.execute({ taskRef, expectedRevision: 1, content: content() },
      { agent, signal: abort.signal, callId: 'late', rootCallId: 'late' }), cancel ? { name: 'AbortError' } : { code: 'workflow-scope-invalid' })
    assert(disk.value.records.every(record => record.attempts.length === 0))
    assert.deepEqual(core.contextSnapshot(scope.sessionId, scope.sessionGeneration), [])
  }
})

const factsSnapshot = 'a'.repeat(64)
const identityHash = value => createHash('sha256').update(value).digest('base64url')
const identity = id => ({ schema: 'human.member.identity.v1', groupRef: identityHash('synthetic-group'), memberRef: identityHash('synthetic-member-' + id) })
const factRow = (source = 'observed', id = 'p', roundId = null, accepted = false) => ({ recipientRef: ref(source, id),
  identity: identity(id),
  participantRef: source === 'observed' ? id.repeat(24) : null, sources: [source],
  observedAt: source === 'observed' ? 10 : null, confirmedAt: null, identityVerifiedAt: source === 'observed' ? 9 : null,
  canTarget: true, unavailableReason: null, submissionFacts: roundId === null ? null : {
    acceptedCount: accepted ? 1 : 0, latestSubmissionId: accepted ? 's'.repeat(24) : null,
    acceptedAt: accepted ? 20 : null, receivedAt: null,
  } })
function factsReply(input, count = 1) {
  const roundId = input.roundId ?? null, offset = input.offset ?? 0
  return { schema: 'human.recipient.facts.v1', binding, bindingKey, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration },
    taskRef, roundId, asOf: 30, revision: 4, snapshot: factsSnapshot, nextOffset: count > offset + 20 ? offset + 20 : null,
    coverage: { kind: 'known-task-members', completeGroupRoster: false, totalKnown: count, roundScoped: roundId !== null, excludedOwner: true },
    recipients: Array.from({ length: Math.min(20, Math.max(0, count - offset)) }, (_, n) => factRow('observed', String.fromCharCode(65 + n + offset), roundId, true)) }
}
async function factsFixture(t, { count = 1, change, requestError, afterRequest } = {}) {
  const keyStore = store(), ledger = store(), keys = await ReceiverKeyring.open(keyStore, scope.nodeId), requests = []
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(endpoint, input) {
    requests.push(structuredClone({ endpoint, input }))
    assert.equal(endpoint, 'lifecycle'); assert.equal(input.operation, 'recipients', 'read must not register key or write anything')
    if (requestError) throw Object.assign(new Error('Snapshot changed'), { code: requestError })
    const result = factsReply(input, count); change?.(result, input); afterRequest?.(); return result
  } }
  const runtime = await WorkflowLifecycle.open({ transport, keys, store: ledger })
  t.after(async () => { await runtime.close(); await keys.close() })
  return { runtime, keyStore, ledger, requests }
}

test('identity facts pagination has stable snapshot and incomplete-roster coverage, with no key registration or local write', async t => {
  const f = await factsFixture(t, { count: 21 })
  const first = await f.runtime.recipients(scope, taskRef, signal)
  assert.equal(first.recipients.length, 20); assert.equal(first.nextOffset, 20)
  assert.equal(first.coverage.totalKnown, 21); assert.equal(first.coverage.completeGroupRoster, false)
  assert.equal(first.coverage.roundScoped, false); assert.equal(first.coverage.excludedOwner, true)
  assert(first.recipients.every(item => item.submissionFacts === null))
  const last = await f.runtime.recipients(scope, taskRef, signal, null, first.nextOffset, first.snapshot)
  assert.equal(last.recipients.length, 1); assert.equal(last.nextOffset, null)
  assert.equal(last.coverage.completeGroupRoster, false, 'known identities, even after final page, are not full group roster')
  assert.equal(last.snapshot, first.snapshot); assert.equal(last.asOf, 30)
  assert([...first.recipients, ...last.recipients].every(item => item.identity.groupRef === first.recipients[0].identity.groupRef))
  assert.equal(new Set([...first.recipients, ...last.recipients].map(item => item.identity.memberRef)).size, 21)
  assert.equal(f.requests.length, 2); assert.equal(f.keyStore.writes, 0); assert.equal(f.ledger.writes, 0)
  assert.deepEqual(f.requests[1].input, { operation: 'recipients', scope: scope.sessionId, sessionGeneration: scope.sessionGeneration,
    taskRef, roundId: null, offset: 20, snapshot: factsSnapshot })
})

test('identity facts join opened and selection-only members without inventing observations or suppressing submitted people', async t => {
  const roundId = 'r'.repeat(24), f = await factsFixture(t, { count: 2, change: value => {
    value.recipients[0].sources = ['observed', 'selection', 'audience']
    value.recipients[1] = factRow('selection', 'z', roundId, false)
  } })
  const result = await f.runtime.recipients(scope, taskRef, signal, roundId)
  assert.equal(result.recipients[0].submissionFacts.acceptedAt, 20)
  assert.equal(result.recipients[0].submissionFacts.receivedAt, null)
  assert.equal(result.recipients[0].confirmedAt, null, 'accepted is separate from confirmation')
  assert.equal(result.recipients[1].participantRef, null); assert.equal(result.recipients[1].observedAt, null)
  assert.equal(result.recipients[1].canTarget, true, 'native selection may target before first open')
  assert.deepEqual(result.recipients[1].identity, identity('z'))
  const prepare = await fixture(t)
  const request = { ...content(), roundId, recipientRefs: [result.recipients[0].recipientRef] }
  assert.deepEqual((await prepare.prepare(request)).content.recipientRefs, request.recipientRefs,
    'generic explicit reminders can target submitted people; pending-submission is optional, not a fixed filter')
})

test('facts input refuses malformed paging and scope before network; stale snapshots are not silently restarted', async t => {
  const f = await factsFixture(t)
  for (const [roundId, offset, snapshot] of [[null, 20, undefined], [null, -1, undefined], [null, 10001, factsSnapshot],
    [null, 0, 'forged'], [null, 0, factsSnapshot + '\n'], ['', 0, undefined]])
    await assert.rejects(f.runtime.recipients(scope, taskRef, signal, roundId, offset, snapshot), { code: 'lifecycle-query-invalid' })
  await assert.rejects(f.runtime.recipients({ ...scope, nodeId: 'other_node' }, taskRef, signal), { code: 'workflow-scope-invalid' })
  assert.equal(f.requests.length, 0)
  const changed = await factsFixture(t, { requestError: 'recipient_snapshot_changed' })
  await assert.rejects(changed.runtime.recipients(scope, taskRef, signal, null, 20, factsSnapshot), { code: 'recipient_snapshot_changed' })
  assert.equal(changed.requests.length, 1)
})

test('facts responses enforce task, origin, binding, snapshot and evidence consistency without leaking authority fields', async t => {
  const extra = await factsFixture(t, { change: value => { value.roomid = 'private-route'; value.accessToken = 'private-token'; value.bindingSecret = 'private-key' } })
  const projected = await extra.runtime.recipients(scope, taskRef, signal)
  for (const key of ['roomid', 'accessToken', 'bindingSecret', 'binding', 'bindingKey', 'origin']) assert.equal(projected[key], undefined)
  for (const change of [
    value => { value.taskRef = { ...taskRef, taskId: 'x'.repeat(24) } }, value => { value.origin.scope = 'another-session' },
    value => { value.origin.sessionGeneration = '200' }, value => { value.bindingKey = '0'.repeat(64) },
    value => { value.roundId = 'r'.repeat(24) }, value => { value.snapshot += '\n' },
    value => { value.nextOffset = 20 }, value => { value.coverage.totalKnown = 2 }, value => { value.coverage.completeGroupRoster = true },
    value => { value.coverage.excludedOwner = false }, value => { value.coverage.roundScoped = true },
    value => { value.recipients[0].roomid = 'private-route' }, value => { value.recipients[0].recipientRef.deliveryId = 'x'.repeat(24) },
    value => { value.recipients[0].sources = ['selection'] }, value => { value.recipients[0].sources = ['observed', 'observed'] },
    value => { value.recipients[0].canTarget = true; value.recipients[0].unavailableReason = 'route-unavailable' },
    value => { value.recipients[0].participantRef = null }, value => { value.recipients[0].participantRef = 'x'.repeat(24) },
    value => { value.recipients[0].submissionFacts = { acceptedCount: 0, latestSubmissionId: null, acceptedAt: null, receivedAt: null } },
  ]) {
    const f = await factsFixture(t, { change })
    await assert.rejects(f.runtime.recipients(scope, taskRef, signal), error => ['lifecycle-response-invalid', 'lifecycle-binding-invalid'].includes(error.code))
  }
  const duplicate = await factsFixture(t, { count: 2, change: value => { value.recipients[1] = structuredClone(value.recipients[0]) } })
  await assert.rejects(duplicate.runtime.recipients(scope, taskRef, signal), { code: 'lifecycle-response-invalid' })
  const changedSnapshot = await factsFixture(t, { count: 21, change: value => { value.snapshot = 'b'.repeat(64) } })
  await assert.rejects(changedSnapshot.runtime.recipients(scope, taskRef, signal, null, 20, factsSnapshot), { code: 'lifecycle-response-invalid' })
  for (const change of [
    value => { value.recipients[0].submissionFacts.acceptedCount = 0 },
    value => { value.recipients[0].submissionFacts.acceptedAt = null },
    value => { value.recipients[0].submissionFacts.rawGroupId = 'raw' },
  ]) {
    const f = await factsFixture(t, { change })
    await assert.rejects(f.runtime.recipients(scope, taskRef, signal, 'r'.repeat(24)), { code: 'lifecycle-response-invalid' })
  }
})

test('recipient facts tool uses real DSH schema and withholds late data after Agent identity changes', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const registry = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const f = await factsFixture(t)
  const tool = lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.runtime, core: {}, assertAgent: exec => assert.equal(exec.agent, agent) }).find(item => item.name === 'human_task_recipients')
  assert(tool); assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema); registry.register(tool)
  t.after(() => ctx.fiber.dispose())
  const result = await registry.execute({ name: tool.name, arguments: { taskRef }, agent, callId: 'read-facts', signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  const data = JSON.parse(result.content[0].text)
  assert.equal(data.coverage.completeGroupRoster, false); assert.equal(data.bindingKey, undefined)
  const before = f.requests.length
  await assert.rejects(tool.execute({ taskRef, approve: true }, { agent, signal }), { code: 'lifecycle-arguments-invalid' })
  assert.equal(f.requests.length, before)
  const other = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }
  const late = await factsFixture(t, { afterRequest: () => { other.session.header.createdAt = 200 } })
  const guarded = lifecycleTools({ nodeId: scope.nodeId, lifecycle: late.runtime, core: {}, assertAgent() {} }).find(item => item.name === tool.name)
  await assert.rejects(guarded.execute({ taskRef }, { agent: other, signal }), { code: 'workflow-scope-invalid' })
})

test('stable member identities are strict group-scoped evidence and never substitute for action references', async t => {
  const ordinary = await factsFixture(t)
  const value = await ordinary.runtime.recipients(scope, taskRef, signal)
  const stable = value.recipients[0].identity
  assert.deepEqual(stable, identity('A')); assert.equal(Object.keys(stable).length, 3)
  assert.equal(humanRecipientRef(stable), undefined)
  assert.equal(lifecycleReminderContent({ ...content(), recipientRefs: [stable] }), undefined)
  const prepare = await fixture(t)
  await assert.rejects(prepare.prepare({ ...content(), recipientRefs: [stable] }), { code: 'lifecycle-reminder-invalid' })
  assert.equal(prepare.requests.length, 0, 'identity is not an action grant')
  for (const change of [
    row => { delete row.identity }, row => { row.identity = null }, row => { row.identity = 'native-id' },
    row => { row.identity = [] }, row => { row.identity.schema = 'human.recipient.ref.v1' },
    row => { row.identity.groupRef = 'raw-room-id' }, row => { row.identity.memberRef = '用户姓名' },
    row => { row.identity.memberRef += '=' }, row => { row.identity.memberRef += '\n' },
    row => { row.identity.memberRef = row.identity.memberRef.slice(0, -1) },
    row => { row.identity.memberRef = 'A'.repeat(42) + 'B' },
    row => { row.identity.memberRef = '+' + 'A'.repeat(42) }, row => { row.identity.roomid = 'raw' },
    row => { row.identity.revision = 1 }, row => { row.identity.taskId = taskRef.taskId },
    row => { row.identity.canTarget = true }, row => { row.identity.verified = true },
  ]) {
    const bad = await factsFixture(t, { change: result => change(result.recipients[0]) })
    await assert.rejects(bad.runtime.recipients(scope, taskRef, signal), { code: 'lifecycle-response-invalid' })
  }
  const mixedGroup = await factsFixture(t, { count: 2, change: result => { result.recipients[1].identity.groupRef = identityHash('other-group') } })
  await assert.rejects(mixedGroup.runtime.recipients(scope, taskRef, signal), { code: 'lifecycle-response-invalid' })
  const duplicateIdentity = await factsFixture(t, { count: 2, change: result => { result.recipients[1].identity.memberRef = result.recipients[0].identity.memberRef } })
  await assert.rejects(duplicateIdentity.runtime.recipients(scope, taskRef, signal), { code: 'lifecycle-response-invalid' })
})

test('identity association remains available without route/observation and does not manufacture targeting or real-name proof', async t => {
  const weak = await factsFixture(t, { change: result => {
    result.recipients[0].identityVerifiedAt = null; result.recipients[0].canTarget = false
    result.recipients[0].unavailableReason = 'group-identity-unverified'
  } })
  const weakRow = (await weak.runtime.recipients(scope, taskRef, signal)).recipients[0]
  assert.deepEqual(weakRow.identity, identity('A')); assert.equal(weakRow.canTarget, false)
  assert.equal(weakRow.identityVerifiedAt, null); assert.equal(weakRow.name, undefined)
  const selection = await factsFixture(t, { change: result => { result.recipients[0] = factRow('selection', 'A') } })
  const selectedRow = (await selection.runtime.recipients(scope, taskRef, signal)).recipients[0]
  assert.deepEqual(selectedRow.identity, weakRow.identity)
  assert.equal(selectedRow.participantRef, null); assert.equal(selectedRow.observedAt, null)
  assert.equal(selectedRow.confirmedAt, null); assert.equal(selectedRow.submissionFacts, null)
  assert.notDeepEqual(selectedRow.recipientRef, weakRow.recipientRef)
})
