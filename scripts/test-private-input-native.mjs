import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Inbox } from '../node_modules/@deepseek-ai/dsh-agent/lib/types/inbox.js'
import { createApiProxy } from '../node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api-proxy.js'
import { PrivateInputNative, privateInputTextDigest } from '../lib/human-workflow/private-input-native.js'
import { DshCompatibilityApi } from '../lib/dsh-compatibility-api.js'
import { planLegacyRpc } from '../lib/dsh-protocol-compat.js'

const nodeId = 'private_native_fixture', signal = new AbortController().signal
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const draftRef = { schema: 'human.workflow.draft.ref.v1', taskId: taskRef.taskId, deliveryId: taskRef.deliveryId, draftId: 'd'.repeat(24), revision: 1, digest: 'a'.repeat(64), kind: 'review' }
const content = [{ type: 'text', text: '把这份评语更新给他，暂时不用发提醒。' }]
const binding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: 'owner', accountInstance: 'account', generation: 'g1' }
async function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-native-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: options.version ?? '0.2.0-rc.1' }))
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const sessions = new SessionStore(ctx), tools = new ToolRuntime(ctx, { mode: 'native' })
  ctx.provide('profileContext', { name: 'fixture', home: dir, dir, installAnchor: path.join(dir, 'package.json') })
  const session = sessions.create(SessionId('fixture-session'), { meta: { createdAt: 100, cwd: dir } })
  const agent = { id: session.id, session, options: { provider: 'fixture', model: 'never-network' }, status: 'idle', ctx: null, inbox: null,
    followup(message) { this.inbox.append('next-turn', message) }, steer(message) { this.inbox.append('next-step', message) } }
  const owned = createScope(ctx, agent); agent.ctx = owned.ctx
  const emit = (name, payload) => ctx.emit(scopeTarget(agent, agent), name, payload)
  agent.inbox = new Inbox(session, { inserted: message => emit('agent/inbox/inserted', { agent, message }),
    claimed: (message, turn) => emit('agent/inbox/claimed', { agent, message, turn }), discarded: message => emit('agent/inbox/discarded', { agent, message }) })
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined })
  ctx.provide('sessionController', { inspect: async id => { assert.equal(id, agent.id); return { meta: session.header, events: session.events } } })
  ctx.provide('userQuestions', { registerProvider() { return () => {} } })
  const api = createApiProxy(ctx, { defaultModelSelection: () => agent.options, defaultCwd: dir })
  let identity = true, now = Date.now(), last, toolCalls = 0
  const bridge = new PrivateInputNative(ctx, nodeId, () => { if (!identity) throw Error('revoked') }, () => now)
  tools.register({ name: 'fixture_private_publish', description: 'fixture', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) { toolCalls++; last = await bridge.ownerInput(exec, taskRef, draftRef); return { granted: true } } })
  let seq = 0, turn = 0
  function proof(parts = content, changes = {}) { return { schema: 'human.owner.input.v1', inputProof: 'opaque.owner.token', inputId: 'input-' + (++seq),
    contentDigest: privateInputTextDigest(parts), scope: String(session.id), sessionGeneration: '100', binding, expiresAt: now + 600000, ...changes } }
  async function send(parts = content, supplied = proof(parts)) {
    const payload = { sessionId: String(session.id), mode: 'queue', content: parts }
    const rpcId = 'rpc-' + seq
    return bridge.run(payload, supplied, () => api.sessions.prompt({ type: 'client-request', method: 'session.prompt', rpcId, payload }), rpcId)
  }
  async function enter(extra = [], returnedExtra = []) {
    const current = ++turn; session.append('turn/start', { turn: current })
    const messages = [...agent.inbox.claim('next-turn', current), ...extra]
    const decision = await ctx.waterfall(scopeTarget(agent, agent), 'agent/pre-step', { agent, messages, turn: current, step: 1, signal },
      () => Promise.resolve({ kind: 'enter', messages: [...messages, ...returnedExtra] }))
    for (const message of decision.messages) session.append('user/message', message, { surfaceOp: 'append' })
    return messages
  }
  async function call(options = {}) {
    const callId = 'call-' + (++seq)
    if (options.record !== false) session.append('tool/call', { turn, step: 1, callId, name: 'fixture_private_publish', arguments: '{}' })
    return tools.execute({ name: 'fixture_private_publish', arguments: {}, agent, callId, signal, ...options.exec })
  }
  t.after(async () => { bridge.close(); await owned.dispose(); await ctx.fiber.dispose(); fs.rmSync(dir, { recursive: true, force: true }) })
  return { ctx, bridge, tools, sessions, session, agent, api, send, proof, enter, call, emit,
    get last() { return last }, get toolCalls() { return toolCalls }, expire() { now += 600001 }, revoke() { identity = false } }
}

