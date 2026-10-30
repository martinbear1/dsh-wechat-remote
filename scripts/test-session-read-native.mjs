import test from 'node:test'
import assert from 'node:assert/strict'
import { readNativeSession, nativeSessionReadSupported } from '../lib/human-workflow/session-read-native.js'
import { PrivateInputNative } from '../lib/human-workflow/private-input-native.js'
import { AssistantSessionIntents } from '../lib/assistant-presets/session-intents.js'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const signal = new AbortController().signal
const id = 'session-read-fixture'
const meta = { id, createdAt: 100, cwd: '/fixture', agentPreset: 'assistant_test' }
const events = [{ seq: 0, type: 'agent-preset/selected', data: { agentPreset: 'assistant_test' } }]
const host = services => ({ get: name => services[name], on: () => () => {} })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { resolve, promise } }
function observed(changes = {}) {
  const calls = [], counts = { disposed: 0, events: 0 }
  const observation = { header: meta, get events() { counts.events++; return events },
    [Symbol.dispose]() { counts.disposed++ }, ...changes }
  const services = { sessionQuery: { async observeSession(sessionId, options) {
    calls.push({ sessionId, options }); return observation
  } } }
  return { services, h: host(services), calls, counts, observation }
}

test('legacy inspect remains preferred, keeps receiver and does not probe the alpha path', async () => {
  const f = observed()
  f.services.sessionController = { async inspect(sessionId, supplied) {
    assert.equal(this, f.services.sessionController); assert.equal(sessionId, id); assert.equal(supplied, signal)
    return { meta, events }
  } }
  assert.equal(nativeSessionReadSupported(f.h), true)
  assert.deepEqual(await readNativeSession(f.h, id, signal), { meta, events })
  assert.equal(f.calls.length, 0)
  f.services.sessionController.inspect = async () => { throw Error('native failure') }
  await assert.rejects(readNativeSession(f.h, id, signal), /native failure/)
  assert.equal(f.calls.length, 0)
})

test('alpha observation requests no projections and releases a successful snapshot once', async () => {
  const f = observed()
  assert.equal(nativeSessionReadSupported(f.h), true)
  assert.deepEqual(await readNativeSession(f.h, id, signal), { meta, events })
  assert.deepEqual(f.calls, [{ sessionId: id, options: { signal, projectionMode: 'none' } }])
  assert.deepEqual(f.counts, { disposed: 1, events: 1 })
})

test('header-only observation does not read the event log getter', async () => {
  const f = observed()
  Object.defineProperty(f.observation, 'events', { get() { throw Error('history materialized') } })
  assert.deepEqual(await readNativeSession(f.h, id, signal, { includeEvents: false }), { meta, events: [] })
  assert.equal(f.counts.disposed, 1)
})

test('missing capabilities and invalid request identity fail without activating a session', async () => {
  let activation = 0
  const h = host({ sessionController: { resolveAgent() { activation++ }, create() { activation++ } } })
  assert.equal(nativeSessionReadSupported(h), false)
  assert.equal(nativeSessionReadSupported({ get() { throw Error('missing service') } }), false)
  await assert.rejects(readNativeSession(h, id, signal), { code: 'native-session-read-unavailable' })
  for (const value of ['', '   ', 'x'.repeat(257), null]) await assert.rejects(readNativeSession(h, value, signal), { code: 'native-session-read-invalid' })
  assert.equal(activation, 0)
})

test('alpha invalid native identity/log and throwing getters release the observation', async () => {
  for (const changes of [{ header: { ...meta, id: 'different' } }, { header: { ...meta, createdAt: -1 } },
    { header: { ...meta, createdAt: Number.NaN } }, { events: null }]) {
    const f = observed(changes)
    await assert.rejects(readNativeSession(f.h, id, signal), { code: 'native-session-read-invalid' })
    assert.equal(f.counts.disposed, 1)
  }
  const f = observed()
  Object.defineProperty(f.observation, 'events', { get() { throw Error('read failed') } })
  await assert.rejects(readNativeSession(f.h, id, signal), /read failed/)
  assert.equal(f.counts.disposed, 1)
})

test('pre-cancelled request does not read; late alpha observation is released after cancellation', async () => {
  const f = observed(), controller = new AbortController(), gate = deferred()
  controller.abort()
  await assert.rejects(readNativeSession(f.h, id, controller.signal), { name: 'AbortError' })
  assert.equal(f.calls.length, 0)
  const late = new AbortController()
  f.services.sessionQuery.observeSession = async () => gate.promise
  const result = readNativeSession(f.h, id, late.signal)
  late.abort(); gate.resolve(f.observation)
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(f.counts.disposed, 1)
})

test('late legacy inspection cannot return success after cancellation', async () => {
  const gate = deferred(), controller = new AbortController()
  const result = readNativeSession(host({ sessionController: { inspect: () => gate.promise } }), id, controller.signal)
  controller.abort(); gate.resolve({ meta, events })
  await assert.rejects(result, { name: 'AbortError' })
})

async function privateFixture(t, changes = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'native-session-read-'))
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-alpha.2' }))
  const f = observed(changes)
  f.services.profileContext = { name: 'fixture', installAnchor: path.join(directory, 'package.json'), home: directory, dir: directory }
  f.services.agents = { get() { return undefined } }
  f.services.sessions = { get() { return undefined } }
  f.services.tools = { guard() {} }
  let identity = true
  const bridge = new PrivateInputNative(f.h, 'node_read_fixture', () => { if (!identity) throw Error('revoked owner') })
  t.after(async () => { bridge.close(); await rm(directory, { recursive: true, force: true }) })
  return { ...f, bridge, revoke() { identity = false } }
}

