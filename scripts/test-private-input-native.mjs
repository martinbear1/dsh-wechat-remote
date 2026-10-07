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
  let identity = true, now = Date.now(), last, toolCalls = 0, requestHandler, timerId = 0
  const turnAbort = new AbortController(), timers = new Map(), requests = [], cloudRuns = new Map()
  const cloudReply = body => {
    const { operation, runId, inputId, nativeMessageId, scope, sessionGeneration } = body
    let run = cloudRuns.get(runId)
    if (operation === 'private-input-end') { run = { state: 'ended', leaseExpiresAt: null }; cloudRuns.set(runId, run) }
    else if (run?.state === 'ended' || run && run.leaseExpiresAt <= now) throw Error('private_run_expired')
    else if (operation === 'private-input-claim') {
      if (!run) { run = { state: 'active', leaseExpiresAt: now + 120000 }; cloudRuns.set(runId, run) }
    } else if (operation === 'private-input-renew' && run) run.leaseExpiresAt = now + 120000
    else throw Error('invalid_private_run')
    return { ok: true, schema: 'human.owner.input.run.v1', ...run, runId, inputId, nativeMessageId, scope, sessionGeneration }
  }
  const transport = { nodeId, assertIdentity() { if (!identity) throw Error('revoked') },
    async request(operation, body, signal) {
      assert.equal(operation, 'lifecycle'); assert.equal(body.audience, 'human.workflow.node.v1')
      assert.match(body.runId, /^[a-f0-9]{32}$/)
      requests.push({ body: structuredClone(body), signal })
      return requestHandler ? requestHandler(body, signal, () => cloudReply(body)) : cloudReply(body)
    } }
  const bridge = new PrivateInputNative(ctx, nodeId, () => { if (!identity) throw Error('revoked') }, () => now,
    options.leases ? { transport, schedule(callback, milliseconds) {
      assert.equal(milliseconds, 30000)
      const id = ++timerId; timers.set(id, { at: now + milliseconds, callback }); return () => timers.delete(id)
    } } : {})
  tools.register({ name: 'fixture_private_publish', description: 'fixture', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) { toolCalls++; last = await bridge.ownerInput(exec, taskRef, draftRef); return { granted: true } } })
  let seq = 0, turn = 0
  function proof(parts = content, changes = {}) { return { schema: 'human.owner.input.v1', inputProof: 'opaque.owner.token', inputId: 'input-' + (++seq),
    contentDigest: privateInputTextDigest(parts), scope: String(session.id), sessionGeneration: '100', binding,
    ...(options.leases ? { schema: 'human.owner.input.v2', admissionExpiresAt: now + 600000 } : { expiresAt: now + 600000 }), ...changes } }
  async function send(parts = content, supplied = proof(parts)) {
    const payload = { sessionId: String(session.id), mode: 'queue', content: parts }
    const rpcId = 'rpc-' + seq
    return bridge.run(payload, supplied, () => api.sessions.prompt({ type: 'client-request', method: 'session.prompt', rpcId, payload }), rpcId)
  }
  async function enter(extra = [], returnedExtra = []) {
    const current = ++turn; session.append('turn/start', { turn: current })
    const messages = [...agent.inbox.claim('next-turn', current), ...extra]
    const decision = await ctx.waterfall(scopeTarget(agent, agent), 'agent/pre-step', { agent, messages, turn: current, step: 1, signal: turnAbort.signal },
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
    requests, cloudRuns, timers, turnAbort, transport,
    get last() { return last }, get toolCalls() { return toolCalls }, get now() { return now },
    setRequestHandler(handler) { requestHandler = handler }, advance(ms) { now += ms },
    async tick(ms = 30000) {
      now += ms
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback() }
      await new Promise(resolve => setImmediate(resolve))
    },
    expire() { now += 600001 }, revoke() { identity = false } }
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
  assert.deepEqual(await h.bridge.describe({ sessionId: h.session.id }, signal), { nodeId, scope: h.session.id, sessionGeneration: '100', supported: true, inputProofVersions: [1] })
  await assert.rejects(h.bridge.ownerInput({ agent: h.agent, signal }, taskRef, draftRef))
  compatibility.dispose()
})

