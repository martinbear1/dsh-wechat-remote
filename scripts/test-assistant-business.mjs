import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { AssistantBusinessRecords } from '../lib/assistant-presets/business.js'
import { assistantGuidance } from '../lib/assistant-presets/definition.js'
import { ASSISTANT_TOOL_RECOVERY_GUIDANCE } from '../lib/assistant-presets/interaction-guidance.js'
import { assistantTools, nativeComposedPreset, registerAssistantContext, ASSISTANT_DEFINITION_SCHEMA, ASSISTANT_BUSINESS_SCHEMA } from '../lib/assistant-presets/tools.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_web', sessionId: 'session_a', sessionGeneration: '100' }
const contents = () => ({ title: '甲班工作', answers: { teacher_role: '五年级语文教师' }, memory: '用户提供：本周整理阅读计划；分析：先核对当前任务。' })
const reference = entry => ({ id: entry.id, version: entry.version, digest: entry.digest })
const rejects = (body, code) => assert.rejects(async () => body(), error => error?.code === code)
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function memory(initial) {
  let value = structuredClone(initial), writes = 0, gate
  return { load: async () => structuredClone(value), async save(next) {
    const block = gate; gate = undefined
    if (block) { block.entered.resolve(); await block.release.promise }
    value = structuredClone(next); writes++
  }, holdNext() { gate = { entered: deferred(), release: deferred() }; return gate },
  get value() { return structuredClone(value) }, get writes() { return writes } }
}
async function fixture({ recordStore = memory(), templateStore = memory() } = {}) {
  let valid = true, n = 0, installs = 0, verification = 'installed'
  const assertIdentity = () => { if (!valid) throw Object.assign(new Error('node changed'), { code: 'node-changed' }) }
  const native = { async probe() { return { supported: true, basePresets: [{ id: 'standard', name: 'Standard' }] } },
    async preview({ presetId, definition }) {
      const rowId = `harness-assistant-${presetId}`, bundleName = `@harness-remote-assistants/${presetId}`
      const patch = JSON.stringify([{ insert: [{ name: '@deepseek-ai/dsh-agent-preset', id: rowId,
        config: { id: presetId, name: definition.name, description: definition.description,
          plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
            prefix: `secret-native-plan\n\n${assistantGuidance(definition)}`, suffix: 'native safety', complete: false, includeRuntimeContext: true } }] } }] }])
      return { schema: 'assistant.native.preview.v1', presetId, basePreset: definition.basePreset,
        bundleName, rowId, definition, baseDigest: 'a'.repeat(64), patchDigest: createHash('sha256').update(patch).digest('hex'),
        patch, profileFingerprint: 'c'.repeat(64), defaultPreset: 'standard', warnings: [] }
    },
    async install(plan) { installs++; return { presetId: plan.presetId, state: 'installed' } },
    async verify(plan) { return { presetId: plan.presetId, state: verification } }, async close() {} }
  const registry = await AssistantRegistry.open(templateStore, { nodeId: scope.nodeId, native, assertIdentity, now: () => 1000 })
  const businessOptions = { nodeId: scope.nodeId, registry, assertIdentity, now: () => 1000, randomId: () => String(++n).padStart(32, '0') }
  const business = await AssistantBusinessRecords.open(recordStore, businessOptions)
  const install = async templateId => {
    const draft = await registry.draft({ templateId }, signal), preview = await registry.preview(reference(draft), signal)
    const result = await registry.install({ ...reference(draft), previewId: preview.previewId }, signal)
    return { draft, presetId: result.presetId }
  }
  const installed = await install('teacher')
  return { registry, business, businessOptions, recordStore, templateStore, assertIdentity, install, ...installed,
    get installs() { return installs }, set valid(value) { valid = value }, set verification(value) { verification = value },
    async close() { await business.close(); await registry.close() } }
}
function sdk() {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } })
  const agent = { id: session.id, session, ctx, status: 'idle', send() { assert.fail('no Agent wake') } }
  let actual = agent, preset
  ctx.provide('agents', { get: id => id === actual?.id ? actual : undefined })
  ctx.provide('agentPresets', { composedPreset(at) { assert.equal(at, agent.ctx); return preset } })
  ctx.on('session/flush', async () => {})
  return { ctx, tools, session, agent, set actual(value) { actual = value }, set preset(value) { preset = value } }
}
async function toolsFixture(t, options) {
  const f = await fixture(options), host = sdk(); host.preset = f.presetId
  const settings = { nodeId: scope.nodeId, registry: f.registry, business: f.business, assertIdentity: f.assertIdentity,
    composedPreset: agent => nativeComposedPreset(host.ctx, agent) }
  const definitions = assistantTools(settings)
  definitions.forEach(definition => host.tools.register(definition))
  t.after(async () => { await f.close(); await host.ctx.fiber.dispose() })
  let calls = 0
  const run = (name, args = {}, abort = signal, agent = host.agent) => host.tools.execute({ name, arguments: args,
    callId: `assistant_${++calls}`, agent, signal: abort })
  const direct = (name, input = {}, abort = signal) => definitions.find(item => item.name === name).execute(input,
    { agent: host.agent, signal: abort, callId: `direct_${++calls}` })
  return { ...f, host, settings, definitions, run, direct, original: f }
}