test('private input description can read a cold alpha header without materializing events', async t => {
  const f = await privateFixture(t)
  assert.equal(f.bridge.supported(), true)
  const result = await f.bridge.describe({ sessionId: id }, signal)
  assert.equal(result.sessionGeneration, '100'); assert.equal(result.scope, id)
  assert.deepEqual(result.inputProofVersions, [1]); assert.equal(f.counts.events, 0); assert.equal(f.counts.disposed, 1)
})

test('private input description still rejects either child/fork identity and changed live generation', async t => {
  for (const change of [{ origin: 'subagent' }, { parentSession: 'parent' }, { parentSessionId: 'parent' }]) {
    const f = await privateFixture(t, { header: { ...meta, ...change } })
    await assert.rejects(f.bridge.describe({ sessionId: id }, signal), { code: 'private-input-unavailable' })
    assert.equal(f.counts.disposed, 1)
  }
  const f = await privateFixture(t)
  f.services.sessions.get = () => ({ id, header: { ...meta, createdAt: 101 } })
  await assert.rejects(f.bridge.describe({ sessionId: id }, signal), { code: 'private-input-unavailable' })
})

test('private input late read cannot succeed after owner changes or plugin closes', async t => {
  for (const close of [false, true]) {
    const f = await privateFixture(t), gate = deferred()
    f.services.sessionQuery.observeSession = () => gate.promise
    const result = f.bridge.describe({ sessionId: id }, signal)
    if (close) f.bridge.close(); else f.revoke()
    gate.resolve(f.observation)
    await assert.rejects(result, close ? { name: 'AbortError' } : /revoked owner/)
    assert.equal(f.counts.disposed, 1)
  }
})

async function intentFixture(t) {
  let saved, identity = true, header
  const f = observed(), workspace = { path: '/fixture', sessionIds: [] }
  f.services.sessionQuery.observeSession = async () => ({ header, events: [], [Symbol.dispose]() { f.counts.disposed++ } })
  const journal = await AssistantSessionIntents.open({ nodeId: 'node_intent_fixture',
    store: { async load() { return saved }, async save(value) { saved = structuredClone(value) } },
    installed: () => true, supported: () => nativeSessionReadSupported(f.h),
    assertIdentity() { if (!identity) throw Error('revoked owner') }, workspace: () => workspace,
    inspect: (sessionId, supplied) => readNativeSession(f.h, sessionId, supplied) })
  const intent = await journal.prepare({ presetId: 'assistant_test', workspaceId: 'workspace_a' }, signal)
  header = { ...meta, id: intent.sessionId }; workspace.sessionIds.push(intent.sessionId)
  t.after(() => journal.close())
  return { ...f, journal, intent, workspace, setHeader(value) { header = value }, get header() { return header }, revoke() { identity = false } }
}

test('assistant uncertain intent resolves via native cold read, without replay/create', async t => {
  const f = await intentFixture(t)
  const confirmed = await f.journal.status({ attemptId: f.intent.attemptId }, signal)
  assert.equal(confirmed.state, 'created'); assert.equal(confirmed.dispatch, false)
  assert.equal(confirmed.sessionGeneration, '100'); assert.equal(f.counts.disposed, 1)
  assert.equal((await f.journal.prepare({ presetId: 'assistant_test', workspaceId: 'workspace_a' }, signal)).dispatch, false)
  for (const change of [{ parentSession: 'parent' }, { parentSessionId: 'parent' }, { createdAt: 101 }, { agentPreset: 'different' }, { cwd: '/different' }]) {
    f.setHeader({ ...meta, id: f.intent.sessionId, ...change })
    assert.equal((await f.journal.status({ attemptId: f.intent.attemptId }, signal)).state, 'conflict')
  }
})

test('assistant missing native session stays uncertain and owner/cancel rejects late results', async t => {
  const f = await intentFixture(t)
  f.services.sessionQuery.observeSession = async () => { throw Object.assign(Error('missing'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' }) }
  assert.equal((await f.journal.status({ attemptId: f.intent.attemptId }, signal)).state, 'unknown')
  assert.equal((await f.journal.prepare({ presetId: 'assistant_test', workspaceId: 'workspace_a' }, signal)).dispatch, false)
  const gate = deferred()
  f.services.sessionQuery.observeSession = () => gate.promise
  const pending = f.journal.status({ attemptId: f.intent.attemptId }, signal)
  f.revoke(); gate.resolve({ header: f.header, events: [], [Symbol.dispose]() { f.counts.disposed++ } })
  await assert.rejects(pending, /revoked owner/); assert.equal(f.counts.disposed, 1)
})

test('assistant cancellation and closure dispose late reads without confirming creation', async t => {
  for (const close of [false, true]) {
    const f = await intentFixture(t), gate = deferred(), controller = new AbortController()
    f.services.sessionQuery.observeSession = () => gate.promise
    const pending = f.journal.status({ attemptId: f.intent.attemptId }, controller.signal)
    if (close) await f.journal.close(); else controller.abort()
    gate.resolve({ header: f.header, events: [], [Symbol.dispose]() { f.counts.disposed++ } })
    await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.counts.disposed, 1)
    if (!close) {
      f.services.sessionQuery.observeSession = async () => { throw Error('temporarily unavailable') }
      assert.equal((await f.journal.status({ attemptId: f.intent.attemptId }, signal)).state, 'unknown')
    }
  }
})
