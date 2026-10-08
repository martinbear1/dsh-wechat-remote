import test from 'node:test'
import { allowedFeatureFixture } from './feature-access-fixture.mjs'
import { FeatureAccess } from '../lib/feature-access.js'
import { setImmediate } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { builtinAssistants } from '../lib/assistant-presets/builtins.js'
import { BuiltinAssistantComponent } from '../lib/assistant-presets/builtin-component.js'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { AssistantBusinessRecords } from '../lib/assistant-presets/business.js'
import { assistantGuidance, definitionDigest } from '../lib/assistant-presets/definition.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'
import { createNativeAssistantAdapter } from '../lib/assistant-presets/native-adapter.js'

const signal = new AbortController().signal
const sha = value => createHash('sha256').update(value).digest('hex')
const memory = initial => { let value = structuredClone(initial), writes = 0; return {
  load: async () => structuredClone(value), save: async next => { value = structuredClone(next); writes++ },
  get value() { return structuredClone(value) }, get writes() { return writes },
} }
function hostFixture(options = {}) {
  const base = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
    prefix: 'You are a coding agent powered by the {{model}} model.\nKeep host policy.', suffix: 'Retain suffix.', complete: false, includeRuntimeContext: true,
  } }, { id: 'extra', name: '@deepseek-ai/dsh-tool-runtime' }]
  const registered = new Map(), cleanups = [], services = new Map(), scopes = new Map()
  services.set('wechatFeatures', options.features || allowedFeatureFixture())
  let registrations = 0
  const registry = {
    async readDocument(id) { const plugins = id === 'standard' ? base : registered.get(id)?.plugins; if (!plugins) throw Error('missing'); return { agentPreset: id, content: JSON.stringify(plugins) } },
    async register(item) { if (registered.has(item.id)) throw Error('duplicate'); registrations++; registered.set(item.id, structuredClone(item)); return async () => registered.delete(item.id) },
    async list() { return [...registered.values()].map(item => ({ id: item.id, name: item.name })) },
    async acquireScope(id) { assert(registered.has(id)); if (!scopes.has(id)) scopes.set(id, {}); return { key: scopes.get(id), async [Symbol.asyncDispose]() {} } },
  }
  services.set('agentPresets', registry); services.set('loader', { await: async () => options.wait });
  services.set('profileContext', { installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)) })
  services.set('skills', { get: async (_name, lookup) => { assert([...scopes.values()].includes(lookup.scope)); return HUMAN_WORKFLOW_SKILL } })
  services.set('tools', { get: (_name, scope) => { assert([...scopes.values()].includes(scope)); return {} } })
  return { registered, services, registry, base, get registrations() { return registrations },
    host: { get: name => services.get(name), provide: (name, value) => services.set(name, value), effect: callback => cleanups.push(callback()) },
    async close() { await Promise.all(cleanups.map(callback => callback())) },
  }
}
test('built-in components register stable native presets after loader settles; preserve host policies and dispose exactly', async t => {
  let release; const h = hostFixture({ wait: new Promise(resolve => release = resolve) }); t.after(() => h.close())
  const components = builtinAssistants().map(item => new BuiltinAssistantComponent(h.host, item.templateId))
  assert.equal(h.registrations, 0, 'component activation cannot wait on its own loader')
  release(); const statuses = await Promise.all(components.map(component => component.status()))
  assert.deepEqual(statuses.map(item => item.presetId), ['harness-teacher', 'harness-project', 'harness-customizer'])
  assert(statuses.every(item => item.state === 'installed')); assert.equal(h.registrations, 3)
  assert.deepEqual([...h.registered.values()].map(item => item.name), ['教师助理', '项目助理', '定制助手'])
  for (const item of h.registered.values()) {
    assert.match(item.plugins[0].config.prefix, /^You are an AI assistant/)
    assert.match(item.plugins[0].config.prefix, /Keep host policy\./)
    assert.match(item.plugins[0].config.prefix, /职业助手工作方法/)
    assert.equal(item.plugins[0].config.suffix, 'Retain suffix.')
    assert.deepEqual(item.plugins[1], h.base[1])
    assert.deepEqual(item.plugins.at(-1), { id: 'harness-collaboration', name: '@harness-remote/dsh-wechat-remote/collaboration' })
  }
  await h.close(); assert.equal(h.registered.size, 0)
  assert((await Promise.all(components.map(component => component.status()))).every(item => item.state === 'unknown'))
})