test('business is one idempotent instance per real scope; answers are separate from reusable template', async t => {
  const f = await fixture(); t.after(() => f.close())
  const template = f.registry.get(reference(f.draft)), one = await f.business.start(scope, f.presetId, signal)
  assert.deepEqual(await f.business.start(scope, f.presetId, signal), one)
  assert.equal(one.authority, 'local-business-notes'); assert.deepEqual(one.content.answers, {})
  const saved = await f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal)
  assert.equal(saved.revision, 2)
  const found = f.business.get(scope, f.presetId)
  assert.equal(found.onboarding.status, 'self-reported')
  assert.deepEqual(found.onboarding.pendingQuestions.map(q => q.key), ['class_context', 'work_preferences'])
  found.content.answers.teacher_role = 'cannot mutate original'
  assert.equal(f.business.get(scope, f.presetId).content.answers.teacher_role, '五年级语文教师')
  assert.deepEqual(f.registry.get(reference(f.draft)), template)
  assert.equal(JSON.stringify(template).includes('五年级语文教师'), false)
})

test('same preset never shares memory between sessions or generations and cannot adopt another preset', async t => {
  const f = await fixture(); t.after(() => f.close())
  const initial = await f.business.start(scope, f.presetId, signal)
  await f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal)
  for (const at of [{ ...scope, sessionId: 'session_b' }, { ...scope, sessionGeneration: '200' }]) {
    assert.throws(() => f.business.get(at, f.presetId), { code: 'assistant-business-not-started' })
    const separate = await f.business.start(at, f.presetId, signal)
    assert.notEqual(separate.id, initial.id); assert.deepEqual(separate.content.answers, {})
  }
  await rejects(() => f.business.start({ ...scope, nodeId: 'other_node' }, f.presetId, signal), 'workflow-scope-invalid')
  await rejects(() => f.business.start(scope, 'uninstalled', signal), 'assistant-business-preset-unavailable')
  const another = await f.install('project')
  await rejects(() => f.business.start(scope, another.presetId, signal), 'assistant-business-preset-mismatch')
  assert.throws(() => f.business.get(scope, another.presetId), { code: 'assistant-business-preset-mismatch' })
})

