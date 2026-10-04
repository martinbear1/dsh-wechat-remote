import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { assistantDefinition, assistantGuidance, legacyAssistantGuidanceV1, legacyAssistantGuidanceV2, legacyAssistantGuidanceV3, definitionDigest } from '../lib/assistant-presets/definition.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'
const signal = new AbortController().signal, hash = text => createHash('sha256').update(text).digest('hex')
function memory(initial) { let value = structuredClone(initial); return { async load() { return structuredClone(value) }, async save(next) { value = structuredClone(next) }, get value() { return structuredClone(value) } } }
function deferred() { let resolve; return { promise: new Promise(r => resolve = r), resolve } }
function historicalLedger(state, guidanceVersion = 1) {
  const definition = { schemaVersion: 1, name: '项目助理', description: '协助项目日常工作', role: '了解用户职责，按明确范围辅助工作',
    methods: ['先了解目标，再设计工作步骤', '使用规范群工具收集反馈'], onboarding: [{ key: 'project', label: '项目', prompt: '你负责哪个项目？' }],
    skills: ['human-workflow'], basePreset: 'standard' }
  const guidance = [null, legacyAssistantGuidanceV1, legacyAssistantGuidanceV2, legacyAssistantGuidanceV3][guidanceVersion](definition)
  // Baseline independently evaluated at b14d8d1057be9685fdccf953e7c47ad50d88473a,
  // not computed from the compatibility function under test at runtime.
  assert.equal(hash(guidance), [null, '34eb91c7449a8c9eef4fe8a87b3387c56072fabdefb5c370ea5b0dba9f16cac2',
    '133c2ccc3dbb1d5109bf9a3bc75b74945d265c699094751515be4d6de29e307a',
    'ae3c37a9a0cf78f9ba7dc46ca759b825527c4cfc6e8ab4e23e7aad45a9744e70'][guidanceVersion])
  const id = 'assistant_' + 'a'.repeat(24), presetId = `hr-assistant-${id.slice(-24)}-v1`, rowId = `harness-assistant-${presetId}`
  const plugins = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Base\n\n' + guidance, complete: false, includeRuntimeContext: true } }]
  const patch = JSON.stringify([{ insert: [{ id: rowId, name: '@deepseek-ai/dsh-agent-preset',
    config: { id: presetId, name: definition.name, description: definition.description, plugins } }] }], null, 2) + '\n'
  const plan = { schema: 'assistant.native.preview.v1', presetId, basePreset: definition.basePreset, definition, rowId,
    bundleName: `@harness-remote-assistants/${presetId}`, baseDigest: hash('[]'), patchDigest: hash(patch), patch,
    profileFingerprint: hash('private fixture path'), defaultPreset: 'standard', warnings: ['原生安装'] }
  return { schema: 'human.assistants.v1', nodeId: 'fixture_node', previews: [], entries: [{
    id, version: 1, digest: definitionDigest(definition), definition, state, createdAt: 1, plan, result: { presetId, state },
  }] }
}
async function setup(t, options = {}) {
  let installs = 0, verifies = 0, valid = true, installState = options.state || 'installed'
  const native = {
    async probe() { return { supported: true, basePresets: [{ id: 'standard', name: 'Standard' }] } },
    async preview({presetId, definition}) {
      const plugins = [{id:'persona',name:'@deepseek-ai/dsh-persona',config:{prefix:'Base\n\n'+assistantGuidance(definition),complete:false,includeRuntimeContext:true}}]
      const rowId = `harness-assistant-${presetId}`, patch = JSON.stringify([{ insert: [{ id: rowId, name: '@deepseek-ai/dsh-agent-preset', config: { id: presetId, name: definition.name, description: definition.description, plugins } }] }], null, 2) + '\n'
      return { schema: 'assistant.native.preview.v1', presetId, basePreset: definition.basePreset, definition, rowId,
        bundleName: `@harness-remote-assistants/${presetId}`, baseDigest: hash('[]'), patchDigest: hash(patch), patch,
        profileFingerprint: hash('private fixture path'), defaultPreset: 'standard', warnings: ['原生安装'] }
    },
    async install(plan) { installs++; if (options.pause) await options.pause.promise; if (options.throw) throw Error('lost'); return { presetId: plan.presetId, state: installState } },
    async verify(plan) { verifies++; return { presetId: plan.presetId, state: installState } }, async close() {},
  }
  const store = options.store || memory(), registry = await AssistantRegistry.open(store, { nodeId: 'fixture_node', native, assertIdentity() { if (!valid) throw Error('revoked') } })
  t.after(() => registry.close())
  return { registry, store, native, rotate() { valid = false }, setState(state) { installState = state }, counts() { return {installs, verifies} },
    async approved() { const draft = await registry.draft({templateId:'teacher'}, signal); return registry.preview(draft, signal) } }
}
test('templates and AI definitions have the same strict, data-only contract', () => {
  assert.equal(assistantTemplates().length, 5)
  const definition = assistantTemplates()[0].definition
  for (const field of ['callback', 'plugins', 'code', 'systemPrompt', 'memberId']) assert.throws(() => assistantDefinition({...definition,[field]:'unapproved'}))
  assert.throws(() => assistantDefinition({...definition, skills:['invented']}))
  assert.throws(() => assistantDefinition({...definition, onboarding:[{key:'constructor',label:'bad',prompt:'bad'}]}))
  assert.throws(() => assistantDefinition({...definition, basePreset:'standard\n'}))
  assert.throws(() => assistantDefinition({...definition, onboarding:[{key:'role\n',label:'bad',prompt:'bad'}]}))
})

