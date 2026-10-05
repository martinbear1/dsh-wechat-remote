import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema, renderToolsSdk } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { HumanToolsService } from '../lib/human-tools/service.js'
import { TYPERT } from '../lib/typert.host.js'
import { invokeLegacyRpc, parseLegacyClientRequest } from '../lib/dsh-protocol-compat.js'
import { assistantGuidance } from '../lib/assistant-presets/definition.js'

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
  options.provide?.(ctx)
  let identity = nodeId, calls = 0
  const transport = { nodeId, assertIdentity() { if (identity !== nodeId) throw Object.assign(new Error('node identity changed'), { code: 'binding_revoked' }) },
    async request(...args) { calls++; if (options.request) return options.request(...args); assert.fail('empty local mode operations must not contact task backend') } }
  const modeStore = options.modeStore || store(), automationStore = options.automationStore || store(), recordStore = store(), replicaStore = store(), coreStore = store({ schemaVersion: 1, records: [] })
  const config = { enabled: true, assistants: options.assistants ?? false, store: coreStore, workflow: { transport, modeStore, recordStore, replicaStore,
    receiverKeyStore: store(), lifecycleStore: store(), automationStore } }
  let fiber = await ctx.plugin(HumanToolsService, config), service = ctx.get('humanTools'), sequence = 0
  t.after(async () => { await ctx.fiber.dispose() })
  async function run(name, args) {
    return tools.execute({ name, arguments: args, callId: `service_call_${++sequence}`, agent, signal })
  }
  return { ctx, tools, session, agent, modeStore, recordStore, coreStore, replicaStore, automationStore, transport, config,
    get fiber() { return fiber }, get service() { return service }, get networkCalls() { return calls },
    rotate() { identity = 'node_' + 'b'.repeat(32) }, run,
    async draft() { const result = await run('human_mode_draft', { package: pkg() }); assert.equal(result.isError, false, JSON.stringify(result)); return JSON.parse(result.content[0].text) },
    async preview(draft) { return unwrap(await service.modePreview({ scope: sessionId, id: draft.id, version: draft.version }, signal)) },
    async reload() { fiber = await ctx.plugin(HumanToolsService, config); service = ctx.get('humanTools'); return service },
  }
}

test('assistant RPC freshly rejects an uninstalled managed preset even when it is native default; reinstall requires new approval', async t => {
  let available=true, installs=0, defaultId='standard', resolves=0
  const registryStore=store(),sessionIntentStore=store(),hash=text=>createHash('sha256').update(text).digest('hex')
  const native={async probe(){return {supported:true,basePresets:[{id:'standard',name:'Standard'}]}},
    async preview({presetId,definition}) {
      const rowId=`harness-assistant-${presetId}`,patch=JSON.stringify([{insert:[{id:rowId,name:'@deepseek-ai/dsh-agent-preset',config:{id:presetId,name:definition.name,description:definition.description,
        plugins:[{id:'persona',name:'@deepseek-ai/dsh-persona',config:{prefix:'Base\n\n'+assistantGuidance(definition),complete:false,includeRuntimeContext:true}}]}}]}])
      return {schema:'assistant.native.preview.v1',presetId,basePreset:definition.basePreset,definition,rowId,bundleName:`@harness-remote-assistants/${presetId}`,
        patch,patchDigest:hash(patch),baseDigest:hash('[]'),profileFingerprint:hash('fixture'),defaultPreset:'standard',warnings:[]}
    },async install(plan){installs++;return {presetId:plan.presetId,state:'installed'}},
    async verify(plan){return {presetId:plan.presetId,state:available?'installed':'unknown',nativeState:available?'installed':'uninstalled'}},async close(){}}
  const host=await setup(t,{assistants:{native,registryStore,sessionIntentStore,businessStore:store()},provide(ctx){
    ctx.provide('agentPresets',{get defaultId(){return defaultId},readDocument(){},resolve(id){resolves++;return {id}}})
    ctx.provide('sessionController',{inspect(){assert.fail('prepare must not inspect')},create(){assert.fail('service must not create a native session')}})
  }})
  const draft=unwrap(await host.service.assistantDraft({templateId:'teacher'},signal)),p=unwrap(await host.service.assistantPreview({id:draft.id,version:draft.version},signal))
  const result=unwrap(await host.service.assistantInstall({id:p.id,version:p.version,digest:p.digest,previewId:p.previewId},signal))
  defaultId=result.presetId; assert.equal(unwrap(await host.service.assistantCatalog({},signal)).drafts[0].state,'installed')
  available=false
  const denied=await host.service.assistantSessionPrepare({presetId:result.presetId},signal)
  assert.equal(denied.ok,false);assert.equal(denied.error.code,'assistant-not-installed');assert.equal(resolves,0)
  assert.equal(sessionIntentStore.writes,0);assert.equal(registryStore.value.entries[0].state,'unknown')
  const mixed=await host.service.assistantDraft({sourceId:draft.id,sourceVersion:draft.version,templateId:'teacher'},signal)
  assert.equal(mixed.ok,false);assert.equal(mixed.error.code,'assistant-draft-invalid')
  const next=unwrap(await host.service.assistantDraft({sourceId:draft.id,sourceVersion:draft.version},signal))
  assert.notEqual(next.id,draft.id);assert.equal(next.state,'draft');assert.equal(installs,1)
  available=true
  const intent=unwrap(await host.service.assistantSessionPrepare({presetId:result.presetId},signal));assert.equal(intent.dispatch,true)
  assert.equal(installs,1)
})

