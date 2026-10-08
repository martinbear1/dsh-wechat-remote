import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { dump, load } from 'js-yaml'
import { entryListSchema, applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { isJsExpr } from '@deepseek-ai/cordis-plugin-loader'
import { createNativeAssistantAdapter, validateNativeAssistantPreview } from '../lib/assistant-presets/native-adapter.js'
import { assistantGuidance, legacyAssistantGuidanceV1, legacyAssistantGuidanceV2, legacyAssistantGuidanceV3, legacyAssistantGuidanceV4, legacyAssistantGuidanceV5 } from '../lib/assistant-presets/definition.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'
import { renderPrompt, renderContextSnapshot } from '@deepseek-ai/dsh-system-prompt'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'

const signal = new AbortController().signal
const definition = () => ({ schemaVersion: 1, name: '项目助理', description: '协助项目日常工作', role: '了解用户职责，按明确范围辅助工作',
  methods: ['先了解目标，再设计工作步骤', '使用规范群工具收集反馈'], onboarding: [{ key: 'project', label: '项目', prompt: '你负责哪个项目？' }],
  skills: ['human-workflow'], basePreset: 'standard' })
// Independently evaluated from git b14d8d1057be9685fdccf953e7c47ad50d88473a:
// src/assistant-presets/definition.ts::assistantGuidance, with definition() above.
// Pin the bytes, rather than letting a changed compatibility helper certify itself.
const LEGACY_GUIDANCE_SHA256 = '34eb91c7449a8c9eef4fe8a87b3387c56072fabdefb5c370ea5b0dba9f16cac2'
// Evaluated from RC9 commit e034dd3ec9507bf181a8aabc14e2ba8b99b36e77 before
// editing its guidance, with the same definition() fixture above.
const V2_GUIDANCE_SHA256 = '133c2ccc3dbb1d5109bf9a3bc75b74945d265c699094751515be4d6de29e307a'
// RC11 bfc9e0eb76e2cde484ab7cc55bd5515d1ab9da3a: fixing how the native
// prefix is composed must not change an already approved V3 artifact's bytes.
const V3_GUIDANCE_SHA256 = 'ae3c37a9a0cf78f9ba7dc46ca759b825527c4cfc6e8ab4e23e7aad45a9744e70'
// Independently evaluated from RC14 2dfba42277f889e97ab25f28b1e73c39bc1638bf.
const V4_GUIDANCE_SHA256 = '68f050c33dbf547a1637977e6ce3d39e8c1952d068612a2acacab804680511d4'
// Independently evaluated from RC15 d399a45b535be942132ea1d21db7f991022865a6,
// before editing its generator. Existing installed V5 bytes remain frozen.
const V5_GUIDANCE_SHA256 = '3d4e2d1d8734fb24445a73ea41845b7386afac33a600cf8c0d02625ddaef77a4'
const stockIdentity = 'You are a coding agent powered by the {{model}} model.'
const neutralIdentity = 'You are an AI assistant powered by the {{model}} model.'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const base = () => [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Base {{model}}', suffix: 'Directory {{cwd}}' } },
  { id: 'bash', name: '@deepseek-ai/dsh-tool-bash', disabled: { __jsExpr: "process.platform === 'win32'" } },
  { id: 'files', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'skill', name: '@deepseek-ai/dsh-tool-skill' },
]
const codec = { load: text => load(text, { schema: entryListSchema }) }
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'assistant-native-')), profile = path.join(directory, 'profile'), anchor = path.join(directory, 'installation.json')
  await mkdir(profile); await writeFile(anchor, '{}')
  const originalManifest = '{"name":"user-profile","private":true}\n', originalPatch = '# user-owned configuration\n'
  await writeFile(path.join(profile, 'package.json'), originalManifest); await writeFile(path.join(profile, 'cordis.patch.yml'), originalPatch)
  const originalBase = base()
  if (options.prefix !== undefined) originalBase[0].config.prefix = options.prefix
  const declarations = new Map([['standard', { name: 'Standard', plugins: structuredClone(originalBase) }]]), bundles = [], calls = [], cancellations = [], nativeInstall = deferred(), scopes = new Map()
  let defaultId = 'standard', behavior = options.behavior || 'applied', broken = false, delayed = false
  const presets = { get defaultId() { return defaultId },
    async list() { return [...declarations].map(([id, value]) => ({ id, name: value.name, ...(broken && id !== 'standard' ? { broken: 'bad plugin' } : {}) })) },
    async readDocument(id) { const d = declarations.get(id); if (!d) throw new Error('not found'); return { agentPreset: id, name: d.name, content: dump(d.plugins, { schema: entryListSchema, noRefs: true }) } },
    async compositionInventory() { return [] },
    async acquireScope(id) { assert(declarations.has(id)); if (!scopes.has(id)) scopes.set(id, {}); return { key: scopes.get(id), async [Symbol.asyncDispose]() {} } },
    register() { assert.fail('must not imperatively register a nonpersistent preset') },
    recompose() { assert.fail('must not change a live Agent') }, copy() { assert.fail('must not use the retired authoring API') },
  }
  const manager = {
    async listBundles() { return structuredClone(bundles) },
    async installBundle(spec, options) {
      calls.push({ spec, options }); nativeInstall.resolve()
      assert.deepEqual(Object.keys(options).sort(), ['enabled', 'requestId']); assert.equal(options.enabled, true)
      assert(path.isAbsolute(spec)); assert(spec.startsWith(profile + path.sep))
      const files = await readdir(spec); assert.deepEqual(files.sort(), ['cordis.patch.yml', 'install-state.json', 'package.json'])
      const manifest = JSON.parse(await readFile(path.join(spec, 'package.json'), 'utf8'))
      assert.equal(manifest.scripts, undefined); assert.equal(manifest.dependencies, undefined); assert.equal(manifest.peerDependencies, undefined)
      const patch = load(await readFile(path.join(spec, 'cordis.patch.yml'), 'utf8'), { schema: entryListSchema })
      assert.equal(patch.length, 1); assert.deepEqual(Object.keys(patch[0]), ['insert']); assert.equal(patch[0].insert.length, 1)
      const [row] = applyEntryPatches([], patch, () => assert.fail('fixed insert must not miss an entry'))
      assert.equal(row.name, '@deepseek-ai/dsh-agent-preset')
      assert(isJsExpr(row.config.plugins[1].disabled), 'JSON-compatible native !!js is preserved without executing it')
      if (delayed) await gate.promise
      if (behavior === 'failed' || behavior === 'cancelled') return { application: behavior, changed: false, stage: 'install', target: spec }
      bundles.push({ name: manifest.name, version: manifest.version, installed: true, enabled: true,
        rows: [{ rowId: row.id, moduleName: row.name }], overrides: [] })
      if (behavior !== 'restart-required') declarations.set(row.config.id, { name: row.config.name, plugins: row.config.plugins })
      if (behavior === 'lost-response') throw new Error('response lost after native application')
      return { application: behavior, changed: true, stage: 'enable', target: manifest.name, bundle: manifest.name }
    },
    async cancelInstall(requestId) { cancellations.push(requestId); return { status: behavior === 'cancelled' ? 'cancelled' : 'too-late' } },
    async waitForInstall() { return null },
  }
  const gate = deferred()
  const services = { agentPresets: presets, pluginManager: manager, profileContext: { dir: profile, installAnchor: anchor },
    humanTools: { mountCapabilities() { assert.fail('authoring does not mount a component') } },
    skills: { async get(name, lookup) { assert.equal(name, 'human-workflow'); assert([...scopes.values()].includes(lookup.scope)); return HUMAN_WORKFLOW_SKILL } },
    tools: { get(_name, scope) { assert([...scopes.values()].includes(scope)); return {} } } }
  const host = { get: name => services[name] }, adapter = createNativeAssistantAdapter(host, { codec, access: options.access })
  t.after(async () => { gate.resolve(); await adapter.close(); await rm(directory, { recursive: true, force: true }) })
  return { adapter, host, services, profile, declarations, bundles, calls, cancellations, nativeInstall, gate,
    set behavior(value) { behavior = value }, set defaultId(value) { defaultId = value }, set broken(value) { broken = value }, set delayed(value) { delayed = value },
    preview: () => adapter.preview({ presetId: 'assistant-project-v1', definition: definition() }, signal),
    async assertUnchanged() {
      assert.equal(await readFile(path.join(profile, 'package.json'), 'utf8'), originalManifest)
      assert.equal(await readFile(path.join(profile, 'cordis.patch.yml'), 'utf8'), originalPatch)
      assert.equal(defaultId, 'standard'); assert.deepEqual(declarations.get('standard').plugins, originalBase)
    } }
}