test('account qualification does not enable presets; explicit opt-in only mounts our entries and local pause retires them', async t => {
  const access = new FeatureAccess({ nodeId: () => 'test-node', read: async () => ({ schemaVersion:1,nodeId:'test-node',accountInstance:'account-1',checkedAt:1000,expiresAt:61000,
    features:{group_assistant:{allowed:true,reason:'allowed',validUntil:120000},clawbot:{allowed:true,reason:'allowed',validUntil:120000}} }) })
  t.after(() => access.close()); await access.refresh()
  const h = hostFixture({features:{access}}); t.after(() => h.close())
  h.registered.set('unrelated', { id:'unrelated', name:'Other plugin', plugins:h.base })
  const components = builtinAssistants().map(item => new BuiltinAssistantComponent(h.host, item.templateId))
  await Promise.all(components.map(component => component.status())); assert.equal(h.registrations,0)
  await access.setGroupEnabled(true); await setImmediate(); await setImmediate()
  assert.equal(h.registrations,3); assert.equal(h.registered.size,4)
  await access.setGroupEnabled(false); await setImmediate()
  assert.deepEqual([...h.registered.keys()],['unrelated']); assert.equal(access.groupEnabled(),false)
  await access.refresh(true); await setImmediate(); assert.equal(h.registrations,3,'qualification refresh cannot undo explicit off')
})
test('component refuses foreign duplicates and observes changed or missing composition instead of claiming success', async t => {
  const h = hostFixture(); t.after(() => h.close())
  h.registered.set('harness-teacher', { id: 'harness-teacher', name: 'foreign', plugins: h.base })
  const teacher = new BuiltinAssistantComponent(h.host, 'teacher')
  assert.equal((await teacher.status()).state, 'unknown'); assert.equal(h.registered.get('harness-teacher').name, 'foreign')
  const project = new BuiltinAssistantComponent(h.host, 'project')
  assert.equal((await project.status()).state, 'installed')
  h.registered.get('harness-project').plugins[0].config.prefix += '\nchanged'
  assert.equal((await project.status()).nativeState, 'stale')
  h.registered.delete('harness-project'); assert.equal((await project.status()).state, 'unknown')
})
test('component disposal during loader readiness cancels without waiting forever or registering afterwards', async () => {
  const h = hostFixture({ wait: new Promise(() => {}) }), component = new BuiltinAssistantComponent(h.host, 'teacher')
  await h.close(); assert.equal((await component.status()).state, 'unknown'); assert.equal(h.registrations, 0)
})
test('registry opening cannot deadlock the Loader that a sibling builtin is still awaiting', async t => {
  let release; const h = hostFixture({ wait: new Promise(resolve => release = resolve) }); t.after(() => h.close())
  new BuiltinAssistantComponent(h.host, 'teacher')
  const native = createNativeAssistantAdapter(h.host), registry = await AssistantRegistry.open(memory(), { nodeId: 'fixture_node', native, assertIdentity() {} })
  t.after(() => registry.close()); t.after(() => native.close())
  assert.equal(h.registrations, 0); assert.equal(registry.installedForPreset('harness-teacher'), undefined)
  release(); assert.equal(await registry.verifyPreset('harness-teacher', signal), true)
})
test('unsupported host is explicit and never alters the native registry', async t => {
  const h = hostFixture(); t.after(() => h.close()); h.services.delete('profileContext')
  const component = new BuiltinAssistantComponent(h.host, 'teacher'), status = await component.status()
  assert.equal(status.state, 'unknown'); assert.match(status.reason, /不支持/); assert.equal(h.registrations, 0)
})