test('designer and custom-created professions use the same generic registry; name alone cannot claim designer identity', async t => {
  const h = await setup(t)
  const designer = await h.registry.draft({ templateId: 'designer' }, signal)
  const custom = await h.registry.draft({ definition: { ...designer.definition, role: '用户自行设计的项目方案助手' } }, signal)
  const catalog = await h.registry.catalog(signal)
  assert.equal(catalog.drafts.find(row => row.id === designer.id).templateId, 'designer')
  assert.equal(catalog.drafts.find(row => row.id === custom.id).templateId, undefined)
  assert.equal(h.counts().installs, 0)
  assert.match(assistantGuidance(custom.definition), /human_workspace_directory/)
  assert.match(assistantGuidance(custom.definition), /human_assistant_work_get/)
  assert.match(designer.definition.methods.join('\n'), /human_assistant_draft/)
})
test('preview and get never expose native install plans; approval is exact and idempotent', async t => {
  const h = await setup(t), preview = await h.approved()
  assert.equal(preview.native.patch, undefined); assert.equal(preview.native.profileFingerprint, undefined)
  const request = {id:preview.id,version:preview.version,digest:preview.digest,previewId:preview.previewId}
  await assert.rejects(h.registry.install({...request,digest:'a'.repeat(64)},signal))
  const result = await h.registry.install(request,signal)
  assert.equal(result.state,'installed'); assert.equal(h.registry.get(preview).plan,undefined)
  assert.equal(h.registry.installedForPreset(result.presetId).definition.name,'教师助理')
  await h.registry.install(request,signal); assert.deepEqual(h.counts(),{installs:1,verifies:1})
})
test('unknown install outcome is reconciled read-only, including after reopening', async t => {
  const h = await setup(t,{throw:true}), p = await h.approved(), request = {id:p.id,version:p.version,digest:p.digest,previewId:p.previewId}
  assert.equal((await h.registry.install(request,signal)).state,'unknown')
  await assert.rejects(h.registry.preview(p,signal))
  const r = await AssistantRegistry.open(h.store,{nodeId:'fixture_node',native:h.native,assertIdentity(){}}); t.after(()=>r.close())
  assert.equal((await r.status(p,signal)).state,'installed'); assert.equal(h.counts().installs,1)
})

for (const guidanceVersion of [1, 2, 3]) for (const state of ['installed', 'unknown']) test(`historical V${guidanceVersion} ${state} registry reopens with the same approved plan and never reinstalls`, async t => {
  const ledger = historicalLedger(state, guidanceVersion), old = ledger.entries[0], before = structuredClone(old.plan), store = memory(ledger)
  const h = await setup(t, { store, state })
  assert.deepEqual(store.value, ledger, 'opening old approved data is read-only')
  assert.deepEqual(h.registry.get(old).definition, old.definition)
  assert.equal(h.registry.get(old).plan, undefined)
  const approval = { id: old.id, version: old.version, digest: old.digest, previewId: 'old-expired-preview' }
  await assert.rejects(h.registry.install({ ...approval, digest: '0'.repeat(64) }, signal), { code: 'assistant-version-conflict' })
  assert.deepEqual(h.counts(), { installs: 0, verifies: 0 }, 'mismatched approval never reaches the native manager, even for recovery')
  assert.equal((await h.registry.status(old, signal)).state, state)
  assert.equal((await h.registry.install(approval, signal)).state, state, 'repeated historical approval can only verify')
  assert.deepEqual(h.counts(), { installs: 0, verifies: 2 })
  assert.deepEqual(store.value.entries[0].plan, before)
  await h.registry.close()
  const reopened = await setup(t, { store, state: 'installed' })
  assert.equal((await reopened.registry.status(old, signal)).state, 'installed')
  assert.deepEqual(reopened.counts(), { installs: 0, verifies: 1 })
  assert.deepEqual(store.value.entries[0].plan, before, 'reconciliation must not re-render historical wording as V4')
  assert.deepEqual(reopened.registry.installedForPreset(old.plan.presetId).definition, old.definition)
})

