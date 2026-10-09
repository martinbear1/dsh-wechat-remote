import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invokeHostRemote, nativeSessionPresetSelection, assertColdSessionPresetAvailable } from '../lib/dsh-host-contract.js'
import { z } from 'zod'

const request = () => ({ namespace: 'agentPresets', method: 'list', args: {}, signal: new AbortController().signal })
function host(defaultId, presets) {
  const registry = { defaultId }, calls = []
  const ctx = { get: name => name === 'agentPresets' ? registry : undefined }
  const gateway = { async invoke(r) { calls.push(r); return { presets } } }
  return { registry, calls, ctx, gateway }
}
test('catalog preserves native default identity without selecting or writing a setting', async () => {
  const h = host('standard', [{ id: 'standard', isDefault: true }, { id: 'harness-teacher', isDefault: false }])
  const result = await invokeHostRemote(h.ctx, h.gateway, request())
  assert.deepEqual(result.defaultPreset, { id: 'standard', state: 'available' })
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].method, 'list')
  assert.equal(h.registry.defaultId, 'standard')
})
test('retired or disabled default is exposed, never silently reset to another available preset', async () => {
  for (const id of ['hr-assistant-retired-v1', 'harness-teacher']) {
    const h = host(id, [{ id: 'standard', isDefault: false }])
    const result = await invokeHostRemote(h.ctx, h.gateway, request())
    assert.deepEqual(result.defaultPreset, { id, state: 'unavailable' })
    assert.equal(h.registry.defaultId, id)
    assert.equal(h.calls.length, 1)
  }
})
test('broken and unconfigured defaults are distinct from a working default', async () => {
  for (const [id, presets, state] of [['standard', [{ id: 'standard', isDefault: true, broken: 'disabled dependency' }], 'unavailable'], ['', [], 'unspecified']]) {
    const h = host(id, presets)
    assert.equal((await invokeHostRemote(h.ctx, h.gateway, request())).defaultPreset.state, state)
  }
})
test('old host list is unchanged; cancellation and changing defaults do not return stale metadata', async () => {
  const value = { presets: [{ id: 'minimal', isDefault: true }] }
  assert.equal(await invokeHostRemote({}, { invoke: async () => value }, request()), value)
  const h = host('standard', [])
  await assert.rejects(invokeHostRemote(h.ctx, h.gateway, { ...request(), signal: AbortSignal.abort() }))
  assert.equal(h.calls.length, 0)
  h.gateway.invoke = async () => { h.registry.defaultId = 'minimal'; return value }
  await assert.rejects(invokeHostRemote(h.ctx, h.gateway, request()), error => error.code === 'adapter/preset-catalog-changed')
})
test('explicit selection requires both native request and receipt codecs, not a guessed version or trial create', () => {
  const modern = z.object({ sessionId: z.string().optional(), agentPreset: z.string().optional() }).strict()
  const stripped = z.object({ sessionId: z.string() }), refused = stripped.strict()
  const descriptor = (input, output) => ({ parameters: [{ wire: 'request', codec: { create: () => input } }], result: { create: () => output } })
  for (const [input, output, expected] of [[modern, modern, true], [stripped, modern, false], [modern, stripped, false], [refused, modern, false]]) {
    const ctx = { get: name => name === 'typert' ? { local: { get: endpoint => { assert.equal(endpoint, 'session/create'); return descriptor(input, output) } } } : undefined }
    assert.equal(nativeSessionPresetSelection(ctx), expected)
  }
  assert.equal(nativeSessionPresetSelection({ get: () => undefined }), false)
  assert.equal(nativeSessionPresetSelection({ get: () => { throw Error('withdrawn') } }), false)
})