// Cordis provides/withdraws real services; methods must NOT be invoked by
// discovery. Only the native model/run boundary is absent in this fixture.
function provideAutomationServices(ctx) {
  const untouched = () => assert.fail('capability discovery must not inspect, restore, approve, or run')
  for (const [name, service] of Object.entries({
    sessionController: { inspect: untouched, resolveAgent: untouched },
    agentPresets: { readDocument: untouched, composedPreset: untouched },
    permissionPresets: { resolve: untouched }, workspaceRegistry: { archivedSessionIds: [] },
  })) ctx.provide(name, service)
}
const automationCapability = async host => unwrap(await host.service.capabilities({ scope: sessionId }, signal)).workflow.capabilities.find(c => c.id === 'automation.run')

test('disabled assistant service is blocked in both live manifest and Agent capability catalog', async t => {
  const host = await setup(t)
  const response = unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  assert.equal(response.workflow.capabilities.find(item => item.id === 'assistant.design').status, 'blocked')
  for (const name of ['human_assistant_catalog', 'human_assistant_draft', 'human_assistant_get']) assert.equal(host.tools.get(name), undefined)
  const catalog = JSON.parse((await host.run('human_capabilities', { view: 'catalog', category: 'workspace', detail: 'full' })).content[0].text)
  assert.equal(catalog.entries.find(item => item.id === 'workspace.assistant-design').status, 'blocked')
  assert.equal(host.networkCalls, 0)
})

test('registered assistant design is usable without native install support or a teacher preset; missing tools block discovery', async t => {
  let probes = 0
  const native = { async probe() { probes++; return { supported: false, basePresets: [], reason: '测试宿主不提供原生安装' } },
    async preview() { assert.fail('discovery must not preview') }, async install() { assert.fail('discovery must not install') },
    async verify() { assert.fail('no installed presets exist') }, async close() {} }
  const host = await setup(t, { assistants: { native, registryStore: store(), businessStore: store(), sessionIntentStore: store() } })
  const capability = () => host.service.workflow.modes.manifest().capabilities.find(item => item.id === 'assistant.design')
  unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  assert.equal(capability().status, 'available'); assert.equal(probes, 0, 'ordinary capability discovery must not probe native installation')
  for (const name of ['human_assistant_catalog', 'human_assistant_draft', 'human_assistant_get']) assert(host.tools.get(name))
  const catalog = JSON.parse((await host.run('human_capabilities', { view: 'catalog', category: 'workspace', detail: 'full' })).content[0].text)
  assert.equal(catalog.entries.find(item => item.id === 'workspace.assistant-design').status, 'available')
  const assistants = unwrap(await host.service.assistantCatalog({}, signal))
  assert.equal(assistants.native.supported, false); assert.deepEqual(assistants.drafts, [])
  assert.equal(capability().status, 'available', 'data-only design is distinct from native install support')
  const originalGet = host.tools.get.bind(host.tools)
  host.tools.get = name => name === 'human_assistant_draft' ? undefined : originalGet(name)
  try { assert.equal(capability().status, 'blocked', 'service existence does not substitute for actual tool registration') }
  finally { host.tools.get = originalGet }
  assert.equal(host.networkCalls, 0)
})

