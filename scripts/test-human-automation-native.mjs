import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Inbox } from '../node_modules/@deepseek-ai/dsh-agent/lib/types/inbox.js'
import { createNativeAutomationAdapter, installNativeAutomationGate } from '../lib/human-workflow/automation-native.js'

const signal = new AbortController().signal, nodeId = 'automation_native_fixture'
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const source = { kind: 'plugin', plugin: 'harness-remote-human-automation' }
const pluginMessage = () => createUserMessage({ source, content: [{ type: 'text', text: 'approved automatic analysis fixture' }] })
const humanMessage = () => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '真正用户的原始输入，不能吞掉' }] })
const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
async function setup(t, options = {}) {
  const ctx = new Context(); new SystemPrompt(ctx, {}); const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId('auto-native-session'), { meta: { createdAt: 100, agentPreset: 'profession' } })
  assert.equal(typeof session.snapshotEvents, 'undefined', 'exercise installed native Session.events, not an invented fixture method')
  assert.equal(Object.isFrozen(session.events), true)
  session.append('permission/preset', { preset: 'workspace-write' }); session.append('sandbox/mode', { mode: 'workspace-write' }); session.append('approval/policy', { policy: 'ask' })
  const controls = { live: true, followups: 0, restores: 0, modelCalls: 0, cancels: 0, rejectGuard: false, failure: null }
  const agent = { id: session.id, session, status: 'idle', options: { provider: 'provider', model: 'model' }, ctx: null, inbox: null,
    send(message, target, wakeup) { agent.inbox.append(target, message); if (wakeup) begin() },
    followup(message) { controls.followups++; agent.send(message, 'next-turn', true) },
    cancel(_cause, opts) { controls.cancels++; cancelled = true; if (!opts?.keepInbox) agent.inbox.clear() },
    whenIdle() { return driving },
  }
  const ownedScope = createScope(ctx, agent); agent.ctx = ownedScope.ctx
  const emit = (name, payload) => ctx.emit(scopeTarget(agent, agent), name, payload)
  agent.inbox = new Inbox(session, { inserted: message => emit('agent/inbox/inserted', { agent, message }), discarded: message => emit('agent/inbox/discarded', { agent, message }), claimed: (message, turn) => emit('agent/inbox/claimed', { agent, message, turn }) })
  let driving = Promise.resolve(), turn = 0, cancelled = false
  async function pre(messages, current = turn) { return ctx.waterfall(scopeTarget(agent, agent), 'agent/pre-step', { agent, messages, turn: current, step: 1, signal }, () => Promise.resolve({ kind: 'enter', messages })) }
  function begin() {
    agent.status = 'running'; cancelled = false
    driving = Promise.resolve().then(async () => {
      const current = ++turn; session.append('turn/start', { turn: current })
      if (options.beforeClaim) await options.beforeClaim({ agent, current })
      const messages = agent.inbox.claim('next-turn', current)
      if (options.beforePre) await options.beforePre({ agent, session, current, messages, emit })
      const decision = await pre(messages, current)
      if (decision.kind === 'enter' && !cancelled) {
        for (const message of decision.messages) session.append('user/message', message, { surfaceOp: 'append' })
        const config = await ctx.waterfall(scopeTarget(agent, agent), 'agent/request', { agent, turn: current, step: 1, signal }, () => Promise.resolve({ provider: 'provider', model: 'model' }))
        assert.equal(config.provider, 'provider'); controls.modelCalls++
        if (options.model) await options.model({ agent, tools, session, current, emit, pre })
        else await call('human_automation_save', {})
      }
      session.append('turn/end', { turn: current, reason: { kind: cancelled ? 'aborted' : decision.kind === 'reject' ? 'blocked' : 'completed', ...(cancelled ? { reason: { kind: 'hook', reason: 'fixture cancel' } } : {}) } })
      if (options.afterEnd) await options.afterEnd({ agent, tools, session, current, pre })
    }).catch(error => { controls.failure = error; throw error }).finally(() => { agent.status = 'idle' })
  }
  const services = { tools, sessions, agents: { get: id => id === agent.id && controls.live ? agent : undefined },
    sessionController: { inspect: async () => ({ meta: session.header, events: session.events }), resolveAgent: async () => { controls.restores++; controls.live = true; return { agent } } },
    agentPresets: { readDocument: async id => ({ agentPreset: id, content: '- name: native-persona\n' }), composedPreset: () => 'profession' },
    permissionPresets: { resolve: () => ({ sandbox: 'workspace-write', approval: 'ask' }) },
    workspaceRegistry: { archivedSessionIds: [] }, agentDefaultModel: { currentSelection: () => ({ provider: 'provider', model: 'model' }) },
    shell: { sandboxMode: 'workspace-write' }, approval: { config: { policy: 'ask' } },
  }
  const host = { get: name => services[name], on: (...args) => ctx.on(...args) }
  ctx.provide('agents', services.agents); ctx.on('session/flush', async () => {})
  let seq = 0
  async function call(name, args, extra = {}) { return tools.execute({ name, arguments: args, agent, callId: `native_call_${++seq}`, signal, ...extra }) }
  const adapter = createNativeAutomationAdapter(host), scope = { nodeId, sessionId: String(session.id), sessionGeneration: '100' }
  t.after(async () => { await adapter.close(); await ownedScope.dispose(); await ctx.fiber.dispose() })
  const inspection = await adapter.inspect(scope, signal)
  const policy = { scope, taskRef, policyVersion: 1, processor: inspection.processor, config: { instructions: '只分析本提交', allowSessionResume: false }, bindingKey: 'a'.repeat(64) }
  const run = { id: 'a'.repeat(32), scope, taskRef, submissionId: 's'.repeat(24), submissionVersion: 1 }
  const definitions = [{ name: 'human_automation_save', description: 'fixture save', parameters: { type: 'object', properties: {} }, output, async execute() { return { saved: true } } }]
  function request() { const message = adapter.createMessage(run, policy); return { run: { ...run, messageId: message.id }, policy, message: message.message, authorize: async () => {}, tools: definitions, claimed: async () => {} } }
  return { ctx, tools, sessions, session, agent, adapter, scope, policy, run, host, services, controls, pre, call, request, emit, definitions }
}