test('registry reopening never acquires an already registered preset scope while its backend is still initializing', async t => {
  const h = hostFixture(); t.after(() => h.close())
  const component = new BuiltinAssistantComponent(h.host, 'teacher')
  assert.equal((await component.status()).state, 'installed')
  const acquireScope = h.registry.acquireScope
  h.registry.acquireScope = () => { assert.fail('startup must not mount a component waiting on the same backend readiness') }
  assert.equal((await component.status({ waitForReady: false })).state, 'unknown')
  const native = createNativeAssistantAdapter(h.host), registry = await AssistantRegistry.open(memory(), { nodeId: 'fixture_node', native, assertIdentity() {} })
  t.after(() => registry.close()); t.after(() => native.close())
  assert.equal(registry.installedForPreset('harness-teacher'), undefined)
  h.registry.acquireScope = acquireScope
  assert.equal(await registry.verifyPreset('harness-teacher', signal), true)
  assert.equal(h.registrations, 1, 'status refresh does not reregister or replace a native mode')
})
test('missing or mismatched working skill is not ready and recovers without registering another preset', async t => {
  const h = hostFixture(); t.after(() => h.close()); h.services.delete('skills')
  const component = new BuiltinAssistantComponent(h.host, 'teacher')
  assert.equal((await component.status()).state, 'unknown'); assert.equal(h.registrations, 1)
  h.services.set('skills', { get: async () => ({ ...HUMAN_WORKFLOW_SKILL, content: 'older contract' }) })
  assert.equal((await component.status()).state, 'unknown')
  h.services.set('skills', { get: async () => HUMAN_WORKFLOW_SKILL })
  assert.equal((await component.status()).state, 'installed'); assert.equal(h.registrations, 1)
})
test('a globally visible skill cannot masquerade as the selected preset scoped capability', async t => {
  const h = hostFixture(); t.after(() => h.close())
  h.services.set('skills', { get: async (_name, lookup) => lookup?.scope ? undefined : HUMAN_WORKFLOW_SKILL })
  const component = new BuiltinAssistantComponent(h.host, 'teacher')
  assert.equal((await component.status()).state, 'unknown')
  h.services.set('skills', { get: async () => HUMAN_WORKFLOW_SKILL }); h.services.set('tools', { get: () => undefined })
  assert.equal((await component.status()).state, 'unknown')
})