test('phone capability discovery projects live readiness within its RPC budget without dropping Agent contracts', async t => {
  const host = await setup(t), registry = new TypertRegistry(host.ctx)
  registry.register(TYPERT)
  const gateway = new TypertGatewayService(host.ctx)
  const discover = async () => {
    const request = parseLegacyClientRequest('humanTools/capabilities', { type: 'client-request', rpcId: 'capability-projection-test',
      method: 'humanTools/capabilities', payload: { args: { request: { scope: sessionId } } } })
    const reply = await invokeLegacyRpc(gateway, request, { signal, describeHost() { assert.fail('not a host route') } })
    // This is exactly the envelope checked by mini human-actions.call(), not
    // merely valueJson. Nested JSON escaping is part of the 16 KiB budget.
    assert(Buffer.byteLength(JSON.stringify(reply.result), 'utf8') <= 16 * 1024)
    assert.equal(reply.result.ok, true)
    return unwrap(reply.result.value)
  }
  const phone = await discover(), manifest = host.service.workflow.modes.manifest()
  assert.deepEqual(Object.keys(phone).sort(), ['enabled', 'members', 'remind', 'schema', 'shareTest', 'workflow'])
  assert.equal(phone.schema, 'human.tools.v1')
  assert.equal(phone.workflow.schema, 'human.capabilities.status.v1')
  assert.equal(phone.workflow.nodeId, nodeId); assert.equal(phone.workflow.version, 1)
  assert.equal(phone.workflow.statusMeaning, 'node-implementation-not-device-verification-or-authorization')
  assert.deepEqual(phone.workflow.capabilities, manifest.capabilities.map(({ id, version, status, ownerApproval, reason }) =>
    ({ id, version, status, ownerApproval, ...(reason !== undefined ? { reason } : {}) })))
  assert.deepEqual(Object.keys(phone.workflow).sort(), ['capabilities', 'nodeId', 'schema', 'statusMeaning', 'version'])
  assert(phone.workflow.capabilities.some(cap => cap.status === 'blocked' && cap.reason), 'blocked reasons stay exact, not truncated')

  // Future documentation growth must not break unrelated phone actions. This
  // deliberately exceeds the phone budget without changing operational facts.
  const originalManifest = host.service.workflow.modes.manifest.bind(host.service.workflow.modes)
  host.service.workflow.modes.manifest = () => ({ ...originalManifest(), contracts: { large: '文档'.repeat(100_000) },
    skill: 'not-a-phone-status'.repeat(100_000), futureField: 'private-host-field',
    capabilities: originalManifest().capabilities.map(cap => ({ ...cap, description: '说明'.repeat(100_000),
      tools: ['not-needed-in-phone-discovery'], futureField: 'not-projected' })) })
  assert.deepEqual(await discover(), phone, 'status projection explicitly excludes arbitrary documentation and extra fields')
  host.service.workflow.modes.manifest = originalManifest

  const agent = await host.run('human_capabilities', {})
  assert.equal(agent.isError, false)
  const full = JSON.parse(agent.content[0].text)
  assert.equal(full.schema, 'human.capabilities.v1')
  assert.deepEqual(full.contracts, manifest.contracts)
  assert(full.contracts.memberForm && full.contracts.recipientFacts && full.contracts.reminders)
  assert(full.capabilities.every(cap => typeof cap.description === 'string' && Array.isArray(cap.tools)))
  assert.equal(host.networkCalls, 0)
  assert.equal(host.modeStore.writes, 0); assert.equal(host.coreStore.writes, 0)
})

