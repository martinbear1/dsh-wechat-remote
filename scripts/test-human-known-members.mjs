import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { HumanToolsCore, HUMAN_RETENTION_MS } from '../lib/human-tools/core.js'
import { humanInitialRound } from '../lib/human-tools/form.js'
import { humanSurface } from '../lib/human-tools/protocol.js'
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
    sourceSurfaceId: 'optional-group-reuse-required-only-for-known-members',
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