function plan(presetId, definition) {
  const plugins = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Base\n\n' + assistantGuidance(definition), complete: false, includeRuntimeContext: true } }]
  const rowId = `harness-assistant-${presetId}`, patch = JSON.stringify([{ insert: [{ id: rowId, name: '@deepseek-ai/dsh-agent-preset', config: { id: presetId, name: definition.name, description: definition.description, plugins } }] }], null, 2) + '\n'
  return { schema: 'assistant.native.preview.v1', presetId, basePreset: 'standard', definition, rowId, bundleName: `@harness-remote-assistants/${presetId}`,
    baseDigest: sha('[]'), patchDigest: sha(patch), patch, profileFingerprint: sha('fixture'), defaultPreset: 'standard', warnings: [] }
}
async function registryFixture(t, store = memory()) {
  let state = 'installed', count = 0
  const native = { probe: async () => ({ supported: true, basePresets: [{ id: 'standard', name: 'Standard' }] }),
    builtins: async () => builtinAssistants().map(item => ({ ...item, source: 'builtin', state, nativeState: state === 'installed' ? 'installed' : 'disabled' })),
    preview: async ({ presetId, definition }) => plan(presetId, definition),
    install: async value => { count++; return { presetId: value.presetId, state: 'installed', nativeState: 'installed' } },
    verify: async value => ({ presetId: value.presetId, state: 'installed', nativeState: 'installed' }),
  }
  const registry = await AssistantRegistry.open(store, { nodeId: 'fixture_node', native, assertIdentity() {} })
  t.after(() => registry.close())
  return { registry, native, store, set state(value) { state = value }, get installs() { return count } }
}
test('built-ins are real observed modes not ledger installs; unavailable does not fallback to default or duplicate install', async t => {
  const f = await registryFixture(t), catalog = await f.registry.catalog(signal)
  assert.equal(catalog.drafts.length, 3); assert(catalog.drafts.every(item => item.source === 'builtin' && item.state === 'installed'))
  assert.equal(catalog.templates.filter(item => item.builtin).length, 3); assert.equal(f.store.writes, 0)
  assert.throws(() => f.registry.draft({ templateId: 'teacher' }, signal), { code: 'assistant-builtin-included' })
  const custom = await f.registry.draft({ definition: { ...builtinAssistants()[0].definition, name: '我的定制助手' } }, signal)
  const preview = await f.registry.preview(custom, signal)
  await f.registry.install({ id: preview.id, version: preview.version, digest: preview.digest, previewId: preview.previewId }, signal)
  assert.equal(f.installs, 1); assert.equal(f.store.value.entries.length, 1)
  f.state = 'unknown'; assert.equal(await f.registry.verifyPreset('harness-teacher', signal), false)
  assert.equal(f.registry.installedForPreset('harness-teacher'), undefined)
  assert.equal(await f.registry.verifyPreset('standard', signal), undefined)
})
test('business memory uses pinned built-in identities, survives restart, and cannot leak across scopes or adopt a different preset', async t => {
  const f = await registryFixture(t), store = memory(), options = { nodeId: 'fixture_node', registry: f.registry, assertIdentity() {} }
  const scope = { nodeId: 'fixture_node', sessionId: 'session_a', sessionGeneration: '100' }
  const business = await AssistantBusinessRecords.open(store, options); t.after(() => business.close())
  const started = await business.start(scope, 'harness-teacher', signal)
  assert.equal(started.assistant.id, 'builtin_teacher'); assert.equal(started.assistant.version, 1)
  await business.save(scope, 'harness-teacher', { expectedRevision: 1, content: { title: '当前工作', answers: { teacher_role: '老师' }, memory: '用户确认资料' } }, signal)
  assert.throws(() => business.get({ ...scope, sessionId: 'session_b' }, 'harness-teacher'), { code: 'assistant-business-not-started' })
  await assert.rejects(business.start(scope, 'harness-project', signal), { code: 'assistant-business-preset-mismatch' })
  await business.close(); const reopened = await AssistantBusinessRecords.open(store, options); t.after(() => reopened.close())
  assert.equal(reopened.get(scope, 'harness-teacher').content.memory, '用户确认资料')
  f.state = 'unknown'; await f.registry.catalog(signal)
  assert.throws(() => reopened.get(scope, 'harness-teacher'), { code: 'assistant-business-preset-unavailable' })
  assert.equal(store.value.records[0].content.memory, '用户确认资料')
})
test('migration candidates require exact frozen template definition, keep old plan/data and never remove anything', async t => {
  const oldTemplate = builtinAssistants().find(item => item.templateId === 'teacher').definition
  const entries = [oldTemplate, { ...oldTemplate, methods: [...oldTemplate.methods, '我的特殊工作方法'] }].map((definition, index) => {
    const id = 'assistant_' + String(index + 1).repeat(24), presetId = `hr-assistant-${id.slice(-24)}-v1`
    return { id, version: 1, digest: definitionDigest(definition), definition, state: 'installed', createdAt: 1, plan: plan(presetId, definition), result: { presetId, state: 'installed' } }
  })
  const ledger = { schema: 'human.assistants.v1', nodeId: 'fixture_node', entries, previews: [] }, f = await registryFixture(t, memory(ledger))
  const catalog = await f.registry.catalog(signal), old = catalog.drafts.find(item => item.id === entries[0].id)
  assert.equal(old.replacement.canRemoveAfterReview, true); assert.equal(old.replacement.bundleName, entries[0].plan.bundleName)
  assert.match(old.replacement.warning, /旧模式/); assert.match(old.replacement.warning, /不会自动切换/)
  assert.equal(catalog.drafts.find(item => item.id === entries[1].id).replacement, undefined)
  assert.deepEqual(f.store.value, ledger); assert.equal(f.installs, 0)
  assert.equal(f.registry.installedForPreset(entries[0].plan.presetId).id, entries[0].id, 'old sessions keep their own identity until separately uninstalled')
  f.native.verify = async value => ({presetId:value.presetId,state:'unknown',nativeState:'uninstalled'})
  await assert.rejects(f.registry.redraft(entries[0],signal), {code:'assistant-builtin-included'})
  const customized = await f.registry.redraft(entries[1],signal)
  assert.equal(customized.state,'draft');assert.deepEqual(customized.definition,entries[1].definition)
})
test('built-in definition identity v1 is immutable and callers cannot mutate later reads', () => {
  const first = builtinAssistants(), expected = first.map(item => item.digest)
  first[0].definition.methods.push('external change')
  assert.deepEqual(builtinAssistants().map(item => item.digest), expected)
  // Digests below intentionally pinned outside implementation; changing v1 breaks retained business records.
  assert.deepEqual(expected, ['4e1fc0b4853b81a32e6a4afe30434f91c2b20688d4c1ffcb8b03f78d41a26cbd',
    '07cdf704f32566b9953abd85b35b2277995163f395158d937f6278a13028f7fb', '8201bfac6c21992cf32bdbf3d41e2a85f51f95fe150231284f22ab1010d4491d'])
})
