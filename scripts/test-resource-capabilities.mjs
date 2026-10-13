import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { parsePreset } from '../../harness-remote-cloud-server/src/resource-delivery/protocol.js'

const code = await mkdtemp(path.join(os.tmpdir(), 'resource-capability-code-'))
const source = name => JSON.stringify(fileURLToPath(new URL(`../src/${name}`, import.meta.url)).replaceAll('\\', '/'))
await build({ stdin: { contents: [
  `export * from ${source('private-resources/contract.ts')};`,
  `export * from ${source('private-resources/library.ts')};`,
  `export * from ${source('private-resources/assistant-provider.ts')};`,
  `export {default as ResourcePromptData} from ${source('private-resources/native.ts')};`,
  `export {assistantGuidance} from ${source('assistant-presets/definition.ts')};`,
  `export {ResourceStorage} from ${source('private-resources/storage.ts')};`,
  `export {nodeStorageDirectory} from ${source('node-storage.ts')};`,
  `export {HUMAN_WORKFLOW_SKILL} from ${source('human-workflow/dsh-skill.ts')};`,
].join('\n'), resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'es2022', outfile: path.join(code, 'fixture.mjs'), logLevel: 'silent' })
const { parseResourcePreset, resourcePresetId, resourceKey, PrivateResourceLibrary, ResourceStorage,
  readResourceAssistantDefinitions, nodeStorageDirectory, HUMAN_WORKFLOW_SKILL, ResourcePromptData,
  assistantGuidance, RESOURCE_PROMPT_MAX_BYTES } = await import(pathToFileURL(path.join(code, 'fixture.mjs')).href)
test.after(() => rm(code, { recursive: true, force: true }))
const signal = () => new AbortController().signal
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const ordinary = patch => ({ schemaVersion: 1, kind: 'preset', resourceId: 'ordinary', version: '1.0.0',
  name: '普通角色', description: '普通资源', basePreset: 'standard', systemPrompt: '原样 {{model}}', ...patch })
const group = patch => ({ ...ordinary(), schemaVersion: 2, resourceId: 'group-role', capabilities: ['wechat-group'],
  assistant: { schemaVersion: 1, name: '普通角色', description: '普通资源', role: '协助已明确的工作', basePreset: 'standard',
    methods: ['根据用户需要使用现有工具。'], onboarding: [{ key: 'role', label: '身份', prompt: '你希望怎样称呼？' }], skills: ['human-workflow'] }, ...patch })
const pack = resource => { const bytes = Buffer.from(JSON.stringify(resource)); return { bytes,
  release: { resourceId: resource.resourceId, version: resource.version, bytes: bytes.length, sha256: sha(bytes) } } }
const install = (library, resource) => { const { bytes, release } = pack(resource); return library.install(bytes, release) }

test('cloud and plugin share explicit capability schema; old hashes and resource IDs remain exact', () => {
  for (const value of [ordinary(), ordinary({ schemaVersion: 2, capabilities: [] }), group()]) {
    const p = pack(value)
    assert.deepEqual(parseResourcePreset(p.bytes, p.release), value)
    const cloud = parsePreset(p.bytes)
    assert.deepEqual(cloud.preset, value); assert.equal(cloud.release.sha256, p.release.sha256)
  }
  assert.equal(resourceKey(ordinary()), resourceKey(ordinary({ schemaVersion: 2, capabilities: [] })))
  assert.equal(resourcePresetId(ordinary()), resourcePresetId(ordinary({ schemaVersion: 2, capabilities: [] })))
  const bad = [ordinary({ capabilities: ['wechat-group'] }), ordinary({ schemaVersion: 2 }), group({ capabilities: ['shell'] }),
    group({ capabilities: ['wechat-group', 'wechat-group'] }), group({ assistant: undefined }), group({ capabilities: [] }),
    group({ scripts: ['anything'] }), group({ assistant: { ...group().assistant, role: '' } }),
    group({ assistant: { ...group().assistant, name: 'another identity' } }),
    group({ assistant: { ...group().assistant, methods: ['ok'], plugins: [] } })]
  for (const resource of bad) {
    const p = pack(resource)
    assert.throws(() => parseResourcePreset(p.bytes, p.release), JSON.stringify(resource))
    assert.throws(() => parsePreset(p.bytes), JSON.stringify(resource))
  }
})

async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'resource-capabilities-'))
  const directory = path.join(nodeStorageDirectory(home, 'fixture'), 'private-resources')
  let enabled = true, gate = true, nativeAllowed = true, checkCalls = 0
  const calls = [], scopes = new Map(), libraries = []
  const base = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'base', suffix: 'native suffix', complete: false, includeRuntimeContext: true } },
    { id: 'native-tool', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'nested', name: 'cordis:group', group: true, config: [
      { id: 'inherited-collaboration', name: 'dsh-wechat-remote/collaboration' }, { id: 'other-tool', name: '@deepseek-ai/dsh-tool-skill' },
    ] }]
  const definitions = new Map([['standard', { id: 'standard', name: 'standard', plugins: structuredClone(base), broken: 'group dependency absent in this base' }]])
  const assertNative = () => { checkCalls++; assert(nativeAllowed, 'definition-only restore must not query native services') }
  const registry = {
    async list() { assertNative(); return [...definitions.values()] },
    async resolve(id) { assertNative(); const value = definitions.get(id); if (!value) throw Error('missing'); return value },
    async readDocument(id) { assertNative(); return { agentPreset: id, content: JSON.stringify(definitions.get(id).plugins) } },
    async register(value) { assertNative(); assert(!definitions.has(value.id)); definitions.set(value.id, value); calls.push(value); return async () => { definitions.delete(value.id) } },
    async acquireScope(id) { assertNative(); const key = {}; scopes.set(key, id); return { key, [Symbol.asyncDispose]: async () => { scopes.delete(key) } } },
  }
  const scopeHasGroup = key => gate && definitions.get(scopes.get(key))?.plugins.some(row => row.name === 'dsh-wechat-remote/collaboration')
  const access = { groupEnabled: () => gate && enabled, assertCurrent() { assert(gate && enabled, 'group rights denied') } }
  const host = { get(name) {
    if (name === 'agentPresets') return registry
    if (name === 'profileContext') return { name: 'fixture', home, dir: path.join(home, 'profile'), installAnchor: path.join(home, 'package.json') }
    if (name === 'wechatFeatures') return gate ? { access } : undefined
    if (name === 'skills') return { get: async (_name, { scope }) => scopeHasGroup(scope) ? HUMAN_WORKFLOW_SKILL : undefined }
    if (name === 'tools') return { get: (_name, scope) => scopeHasGroup(scope) ? {} : undefined }
    assert.fail(`unexpected service ${name}`)
  } }
  const create = () => { const library = new PrivateResourceLibrary(host, directory, { codec: { load: JSON.parse },
    promptModule: 'dsh-wechat-remote/private-resource-prompt', collaborationModule: 'dsh-wechat-remote/collaboration' }); libraries.push(library); return library }
  t.after(async () => { for (const library of libraries) await library.close(); await rm(home, { recursive: true, force: true }) })
  return { home, directory, host, registry, definitions, calls, base, create, allowNative(value) { nativeAllowed = value },
    checkCalls: () => checkCalls, rights(value) { enabled = value }, gate(value) { gate = value } }
}

