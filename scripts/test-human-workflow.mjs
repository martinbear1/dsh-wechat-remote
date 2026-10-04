import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { createCapabilityManifest } from '../lib/human-workflow/capabilities.js'
import { StateQueue } from '../lib/human-workflow/data.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { ModeRegistry, parseModePackage, validateModePackage, modeDigest, renderModeCard } from '../lib/human-workflow/mode-package.js'
import { WorkflowRecords } from '../lib/human-workflow/workflow-records.js'
import { humanWorkflowTools, registerHumanWorkflowContext, MODE_FIELD_SCHEMA, MODE_PACKAGE_SCHEMA, WORKFLOW_CONTENT_SCHEMA } from '../lib/human-workflow/dsh-tools.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { humanSurface } from '../lib/human-tools/protocol.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_web', sessionId: 'session_a', sessionGeneration: '100' }
const other = { ...scope, sessionId: 'session_b' }
const nextGeneration = { ...scope, sessionGeneration: '200' }
const content = () => ({ title: '独立项目甲', objective: '收集阅读确认并分析进展', plan: [{ id: 'step_1', title: '主人审核后出卡', state: 'planned' }], analyses: [] })
const modePackage = () => ({
  schemaVersion: 1, name: '项目阅读确认', description: '通用项目协作任务模板', goal: '结合已授权事实推进项目',
  roles: [{ id: 'owner', label: '负责人' }], rules: ['发布须主人批准', '分析不得修改成员原始事实'],
  requiredCapabilities: ['mode.packages', 'surface.reading-confirmation', 'workflow.records'],
  allowedTools: ['human_mode_prepare_card', 'human_workflow_save', 'human_workflow_get', 'human_workflow_list'],
  inputSchema: { fields: [{ key: 'title', label: '主题', required: true, kind: 'short-text', maxLength: 80 },
    { key: 'body', label: '内容', required: true, kind: 'long-text', maxLength: 500 }] },
  resultSchema: { fields: [{ key: 'summary', label: '摘要', required: true, kind: 'short-text', maxLength: 80 }] },
  card: { kind: 'reading-confirmation', titleField: 'title', bodyFields: ['body'] },
  approval: { activation: 'owner', publication: 'owner' }, automation: 'manual',
  onboarding: { questions: [
    { field: { key: 'project', label: '项目名称', required: true, kind: 'short-text', maxLength: 80 }, prompt: '这次管理哪个项目？' },
    { field: { key: 'stage', label: '阶段', required: true, kind: 'choice', choices: ['准备', '执行'] }, prompt: '当前处于哪个阶段？' },
  ] },
})
function memory(initial) {
  let value = structuredClone(initial), writes = 0
  return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next); writes++ },
    get value() { return structuredClone(value) }, get writes() { return writes }, set value(next) { value = structuredClone(next) } }
}
function ids() { let n = 0; return () => String(++n).padStart(32, '0') }
function reference(version) { return { id: version.id, version: version.version, digest: version.digest } }
function approval(preview) { return { ...reference(preview), previewId: preview.previewId, expectedActivationVersion: preview.expectedActivationVersion } }
async function fixture(options = {}) {
  let time = 1000, availability = options.availability || {}
  const randomId = ids(), modeStore = options.modeStore || memory(), recordStore = options.recordStore || memory()
  const capabilities = () => createCapabilityManifest(scope.nodeId, availability)
  const modes = await ModeRegistry.open(modeStore, { nodeId: scope.nodeId, capabilities, randomId, now: () => time })
  const records = await WorkflowRecords.open(recordStore, { nodeId: scope.nodeId, modes, randomId, now: () => time,
    ...(options.validateReferences ? { validateReferences: options.validateReferences } : {}) })
  return { modes, records, modeStore, recordStore, capabilities, randomId,
    set time(value) { time = value }, set availability(value) { availability = value },
    async activate(at = scope, pkg = modePackage()) {
      const draft = await modes.draft(at, { package: pkg }, signal)
      const preview = await modes.preview(at, reference(draft), signal)
      await modes.approve(at, approval(preview), signal)
      return reference(draft)
    }, async close() { await records.close(); await modes.close() } }
}
const rejects = (body, code) => assert.rejects(async () => body(), error => error?.code === code)

