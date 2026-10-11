/** Public installed application archive only. All runtime state, profiles,
 * resource files and sessions are isolated fixtures; no network/model call. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; no silent native-test skip')
const childStage = process.env.HARNESS_RESOURCE_NATIVE_STAGE
const work = childStage || fs.mkdtempSync(path.join(os.tmpdir(), 'private-resources-native-'))
if (!childStage) {
  const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
  fs.readSync(fd, prefix, 0, 16, 0)
  const json = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16)
  const tree = JSON.parse(json), dataStart = 8 + prefix.readUInt32LE(4)
  try {
    function materialize(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep)); assert(!entry.link, 'archive links require review')
      if (entry.files) { for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name)); return }
      if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
    }
    materialize(tree.files.dsh, 'dsh')
    await build({ entryPoints: {
      library: fileURLToPath(new URL('../src/private-resources/library.ts', import.meta.url)),
      prompt: fileURLToPath(new URL('../src/private-resources/native.ts', import.meta.url)),
      adapter: fileURLToPath(new URL('../src/assistant-presets/native-adapter.ts', import.meta.url)),
    }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outExtension: { '.js': '.mjs' },
    outdir: path.join(work, 'fixture-code'), logLevel: 'silent' })
    // Native .node modules stay pinned on Windows until the child exits.
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_RESOURCE_NATIVE_STAGE: work }, encoding: 'utf8', windowsHide: true, timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    assert(path.resolve(work).startsWith(path.resolve(os.tmpdir()) + path.sep))
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
} else {
  assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) && path.basename(work).startsWith('private-resources-native-'))
  const { PrivateResourceLibrary } = await import(pathToFileURL(path.join(work, 'fixture-code/library.mjs')).href)
  const { default: ResourcePromptData } = await import(pathToFileURL(path.join(work, 'fixture-code/prompt.mjs')).href)
  const { nativeAssistantCodec } = await import(pathToFileURL(path.join(work, 'fixture-code/adapter.mjs')).href)
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { default: JsonlPersistence } = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { default: SessionQuery } = await load('@deepseek-ai/dsh-session-query')
  const codec = await nativeAssistantCodec(anchor), directory = path.join(work, 'local-library')
  const libraries = [], leases = []
  let ctx
  try {
    ctx = new Context(); ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    await ctx.plugin(Loader); await ctx.plugin(Projection); await ctx.plugin(SystemPrompt, {})
    ctx.loader.builtins.privateResourcePrompt = ResourcePromptData
    new SessionStore(ctx); new AgentRegistry(ctx); new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
    new JsonlPersistence(ctx, { root: path.join(work, 'synthetic-sessions'), compression: 'none' }); new SessionQuery(ctx)
    const model = { provider: 'fixture', model: 'no-network' }
    ctx.provide('agentDefaultModel', { currentSelection: () => model })
    ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
      resolveModelInfo: async () => ({ inputModalities: ['text'] }), stream() { assert.fail('resource installation cannot submit a prompt') } })
    ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content),
      imageLimits: { maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1, maxImagePixels: 1, maxImageDimension: 1, mediaTypes: [] } })
    ctx.provide('fileUploads', { registerAgentResolver: () => () => {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: id => id === 'fixture-workspace'
      ? { id, path: work, attachSession: async () => {} } : undefined })
    ctx.provide('fs', { resolve() { throw Error('no filesystem tool in fixture') } })
    await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 10 })
    const controller = new SessionController(ctx)
    await ctx.plugin(AgentPresets, { default: 'standard' })
    const baseline = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: {
      prefix: 'Stock role.', suffix: 'Native suffix.', complete: false, includeRuntimeContext: true,
    } }]
    const disposeStandard = await ctx.agentPresets.register({ id: 'standard', name: 'Standard', plugins: structuredClone(baseline) })
    assert.equal((await ctx.agentPresets.resolve('standard')).broken, undefined)
    const standardBefore = await ctx.agentPresets.readDocument('standard')
    const globalPrompt = renderPrompt(await ctx.systemPrompt.assemble())
    const createLibrary = () => { const library = new PrivateResourceLibrary(ctx, directory, { codec, promptModule: 'cordis:privateResourcePrompt' }); libraries.push(library); return library }
    const library = createLibrary(); await library.start(); assert(!fs.existsSync(directory))
    const sha = value => createHash('sha256').update(value).digest('hex')
    const literal = '  你是 {{user}} 的朋友。\r\n保留 {{bad syntax!}}、{{model}}、未闭合 {{ 和中文 😊\n  '
    const expectedPrompt = [globalPrompt, literal, 'Native suffix.'].filter(Boolean).join('\n\n')
    const pack = patch => {
      const resource = { schemaVersion: 1, kind: 'preset', resourceId: 'story-helper', version: '1.0.0', name: '故事角色',
        description: 'Native isolated fixture', basePreset: 'standard', systemPrompt: literal, ...patch }
      const bytes = Buffer.from(JSON.stringify(resource))
      return { bytes, release: { resourceId: resource.resourceId, version: resource.version, bytes: bytes.length, sha256: sha(bytes) } }
    }
    const one = pack(), installed = await library.install(one.bytes, one.release)
    assert.equal(installed.status, 'installed', installed.message)
    assert((await ctx.agentPresets.list()).some(row => row.id === installed.presetId && !row.broken))
    const lease = await ctx.agentPresets.acquireScope(installed.presetId); leases.push(lease)
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: lease.key })), expectedPrompt, 'authored braces remain literal through the real native systemPrompt renderer')
    assert(!renderPrompt(await ctx.systemPrompt.assemble()).includes('你是'), 'private persona must not leak into global/default scopes')
    const created = await controller.create({ workspaceId: 'fixture-workspace', agentPreset: installed.presetId })
    const agent = ctx.agents.get(created.sessionId)
    assert.equal(created.agentPreset, installed.presetId); assert.equal(agent.session.header.agentPreset, installed.presetId)
    assert(!agent.session.snapshotEvents().some(event => event.type === 'user/message'), 'install/create never runs a model')
    const events = JSON.stringify(agent.session.snapshotEvents()), originalCancel = agent.cancel
    agent.cancel = () => assert.fail('resource toggle must not cancel an existing Agent')
    const two = pack({ version: '1.1.0', systemPrompt: 'Version two {{user}}.' }), second = await library.install(two.bytes, two.release)
    assert.equal(second.status, 'installed'); assert.notEqual(second.presetId, installed.presetId)
    assert.equal((await ctx.agentPresets.list()).find(row => row.id === installed.presetId).name, '故事角色 · 1.0.0')
    assert.equal((await ctx.agentPresets.list()).find(row => row.id === second.presetId).name, '故事角色 · 1.1.0')
    // Create real persisted native sessions, then release both Agents. Later
    // checks must resolve their persisted IDs, not retained in-memory revisions.
    const coldIds = []
    for (const row of [installed, second]) {
      const handle = await ctx.agents.create({ sessionId: `resource-cold-${row.version}`, agentOptions: model,
        meta: { cwd: work, delegationDepth: 0, agentPreset: row.presetId }, setup: async owner => { await ctx.agentPresets.mount(owner, row.presetId) } })
      handle.agent.session.append('agent-preset/selected', { agentPreset: row.presetId })
      await handle.agent.whenIdle(); const header = structuredClone(handle.agent.session.header)
      const history = structuredClone(handle.agent.session.snapshotEvents())
      assert(history.length > 0)
      await handle.dispose()
      assert.equal(ctx.agents.get(header.id), undefined); assert.equal(ctx.sessions.get(header.id), undefined)
      coldIds.push({ header, history, row })
    }
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: lease.key })), expectedPrompt)
    assert.equal((await library.setEnabled('story-helper', '1.0.0', false)).status, 'disabled')
    assert(!(await ctx.agentPresets.list()).some(row => row.id === installed.presetId), 'disabled definition is unavailable to new sessions')
    assert.equal(ctx.agents.get(created.sessionId), agent)
    assert.equal(JSON.stringify(agent.session.snapshotEvents()), events, 'existing session events are unchanged')
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: agent })), expectedPrompt, 'existing native Agent retains its exact preset generation')
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: lease.key })), expectedPrompt, 'retained scope lease survives withdrawing definition')
    await assert.rejects(ctx.agentPresets.resolve(installed.presetId), error => error.code === 'agent-preset/not-found')
    assert.equal(ctx.agentPresets.defaultId, 'standard')
    assert.deepEqual(await ctx.agentPresets.readDocument('standard'), standardBefore)
    assert.deepEqual(ctx.agentDefaultModel.currentSelection(), model)
    await library.close()
    assert.deepEqual((await ctx.agentPresets.list()).map(row => row.id), ['standard'])
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: agent })), expectedPrompt, 'provider disposal never mutates a retained native Agent')
    const restored = createLibrary(); await restored.start()
    assert.equal(restored.list().find(row => row.version === '1.0.0').status, 'disabled')
    assert.equal(restored.list().find(row => row.version === '1.1.0').status, 'installed')
    await assert.rejects(controller.create({ sessionId: coldIds[0].header.id, workspaceId: 'fixture-workspace' }),
      error => error.code === 'agent-preset/not-found', 'cold resume does not have a saved definition snapshot when its preset is disabled')
    assert.equal(ctx.agents.get(coldIds[0].header.id), undefined)
    const reader = await ctx.sessionPersistence.open(coldIds[0].header.id, 'read')
    try {
      assert.deepEqual(reader.header, coldIds[0].header)
      assert.deepEqual((await reader.read()).events, coldIds[0].history, 'failed cold resume leaves persisted history readable and unchanged')
    } finally { await reader.close() }
    assert.equal((await restored.setEnabled('story-helper', '1.0.0', true)).status, 'installed')
    for (const saved of coldIds) {
      const resumed = await controller.create({ sessionId: saved.header.id, workspaceId: 'fixture-workspace' })
      const coldAgent = ctx.agents.get(resumed.sessionId)
      assert.equal(resumed.agentPreset, saved.row.presetId)
      assert.deepEqual(coldAgent.session.header, saved.header)
      const resumedEvents = coldAgent.session.snapshotEvents()
      assert.deepEqual(resumedEvents.slice(0, saved.history.length), saved.history)
      assert(resumedEvents.slice(saved.history.length).every(event => event.type === 'session/end-seed'),
        'only the native cold-resume boundary may be appended; resource library does not rewrite history')
      const role = saved.row.version === '1.0.0' ? literal : 'Version two {{user}}.'
      assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: coldAgent })), [globalPrompt, role, 'Native suffix.'].filter(Boolean).join('\n\n'),
        'cold native resume resolves the correct explicitly retained installed resource version')
    }
    const reopened = await controller.create({ workspaceId: 'fixture-workspace', agentPreset: installed.presetId })
    assert.equal(reopened.agentPreset, installed.presetId)
    const broken = pack({ resourceId: 'missing-base', basePreset: 'absent' })
    assert.equal((await restored.install(broken.bytes, broken.release)).status, 'unavailable')
    assert.equal((await ctx.agentPresets.resolve(second.presetId)).broken, undefined, 'one failed resource does not withdraw valid resources')
    const conflict = pack({ resourceId: 'conflict' }), conflictId = `hr-resource-conflict-${sha('1.0.0').slice(0, 12)}`
    const foreign = await ctx.agentPresets.register({ id: conflictId, name: 'Existing native mode', plugins: [] })
    assert.equal((await restored.install(conflict.bytes, conflict.release)).status, 'unavailable')
    await restored.close(); assert.equal((await ctx.agentPresets.list()).find(row => row.id === conflictId).name, 'Existing native mode')
    await foreign(); await disposeStandard(); agent.cancel = originalCancel
    console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
      checks: ['native hot register and explicit new session selection', 'exact literal persona through real native rendering',
        'no global persona/default/model mutation', 'immutable versions coexist', 'native disable/dispose removes only owned definitions',
        'retained Agent and scope keep original revision with events untouched', 'offline restore respects saved disabled state',
        'disabled old preset prevents cold resume without deleting history; re-enable restores it',
        'true persisted cold sessions resolve their own retained resource version after provider restart',
        're-enable supports new sessions', 'failed base and conflicting native IDs isolate to one resource'],
      liveProfileTouched: false, modelCalls: 0 }))
  } finally {
    for (const library of libraries) await library.close()
    for (const lease of leases) await lease[Symbol.asyncDispose]()
    await ctx?.fiber.dispose()
  }
}