test('v1 and explicit ordinary resources strip only our inherited capability, including nested base rows', async t => {
  const f = await fixture(t), library = f.create(); f.rights(false); f.gate(false)
  for (const resource of [ordinary(), ordinary({ schemaVersion: 2, capabilities: [], resourceId: 'v2-ordinary' })]) {
    const item = await install(library, resource)
    assert.equal(item.status, 'installed')
    const rows = f.definitions.get(item.presetId).plugins
    assert(!JSON.stringify(rows).includes('/collaboration'))
    assert.deepEqual(rows[1], f.base[1]); assert.deepEqual(rows[2].config, [f.base[2].config[1]])
    assert.equal(rows.at(-1).config.text, resource.systemPrompt)
    assert.equal(rows[0].config.suffix, 'native suffix')
  }
  assert.deepEqual(await library.definitions(signal()), [])
  assert.deepEqual(f.definitions.get('standard').plugins, f.base)
})

test('group capability is explicit, scoped, separately authorized and identity remains immutable', async t => {
  const f = await fixture(t), library = f.create(); await library.start()
  const resource = group(), installed = await install(library, resource)
  assert.equal(installed.status, 'installed')
  assert.equal(f.definitions.get(installed.presetId).plugins.filter(row => row.name.endsWith('/collaboration')).length, 1)
  assert.equal(f.definitions.get(installed.presetId).plugins[2].config.length, 1)
  const descriptors = await library.definitions(signal())
  assert.equal(descriptors.length, 1); assert.equal(descriptors[0].source, 'resource')
  assert.equal(descriptors[0].id, 'resource_' + resourceKey(resource)); assert.equal(descriptors[0].version, 1)
  assert.deepEqual(descriptors[0].definition, resource.assistant)
  assert.equal((await library.assistantStatus(signal()))[0].state, 'installed')
  assert.equal((await library.assistantStatus(signal(), { waitForReady: false }))[0].state, 'unknown')
  descriptors[0].definition.role = 'caller mutation'
  assert.equal((await library.definitions(signal()))[0].definition.role, resource.assistant.role)
  f.rights(false)
  assert.equal((await library.assistantStatus(signal()))[0].state, 'unknown', 'authority is rechecked before an async event reconcile')
  await library.setGroupAvailable(false)
  assert(!f.definitions.has(installed.presetId)); assert.equal(library.list()[0].enabled, true)
  assert.equal((await library.definitions(signal())).length, 1, 'historical definition does not depend on current authority')
  f.rights(true); await library.setGroupAvailable(true)
  assert.equal((await library.assistantStatus(signal()))[0].state, 'installed')
  await library.setEnabled(resource.resourceId, resource.version, false)
  await library.setGroupAvailable(false); await library.setGroupAvailable(true)
  assert.equal((await library.assistantStatus(signal()))[0].nativeState, 'disabled')
  assert(!f.definitions.has(installed.presetId), 'authority restoration never overrides a saved explicit resource off')
  assert.deepEqual(await readFile(path.join(f.directory, resourceKey(resource), 'resource.json')), pack(resource).bytes)
})