test('capability directory is honest about current cards and blocked/planned features', () => {
  const manifest = createCapabilityManifest(scope.nodeId)
  assert.equal(manifest.capabilities.find(x => x.id === 'surface.reading-confirmation').status, 'available')
  for (const id of ['submission.receive', 'result.private', 'automation.run', 'task.query', 'recipient.query']) {
    assert.notEqual(manifest.capabilities.find(x => x.id === id).status, 'available')
  }
  assert.equal(validateModePackage(modePackage(), manifest).ok, true)
  for (const id of ['submission.receive', 'result.private', 'automation.run', 'unknown.capability']) {
    const value = modePackage(); value.requiredCapabilities.push(id)
    assert.equal(validateModePackage(value, manifest).ok, false)
  }
  const changed = modePackage(); changed.allowedTools.push('shell')
  assert.equal(validateModePackage(changed, manifest).ok, false, 'mode cannot grant arbitrary host tools')
  const value = manifest.capabilities[0]; value.status = 'blocked'
  assert.equal(createCapabilityManifest(scope.nodeId).capabilities[0].status, 'available', 'manifest is not shared mutable authority')
})

test('fixed data language rejects executable/render/network extensions and enforces field constraints', () => {
  for (const extra of [{ url: 'https://example.com' }, { code: 'return true' }, { renderer: 'custom' }, { eventHandler: 'send' }]) {
    assert.throws(() => parseModePackage({ ...modePackage(), ...extra }), { code: 'mode-package-invalid' })
  }
  for (const mutate of [p => { p.card.kind = 'member-upload' }, p => { p.automation = 'automatic' },
    p => { p.approval.activation = 'agent' }, p => { p.inputSchema.fields[0].maxLength = 81 },
    p => { p.inputSchema.fields[1].key = 'title' }, p => { p.onboarding.questions[1].field.choices = ['same', 'same'] },
    p => { p.onboarding.questions[0].field.kind = 'script' }]) {
    const value = modePackage(); mutate(value); assert.throws(() => parseModePackage(value), { code: 'mode-package-invalid' })
  }
  assert.deepEqual(renderModeCard(modePackage(), { title: '检查点', body: '请确认' }), { title: '检查点', body: '内容：请确认' })
  for (const value of [{ title: 'x' }, { title: 'x', body: 'b', hidden: true }, { title: 'x'.repeat(81), body: 'b' }, { title: 'x', body: 1 }]) {
    assert.throws(() => renderModeCard(modePackage(), value), { code: 'mode-values-invalid' })
  }
  const parsed = parseModePackage(modePackage())
  assert.equal(modeDigest(parsed), modeDigest(Object.fromEntries(Object.entries(parsed).reverse())), 'digest is content/key-order stable')
})