test('CAS serializes concurrent edits and strict content rejects arbitrary facts, keys, and excess data', async t => {
  const f = await fixture(); t.after(() => f.close()); await f.business.start(scope, f.presetId, signal)
  const results = await Promise.allSettled([1, 2].map(n => f.business.save(scope, f.presetId,
    { expectedRevision: 1, content: { ...contents(), memory: `revision ${n}` } }, signal)))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'assistant-business-conflict')
  const writes = f.recordStore.writes
  for (const value of [{ ...contents(), ownerSubject: 'forged' }, { ...contents(), answers: { memberid: 'fake' } },
    { ...contents(), title: 'x'.repeat(81) }, { ...contents(), memory: 'x'.repeat(8001) },
    { ...contents(), answers: { teacher_role: '' } }, { ...contents(), answers: { teacher_role: 'x'.repeat(1001) } },
    { ...contents(), answers: JSON.parse('{"__proto__":"bad"}') }]) {
    await rejects(() => f.business.save(scope, f.presetId, { expectedRevision: 2, content: value }, signal), 'assistant-business-content-invalid')
  }
  await rejects(() => f.business.save(scope, f.presetId, { expectedRevision: 2, content: contents(), scope }, signal), 'assistant-business-save-invalid')
  assert.equal(f.recordStore.writes, writes); assert.equal(f.business.get(scope, f.presetId).revision, 2)
})

test('cold reload preserves instances; malformed or foreign ledger is rejected without writes', async t => {
  const f = await fixture(); t.after(() => f.close())
  await f.business.start(scope, f.presetId, signal)
  await f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal)
  const persisted = f.recordStore.value
  await f.business.close()
  const restored = await AssistantBusinessRecords.open(f.recordStore, f.businessOptions)
  assert.equal(restored.get(scope, f.presetId).revision, 2); await restored.close()
  for (const mutate of [value => { value.nodeId = 'foreign' }, value => { value.records.push(value.records[0]) },
    value => { value.records[0].assistant.digest = '0'.repeat(64) }, value => { value.records[0].content.answers.hidden = 'secret' },
    value => { value.records[0].presetId = 'other' }, value => { value.records[0].scope.hidden = 'foreign' }]) {
    const corrupted = structuredClone(persisted); mutate(corrupted); const store = memory(corrupted)
    await rejects(() => AssistantBusinessRecords.open(store, f.businessOptions), 'assistant-business-store-invalid')
    assert.equal(store.writes, 0); assert.deepEqual(store.value, corrupted)
  }
})

test('current confirmed installation is required for every read or write; withdrawal does not erase memory', async t => {
  const f = await fixture(); t.after(() => f.close()); await f.business.start(scope, f.presetId, signal)
  f.verification = 'unknown'; await f.registry.status(reference(f.draft), signal)
  assert.throws(() => f.business.get(scope, f.presetId), { code: 'assistant-business-preset-unavailable' })
  await rejects(() => f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal), 'assistant-business-preset-unavailable')
  f.verification = 'installed'; await f.registry.status(reference(f.draft), signal)
  assert.equal(f.business.get(scope, f.presetId).revision, 1)
  f.valid = false
  assert.throws(() => f.business.get(scope, f.presetId), { code: 'node-changed' })
})

test('official ToolRuntime accepts schemas, projects no native plans, and exposes no install or approval tool', async t => {
  const f = await toolsFixture(t)
  for (const schema of [ASSISTANT_DEFINITION_SCHEMA, ASSISTANT_BUSINESS_SCHEMA]) assertSupportedJsonSchema(schema)
  for (const definition of f.definitions) { assertSupportedJsonSchema(definition.parameters); assertSupportedJsonSchema(definition.output.schema) }
  assert.equal(f.definitions.length, 6); assert(!f.definitions.some(item => /install|approve|activate/.test(item.name)))
  const parsed = async (name, input) => { const result = await f.run(name, input); assert.equal(result.isError, false, JSON.stringify(result)); return JSON.parse(result.content[0].text) }
  assert.equal((await parsed('human_assistant_catalog')).schema, 'human.assistants.catalog.v1')
  const get = await parsed('human_assistant_get', { id: f.draft.id, version: f.draft.version })
  assert.equal(get.presetId, f.presetId); assert(!JSON.stringify(get).includes('secret-'))
  assert.equal((await parsed('human_assistant_draft', { templateId: 'general' })).state, 'draft')
  assert.equal((await parsed('human_assistant_work_start')).revision, 1)
  assert.equal((await parsed('human_assistant_work_save', { expectedRevision: 1, content: contents() })).revision, 2)
  assert.equal((await parsed('human_assistant_work_get')).content.title, '甲班工作')
  for (const input of [{ scope }, { presetId: f.presetId }, { instanceId: 'other' }]) assert.equal((await f.run('human_assistant_work_get', input)).isError, true)
  assert.equal(f.original.installs, 1, 'all Agent calls were definition/data operations only')
})