test('actual native ApiProxy prompt inserts original user identity, Inbox claim and ToolRuntime bind private authority', async t => {
  const h = await setup(t), proof = h.proof()
  const reply = await h.send(content, proof); assert.equal(reply.result.ok, true)
  const message = h.agent.inbox.nextTurn[0]
  assert.equal(message.source.kind, 'user'); assert.equal(message.source.rpcId.startsWith('rpc-'), true)
  assert.equal(JSON.stringify(h.session.events).includes(proof.inputProof), false)
  await h.enter(); const result = await h.call()
  assert.equal(result.isError, false, JSON.stringify(result)); assert.equal(h.last.nativeMessageId, message.id)
  assert.equal(h.last.inputProof, proof.inputProof); assert.equal(h.last.idempotencyKey.length, 64)
  assert.equal(JSON.stringify(result).includes(proof.inputProof), false)
  h.last.assertCurrent()
})
test('modern runtime-context is not owner authority and does not block the genuine input', async t => {
  const h = await setup(t); await h.send()
  const runtime = createUserMessage({ source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'native context facts, not permission' }] })
  await h.enter([], [runtime]); assert.equal((await h.call()).isError, false)
})
test('same text or historical user message without this authenticated invocation does not mint authority', async t => {
  const h = await setup(t)
  await h.api.sessions.prompt({ rpcId: 'native-desktop', payload: { sessionId: h.session.id, mode: 'queue', content } })
  await h.enter(); assert.equal((await h.call()).isError, true)
  assert.equal(h.last, undefined)
})

test('missing current proof is not reported as a disabled switch or missing user intent', async t => {
  const h = await setup(t)
  const exec = { agent: h.agent, token: Symbol('fixture'), callId: 'fake', rootCallId: 'fake', signal }
  const status = await h.bridge.ownerInputStatus(exec)
  assert.equal(status.state, 'no-current-input')
  assert.match(status.reason, /不代表.*开关关闭/)
  await assert.rejects(h.bridge.ownerInput(exec, taskRef, draftRef), error => {
    assert.equal(error.code, 'private-input-unavailable')
    assert.match(error.message, /不能据此判断.*开关是否开启/)
    assert(!error.message.includes('请开启'));assert(!error.message.includes('只有准备权限'))
    return true
  })
})

