import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { transform } from 'esbuild'
import { AssistantSessionIntents } from '../lib/assistant-presets/session-intents.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { resourceIdValid, resourcePresetId } from '../lib/private-resources/contract.js'
const source = await readFile(new URL('../src/client/assistant-navigation.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' })
const { nativeAssistantNavigation } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const presetId = 'harness-teacher', signal = new AbortController().signal
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done }), resolve } }
function fixture() {
  const calls = [], snapshot = { options: [{ id: presetId }], busy: false, error: null }
  const seat = { load: async () => calls.push('load'), select: async id => { calls.push(['select', id]) }, hooks: { agentPresetSeat: { getSnapshot: () => snapshot } } }
  const entry = { options: { locale: 'settings.agentPreset' }, inject: id => { assert.equal(id, undefined, 'must use unbound, never old-session seat'); return seat } }
  const services = { uiWorkspace: { clearMain: () => calls.push('clear') }, slots: { entries: key => { assert.equal(key, 'conversation.hero.agentPreset'); return [entry] } },
    configForms: { developerTools: { enabled: { getSnapshot: () => true } } } }
  return { calls, snapshot, seat, entry, services, controller: nativeAssistantNavigation(name => services[name]) }
}
test('shortcut stages in native sessionless composer, with no creation/default/prompt RPC', async () => {
  const f = fixture(); await f.controller.start(presetId)
  assert.deepEqual(f.calls, ['load', 'clear', ['select', presetId]])
  assert(!/remote\.create|assistantSessionPrepare|pickDirectory|workspaces\.create/.test(source))
})

test('resource shortcuts accept the exact bounded generated identity, including maximum resource ID length', async () => {
  for (const length of [1, 39, 40, 64]) {
    const resourceId = 'a'.repeat(length)
    assert(resourceIdValid(resourceId))
    const id = resourcePresetId({ resourceId, version: '1.0.0' }), f = fixture()
    f.snapshot.options.push({ id })
    await f.controller.start(id)
    assert.deepEqual(f.calls, ['load', 'clear', ['select', id]])
  }
})

test('long resource identity never bypasses exact native availability or allows arbitrary longer identities', async () => {
  const id = resourcePresetId({ resourceId: 'a'.repeat(64), version: '1.0.0' })
  const unavailable = fixture()
  await assert.rejects(unavailable.controller.start(id), /尚未就绪/)
  assert.deepEqual(unavailable.calls, ['load'])
  for (const invalid of ['a'.repeat(65), `hr-resource-${'a'.repeat(65)}-0123456789ab`,
    `hr-resource-${'a'.repeat(64)}-0123456789ag`, `hr-resource-${'a'.repeat(64)}-0123456789abc`,
    `hr-resource-${'a'.repeat(63)}_-0123456789ab`, `${id}/`, `${id}\n`]) {
    const f = fixture(); f.snapshot.options.push({ id: invalid })
    await assert.rejects(f.controller.start(invalid), /身份无效/)
    assert.deepEqual(f.calls, [], 'invalid identities fail before reading or changing native state')
  }
})
test('unknown/ambiguous native slot and disabled selection fail before any navigation', async () => {
  for (const broken of ['absent', 'duplicate', 'changed', 'disabled', 'noClear', 'noSelect']) {
    const f = fixture()
    if (broken === 'absent') f.services.slots.entries = () => []
    if (broken === 'duplicate') f.services.slots.entries = () => [f.entry, f.entry]
    if (broken === 'changed') f.entry.options.locale = 'custom'
    if (broken === 'disabled') f.services.configForms.developerTools.enabled.getSnapshot = () => false
    if (broken === 'noClear') delete f.services.uiWorkspace.clearMain
    if (broken === 'noSelect') delete f.seat.select
    await assert.rejects(f.controller.start(presetId), /入口/); assert.deepEqual(f.calls, [])
  }
})
test('disabled/removed preset, in-flight host selection and roster errors do not navigate', async () => {
  for (const patch of [{ options: [] }, { busy: true }, { error: 'lost' }]) {
    const f = fixture(); Object.assign(f.snapshot, patch)
    await assert.rejects(f.controller.start(presetId), /尚未就绪/); assert.deepEqual(f.calls, ['load'])
  }
})
test('abort, connection reset and disable during load fence late native work', async () => {
  for (const action of ['abort', 'reset', 'disable']) {
    const f = fixture(), gate = deferred(), lifetime = new AbortController()
    f.seat.load = () => gate.promise
    const pending = f.controller.start(presetId, lifetime.signal)
    if (action === 'abort') lifetime.abort()
    else if (action === 'reset') f.controller.reset()
    else f.services.configForms.developerTools.enabled.getSnapshot = () => false
    gate.resolve()
    if (action === 'disable') await assert.rejects(pending, /已关闭/); else await pending
    assert.deepEqual(f.calls, [])
  }
})
test('concurrent clicks fold; invalid identity and cancelled click do nothing', async () => {
  const f = fixture(), gate = deferred(); f.seat.load = () => gate.promise
  const first = f.controller.start(presetId); await f.controller.start(presetId); gate.resolve(); await first
  assert.deepEqual(f.calls, ['clear', ['select', presetId]])
  await assert.rejects(f.controller.start('../invalid'), /身份无效/)
  const aborted = new AbortController(); aborted.abort(); await f.controller.start(presetId, aborted.signal)
  assert.equal(f.calls.length, 2)
})