test('generic capability contracts separate local availability, native authorization and form/template limits', () => {
  const blocked = createCapabilityManifest(scope.nodeId)
  assert.equal(blocked.capabilities.find(item => item.id === 'task.audience-select').status, 'blocked')
  const manifest = createCapabilityManifest(scope.nodeId, { 'task.audience-select': { status: 'available' } })
  assert.equal(manifest.capabilities.find(item => item.id === 'task.audience-select').status, 'available')
  const contract = manifest.contracts
  assert.equal(contract.statusMeaning, 'node-implementation-only')
  assert.equal(contract.platformReadiness.status, 'unknown', 'local tools do not imply WeChat/device/owner authorization')
  assert.equal(contract.modeTemplate.choices.max, 12)
  assert.equal(contract.memberForm.choices.max, 20)
  assert.equal(contract.sourceSurface.maxUtf8Bytes, 128 * 1024)
  assert.equal(contract.memberForm.maxUtf8Bytes, 64 * 1024)
  assert.equal(contract.memberForm.answers.maxUtf8Bytes, 12000)
  assert.equal(contract.taskProposal.maxUtf8Bytes, 96 * 1024)
  assert.equal(contract.sourceSurface.limitOrigin, 'product')
  assert.deepEqual(contract.memberForm.attachment.modes, ['none', 'optional', 'required'])
  assert.equal(contract.audience.selectionParameter, 'initialRound.audience')
  assert.equal(contract.audience.binds, 'whole-task')
  assert.equal(contract.audience.cancelledSelectionPublishes, false)
  assert.equal(contract.audience.limitOrigin, 'product')
  assert.equal(contract.audience.rosterEnumeration, false)
  assert.equal(contract.workflow.fixedBusinessSequence, false)
  assert.equal(contract.workflow.presetActivationIsTaskAuthorization, false)
  assert.equal(contract.workflow.sameWorkspaceIsTaskAuthorization, false)
  assert.equal(contract.presentation.arbitraryHtmlOrScripts, false)
  assert.deepEqual(contract.presentation.messageCard.customizable, ['title', 'cover'])
  assert.equal(contract.presentation.messageCard.cover.schema, 'human.card.asset.v1')
  assert.equal(contract.presentation.messageCard.cover.default, 'bundled-fixed')
  assert.equal(contract.presentation.messageCard.sourceBody, 'in-app-description-not-a-wechat-share-parameter')
  contract.audience.initial.push('invented')
  assert.deepEqual(createCapabilityManifest(scope.nodeId).contracts.audience.initial, ['all-group', 'owner-select', 'known-members'])
})

test('automatic capability follows native availability but mode activation never grants execution or job tools', () => {
  const manifest = createCapabilityManifest(scope.nodeId, { 'automation.run': { status: 'available' } })
  const capability = manifest.capabilities.find(item => item.id === 'automation.run')
  assert.equal(capability.status, 'available')
  assert.equal(capability.ownerApproval, true)
  assert.deepEqual(capability.tools, ['human_automation_rules', 'human_automation_propose'], 'only rule proposal tools are granted to ordinary Agent contexts')
  const mode = modePackage(); mode.requiredCapabilities.push('automation.run')
  assert.equal(validateModePackage(mode, manifest).ok, true)
  assert.equal(mode.automation, 'manual')
  mode.allowedTools.push('human_automation_save')
  assert.equal(validateModePackage(mode, manifest).ok, false)
  assert.equal(createCapabilityManifest(scope.nodeId).capabilities.find(item => item.id === 'automation.run').status, 'blocked')
})

test('draft -> preview -> exact owner approval, CAS and single-purpose preview are enforced', async () => {
  const f = await fixture(), draft = await f.modes.draft(scope, { package: modePackage() }, signal), ref = reference(draft)
  assert.equal(f.modes.list(scope).activation.mode, null)
  assert.throws(() => f.modes.requireActive(scope, ref), { code: 'mode-not-active' })
  const first = await f.modes.preview(scope, ref, signal), second = await f.modes.preview(scope, ref, signal)
  assert.deepEqual(first.capabilities.map(x => x.id).sort(), modePackage().requiredCapabilities.sort())
  await rejects(() => f.modes.approve(other, approval(first), signal), 'mode-preview-expired')
  await rejects(() => f.modes.approve(scope, { ...approval(first), digest: '0'.repeat(64) }, signal), 'mode-preview-expired')
  await rejects(() => f.modes.approve(scope, { ...approval(first), execute: true }, signal), 'mode-approval-invalid')
  const approved = await f.modes.approve(scope, approval(first), signal)
  assert.deepEqual(approved.mode, ref)
  assert.deepEqual(await f.modes.approve(scope, approval(first), signal), approved, 'exact retry is idempotent')
  await rejects(() => f.modes.rollback(scope, approval(first), signal), 'mode-approval-conflict')
  await rejects(() => f.modes.approve(scope, approval(second), signal), 'mode-activation-conflict')
  assert.equal(f.modes.list(other).activation.mode, null)
  assert.equal(f.modes.list(other).modes[0].id, ref.id, 'only immutable template is node-shareable')
  await f.close()
})

