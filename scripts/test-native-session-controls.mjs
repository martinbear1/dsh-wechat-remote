/** Read/command compatibility against pinned, UNMODIFIED DSH services.
 * In-memory sessions only: no user profile, network, model or real tool call.
 * Complements the native profile-persistence and transport regression suites. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { invokeLegacyRpc, resolveTypertGateway } from '../lib/dsh-protocol-compat.js'
import { legacyModelAlias } from '../lib/legacy-model-identity.js'

const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE is required; do not silently skip native verification')
const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const require = createRequire(import.meta.url)
const dependencies = process.env.HARNESS_DSH_DEPENDENCIES
  ? createRequire(path.join(process.env.HARNESS_DSH_DEPENDENCIES, 'package.json')) : require
const packages = new Map()
for (const relative of execFileSync('git', ['-C', source, 'ls-files', 'packages/**/package.json', 'vendor/**/package.json'], { encoding: 'utf8' }).trim().split(/\r?\n/)) {
  const file = path.join(source, relative)
  packages.set(JSON.parse(fs.readFileSync(file, 'utf8')).name, path.dirname(file))
}
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-controls-native-')))
const contexts = []
try {
  // Native app-boot resolves its own manifest relative to lib/*. Keep that
  // layout in the disposable fixture, never patch its source/version reader.
  const artifact = path.join(work, 'lib/native.mjs')
  fs.copyFileSync(path.join(packages.get('@deepseek-ai/dsh-app-boot'), 'package.json'), path.join(work, 'package.json'))
  const projection = path.join(source, 'packages/api/session-controller/src/model-selection-projection.ts').replaceAll('\\', '/')
  const sessionSource = path.join(source, 'packages/api/session-controller/src').replaceAll('\\', '/')
  await build({ stdin: { contents: `
    export { Context } from '@deepseek-ai/cordis';
    export { default as SessionStore, SessionId } from '@deepseek-ai/dsh-session';
    export { default as Projections } from '@deepseek-ai/dsh-session-projection';
    export { default as Commands } from '@deepseek-ai/dsh-commands';
    export { default as Permissions } from '@deepseek-ai/dsh-permission-presets';
    export { default as Approval } from '@deepseek-ai/dsh-user-approval';
    export { createScope } from '@deepseek-ai/dsh-scope';
    export { installModelSelectionProjection } from ${JSON.stringify(projection)};
    export { SessionCommandController } from ${JSON.stringify(sessionSource + '/commands.ts')};
    export { ApiSessionAgentController } from ${JSON.stringify(sessionSource + '/agent.ts')};
    export { buildModelCatalog } from ${JSON.stringify(sessionSource + '/catalog.ts')};
  `, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', target: 'es2022', outfile: artifact,
    plugins: [{ name: 'pinned-native-controls', setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path.startsWith('node:') || path.isAbsolute(args.path)) return
        const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0]
        const directory = packages.get(name)
        if (directory) {
          const file = path.join(directory, 'src', (args.path.slice(name.length + 1) || 'index') + '.ts')
          assert(fs.existsSync(file), `unresolved pinned source: ${args.path}`)
          return { path: file }
        }
        let file
        try { file = dependencies.resolve(args.path) } catch { file = require.resolve(args.path) }
        return { path: pathToFileURL(file).href, external: true }
      })
    } }], logLevel: 'warning' })
  const native = await import(pathToFileURL(artifact))
  async function host(name) {
    const ctx = new native.Context()
    contexts.push(ctx)
    await ctx.plugin(native.SessionStore)
    await ctx.plugin(native.Projections)
    await ctx.plugin(native.Commands)
    ctx.provide('shell', { sandboxMode: 'workspace-write',
      resolve() { assert.fail('no real shell') }, run() { assert.fail('no real shell') }, start() { assert.fail('no real shell') } })
    await ctx.plugin(native.Approval)
    await ctx.plugin(native.Permissions, {})
    native.installModelSelectionProjection(ctx)
    const session = ctx.sessions.create(native.SessionId(name))
    // ApprovalService may narrate its own changed policy through inject();
    // capture that native context note without constructing an LLM/turn driver.
    const notices = []
    const agent = { id: session.id, session, inject(value) { notices.push(value) } }
    await ctx.plugin(Object.assign(inner => { native.createScope(inner, agent) }, { inject: ['commands'] }))
    const calls = []
    const defaultSelection = { provider: 'deepseek-official', model: 'deepseek-flash' }
    const saved = [], selectionState = { current: defaultSelection }
    // Only the LLM adapter is a fixture: no paid model calls or credentials.
    // Catalog construction, command validation, selection append and projection
    // below are the pinned native implementations, not copied equivalents.
    ctx.provide('llm', {
      listProviders: () => ['deepseek-official', 'deepseek-account'].map(id => ({ id, name: id })),
      listModels: async () => [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }],
      resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }] } }),
      resolveCallConfig: async choice => { assert.equal(choice.model, 'deepseek-flash'); return choice },
    })
    ctx.provide('agentDefaultModel', { currentSelection: () => defaultSelection, async saveSelection(choice) { saved.push(choice) } })
    const commandController = new native.SessionCommandController(ctx, {
      async resolveAgent(id) { assert.equal(id, session.id); return { agent } },
      async serializeImageAdmission(_agent, fn) { return fn() },
      selectForNextRequest(target, choice) {
        native.ApiSessionAgentController.prototype.selectForNextRequest.call({ selectionFor: () => selectionState }, target, choice)
      },
    }, work)
    ctx.provide('typertGateway', {
      async invoke(call) {
        calls.push(call)
        if (call.namespace === 'session' && call.method === 'list') return { items: [{ sessionId: session.id }] }
        if (call.namespace === 'session' && call.method === 'modelCatalog') return native.buildModelCatalog(ctx)
        if (call.namespace === 'session' && call.method === 'selectModel') return commandController.selectModel(call.args.request)
        if (call.namespace === 'commands' && call.method === 'execute') {
          assert.equal(call.args.agentId, session.id)
          return ctx.commands.execute(agent, call.args.line, [], call.signal)
        }
        assert.fail(`unexpected native endpoint: ${call.namespace}/${call.method}`)
      },
      async *stream(call) {
        assert.equal(call.namespace, 'session'); assert.equal(call.method, 'follow')
        yield { type: 'snapshot', cursor: session.seq - 1, records: [], projections: ctx.sessionProjections.snapshot(session) }
      },
    })
    const gateway = resolveTypertGateway(ctx)
    const rpc = (method, payload) => invokeLegacyRpc(gateway, { type: 'client-request', rpcId: 'native-controls', method,
      payload: { sessionId: session.id, ...payload } }, { signal: new AbortController().signal, describeHost: () => ({}) })
    const history = async () => {
      const response = await rpc('session.history', { maxMessages: 1 })
      assert.equal(response.result.ok, true, JSON.stringify(response))
      return response.result.value.projections.values
    }
    return { ctx, session, rpc, history, calls, notices, saved, selectionState }
  }
  const web = await host('web'), desktop = await host('desktop')
  const initial = await desktop.history()
  assert.equal(initial.permissions.currentValue, 'workspace-write')
  assert.deepEqual(initial.permissions.options, desktop.ctx.permissionPresets.catalog().options)
  assert.equal(Object.hasOwn(desktop.ctx.sessionProjections.snapshot(desktop.session).values.permissions, 'options'), false,
    'legacy choices must never be persisted into native projections')

  const before = desktop.session.seq
  const auto = await desktop.ctx.plugin(Object.assign(scope => {
    scope.permissionPresets.registerAuto(() => {})
  }, { inject: ['permissionPresets'] }))
  assert.equal((await desktop.history()).permissions.options.at(-1).value, 'auto')
  assert.equal((await web.history()).permissions.options.some(option => option.value === 'auto'), false)
  assert.equal(desktop.session.seq, before, 'catalog appearance must not write to a Session')
  await auto.dispose()
  assert.equal((await desktop.history()).permissions.options.some(option => option.value === 'auto'), false)

  const changed = await desktop.rpc('commands/execute', { args: { agentId: desktop.session.id, line: '/permission danger-full-access', images: [] } })
  assert.equal(changed.result.ok, true, JSON.stringify(changed))
  assert.equal((await desktop.history()).permissions.currentValue, 'danger-full-access')
  assert.equal(desktop.notices.length, 1, 'native permission-change narration is preserved')
  assert.equal((await web.history()).permissions.currentValue, 'workspace-write', 'other host must not be modified')
  const rejected = await desktop.rpc('commands/execute', { args: { agentId: desktop.session.id, line: '/permission unknown', images: [] } })
  assert.equal(rejected.result.ok, false)
  assert.equal((await desktop.history()).permissions.currentValue, 'danger-full-access')
  assert.equal(desktop.calls.filter(call => call.namespace === 'commands').length, 2, 'no replay of mutating commands')

  for (const provider of ['deepseek-official', 'deepseek-account']) {
    const choice = { provider, model: 'deepseek-flash', reasoningEffort: 'high' }
    desktop.session.append('model/selection', choice)
    const result = await desktop.rpc('session.models', { modelIdentity: 'native-v1' })
    assert.equal(result.result.ok, true)
    assert.deepEqual(result.result.value.current, choice, 'native pending intent retains provider and reasoning effort')
  }
  assert.deepEqual(web.ctx.sessionProjections.snapshot(web.session).values.modelSelection, { next: null, lastUsed: null })
  for (const provider of ['deepseek-official', 'deepseek-account']) {
    const alias = legacyModelAlias(provider, 'deepseek-flash')
    const response = await desktop.rpc('session.selectModel', { provider, model: alias, reasoningEffort: 'low' })
    assert.equal(response.result.ok, true, JSON.stringify(response))
    assert.equal(response.result.value.selected.model, alias)
    const nativeChoice = { provider, model: 'deepseek-flash', reasoningEffort: 'low' }
    assert.deepEqual(desktop.saved.at(-1), nativeChoice, 'native default persistence receives real IDs only')
    assert.deepEqual(desktop.selectionState.current, nativeChoice, 'native next-prompt selection is changed')
    assert.deepEqual(desktop.ctx.sessionProjections.snapshot(desktop.session).values.modelSelection.next, nativeChoice,
      'desktop-facing projection/history never receives the phone alias')
    const menu = (await desktop.rpc('session.models', {})).result.value
    assert.equal(menu.current.model, alias)
    assert.equal(menu.groups.flatMap(g => g.models).filter(m => m.id === menu.current.model).length, 1)
  }
  assert.equal(web.saved.length, 0, 'no default changes leak to the other host')
  console.log(`PASS native controls ${sha}: permissions/catalog, Auto changes, native commands, rejection, host isolation; alias -> native selectModel -> native model/selection + next-prompt selection + default-save callback -> legacy refresh`)
} finally {
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
  assert.equal(path.dirname(work), fs.realpathSync(os.tmpdir()))
  assert(path.basename(work).startsWith('dsh-controls-native-'))
  fs.rmSync(work, { recursive: true, force: true })
}