// Retained compatibility endpoint tests: old clients may still have a durable
// creation intent. Removing the desktop UI flow must not discard those records.
async function journalFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'assistant-intent-')), native = new Map(), workspace = { path: 'C:/work', sessionIds: [] }
  let valid = true
  const options = { nodeId: 'node_assistant_test', store: new WorkflowFileStore(path.join(directory, 'intents.json')),
    assertIdentity() { if (!valid) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) }, installed: () => true, supported: () => true,
    workspace: id => id === 'workspace_a' ? workspace : undefined,
    inspect: async id => { if (!native.has(id)) throw new Error('native not found'); return structuredClone(native.get(id)) } }
  const journal = await AssistantSessionIntents.open(options)
  t.after(async () => { await journal.close(); assert.equal(path.dirname(directory), os.tmpdir()); await rm(directory, { recursive: true, force: true }) })
  return { journal, options, workspace, native, revoke() { valid = false } }
}
test('legacy intent read is nonmutating and concurrent prepares release one dispatch', async t => {
  const f = await journalFixture(t)
  assert.equal((await f.journal.status({ presetId }, signal)).state, 'none'); assert.equal(await f.options.store.load(), undefined)
  const results = await Promise.all([f.journal.prepare({ presetId }, signal), f.journal.prepare({ presetId }, signal)])
  assert.equal(results.filter(r => r.dispatch).length, 1); assert.equal(results[0].attemptId, results[1].attemptId)
  assert.equal((await f.journal.status({ presetId }, signal)).state, 'unknown')
})
test('legacy intent identity/workspace and revoked ownership still fail closed', async t => {
  const f = await journalFixture(t), intent = await f.journal.prepare({ presetId, workspaceId: 'workspace_a' }, signal)
  f.native.set(intent.sessionId, { meta: { id: intent.sessionId, agentPreset: presetId, createdAt: 100, cwd: f.workspace.path }, events: [] }); f.workspace.sessionIds.push(intent.sessionId)
  assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'created')
  for (const change of [h => { h.meta.createdAt++ }, h => { h.meta.agentPreset = 'other' }, h => { h.meta.cwd = 'C:/other' }]) {
    const original = f.native.get(intent.sessionId), changed = structuredClone(original); change(changed); f.native.set(intent.sessionId, changed)
    assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'conflict'); f.native.set(intent.sessionId, original)
  }
  f.workspace.sessionIds.length = 0; assert.equal((await f.journal.status({ attemptId: intent.attemptId }, signal)).state, 'conflict')
  f.revoke(); await assert.rejects(f.journal.status({ presetId }, signal), { code: 'binding_revoked' })
  await assert.rejects(AssistantSessionIntents.open({ ...f.options, nodeId: 'other_node' }), { code: 'assistant-session-store-invalid' })
})