test('local definitions restore before native startup, survive component off, and exclude plain packages', async t => {
  const f = await fixture(t), library = f.create(), resource = group()
  await install(library, resource); await install(library, ordinary())
  await library.setEnabled(resource.resourceId, resource.version, false)
  const before = await library.definitions(signal()); await library.close()
  f.allowNative(false)
  const restored = f.create()
  assert.deepEqual(await restored.definitions(signal()), before)
  assert.deepEqual(await readResourceAssistantDefinitions(f.host, signal()), before)
  assert.deepEqual(await readResourceAssistantDefinitions({ get: () => undefined }, signal()), [])
  assert.deepEqual(await readResourceAssistantDefinitions({ get: () => ({ installAnchor: 'incomplete' }) }, signal()), [])
  const reads = f.checkCalls()
  assert.equal((await restored.assistantStatus(signal(), { waitForReady: false }))[0].nativeState, 'disabled')
  assert.equal(f.checkCalls(), reads)
  f.allowNative(true); await restored.start()
  assert(!f.definitions.has(resourcePresetId(resource))); assert(f.definitions.has(resourcePresetId(ordinary())))
  await restored.setEnabled(resource.resourceId, resource.version, true)
  assert.equal((await restored.assistantStatus(signal()))[0].state, 'installed')
  f.gate(false); await restored.setGroupAvailable(false)
  assert(!f.definitions.has(resourcePresetId(resource))); assert(f.definitions.has(resourcePresetId(ordinary())))
  f.gate(true); await restored.setGroupAvailable(true)
  assert.equal((await restored.assistantStatus(signal()))[0].state, 'installed')
})

