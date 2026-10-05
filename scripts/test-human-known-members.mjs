import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { HumanToolsCore, HUMAN_RETENTION_MS } from '../lib/human-tools/core.js'
import { humanInitialRound } from '../lib/human-tools/form.js'
import { humanSurface } from '../lib/human-tools/protocol.js'
import { humanMembersTool, humanRemindTool } from '../lib/human-tools/dsh.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { createCapabilityManifest } from '../lib/human-workflow/capabilities.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'

// These tests verify plugin construction, preservation and source scoping.
// Native member identity resolution/ACL belongs to cloud integration tests;
// neither these synthetic refs nor a local manifest prove WeChat eligibility.
const signal = new AbortController().signal
const origin = { scope: 'known-member-session', generation: '100', callId: 'source', rootCallId: 'source' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const refs = ['p'.repeat(24), 'q'.repeat(64)]
const initial = () => ({ title: '本次答复', instructions: '填写答复。', closesAt: null, recipientRefs: null,
  form: { schema: 'human.form.v2', fields: [{ key: 'reply', label: '答复', kind: 'short-text', required: true, maxLength: 80 }], attachment: null } })
const known = () => ({ ...initial(), audience: 'known-members', sourceParticipantRefs: [...refs] })
const recipientRef = (source = 'selection', id = 'k') => ({ schema: 'human.recipient.ref.v1', taskId: taskRef.taskId,
  deliveryId: taskRef.deliveryId, source, ref: id.repeat(24), revision: source === 'selection' ? 3 : 0 })
const genericKnown = () => ({ ...initial(), audience: 'known-members', sourceRecipientRefs: [recipientRef()] })
const followup = () => ({ ...origin, callId: 'independent', rootCallId: 'independent' })
function memory(value = { schemaVersion: 1, records: [] }) {
  let state = structuredClone(value)
  return { load: async () => structuredClone(state), save: async value => { state = structuredClone(value) }, get value() { return structuredClone(state) } }
}
const id = () => randomBytes(16).toString('hex')
const request = surface => ({ scope: origin.scope, surfaceId: surface.id, revision: 1, actionId: 'share', attemptId: 'attempt_1234567890' })
async function fixture(t, outcome = 'success') {
  let now = 100
  const store = memory(), core = await HumanToolsCore.open(store, id, () => now)
  t.after(() => core.close())
  const source = await core.createCollection(origin, '登记', '请填写答复。', initial(), signal)
  if (outcome) {
    const action = request(source)
    await core.claim(action, signal)
    await core.ack({ ...action, outcome, ...(outcome === 'success' ? { taskRef } : {}) }, signal)
  }
  return { core, store, source, set now(value) { now = value } }
}

test('known-members accepts bounded distinct source references without changing historical round bytes', () => {
  for (const legacy of [initial(), { ...initial(), audience: 'all-group' }, { ...initial(), audience: 'owner-select' }]) {
    const bytes = JSON.stringify(legacy)
    assert.equal(JSON.stringify(humanInitialRound(legacy)), bytes)
    assert(!Object.hasOwn(humanInitialRound(legacy), 'sourceParticipantRefs'))
  }
  assert.deepEqual(humanInitialRound(known()), known())
  const twenty = { ...known(), sourceParticipantRefs: Array.from({ length: 20 }, (_, n) => String(n).padStart(24, 'p')) }
  assert.deepEqual(humanInitialRound(twenty), twenty)
  const invalid = [[], [...twenty.sourceParticipantRefs, 'z'.repeat(24)], [refs[0], refs[0]], ['YYB'], ['x'.repeat(23)], ['x'.repeat(65)],
    [refs[0] + '\n'], [null], [1], ['x'.repeat(23) + '/'], null, undefined]
  for (const sourceParticipantRefs of invalid) assert.equal(humanInitialRound({ ...known(), sourceParticipantRefs }), undefined)
  for (const audience of [undefined, 'all-group', 'owner-select']) {
    assert.equal(humanInitialRound({ ...known(), audience }), undefined)
    assert.equal(humanInitialRound({ ...initial(), audience, sourceParticipantRefs: undefined }), undefined)
  }
  for (const extra of [{ roomid: 'forged' }, { group_openid: refs[0] }, { memberIds: refs }, { recipientRefs: refs }]) {
    assert.equal(humanInitialRound({ ...known(), ...extra }), undefined)
  }
})

test('known-members surfaces require the exact successful source locator and stay independent', async t => {
  const { core, source, store } = await fixture(t)
  const surface = await core.createCollection(followup(), '单独安排', '请完成本项工作。', known(), signal, source.id)
  assert.notEqual(surface.id, source.id)
  assert.equal(surface.workflowRef, undefined)
  assert.deepEqual(surface.targetTaskRef, taskRef)
  assert.deepEqual(surface.initialRound.sourceParticipantRefs, refs)
  assert.equal(surface.initialRound.recipientRefs, null)
  assert.equal(store.value.records.length, 2)
  assert.deepEqual(humanSurface(surface), surface)
  const withoutSource = structuredClone(surface); delete withoutSource.targetTaskRef
  assert.equal(humanSurface(withoutSource), undefined)
  assert.equal(humanSurface({ ...surface, roomid: 'not-authority' }), undefined)
  assert.equal(humanSurface({ ...surface, targetTaskRef: { ...taskRef, members: refs } }), undefined)
})

test('missing, unsuccessful, foreign, expired and reused-generation sources fail closed without a new surface', async t => {
  const f = await fixture(t)
  const before = f.store.value
  await assert.rejects(f.core.createCollection(followup(), '新事项', '答复。', known(), signal), { code: 'human-source-required' })
  await assert.rejects(f.core.createCollection({ ...followup(), scope: 'other' }, '新事项', '答复。', known(), signal, f.source.id), { code: 'human-surface-unavailable' })
  await assert.rejects(f.core.createCollection({ ...followup(), generation: '200' }, '新事项', '答复。', known(), signal, f.source.id), { code: 'human-origin-conflict' })
  assert.deepEqual(f.store.value, before)
  f.now = 100 + HUMAN_RETENTION_MS
  await assert.rejects(f.core.createCollection(followup(), '新事项', '答复。', known(), signal, f.source.id), { code: 'human-surface-unavailable' })
  assert.deepEqual(f.store.value, before)
  for (const outcome of [undefined, 'failed', 'cancelled', 'unknown']) {
    const blocked = await fixture(t, outcome || null), original = blocked.store.value
    await assert.rejects(blocked.core.createCollection(followup(), '新事项', '答复。', known(), signal, blocked.source.id), { code: 'human-source-unavailable' })
    assert.deepEqual(blocked.store.value, original)
  }
})

test('source participants survive durable reload and source grants, and cannot be changed under an old call', async t => {
  const { core, source, store } = await fixture(t)
  const surface = await core.createCollection(followup(), '独立事项', '答复。', known(), signal, source.id)
  const originalDigest = sha256(canonicalSubmission(surface))
  const changed = { ...known(), sourceParticipantRefs: [refs[1]] }
  assert.notEqual(sha256(canonicalSubmission({ ...surface, initialRound: changed })), originalDigest)
  await assert.rejects(core.createCollection(followup(), '独立事项', '答复。', changed, signal, source.id), { code: 'human-target-conflict' })
  const before = store.value
  await core.close()
  const reopened = await HumanToolsCore.open(store, id, () => 100)
  t.after(() => reopened.close())
  assert.deepEqual(reopened.forResult(origin.scope, followup().rootCallId, origin.generation), surface)
  await reopened.claim(request(surface), signal)
  const grant = reopened.grantSource(request(surface))
  assert.deepEqual(grant.surface, surface)
  assert.equal(sha256(canonicalSubmission(grant.surface)), originalDigest)
  assert.deepEqual(store.value.records[0], before.records[0], 'source task remains unchanged')
})

test('Agent schema exposes source participants but rejects missing source before preparing receiver services', async t => {
  const { core, source } = await fixture(t)
  const agent = { id: origin.scope, session: { id: origin.scope, header: { id: origin.scope, createdAt: 100 } } }
  let preparationCount = 0
  const tools = lifecycleTools({ core, nodeId: 'test_node', assertAgent() {}, lifecycle: { prepareInitial: async () => { preparationCount++ } } })
  const tool = tools.find(item => item.name === 'human_task_create')
  assertSupportedJsonSchema(tool.parameters)
  const input = { title: '单独安排', body: '请完成本项工作。', initialRound: known(), sourceSurfaceId: source.id }
  const exec = { agent, signal, callId: 'new-call', rootCallId: 'new-call' }
  const missing = structuredClone(input); delete missing.sourceSurfaceId
  await assert.rejects(tool.execute(missing, exec), { code: 'human-source-required' })
  await assert.rejects(tool.execute({ ...input, initialRound: { ...known(), audience: 'owner-select' } }, exec), { code: 'lifecycle-form-invalid' })
  await assert.rejects(tool.execute({ ...input, roomid: 'forged' }, exec), { code: 'lifecycle-arguments-invalid' })
  assert.equal(preparationCount, 0)
  const before = structuredClone(input), result = await tool.execute(input, exec)
  assert.equal(preparationCount, 1)
  assert.deepEqual(input, before)
  assert.deepEqual(result.surface.initialRound, input.initialRound)
  assert.deepEqual(tool.output.presentationMeta(input, result).humanSurface, result.surface)
  assert.match(tool.description, /NOT selector preselection or whole-group enumeration/)
  assert.match(tool.description, /Missing\/ambiguous names require clarification/)
  assert.match(tool.description, /does not automatically @/)
})

test('generic known identities strictly choose one source list and preserve old schema bytes', () => {
  const old = known(); assert.equal(JSON.stringify(humanInitialRound(old)), JSON.stringify(old))
  for (const source of ['observed', 'selection', 'audience']) {
    const value = { ...genericKnown(), sourceRecipientRefs: [recipientRef(source)] }
    assert.deepEqual(humanInitialRound(value), value)
  }
  const twenty = { ...genericKnown(), sourceRecipientRefs: Array.from({ length: 20 }, (_, n) => recipientRef('selection', String.fromCharCode(65 + n))) }
  assert.deepEqual(humanInitialRound(twenty), twenty)
  const reversed = Object.fromEntries(Object.entries(recipientRef()).reverse())
  for (const sourceRecipientRefs of [undefined, null, [], [recipientRef(), reversed], [...twenty.sourceRecipientRefs, recipientRef('selection', 'z')],
    [{ ...recipientRef(), revision: 0 }], [{ ...recipientRef('observed'), revision: 1 }], [{ ...recipientRef(), roomid: 'raw' }],
    [{ ...recipientRef(), ref: '姓名' }], [{ ...recipientRef(), taskId: 'guessed' }], [refs[0]]])
    assert.equal(humanInitialRound({ ...genericKnown(), sourceRecipientRefs }), undefined)
  for (const sourceParticipantRefs of [refs, [], undefined, null])
    assert.equal(humanInitialRound({ ...genericKnown(), sourceParticipantRefs }), undefined, 'source options are mutually exclusive even if one is undefined')
  const neither = genericKnown(); delete neither.sourceRecipientRefs
  assert.equal(humanInitialRound(neither), undefined)
  for (const audience of [undefined, 'all-group', 'owner-select']) {
    assert.equal(humanInitialRound({ ...genericKnown(), audience }), undefined)
    assert.equal(humanInitialRound({ ...initial(), audience, sourceRecipientRefs: undefined }), undefined)
    const independent = { ...initial(), ...(audience === undefined ? {} : { audience }) }
    assert.deepEqual(humanInitialRound(independent), independent, 'known identities do not require use of this path')
  }
})

test('selection-only identities create independent task drafts without any source participant record', async t => {
  const { core, source, store } = await fixture(t)
  const value = genericKnown(), surface = await core.createCollection(followup(), '重新安排', '请完成新的事项。', value, signal, source.id)
  assert.notEqual(surface.id, source.id); assert.deepEqual(surface.targetTaskRef, taskRef)
  assert.deepEqual(surface.initialRound.sourceRecipientRefs, value.sourceRecipientRefs)
  assert.equal(surface.initialRound.sourceParticipantRefs, undefined)
  assert.equal(surface.workflowRef, undefined); assert.equal(surface.initialRound.recipientRefs, null)
  assert.deepEqual(humanSurface(surface), surface)
  assert.equal(store.value.records[1].attempts.length, 0, 'prepared known audience is not approved or sent')
  const originalSource = store.value.records[0]
  const formChanged = { ...value, sourceRecipientRefs: [recipientRef('audience', 'j')] }
  await assert.rejects(core.createCollection(followup(), '重新安排', '请完成新的事项。', formChanged, signal, source.id), { code: 'human-target-conflict' })
  const snapshot = sha256(canonicalSubmission(surface))
  await core.close()
  const reopened = await HumanToolsCore.open(store, id, () => 100); t.after(() => reopened.close())
  assert.deepEqual(reopened.forResult(origin.scope, followup().rootCallId, origin.generation), surface)
  await reopened.claim(request(surface), signal)
  assert.equal(sha256(canonicalSubmission(reopened.grantSource(request(surface)).surface)), snapshot)
  assert.deepEqual(store.value.records[0], originalSource, 'source task remains unchanged; no enrollment invented')
})

test('generic source references reject cross-task/delivery sources during construction and durable surface parsing', async t => {
  const f = await fixture(t), before = f.store.value
  await assert.rejects(f.core.createCollection(followup(), '事项', '答复。', genericKnown(), signal), { code: 'human-source-required' })
  for (const patch of [{ taskId: 'x'.repeat(24) }, { deliveryId: 'y'.repeat(24) }]) {
    const value = { ...genericKnown(), sourceRecipientRefs: [{ ...recipientRef(), ...patch }] }
    assert(humanInitialRound(value), 'shape validation alone is not authority')
    await assert.rejects(f.core.createCollection(followup(), '事项', '答复。', value, signal, f.source.id), { code: 'human-source-invalid' })
  }
  await assert.rejects(f.core.createCollection({ ...followup(), scope: 'other' }, '事项', '答复。', genericKnown(), signal, f.source.id), { code: 'human-surface-unavailable' })
  await assert.rejects(f.core.createCollection({ ...followup(), generation: '200' }, '事项', '答复。', genericKnown(), signal, f.source.id), { code: 'human-origin-conflict' })
  assert.deepEqual(f.store.value, before)
  const surface = await f.core.createCollection(followup(), '事项', '答复。', genericKnown(), signal, f.source.id)
  for (const changed of [
    { ...surface, targetTaskRef: { ...taskRef, taskId: 'x'.repeat(24) } },
    { ...surface, initialRound: { ...surface.initialRound, sourceRecipientRefs: [{ ...recipientRef(), deliveryId: 'y'.repeat(24) }] } },
    { ...surface, initialRound: { ...surface.initialRound, sourceParticipantRefs: refs } },
  ]) {
    assert.equal(humanSurface(changed), undefined)
    const corrupt = f.store.value; corrupt.records[1].surface = changed
    await assert.rejects(HumanToolsCore.open(memory(corrupt), id, () => 100), { code: 'human-store-invalid' })
  }
  for (const outcome of [null, 'failed', 'cancelled', 'unknown']) {
    const blocked = await fixture(t, outcome)
    await assert.rejects(blocked.core.createCollection(followup(), '事项', '答复。', genericKnown(), signal, blocked.source.id), { code: 'human-source-unavailable' })
  }
})

test('Agent tool schema exposes optional generic reuse and legacy reminder describes only its own restriction', async t => {
  const { core, source } = await fixture(t)
  let prepared = 0
  const tool = lifecycleTools({ core, nodeId: 'test_node', assertAgent() {}, lifecycle: { prepareInitial: async () => { prepared++ } } }).find(item => item.name === 'human_task_create')
  assertSupportedJsonSchema(tool.parameters)
  const schema = tool.parameters.properties.initialRound.properties
  assert.deepEqual(schema.audience.enum, ['all-group', 'owner-select', 'known-members'])
  assert.equal(schema.sourceRecipientRefs.items.properties.schema.const, 'human.recipient.ref.v1')
  assert.deepEqual(schema.sourceRecipientRefs.items.properties.source.enum, ['observed', 'selection', 'audience'])
  assert(!tool.parameters.properties.initialRound.required.includes('sourceRecipientRefs'))
  assert.match(schema.sourceRecipientRefs.description, /mutually exclusive with sourceParticipantRefs/)
  assert.match(tool.description, /people who have never opened or submitted/)
  const agent = { id: origin.scope, session: { id: origin.scope, header: { id: origin.scope, createdAt: 100 } } }
  const exec = { agent, signal, callId: 'generic-tool', rootCallId: 'generic-tool' }
  const args = { title: '独立安排', body: '完成这件事。', initialRound: genericKnown(), sourceSurfaceId: source.id }
  const missing = { ...args }; delete missing.sourceSurfaceId
  await assert.rejects(tool.execute(missing, exec), { code: 'human-source-required' })
  await assert.rejects(tool.execute({ ...args, initialRound: { ...args.initialRound, sourceParticipantRefs: refs } }, exec), { code: 'lifecycle-form-invalid' })
  assert.equal(prepared, 0)
  const result = await tool.execute(args, exec)
  assert.equal(prepared, 1); assert.deepEqual(result.surface.initialRound.sourceRecipientRefs, args.initialRound.sourceRecipientRefs)
  assert.deepEqual(tool.output.presentationMeta(args, result).humanSurface, result.surface)
  const members = humanMembersTool(core), reminder = humanRemindTool(core)
  assert.match(members.description, /human_task_recipients/); assert.match(members.description, /never opened or submitted/)
  assert.match(members.description, /sourceRecipientRefs/); assert.match(reminder.description, /THIS legacy tool accepts only/)
  assert.match(reminder.description, /ALL selected people or an explicit subset regardless/); assert.match(reminder.description, /condition=none/)
})

test('known-member capability separates local availability from original-group proof and never promises roster enumeration or automatic mention', () => {
  const blocked = createCapabilityManifest('test_node')
  assert.equal(blocked.capabilities.find(item => item.id === 'task.audience-known').status, 'blocked')
  const manifest = createCapabilityManifest('test_node', { 'task.audience-known': { status: 'available' } })
  assert.equal(manifest.capabilities.find(item => item.id === 'task.audience-known').status, 'available')
  assert.equal(manifest.contracts.platformReadiness.status, 'unknown')
  const contract = manifest.contracts.audience.knownMembers
  assert.equal(contract.taskEffect, 'new-independent-task')
  assert.equal(contract.ownerNativeSendConfirmation, true)
  for (const flag of ['rosterEnumeration', 'groupIdProvidesRoster', 'automaticMention', 'selectorPreselection', 'nativeGroupAndMemberRepicking']) assert.equal(contract[flag], false)
  assert.equal(manifest.contracts.audience.rosterEnumeration, false)
  assert.equal(manifest.contracts.audience.selectionRequiresAppliesTo, 'owner-select')
  assert.equal(contract.recipientRefs, null)
  assert.equal(contract.visibility.sharedTitleAndCover, 'visible-in-group-not-recipient-private')
  assert.equal(contract.visibility.submissionsAndFeedback, 'owner-and-self')
  assert.equal(contract.visibility.privateEvaluationInSharedCard, false)
  assert.equal(contract.nativeParticipantMeaning, 'audience-not-mention')
  assert.deepEqual(manifest.contracts.audience.composition, {
    default: 'all-group', choice: 'agent-selects-from-current-user-intent',
    sourceSurfaceId: 'optional-same-session-group-source', workspaceSourceId: 'mutually-exclusive-verified-workspace-source',
    knownIdentityDoesNotForceKnownMembers: true, ownerReselectionAllowed: true,
    taskOrRound: 'independent-choice-by-user-intent-not-by-known-identities', mandatoryQuestionnaire: false,
  })
  assert.match(HUMAN_WORKFLOW_SKILL.content, /另给已登记YYB布置新作业/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /重名、不认识、来源不清/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /拿到群 ID 不等于拿到全群名单/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /不再要求重复选群选人/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /另用当前支持的提醒能力并分别核对真实回执/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /卡片标题和封面不是对其他群成员隐形/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /participant 只是指定参与范围，不是@字段/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /用户想重新选人仍用 owner-select/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /不增加固定必问清单/)
})

test('shared-source guidance matches verified workspace access without widening private analysis or file scope', () => {
  const tools = lifecycleTools({ core: {}, nodeId: 'test_node', assertAgent() {}, lifecycle: {}, async saveImage() { assert.fail('discovery must not read images') } })
  const query = tools.find(item => item.name === 'human_task_lifecycle')
  assert.match(query.description, /explicitly shared source returned by human_workspace_directory in the same real workspace/)
  assert.match(query.description, /revalidate both actual sessions/)
  assert.match(query.description, /not a blanket grant for local analysis\/files or automation/)
  for (const key of ['workspaceRef', 'workspacePath', 'sessionId']) assert(!Object.hasOwn(query.parameters.properties, key))
  assert.match(tools.find(item => item.name === 'human_submission_analysis_list').description, /No cross-session access/)
  assert.match(tools.find(item => item.name === 'human_submission_image').description, /Cannot download arbitrary URLs or access other sessions/)
  const description = createCapabilityManifest('test_node').capabilities.find(item => item.id === 'task.audience-known').description
  assert.match(description, /同会话成功任务/)
  assert.match(description, /同一真实工作区目录中显式共享、经宿主与云端重新核验/)
  assert.match(description, /不等于任意跨会话或跨工作区权限/)
})