async function historicalPreview(f, version = 1) {
  const preview = await f.preview(), guidance = [null, legacyAssistantGuidanceV1, legacyAssistantGuidanceV2, legacyAssistantGuidanceV3, legacyAssistantGuidanceV4, legacyAssistantGuidanceV5][version](definition())
  assert.equal(Buffer.byteLength(guidance), [0, 1191, 3704, 4819, 7742, 10305][version])
  assert.equal(sha256(guidance), [null, LEGACY_GUIDANCE_SHA256, V2_GUIDANCE_SHA256, V3_GUIDANCE_SHA256, V4_GUIDANCE_SHA256, V5_GUIDANCE_SHA256][version])
  const patch = JSON.parse(preview.patch)
  patch[0].insert[0].config.plugins = patch[0].insert[0].config.plugins.filter(row => row.id !== 'harness-collaboration')
  patch[0].insert[0].config.plugins[0].config.prefix = (version === 3 ? stockIdentity : 'Base {{model}}') + '\n\n' + guidance
  const oldPatch = JSON.stringify(patch, null, 2) + '\n'
  assert.notEqual(oldPatch, preview.patch, 'newly prepared native bundles must use current guidance, not silently keep historical text')
  return { ...preview, patch: oldPatch, patchDigest: sha256(oldPatch) }
}

