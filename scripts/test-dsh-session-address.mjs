import assert from 'node:assert/strict'
import { resolveDshSessionAddress } from '../lib/dsh-session-address.js'
import { invokeLegacyRpc } from '../lib/dsh-protocol-compat.js'

const rows = [
  { sessionId: 'root' },
  { sessionId: 'fork', parentSessionId: 'root' },
  { sessionId: 'child', origin: 'subagent', parentSessionId: 'root' },
  { sessionId: 'nested', origin: 'subagent', parentSessionId: 'child' },
  { sessionId: 'orphan', origin: 'subagent' },
  { sessionId: 'self', origin: 'subagent', parentSessionId: 'self' },
]
const catalogs = {
  root: { parentAvailable: false, entries: [{ id: 'child', kind: 'child', mode: 'one-shot' }] },
  child: { parentAvailable: false, entries: [{ id: 'nested', kind: 'child', mode: 'continuable' }] },
}
const signal = new AbortController().signal
const calls = []
let closed = 0
let nativeRejection
const gateway = {
  async invoke(call) {
    calls.push(call)
    if (call.namespace === 'subagents' && call.method === 'list') return catalogs[call.args.parentSessionId]
    if (call.method === 'list') return { items: rows }
    if (call.method === 'modelCatalog') return { groups: [], default: { provider: 'p', model: 'm' } }
    if (call.method === 'page') {
      if (nativeRejection) throw nativeRejection
      assert.deepEqual(call.args.request.address, { kind: 'subagent', parentSessionId: 'root', childSessionId: 'child', mode: 'one-shot' })
      assert.equal(call.args.request.throughSeq, 4)
      return { hasMore: false, records: [{ type: 'event', event: { seq: 2, type: 'turn/start', data: {} } }] }
    }
    assert.fail('unexpected native method ' + call.method)
  },
  async stream(call) {
    calls.push(call)
    return (async function* () {
      try {
        if (nativeRejection) throw nativeRejection
        yield { type: 'snapshot', cursor: 10, hasMore: true, records: [], projections: { values: {} } }
      } finally { closed++ }
    })()
  },
}
for (const id of ['root', 'fork']) {
  assert.deepEqual(await resolveDshSessionAddress(gateway, id, signal), { kind: 'session', sessionId: id })
}
assert.equal(calls.filter(c => c.namespace === 'subagents').length, 0, 'ordinary/fork sessions never query a child catalog')
assert.deepEqual(await resolveDshSessionAddress(gateway, 'child', signal), {
  kind: 'subagent', parentSessionId: 'root', childSessionId: 'child', mode: 'one-shot',
})
assert.deepEqual(await resolveDshSessionAddress(gateway, 'nested', signal), {
  kind: 'subagent', parentSessionId: 'child', childSessionId: 'nested', mode: 'continuable',
}, 'use the immediate durable parent, not the tree root; no live parent is needed to read')
for (const id of ['', 'absent', 'orphan', 'self']) {
  await assert.rejects(resolveDshSessionAddress(gateway, id, signal), { code: 'adapter/session-address-unavailable' })
}
const request = (method, payload) => ({ type: 'client-request', rpcId: 'read', method, payload })
const options = { signal, describeHost: () => ({}) }
for (const payload of [{ sessionId: 'child' }, { sessionId: 'child', beforeSeq: 5 }]) {
  const reply = await invokeLegacyRpc(gateway, request('session.history', {
    ...payload, parentSessionId: 'forged', mode: 'continuable', address: { kind: 'session', sessionId: 'root' },
  }), options)
  assert.equal(reply.result.ok, true)
  const nativeMethod = payload.beforeSeq === undefined ? 'follow' : 'page'
  assert.deepEqual(calls.filter(c => c.method === nativeMethod).at(-1).args.request.address, {
    kind: 'subagent', parentSessionId: 'root', childSessionId: 'child', mode: 'one-shot',
  }, 'client-supplied parent, mode and address are never trusted')
}
const models = await invokeLegacyRpc(gateway, request('session.models', { sessionId: 'nested' }), options)
assert.equal(models.result.ok, true)
assert.equal(calls.filter(c => c.method === 'follow').at(-1).args.request.address.childSessionId, 'nested')
assert.equal(closed, 2, 'snapshot readers release upstream subscriptions; older pages need no subscription')

// Native validation is final even if a catalog changed between list and follow/page.
nativeRejection = Object.assign(new Error('subagent does not belong to the supplied parent'), { code: 'subagent/unauthorized' })
for (const payload of [{ sessionId: 'child' }, { sessionId: 'child', beforeSeq: 5 }]) {
  const rejected = await invokeLegacyRpc(gateway, request('session.history', payload), options)
  assert.equal(rejected.result.error.code, nativeRejection.code)
}
nativeRejection = undefined

for (const entry of [undefined, { id: 'child', kind: 'diagnostic', reason: 'corrupt' },
  { id: 'child', kind: 'child', mode: 'future-mode' }]) {
  catalogs.root.entries = entry ? [entry] : []
  await assert.rejects(resolveDshSessionAddress(gateway, 'child', signal), { code: 'adapter/session-address-unavailable' })
}
// No stale cache survives a native catalog change or host restart.
catalogs.root.entries = [{ id: 'child', kind: 'child', mode: 'continuable' }]
assert.equal((await resolveDshSessionAddress(gateway, 'child', signal)).mode, 'continuable')
await assert.rejects(resolveDshSessionAddress({ async invoke() { return { items: 'invalid' } } }, 'root', signal), /会话目录/)
await assert.rejects(resolveDshSessionAddress({ async invoke() { throw Object.assign(new Error('no catalog service'), { code: 'gateway/service-unavailable' }) } }, 'child', signal), { code: 'gateway/service-unavailable' })
await assert.rejects(resolveDshSessionAddress({ async invoke() { assert.fail('aborted read reached native service') } }, 'child', AbortSignal.abort(new Error('cancelled'))), /cancelled/)
const controller = new AbortController()
await assert.rejects(resolveDshSessionAddress({ async invoke(call) {
  const result = await gateway.invoke(call); controller.abort(new Error('cancelled between reads')); return result
} }, 'child', controller.signal), /cancelled between reads/)
console.log('DSH native Session address tests passed: roots, forks, children, nested, pagination, models, diagnostics, cancellation, authority')
