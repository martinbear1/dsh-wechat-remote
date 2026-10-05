/** Opt-in native contract test using the unmodified Desktop runtime archive.
 * No app/profile/network/model credentials; only temporary in-memory sessions.
 * Run: HARNESS_DSH_ASAR=<installed app.asar> node this-file.mjs */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { PrivateInputNative, privateInputTextDigest } from '../lib/human-workflow/private-input-native.js'
import { DshCompatibilityApi } from '../lib/dsh-compatibility-api.js'

const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR is required; this test never silently skips native validation')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'private-desktop-native-'))
const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
fs.readSync(fd, prefix, 0, 16, 0)
const json = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16)
const tree = JSON.parse(json), dataStart = 8 + prefix.readUInt32LE(4)
let ctx, bridge, compat
try {
  function materialize(entry, relative) {
    const target = path.resolve(work, relative)
    assert(target.startsWith(work + path.sep))
    if (entry.files) { for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name)); return }
    if (!/\.(?:[mc]?js|json|node|wasm)$/.test(relative)) return
    assert(!entry.link, 'unexpected source archive link must be resolved explicitly')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
    else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
  }
  materialize(tree.files.dsh, 'dsh')
  const nativeRequire = createRequire(path.join(work, 'dsh/package.json'))
  const load = name => import(pathToFileURL(nativeRequire.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: Projections } = await load('@deepseek-ai/dsh-session-projection')
  const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  ctx = new Context()
  const profile = { name: 'isolated-native-test', home: work, dir: work, installAnchor: path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json') }
  ctx.provide('profileContext', profile)
  new SystemPrompt(ctx, {}); new SessionStore(ctx); new Projections(ctx); new AgentRegistry(ctx); new ToolRuntime(ctx, { mode: 'native' })
  new Typert(ctx)
  let calls = 0, prepared = 0, published = 0, authority
  const model = { provider: 'fixture', model: 'no-network' }
  ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async value => value,
    resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
    async prepareCall(config) { return { config, stream: request => this.stream(request) } },
    async *stream() {
      calls++
      if (calls % 3 !== 0) {
        yield { type: 'tool-call-delta', index: 0, id: 'native-model-call-' + calls,
          name: calls % 3 === 1 ? 'fixture_private_prepare' : 'fixture_private_publish', argumentsDelta: '{}' }
        yield { type: 'finish', reason: 'tool-calls' }
      } else { yield { type: 'text-delta', index: 0, text: '测试结束' }; yield { type: 'finish', reason: 'stop' } }
    } })
  ctx.provide('agentDefaultModel', { currentSelection: () => model })
  ctx.provide('attachments', { admitPromptContent: async content => structuredClone(content) })
  ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => { throw Error('fixture has no files') },
    bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }) })
  ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: () => undefined })
  ctx.provide('fs', { resolve() { throw Error('no filesystem tool in fixture') } })
  ctx.provide('sessionQuery', { listSessions: async () => [] })
  const loop = new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  const controller = new SessionController(ctx)
  const agent = await loop.create('private-modern-native', model, { cwd: work })
  const nodeId = 'modern_fixture', content = [{ type: 'text', text: '把这份私人评语更新给他，不用再问我。' }]
  bridge = new PrivateInputNative(ctx, nodeId, () => {})
  assert.equal(bridge.supported(), true, JSON.stringify({ version: JSON.parse(fs.readFileSync(profile.installAnchor, 'utf8')).version,
    agents: typeof ctx.get('agents')?.get, sessions: typeof ctx.get('sessions')?.get, controller: typeof ctx.get('sessionController')?.inspect, tools: typeof ctx.get('tools')?.guard }))
  const described = await bridge.describe({ sessionId: agent.id }, new AbortController().signal)
  assert.equal(described.sessionGeneration, String(agent.session.header.createdAt))
  // Exercise the modern runtime-context append rather than deleting it from
  // the fixture to make the bridge pass.
  ctx.systemPrompt.context({ name: 'fixture-context', order: 1, text: () => '测试用运行时上下文；不是用户输入。' })
  ctx.tools.register({ name: 'fixture_private_prepare', description: 'same-turn draft preparation', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute() { prepared++; return { draftRef: 'fixture-only-draft', notPublished: true } } })
  ctx.tools.register({ name: 'fixture_private_publish', description: 'native bridge fixture tool', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      authority = await bridge.ownerInput(exec, { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) },
        { schema: 'human.workflow.draft.ref.v1', draftId: 'f'.repeat(24), digest: 'a'.repeat(64), kind: 'review' })
      authority.assertCurrent(); published++; return { fixturePublished: true }
    } })
  ctx.provide('typertGateway', { invoke: ({ namespace, method, args, signal }) => {
    assert.equal(namespace, 'session'); assert.equal(method, 'prompt'); return controller.prompt(args.request, signal)
  }, async *stream() {} })
  compat = new DshCompatibilityApi(ctx); compat.privateInput = bridge
  const proof = { schema: 'human.owner.input.v1', inputProof: 'desktop-fixture-opaque-proof', inputId: 'desktop-input-1', contentDigest: privateInputTextDigest(content),
    scope: String(agent.id), sessionGeneration: String(agent.session.header.createdAt),
    binding: { schema: 'human.node.binding.v1', nodeId, ownerSubject: 'fixture-owner', accountInstance: 'fixture-account', generation: '1' }, expiresAt: Date.now() + 600000 }
  const reply = await compat.request({ method: 'POST', path: '/api/session.prompt', body: Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'desktop-fixture-rpc', method: 'session.prompt',
    payload: { sessionId: agent.id, mode: 'queue', content, ownerInput: proof } })), signal: new AbortController().signal })
  assert.equal(reply.statusCode, 200); assert.equal(JSON.parse(Buffer.from(reply.body).toString()).result.ok, true)
  await agent.whenIdle()
  const events = agent.session.snapshotEvents()
  assert.equal(published, 1, JSON.stringify(events.filter(event => ['tool/result', 'turn/end'].includes(event.type))))
  assert.equal(prepared, 1); assert.equal(calls, 3, 'prepare and publish each execute in the same real owner turn')
  assert.deepEqual(events.filter(event => event.type === 'tool/call').map(event => [event.data.turn, event.data.name]),
    [[1, 'fixture_private_prepare'], [1, 'fixture_private_publish']])
  const user = events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
  assert.equal(user.data.source.rpcId, 'desktop-fixture-rpc')
  assert.equal(authority.nativeMessageId, user.data.id)
  assert(events.some(event => event.type === 'user/message' && event.data.source.kind === 'runtime-context'))
  assert(!JSON.stringify(events).includes(proof.inputProof))
  assert.throws(authority.assertCurrent, 'completed turn cannot reuse authority')
  // Same exact ordinary desktop prompt still has no owner-input proof.
  await controller.prompt({ sessionId: agent.id, mode: 'queue', content, requestId: 'without-owner-proof' }, new AbortController().signal)
  await agent.whenIdle(); assert.equal(published, 1)
  assert.equal(prepared, 2, 'uncredentialed conversation can still prepare drafts')
  console.log(JSON.stringify({ nativeVersion: JSON.parse(fs.readFileSync(profile.installAnchor, 'utf8')).version, checks: 'modern SessionController → AgentLoop → runtime-context → same-turn prepare and publish → ToolRuntime; uncredentialed next turn denied', passed: true }))
} finally {
  compat?.dispose(); bridge?.close(); await ctx?.fiber.dispose(); fs.closeSync(fd)
  assert(path.resolve(work).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(work, { recursive: true, force: true })
}