test('account admission is checked again before native assistant install, without touching host defaults', async t => {
  let allowed = true
  const f=await fixture(t,{access:{async authorize(){if(!allowed)throw Error('feature denied')},current(){if(!allowed)throw Error('feature denied')}}})
  const preview=await f.preview(), original=f.services.pluginManager.listBundles
  f.services.pluginManager.listBundles=async()=>{const result=await original();allowed=false;return result}
  await assert.rejects(f.adapter.install(preview,signal),/feature denied/)
  assert.equal(f.calls.length,0); assert.equal(f.cancellations.length,0); await f.assertUnchanged()
})

async function seedHistoricalArtifact(f, preview, state) {
  // Seed what the OLD owner-approved native install already persisted. Calling
  // the new install implementation here would test a new plan, not old recovery.
  const target = path.join(f.profile, 'assistant-native-bundles', preview.presetId)
  await mkdir(target, { recursive: true })
  const manifest = JSON.stringify({ name: preview.bundleName, version: '1.0.0', private: true, type: 'module',
    description: preview.definition.description, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2) + '\n'
  const receipt = { schema: 'assistant.native.install.v1', patchDigest: preview.patchDigest,
    requestId: '00000000-0000-4000-8000-000000000001', phase: state === 'installed' ? 'settled' : 'started',
    ...(state === 'installed' ? { application: 'applied' } : {}) }
  await writeFile(path.join(target, 'package.json'), manifest)
  await writeFile(path.join(target, 'cordis.patch.yml'), preview.patch)
  await writeFile(path.join(target, 'install-state.json'), JSON.stringify(receipt))
  const publishNativeState = () => {
    const row = JSON.parse(preview.patch)[0].insert[0]
    f.bundles.push({ name: preview.bundleName, version: '1.0.0', installed: true, enabled: true,
      rows: [{ rowId: row.id, moduleName: row.name }], overrides: [] })
    f.declarations.set(row.config.id, { name: row.config.name, plugins: row.config.plugins })
  }
  if (state === 'installed') publishNativeState()
  const snapshot = async () => Object.fromEntries(await Promise.all(
    ['package.json', 'cordis.patch.yml', 'install-state.json'].map(async name => [name, sha256(await readFile(path.join(target, name)))])))
  return { snapshot, publishNativeState }
}

for (const version of [1, 2, 3, 4, 5]) for (const state of ['installed', 'unknown']) test(`historical V${version} ${state} artifact survives a fresh adapter without rewriting bytes or reinstalling`, async t => {
  const f = await fixture(t, version === 3 ? { prefix: stockIdentity } : {}), preview = await historicalPreview(f, version), saved = await seedHistoricalArtifact(f, preview, state)
  assert.deepEqual(validateNativeAssistantPreview(preview), preview)
  const before = await saved.snapshot(); await f.adapter.close()
  const restored = createNativeAssistantAdapter(f.host, { codec }); t.after(() => restored.close())
  assert.equal((await restored.verify(structuredClone(preview), signal)).state, 'unknown')
  assert.equal((await restored.install(structuredClone(preview), signal)).state, 'unknown', 'a repeated old approval is reconciliation only; old content is not silently upgraded')
  assert.equal(f.calls.length, 0)
  if (state === 'unknown') {
    saved.publishNativeState() // A later native read confirms the old operation; do not submit it again.
    assert.equal((await restored.verify(preview, signal)).nativeState, 'stale', 'native installation exists but old composition has no scoped collaboration component')
  }
  assert.deepEqual(await saved.snapshot(), before, 'manifest, approved patch and durable receipt all retain their exact old bytes')
  assert.equal(f.calls.length, 0); await f.assertUnchanged()
})

for (const version of [1, 2, 3, 4, 5]) test(`V${version} compatibility accepts only exact guidance and cannot replace an approved old artifact with a valid new plan`, async t => {
  const f = await fixture(t, version === 3 ? { prefix: stockIdentity } : {}), current = await f.preview(), old = await historicalPreview(f, version)
  const saved = await seedHistoricalArtifact(f, old, 'installed'), before = await saved.snapshot()
  for (const change of [
    value => { value.patch = current.patch }, // No new digest: stale approval must fail.
    value => { value.definition.role += ' changed' },
    value => { const patch = JSON.parse(value.patch); patch[0].insert[0].config.plugins[0].config.prefix += '\nextra instruction'
      value.patch = JSON.stringify(patch, null, 2) + '\n'; value.patchDigest = sha256(value.patch) },
  ]) {
    const modified = structuredClone(old); change(modified)
    assert.throws(() => validateNativeAssistantPreview(modified), { code: 'assistant-native-preview-invalid' })
  }
  assert.deepEqual(validateNativeAssistantPreview(current), current, 'a valid new snapshot is structurally valid, but not the approved old installation')
  await assert.rejects(f.adapter.install(current, signal), { code: 'assistant-native-artifact-changed' })
  assert.deepEqual(await saved.snapshot(), before); assert.equal(f.calls.length, 0)
  assert.equal((await f.adapter.verify(old, signal)).nativeState, 'stale')
})

for (const version of [2, 5]) test(`a historical V${version} preview without an install receipt cannot silently install current V6 wording`, async t => {
  const f = await fixture(t), old = await historicalPreview(f, version)
  await assert.rejects(f.adapter.install(old, signal), { code: 'assistant-native-preview-stale' })
  assert.equal(f.calls.length, 0)
  assert.deepEqual((await readdir(f.profile)).sort(), ['cordis.patch.yml', 'package.json'])
  await f.assertUnchanged()
})

test('feature detection refuses old copy-based hosts and absent public management services', async () => {
  for (const services of [{}, { agentPresets: { list() {}, copy() {}, read() {} }, pluginManager: {} }]) {
    const adapter = createNativeAssistantAdapter({ get: name => services[name] })
    assert.equal((await adapter.probe()).supported, false); await adapter.close()
  }
})

test('native preview is read-only, data-only and pins inherited plugins without global/default writes', async t => {
  const f = await fixture(t), capability = await f.adapter.probe(), preview = await f.preview()
  assert.equal(capability.supported, true); assert.deepEqual(capability.basePresets, [{ id: 'standard', name: 'Standard' }])
  assert.equal(preview.basePreset, 'standard'); assert.equal(preview.defaultPreset, 'standard')
  assert.equal(f.calls.length, 0)
  assert.deepEqual((await readdir(f.profile)).sort(), ['cordis.patch.yml', 'package.json'])
  const row = JSON.parse(preview.patch)[0].insert[0]
  assert.deepEqual(row.config.plugins.slice(1, -1), base().slice(1))
  assert.deepEqual(row.config.plugins.at(-1), { id: 'harness-collaboration', name: '@harness-remote/dsh-wechat-remote/collaboration' })
  assert.equal(row.config.plugins[0].config.complete, false); assert.equal(row.config.plugins[0].config.includeRuntimeContext, true)
  assert(row.config.plugins[0].config.prefix.includes('项目助理')); assert.equal(row.config.plugins[0].config.suffix, 'Directory {{cwd}}')
  assert.equal(createHash('sha256').update(preview.patch).digest('hex'), preview.patchDigest)
  assert.match((await f.services.agentPresets.readDocument('standard')).content, /!!js/)
  assert.deepEqual(row.config.plugins[1].disabled, { __jsExpr: "process.platform === 'win32'" })
  await f.assertUnchanged()
})

test('all professional templates replace only the native stock coding identity and preserve host policy and tools', async t => {
  for (const template of assistantTemplates()) {
    const policy = '\n\nDeployment policy: respect approval and workspace boundaries.'
    const f = await fixture(t, { prefix: stockIdentity + policy })
    const d = { ...template.definition, basePreset: 'standard' }
    const preview = await f.adapter.preview({ presetId: `assistant-${template.id}-v1`, definition: d }, signal)
    const plugins = JSON.parse(preview.patch)[0].insert[0].config.plugins, persona = plugins[0].config
    assert.equal(persona.prefix, neutralIdentity + policy + '\n\n' + assistantGuidance(d))
    assert.equal(persona.suffix, 'Directory {{cwd}}')
    assert.equal(persona.complete, false); assert.equal(persona.includeRuntimeContext, true)
    assert.deepEqual(plugins.slice(1, -1), base().slice(1))
    assert.deepEqual(validateNativeAssistantPreview(preview), preview)
    // Actual SDK interpolation, without a model call or any production session.
    const assembly = { sections: [{ name: 'deployment:persona', text: persona.prefix },
      { name: 'host:safety', text: 'Approval remains enforced.' }, { name: 'deployment:suffix', text: persona.suffix }],
      contexts: [{ name: 'host:runtime', text: 'Workspace {{cwd}}; permission scope unchanged.' }], tools: [],
      variables: { model: 'test-model', cwd: '/test-workspace' } }
    const rendered = renderPrompt(assembly)
    assert(!rendered.includes('You are a coding agent'))
    assert(rendered.includes(d.role)); assert(rendered.includes('Approval remains enforced.'))
    assert(rendered.includes('Directory /test-workspace'))
    assert(renderContextSnapshot(assembly).includes('permission scope unchanged'))
    await f.assertUnchanged()
  }
})

test('custom base policy is never stripped, including quoted stock identity and CRLF tails', async t => {
  for (const [prefix, expected] of [
    [stockIdentity, neutralIdentity],
    [stockIdentity + '\r\nKeep native restrictions.', neutralIdentity + '\r\nKeep native restrictions.'],
    ['Private deployment policy\n' + stockIdentity, 'Private deployment policy\n' + stockIdentity],
    ['Custom role; preserve all author instructions.', 'Custom role; preserve all author instructions.'],
    [stockIdentity + ' Extra constraints.', stockIdentity + ' Extra constraints.'],
  ]) {
    const f = await fixture(t, { prefix }), preview = await f.preview()
    assert.equal(JSON.parse(preview.patch)[0].insert[0].config.plugins[0].config.prefix, expected + '\n\n' + assistantGuidance(definition()))
    await f.assertUnchanged()
  }
})

test('professional presets are not offered as bases and cannot stack a second profession, while historical verification still works', async t => {
  for (const guidance of [legacyAssistantGuidanceV1, legacyAssistantGuidanceV2, legacyAssistantGuidanceV3, legacyAssistantGuidanceV4, legacyAssistantGuidanceV5, assistantGuidance]) {
    const f = await fixture(t), derived = base()
    derived[0].config.prefix = stockIdentity + '\n\n' + guidance(definition())
    // Detect composition rather than relying solely on a package/preset naming convention.
    f.declarations.set('existing-profession', { name: '已有职业', plugins: derived })
    assert.deepEqual((await f.adapter.probe()).basePresets, [{ id: 'standard', name: 'Standard' }])
    await assert.rejects(f.adapter.preview({ presetId: 'assistant-new-role', definition: { ...definition(), basePreset: 'existing-profession' } }, signal),
      { code: 'assistant-base-derived' })
    assert.equal(f.calls.length, 0); await f.assertUnchanged()
  }
})

test('an approved old coding-prefix preview without a receipt must be re-reviewed, never silently upgraded on install', async t => {
  const f = await fixture(t, { prefix: stockIdentity }), old = await historicalPreview(f, 3)
  await assert.rejects(f.adapter.install(old, signal), { code: 'assistant-native-preview-stale' })
  assert.equal(f.calls.length, 0); await f.assertUnchanged()
})

test('approved definition cannot smuggle modules, scripts, paths or prompt variables', async t => {
  const f = await fixture(t)
  for (const extra of [{ module: 'evil' }, { path: '../escape' }, { url: 'https://evil.invalid' }, { code: '!!js evil' }, { scripts: {} }]) {
    await assert.rejects(f.adapter.preview({ presetId: 'assistant-safe-v1', definition: { ...definition(), ...extra } }, signal), { code: 'assistant-definition-invalid' })
  }
  for (const id of ['../escape', '/absolute', 'C:\\escape', 'default\n', 'Uppercase']) {
    await assert.rejects(f.adapter.preview({ presetId: id, definition: definition() }, signal), { code: 'assistant-preset-id-invalid' })
  }
  const spec = { ...definition(), role: 'Literal {{secret}} and !!js text is not a template or code' }
  const preview = await f.adapter.preview({ presetId: 'assistant-safe-v1', definition: spec }, signal)
  const persona = JSON.parse(preview.patch)[0].insert[0].config.plugins[0].config.prefix
  assert(!persona.includes('{{secret}}')); assert(persona.includes('｛｛secret｝｝'))
  assert.equal(f.calls.length, 0)
})

test('base drift, missing component service and unknown/unsafe bases refuse before installation', async t => {
  const f = await fixture(t), preview = await f.preview()
  f.declarations.get('standard').plugins[2].disabled = true
  await assert.rejects(f.adapter.install(preview, signal), { code: 'assistant-native-preview-stale' }); assert.equal(f.calls.length, 0)
  const service = f.services.humanTools; delete f.services.humanTools
  await assert.rejects(f.preview(), { code: 'assistant-skill-unavailable' })
  f.services.humanTools = service
  f.declarations.get('standard').plugins[2].name = './relative-code.js'
  assert.equal((await f.adapter.probe()).supported, false)
  await assert.rejects(f.preview(), { code: 'assistant-base-unsupported' })
})

test('authoring needs no global skill; actual installed scoped skill and tools must both be ready', async t => {
  const f = await fixture(t), original = f.services.skills.get
  f.services.skills.get = async () => assert.fail('preview must not read a global or future preset skill')
  const preview = await f.preview()
  f.services.skills.get = async () => undefined
  assert.equal((await f.adapter.install(preview, signal)).state, 'unknown')
  f.services.skills.get = original
  f.services.tools.get = () => undefined
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
  f.services.tools.get = () => ({})
  assert.equal((await f.adapter.verify(preview, signal)).state, 'installed')
  assert.equal(f.calls.length, 1)
})

test('old V6 plan without a scoped component stays byte-identical and requires an explicit upgrade', async t => {
  const f = await fixture(t), current = await f.preview(), patch = JSON.parse(current.patch)
  patch[0].insert[0].config.plugins = patch[0].insert[0].config.plugins.filter(row => row.id !== 'harness-collaboration')
  const text = JSON.stringify(patch, null, 2) + '\n', old = { ...current, patch: text, patchDigest: sha256(text) }
  const saved = await seedHistoricalArtifact(f, old, 'installed'), before = await saved.snapshot()
  assert.deepEqual(validateNativeAssistantPreview(old), old)
  const result = await f.adapter.verify(old, signal)
  assert.equal(result.nativeState, 'stale'); assert.match(result.message, /旧版.*独立.*群协作组件/)
  assert.equal((await f.adapter.install(old, signal)).nativeState, 'stale')
  assert.equal(f.calls.length, 0); assert.deepEqual(await saved.snapshot(), before)
})

test('successful native install verifies exact declaration and survives a fresh adapter', async t => {
  const f = await fixture(t), preview = await f.preview()
  assert.equal((await f.adapter.install(preview, signal)).state, 'installed')
  assert.equal(f.calls.length, 1); await f.assertUnchanged()
  assert.equal((await f.adapter.install(preview, signal)).state, 'installed'); assert.equal(f.calls.length, 1)
  const restored = createNativeAssistantAdapter(f.host, { codec })
  assert.equal((await restored.verify(structuredClone(preview), signal)).state, 'installed')
  await restored.close()
  f.broken = true; assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
})

test('native restart-required remains pending until native registry confirms the saved declaration', async t => {
  const f = await fixture(t, { behavior: 'restart-required' }), preview = await f.preview()
  assert.equal((await f.adapter.install(preview, signal)).state, 'pending-restart')
  assert.equal((await f.adapter.verify(preview, signal)).state, 'pending-restart')
  const config = JSON.parse(preview.patch)[0].insert[0].config
  f.declarations.set(config.id, { name: config.name, plugins: config.plugins })
  assert.equal((await f.adapter.verify(preview, signal)).state, 'installed'); assert.equal(f.calls.length, 1)
})

test('lost install response is unknown, then read-only reconciliation verifies without reinstall', async t => {
  const f = await fixture(t, { behavior: 'lost-response' }), preview = await f.preview()
  assert.equal((await f.adapter.install(preview, signal)).state, 'unknown')
  assert.equal((await f.adapter.verify(preview, signal)).state, 'installed')
  assert.equal((await f.adapter.install(preview, signal)).state, 'installed'); assert.equal(f.calls.length, 1)
  await f.assertUnchanged()
})

test('failed native operation keeps user configuration and cannot masquerade as installation', async t => {
  const f = await fixture(t, { behavior: 'failed' }), preview = await f.preview()
  assert.equal((await f.adapter.install(preview, signal)).state, 'unknown')
  assert.equal((await f.adapter.install(preview, signal)).state, 'unknown'); assert.equal(f.calls.length, 1)
  assert.equal(f.declarations.has(preview.presetId), false); await f.assertUnchanged()
})

test('pre-aborted approval performs no native install or artifact writes', async t => {
  const f = await fixture(t), preview = await f.preview()
  await assert.rejects(f.adapter.install(preview, AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(f.calls.length, 0); assert.deepEqual((await readdir(f.profile)).sort(), ['cordis.patch.yml', 'package.json'])
})

test('cancellation after native applying waits for settlement and never falsely reports rollback', async t => {
  const f = await fixture(t), preview = await f.preview(), abort = new AbortController()
  f.delayed = true
  const pending = f.adapter.install(preview, abort.signal)
  await f.nativeInstall.promise; abort.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.cancellations.length, 1)
  f.gate.resolve()
  assert.equal((await pending).state, 'installed', 'too-late cancellation is not undo')
  assert.equal((await f.adapter.verify(preview, signal)).state, 'installed')
})

test('dispose joins native install, preserves its receipt, and a new adapter verifies outcome', async t => {
  const f = await fixture(t), preview = await f.preview(); f.delayed = true
  const pending = f.adapter.install(preview, signal).catch(cause => cause)
  await f.nativeInstall.promise
  let stopped = false; const closing = f.adapter.close().then(() => { stopped = true })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(stopped, false)
  f.gate.resolve(); await closing; await pending
  const restored = createNativeAssistantAdapter(f.host, { codec })
  assert.equal((await restored.verify(preview, signal)).state, 'installed'); assert.equal(f.calls.length, 1)
  await restored.close()
})

test('cross-profile and modified artifacts are rejected; existing preset IDs are never overwritten', async t => {
  const f = await fixture(t), preview = await f.preview(), other = await fixture(t)
  await assert.rejects(other.adapter.install(preview, signal), { code: 'assistant-native-profile-changed' })
  await assert.rejects(f.adapter.preview({ presetId: 'standard', definition: definition() }, signal), { code: 'assistant-preset-exists' })
  await f.adapter.install(preview, signal)
  const dir = f.calls[0].spec
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { install: 'evil' } }))
  await assert.rejects(f.adapter.verify(preview, signal), { code: 'assistant-native-artifact-changed' })
  await assert.rejects(f.adapter.install(preview, signal), { code: 'assistant-native-artifact-changed' })
  assert.equal(f.calls.length, 1); assert.equal(other.calls.length, 0)
})

