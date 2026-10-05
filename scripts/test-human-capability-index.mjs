import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapabilityManifest } from '../lib/human-workflow/capabilities.js'
import { capabilityCatalog, CAPABILITY_CATEGORIES } from '../lib/human-workflow/capability-index.js'
import { humanWorkflowTools } from '../lib/human-workflow/dsh-tools.js'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'

const manifest = () => createCapabilityManifest('node_test')
test('all capabilities are classified once and unavailable primitives never invent tools', () => {
  const result = capabilityCatalog(manifest())
  assert.deepEqual(result.categories, [...CAPABILITY_CATEGORIES])
  assert.equal(result.fixedWorkflow, false)
  assert.equal(result.reusableAcrossPresets, true)
  assert.equal(result.sharesOtherSessionAuthority, false)
  assert.equal(new Set(result.entries.map(item => item.id)).size, result.entries.length)
  assert.equal(new Set(result.entries.map(item => item.category)).size, CAPABILITY_CATEGORIES.length)
  for (const id of ['group.roster-enumerate', 'message.mention-all', 'message.share-and-mention-one-call']) {
    const entry = result.entries.find(item => item.id === id)
    assert.equal(entry.status, 'not-in-public-contract')
    assert.deepEqual(entry.tools, [])
  }
  assert.equal(result.entries.find(item => item.id === 'message.group-todo').status, 'native-ui-only')
  assert.equal(result.entries.find(item => item.id === 'member.directory').status, 'blocked')
  assert.deepEqual(result.entries.find(item => item.id === 'member.directory').tools, ['human_workspace_directory', 'human_workspace_sync', 'human_workspace_note'])
  const ready = createCapabilityManifest('node_test', { 'workspace.directory': { status: 'available' }, 'task.reshare': { status: 'available' } })
  assert.equal(capabilityCatalog(ready).entries.find(item => item.id === 'member.directory').status, 'available')
  assert.equal(capabilityCatalog(ready).entries.find(item => item.id === 'message.reshare-existing').status, 'available')
})
test('file capability remains blocked unless genuine local implementation is advertised', () => {
  assert.equal(capabilityCatalog(manifest(), 'files').entries.find(item => item.id === 'file.document').status, 'blocked')
  const ready = createCapabilityManifest('node_test', { 'submission.file-receive': { status: 'available' } })
  assert.equal(capabilityCatalog(ready, 'files').entries.find(item => item.id === 'file.document').status, 'available')
  assert.equal(capabilityCatalog(ready).platformReadiness, 'per-operation-unknown')
  assert.equal(capabilityCatalog(ready, 'files').entries.find(item => item.id === 'file.multiple').status, 'planned')
})

test('assistant design catalog requires registered implementation, independently of native preset installation', () => {
  const blocked = capabilityCatalog(manifest(), 'workspace', 'full').entries.find(item => item.id === 'workspace.assistant-design')
  assert.equal(blocked.status, 'blocked')
  assert.deepEqual(blocked.requires, ['assistant.design'])
  assert.match(blocked.reason, /未启用或所需工具尚未注册/)
  const ready = createCapabilityManifest('node_test', { 'assistant.design': { status: 'available' } })
  const design = capabilityCatalog(ready, 'workspace', 'full').entries.find(item => item.id === 'workspace.assistant-design')
  assert.equal(design.status, 'available')
  assert.match(design.boundary, /实际安装取决于原生宿主支持/)
  assert.match(ready.capabilities.find(item => item.id === 'assistant.design').description, /不要求先安装教师模式/)
})

