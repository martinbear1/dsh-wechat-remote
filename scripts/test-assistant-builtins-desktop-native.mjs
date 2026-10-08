/** Read-only installed-archive contract test. No live profile, sessions, model,
 * credentials or package installation. All native runtime state is temporary. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { builtinComponent } from '../lib/assistant-presets/builtin-component.js'
import { BUILTIN_ASSISTANTS, builtinAssistants } from '../lib/assistant-presets/builtins.js'
import { assistantGuidance } from '../lib/assistant-presets/definition.js'
import { AssistantRegistry } from '../lib/assistant-presets/registry.js'
import { createNativeAssistantAdapter, nativeAssistantCodec, parseNativeAssistantBase, transformNativeAssistantBase } from '../lib/assistant-presets/native-adapter.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'
import { invokeHostRemote, nativeSessionPresetSelection } from '../lib/dsh-host-contract.js'
import { verifyNativePresetSettings } from './native-preset-settings-fixture.mjs'
import { FeatureAccess } from '../lib/feature-access.js'

const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; no silent native-test skip')
const childStage = process.env.HARNESS_BUILTIN_NATIVE_STAGE
const work = childStage || fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-builtins-native-'))
if (!childStage) {
const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
fs.readSync(fd, prefix, 0, 16, 0)
const json = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16)
const tree = JSON.parse(json), dataStart = 8 + prefix.readUInt32LE(4)
try {
  function materialize(entry, relative) {
    const target = path.resolve(work, relative)
    assert(target.startsWith(work + path.sep)); assert(!entry.link, 'archive links require explicit review')
    if (entry.files) { for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name)); return }
    if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
    else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
  }
  materialize(tree.files.dsh, 'dsh')
  // Windows pins loaded .node DLLs until process exit. Keep extraction and
  // cleanup in the parent, and run the native runtime in a joined child.
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, HARNESS_BUILTIN_NATIVE_STAGE: work },
    encoding: 'utf8', windowsHide: true, timeout: 60000 })
  process.stdout.write(output)
} finally {
  fs.closeSync(fd)
  assert(path.resolve(work).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
} else {
assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) && path.basename(work).startsWith('assistant-builtins-native-'))
let ctx, featureAccess
try {
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader, ModuleLoader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { SkillRegistry } = await load('@deepseek-ai/dsh-skill')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  // Inspect every shipped preset verbatim. This is a structural preservation
  // contract for the complete real standard declaration, not a claim that the
  // smaller runtime fixture below executes every native tool implementation.
  const presetsRoot = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh-web-app/presets')
  const originalPresetSources = new Map(fs.readdirSync(presetsRoot).filter(name => name.endsWith('.patch.yml'))
    .map(name => [name, fs.readFileSync(path.join(presetsRoot, name))]))
  assert(originalPresetSources.has('standard.patch.yml'))
  const codec = await nativeAssistantCodec(anchor)
  const nativeStandardDefinition = codec.load(originalPresetSources.get('standard.patch.yml').toString())[0].insert[0].config
  const nativeStandard = parseNativeAssistantBase(codec, { agentPreset: 'standard', content: JSON.stringify(nativeStandardDefinition.plugins) }, 'standard')
  const untouchedNativeStandard = structuredClone(nativeStandard)
  const stockIdentity = 'You are a coding agent powered by the {{model}} model.'
  for (const assistant of [...builtinAssistants(), { definition: { ...builtinAssistants()[0].definition, name: 'Structural custom profession', role: 'Custom role' } }]) {
    const transformed = transformNativeAssistantBase(nativeStandard, assistant.definition)
    assert.equal(transformed.length, nativeStandard.length + 1)
    for (let index = 0; index < nativeStandard.length; index++) {
      const original = nativeStandard[index]
      if (original.name !== '@deepseek-ai/dsh-persona') {
        assert.deepEqual(transformed[index], original, `all native row fields are retained: ${original.id}`)
        continue
      }
      let prefix = original.config.prefix
      if (prefix === stockIdentity || prefix.startsWith(stockIdentity + '\n') || prefix.startsWith(stockIdentity + '\r\n')) {
        prefix = 'You are an AI assistant powered by the {{model}} model.' + prefix.slice(stockIdentity.length)
      }
      assert.deepEqual(transformed[index], { ...original, config: { ...original.config,
        prefix: prefix + '\n\n' + assistantGuidance(assistant.definition), complete: false, includeRuntimeContext: true } },
      'only stock role neutralization, appended profession methods and explicit native runtime policy flags change; suffix and all other persona fields survive')
    }
    assert.deepEqual(transformed.at(-1), { id: 'harness-collaboration', name: '@harness-remote/dsh-wechat-remote/collaboration' })
    assert.deepEqual(nativeStandard, untouchedNativeStandard, 'derivation cannot mutate the shared native standard declaration')
    transformed[0].config = { changed: true }
    assert.deepEqual(nativeStandard, untouchedNativeStandard, 'derived declarations do not share mutable nested objects with their source')
  }
  const nativePresetSources = Object.fromEntries([...originalPresetSources].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]))
  const capabilityPackage = path.join(work, 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
  fs.mkdirSync(capabilityPackage, { recursive: true })
  fs.writeFileSync(path.join(capabilityPackage, 'package.json'), JSON.stringify({ name: '@harness-remote/dsh-wechat-remote', type: 'module', exports: { './collaboration': './collaboration.js' } }))
  fs.copyFileSync(fileURLToPath(new URL('../lib/collaboration.js', import.meta.url)), path.join(capabilityPackage, 'collaboration.js'))
  const nativeManifest = await import(new URL('typert.host.js', pathToFileURL(require.resolve('@deepseek-ai/dsh-api-session-controller'))))
  const createDescriptor = nativeManifest.TYPERT.invocations.find(item => item.namespace === 'session' && item.method === 'create')
  assert(createDescriptor)
  assert.equal(nativeSessionPresetSelection({ get: name => name === 'typert' ? { local: { get: id => id === 'session/create' ? createDescriptor : undefined } } : undefined }), true,
    'actual installed native codecs preserve per-session mode selection and acknowledgement')
  ctx = new Context(); ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
  featureAccess = new FeatureAccess({nodeId:()=>'builtin-feature-fixture',read:async()=>({schemaVersion:1,nodeId:'builtin-feature-fixture',accountInstance:'synthetic-owner',
    checkedAt:1000,expiresAt:61000,features:{group_assistant:{allowed:true,reason:'allowed',validUntil:61000},clawbot:{allowed:true,reason:'allowed',validUntil:61000}}})})
  await featureAccess.setGroupEnabled(true)
  ctx.provide('wechatFeatures', {access:featureAccess})
  ctx.provide('profileContext', { name: 'builtin-contract-fixture', dir: work, home: work, installAnchor: anchor })
  await ctx.plugin(Loader); await ctx.plugin(Projection); await ctx.plugin(SystemPrompt, {})
  new SessionStore(ctx); new AgentRegistry(ctx); new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
  const attached = [], model = { provider: 'fixture', model: 'no-network' }
  ctx.provide('agentDefaultModel', { currentSelection: () => model })
  ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
    resolveModelInfo: async () => ({ inputModalities: ['text'] }), stream() { assert.fail('new-session entry never submits a prompt') } })
  ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content) })
  ctx.provide('fileUploads', { registerAgentResolver: () => () => {} })
  ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: id => id === 'fixture-workspace'
    ? { id, path: work, attachSession: async sessionId => attached.push(sessionId) } : undefined })
  ctx.provide('fs', { resolve() { throw Error('no filesystem tool in fixture') } })
  ctx.provide('sessionQuery', { listSessions: async () => [] })
  await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 10 })
  const controller = new SessionController(ctx)
  await ctx.plugin(AgentPresets, { default: 'standard' })
  new SkillRegistry(ctx)
  const capabilityScopes = []
  ctx.provide('humanTools', { async mountCapabilities(owner) {
    capabilityScopes.push(owner)
    const disposers = ['human_capabilities', 'human_assistant_catalog'].map(name => owner.tools.register({ name,
      description: 'Scope contract fixture', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'object' }, render: () => [] }, async execute() { return {} } }))
    return () => disposers.reverse().forEach(dispose => dispose())
  } })
  const standard = await ctx.agentPresets.register({ id: 'standard', name: 'Standard', plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.\nNative fixture policy.', suffix: 'Native suffix.' } },
  ] })
  assert.equal((await ctx.agentPresets.resolve('standard')).broken, undefined)
  const originalDefaultConfig = JSON.stringify(ctx.agentPresets.config)
  const originalModelSelection = structuredClone(ctx.agentDefaultModel.currentSelection())
  // Exercise the real adapter inside a native Loader row activation. This is
  // deliberately stronger than the gate (whose initializer is backgrounded).
  let registry
  ctx.loader.builtins.fixtureAssistantGate = { async apply(owner) {
    registry = await AssistantRegistry.open({ load: async () => undefined, save: async () => assert.fail('startup must not write') },
      { nodeId: 'native_fixture', native: createNativeAssistantAdapter(owner), assertIdentity() {} })
  } }
  for (const identity of BUILTIN_ASSISTANTS) ctx.loader.builtins[identity.service] = builtinComponent(identity.templateId)
  await ctx.loader.root.update([{ id: 'fixture-gate', name: 'cordis:fixtureAssistantGate' },
    ...BUILTIN_ASSISTANTS.map(identity => ({ id: identity.service, name: 'cordis:' + identity.service }))])
  await ctx.loader.await()
  assert(registry)
  const notReady = await Promise.all(BUILTIN_ASSISTANTS.map(identity => ctx.get(identity.service).status()))
  assert(notReady.every(item => item.state === 'unknown'), 'native modes alone cannot claim ready without the working skill')
  assert.equal(capabilityScopes.length, 3, 'real exported component mounted inside all three actual native preset scopes')
  assert.equal(await ctx.skills.get('human-workflow'), undefined, 'native global skill remains absent')
  assert.equal(ctx.tools.get('human_capabilities'), undefined, 'native global tools remain absent')
  for (const owner of capabilityScopes) owner.skills.register(HUMAN_WORKFLOW_SKILL)
  assert.equal(await registry.verifyPreset('harness-teacher', new AbortController().signal), true)
  const statuses = await Promise.all(BUILTIN_ASSISTANTS.map(identity => ctx.get(identity.service).status()))
  assert(statuses.every(item => item.state === 'installed'), JSON.stringify(statuses.map(item => ({ id: item.id, state: item.state, reason: item.reason }))))
  const roster = await ctx.agentPresets.list()
  assert.deepEqual(roster.filter(item => item.id !== 'standard').map(item => [item.id, item.name, item.broken]), [
    ['harness-teacher', '教师助理', undefined], ['harness-project', '项目助理', undefined], ['harness-customizer', '定制助手', undefined],
  ])
  assert.equal(ctx.agentPresets.defaultId, 'standard')
  assert.equal(JSON.stringify(ctx.agentPresets.config), originalDefaultConfig, 'composing and mounting assistants does not change native preset/default configuration')
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), originalModelSelection, 'composing and mounting assistants does not change the native model selection')
  // Real 0.2.0 registry: withdrawing a selected definition does not repair its
  // configured default. Keep this regression independent of model/UI mocks.
  ctx.agentPresets.config.default = 'fixture-retired-assistant'
  const withdrawn = await ctx.agentPresets.register({ id: 'fixture-retired-assistant', plugins: [] })
  assert.equal((await ctx.agentPresets.remoteExportList()).presets.find(row => row.isDefault).id, 'fixture-retired-assistant')
  await withdrawn()
  assert.equal((await ctx.agentPresets.remoteExportList()).presets.some(row => row.isDefault), false)
  await assert.rejects(ctx.agentPresets.resolve(), error => error.code === 'agent-preset/not-found')
  const presetRead = { namespace: 'agentPresets', method: 'list', args: {}, signal: new AbortController().signal }
  const nativeReadGateway = { invoke: async request => {
    assert.equal(request.namespace, 'agentPresets'); assert.equal(request.method, 'list')
    return ctx.agentPresets.remoteExportList()
  } }
  const catalog = await invokeHostRemote(ctx, nativeReadGateway, presetRead)
  assert.deepEqual(catalog.defaultPreset, { id: 'fixture-retired-assistant', state: 'unavailable' })
  assert.equal(ctx.agentPresets.defaultId, 'fixture-retired-assistant', 'reading/launching assistants must not silently change defaults')
  assert.equal((await ctx.agentPresets.resolve('harness-teacher')).broken, undefined, 'an explicit per-session mode works independently')
  const created = await controller.create({ workspaceId: 'fixture-workspace', agentPreset: 'harness-teacher' })
  assert.equal(created.agentPreset, 'harness-teacher')
  assert.equal(ctx.agents.get(created.sessionId).session.header.agentPreset, 'harness-teacher')
  assert.deepEqual(attached, [created.sessionId])
  assert.equal(ctx.agentPresets.defaultId, 'fixture-retired-assistant', 'per-session create does not modify broken global defaults')
  assert.equal(ctx.agents.get(created.sessionId).session.snapshotEvents().some(event => event.type === 'user/message'), false)
  ctx.agentPresets.config.default = 'standard'
  assert.deepEqual((await invokeHostRemote(ctx, nativeReadGateway, presetRead)).defaultPreset, { id: 'standard', state: 'available' })
  const ordinary = await controller.create({ workspaceId: 'fixture-workspace' })
  assert.equal(ordinary.agentPreset, 'standard', 'ordinary create still resolves the native default')
  const ordinaryAgent = ctx.agents.get(ordinary.sessionId)
  assert.equal(ctx.tools.get('human_capabilities', ordinaryAgent), undefined, 'standard Agent cannot see a sibling collaboration preset tool')
  assert.equal(await ctx.skills.get('human-workflow', { scope: ordinaryAgent }), undefined, 'standard Agent cannot see a sibling collaboration skill')
  for (const identity of BUILTIN_ASSISTANTS) {
    const lease = await ctx.agentPresets.acquireScope(identity.presetId)
    assert(lease.key)
    assert(ctx.tools.get('human_capabilities', lease.key)); assert.equal((await ctx.skills.get('human-workflow', { scope: lease.key })).content, HUMAN_WORKFLOW_SKILL.content)
    await lease[Symbol.asyncDispose]()
    const doc = await ctx.agentPresets.readDocument(identity.presetId)
    assert.match(doc.content, /Native fixture policy/); assert.match(doc.content, /Native suffix/)
  }
  const teacher = ctx.agents.get(created.sessionId), originalCancel = teacher.cancel
  const teacherEvents = JSON.stringify(teacher.session.snapshotEvents()), ordinaryEvents = JSON.stringify(ordinaryAgent.session.snapshotEvents())
  teacher.cancel = () => assert.fail('turning off group features must not cancel a native Agent')
  try {
    await featureAccess.setGroupEnabled(false)
    for(let attempt=0;attempt<20 && (await ctx.agentPresets.list()).some(row=>row.id==='harness-teacher');attempt++) await new Promise(resolve=>setTimeout(resolve,10))
    assert.deepEqual((await ctx.agentPresets.list()).map(item=>item.id),['standard'])
    assert.equal(ctx.agents.get(created.sessionId),teacher); assert.equal(ctx.agents.get(ordinary.sessionId),ordinaryAgent)
    assert.equal(JSON.stringify(teacher.session.snapshotEvents()),teacherEvents); assert.equal(JSON.stringify(ordinaryAgent.session.snapshotEvents()),ordinaryEvents)
    assert.equal(JSON.stringify(ctx.agentPresets.config),originalDefaultConfig); assert.deepEqual(ctx.agentDefaultModel.currentSelection(),originalModelSelection)
    assert.equal(ctx.tools.get('human_capabilities',ordinaryAgent),undefined)
  } finally {teacher.cancel=originalCancel}
  await ctx.loader.root.update([]); await ctx.loader.await()
  assert.deepEqual((await ctx.agentPresets.list()).map(item => item.id), ['standard'])
  await standard()
  await registry.close()
  const { PluginPackages, readPluginMeta } = await load('@deepseek-ai/dsh-app-boot')
  // Use the installed native loader's active resolver, including profile hooks;
  // no project-local resolve implementation or live profile configuration.
  const resolvePluginResource = (specifier, parentURL) => {
    const loader = ModuleLoader.fromInternal()
    assert(loader, 'the installed native module resolver must be available')
    const result = loader.version === 'v2' ? loader.resolveSync(parentURL, { specifier, attributes: {} })
      : loader.resolveSync(specifier, parentURL, {})
    return fileURLToPath(result.url)
  }
  const project = fileURLToPath(new URL('../', import.meta.url)), profileDir = path.join(work, 'metadata-profile')
  const fixtures = []
  const fixtureIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="3" fill="#3575d4"/></svg>'
  for (const kind of ['core', 'installer']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(project, kind === 'core' ? 'package.json' : 'installer/package.json'), 'utf8'))
    const owned = path.join(profileDir, 'embedded', kind), decoy = path.join(profileDir, 'node_modules', manifest.name)
    for (const directory of [owned, decoy]) {
      fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ ...manifest, icon: 'fixture-icon.svg' }))
      fs.writeFileSync(path.join(directory, 'fixture-icon.svg'), fixtureIcon)
      const assetRoot = path.join(directory, kind === 'core' ? 'lib' : 'native/lib', 'assistant-presets')
      fs.mkdirSync(assetRoot, { recursive: true })
      fs.cpSync(path.join(project, 'lib/assistant-presets/locales'), path.join(assetRoot, 'locales'), { recursive: true })
      for (const part of ['teacher', 'project', 'customizer']) fs.copyFileSync(path.join(project, `lib/assistant-presets/builtin-${part}.js`), path.join(assetRoot, `builtin-${part}.js`))
      fs.copyFileSync(path.join(project, 'lib/collaboration.js'), path.join(assetRoot, '../collaboration.js'))
      const libRoot = path.dirname(assetRoot)
      if (kind === 'installer') fs.copyFileSync(path.join(project, 'package.json'), path.join(directory, 'native/package.json'))
      for (const file of ['assistant-presets/native-adapter.js', 'assistant-presets/definition.js', 'assistant-presets/builtins.js',
        'assistant-presets/builtin-definitions-v1.js', 'assistant-presets/interaction-guidance.js', 'human-workflow/data.js', 'human-workflow/dsh-skill.js']) {
        fs.mkdirSync(path.dirname(path.join(libRoot, file)), { recursive: true }); fs.copyFileSync(path.join(project, 'lib', file), path.join(libRoot, file))
      }
    }
    fixtures.push({ manifest, owned, decoy, kind })
  }
  const metadataContext = new Context()
  try {
    await metadataContext.plugin(PluginPackages, { resolution: { profilesDir: work, profileDir, linkedRoots: [],
      localPackageNames: fixtures.map(item => item.manifest.name), entries: fixtures.map(item => ({name:item.manifest.name,
        packageDir:item.decoy,version:item.manifest.version,declarer:path.join(item.decoy,'package.json'),scope:'profile'})) } })
    for (const { manifest, owned, kind } of fixtures) for (const [part, expectedTitle] of [['teacher','教师助理'],['project','项目助理'],['customizer','定制助手']]) {
      const parent = pathToFileURL(path.join(owned, 'package.json')).href, specifier = `${manifest.name}/assistant-${part}`
      const expected = path.join(owned, kind === 'core' ? 'lib' : 'native/lib', `assistant-presets/builtin-${part}.js`)
      assert.equal(resolvePluginResource(specifier, parent), expected, 'native ESM/profile resolution must retain owner self-reference, not same-named profile package')
      assert.equal(createRequire(parent).resolve(specifier), expected, 'CJS/profile resolution retains the same owner')
      assert.equal(readPluginMeta(specifier, parent)?.title?.zh, expectedTitle)
      const localePath = resolvePluginResource(specifier + '/locale/zh.json', parent)
      assert(localePath.startsWith(owned + path.sep), 'display metadata cannot be read from the decoy package')
    }
    // A generic fixture verifies the native manifest contract without shipping
    // or implying permission to use any third-party brand artwork.
    for (const { manifest, owned } of fixtures) {
      const manifestFile = path.join(owned, 'package.json'), parent = pathToFileURL(manifestFile).href
      const expectedCollaboration = path.join(owned, manifest.name === 'dsh-wechat-remote' ? 'native/lib/collaboration.js' : 'lib/collaboration.js')
      assert.equal(resolvePluginResource(manifest.name + '/collaboration', parent), expectedCollaboration, 'capability component uses native owner self-reference rather than another same-name package')
      // Metadata may read an inactive package, but runtime authoring executes
      // from the selected Desktop installation. Its nested native/package.json
      // is a separate Node self-reference boundary; resolving the outer public
      // export from an inactive copy correctly points at a different runtime.
      const activeDesktop = fixtures.find(item => item.kind === 'installer').decoy
      const activeCollaboration = manifest.name === 'dsh-wechat-remote'
        ? path.join(activeDesktop, 'native/lib/collaboration.js') : expectedCollaboration
      const adapterFile = path.join(path.dirname(activeCollaboration), 'assistant-presets/native-adapter.js')
      const relocated = await import(pathToFileURL(adapterFile).href)
      if (manifest.name === '@harness-remote/dsh-wechat-remote') {
        const unrelatedOuter = createRequire(pathToFileURL(adapterFile)).resolve('dsh-wechat-remote/collaboration')
        assert.equal(unrelatedOuter, path.join(activeDesktop, 'native/lib/collaboration.js'),
          'standalone core can resolve a same-name Desktop package nearby, but it belongs to another installation')
        assert.notEqual(fs.realpathSync(unrelatedOuter), fs.realpathSync(expectedCollaboration))
      } else {
        assert.equal(fs.realpathSync(createRequire(pathToFileURL(adapterFile)).resolve('dsh-wechat-remote/collaboration')),
          fs.realpathSync(activeCollaboration), 'the active nested Desktop runtime resolves its public export to the exact executing component')
        const staleAdapterFile = path.join(owned, 'native/lib/assistant-presets/native-adapter.js')
        const stale = await import(pathToFileURL(staleAdapterFile).href)
        assert.notEqual(stale.nativeCollaborationModule(), 'dsh-wechat-remote/collaboration',
          'an unselected old Desktop copy must not claim the active installation public component')
      }
      assert.equal(relocated.nativeCollaborationModule(), manifest.name + '/collaboration', 'the shipped authoring module chooses its actual core or Desktop outer package, not a hardcoded research package')
      const meta = readPluginMeta(manifest.name, parent)
      assert.equal(meta?.icon, 'data:image/svg+xml;base64,' + Buffer.from(fixtureIcon).toString('base64'))
      assert.equal(meta?.title?.zh, '微信连接')
      assert.equal(meta?.error, undefined)
      for (const invalidIcon of ['https://example.invalid/logo.svg', '../outside-fixture.svg', 'too-large.svg']) {
        fs.writeFileSync(path.join(path.dirname(owned), 'outside-fixture.svg'), fixtureIcon)
        fs.writeFileSync(path.join(owned, 'too-large.svg'), Buffer.alloc(256 * 1024 + 1))
        fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, icon: invalidIcon }))
        const rejected = readPluginMeta(manifest.name, parent)
        assert.equal(rejected?.icon, undefined, 'invalid artwork is not admitted')
        assert.equal(rejected?.title?.zh, '微信连接', 'icon diagnostics retain localized display text')
        assert.match(rejected?.error || '', /icon must be a relative file path|icon must remain inside|icon exceeds 256 KiB/)
      }
      fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, icon: 'fixture-icon.svg' }))
    }
  } finally { await metadataContext.fiber.dispose() }
  const settingsChecks = await verifyNativePresetSettings({ load, work, invokeHostRemote })
  for (const [name, bytes] of originalPresetSources) assert.deepEqual(fs.readFileSync(path.join(presetsRoot, name)), bytes,
    `original native preset source remains byte-identical after derivation and scope lifecycle: ${name}`)
  console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
    nativePresetSources, nativeStandardRows: nativeStandard.map(row => ({ id: row.id, module: row.name })),
    checks: ['complete shipped standard declaration non-persona rows preserved field-for-field; original preset files byte-identical',
      'native Loader component lifecycle', 'three actual registry modes', 'native acquireScope mount', 'default unchanged', 'owned dispose removes only builtins',
      'account-qualified group pause withdraws only owned presets, preserves both existing native Agents and events, and never cancels tasks',
      'actual exported collaboration component mounts only in native preset scopes', 'standard Agent and host have no collaboration tools or skill',
      'scoped readiness cannot be supplied by a global skill', 'core and Desktop authoring choose their actual owning package exports',
      'native request and result retain per-session mode', 'withdrawn selected default is reported without mutation',
      'actual native session creation with explicit mode and workspace while default is unavailable', 'no automatic message', 'ordinary default creation retained',
      'native profile resolver self-reference beats same-name package for ESM and CJS', 'native Chinese component metadata resolves within owning core/installer package',
      'native manifest icon accepts contained SVG and rejects URL/traversal/oversize without losing display text', ...settingsChecks], liveProfileTouched: false }))
} finally {
  await ctx?.fiber.dispose()
  featureAccess?.close()
}
}