for (const guidanceVersion of [1, 2, 3]) test(`V${guidanceVersion} recovery does not accept altered definition/patch digests or carry old consent into a new version`, async t => {
  const original = historicalLedger('installed', guidanceVersion), old = original.entries[0]
  for (const mutate of [
    entry => { entry.digest = '0'.repeat(64) },
    entry => { entry.plan.patch += '\n' },
    entry => { entry.plan.definition.role = 'unapproved replacement' },
    entry => { const patch = JSON.parse(entry.plan.patch); patch[0].insert[0].config.plugins[0].config.prefix += '\nunapproved instruction'
      entry.plan.patch = JSON.stringify(patch, null, 2) + '\n'; entry.plan.patchDigest = hash(entry.plan.patch) },
  ]) {
    const changed = structuredClone(original); mutate(changed.entries[0]); const store = memory(changed)
    await assert.rejects(AssistantRegistry.open(store, { nodeId: 'fixture_node', native: {}, assertIdentity() {} }))
    assert.deepEqual(store.value, changed, 'rejected recovery never overwrites the stored evidence')
  }
  const h = await setup(t, { store: memory(original) })
  const changed = await h.registry.draft({ id: old.id, expectedVersion: 1, definition: { ...old.definition, name: '项目新方法' } }, signal)
  const current = await h.registry.preview(changed, signal)
  const request = { id: current.id, version: current.version, digest: current.digest, previewId: current.previewId }
  await assert.rejects(h.registry.install({ ...request, digest: old.digest }, signal), { code: 'assistant-version-conflict' })
  await assert.rejects(h.registry.install({ ...request, previewId: 'old-expired-preview' }, signal), { code: 'assistant-preview-expired' })
  assert.deepEqual(h.counts(), { installs: 0, verifies: 0 })
  assert.match(h.store.value.previews[0].native.patch, /职业助手工作方法 v4/)
  assert.equal((await h.registry.install(request, signal)).state, 'installed')
  assert.deepEqual(h.store.value.entries.find(entry => entry.version === 1).plan, old.plan)
  assert.equal(h.registry.installedForPreset(old.plan.presetId).definition.name, old.definition.name)
  assert.equal(h.counts().installs, 1)
})
test('old installed version remains pinned when template is customized', async t => {
  const h = await setup(t), p = await h.approved()
  await h.registry.install({id:p.id,version:p.version,digest:p.digest,previewId:p.previewId},signal)
  const newer = await h.registry.draft({id:p.id,expectedVersion:1,definition:{...p.definition,name:'教师新习惯'}},signal)
  assert.equal(newer.version,2); assert.equal(h.registry.get(p).definition.name,'教师助理')
  assert.equal(h.registry.get(newer).state,'draft')
  await assert.rejects(h.registry.draft({id:p.id,expectedVersion:1,definition:p.definition},signal))
})
test('restart expires consent; foreign node ledger is refused without overwrite', async t => {
  const h = await setup(t), p = await h.approved(), before = h.store.value
  const r = await AssistantRegistry.open(h.store,{nodeId:'fixture_node',native:h.native,assertIdentity(){}}); t.after(()=>r.close())
  await assert.rejects(r.install({id:p.id,version:p.version,digest:p.digest,previewId:p.previewId},signal))
  await assert.rejects(AssistantRegistry.open(h.store,{nodeId:'another_node',native:h.native,assertIdentity(){}}))
  assert.deepEqual(h.store.value,before)
})
test('close drains native settlement but forbids new work and stale success', async t => {
  const pause = deferred(), h = await setup(t,{pause}), p = await h.approved()
  const pending = h.registry.install({id:p.id,version:p.version,digest:p.digest,previewId:p.previewId},signal)
  while (h.counts().installs === 0) await new Promise(r=>setImmediate(r))
  let done = false; const close = h.registry.close().then(()=>done=true)
  assert.throws(()=>h.registry.get(p)); assert.equal(done,false)
  pause.resolve(); await assert.rejects(pending); await close
  assert.equal(h.store.value.entries[0].state,'installed')
})