test('misplaced work-save fields report their nested paths through the native runtime and never overwrite real memory', async t => {
  const f = await toolsFixture(t)
  await f.direct('human_assistant_work_start')
  await f.direct('human_assistant_work_save', { expectedRevision: 1, content: contents() })
  const before = f.recordStore.value, writes = f.recordStore.writes
  // Reproduce the actual shape error, using only synthetic content. No coercion
  // or retry-with-a-test-memory is permitted to make this invalid call succeed.
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await f.run('human_assistant_work_save', { expectedRevision: 2, title: 'PRIVATE_VALUE_NOT_FOR_ERRORS', content: contents() })
    assert.equal(result.isError, true)
    const text = result.content.map(item => item.text || '').join('\n')
    assert.match(text, /arguments\.title/)
    assert.match(text, /应放在 content\.title/)
    assert(!text.includes('PRIVATE_VALUE_NOT_FOR_ERRORS'))
    assert.deepEqual(f.recordStore.value, before)
  }
  for (const key of ['answers', 'memory']) {
    await assert.rejects(f.direct('human_assistant_work_save', { expectedRevision: 2, content: contents(), [key]: 'do not echo' }),
      error => error.code === 'assistant-arguments-invalid' && error.message.includes(`content.${key}`) && !error.message.includes('do not echo'))
  }
  assert.equal(f.recordStore.writes, writes)
  const result = await f.direct('human_assistant_work_save', { expectedRevision: 2,
    content: { ...before.records[0].content, memory: before.records[0].content.memory + '\n用户补充：按周汇总。' } })
  assert.equal(result.revision, 3)
  assert.deepEqual(result.content.answers, contents().answers)
  assert(result.content.memory.startsWith(contents().memory))
})

test('work-save validation names missing, invalid and unsupported field paths with no value leakage or persistence', async t => {
  const f = await toolsFixture(t); await f.direct('human_assistant_work_start')
  const before = f.recordStore.value, writes = f.recordStore.writes
  const cases = [
    [null, 'arguments'],
    [{ expectedRevision: 1 }, 'arguments.content'],
    [{ expectedRevision: '1', content: contents() }, 'expectedRevision'],
    [{ expectedRevision: 0, content: contents() }, 'expectedRevision'],
    [{ expectedRevision: 1, content: [] }, 'content'],
    [{ expectedRevision: 1, content: { answers: {}, memory: '' } }, 'content.title'],
    [{ expectedRevision: 1, content: { ...contents(), title: ' ' } }, 'content.title'],
    [{ expectedRevision: 1, content: { ...contents(), title: 'x'.repeat(81) } }, 'content.title'],
    [{ expectedRevision: 1, content: { ...contents(), memory: {} } }, 'content.memory'],
    [{ expectedRevision: 1, content: { ...contents(), answers: [] } }, 'content.answers'],
    [{ expectedRevision: 1, content: { ...contents(), answers: { unknown_key: 'PRIVATE_VALUE_NOT_FOR_ERRORS' } } }, 'content.answers.unknown_key'],
    [{ expectedRevision: 1, content: { ...contents(), answers: { teacher_role: '' } } }, 'content.answers.teacher_role'],
    [{ expectedRevision: 1, content: { ...contents(), answers: { teacher_role: 'x'.repeat(1001) } } }, 'content.answers.teacher_role'],
    [{ expectedRevision: 1, content: { ...contents(), participantRef: 'PRIVATE_VALUE_NOT_FOR_ERRORS' } }, 'content.participantRef'],
  ]
  for (const [input, path] of cases) {
    const result = await f.run('human_assistant_work_save', input)
    assert.equal(result.isError, true, JSON.stringify(input))
    const text = result.content.map(item => item.text || '').join('\n')
    assert(text.includes(path), text)
    assert(!text.includes('PRIVATE_VALUE_NOT_FOR_ERRORS'))
    assert.deepEqual(f.recordStore.value, before)
  }
  // Unknown field names cannot introduce multiline diagnostics or unbounded output.
  const odd = await f.run('human_assistant_work_save', { expectedRevision: 1, content: contents(), ['bad\n' + 'x'.repeat(1000)]: 'private' })
  const oddText = odd.content.map(item => item.text || '').join('\n')
  assert(!oddText.includes('bad\n')); assert(oddText.length < 1000)
  assert.equal(f.recordStore.writes, writes)
})

