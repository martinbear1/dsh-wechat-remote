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

const signal = new AbortController().signal
const definition = () => ({ schemaVersion: 1, name: '项目助理', description: '协助项目日常工作', role: '了解用户职责，按明确范围辅助工作',
  methods: ['先了解目标，再设计工作步骤', '使用规范群工具收集反馈'], onboarding: [{ key: 'project', label: '项目', prompt: '你负责哪个项目？' }],
  skills: ['human-workflow'], basePreset: 'standard' })
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
  const declarations = new Map([['standard', { name: 'Standard', plugins: base() }]]), bundles = [], calls = [], cancellations = [], nativeInstall = deferred()
  let defaultId = 'standard', behavior = options.behavior || 'applied', broken = false, delayed = false
  const presets = { get defaultId() { return defaultId },
    async list() { return [...declarations].map(([id, value]) => ({ id, name: value.name, ...(broken && id !== 'standard' ? { broken: 'bad plugin' } : {}) })) },
    async readDocument(id) { const d = declarations.get(id); if (!d) throw new Error('not found'); return { agentPreset: id, name: d.name, content: dump(d.plugins, { schema: entryListSchema, noRefs: true }) } },
    async compositionInventory() { return [] },
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
    skills: { async get(name) { return { name, invocation: { modelInvocable: true, userInvocable: true } } } } }
  const host = { get: name => services[name] }, adapter = createNativeAssistantAdapter(host, { codec })
  t.after(async () => { gate.resolve(); await adapter.close(); await rm(directory, { recursive: true, force: true }) })
  return { adapter, host, services, profile, declarations, bundles, calls, cancellations, nativeInstall, gate,
    set behavior(value) { behavior = value }, set defaultId(value) { defaultId = value }, set broken(value) { broken = value }, set delayed(value) { delayed = value },
    preview: () => adapter.preview({ presetId: 'assistant-project-v1', definition: definition() }, signal),
    async assertUnchanged() {
      assert.equal(await readFile(path.join(profile, 'package.json'), 'utf8'), originalManifest)
      assert.equal(await readFile(path.join(profile, 'cordis.patch.yml'), 'utf8'), originalPatch)
      assert.equal(defaultId, 'standard'); assert.deepEqual(declarations.get('standard').plugins, base())
    } }
}

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
  assert.deepEqual(row.config.plugins.slice(1), base().slice(1))
  assert.equal(row.config.plugins[0].config.complete, false); assert.equal(row.config.plugins[0].config.includeRuntimeContext, true)
  assert(row.config.plugins[0].config.prefix.includes('项目助理')); assert.equal(row.config.plugins[0].config.suffix, 'Directory {{cwd}}')
  assert.equal(createHash('sha256').update(preview.patch).digest('hex'), preview.patchDigest)
  assert.match((await f.services.agentPresets.readDocument('standard')).content, /!!js/)
  assert.deepEqual(row.config.plugins[1].disabled, { __jsExpr: "process.platform === 'win32'" })
  await f.assertUnchanged()
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

test('base drift, missing skill and unknown/unsafe bases refuse before installation', async t => {
  const f = await fixture(t), preview = await f.preview()
  f.declarations.get('standard').plugins[2].disabled = true
  await assert.rejects(f.adapter.install(preview, signal), { code: 'assistant-native-preview-stale' }); assert.equal(f.calls.length, 0)
  f.services.skills.get = async () => undefined
  await assert.rejects(f.preview(), { code: 'assistant-skill-unavailable' })
  f.services.skills.get = async name => ({ name, invocation: { modelInvocable: true } })
  f.declarations.get('standard').plugins[2].name = './relative-code.js'
  assert.equal((await f.adapter.probe()).supported, false)
  await assert.rejects(f.preview(), { code: 'assistant-base-unsupported' })
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
