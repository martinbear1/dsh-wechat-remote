import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema, renderToolsSdk } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { HumanToolsService } from '../lib/human-tools/service.js'

const nodeId = 'node_' + 'a'.repeat(32), sessionId = 'session_service', signal = new AbortController().signal
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
function store(initial) {
  let saved = structuredClone(initial), pause, loads = 0, writes = 0
  return { async load() { loads++; return structuredClone(saved) }, async save(value) {
    const current = pause; pause = undefined
    if (current) { current.started.resolve(); await current.release.promise }
    saved = structuredClone(value); writes++
  }, delayNext() { const next = { started: deferred(), release: deferred() }; pause = next; return next },
  get value() { return structuredClone(saved) }, get loads() { return loads }, get writes() { return writes } }
}
const pkg = () => ({ schemaVersion: 1, name: '固定项目阅读卡', description: '可复用群任务规则，不是职业preset', goal: '准备一张主人批准的公开卡',
  roles: [], rules: [], requiredCapabilities: ['mode.packages', 'surface.reading-confirmation', 'workflow.records'],
  allowedTools: ['human_mode_prepare_card', 'human_workflow_save', 'human_workflow_get', 'human_workflow_list'],
  inputSchema: { fields: [{ key: 'title', label: '标题', kind: 'short-text', maxLength: 80, required: true },
    { key: 'body', label: '正文', kind: 'long-text', maxLength: 500, required: true }] }, resultSchema: { fields: [] },
  card: { kind: 'reading-confirmation', titleField: 'title', bodyFields: ['body'] },
  approval: { activation: 'owner', publication: 'owner' }, automation: 'manual' })
const ref = value => ({ id: value.id, version: value.version, digest: value.digest })
const request = preview => ({ scope: sessionId, ...ref(preview), previewId: preview.previewId, expectedActivationVersion: preview.expectedActivationVersion })
const unwrap = response => { assert.equal(response.ok, true, JSON.stringify(response)); return JSON.parse(response.valueJson) }

async function setup(t, options = {}) {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: options.mode || 'native' }), sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId(sessionId), { meta: { createdAt: 100 } })
  const agent = { id: session.id, session, ctx, status: 'idle', send() { assert.fail('service must not wake Agent') } }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined }); ctx.on('session/flush', async () => {})
  let identity = nodeId, calls = 0
  const transport = { nodeId, assertIdentity() { if (identity !== nodeId) throw Object.assign(new Error('node identity changed'), { code: 'binding_revoked' }) },
    async request() { calls++; assert.fail('empty local mode operations must not contact task backend') } }
  const modeStore = options.modeStore || store(), recordStore = store(), replicaStore = store(), coreStore = store({ schemaVersion: 1, records: [] })
  const config = { enabled: true, store: coreStore, workflow: { transport, modeStore, recordStore, replicaStore } }
  let fiber = await ctx.plugin(HumanToolsService, config), service = ctx.get('humanTools'), sequence = 0
  t.after(async () => { await ctx.fiber.dispose() })
  async function run(name, args) {
    return tools.execute({ name, arguments: args, callId: `service_call_${++sequence}`, agent, signal })
  }
  return { ctx, tools, session, agent, modeStore, recordStore, coreStore, transport, config,
    get fiber() { return fiber }, get service() { return service }, get networkCalls() { return calls },
    rotate() { identity = 'node_' + 'b'.repeat(32) }, run,
    async draft() { const result = await run('human_mode_draft', { package: pkg() }); assert.equal(result.isError, false, JSON.stringify(result)); return JSON.parse(result.content[0].text) },
    async preview(draft) { return unwrap(await service.modePreview({ scope: sessionId, id: draft.id, version: draft.version }, signal)) },
    async reload() { fiber = await ctx.plugin(HumanToolsService, config); service = ctx.get('humanTools'); return service },
  }
}

for (const method of ['modePreview', 'modeApprove', 'modeRollback']) test(`${method} rejects a stale-node success when identity rotates during durable save`, async t => {
  const host = await setup(t)
  unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const draft = await host.draft()
  let input = { scope: sessionId, id: draft.id, version: draft.version }
  if (method !== 'modePreview') {
    let preview = await host.preview(draft)
    if (method === 'modeRollback') { unwrap(await host.service.modeApprove(request(preview), signal)); preview = await host.preview(draft) }
    input = request(preview)
  }
  const delayed = host.modeStore.delayNext(); t.after(() => delayed.release.resolve())
  const pending = host.service[method](input, signal)
  await delayed.started.promise
  host.rotate(); delayed.release.resolve()
  const result = await pending
  assert.equal(result.ok, false, 'RPC must not publish an old-node preview/activation after re-pairing')
  assert.equal(result.error.code, 'binding_revoked'); assert.equal(result.valueJson, undefined)
  assert.equal((await host.service.modeList({ scope: sessionId }, signal)).error.code, 'binding_revoked')
  assert.equal(host.networkCalls, 0)
})

