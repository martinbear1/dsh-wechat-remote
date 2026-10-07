import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invokeHostRemote, nativeSessionPresetSelection } from '../lib/dsh-host-contract.js'
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