function coldMode(selected = 'harness-teacher') {
  const f = { live: false, reads: 0, disposed: 0, resolutions: [], invocations: [], selected }
  f.presets = { async resolve(id) { f.resolutions.push(id); return {} } }
  f.ctx = { get: key => ({
    agents: { get: () => f.live ? {} : undefined }, agentPresets: f.presets,
    sessionQuery: { async observeSession(id, options) {
      assert.equal(id, 'cold'); assert.equal(options.projectionMode, 'all'); f.reads++
      return { header: { agentPreset: 'stale-creation-mode' }, projections: { values: { agentPreset: f.selected } },
        [Symbol.dispose]() { f.disposed++ } }
    } },
  })[key] }
  f.gateway = { async invoke(request) { f.invocations.push(request); return { accepted: true } } }
  f.request = { namespace: 'session', method: 'prompt', args: { request: { sessionId: 'cold', content: [] } } }
  return f
}

test('cold prompt checks the current native projection, not the creation header; null uses native default', async () => {
  for (const selected of ['harness-teacher', null]) {
    const f = coldMode(selected)
    assert.deepEqual(await invokeHostRemote(f.ctx, f.gateway, f.request), { accepted: true })
    assert.deepEqual(f.resolutions, [selected ?? undefined])
    assert.equal(f.reads, 1); assert.equal(f.disposed, 1); assert.equal(f.invocations.length, 1)
  }
})

test('missing, disabled and broken cold modes reject before a native prompt; unknown failures stay unknown', async () => {
  for (const code of ['agent-preset/not-found', 'agent-preset/invalid', 'broken', 'storage/failure']) {
    const f = coldMode()
    const nativeFailure = Object.assign(new Error('private native diagnostic'), { code })
    f.presets.resolve = async () => { if (code === 'broken') return { broken: 'private loader path' }; throw nativeFailure }
    await assert.rejects(invokeHostRemote(f.ctx, f.gateway, f.request), error => {
      if (code === 'storage/failure') return error === nativeFailure
      assert.equal(error.code, 'adapter/session-preset-unavailable')
      assert.match(error.message, /未发送/); assert.doesNotMatch(error.message, /private/)
      assert.deepEqual(error.details, { sessionId: 'cold', agentPreset: 'harness-teacher' })
      return true
    })
    assert.equal(f.invocations.length, 0); assert.equal(f.disposed, 1)
  }
})

test('retained live revisions remain native; activation during lookup is not falsely blocked', async () => {
  const live = coldMode(); live.live = true
  live.presets.resolve = async () => assert.fail('live revision must not resolve a retired declaration')
  await invokeHostRemote(live.ctx, live.gateway, live.request)
  assert.equal(live.reads, 0); assert.equal(live.invocations.length, 1)
  const racing = coldMode()
  racing.presets.resolve = async () => { racing.live = true; throw Object.assign(new Error('retired'), { code: 'agent-preset/not-found' }) }
  await invokeHostRemote(racing.ctx, racing.gateway, racing.request)
  assert.equal(racing.disposed, 1); assert.equal(racing.invocations.length, 1)
})

test('preflight does not intercept commands, permission changes, model selection, reads or old hosts', async () => {
  const f = coldMode()
  for (const [namespace, method] of [['commands', 'execute'], ['session', 'selectModel'], ['session', 'page']]) {
    await invokeHostRemote(f.ctx, f.gateway, { ...f.request, namespace, method })
  }
  assert.equal(f.reads, 0); assert.equal(f.invocations.length, 3)
  await invokeHostRemote({ get: () => undefined }, f.gateway, f.request)
  assert.equal(f.invocations.length, 4)
  f.selected = undefined
  await assertColdSessionPresetAvailable(f.ctx, 'cold')
  assert.deepEqual(f.resolutions, [], 'no projection must not fall back to a stale header')
})

test('aborted preflight is read-only and releases an acquired observation without sending', async () => {
  const f = coldMode(), lifetime = new AbortController()
  await assert.rejects(assertColdSessionPresetAvailable(f.ctx, 'cold', AbortSignal.abort()))
  assert.equal(f.reads, 0)
  f.presets.resolve = async () => { lifetime.abort(); return {} }
  await assert.rejects(invokeHostRemote(f.ctx, f.gateway, { ...f.request, signal: lifetime.signal }), error => error.name === 'AbortError')
  assert.equal(f.disposed, 1); assert.equal(f.invocations.length, 0)
})