test('registered DSH tools and dynamic context also reject the old node after identity rotation', async t => {
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const draft = await host.draft(), preview = await host.preview(draft)
  unwrap(await host.service.modeApprove(request(preview), signal))
  const prompt = host.ctx.get('systemPrompt')
  const context = async () => renderContextSections(await prompt.assemble({ agent: host.agent, scope: host.agent })).filter(x => x.name === 'harness-remote.human-workflow')
  assert.equal((await context()).length, 1)
  const delayed = host.modeStore.delayNext(); t.after(() => delayed.release.resolve())
  const pending = host.run('human_mode_draft', { id: draft.id, expectedVersion: 1, package: { ...pkg(), name: '只写旧节点' } })
  await delayed.started.promise; host.rotate(); delayed.release.resolve()
  const result = await pending
  assert.equal(result.isError, true); assert.equal(result.value, undefined)
  assert.equal((await host.run('human_workflow_list', {})).isError, true)
  assert.deepEqual(await context(), [])
})

test('real Cordis unload waits for mode approval save and reload sees only the durable generation', async t => {
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const draft = await host.draft(), preview = await host.preview(draft)
  const delayed = host.modeStore.delayNext(); t.after(() => delayed.release.resolve())
  const pending = host.service.modeApprove(request(preview), signal)
  await delayed.started.promise
  let disposed = false
  const disposal = host.fiber.dispose().then(() => { disposed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(disposed, false, 'replacement owner must not open a pre-save mode ledger')
  assert.equal(host.modeStore.loads, 1)
  assert.equal((await host.service.modeList({ scope: sessionId }, signal)).ok, false)
  delayed.release.resolve(); await disposal
  assert.equal((await pending).ok, false, 'disposed owner RPC never returns successful approval')
  assert.equal(host.tools.get('human_mode_draft'), undefined)
  const saved = host.modeStore.value
  assert.equal(saved.activations[0].revision, 1)
  await host.reload(); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  assert.equal(host.modeStore.loads, 2)
  const restored = unwrap(await host.service.modeList({ scope: sessionId }, signal))
  assert.deepEqual(restored.activation.mode, ref(draft)); assert.equal(restored.activation.revision, 1)
  const replay = unwrap(await host.service.modeApprove(request(preview), signal))
  assert.equal(replay.revision, 1, 'exact preview retry cannot increment approval twice')
})

test('scope and header generation are checked for owner RPC without restoring or creating an Agent', async t => {
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const draft = await host.draft(), preview = await host.preview(draft)
  unwrap(await host.service.modeApprove(request(preview), signal))
  const active = unwrap(await host.service.modeList({ scope: sessionId }, signal))
  assert.deepEqual(active.activation.mode, ref(draft))
  const sessions = host.ctx.get('sessions'), originalGet = sessions.get.bind(sessions)
  sessions.get = id => id === sessionId ? undefined : originalGet(id)
  let directory = [{ header: { id: sessionId, createdAt: 100 } }]
  host.ctx.provide('sessionQuery', { async filterSessions(filters) {
    assert.deepEqual(filters, [{ kind: 'id', values: [sessionId] }]); return directory
  } })
  sessions.restore = () => { assert.fail('read-only owner mode page must not restore a writer') }
  assert.deepEqual(unwrap(await host.service.modeList({ scope: sessionId }, signal)).activation.mode, ref(draft))
  directory = [{ header: { id: sessionId, createdAt: 200 } }]
  const replacement = unwrap(await host.service.modeList({ scope: sessionId }, signal))
  assert.equal(replacement.activation.mode, null, 'same ID with a new generation does not inherit activation')
  assert.equal((await host.service.modeApprove(request(preview), signal)).ok, false)
  directory = []
  assert.equal((await host.service.modeList({ scope: sessionId }, signal)).error.code, 'human-origin-unavailable')
})

test('all registered workflow tools generate Code Mode schemas using the installed DSH subset', async t => {
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const names = ['human_capabilities', 'human_mode_draft', 'human_mode_list', 'human_mode_get', 'human_mode_preview',
    'human_mode_prepare_card', 'human_workflow_save', 'human_workflow_get', 'human_workflow_list', 'human_task_list', 'human_task_get', 'human_task_participants']
  const schemas = names.map(name => {
    const definition = host.tools.get(name); assert(definition)
    assertSupportedJsonSchema(definition.parameters); assertSupportedJsonSchema(definition.output.schema)
    return { name, description: definition.description, parameters: definition.parameters, output: definition.output.schema }
  })
  const rendered = renderToolsSdk(schemas)
  for (const name of names) assert(rendered.includes(name))
})