test('a group package received while feature is off remains verified locally and recovers on explicit feature enable', async t => {
  const f = await fixture(t), library = f.create(); f.rights(false); await library.start()
  const item = await install(library, group())
  assert.equal(item.status, 'unavailable'); assert.equal(f.calls.length, 0)
  assert.equal((await library.definitions(signal())).length, 1)
  f.rights(true); await library.setGroupAvailable(true)
  assert.equal((await library.assistantStatus(signal()))[0].state, 'installed'); assert.equal(f.calls.length, 1)
  f.definitions.get(item.presetId).plugins[0].config.prefix = 'native content changed elsewhere'
  assert.equal((await library.assistantStatus(signal()))[0].state, 'unknown', 'local receipt alone cannot bless altered native composition')
})

test('trusted group guidance is data, while plain and group authored prompts remain literal and retain the original byte limit', async t => {
  const f = await fixture(t), library = f.create(), resource = group()
  resource.systemPrompt = '原始 {{model}} 与未闭合 {{，空白\r\n  '
  resource.assistant.role = '职业 {{model}}'
  resource.assistant.methods = ['角色方法 {{cwd}}']
  const item = await install(library, resource)
  const config = f.definitions.get(item.presetId).plugins.find(row => row.id === 'harness-private-resource-data').config
  assert.equal(config.text, resource.systemPrompt); assert.deepEqual(config.assistant, resource.assistant)
  let literal
  const ctx = { systemPrompt: { variable(name, read) { assert.equal(name, 'harness_private_resource_prompt'); literal = read() } } }
  new ResourcePromptData(ctx, config)
  assert.equal(literal, resource.systemPrompt + '\n\n' + assistantGuidance(resource.assistant))
  assert(literal.includes('角色方法')); assert(literal.includes('human_assistant_work_start'))
  assert(literal.startsWith(resource.systemPrompt), 'authored braces are never rewritten or interpolated')
  new ResourcePromptData(ctx, { text: resource.systemPrompt })
  assert.equal(literal, resource.systemPrompt, 'ordinary presets receive no occupational or group guidance')
  const maximal = 'x'.repeat(RESOURCE_PROMPT_MAX_BYTES)
  new ResourcePromptData(ctx, { text: maximal, assistant: resource.assistant })
  assert(literal.startsWith(maximal), 'local guidance must not reduce the accepted author text budget')
  assert.throws(() => new ResourcePromptData(ctx, { text: maximal + 'x' }))
  assert.throws(() => new ResourcePromptData(ctx, { text: 'ok', assistant: { ...resource.assistant, script: 'remote code' } }))
})

test('group authority withdrawal cancels pending native registration or diagnostics without blocking ordinary resources', async t => {
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
  const within = async promise => {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('group shutdown stalled')), 1000) })]) }
    finally { clearTimeout(timer) }
  }
  for (const phase of ['register', 'resolve']) {
    const f = await fixture(t), library = f.create(), resource = group()
    await library.start(); await install(library, ordinary())
    const pending = deferred(), entered = deferred(), original = f.registry[phase]
    f.registry[phase] = async (...args) => {
      const target = phase === 'register' ? args[0].id : args[0]
      const result = await original(...args)
      if (target === resourcePresetId(resource)) { entered.resolve(); await pending.promise }
      return result
    }
    const installing = install(library, resource)
    await within(entered.promise)
    f.rights(false)
    await within(library.setGroupAvailable(false))
    assert.equal((await installing).status, 'unavailable')
    assert(f.definitions.has(resourcePresetId(ordinary())))
    assert.equal((await library.definitions(signal())).length, 1)
    f.registry[phase] = original; pending.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert(!f.definitions.has(resourcePresetId(resource)), 'late native completion must release its own registration')
    f.rights(true); await library.setGroupAvailable(true)
    assert.equal((await library.assistantStatus(signal()))[0].state, 'installed')
  }
})