test('file discovery exposes all collection paths and unambiguous versioned Word support', () => {
  const files = capabilityCatalog(manifest(), 'files', 'full')
  for (const id of ['file.image', 'file.document']) for (const tool of ['human_task_create', 'human_task_prepare_round', 'human_task_prepare_review'])
    assert(files.entries.find(entry => entry.id === id).tools.includes(tool))
  const form = files.contracts.memberForm
  assert.deepEqual(form.bySchema['human.form.v2'].attachmentKinds, ['image'])
  assert(form.bySchema['human.form.v3'].attachmentKinds.includes('file'))
  assert(form.bySchema['human.form.v3'].fileMediaTypes.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  assert(!form.bySchema['human.form.v3'].fileMediaTypes.includes('application/msword'))
  assert.match(form.bySchema['human.form.v3'].word, /not legacy DOC/)
  assert.equal(form.paths.initial, 'initialRound.form'); assert.equal(form.paths.correction, 'content.correction.form')
  assert.match(form.paths.presentation, /never beside form/)
  assert.equal(form.validation.issueSchema, 'human.form.issue.v1')
  assert.match(form.validation.repair, /without dropping user requirements/)
  assert.deepEqual(form.attachment.mediaTypes, ['image/jpeg', 'image/png'], 'legacy compatibility fields are preserved and explicitly labelled')
})

test('private execution is discoverable but node readiness is not current-session authorization', () => {
  const contract = manifest().contracts.workflowPreview
  assert.equal(contract.conversationTextIsApproval, false)
  const input = contract.privatePublication
  assert.equal(input.tool, 'human_task_publish_private')
  assert.deepEqual(input.parameters, ['taskRef', 'draftRef'])
  assert.deepEqual(input.kinds, ['review-with-optional-correction', 'round-with-nonempty-recipientRefs'])
  assert.match(input.evidence, /host-derived-current-user-input/)
  assert.match(input.permission, /revocable-session/)
  assert(input.exclusions.includes('reminder'))
  assert(input.exclusions.includes('background-automation'))
  assert.match(input.scope, /no-workspace-write-sharing/)
  assert.match(input.fallback, /runtime-or-permission-unavailable/)
  assert.match(input.unknownResult, /no-replay/)
  assert.equal(capabilityCatalog(manifest(), 'feedback').entries.find(item => item.id === 'feedback.private-execution').status, 'blocked')
  const ready = createCapabilityManifest('node_test', { 'task.private-publish': { status: 'available' } })
  assert.equal(capabilityCatalog(ready, 'feedback').entries.find(item => item.id === 'feedback.private-execution').status, 'available')
})
test('targeted details do not leak unrelated contracts or claim participation is a submission', () => {
  const result = capabilityCatalog(manifest(), 'facts', 'full')
  assert(result.entries.every(item => item.category === 'facts'))
  assert(!Object.hasOwn(result.contracts, 'presentation'))
  assert.match(result.entries.find(item => item.id === 'facts.task').boundary, /confirmedCount不是提交数/)
  const group = capabilityCatalog(manifest(), 'groups', 'full')
  assert.match(group.entries.find(item => item.id === 'group.choose').boundary, /不必等其他成员点卡/)
  const members = capabilityCatalog(manifest(), 'members', 'full')
  assert.deepEqual(members.contracts.recipientFacts.identity.fields, ['groupRef', 'memberRef'])
  assert.equal(members.contracts.recipientFacts.identity.authorization, false)
  assert(members.contracts.recipientFacts.identity.notInterchangeableWith.includes('selectionRef.memberRefs'))
  assert.equal(members.contracts.recipientFacts.identity.businessRole, false)
  assert.equal(members.contracts.recipientFacts.identity.unlimitedPlatformLifetimeGuaranteed, false)
  assert.match(members.entries.find(item => item.id === 'member.facts').boundary, /两者不能互换/)
  const message = capabilityCatalog(manifest(), 'messages', 'full')
  assert.match(message.entries.find(item => item.id === 'message.remind-participation').boundary, /参与确认，不是作业提交/)
  assert.match(message.entries.find(item => item.id === 'message.reading').boundary, /不要把它当重新分享旧作业入口/)
  message.entries[0].tools.length = 0
  assert(capabilityCatalog(manifest(), 'messages').entries[0].tools.length > 0)
})
test('invalid discovery query rejects rather than silently changing scope', () => {
  for (const category of ['', 'teacher', '__proto__', null, {}, []]) assert.throws(() => capabilityCatalog(manifest(), category), { code: 'capability-query-invalid' })
  for (const detail of ['all', {}, null, 0]) assert.throws(() => capabilityCatalog(manifest(), 'groups', detail), { code: 'capability-query-invalid' })
})
test('discovery distinguishes hidden native IDs, selected identities and general unfiltered reminders', () => {
  const members = capabilityCatalog(manifest(), 'members', 'full')
  const contract = members.contracts.recipientFacts
  assert.equal(contract.hiddenRawIdsMeanUnavailable, false)
  assert.equal(contract.selectedMembersRequireFirstOpen, false)
  assert.equal(contract.zeroObservedParticipantsMeansNoSelectedIdentities, false)
  assert.match(contract.nativeIdentityHandling, /held-by-service/)
  const messages = capabilityCatalog(manifest(), 'messages', 'full')
  const exactIndex = messages.entries.findIndex(item => item.id === 'message.remind-exact')
  const legacyIndex = messages.entries.findIndex(item => item.id === 'message.remind-participation')
  assert(exactIndex < legacyIndex, 'the general capability is discoverable before the specialized compatibility filter')
  assert.match(messages.entries[exactIndex].purpose, /全部已选成员或明确子集/)
  assert.equal(messages.contracts.reminders.exactReferences.excludesConfirmedOrSubmitted, false)
  assert.equal(messages.contracts.reminders.exactReferences.requiresFirstOpen, false)
  assert.deepEqual(messages.contracts.reminders.legacyParticipation.notEquivalentTo, ['all-selected-members', 'all-group-members', 'pending-submission'])
})
test('native tool discovery preserves legacy calls, validates inputs and has no side effects', async () => {
  let reads = 0
  const definition = humanWorkflowTools({ nodeId: 'node_test', modes: {}, records: {}, capabilities: () => { reads++; return manifest() } }).find(item => item.name === 'human_capabilities')
  assertSupportedJsonSchema(definition.parameters)
  const agent = { id: 'session_catalog', session: { id: 'session_catalog', header: { id: 'session_catalog', createdAt: 1 } } }
  const exec = { agent, signal: new AbortController().signal }
  assert.equal((await definition.execute({}, exec)).schema, 'human.capabilities.v1')
  assert.equal((await definition.execute({ view: 'catalog' }, exec)).schema, 'human.capability.catalog.v1')
  assert((await definition.execute({ category: 'files', detail: 'full' }, exec)).entries.every(entry => entry.category === 'files'))
  assert.equal(reads, 3)
  await assert.rejects(() => definition.execute({ view: 'manifest', category: 'files' }, exec), { code: 'capability-query-invalid' })
  await assert.rejects(() => definition.execute({ approve: true }, exec), { code: 'workflow-arguments-invalid' })
  await assert.rejects(() => definition.execute({}, { ...exec, agent: null }), { code: 'workflow-scope-invalid' })
})