test('real Cordis late optional dependencies recover discovery without remount, approval, timers or Agent wake', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await setup(t), before = await automationCapability(host), service = host.service, ledger = service.automation
  assert.equal(before.status, 'blocked'); assert(before.reason.includes('sessionController.inspect'))
  assert(host.tools.get('human_automation_propose'), 'draft proposal stays distinct from executable automatic capability')
  const started = deferred(), ready = deferred()
  const mounting = host.ctx.plugin(async child => { provideAutomationServices(child); started.resolve(); await ready.promise })
  await started.promise
  assert.equal((await automationCapability(host)).status, 'blocked', 'Cordis does not expose a still-loading provider')
  ready.resolve(); const nativeFiber = await mounting
  assert.equal((await automationCapability(host)).status, 'available')
  assert.equal(host.service, service); assert.equal(service.automation, ledger); assert.equal(host.automationStore.loads, 1)
  const agentResult = await host.run('human_capabilities', {})
  assert.equal(agentResult.isError, false)
  assert.equal(JSON.parse(agentResult.content[0].text).capabilities.find(c => c.id === 'automation.run').status, 'available', 'Agent and owner read the same current capability')
  const other = await setup(t)
  assert.equal((await automationCapability(other)).status, 'blocked', 'another host/profile does not inherit this host native readiness')
  assert.equal(host.automationStore.writes, 0); assert.equal(host.networkCalls, 0)
  assert.equal(host.tools.get('human_automation_save'), undefined, 'no private execution tools without an approved run')
  await nativeFiber.dispose()
  assert.equal((await automationCapability(host)).status, 'blocked', 'withdrawn native dependencies fail closed')
  const recovered = await host.ctx.plugin(provideAutomationServices)
  assert.equal((await automationCapability(host)).status, 'available')
  assert.equal(host.automationStore.loads, 1); assert.equal(host.networkCalls, 0)
  await host.fiber.dispose()
  assert.equal(ledger.capability().supported, false)
  assert.equal(host.tools.get('human_automation_propose'), undefined)
  assert.equal((await service.capabilities({ scope: sessionId }, signal)).ok, false)
  await recovered.dispose()
  await host.ctx.plugin(provideAutomationServices)
  assert.equal(ledger.capability().supported, false, 'late provider cannot revive disposed workflow/adapter')
})

test('automation store failure stays isolated from manual tools and does not masquerade as missing native services', async t => {
  const host = await setup(t, { automationStore: { async load() { throw new Error('C:/private/profile/SECRET-fixture') } } })
  const cap = await automationCapability(host)
  assert.equal(cap.status, 'blocked'); assert(cap.reason.includes('账本')); assert(!cap.reason.includes('SECRET'))
  await host.ctx.plugin(provideAutomationServices)
  assert.equal((await automationCapability(host)).status, 'blocked')
  assert.equal(host.service.automation, undefined); assert.equal(host.tools.get('human_automation_propose'), undefined)
  assert.equal((await host.run('human_surface_share', { title: '仍可手动', body: '没有自动授权' })).isError, false)
})

test('dispose drains a pending automation load and closes its late adapter before Cordis replacement', async t => {
  const started = deferred(), release = deferred(), memory = store()
  const host = await setup(t, { automationStore: { ...memory, async load() { started.resolve(); await release.promise; return memory.load() } } })
  await started.promise
  const old = host.service; let disposed = false
  const disposal = host.fiber.dispose().then(() => { disposed = true })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(disposed, false)
  await host.ctx.plugin(provideAutomationServices)
  release.resolve(); await disposal
  assert.equal(old.automation, undefined); assert.equal(host.tools.get('human_automation_propose'), undefined)
  assert.equal((await old.capabilities({ scope: sessionId }, signal)).ok, false)
  await host.reload()
  assert.equal((await automationCapability(host)).status, 'available'); assert.equal(host.networkCalls, 0)
})