test('native composed-preset helper consults the actual scope API, never headers; forged Agent is denied', async t => {
  const host = sdk(); t.after(() => host.ctx.fiber.dispose())
  host.agent.session = { id: host.session.id, header: { ...host.session.header, agentPreset: 'header-is-not-current' } }
  assert.equal(nativeComposedPreset(host.ctx, host.agent), undefined)
  host.preset = 'composed-live'; assert.equal(nativeComposedPreset(host.ctx, host.agent), 'composed-live')
  assert.throws(() => nativeComposedPreset(host.ctx, { ...host.agent }), { code: 'assistant-scope-invalid' })
  host.actual = undefined
  assert.throws(() => nativeComposedPreset(host.ctx, host.agent), { code: 'assistant-scope-invalid' })
})

test('fixed context is exact-agent scoped, never embeds private answers and does not write or wake a session', async t => {
  const f = await toolsFixture(t), remove = registerAssistantContext(f.host.ctx, f.settings)
  t.after(remove)
  const prompt = f.host.ctx.get('systemPrompt')
  const sections = async assembly => renderContextSections(await prompt.assemble(assembly)).filter(item => item.name === 'harness-remote.assistant-business')
  const before = structuredClone(f.host.session.events)
  assert.match((await sections({ agent: f.host.agent, scope: f.host.agent }))[0].text, /work_start/)
  await f.business.start(scope, f.presetId, signal)
  await f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal)
  const text = (await sections({ agent: f.host.agent, scope: f.host.agent }))[0].text
  assert.match(text, /revision 2/); assert.match(text, /work_get/)
  assert(text.includes(ASSISTANT_TOOL_RECOVERY_GUIDANCE), 'current tool recovery methods reach an already installed assistant without replacing its signed persona')
  for (const secret of ['五年级语文教师', '甲班工作', '本周整理阅读计划']) assert.equal(text.includes(secret), false)
  assert.deepEqual(await sections({ agent: f.host.agent, scope: {} }), [])
  const forged = { ...f.host.agent }; assert.deepEqual(await sections({ agent: forged, scope: forged }), [])
  assert.deepEqual(f.host.session.events, before)
  remove(); assert.deepEqual(await sections({ agent: f.host.agent, scope: f.host.agent }), [])
})

