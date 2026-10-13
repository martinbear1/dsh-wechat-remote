/** Research-only transitions against installed native DSH code.
 * All sessions/configurations live in a disposable fixture. No user profile,
 * existing chat, network, model, product source or delivery catalog is changed.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; no silent native-test skip')
const stage = process.env.HARNESS_RESOURCE_TRANSITION_STAGE
const work = stage || fs.mkdtempSync(path.join(os.tmpdir(), 'resource-transition-native-'))
if (!stage) {
  const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
  fs.readSync(fd, prefix, 0, 16, 0)
  const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
  const tree = JSON.parse(bytes), offset = 8 + prefix.readUInt32LE(4)
  try {
    function extract(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep)); assert(!entry.link, 'archive links require separate review')
      if (entry.files) { for (const [name, child] of Object.entries(entry.files)) extract(child, path.join(relative, name)); return }
      if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
      else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, offset + Number(entry.offset)); fs.writeFileSync(target, data) }
    }
    extract(tree.files.dsh, 'dsh')
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_RESOURCE_TRANSITION_STAGE: work }, encoding: 'utf8', windowsHide: true, timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) && path.basename(work).startsWith('resource-transition-native-'))
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
} else {
  assert(path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) && path.basename(work).startsWith('resource-transition-native-'))
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const { default: AgentPresetDeclaration } = await load('@deepseek-ai/dsh-agent-preset')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { default: JsonlPersistence } = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { default: SessionQuery } = await load('@deepseek-ai/dsh-session-query')
  const checks = [], handles = [], owners = []
  let ctx
  try {
    ctx = new Context(); ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    await ctx.plugin(Loader); await ctx.plugin(Projection); await ctx.plugin(SystemPrompt, {})
    new SessionStore(ctx); new AgentRegistry(ctx); new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
    new JsonlPersistence(ctx, { root: path.join(work, 'synthetic-sessions'), compression: 'none' }); new SessionQuery(ctx)
    const model = { provider: 'fixture', model: 'no-network' }
    ctx.provide('agentDefaultModel', { currentSelection: () => model })
    ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
      resolveModelInfo: async () => ({ inputModalities: ['text'] }), stream() { assert.fail('research must not call a model') } })
    ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content),
      imageLimits: { maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1, maxImagePixels: 1, maxImageDimension: 1, mediaTypes: [] } })
    ctx.provide('fileUploads', { registerAgentResolver: () => () => {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: id => id === 'fixture-workspace'
      ? { id, path: work, attachSession: async () => {} } : undefined })
    ctx.provide('fs', { resolve() { throw Error('no filesystem tool in fixture') } })
    await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 10 })
    const controller = new SessionController(ctx)
    await ctx.plugin(AgentPresets, { default: 'resource-stable' })
    const definition = (id, prompt) => ({ id, name: id, plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona',
      config: { prefix: prompt, suffix: '', complete: true, includeRuntimeContext: false } }] })
    // The real declarative native component owns each disposer/re-registration.
    const declare = async (id, prompt) => {
      const owner = await ctx.plugin(AgentPresetDeclaration, definition(id, prompt)); owners.push(owner)
      assert.equal((await ctx.agentPresets.resolve(id)).broken, undefined)
      return owner
    }
    const firstDefinition = await declare('resource-stable', 'Resource revision ONE.')
    await declare('resource-new-id', 'Resource revision TWO.')
    const make = async (sessionId, presetId = 'resource-stable') => {
      const handle = await ctx.agents.create({ sessionId, agentOptions: model,
        meta: { cwd: work, delegationDepth: 0, agentPreset: presetId },
        setup: async owner => { await ctx.agentPresets.mount(owner, presetId) } })
      handles.push(handle); await handle.agent.whenIdle(); return handle
    }
    const prompt = async agent => renderPrompt(await ctx.systemPrompt.assemble({ scope: agent }))
    const durable = async id => {
      const reader = await ctx.sessionPersistence.open(id, 'read')
      try { return { header: structuredClone(reader.header), events: structuredClone((await reader.read()).events) } }
      finally { await reader.close() }
    }
    const turnStarted = agent => agent.session.append('turn/start', { turn: 1 })
    const turnEnded = agent => agent.session.append('turn/end', { turn: 1 })
    const blank = await make('transition-blank')
    assert.equal(await ctx.agentPresets.select(blank.agent, 'resource-new-id'), 'resource-new-id')
    assert.equal(await prompt(blank.agent), 'Resource revision TWO.')
    assert.equal(blank.agent.session.header.agentPreset, 'resource-stable', 'creation header remains original')
    assert.equal(ctx.sessionProjections.stateOf(blank.agent.session, 'agentPreset'), 'resource-new-id')
    checks.push('native select changes a blank session and logs the choice')

    const old = await make('transition-old')
    turnStarted(old.agent)
    await assert.rejects(ctx.agentPresets.select(old.agent, 'resource-new-id'), { code: 'agent-preset/locked' })
    turnEnded(old.agent); await old.agent.whenIdle()
    await assert.rejects(ctx.agentPresets.select(old.agent, 'resource-new-id'), { code: 'agent-preset/locked' })
    assert.equal(await prompt(old.agent), 'Resource revision ONE.')
    const oldHistory = structuredClone(old.agent.session.snapshotEvents())
    await old.dispose()
    const persisted = await durable('transition-old')
    await assert.rejects(controller.create({ sessionId: 'transition-old', workspaceId: 'fixture-workspace', agentPreset: 'resource-new-id' }),
      { code: 'agent-preset/conflict' })
    assert.deepEqual(await durable('transition-old'), persisted, 'failed cold adoption cannot rewrite history')
    checks.push('native select rejects both open-turn and idle started sessions; cold create with another ID rejects and preserves history')

    const hot = await make('transition-hot')
    turnStarted(hot.agent); turnEnded(hot.agent)
    const hotEvents = structuredClone(hot.agent.session.snapshotEvents())
    const maintenance = Promise.withResolvers()
    let maintenanceCancelled = false
    const activeWork = hot.agent.runMaintenance(async signal => {
      signal.addEventListener('abort', () => { maintenanceCancelled = true }, { once: true })
      await maintenance.promise
    })
    await assert.rejects(ctx.agentPresets.register(definition('resource-stable', 'Duplicate must fail.')), /Duplicate agent preset/)
    await firstDefinition.dispose()
    await assert.rejects(ctx.agentPresets.resolve('resource-stable'), { code: 'agent-preset/not-found' })
    assert.equal(maintenanceCancelled, false, 'withdrawing native definition does not dispose existing agents')
    await declare('resource-stable', 'Resource revision TWO.')
    assert.equal(await prompt(hot.agent), 'Resource revision ONE.', 'loaded Agent retains old native generation')
    assert.equal(maintenanceCancelled, false)
    assert.deepEqual(hot.agent.session.snapshotEvents(), hotEvents, 'replacing definition does not alter the chat log')
    maintenance.resolve(); await activeWork; await hot.agent.whenIdle()
    assert.equal(await prompt(hot.agent), 'Resource revision ONE.', 'returning to idle does not rebind an old generation')
    await assert.rejects(ctx.agentPresets.select(hot.agent, 'resource-stable'), { code: 'agent-preset/locked' },
      'even selecting the same stable ID cannot force a started Agent to rebind')
    const newest = await make('transition-new')
    assert.equal(await prompt(newest.agent), 'Resource revision TWO.')
    checks.push('same-ID native declaration dispose/register preserves active and idle old generations; new sessions see revision two')

    const resumed = await controller.create({ sessionId: 'transition-old', workspaceId: 'fixture-workspace' })
    const resumedAgent = ctx.agents.get(resumed.sessionId)
    assert.equal(resumed.agentPreset, 'resource-stable')
    assert.equal(await prompt(resumedAgent), 'Resource revision TWO.')
    assert.deepEqual(resumedAgent.session.header, persisted.header)
    assert.deepEqual(resumedAgent.session.snapshotEvents().slice(0, oldHistory.length), oldHistory)
    assert(resumedAgent.session.snapshotEvents().slice(oldHistory.length).every(event => event.type === 'session/end-seed'))
    checks.push('cold resume keeps session ID/header/prior transcript but resolves the current same-ID definition')

    // Content-only alternative: the public native variable provider evaluates
    // for every prompt assembly without replacing the preset's tool/plugin tree.
    // This is a design experiment, not how the shipping library currently reads.
    let activeContent = 'Live content ONE. Literal {{user}}.'
    ctx.loader.builtins.transitionContent = class {
      static inject = ['systemPrompt']
      constructor(owner) { owner.systemPrompt.variable('transition_resource_content', () => activeContent) }
    }
    const liveDefinition = definition('resource-live-content', '{{transition_resource_content}}')
    liveDefinition.plugins.push({ id: 'content', name: 'cordis:transitionContent', config: {} })
    owners.push(await ctx.plugin(AgentPresetDeclaration, liveDefinition))
    const live = await make('transition-content', 'resource-live-content')
    turnStarted(live.agent); turnEnded(live.agent)
    const contentEvents = structuredClone(live.agent.session.snapshotEvents())
    const firstPromptSnapshot = await prompt(live.agent)
    activeContent = 'Live content TWO. Literal {{user}}.'
    assert.equal(await prompt(live.agent), activeContent)
    assert.equal(firstPromptSnapshot, 'Live content ONE. Literal {{user}}.', 'already assembled request content is unchanged')
    assert.equal(ctx.agentPresets.composedPreset(live.agent.ctx), 'resource-live-content')
    assert.deepEqual(live.agent.session.snapshotEvents(), contentEvents)
    checks.push('public dynamic prompt variable changes later assembly on a started Agent without rebind or transcript mutation; prior request snapshot stays unchanged')
    console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
      checks, liveProfileTouched: false, modelCalls: 0,
      scope: 'actual native APIs; synthetic durable turn boundaries and a maintenance activity, no real model turn' }, null, 2))
  } finally {
    for (const handle of handles) await handle.dispose()
    for (const owner of owners) await owner.dispose()
    await ctx?.fiber.dispose()
  }
}