test('unsupported native runtime has a distinct recovery message rather than switching permission on', async t => {
  const h = await setup(t, { version: '0.1.7' })
  const exec = { agent: h.agent, token: Symbol('fixture'), callId: 'fake', rootCallId: 'fake', signal }
  assert.equal((await h.bridge.ownerInputStatus(exec)).state, 'unavailable')
  await assert.rejects(h.bridge.ownerInput(exec, taskRef, draftRef), error => {
    assert.equal(error.code, 'private-input-unavailable');assert.match(error.message, /宿主尚不能/)
    assert(!error.message.includes('请开启'));return true
  })
})
test('invalid scope, generation, digest, node, expiration and unknown fields are draft-only, not lost chat', async t => {
  for (const change of [{ scope: 'other' }, { sessionGeneration: '101' }, { contentDigest: 'b'.repeat(64) },
    { binding: { ...binding, nodeId: 'other' } }, { expiresAt: 0 }, { approved: true }]) {
    await t.test(JSON.stringify(change), async t => {
      const h = await setup(t); assert.equal((await h.send(content, h.proof(content, change))).result.ok, true)
      await h.enter(); assert.equal((await h.call()).isError, true)
    })
  }
})
test('new user insertion, turn end, session header change, revocation and expiry invalidate outstanding tool authority', async t => {
  for (const kind of ['insert', 'end', 'header', 'identity', 'expiry', 'close']) await t.test(kind, async t => {
    const h = await setup(t); await h.send(); await h.enter(); assert.equal((await h.call()).isError, false)
    if (kind === 'insert') await h.send([{ type: 'text', text: '先不要更新' }])
    if (kind === 'end') h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    if (kind === 'header') h.agent.session = { ...h.session, header: { ...h.session.header, createdAt: 101 } }
    if (kind === 'identity') h.revoke()
    if (kind === 'expiry') h.expire()
    if (kind === 'close') h.bridge.close()
    assert.throws(h.last.assertCurrent)
  })
})
test('discarded input, multiple claimed users and injected plugin messages cannot authorize publication', async t => {
  for (const kind of ['discard', 'multiple', 'plugin']) await t.test(kind, async t => {
    const h = await setup(t); await h.send()
    if (kind === 'discard') { h.agent.inbox.clear(); await h.enter() }
    else await h.enter([], [createUserMessage({ source: kind === 'plugin' ? { kind: 'plugin', plugin: 'fixture' } : { kind: 'user' }, content })])
    assert.equal((await h.call()).isError, true)
  })
})
test('tool authority needs native recorded root call and registry execution; no direct callback/history reuse', async t => {
  const h = await setup(t); await h.send(); await h.enter()
  assert.equal((await h.call({ record: false })).isError, true)
  await assert.rejects(h.bridge.ownerInput({ agent: h.agent, token: Symbol('fake'), callId: 'fake', rootCallId: 'fake', signal }, taskRef, draftRef), { code: 'private-input-unavailable' })
})
test('late asynchronous insertion cannot retain closed invocation authority', async t => {
  const h = await setup(t)
  let late
  const payload = { sessionId: h.session.id, mode: 'queue', content }
  await h.bridge.run(payload, h.proof(), async () => { late = () => h.api.sessions.prompt({ rpcId: 'late', payload }) }, 'late')
  await late(); await h.enter(); assert.equal((await h.call()).isError, true)
})

test('same text inserted in the invocation by a different native RPC cannot inherit proof', async t => {
  const h = await setup(t), payload = { sessionId: h.session.id, mode: 'queue', content }
  await h.bridge.run(payload, h.proof(), () => h.api.sessions.prompt({ rpcId: 'unrelated-rpc', payload }), 'authenticated-rpc')
  await h.enter(); assert.equal((await h.call()).isError, true)
})
test('old/unknown host and slash command input stay draft-only; no text does not have a digest', async t => {
  const h = await setup(t, { version: '0.1.7' }); assert.equal(h.bridge.supported(), false)
  await h.send(); await h.enter(); assert.equal((await h.call()).isError, true)
  assert.equal(privateInputTextDigest([{ type: 'image', data: 'not-authority' }]), undefined)
  assert.equal(privateInputTextDigest([{ type: 'text', text: 'a'.repeat(256 * 1024) }]), undefined)
  assert.equal(privateInputTextDigest([...content, { type: 'image', data: 'attached material' }]), privateInputTextDigest(content))
})
test('authenticated compatibility strips ownerInput before gateway and legacy planner; read-only generation does not authorize', async t => {
  const h = await setup(t); const seen = []
  const gateway = { invoke: async ({ args }) => { seen.push(args); return { accepted: true } }, stream: async () => ({ async *[Symbol.asyncIterator]() {} }), wireStream: { open: async () => ({ async *[Symbol.asyncIterator]() {} }) } }
  h.ctx.provide('typertGateway', gateway)
  const compatibility = new DshCompatibilityApi(h.ctx); compatibility.privateInput = h.bridge
  const payload = { sessionId: h.session.id, content, mode: 'queue', ownerInput: h.proof() }
  const reply = await compatibility.request({ method: 'POST', path: '/api/session.prompt', body: Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'compat', method: 'session.prompt', payload })), signal })
  assert.equal(reply.statusCode, 200); assert.equal(JSON.stringify(seen).includes('inputProof'), false)
  assert.equal(JSON.stringify(planLegacyRpc({ rpcId: 'defense', method: 'session.prompt', payload })).includes('inputProof'), false)
  assert.equal(JSON.stringify(planLegacyRpc({ rpcId: 'defense-alias', method: 'session/prompt', payload: { args: { request: payload } } })).includes('inputProof'), false)
  assert.deepEqual(await h.bridge.describe({ sessionId: h.session.id }, signal), { nodeId, scope: h.session.id, sessionGeneration: '100', supported: true })
  await assert.rejects(h.bridge.ownerInput({ agent: h.agent, signal }, taskRef, draftRef))
  compatibility.dispose()
})