test('native declaration tampering or bundle errors are not reported installed, including after default changes', async t => {
  const f = await fixture(t), preview = await f.preview(); await f.adapter.install(preview, signal)
  f.declarations.get(preview.presetId).plugins[0].config.prefix = 'tampered'
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
  f.bundles[0].error = { code: 'operation-error' }
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
  delete f.bundles[0].error; f.defaultId = 'another-user-selection'
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
})

test('native uninstall, disabled and changed content are distinct fresh observations and never reinstall', async t => {
  const f=await fixture(t),preview=await f.preview(); await f.adapter.install(preview,signal)
  const original=structuredClone(f.declarations.get(preview.presetId)),bundle=structuredClone(f.bundles[0])
  f.bundles[0].enabled=false
  assert.equal((await f.adapter.verify(preview,signal)).nativeState,'disabled')
  f.bundles[0].enabled=true; f.declarations.get(preview.presetId).plugins[0].config.prefix='changed'
  assert.equal((await f.adapter.verify(preview,signal)).nativeState,'stale')
  f.declarations.delete(preview.presetId); f.bundles.length=0
  assert.equal((await f.adapter.verify(preview,signal)).nativeState,'uninstalled')
  f.bundles.push({...bundle,installed:false})
  assert.equal((await f.adapter.verify(preview,signal)).nativeState,'uninstalled')
  f.bundles[0]=bundle; f.declarations.set(preview.presetId,original)
  assert.equal((await f.adapter.verify(preview,signal)).nativeState,'installed')
  f.bundles.push(null)
  const unknown=await f.adapter.verify(preview,signal); assert.equal(unknown.state,'unknown'); assert.equal(unknown.nativeState,'unknown')
  assert.equal(f.calls.length,1)
})