test('live tool-recovery methods are inherited by new profession and designer instances, not one repaired test Agent', async t => {
  const f = await toolsFixture(t), remove = registerAssistantContext(f.host.ctx, f.settings)
  t.after(remove)
  const prompt = f.host.ctx.get('systemPrompt'), beforeEvents = structuredClone(f.host.session.events)
  for (const template of ['teacher', 'project', 'sales', 'general', 'designer']) {
    const { presetId } = template === 'teacher' ? f : await f.install(template)
    f.host.preset = presetId
    const section = renderContextSections(await prompt.assemble({ agent: f.host.agent, scope: f.host.agent }))
      .find(item => item.name === 'harness-remote.assistant-business')
    assert(section, template)
    assert(section.text.includes(ASSISTANT_TOOL_RECOVERY_GUIDANCE), template)
    assert.equal(section.text.split(ASSISTANT_TOOL_RECOVERY_GUIDANCE).length - 1, 1)
  }
  assert.equal(f.recordStore.writes, 0, 'working methods do not rewrite any business instance')
  assert.deepEqual(f.host.session.events, beforeEvents, 'assembling common tool guidance does not fabricate user turns')
})

test('delayed business writes never return old data after node withdrawal, Agent replacement or preset change', async t => {
  for (const kind of ['node', 'agent', 'preset', 'generation']) {
    const f = await toolsFixture(t); await f.direct('human_assistant_work_start')
    const blocked = f.recordStore.holdNext(), pending = f.direct('human_assistant_work_save', { expectedRevision: 1, content: contents() })
    await blocked.entered.promise
    if (kind === 'node') f.original.valid = false
    if (kind === 'agent') f.host.actual = { ...f.host.agent }
    if (kind === 'preset') f.host.preset = 'different-live-preset'
    if (kind === 'generation') f.host.agent.session = { id: f.host.session.id, header: { ...f.host.session.header, createdAt: 200 } }
    blocked.release.resolve()
    await assert.rejects(pending, error => ['node-changed', 'assistant-scope-invalid', 'assistant-scope-changed'].includes(error?.code))
    assert.equal(f.recordStore.value.records[0].revision, 2, 'completed write is accounted for, never falsely rolled back')
    assert.deepEqual(f.recordStore.value.records[0].scope, scope)
  }
})

test('delayed draft and start recheck node identity before returning persisted data', async t => {
  for (const name of ['human_assistant_draft', 'human_assistant_work_start']) {
    const f = await toolsFixture(t), store = name === 'human_assistant_draft' ? f.templateStore : f.recordStore
    const blocked = store.holdNext(), pending = f.direct(name, name === 'human_assistant_draft' ? { templateId: 'project' } : {})
    await blocked.entered.promise; f.original.valid = false; blocked.release.resolve()
    await rejects(() => pending, 'node-changed')
  }
})

test('cancellation during an atomic save returns no success; recovery sees the committed revision', async t => {
  const f = await toolsFixture(t); await f.direct('human_assistant_work_start')
  const control = new AbortController(), blocked = f.recordStore.holdNext()
  const pending = f.direct('human_assistant_work_save', { expectedRevision: 1, content: contents() }, control.signal)
  await blocked.entered.promise; control.abort(); blocked.release.resolve()
  await assert.rejects(pending, error => error?.name === 'AbortError')
  assert.equal((await f.direct('human_assistant_work_get')).revision, 2)
})

test('queued saves recheck identity before writing and disk failure leaves the store fail-closed', async t => {
  const f = await fixture(); t.after(() => f.close()); await f.business.start(scope, f.presetId, signal)
  const blocked = f.recordStore.holdNext()
  const first = f.business.save(scope, f.presetId, { expectedRevision: 1, content: contents() }, signal)
  await blocked.entered.promise
  const second = f.business.save(scope, f.presetId, { expectedRevision: 2, content: contents() }, signal)
  f.valid = false; blocked.release.resolve(); await first
  await rejects(() => second, 'node-changed'); assert.equal(f.recordStore.writes, 2)
  const disk = { load: async () => undefined, save: async () => { throw new Error('disk unavailable') } }
  f.valid = true
  const broken = await AssistantBusinessRecords.open(disk, f.businessOptions); t.after(() => broken.close())
  await assert.rejects(broken.start(scope, f.presetId, signal), /disk unavailable/)
  assert.throws(() => broken.get(scope, f.presetId), { code: 'workflow-disabled' })
})