test('expired previews and withdrawn capabilities do not authorize activation or rollback', async () => {
  const f = await fixture(), ref = await f.activate()
  const expired = await f.modes.preview(scope, ref, signal); f.time = expired.expiresAt
  await rejects(() => f.modes.approve(scope, approval(expired), signal), 'mode-preview-expired')
  const fresh = await f.modes.preview(scope, ref, signal)
  f.availability = { 'surface.reading-confirmation': { status: 'blocked', reason: 'disconnected' } }
  await rejects(() => f.modes.rollback(scope, approval(fresh), signal), 'mode-capability-unavailable')
  assert.throws(() => f.modes.requireActive(scope, ref), { code: 'mode-capability-unavailable' })
  const bad = modePackage(); bad.requiredCapabilities.push('submission.receive')
  const draft = await f.modes.draft(scope, { package: bad }, signal)
  assert.equal(draft.validation.ok, false)
  const preview = await f.modes.preview(scope, draft, signal)
  assert.equal(preview.validation.ok, false)
  await rejects(() => f.modes.approve(scope, approval(preview), signal), 'mode-capability-unavailable')
  await f.close()
})

test('new versions and rollback preserve old workflows, native preset metadata does not select data', async () => {
  const f = await fixture(), v1 = await f.activate(), record = await f.records.create(scope, { mode: v1, content: content() }, signal)
  const revised = modePackage(); revised.name = '第二版销售跟进'; revised.goal = '跟进销售项目'
  const v2 = await f.modes.draft(scope, { id: v1.id, expectedVersion: 1, package: revised }, signal)
  assert.deepEqual(f.modes.list(scope).activation.mode, v1, 'editing is never implicit activation')
  const preview = await f.modes.preview(scope, v2, signal)
  await rejects(() => f.modes.rollback(scope, approval(preview), signal), 'mode-not-approved')
  await f.modes.approve(scope, approval(preview), signal)
  assert.equal(f.modes.list(scope).activation.mode.version, 2)
  const updated = await f.records.update(scope, { id: record.id, expectedRevision: 1, content: { ...content(), notes: '新讨论，不改旧模式' } }, signal)
  assert.deepEqual(updated.mode, v1)
  await rejects(() => f.records.create(scope, { mode: v1, content: content() }, signal), 'mode-not-active')
  await rejects(() => f.records.update(scope, { id: record.id, expectedRevision: 2, mode: reference(v2), content: content() }, signal), 'workflow-arguments-invalid')
  const rollback = await f.modes.preview(scope, v1, signal)
  await f.modes.rollback(scope, approval(rollback), signal)
  assert.deepEqual(f.modes.list(scope).activation.mode, v1)
  assert.deepEqual(f.records.get(scope, record.id).mode, v1)
  await f.close()
})

test('same templates do not merge business workspaces, sessions, generations or nodes', async () => {
  const f = await fixture(), ref = await f.activate()
  const one = await f.records.create(scope, { mode: ref, content: content() }, signal)
  const two = await f.records.create(scope, { mode: ref, content: content() }, signal)
  assert.notEqual(one.id, two.id, 'same display name is not a join key')
  for (const at of [other, nextGeneration]) {
    assert.deepEqual(f.records.list(at).records, [])
    assert.throws(() => f.records.get(at, one.id), { code: 'workflow-record-unavailable' })
    await rejects(() => f.records.update(at, { id: one.id, expectedRevision: 1, content: content() }, signal), 'workflow-record-unavailable')
    await rejects(() => f.records.create(at, { mode: ref, content: content() }, signal), 'mode-not-active')
    const preview = await f.modes.preview(at, ref, signal)
    await f.modes.approve(at, approval(preview), signal)
    const separate = await f.records.create(at, { mode: ref, content: content() }, signal)
    assert.notEqual(separate.id, one.id)
    assert.equal(f.records.list(at).records.length, 1)
  }
  assert.equal(f.records.list(scope).records.length, 2)
  assert.throws(() => f.records.list({ ...scope, nodeId: 'node_desktop' }), { code: 'workflow-scope-invalid' })
  await f.close()
})