test('v2 admits only the genuine native input then renews its current turn beyond ten minutes without model tools', async t => {
  const h = await setup(t, { leases: true }), proof = h.proof()
  assert.deepEqual((await h.bridge.describe({ sessionId: h.session.id }, signal)).inputProofVersions, [1, 2])
  await h.send(content, proof)
  assert.equal(h.requests.length, 0, 'queued input does not start a run')
  const runtime = createUserMessage({ source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'native runtime context' }] })
  await h.enter([], [runtime])
  assert.equal((await h.call()).isError, false)
  assert.match(h.last.runId, /^[a-f0-9]{32}$/)
  const runId = h.last.runId, nativeMessageId = h.last.nativeMessageId
  for (let i = 0; i < 24; i++) await h.tick()
  assert(h.now > proof.admissionExpiresAt)
  h.last.assertCurrent()
  assert.equal((await h.call()).isError, false)
  assert.equal(h.last.runId, runId)
  assert.equal(h.requests.filter(r => r.body.operation === 'private-input-claim').length, 1)
  assert.equal(h.requests.filter(r => r.body.operation === 'private-input-renew').length, 24)
  assert(h.requests.every(r => r.body.runId === runId && r.body.nativeMessageId === nativeMessageId && r.body.inputId === proof.inputId))
  assert.equal(h.toolCalls, 2, 'heartbeats do not inject tools or messages')
  assert.equal(JSON.stringify(h.session.events).includes(proof.inputProof), false)
  assert.equal(JSON.stringify(h.session.events).includes(runId), false)
  h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal(h.timers.size, 0)
  assert.equal(h.cloudRuns.get(runId).state, 'ended')
  assert.throws(h.last.assertCurrent)
})

test('v2 only changes active-run duration; expired queue, mixed version fields and missing transport cannot claim', async t => {
  for (const kind of ['expired-queue', 'mixed-fields', 'legacy-fields', 'missing-transport']) await t.test(kind, async t => {
    const h = await setup(t, { leases: kind !== 'missing-transport' })
    let proof = h.proof()
    if (kind === 'missing-transport') { delete proof.expiresAt; proof.schema = 'human.owner.input.v2'; proof.admissionExpiresAt = h.now + 600000 }
    if (kind === 'mixed-fields') proof.expiresAt = h.now + 600000
    if (kind === 'legacy-fields') { proof.schema = 'human.owner.input.v1'; proof.expiresAt = h.now + 600000 }
    assert.equal((await h.send(content, proof)).result.ok, true)
    if (kind === 'expired-queue') h.expire()
    await h.enter()
    assert.equal((await h.call()).isError, true)
    assert.equal(h.requests.length, 0)
    assert.equal(h.timers.size, 0)
  })
})

test('v2 stop, cancellation, new input, new turn, identity/header change and close terminate renewal', async t => {
  for (const kind of ['stop', 'abort', 'insert', 'end', 'new-turn', 'identity', 'header', 'close', 'discard']) await t.test(kind, async t => {
    const h = await setup(t, { leases: true }); await h.send(); await h.enter()
    assert.equal((await h.call()).isError, false)
    const runId = h.last.runId
    if (kind === 'stop') h.ctx.emit('workspace/session-stop', { sessionId: h.session.id })
    if (kind === 'abort') h.turnAbort.abort()
    if (kind === 'insert') await h.send([{ type: 'text', text: '不要更新了' }])
    if (kind === 'end') h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    if (kind === 'new-turn') h.session.append('turn/start', { turn: 2 })
    if (kind === 'identity') h.revoke()
    if (kind === 'header') h.agent.session = { ...h.session, header: { ...h.session.header, createdAt: 101 } }
    if (kind === 'close') h.bridge.close()
    if (kind === 'discard') h.emit('agent/inbox/discarded', { agent: h.agent, message: { id: h.last.nativeMessageId } })
    assert.throws(h.last.assertCurrent)
    await h.tick()
    assert.equal(h.timers.size, 0)
    assert.equal(h.cloudRuns.get(runId).state, 'ended')
    assert.equal(h.requests.filter(r => r.body.operation === 'private-input-renew').length, 0)
  })
})

test('v2 claim failures and invalid replies leave ordinary chat usable but never grant or schedule updates', async t => {
  for (const kind of ['network', 'wrong-run', 'wrong-input', 'wrong-message', 'wrong-scope', 'wrong-generation', 'long-deadline', 'expired', 'extra-field', 'ended', 'not-ok']) await t.test(kind, async t => {
    const h = await setup(t, { leases: true })
    h.setRequestHandler((body, _signal, normal) => {
      if (body.operation !== 'private-input-claim') return normal()
      if (kind === 'network') throw Error('offline')
      const reply = normal()
      if (kind === 'wrong-run') reply.runId = 'a'.repeat(32)
      if (kind === 'wrong-input') reply.inputId = 'other'
      if (kind === 'wrong-message') reply.nativeMessageId = 'other'
      if (kind === 'wrong-scope') reply.scope = 'other'
      if (kind === 'wrong-generation') reply.sessionGeneration = 'other'
      if (kind === 'long-deadline') reply.leaseExpiresAt = h.now + 600000
      if (kind === 'expired') reply.leaseExpiresAt = h.now
      if (kind === 'extra-field') reply.approved = true
      if (kind === 'ended') { reply.state = 'ended'; reply.leaseExpiresAt = null }
      if (kind === 'not-ok') reply.ok = false
      return reply
    })
    assert.equal((await h.send()).result.ok, true)
    assert.equal((await h.enter()).length, 1, 'normal native turn still enters')
    assert.equal((await h.call()).isError, true)
    assert.equal(h.timers.size, 0)
    for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
  })
})