test('real scoped ToolRuntime denies other tools and PTC inner calls; ordinary next turn regains original tools', async t => {
  let normalCalls = 0, autoResult
  const h = await setup(t, { model: async ({ tools }) => {
    assert.equal((await h.call('ordinary_tool', {})).isError, true)
    assert.equal((await h.call('human_automation_save', {}, { parent: Symbol('ptc') })).isError, true)
    autoResult = await h.call('human_automation_save', {}); assert.equal(autoResult.isError, false)
  }, afterEnd: async ({ tools }) => {
    assert.equal(tools.get('human_automation_save', h.agent), undefined, 'temporary tool is gone at turn/end, before flush')
    assert.equal((await h.call('ordinary_tool', {})).isError, false)
  } })
  h.tools.register({ name: 'ordinary_tool', description: 'native ordinary tool', parameters: { type: 'object', properties: {} }, output, async execute() { normalCalls++; return {} } })
  const result = await h.adapter.run(h.request(), signal)
  assert.equal(result.state, 'succeeded', JSON.stringify(h.controls.failure)); assert.equal(normalCalls, 1); assert.equal(h.controls.modelCalls, 1)
})
test('service-time gate blocks restored pending plugin source without a live job lease', async t => {
  const h = await setup(t), message = pluginMessage(); h.agent.inbox.append('next-turn', message)
  h.session.append('turn/start', { turn: 1 }); const claimed = h.agent.inbox.claim('next-turn', 1)
  const decision = await h.pre(claimed, 1); assert.equal(decision.kind, 'reject'); assert.equal(h.controls.modelCalls, 0)
  assert.equal(h.controls.followups, 0, 'replay prevention does not enqueue another model turn')
})
test('constant gate also blocks post-claim empty-message continuation and direct tool/request bypass', async t => {
  const h = await setup(t); h.agent.inbox.append('next-turn', pluginMessage()); h.session.append('turn/start', { turn: 4 }); h.agent.inbox.claim('next-turn', 4)
  assert.equal((await h.pre([], 4)).kind, 'reject')
  await assert.rejects(h.ctx.waterfall(scopeTarget(h.agent, h.agent), 'agent/request', { agent: h.agent, turn: 4, step: 2, signal }, () => Promise.resolve({})), { code: 'automation-replay-denied' })
  let calls = 0; h.tools.register({ name: 'ordinary_tool', description: '', parameters: { type: 'object', properties: {} }, output, async execute() { calls++; return {} } })
  assert.equal((await h.call('ordinary_tool', {})).isError, true); assert.equal(calls, 0)
})
test('claimed human steering is requeued with identical native ID/source, never swallowed by rejected automation', async t => {
  const human = humanMessage(), h = await setup(t, { beforePre: ({ messages }) => { messages.push(human) } })
  const result = await h.adapter.run(h.request(), signal)
  assert.equal(result.state, 'cancelled'); assert.equal(h.controls.modelCalls, 0)
  assert.deepEqual(h.agent.inbox.nextTurn.find(m => m.id === human.id), human)
  assert.equal(h.agent.inbox.nextTurn.filter(m => m.id === human.id).length, 1)
})
test('actual Inbox insertion stops only owned work and preserves next-step user input', async t => {
  const human = humanMessage(), h = await setup(t, { model: async ({ agent }) => { agent.send(human, 'next-step', false) } })
  const result = await h.adapter.run(h.request(), signal)
  assert.equal(result.state, 'cancelled'); assert.equal(h.controls.cancels, 1)
  assert.deepEqual(h.agent.inbox.nextStep.find(m => m.id === human.id), human)
})
test('cancel before claim leaves wake-latch human turn intact and removes automatic restrictions', async t => {
  const controller = new AbortController(), human = humanMessage()
  const h = await setup(t, { beforeClaim: ({ agent }) => { controller.abort(); agent.send(human, 'next-step', false) }, model: async ({ tools, agent }) => {
    assert.equal(tools.get('human_automation_save', agent), undefined)
  } })
  const result = await h.adapter.run(h.request(), controller.signal)
  assert.equal(result.state, 'unknown'); assert.equal(h.controls.cancels, 0); assert.equal(h.controls.modelCalls, 1, 'only the actual user turn ran')
  assert.deepEqual(h.session.events.find(e => e.type === 'user/message').data, human)
})
test('unleased replay with claimed human input preserves original user message too', async t => {
  const h = await setup(t), human = humanMessage(); h.agent.inbox.append('next-turn', pluginMessage()); h.agent.inbox.append('next-step', human)
  h.session.append('turn/start', { turn: 3 }); const claimed = h.agent.inbox.claim('next-turn', 3)
  assert.equal((await h.pre(claimed, 3)).kind, 'reject'); assert.deepEqual(h.agent.inbox.nextTurn.find(m => m.id === human.id), human)
})
test('no cold restore without explicit owner config; readonly reconciliation does not restore', async t => {
  const h = await setup(t); h.controls.live = false
  assert.equal((await h.adapter.run(h.request(), signal)).state, 'cancelled')
  await h.adapter.reconcile({ ...h.run, messageId: 'unknown_message' }, signal)
  assert.equal(h.controls.restores, 0); assert.equal(h.controls.followups, 0)
})
test('missing native guard/controller/preset capabilities never downgrade to unrestricted run', async t => {
  const h = await setup(t)
  for (const missing of ['tools', 'sessionController', 'agentPresets']) {
    const partial = { get: name => name === missing ? undefined : h.host.get(name), on: h.host.on }, adapter = createNativeAutomationAdapter(partial)
    assert.equal(adapter.probe().supported, false)
    assert.equal((await adapter.run(h.request(), signal)).state, 'failed', 'actual admission cannot use missing guard/native APIs')
    await adapter.close()
  }
  assert.equal(h.controls.followups, 0)
})
test('native capability is current, bounded, non-sensitive and never restores or runs an Agent', async t => {
  const h = await setup(t), originals = { ...h.services }
  for (const [name, expected] of [['sessionController', 'sessionController.inspect'], ['agentPresets', 'agentPresets.readDocument'],
    ['permissionPresets', 'permissionPresets.resolve'], ['workspaceRegistry', 'workspaceRegistry.archivedSessionIds']]) {
    delete h.services[name]
    assert.equal(h.adapter.probe().supported, false); assert(h.adapter.probe().reason.includes(expected))
    await assert.rejects(h.adapter.inspect(h.scope, signal), { code: 'automation-unsupported' })
    h.services[name] = originals[name]
    assert.deepEqual(h.adapter.probe(), { supported: true }, 'same adapter recovers, no reinstall or retry timer')
  }
  h.services.workspaceRegistry = { get archivedSessionIds() { throw new Error('C:/private/profile/SECRET-fake-token') } }
  const blocked = h.adapter.probe()
  assert.equal(blocked.reason, '宿主自动处理接口未就绪或不可用：workspaceRegistry.archivedSessionIds；手动群任务仍可使用')
  h.services.workspaceRegistry = { archivedSessionIds: 'invalid' }; assert.equal(h.adapter.probe().supported, false)
  h.services.workspaceRegistry = originals.workspaceRegistry
  assert.equal(h.adapter.probe().supported, true)
  const unexpected = createNativeAutomationAdapter({ get(name) { if (name === 'agentPresets') throw new Error('C:/private/profile/SECRET-fake-token'); return h.host.get(name) }, on: h.host.on })
  assert(unexpected.probe().reason.includes('agentPresets.readDocument')); assert(!unexpected.probe().reason.includes('SECRET'))
  assert(unexpected.probe().reason.length <= 1000); await unexpected.close()
  assert.equal(h.controls.restores, 0); assert.equal(h.controls.followups, 0); assert.equal(h.controls.modelCalls, 0)
  await h.adapter.close(); assert.equal(h.adapter.probe().supported, false, 'closed adapter cannot revive when services are ready')
})
test('unreadable automation history does not govern ordinary native turns; recognized producer turns remain blocked', async t => {
  const h = await setup(t), human = humanMessage()
  h.agent.session = { id: h.session.id, header: h.session.header }
  assert.equal((await h.pre([], 7)).kind, 'enter', 'unknown native provenance alone is not authority for this plugin to deny execution')
  h.ctx.emit('session/event', h.agent.session, { type: 'turn/start', seq: 200, data: { turn: 8 } })
  h.emit('agent/inbox/claimed', { agent: h.agent, message: human, turn: 8 })
  assert.equal((await h.pre([human], 8)).kind, 'enter')
  assert.deepEqual(await h.ctx.waterfall(scopeTarget(h.agent, h.agent), 'agent/request', { agent: h.agent, turn: 8, step: 1, signal }, () => Promise.resolve({ model: 'normal' })), { model: 'normal' })
  let calls = 0; h.tools.register({ name: 'ordinary_tool', description: '', parameters: { type: 'object', properties: {} }, output, async execute() { calls++; return {} } })
  assert.equal((await h.call('ordinary_tool', {})).isError, false); assert.equal(calls, 1)
  h.ctx.emit('session/event', h.agent.session, { type: 'turn/start', seq: 201, data: { turn: 9 } })
  const producer = pluginMessage(); h.emit('agent/inbox/claimed', { agent: h.agent, message: producer, turn: 9 })
  assert.equal((await h.pre([], 9)).kind, 'reject'); assert.equal((await h.call('ordinary_tool', {})).isError, true)
})

test('leased native automation cannot admit a different producer message claimed in the same turn', async t => {
  const unexpected = pluginMessage()
  const h = await setup(t, { beforePre: ({ agent, current, emit }) => emit('agent/inbox/claimed', { agent, message: unexpected, turn: current }) })
  const result = await h.adapter.run(h.request(), signal)
  assert.equal(result.state, 'cancelled'); assert.equal(h.controls.modelCalls, 0)
})

test('failed history still prevents NEW automatic execution without denying ordinary tools', async t => {
  const h = await setup(t)
  h.services.sessionController.inspect = async () => { throw new Error('history unavailable') }
  let ordinaryCalls = 0
  h.tools.register({ name: 'ordinary_tool', description: '', parameters: { type: 'object', properties: {} }, output, async execute() { ordinaryCalls++; return {} } })
  assert.equal((await h.adapter.run(h.request(), signal)).state, 'failed')
  assert.equal(h.controls.followups, 0); assert.equal(h.controls.modelCalls, 0)
  assert.equal((await h.call('ordinary_tool', {})).isError, false); assert.equal(ordinaryCalls, 1)
})