test('onboarding supports multi-turn partial answers without verified-identity claims', async () => {
  const f = await fixture(), ref = await f.activate()
  const made = await f.records.create(scope, { mode: ref, content: { ...content(), onboardingAnswers: { project: '甲班/项目甲' } } }, signal)
  const found = f.records.get(scope, made.id)
  assert.equal(found.onboarding.status, 'self-reported')
  assert.deepEqual(found.onboarding.pendingQuestions.map(x => x.field.key), ['stage'])
  assert.match(found.onboarding.meaning, /不证明微信身份/)
  for (const answers of [{ unknown: 'x' }, { project: 42 }, { stage: '未定义' }]) {
    await rejects(() => f.records.update(scope, { id: made.id, expectedRevision: 1, content: { ...content(), onboardingAnswers: answers } }, signal), 'mode-values-invalid')
  }
  const updated = await f.records.update(scope, { id: made.id, expectedRevision: 1, content: { ...found.content, onboardingAnswers: { project: '甲班/项目甲', stage: '执行' } } }, signal)
  assert.equal(updated.revision, 2)
  assert.deepEqual(f.records.get(scope, made.id).onboarding.pendingQuestions, [])
  await f.close()
})

test('workflow CAS serializes concurrent writers and analyses cannot overwrite facts', async () => {
  const facts = [{ kind: 'task', id: 'task_approved', version: 4 }], before = structuredClone(facts)
  const f = await fixture({ availability: { 'task.query': { status: 'available' } }, validateReferences(at, refs) {
    assert.deepEqual(at, scope)
    for (const ref of refs) if (!facts.some(x => JSON.stringify(x) === JSON.stringify(ref))) throw Object.assign(new Error('denied reference'), { code: 'reference-denied' })
  } })
  const ref = await f.activate(), record = await f.records.create(scope, { mode: ref, content: content() }, signal)
  const analysis = { ...content(), analyses: [{ id: 'analysis_1', summary: '我观察到的进展，不修改任务事实', references: facts, result: { summary: '跟进中' } }] }
  const outcomes = await Promise.allSettled(['一', '二'].map(notes => f.records.update(scope, { id: record.id, expectedRevision: 1, content: { ...analysis, notes } }, signal)))
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal(outcomes.find(x => x.status === 'rejected').reason.code, 'workflow-version-conflict')
  assert.equal(f.records.get(scope, record.id).authority, 'agent-notes')
  assert.deepEqual(facts, before)
  const bad = structuredClone(analysis); bad.analyses[0].references[0].version = 999
  await rejects(() => f.records.update(scope, { id: record.id, expectedRevision: 2, content: bad }, signal), 'reference-denied')
  await rejects(() => f.records.update(scope, { id: record.id, expectedRevision: 2, content: { ...content(), participantStatus: 'done' } }, signal), 'workflow-content-invalid')
  bad.analyses[0].references = []; bad.analyses[0].result = { summary: 'x', hidden: 'cannot publish' }
  await rejects(() => f.records.update(scope, { id: record.id, expectedRevision: 2, content: bad }, signal), 'mode-values-invalid')
  await f.close()
})

test('missing fact authorization and unimplemented submissions fail closed', async () => {
  const f = await fixture(), ref = await f.activate()
  const value = { ...content(), analyses: [{ id: 'a', summary: 'reading', references: [{ kind: 'task', id: 'task_x', version: 1 }] }] }
  await rejects(() => f.records.create(scope, { mode: ref, content: value }, signal), 'workflow-reference-unavailable')
  await f.close()
  const g = await fixture({ validateReferences() { assert.fail('unimplemented attachments must not reach validator') } }), next = await g.activate()
  value.analyses[0].references[0].kind = 'submission'
  await rejects(() => g.records.create(scope, { mode: next, content: value }, signal), 'workflow-reference-unavailable')
  await g.close()
})