test('unexpected bundle rows or overrides and duplicate owner clicks do not widen the approved install', async t => {
  const f = await fixture(t), preview = await f.preview()
  const results = await Promise.all([f.adapter.install(preview, signal), f.adapter.install(preview, signal)])
  assert(results.every(result => result.state === 'installed')); assert.equal(f.calls.length, 1)
  f.bundles[0].rows.push({ rowId: 'unapproved', moduleName: '@evil/extra-plugin' })
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
  f.bundles[0].rows.pop(); f.bundles[0].overrides.push('agent-preset-registry')
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
})

test('host-confirmed cancellation is not treated as an installed preset or automatically retried', async t => {
  const f = await fixture(t, { behavior: 'cancelled' }), preview = await f.preview()
  const result = await f.adapter.install(preview, signal)
  assert.equal(result.state, 'unknown'); assert.match(result.message, /确认.*已取消/)
  assert.equal((await f.adapter.verify(preview, signal)).state, 'unknown')
  await f.adapter.install(preview, signal); assert.equal(f.calls.length, 1)
  await f.assertUnchanged()
})

test('alias amplification is refused before native parser entry', async t => {
  const f = await fixture(t); let parseCalls = 0
  f.services.agentPresets.readDocument = async id => ({ agentPreset: id, content: '- id: persona\n  name: "@deepseek-ai/dsh-persona"\n  config: &huge\n    prefix: x\n- *huge\n' })
  const adapter = createNativeAssistantAdapter(f.host, { codec: { load(value) { parseCalls++; return codec.load(value) } } })
  await assert.rejects(adapter.preview({ presetId: 'assistant-alias-v1', definition: definition() }, signal), { code: 'assistant-base-unsupported' })
  assert.equal(parseCalls, 0); await adapter.close()
})

