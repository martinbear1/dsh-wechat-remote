import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { transform } from 'esbuild'
import { AssistantSessionIntents } from '../lib/assistant-presets/session-intents.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
const source = await readFile(new URL('../src/client/assistant-navigation.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' })
const { nativeAssistantNavigation } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const presetId = 'assistant_teacher_test', signal = new AbortController().signal
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve } }
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'assistant-intent-')), calls = [], native = new Map(), workspace = { path: 'C:/work', sessionIds: [] }
  let valid = true
  const options = { nodeId: 'node_assistant_test', store: new WorkflowFileStore(path.join(directory, 'intents.json')),
    assertIdentity() { if (!valid) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) }, installed: () => true, supported: () => true,
    workspace: id => id === 'workspace_a' ? workspace : undefined,
    inspect: async id => { calls.push(['inspect', id]); if (!native.has(id)) throw new Error('native not found C:/private/path'); return structuredClone(native.get(id)) } }
  let journal = await AssistantSessionIntents.open(options)
  const navigation = new AbortController(), services = {
    'remote.session': { create: async request => { calls.push(['create', request]); native.set(request.sessionId, { meta: { id: request.sessionId, agentPreset: request.agentPreset, createdAt: 100, cwd: workspace.path }, events: [] }); workspace.sessionIds.push(request.sessionId); return { ok: true, value: request } } },
    sessions: { refresh: async () => calls.push(['refresh']) }, uiWorkspace: { openSession: id => calls.push(['open', id]) },
    layout: { beginNavigation: () => navigation.signal }, configForms: { developerTools: { enabled: { getSnapshot: () => true } } },
  }
  const call = (method, request) => method === 'assistantSessionPrepare' ? journal.prepare(request, signal) : journal.status(request, signal)
  let controller = nativeAssistantNavigation(name => services[name], call)
  t.after(async () => { await journal.close(); await rm(directory, { recursive: true, force: true }) })
  return { calls, services, navigation, native, options, workspace, get journal() { return journal }, get controller() { return controller }, revoke() { valid = false },
    async reopen() { await journal.close(); journal = await AssistantSessionIntents.open(options); controller = nativeAssistantNavigation(name => services[name], call) } }
}
test('native create uses journaled explicit ID/preset; restart only opens confirmed session', async t => {
  const f = await fixture(t); await f.controller.start(presetId)
  const request = f.calls.find(c => c[0] === 'create')[1]
  assert.equal(request.agentPreset, presetId); assert.match(request.sessionId, /^session-[a-f0-9-]{36}$/)
  assert.deepEqual(Object.keys(request).sort(), ['agentPreset', 'sessionId'])
  await f.reopen(); await f.controller.start(presetId)
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1); assert.deepEqual(f.calls.at(-1), ['open', request.sessionId])
})
test('explicit new intent creates a second independent instance, repeated old CAS does not create a third', async t => {
  const f = await fixture(t); await f.controller.start(presetId)
  const first = await f.journal.status({ presetId }, signal)
  await f.controller.start(presetId, signal, true)
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 2)
  const replay = await f.journal.prepare({ presetId, previousAttemptId: first.attemptId }, signal)
  assert.equal(replay.dispatch, false); assert.notEqual(replay.attemptId, first.attemptId)
})
test('lost native response reconciles committed native identity without a second create', async t => {
  const f = await fixture(t), create = f.services['remote.session'].create
  f.services['remote.session'].create = async request => { await create(request); throw new Error('lost response') }
  await assert.rejects(f.controller.start(presetId), /lost response/); await f.reopen(); await f.controller.start(presetId)
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1)
})
test('crash after prepare but before native create stays unknown; read-only selector recovers intent', async t => {
  const f = await fixture(t), intent = await f.journal.prepare({ presetId }, signal)
  assert.equal(intent.dispatch, true); await f.reopen()
  const status = await f.journal.status({ presetId }, signal)
  assert.equal(status.attemptId, intent.attemptId); assert.equal(status.state, 'unknown'); assert.equal(status.dispatch, false)
  assert(!JSON.stringify(status).includes('private/path'))
  await assert.rejects(f.controller.start(presetId), /不会自动再次创建/)
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 0)
})
test('read-only missing selector writes no intent, concurrent prepares release exactly one dispatch permission', async t => {
  const f = await fixture(t)
  assert.equal((await f.journal.status({ presetId }, signal)).state, 'none')
  assert.equal(await f.options.store.load(), undefined)
  const results = await Promise.all([f.journal.prepare({ presetId }, signal), f.journal.prepare({ presetId }, signal)])
  assert.equal(results.filter(r => r.dispatch).length, 1); assert.equal(results[0].attemptId, results[1].attemptId)
})
test('workspace membership, generation and preset substitution never confirm another identity', async t => {
  const f = await fixture(t), intent = await f.journal.prepare({ presetId, workspaceId: 'workspace_a' }, signal)
  await f.services['remote.session'].create({ agentPreset: presetId, sessionId: intent.sessionId })
  assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'created')
  for (const change of [h => { h.meta.createdAt++ }, h => { h.meta.agentPreset = 'different' }, h => { h.meta.cwd = 'C:/other' }]) {
    const original = f.native.get(intent.sessionId); const changed = structuredClone(original); change(changed); f.native.set(intent.sessionId, changed)
    assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'conflict'); f.native.set(intent.sessionId, original)
  }
  f.workspace.sessionIds.length = 0
  assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'conflict')
})
test('native interface or journal unsupported rejects before create; baseline original UI is untouched', async t => {
  const f = await fixture(t)
  for (const name of ['remote.session', 'sessions', 'uiWorkspace', 'layout', 'configForms']) {
    const saved = f.services[name]; delete f.services[name]; await assert.rejects(f.controller.start(presetId), /原生界面未提供/); f.services[name] = saved
  }
  const legacy = nativeAssistantNavigation(name => f.services[name]); await assert.rejects(legacy.start(presetId), /原生界面未提供/)
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 0)
})
test('concurrent clicks, connection reset and page departure never repeat late native work', async t => {
  const f = await fixture(t), gate = deferred(), entered = deferred(), create = f.services['remote.session'].create
  f.services['remote.session'].create = async request => { entered.resolve(); await gate.promise; return create(request) }
  const pending = f.controller.start(presetId); await entered.promise
  await f.controller.start(presetId); f.controller.reset(); gate.resolve()
  await assert.rejects(pending, /导航或连接已变化/)
  assert.equal(f.calls.filter(c => c[0] === 'open').length, 0)
  await f.controller.start(presetId); assert.equal(f.calls.filter(c => c[0] === 'create').length, 1)
})
test('wrong native response ID is not opened and revoked node cannot release a journal result', async t => {
  const f = await fixture(t)
  f.services['remote.session'].create = async request => ({ ok: true, value: { ...request, sessionId: 'other' } })
  await assert.rejects(f.controller.start(presetId), /未确认指定助手身份/)
  assert.equal(f.calls.filter(c => c[0] === 'open').length, 0)
  f.revoke(); await assert.rejects(f.journal.status({ presetId }, signal), { code: 'binding_revoked' })
})
test('different profile/node refuses another durable journal and close drains a pending save', async t => {
  const f = await fixture(t); await f.journal.prepare({ presetId }, signal)
  await assert.rejects(AssistantSessionIntents.open({ ...f.options, nodeId: 'other_node' }), { code: 'assistant-session-store-invalid' })
  const gate = deferred(), entered = deferred(), saved = f.options.store.save.bind(f.options.store)
  f.options.store.save = async value => { entered.resolve(); await gate.promise; await saved(value) }
  const operation = f.journal.prepare({ presetId: 'second' }, signal); await entered.promise
  let closed = false; const closing = f.journal.close().then(() => { closed = true }); await Promise.resolve(); assert.equal(closed, false)
  gate.resolve(); await assert.rejects(operation); await closing
  assert.equal((await f.options.store.load()).intents.length, 2)
})