test('v2 claim admitted before ten-minute deadline can finish after it, but a stop while awaiting cannot revive', async t => {
  for (const stopped of [false, true]) await t.test(String(stopped), async t => {
    const h = await setup(t, { leases: true }); await h.send(); h.advance(599999)
    let finish, claimSignal
    h.setRequestHandler((body, requestSignal, normal) => {
      if (body.operation !== 'private-input-claim') return normal()
      const response = normal(); claimSignal = requestSignal
      return new Promise(resolve => { finish = () => resolve(response) })
    })
    const entering = h.enter()
    await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof finish, 'function')
    h.advance(2)
    if (stopped) h.turnAbort.abort()
    finish(); await entering
    assert.equal((await h.call()).isError, stopped)
    if (stopped) {
      assert.equal(claimSignal.aborted, true)
      assert.equal(h.timers.size, 0)
      for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
      assert(h.requests.filter(r => r.body.operation === 'private-input-end').every(r => !r.signal.aborted), 'end uses independent bounded cleanup signal')
    }
  })
})

test('v2 expired, failed or stopped-in-flight renewal never restarts or resurrects a run', async t => {
  for (const kind of ['network', 'expired-before-request', 'expired-before-response', 'stop-during-response']) await t.test(kind, async t => {
    const h = await setup(t, { leases: true }); await h.send(); await h.enter(); await h.call()
    let finish, renewalSignal
    h.setRequestHandler((body, requestSignal, normal) => {
      if (body.operation !== 'private-input-renew') return normal()
      if (kind === 'network') throw Error('offline')
      renewalSignal = requestSignal; const reply = normal()
      return new Promise(resolve => { finish = () => resolve(reply) })
    })
    await h.tick(kind === 'expired-before-request' ? 120001 : 30000)
    if (finish) {
      if (kind === 'expired-before-response') h.advance(100000)
      else h.ctx.emit('workspace/session-stop', { sessionId: h.session.id })
      finish(); await new Promise(resolve => setImmediate(resolve))
      assert.equal(renewalSignal.aborted, true)
    }
    assert.throws(h.last.assertCurrent)
    assert.equal(h.timers.size, 0)
    assert.equal((await h.call()).isError, true)
    const previous = h.requests.length; await h.tick(600000)
    assert.equal(h.requests.length, previous, 'no retries or claim-again after failure')
    for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
  })
})

test('v2 downstream pre-step failure and duplicate user event cannot leave input authority running', async t => {
  for (const kind of ['pre-step-error', 'duplicate-user-event']) await t.test(kind, async t => {
    const h = await setup(t, { leases: true }); await h.send()
    if (kind === 'pre-step-error') {
      h.session.append('turn/start', { turn: 1 })
      const messages = h.agent.inbox.claim('next-turn', 1)
      await assert.rejects(h.ctx.waterfall(scopeTarget(h.agent, h.agent), 'agent/pre-step',
        { agent: h.agent, messages, turn: 1, step: 1, signal: h.turnAbort.signal },
        () => Promise.reject(Error('downstream pre-step failed'))), /downstream pre-step failed/)
      assert.equal(h.requests.length, 0)
    } else {
      await h.enter(); await h.call()
      const original = h.session.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      h.session.append('user/message', original.data, { surfaceOp: 'append' })
      assert.throws(h.last.assertCurrent)
      for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
    }
    assert.equal((await h.call()).isError, true)
    assert.equal(h.timers.size, 0)
  })
})

test('v2 end arriving before delayed claim creates a terminal run, not a new lease', async t => {
  const h = await setup(t, { leases: true }); await h.send()
  let finish
  h.setRequestHandler((body, _signal, normal) => body.operation !== 'private-input-claim' ? normal()
    : new Promise((resolve, reject) => { finish = () => { try { resolve(normal()) } catch (error) { reject(error) } } }))
  const entering = h.enter()
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof finish, 'function')
  h.turnAbort.abort()
  assert.equal(h.cloudRuns.size, 1)
  for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
  finish(); await entering
  assert.equal((await h.call()).isError, true)
  assert.equal(h.timers.size, 0)
  for (const run of h.cloudRuns.values()) assert.equal(run.state, 'ended')
})