test('actual atomic files recover exact versions/partial answers and isolate Web/Desktop profiles', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'human-workflow-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const paths = ['web', 'desktop'].map(profile => ({ modeStore: new WorkflowFileStore(path.join(directory, profile, 'modes-v1.json')),
    recordStore: new WorkflowFileStore(path.join(directory, profile, 'records-v1.json')) }))
  const web = await fixture(paths[0]), desktop = await fixture(paths[1]), ref = await web.activate()
  const record = await web.records.create(scope, { mode: ref, content: { ...content(), onboardingAnswers: { project: '仅Web资料' } } }, signal)
  assert.equal(desktop.modes.list(scope).modes.length, 0)
  await web.close(); await desktop.close()
  const restarted = await fixture(paths[0])
  assert.deepEqual(restarted.modes.list(scope).activation.mode, ref)
  assert.equal(restarted.records.get(scope, record.id).content.onboardingAnswers.project, '仅Web资料')
  assert.deepEqual(restarted.records.list(other).records, [])
  assert.equal(restarted.records.get(scope, record.id).onboarding.pendingQuestions.length, 1)
  await rejects(() => ModeRegistry.open(paths[0].modeStore, { nodeId: 'node_other', capabilities: () => createCapabilityManifest('node_other'), randomId: ids() }), 'mode-store-invalid')
  await restarted.close()
  const file = path.join(directory, 'desktop', 'modes-v1.json')
  await paths[1].modeStore.save({ invalid: true })
  await writeFile(file, '{corrupt')
  await assert.rejects(fixture(paths[1]))
  assert.equal(await readFile(file, 'utf8'), '{corrupt', 'corrupt state never resets or overwrites itself')
})

test('recovery rejects digest/schema corruption and reordered duplicate activation scopes', async () => {
  const f = await fixture(), ref = await f.activate()
  await f.records.create(scope, { mode: ref, content: content() }, signal)
  const validModes = f.modeStore.value, validRecords = f.recordStore.value
  await f.close()
  const reopen = modeStore => ModeRegistry.open(modeStore, { nodeId: scope.nodeId, capabilities: () => createCapabilityManifest(scope.nodeId), randomId: ids() })
  const changed = structuredClone(validModes); changed.modes[0].versions[0].package.goal = 'tampered'
  await rejects(() => reopen(memory(changed)), 'mode-store-invalid')
  const duplicate = structuredClone(validModes); duplicate.activations.push({ ...duplicate.activations[0], scope: Object.fromEntries(Object.entries(scope).reverse()) })
  await rejects(() => reopen(memory(duplicate)), 'mode-store-invalid')
  const modes = await reopen(memory(validModes))
  for (const mutate of [v => { v.records[0].mode.digest = 'f'.repeat(64) }, v => { v.records[0].content.onboardingAnswers = { unknown: 'x' } },
    v => { v.records[0].content.analyses = [{ id: 'a', summary: 'x', references: [], result: { unknown: 1 } }] }]) {
    const value = structuredClone(validRecords); mutate(value)
    await rejects(() => WorkflowRecords.open(memory(value), { nodeId: scope.nodeId, modes, randomId: ids() }), 'workflow-store-invalid')
  }
  await modes.close()
})

test('closing drains in-flight durable writes, rejects caller success, and rejects queued writes', async () => {
  let release, started
  const began = new Promise(resolve => { started = resolve }), gate = new Promise(resolve => { release = resolve })
  const store = memory({ revision: 0 })
  const queue = new StateQueue({ load: store.load, async save(value) { started(); await gate; await store.save(value) } }, { revision: 0 })
  const first = queue.update(next => ++next.revision, signal), second = queue.update(next => ++next.revision, signal)
  const failedFirst = rejects(() => first, 'workflow-disabled'), failedSecond = rejects(() => second, 'workflow-disabled')
  await began
  let drained = false; const close = queue.close().then(() => { drained = true })
  await Promise.resolve(); assert.equal(drained, false)
  assert.throws(() => queue.current(), { code: 'workflow-disabled' })
  release(); await close; await failedFirst; await failedSecond
  assert.deepEqual(store.value, { revision: 1 }); assert.equal(store.writes, 1)
  const restored = new StateQueue(store, await store.load())
  assert.equal(restored.current().revision, 1, 'new owner opens only after durable drain')
  await restored.close()
})

