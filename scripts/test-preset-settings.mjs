import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invokeHostRemote } from '../lib/dsh-host-contract.js'
const request = extra => ({ namespace: 'settings', method: 'update', args: { ns: 'agent-presets', patch: { default: 'standard' }, ...extra } })
function gateway(namespaces, refuse) {
  const calls = []
  return { calls, async invoke(r) {
    calls.push(r)
    if (r.method === 'describe') return { namespaces }
    if (refuse) throw refuse
    return { ns: r.args.ns, value: r.args.patch }
  } }
}
for (const host of ['web', 'desktop']) test(`${host}: default preset uses the live native form with one checked write`, async () => {
  const g = gateway([{ ns: 'agent-preset-registry', revision: 4 }])
  const signal = new AbortController().signal
  const result = await invokeHostRemote({ get: () => undefined }, g, { ...request(), signal })
  assert.deepEqual(g.calls[1].args, { ns: 'agent-preset-registry', patch: { selectedDefault: 'standard' }, expectedRevision: 4 })
  assert.equal(g.calls[1].signal, signal)
  assert.deepEqual(result.value, { selectedDefault: 'standard' })
  assert.equal(g.calls.length, 2)
})
test('old Web preserves its namespace, field and caller revision', async () => {
  const g = gateway([{ ns: 'agent-presets', revision: 7 }]), r = request({ expectedRevision: 7 })
  await invokeHostRemote({}, g, r)
  assert.equal(g.calls[1], r)
})
test('no trial writes: missing/ambiguous forms and stale cross-form revisions refuse', async () => {
  for (const rows of [[], [{ ns: 'agent-presets' }, { ns: 'agent-preset-registry' }], [{ ns: 'agent-preset-registry' }]]) {
    const g = gateway(rows)
    await assert.rejects(invokeHostRemote({}, g, request()))
    assert.equal(g.calls.length, 1)
  }
  for (const extra of [{ expectedRevision: 0 }, { patch: { default: 'standard', other: true } }]) {
    const g = gateway([{ ns: 'agent-preset-registry', revision: 1 }])
    await assert.rejects(invokeHostRemote({}, g, request(extra)))
    assert.equal(g.calls.length, 1)
  }
})
test('native validation/conflict is returned without replay; cancellation prevents mutation', async () => {
  const error = Object.assign(new Error('changed'), { code: 'settings/conflict' })
  const g = gateway([{ ns: 'agent-preset-registry', revision: 2 }], error)
  await assert.rejects(invokeHostRemote({}, g, request()), e => e === error)
  assert.equal(g.calls.length, 2)
  const cancelled = gateway([])
  await assert.rejects(invokeHostRemote({}, cancelled, { ...request(), signal: AbortSignal.abort() }))
  assert.equal(cancelled.calls.length, 0)
})
test('unrelated settings never change namespaces or payload', async () => {
  const g = gateway([]), r = request({ ns: 'default-model', patch: { model: 'x' } })
  await invokeHostRemote({}, g, r)
  assert.deepEqual(g.calls, [r])
})
