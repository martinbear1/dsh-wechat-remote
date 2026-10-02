import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { assistantDefinition, assistantGuidance } from '../lib/assistant-presets/definition.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'
const signal = new AbortController().signal, hash = text => createHash('sha256').update(text).digest('hex')
function memory(initial) { let value = structuredClone(initial); return { async load() { return structuredClone(value) }, async save(next) { value = structuredClone(next) }, get value() { return structuredClone(value) } } }
function deferred() { let resolve; return { promise: new Promise(r => resolve = r), resolve } }
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
  assert.equal(assistantTemplates().length, 4)
  const definition = assistantTemplates()[0].definition
  for (const field of ['callback', 'plugins', 'code', 'systemPrompt', 'memberId']) assert.throws(() => assistantDefinition({...definition,[field]:'unapproved'}))
  assert.throws(() => assistantDefinition({...definition, skills:['invented']}))
  assert.throws(() => assistantDefinition({...definition, onboarding:[{key:'constructor',label:'bad',prompt:'bad'}]}))
  assert.throws(() => assistantDefinition({...definition, basePreset:'standard\n'}))
  assert.throws(() => assistantDefinition({...definition, onboarding:[{key:'role\n',label:'bad',prompt:'bad'}]}))
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