test('cancellation does not expose an unsaved workflow and write failure disables later work', async () => {
  const f = await fixture(), ref = await f.activate(), controller = new AbortController(); controller.abort()
  await assert.rejects(f.records.create(scope, { mode: ref, content: content() }, controller.signal), { name: 'AbortError' })
  assert.equal(f.recordStore.writes, 0)
  await f.close()
  const queue = new StateQueue({ load: async () => ({}), save: async () => { throw new Error('disk full') } }, {})
  await assert.rejects(queue.update(next => { next.saved = true }, signal), /disk full/)
  assert.throws(() => queue.current(), { code: 'workflow-disabled' })
  await rejects(() => queue.update(() => 'no', signal), 'workflow-disabled')
  await queue.close()
})

function sdk(mode = 'native') {
  const ctx = new Context()
  new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode }), sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } })
  const agent = { id: session.id, session, ctx, status: 'idle', send() { assert.fail('workflow must never wake an Agent') } }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined })
  ctx.on('session/flush', async () => {})
  return { ctx, tools, session, agent }
}
async function adapterFixture(host) {
  const f = await fixture(), store = memory({ schemaVersion: 1, records: [] }), core = await HumanToolsCore.open(store, ids())
  const options = { nodeId: scope.nodeId, modes: f.modes, records: f.records, capabilities: f.capabilities,
    prepareCard: ({ scope: at, callId, rootCallId, title, body, sourceSurfaceId }, abort) => core.create({ scope: at.sessionId,
      generation: at.sessionGeneration, callId, rootCallId }, title, body, abort, sourceSurfaceId) }
  const definitions = humanWorkflowTools(options)
  definitions.forEach(definition => host.tools.register(definition))
  return { ...f, core, store, options, definitions }
}
test('official native ToolRuntime accepts schemas and executes real mode/workflow/card tools without Agent approval', async t => {
  const host = sdk(), f = await adapterFixture(host)
  t.after(async () => { await f.close(); await f.core.close(); await host.ctx.fiber.dispose() })
  for (const schema of [MODE_FIELD_SCHEMA, MODE_PACKAGE_SCHEMA, WORKFLOW_CONTENT_SCHEMA]) assertSupportedJsonSchema(schema)
  for (const definition of f.definitions) { assertSupportedJsonSchema(definition.parameters); assertSupportedJsonSchema(definition.output.schema) }
  assert(!f.definitions.some(x => /approve|activate|rollback/.test(x.name)))
  let calls = 0
  async function run(name, args = {}) {
    const result = await host.tools.execute({ name, arguments: args, callId: `call_${++calls}`, agent: host.agent, signal })
    assert.equal(result.isError, false, JSON.stringify(result))
    return JSON.parse(result.content[0].text)
  }
  assert.equal((await run('human_capabilities')).schema, 'human.capabilities.v1')
  const drafted = await run('human_mode_draft', { package: modePackage() })
  assert.equal((await run('human_mode_list')).activation.mode, null)
  assert.equal((await run('human_mode_get', { id: drafted.id, version: 1 })).digest, drafted.digest)
  const agentPreview = await run('human_mode_preview', { id: drafted.id, version: 1 })
  assert.equal(agentPreview.ownerApprovalRequired, true); assert.equal(agentPreview.previewId, undefined)
  const preview = await f.modes.preview(scope, drafted, signal); await f.modes.approve(scope, approval(preview), signal)
  const made = await run('human_workflow_save', { mode: reference(drafted), content: content() })
  assert.equal((await run('human_workflow_get', { id: made.id })).revision, 1)
  assert.equal((await run('human_workflow_list')).records.length, 1)
  const prepared = await host.tools.execute({ name: 'human_mode_prepare_card', arguments: { ...reference(drafted), values: { title: '真实结构卡', body: '请确认' } },
    callId: 'card_root', agent: host.agent, signal })
  assert.equal(prepared.isError, false, JSON.stringify(prepared)); assert(humanSurface(prepared.meta?.humanSurface))
  assert.match(prepared.content[0].text, /沿用当前职业身份/)
  assert.match(prepared.content[0].text, /现在尚未发送/)
  assert(!prepared.content[0].text.startsWith('群卡'))
  assert.equal(f.core.forResult(scope.sessionId, 'card_root').title, '真实结构卡')
  const bad = await host.tools.execute({ name: 'human_mode_prepare_card', arguments: { ...reference(drafted), values: { title: 'bad', body: 'x', script: 'execute' } },
    callId: 'bad_card', agent: host.agent, signal })
  assert.equal(bad.isError, true); assert.equal(f.core.forResult(scope.sessionId, 'bad_card'), undefined)
})