test('persisted preview validation rejects malformed or widened plans before core recovery', async t => {
  const f = await fixture(t), preview = await f.preview()
  assert.deepEqual(validateNativeAssistantPreview(preview), preview)
  for (const mutate of [p => { p.extra = true }, p => { p.profileFingerprint = 'wrong' }, p => { p.definition.role = 'not-approved' },
    p => { p.baseDigest = 'wrong' }, p => { p.rowId = 'other' }, p => { p.patch = '[{"id":"existing","disabled":true}]'; p.patchDigest = createHash('sha256').update(p.patch).digest('hex') },
    p => { const patch = JSON.parse(p.patch); patch[0].insert.push(patch[0].insert[0]); p.patch = JSON.stringify(patch); p.patchDigest = createHash('sha256').update(p.patch).digest('hex') }]) {
    const changed = structuredClone(preview); mutate(changed)
    assert.throws(() => validateNativeAssistantPreview(changed), { code: 'assistant-native-preview-invalid' })
  }
})

test('collaboration component is a single explicit declaration, not a disabled or configurable compatibility shortcut', async t => {
  const f = await fixture(t), preview = await f.preview()
  for (const change of [
    plugins => plugins.push(structuredClone(plugins.at(-1))),
    plugins => { plugins.at(-1).disabled = true },
    plugins => { plugins.at(-1).config = { global: true } },
    plugins => { plugins.at(-1).name = '@foreign/collaboration' },
    plugins => { const component = plugins.pop(); plugins.push({ id: 'nested', name: 'cordis:group', group: true, config: [component] }) },
  ]) {
    const value = structuredClone(preview), patch = JSON.parse(value.patch)
    change(patch[0].insert[0].config.plugins); value.patch = JSON.stringify(patch); value.patchDigest = sha256(value.patch)
    assert.throws(() => validateNativeAssistantPreview(value), { code: 'assistant-native-preview-invalid' })
  }
  f.declarations.get('standard').plugins.push({ id: 'harness-collaboration', name: '@foreign/other' })
  await assert.rejects(f.preview(), { code: 'assistant-base-unsupported' })
  assert.equal(f.calls.length, 0)
})

