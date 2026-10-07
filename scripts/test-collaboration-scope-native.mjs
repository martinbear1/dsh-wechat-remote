/** Installed-DSH scope contract, using only temporary files and in-memory
 * sessions. No live profile, cloud, WeChat, shell execution or model calls.
 *
 * The shipped native YAML is inspected verbatim. Runtime presets deliberately
 * use its persona/fs/skill and PTC presentation rows, not the whole Desktop app:
 * this tests the real registry, scope chain, tools, skills and native/PTC wire
 * projections without starting unrelated services or executing PTC code.
 * Product modules are copied beside the installed native modules so none of
 * their imports accidentally use this repository's older development SDK.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR must name the installed app.asar; never silently skip')
const childStage = process.env.HARNESS_COLLABORATION_NATIVE_STAGE
const work = childStage || fs.mkdtempSync(path.join(os.tmpdir(), 'collaboration-scope-native-'))
const project = fileURLToPath(new URL('../', import.meta.url))

if (!childStage) {
  const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
  try {
    fs.readSync(fd, prefix, 0, 16, 0)
    const bytes = Buffer.alloc(prefix.readUInt32LE(12))
    fs.readSync(fd, bytes, 0, bytes.length, 16)
    const tree = JSON.parse(bytes), dataStart = 8 + prefix.readUInt32LE(4)
    function materialize(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep), 'archive target must stay inside the new temporary directory')
      assert(!entry.link, 'archive links require a separate review')
      if (entry.files) {
        for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name))
        return
      }
      if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else {
        const data = Buffer.alloc(entry.size)
        fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset))
        fs.writeFileSync(target, data)
      }
    }
    materialize(tree.files.dsh, 'dsh')
    const productRoot = path.join(work, 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
    fs.mkdirSync(productRoot, { recursive: true })
    fs.copyFileSync(path.join(project, 'package.json'), path.join(productRoot, 'package.json'))
    fs.cpSync(path.join(project, 'lib'), path.join(productRoot, 'lib'), { recursive: true })
    // Product-owned, pure-JS codecs are not part of DSH. Copy just these, never
    // this checkout's @deepseek-ai dependencies (which would mask SDK drift).
    for (const dependency of ['tweetnacl', 'pngjs', 'jpeg-js']) {
      fs.cpSync(path.join(project, 'node_modules', dependency), path.join(productRoot, 'node_modules', dependency), { recursive: true })
    }
    assert(fs.existsSync(path.join(productRoot, 'lib/collaboration.js')), 'build the current collaboration component first')
    // Native DLLs are released when this joined child exits, before cleanup.
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_COLLABORATION_NATIVE_STAGE: work },
      encoding: 'utf8', windowsHide: true, timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()))
    assert(path.basename(work).startsWith('collaboration-scope-native-'))
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
} else {
  assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()))
  assert(path.basename(work).startsWith('collaboration-scope-native-'))
  await verify()
}

async function verify() {
  const trace = message => { if (process.env.HARNESS_SCOPE_TRACE) process.stderr.write(message + '\n') }
  async function bounded(label, promise) {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' did not settle within 5 seconds')), 5000)
    })]) } finally { clearTimeout(timer) }
  }
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const productRoot = path.join(work, 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
  const product = file => import(pathToFileURL(path.join(productRoot, 'lib', file)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader, EntryTree } = await load('@deepseek-ai/cordis-plugin-loader')
  const { scopeOf } = await load('@deepseek-ai/dsh-scope')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt, renderContextSections } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { SkillRegistry } = await load('@deepseek-ai/dsh-skill')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { default: NodePtcRuntime } = await load('@deepseek-ai/dsh-ptc-runtime-node')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { applyChildComposition, childSessionMeta, appendDelegatedPolicyOverrides, captureDelegatedPolicyOverrides } = await load('@deepseek-ai/dsh-subagent')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { HumanToolsService } = await product('human-tools/service.js')
  const { default: collaborationComponent } = await product('collaboration.js')
  const { builtinComponent } = await product('assistant-presets/builtin-component.js')
  const { BUILTIN_ASSISTANTS, builtinAssistants } = await product('assistant-presets/builtins.js')
  const { nativeAssistantCodec, parseNativeAssistantBase, transformNativeAssistantBase } = await product('assistant-presets/native-adapter.js')

  const ctx = new Context(), controllerServices = [], signal = new AbortController().signal
  const checks = [], counts = {}, nodeId = 'native_scope_fixture_' + 'a'.repeat(16)
  let backend, skillsFiber, failure, nativeSkillsWereReloaded = false, probeCalls = 0, externalCalls = 0, modelCalls = 0
  const memory = initial => {
    let value = structuredClone(initial)
    return { async load() { return structuredClone(value) }, async save(next) { value = structuredClone(next) } }
  }
  const forbidden = label => () => assert.fail(label)
  const config = {
    enabled: true, store: memory({ schemaVersion: 1, records: [] }),
    assistants: { registryStore: memory(), businessStore: memory(), sessionIntentStore: memory() },
    workflow: {
      transport: { nodeId, assertIdentity() {}, async request() {
        externalCalls++
        // A backend discovery timer is allowed to run, but never has a real
        // transport. No request is sent; no fabricated cloud success is used.
        throw Object.assign(new Error('offline in isolated scope fixture'), { code: 'fixture-offline' })
      } },
      modeStore: memory(), recordStore: memory(), replicaStore: memory(),
      lifecycleStore: memory(), receiverKeyStore: memory(), automationStore: memory(),
      coverStore: memory(), workspaceStore: memory(), receiverRoot: path.join(work, 'received'),
    },
  }
  try {
    ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    ctx.provide('profileContext', { name: 'collaboration-scope-fixture', dir: work, home: work, installAnchor: anchor })
    await ctx.plugin(Loader); await ctx.plugin(Projection); await ctx.plugin(SystemPrompt, {})
    new SessionStore(ctx); new AgentRegistry(ctx); await ctx.plugin(ToolRuntime, { mode: 'native' }); new Typert(ctx)
    skillsFiber = await ctx.plugin(SkillRegistry)
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'fixture', model: 'no-model' }) })
    ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
      resolveModelInfo: async () => ({ inputModalities: ['text'] }), stream() { modelCalls++; assert.fail('scope inspection must not invoke a model') } })
    ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content),
      validateImage: forbidden('no submitted image in fixture'), saveImage: forbidden('no image saving in fixture') })
    ctx.provide('fileUploads', { registerAgentResolver: () => () => {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [{ id: 'scope-workspace', path: work }],
      get: id => id === 'scope-workspace' ? { id, path: work, attachSession: async id => controllerServices.push(id) } : undefined })
    ctx.provide('fs', { resolve: forbidden('native filesystem must not execute in scope inspection') })
    // The real PTC provider is lazy: construction and schema projection never
    // execute code. Its effectful seams deliberately fail if inspection ever
    // regresses into starting a child process, sandbox, or filesystem action.
    ctx.provide('subprocess', { spawn: forbidden('no PTC subprocess in scope inspection') })
    ctx.provide('sandbox', { spawn: forbidden('no PTC sandbox in scope inspection') })
    ctx.provide('sandboxPolicy', { defaultMode: 'read-only', overrideOf: () => undefined,
      resolve: forbidden('no PTC execution policy in scope inspection') })
    await ctx.plugin(NodePtcRuntime, {})
    assert(ctx.get('ptcRuntime'), 'real PTC runtime must initialize before mounting the PTC preset')
    ctx.provide('sessionQuery', { listSessions: async () => [] })
    ctx.on('session/flush', async () => {})
    await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 10 })
    const controller = new SessionController(ctx)
    await ctx.plugin(AgentPresets, { default: 'standard' })
    const codec = await nativeAssistantCodec(anchor)
    const nativeRows = {}
    for (const id of ['standard', 'ptc', 'minimal', 'cordis']) {
      const source = fs.readFileSync(path.join(work, `dsh/node_modules/@deepseek-ai/dsh-web-app/presets/${id}.patch.yml`), 'utf8')
      assert(!source.includes('dsh-wechat-remote') && !source.includes('human-workflow'), 'shipped native modes must not contain product collaboration')
      const definition = codec.load(source)[0].insert[0].config
      nativeRows[id] = definition.plugins.filter(row => ['persona', 'tool-fs', 'tool-skill', 'tool-presentation'].includes(row.id))
      assert(nativeRows[id].some(row => row.id === 'persona'))
      if (id === 'ptc') assert(nativeRows[id].some(row => row.name === '@deepseek-ai/dsh-agent-tool-presentation' && row.config.mode === 'ptc'))
      await ctx.agentPresets.register({ id, name: id, plugins: nativeRows[id] })
      assert.equal((await ctx.agentPresets.resolve(id)).broken, undefined)
    }
    checks.push('read all four shipped native mode declarations; mount their persona/fs/skill rows and the real PTC presentation with native NodePtcRuntime')
    const probe = { name: 'native_scope_probe', description: 'In-memory native dispatch probe', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'object' }, render: () => [] }, execute() { probeCalls++; return { ok: true } } }
    ctx.tools.register(probe)
    // Neither ordinary custom mode invokes our authoring transform. The third
    // party has its own native scoped component; the user mode is an ordinary
    // independent copy of a native declaration. Both must remain untouched.
    const thirdPartyTool = { ...probe, name: 'third_party_scope_probe' }
    ctx.loader.builtins.thirdPartyScopeFixture = { inject: ['tools', 'skills', 'systemPrompt'], apply(owner) {
      owner.tools.register(thirdPartyTool)
      owner.skills.register({ name: 'third-party-method', description: 'Independent third-party method',
        source: 'bundled', provider: 'third-party-fixture', invocation: { modelInvocable: true, userInvocable: true }, content: 'Independent method.' })
      owner.systemPrompt.context({ name: 'third-party-fixture.instructions', order: 90, text: 'Independent third-party instructions.' })
    } }
    await ctx.agentPresets.register({ id: 'fixture-third-party', plugins: [
      ...structuredClone(nativeRows.standard), { id: 'third-party-only', name: 'cordis:thirdPartyScopeFixture' },
    ] })
    await ctx.agentPresets.register({ id: 'fixture-user-independent', plugins: structuredClone(nativeRows.standard) })
    const create = async id => {
      const result = await controller.create({ workspaceId: 'scope-workspace', agentPreset: id })
      const agent = ctx.agents.get(result.sessionId)
      assert.equal(result.agentPreset, id)
      assert.equal(ctx.agentPresets.composedPreset(agent.ctx), id)
      assert(!agent.session.snapshotEvents().some(event => event.type === 'user/message'))
      return agent
    }
    const ordinary = {}
    for (const id of ['standard', 'ptc', 'minimal', 'cordis', 'fixture-third-party', 'fixture-user-independent']) ordinary[id] = await create(id)
    await ctx.loader.await()
    const schemaSnapshot = scope => ctx.tools.schemas(scope).toSorted((a, b) => a.name.localeCompare(b.name))
    const presentationSnapshot = scope => ({ mode: ctx.tools.modeFor(scope), wire: ctx.tools.wireSchemas(scope), sdk: ctx.tools.sdkSchemas(scope) })
    const reorderedPresentation = value => ({ ...value, wire: { ...value.wire,
      schemas: value.wire.schemas.toSorted((a, b) => a.name.localeCompare(b.name)), knownNames: value.wire.knownNames.toSorted() },
      sdk: value.sdk.toSorted((a, b) => a.name.localeCompare(b.name)) })
    const baseline = Object.fromEntries(Object.entries(ordinary).map(([id, agent]) => [id, schemaSnapshot(agent)]))
    const presentations = Object.fromEntries(Object.entries(ordinary).map(([id, agent]) => [id, presentationSnapshot(agent)]))
    assert.equal(presentations.ptc.mode, 'ptc')
    assert.equal(presentations.standard.mode, 'native')
    assert.equal(ctx.tools.get('third_party_scope_probe', ordinary['fixture-third-party']), thirdPartyTool)
    assert.equal(ctx.tools.get('third_party_scope_probe', ordinary.standard), undefined)
    const globalBaseline = schemaSnapshot()
    const globalPresentation = presentationSnapshot()
    const originalDefaultConfig = JSON.stringify(ctx.agentPresets.config)
    const originalModelSelection = structuredClone(ctx.agentDefaultModel.currentSelection())
    const ordinaryDefinitions = Object.fromEntries(Object.entries(ordinary).map(([id, agent]) => [id,
      new Map(baseline[id].map(schema => [schema.name, ctx.tools.get(schema.name, agent)]))]))
    // Native per-preset plugins construct separate function instances. Compare
    // their complete metadata and function bodies; for already mounted native
    // definitions also require exact object identity throughout the lifecycle.
    const definitionContract = definition => JSON.parse(JSON.stringify(definition,
      (_key, value) => typeof value === 'function' ? { nativeFunction: String(value) } : value))
    const standardContracts = new Map([...ordinaryDefinitions.standard].map(([name, definition]) => [name, definitionContract(definition)]))
    async function view(agent) {
      const names = ctx.tools.schemas(agent).map(tool => tool.name)
      const skills = await ctx.skills.list({ scope: agent, cwd: work, signal })
      const context = renderContextSections(await ctx.systemPrompt.assemble({ agent, scope: agent }))
      return { names, skills: skills.map(skill => skill.name), context: context.filter(part => part.name.startsWith('harness-remote.')), fullContext: context }
    }
    const originalViews = Object.fromEntries(await Promise.all(Object.entries(ordinary).map(async ([id, agent]) => [id, await view(agent)])))
    async function cleanOrdinary(stage) {
      for (const [id, agent] of Object.entries(ordinary)) {
        const state = await view(agent)
        assert(!state.names.some(name => name.startsWith('human_')), `${stage}: ${id} leaked group tools`)
        assert(!state.skills.includes('human-workflow'), `${stage}: ${id} leaked group skill`)
        assert.deepEqual(state.context, [], `${stage}: ${id} leaked group runtime guidance`)
        assert.deepEqual(state.skills, originalViews[id].skills, `${stage}: ${id} native skill catalog changed`)
        // Deliberately reloading DSH's own SkillRegistry later legitimately
        // reorders its re-registered skill tool. Until then compare exact wire
        // order and SDK text; after that compare complete per-tool SDK contracts
        // and every other prompt section, without blaming the plugin for it.
        const comparableContext = value => nativeSkillsWereReloaded ? value.filter(part => part.name !== 'tools:sdk') : value
        assert.deepEqual(comparableContext(state.fullContext), comparableContext(originalViews[id].fullContext), `${stage}: ${id} native prompt/SDK changed`)
        assert.deepEqual(schemaSnapshot(agent), baseline[id], `${stage}: ${id} native tool contract changed`)
        const comparablePresentation = value => nativeSkillsWereReloaded ? reorderedPresentation(value) : value
        assert.deepEqual(comparablePresentation(presentationSnapshot(agent)), comparablePresentation(presentations[id]), `${stage}: ${id} native/PTC presentation changed`)
        for (const [name, definition] of ordinaryDefinitions[id]) {
          // The final case deliberately reloads DSH's native SkillRegistry,
          // so its dependent skill tool legitimately gets a new instance.
          if (nativeSkillsWereReloaded && name === 'skill') {
            assert.deepEqual(definitionContract(ctx.tools.get(name, agent)), definitionContract(definition))
          } else assert.equal(ctx.tools.get(name, agent), definition, `${stage}: ${id} native definition replaced: ${name}`)
        }
        assert.equal(ctx.tools.get('native_scope_probe', agent), probe)
      }
      assert(!ctx.tools.schemas().some(tool => tool.name.startsWith('human_')), `${stage}: group tools leaked globally`)
      assert.deepEqual(schemaSnapshot(), globalBaseline, `${stage}: global native tool contract changed`)
      assert.deepEqual(presentationSnapshot(), globalPresentation, `${stage}: global presentation changed`)
      assert(!(await ctx.skills.list({ signal })).some(skill => skill.name === 'human-workflow'), `${stage}: group skill leaked globally`)
      assert.equal(JSON.stringify(ctx.agentPresets.config), originalDefaultConfig, `${stage}: native preset/default config changed`)
      assert.deepEqual(ctx.agentDefaultModel.currentSelection(), originalModelSelection, `${stage}: native default model changed`)
    }
    await cleanOrdinary('before-backend')
    backend = await ctx.plugin(HumanToolsService, config)
    assert.equal(typeof ctx.get('humanTools').mountCapabilities, 'function')
    await assert.rejects(ctx.get('humanTools').mountCapabilities(ctx), /不能全局装载/)
    await cleanOrdinary('backend-only')
    const rows = BUILTIN_ASSISTANTS.map(identity => {
      ctx.loader.builtins[identity.service] = builtinComponent(identity.templateId)
      return { id: identity.service, name: 'cordis:' + identity.service }
    })
    await ctx.loader.root.update(structuredClone(rows)); await ctx.loader.await()
    for (const identity of BUILTIN_ASSISTANTS) {
      const status = await ctx.get(identity.service).status()
      assert.equal(status.state, 'installed', JSON.stringify(status))
    }
    const sessions = {}
    for (const identity of BUILTIN_ASSISTANTS) sessions[identity.presetId] = await create(identity.presetId)
    const base = parseNativeAssistantBase(codec, await ctx.agentPresets.readDocument('standard'), 'standard')
    const customDefinition = { ...builtinAssistants()[0].definition, name: '另一个职业的协作助手' }
    const customPlugins = transformNativeAssistantBase(base, customDefinition)
    assert(customPlugins.some(row => row.name.endsWith('/collaboration')), 'custom composer must include the reusable capability component')
    await ctx.agentPresets.register({ id: 'fixture-custom', plugins: customPlugins })
    sessions['fixture-custom'] = await create('fixture-custom')
    async function present(agent, stage) {
      const state = await view(agent), groups = state.names.filter(name => name.startsWith('human_'))
      assert.equal(groups.length, 40, `${stage}: expected all current collaboration tools, got ${groups.join(',')}`)
      assert.equal(new Set(state.names).size, state.names.length, `${stage}: duplicate tool names`)
      assert(state.names.includes('read') && state.names.includes('write') && state.names.includes('skill'), `${stage}: native tools lost`)
      for (const schema of baseline.standard) {
        assert.deepEqual(ctx.tools.schemas(agent).find(tool => tool.name === schema.name), schema,
          `${stage}: inherited native schema changed: ${schema.name}`)
        assert.deepEqual(definitionContract(ctx.tools.get(schema.name, agent)), standardContracts.get(schema.name),
          `${stage}: inherited native implementation/permission metadata changed: ${schema.name}`)
      }
      assert(state.skills.includes('human-workflow'), `${stage}: collaboration skill missing`)
      assert(state.context.some(part => part.name === 'harness-remote.human-actions'), `${stage}: collaboration context missing`)
      assert.equal(ctx.tools.get('native_scope_probe', agent), probe, `${stage}: native/global tool shadowed`)
      counts[stage] = groups.length
      return state
    }
    await Promise.all(Object.entries(sessions).map(([id, agent]) => present(agent, id)))
    for (const [id, agent] of Object.entries(sessions)) {
      for (const [name, args] of [['human_capabilities', { view: 'catalog' }], ['skill', { name: 'human-workflow' }]]) {
        const result = await ctx.tools.execute({ name, arguments: args, agent, callId: `scope-usable-${id}-${name}`, signal })
        assert.equal(result.isError, false, `${id}: scoped native dispatch failed: ${JSON.stringify(result)}`)
      }
    }
    for (const [id, agent] of Object.entries(ordinary)) {
      const result = await ctx.tools.execute({ name: 'human_capabilities', arguments: { view: 'catalog' }, agent,
        callId: `scope-denied-${id}`, signal })
      assert.equal(result.isError, true, `${id}: uncomposed collaboration capability must not execute`)
    }
    await cleanOrdinary('four-compositions-concurrent')
    checks.push('standard/PTC/minimal/cordis and independent third-party/user modes retain pre-backend native schema, SDK, prompt, skill and default configuration baselines')
    checks.push('teacher/project/customizer and an independently named custom mode each compose all 40 capabilities plus native tools')
    checks.push('all four collaboration compositions execute human_capabilities and native skill read; all six unrelated modes reject a direct collaboration call')

    // The native in-process spawn/fork driver calls applyChildComposition:
    // this inherits a precise parent revision, NOT an independent "standard"
    // agentPreset. A trusted host may instead explicitly mount another preset
    // through the factory setup API; that is not a model-facing spawn option.
    let childSerial = 0
    async function child(parent, explicitPreset) {
      const inheritedMeta = childSessionMeta(parent, 1, false)
      const handle = await parent.ctx.agents.create({ sessionId: 'scope-child-' + (++childSerial), parentAgent: parent,
        meta: { ...inheritedMeta, ...(explicitPreset ? { agentPreset: explicitPreset } : {}) }, signal,
        async setup(childCtx, childAgent) {
          appendDelegatedPolicyOverrides(childAgent.session, captureDelegatedPolicyOverrides(parent))
          if (explicitPreset) await childCtx.get('agentPresets').mount(childCtx, explicitPreset)
          else applyChildComposition(childCtx, parent, {})
        } })
      assert(ctx.agents.isOwnedBy(handle.agent.id, parent), 'native child ownership must remain accurate')
      assert.equal(ctx.agentPresets.composedPreset(handle.agent.ctx), explicitPreset || ctx.agentPresets.composedPreset(parent.ctx))
      assert(!handle.agent.session.snapshotEvents().some(event => event.type === 'user/message'))
      return handle
    }
    const delegated = []
    try {
      const inheritedTeacher = await child(sessions['harness-teacher']); delegated.push(inheritedTeacher)
      await present(inheritedTeacher.agent, 'native-delegated-teacher-child')
      const inheritedStandard = await child(ordinary.standard); delegated.push(inheritedStandard)
      const explicitStandard = await child(sessions['harness-teacher'], 'standard'); delegated.push(explicitStandard)
      for (const handle of [inheritedStandard, explicitStandard]) {
        const state = await view(handle.agent)
        assert.deepEqual(schemaSnapshot(handle.agent), baseline.standard)
        assert(!state.skills.includes('human-workflow')); assert.deepEqual(state.context, [])
      }
      for (const [id, parent] of Object.entries(ordinary).filter(([id]) => id !== 'standard')) {
        const inherited = await child(parent); delegated.push(inherited)
        const state = await view(inherited.agent)
        assert.deepEqual(schemaSnapshot(inherited.agent), baseline[id], `${id}: native child tools differ from parent`)
        assert.deepEqual(presentationSnapshot(inherited.agent), presentations[id], `${id}: native child presentation differs from parent`)
        assert.deepEqual(state.skills, originalViews[id].skills, `${id}: native child skills differ from parent`)
        assert(!state.skills.includes('human-workflow')); assert.deepEqual(state.context, [])
      }
      const explicitTeacher = await child(ordinary.standard, 'harness-teacher'); delegated.push(explicitTeacher)
      await present(explicitTeacher.agent, 'trusted-native-factory-explicit-teacher-child')
      await cleanOrdinary('child-composition-boundaries')
      checks.push('children of all four native modes plus third-party/user modes retain their own composition; collaboration children inherit only their parent preset; trusted explicit child presets isolate in both directions')
    } finally { for (const handle of delegated.reverse()) await handle.dispose() }

    // Even unavailable history of an unrelated standard session must not make
    // a collaboration-only replay gate reject its original native tools.
    const normal = ordinary.standard, snapshot = normal.session.snapshotEvents
    normal.session.snapshotEvents = () => { throw new Error('isolated native history failure') }
    try {
      const result = await ctx.tools.execute({ name: probe.name, arguments: {}, agent: normal, callId: 'plain-unrelated-tool', signal })
      assert.equal(result.isError, false, JSON.stringify(result))
    } finally { normal.session.snapshotEvents = snapshot }
    checks.push('unrelated standard native tool is not rejected by collaboration history/provenance checks')

    const teacherIdentity = BUILTIN_ASSISTANTS.find(item => item.templateId === 'teacher')
    await ctx.loader.root.update(structuredClone(rows.filter(row => row.id !== teacherIdentity.service))); await ctx.loader.await()
    assert(!(await ctx.agentPresets.list()).some(row => row.id === teacherIdentity.presetId))
    await assert.rejects(ctx.agentPresets.resolve(teacherIdentity.presetId))
    await present(sessions['harness-project'], 'project-after-teacher-disabled')
    // DSH intentionally retains the composition of already-created Agents.
    await present(sessions['harness-teacher'], 'existing-teacher-generation-retained')
    await cleanOrdinary('teacher-component-disabled')
    await ctx.loader.root.update(structuredClone(rows)); await ctx.loader.await()
    assert.equal((await ctx.get(teacherIdentity.service).status()).state, 'installed')
    const replacementTeacher = await create('harness-teacher')
    await present(replacementTeacher, 'new-teacher-generation-after-reenable')
    await cleanOrdinary('teacher-reenabled')
    checks.push('native component disable removes future selection, retains existing generation, leaves other modes unchanged; reenable works')

    trace('withdrawing backend')
    await bounded('backend withdrawal', backend.dispose()); backend = undefined
    for (const agent of [...Object.values(sessions), replacementTeacher]) {
      const state = await view(agent)
      assert(!state.names.some(name => name.startsWith('human_')), 'withdrawn backend must remove its scoped model capabilities')
      assert(!state.skills.includes('human-workflow'), 'withdrawn backend must remove its scoped skill')
      assert.deepEqual(state.context, [], 'withdrawn backend must remove scoped runtime instructions')
    }
    await cleanOrdinary('backend-withdrawn')
    trace('reloading backend')
    backend = await ctx.plugin(HumanToolsService, config)
    await bounded('native dependency reload', ctx.loader.await())
    // Shared-backend initialization is deliberately asynchronous; Loader only
    // joins entry activation, not optional service readiness. Wait for the
    // actual native dependency remount instead of manufacturing registrations.
    for (let attempt = 0; attempt < 250 && Object.values(sessions).some(agent =>
      ctx.tools.schemas(agent).filter(tool => tool.name.startsWith('human_')).length !== 40); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    trace('remounted schema counts: ' + JSON.stringify(Object.fromEntries(Object.entries(sessions).map(([id, agent]) =>
      [id, ctx.tools.schemas(agent).filter(tool => tool.name.startsWith('human_')).length]))))
    for (const [id, agent] of Object.entries(sessions)) {
      trace('checking reloaded ' + id)
      await bounded('reloaded scope ' + id, present(agent, id + '-backend-reloaded'))
    }
    await cleanOrdinary('backend-reloaded')
    checks.push('backend withdrawal and reload cannot leak registrations or leave stale callable tools')
    trace('withdrawing native skills')
    nativeSkillsWereReloaded = true
    await bounded('native skills withdrawal', skillsFiber.dispose()); skillsFiber = undefined
    for (const agent of Object.values(sessions)) {
      assert(!ctx.tools.schemas(agent).some(tool => tool.name.startsWith('human_')),
        'a missing native skill dependency must suspend the whole capability component')
    }
    await ctx.agentPresets.register({ id: 'fixture-late-skill', plugins: customPlugins })
    await assert.rejects(create('fixture-late-skill'), /waiting for skills/,
      'the native registry refuses an incomplete mode rather than silently publishing partial capabilities')
    skillsFiber = await ctx.plugin(SkillRegistry)
    const lateAgent = await bounded('late native skill injection', create('fixture-late-skill'))
    for (let attempt = 0; attempt < 250 && !ctx.tools.get('human_surface_share', lateAgent); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    await present(lateAgent, 'new-mode-after-late-skill-injection')
    for (const [id, agent] of Object.entries(sessions)) await present(agent, id + '-skills-restored')
    await cleanOrdinary('skills-restored')
    checks.push('missing native skills suspend scoped capabilities; late skill injection enables a new mode and restores existing modes')

    // Cancel a real Loader-owned capability row while the real shared backend
    // is still opening its ledger. Keep the Agent alive so a late ghost mount
    // cannot hide behind disposal of the whole lookup scope.
    trace('cancel pending scoped component')
    const cancelledAgent = await create('standard')
    await bounded('backend withdrawal before delayed readiness', backend.dispose())
    let releaseReady, observeMount, storeOpening = false
    const readyLatch = new Promise(resolve => { releaseReady = resolve })
    const mountEntered = new Promise(resolve => { observeMount = resolve })
    const delayedStore = { async load() { storeOpening = true; await readyLatch; return config.store.load() }, save: value => config.store.save(value) }
    backend = await ctx.plugin(HumanToolsService, { ...config, store: delayedStore })
    const delayedService = ctx.get('humanTools')
    // Instrument only entry into the real production apply function. Cordis
    // wraps injected service methods, so replacing a consumer-side service
    // proxy is not a reliable observation of what a different scope invokes.
    ctx.loader.builtins.pendingCollaborationProbe = { ...collaborationComponent, apply(scopedCtx) {
      assert.equal(scopeOf(scopedCtx), scopeOf(cancelledAgent.ctx))
      observeMount(); return collaborationComponent.apply(scopedCtx)
    } }
    class VolatileTree extends EntryTree { write() {} }
    let pendingTree, mounting
    // Agent contexts enforce declared service injection. A native test owner
    // explicitly injects Loader, just as AgentPresets does for PresetTree.
    const pendingOwner = await cancelledAgent.ctx.plugin({ name: 'pending-scope-fixture', inject: ['loader'], apply(owner) {
      pendingTree = new VolatileTree(owner)
      const pendingRow = { id: 'cancelled-collaboration', name: 'cordis:pendingCollaborationProbe' }
      pendingTree.root.data = [pendingRow]
      mounting = pendingTree.root.create(pendingRow)
      return () => pendingTree.root.stop()
    } })
    try {
      await bounded('scoped component entered backend readiness wait', Promise.race([mountEntered, mounting.then(() => mountEntered)]))
      const pendingFiber = pendingTree.store['cancelled-collaboration'].fiber
      assert(pendingFiber, 'the cancelled row must have a real native Fiber')
      assert(storeOpening && pendingTree.getTasks().length > 0, 'the production apply must actually wait on the real backend readiness')
      assert.deepEqual(schemaSnapshot(cancelledAgent), baseline.standard, 'capabilities must not publish before backend readiness')
      pendingTree.root.remove('cancelled-collaboration')
      assert.equal(pendingTree.store['cancelled-collaboration'], undefined, 'native Loader must remove the pending row')
      const disposing = pendingFiber.dispose()
      await new Promise(resolve => setTimeout(resolve, 20))
      releaseReady()
      await bounded('cancelled component lifecycle settlement', Promise.all([mounting, disposing]))
    } finally { releaseReady(); await pendingOwner.dispose() }
    await bounded('delayed backend readiness', delayedService.use(signal))
    await pendingTree.await()
    const cancelledState = await view(cancelledAgent)
    assert.deepEqual(schemaSnapshot(cancelledAgent), baseline.standard, 'late readiness must not resurrect disposed collaboration tools')
    assert(!cancelledState.skills.includes('human-workflow'), 'late readiness must not resurrect a disposed skill')
    assert.deepEqual(cancelledState.context, [], 'late readiness must not resurrect disposed runtime instructions')
    for (const [id, agent] of Object.entries(sessions)) await present(agent, id + '-after-pending-cancel')
    await cleanOrdinary('pending-component-cancelled')
    checks.push('disposing a Loader component during backend readiness leaves no late tools, skill or prompt; other live compositions recover')
    assert.equal(ctx.agentPresets.defaultId, 'standard')
    assert.equal(modelCalls, 0); assert.equal(probeCalls, 1)
    console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
      checks, counts, offlineDiscoveryAttempts: externalCalls, modelCalls, liveProfileTouched: false,
      limitation: 'native scope/registry integration with shipped persona/fs/skill/PTC presentation rows and native PTC provider; other full preset components and PTC execution are not exercised; not a full Desktop or WeChat end-to-end run' }))
  } catch (error) { failure = error; throw error }
  finally {
    trace('disposing fixture')
    try { await bounded('fixture disposal', ctx.fiber.dispose()) }
    catch (error) { if (!failure) throw error; process.stderr.write(error.message + '\n') }
  }
}