test('Code Mode uses actual subdispatch/root identities and durable native card projection', async t => {
  const host = sdk('code'), f = await adapterFixture(host), ref = await f.activate()
  t.after(async () => { await f.close(); await f.core.close(); await host.ctx.fiber.dispose() })
  host.ctx.provide('codeRuntime', { language: 'typescript', isolation: 'test-fixture', async run(request) {
    const prepare = request.bindings[0].functions.human_mode_prepare_card
    const first = await prepare({ ...ref, values: { title: 'Code真实群卡', body: '等待主人批准' } })
    const repeated = await prepare({ ...ref, values: { title: '不能覆盖首卡', body: '再次尝试' } })
    assert.deepEqual(first, repeated)
    return { value: first, logs: [] }
  } })
  const result = await host.tools.execute({ name: 'run_code', arguments: { code: 'controlled dispatch fixture', description: 'structured mode card' },
    callId: 'code_root', agent: host.agent, signal })
  assert.equal(result.isError, false, JSON.stringify(result)); assert.equal(result.meta, undefined)
  assert.equal(host.session.events.filter(event => event.type === 'tool/code-dispatch').length, 2)
  await f.core.close()
  const restored = await HumanToolsCore.open(f.store, ids())
  assert.equal(restored.forResult(scope.sessionId, 'code_root').title, 'Code真实群卡')
  assert.equal(restored.forResult(scope.sessionId, 'code_root:code:1'), undefined)
  await restored.close()
})

test('dynamic context uses only current confirmed Agent scope and does not mutate session/inbox', async t => {
  const host = sdk(), f = await adapterFixture(host), ref = await f.activate()
  t.after(async () => { await f.close(); await f.core.close(); await host.ctx.fiber.dispose() })
  await f.records.create(scope, { mode: ref, content: content() }, signal)
  const before = structuredClone(host.session.events), remove = registerHumanWorkflowContext(host.ctx, f.options)
  const prompt = host.ctx.get('systemPrompt')
  const sections = async context => renderContextSections(await prompt.assemble(context)).filter(x => x.name === 'harness-remote.human-workflow')
  const found = await sections({ agent: host.agent, scope: host.agent })
  assert.equal(found.length, 1); assert.match(found[0].text, /不是 DSH 职业 preset/)
  assert.match(found[0].text, /原生工作区文件仍按 DSH 规则共享/)
  assert.match(found[0].text, /不替换当前职业身份，也不强迫其他任务沿用它/)
  assert.match(found[0].text, /不是必须问完的清单，已有答案不重复问，无关问题不问/)
  assert.deepEqual(host.session.events, before)
  assert.deepEqual(await sections({ agent: host.agent, scope: {} }), [])
  const wrong = { ...host.agent, session: { ...host.session, header: { ...host.session.header, createdAt: 200 } } }
  assert.deepEqual(await sections({ agent: wrong, scope: wrong }), [])
  remove(); assert.deepEqual(await sections({ agent: host.agent, scope: host.agent }), [])
})