test('a later native default selection does not invalidate an installed assistant or get reverted', async t => {
  const f = await fixture(t), preview = await f.preview(); await f.adapter.install(preview, signal)
  f.defaultId = 'user-chosen-later'
  const result = await f.adapter.verify(preview, signal)
  assert.equal(result.state, 'installed'); assert.match(result.message, /保留了当前选择/)
  assert.equal(f.services.agentPresets.defaultId, 'user-chosen-later'); assert.equal(f.calls.length, 1)
})

test('production codec resolves the actual host include schema without a supplied parser', async t => {
  const f = await fixture(t)
  // Use this test workspace only as the host installation anchor; its real
  // include module is resolved by the production code, not a fake codec.
  f.services.profileContext.installAnchor = path.resolve('package.json')
  const adapter = createNativeAssistantAdapter(f.host)
  try {
    assert.equal((await adapter.probe()).supported, true)
    const preview = await adapter.preview({ presetId: 'assistant-native-codec-v1', definition: definition() }, signal)
    assert.deepEqual(JSON.parse(preview.patch)[0].insert[0].config.plugins[1].disabled, base()[1].disabled)
    assert.equal(f.calls.length, 0)
  } finally { await adapter.close() }
})

test('capability failures never project native filesystem/module paths or forged business errors', async t => {
  const f = await fixture(t), secret = 'private-profile-secret', originalDir = f.services.profileContext.dir
  f.services.profileContext.dir = path.join(originalDir, secret)
  const filesystem = createNativeAssistantAdapter(f.host, { codec })
  try {
    const result = await filesystem.probe()
    assert.equal(result.supported, false)
    assert.equal(result.reason, '原生预设能力不可用，请在宿主核对配置')
    assert(!JSON.stringify(result).includes(secret)); assert(!JSON.stringify(result).includes(originalDir))
  } finally { await filesystem.close() }
  f.services.profileContext.dir = originalDir
  // The temporary installation anchor has no host include module. Resolution
  // errors normally contain its path/require stack; none may reach catalog.
  const moduleResolution = createNativeAssistantAdapter(f.host)
  try {
    const result = await moduleResolution.probe()
    assert.equal(result.supported, false)
    assert.equal(result.reason, '原生预设能力不可用，请在宿主核对配置')
    assert(!JSON.stringify(result).includes(f.services.profileContext.installAnchor))
  } finally { await moduleResolution.close() }
  const external = createNativeAssistantAdapter({ get() {
    throw Object.assign(new Error(secret + ': C:\\private\\profile'), { code: 'assistant-native-unavailable' })
  } })
  try { assert.equal((await external.probe()).reason, '原生预设能力不可用，请在宿主核对配置') }
  finally { await external.close() }
})