async function claimedShare(host) {
  const card = await host.run('human_surface_share', { title: '发现回归', body: '完整源工具卡' })
  assert.equal(card.isError, false)
  const request = { scope: sessionId, surfaceId: card.meta.humanSurface.id, revision: 1, actionId: 'share', attemptId: 'share_discovery_attempt_01' }
  unwrap(await host.service.claim(request, signal)); return request
}

test('automationList owner RPC bounds and forwards pagination without waking any Agent', async t => {
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const offsets = []
  host.service.workflow.replica.query = async (_scope, input) => { offsets.push(input.offset); return { records: [], freshness: { fresh: true, asOf: 123 }, nextOffset: 40 } }
  const page = unwrap(await host.service.automationList({ scope: sessionId, offset: 20 }, signal))
  assert.deepEqual(offsets, [20]); assert.equal(page.nextOffset, 40); assert.equal(page.capability.supported, false)
  for (const offset of [-1, 10001, 0.5, '20', NaN]) {
    const result = await host.service.automationList({ scope: sessionId, offset }, signal)
    assert.equal(result.ok, false); assert.equal(result.error.code, 'automation-offset-invalid')
  }
  assert.deepEqual(offsets, [20])
})

test('owner source grant returns only after its cloud-expiry-plus-draft discovery horizon is durable and survives reload', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const expiresAt = Date.now() + 5 * 60_000
  const host = await setup(t, { async request(operation) {
    assert.equal(operation, 'grant'); return { schema: 'human.source.grant.v1', sourceGrant: 'signed-fixture-grant', expiresAt }
  } })
  unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const request = await claimedShare(host), delayed = host.replicaStore.delayNext()
  let answered = false
  const pending = host.service.sourceGrant(request, signal).then(value => { answered = true; return value })
  await delayed.started.promise; assert.equal(answered, false); delayed.release.resolve()
  assert.equal(unwrap(await pending).expiresAt, expiresAt)
  assert.equal(host.replicaStore.value.discoveryUntil, expiresAt + 20 * 60_000)
  await host.fiber.dispose(); await host.reload(); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  assert.equal(host.replicaStore.value.discoveryUntil, expiresAt + 20 * 60_000)
  assert.equal(host.networkCalls, 1, 'reload does not return or replay an old publication grant')
})

for (const outcome of ['success', 'unknown']) test(`legacy ${outcome} share ACK persists read-only discovery without reissuing an action`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await setup(t); unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const request = await claimedShare(host), before = Date.now()
  const ack = { ...request, outcome, ...(outcome === 'success' ? { taskRef: { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) } } : {}) }
  const receipt = unwrap(await host.service.ack(ack, signal))
  assert.equal(receipt.outcome, outcome)
  assert(host.replicaStore.value.discoveryUntil >= before + 25 * 60_000)
  const duplicate = unwrap(await host.service.ack(ack, signal))
  assert.equal(duplicate.receiptId, receipt.receiptId); assert.equal(host.networkCalls, 0)
})

test('unload during discovery persistence keeps the intent but never releases the source grant', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const expiresAt = Date.now() + 5 * 60_000
  const host = await setup(t, { async request() { return { schema: 'human.source.grant.v1', sourceGrant: 'signed-fixture-grant', expiresAt } } })
  unwrap(await host.service.capabilities({ scope: sessionId }, signal))
  const request = await claimedShare(host), delayed = host.replicaStore.delayNext()
  const pending = host.service.sourceGrant(request, signal)
  await delayed.started.promise
  let disposed = false; const closing = host.fiber.dispose().then(() => { disposed = true })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(disposed, false)
  delayed.release.resolve(); await closing
  assert.equal((await pending).ok, false)
  assert.equal(host.replicaStore.value.discoveryUntil, expiresAt + 20 * 60_000)
})

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
