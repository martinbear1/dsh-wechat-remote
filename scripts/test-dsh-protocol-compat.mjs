import assert from 'node:assert/strict'

import {
  invokeLegacyRpc,
  parseLegacyClientRequest,
  planLegacyRpc,
  unpackChunkRow,
} from '../lib/dsh-protocol-compat.js'

const request = (method, payload = {}, rpcId = 'rpc-1') => ({
  type: 'client-request', rpcId, method, payload,
})

const list = planLegacyRpc(request('session.list', { cursor: 'next' }))
assert.deepEqual(list, {
  kind: 'invoke',
  namespace: 'session',
  method: 'list',
  args: { _request: { cursor: 'next' } },
})

const prompt = planLegacyRpc(request('session.prompt', {
  sessionId: 's1', mode: 'queue', content: [],
}, 'prompt-id'))
assert.equal(prompt.kind, 'invoke')
assert.equal(prompt.args.request.requestId, 'prompt-id')

const direct = planLegacyRpc(request('wechatHost/describe', {
  args: { request: {} },
}))
assert.deepEqual(direct, {
  kind: 'invoke', namespace: 'wechatHost', method: 'describe', args: { request: {} },
})

assert.throws(
  () => parseLegacyClientRequest('session.list', request('session.create')),
  /invalid DSH client-request envelope/,
)
assert.equal(
  parseLegacyClientRequest('session.list', request('session.list')).method,
  'session.list',
)

assert.deepEqual(unpackChunkRow({
  type: 'chunkrow/text-chunks',
  seq: 4,
  time: 100,
  data: { turn: 1, step: 2, index: 0, texts: ['a', 'b', 'c'], dt: [5, -2] },
}).map(entry => [entry.type, entry.seq, entry.time, entry.data.chunk.text]), [
  ['assistant/chunk', 4, 100, 'a'],
  ['assistant/chunk', 5, 105, 'b'],
  ['assistant/chunk', 6, 103, 'c'],
])

const calls = []
const gateway = {
  async invoke(value) {
    calls.push(['invoke', value])
    if (value.namespace === 'session' && value.method === 'page') {
      return {
        records: [{ type: 'event', event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } }],
        hasMore: false,
      }
    }
    if (value.namespace === 'broken') {
      const error = new Error('service unavailable')
      error.code = 'gateway/service-unavailable'
      error.details = { namespace: 'broken' }
      throw error
    }
    return { endpoint: `${value.namespace}/${value.method}`, args: value.args }
  },
  async stream(value) {
    calls.push(['stream', value])
    if (value.namespace === 'workspace') {
      return (async function* () {
        yield { type: 'baseline', value: { items: [{ workspaceId: 'w1' }], archivedSessionIds: [] } }
      })()
    }
    return (async function* () {
      yield {
        type: 'snapshot',
        cursor: 9,
        records: [{
          type: 'chunks',
          event: {
            type: 'chunkrow/reasoning-chunks', seq: 5, time: 20,
            data: { turn: 2, step: 1, index: 0, texts: ['x', 'y'], dt: [3] },
          },
        }],
        hasMore: true,
        projections: { values: {} },
      }
    })()
  },
}

const signal = new AbortController().signal
const host = await invokeLegacyRpc(gateway, request('host.describe'), {
  signal, describeHost: () => ({ cwd: '/work' }),
})
assert.deepEqual(host.result, { ok: true, value: { cwd: '/work' } })

const workspaces = await invokeLegacyRpc(gateway, request('workspace.list'), {
  signal, describeHost: () => ({}),
})
assert.deepEqual(workspaces.result.value, {
  items: [{ workspaceId: 'w1' }], archivedSessionIds: [],
})

const history = await invokeLegacyRpc(gateway, request('session.history', {
  sessionId: 's1', maxMessages: 8,
}), { signal, describeHost: () => ({}) })
assert.equal(history.result.ok, true)
assert.equal(history.result.value.events.length, 2)
assert.equal(history.result.value.historyEndSeq, 9)

const older = await invokeLegacyRpc(gateway, request('session.history', {
  sessionId: 's1', maxMessages: 8, beforeSeq: 5,
}), { signal, describeHost: () => ({}) })
assert.equal(older.result.value.events[0].event.type, 'turn/start')
assert(calls.some(([, call]) => call.namespace === 'session' && call.method === 'page'
  && call.args.request.throughSeq === 9))

const failure = await invokeLegacyRpc(gateway, request('broken/read', { args: {} }), {
  signal, describeHost: () => ({}),
})
assert.deepEqual(failure.result, {
  ok: false,
  error: {
    code: 'gateway/service-unavailable',
    message: 'service unavailable',
    details: { namespace: 'broken' },
  },
})

// A successful selection must survive the immediately following model refresh.
const modelState = new Map()
const defaultModel = { provider: 'provider-a', model: 'default' }
const modelGateway = {
  async invoke({ namespace, method, args }) {
    assert.equal(namespace, 'session')
    if (method === 'modelCatalog') return { groups: [], default: defaultModel }
    assert.equal(method, 'selectModel')
    const { sessionId, ...selection } = args.request
    modelState.set(sessionId, selection)
    return { current: selection }
  },
  async stream({ args }) {
    const selection = modelState.get(args.request.address.sessionId)
    return (async function* () {
      yield { type: 'snapshot', cursor: 0, records: [], projections: {
        values: { modelSelection: { next: selection ?? null, lastUsed: null } },
      } }
    })()
  },
}
const options = { signal, describeHost: () => ({}) }
assert.deepEqual(planLegacyRpc(request('agentPreset.select', { sessionId: 's1', agentPreset: 'standard' })).args,
  { agentId: 's1', agentPreset: 'standard' }, 'Remote Agent bindings use the generated wire name agentId')
const selected = { provider: 'provider-b', model: 'chosen', reasoningEffort: 'high' }
await invokeLegacyRpc(modelGateway, request('session.selectModel', { sessionId: 's1', ...selected }), options)
const refreshed = await invokeLegacyRpc(modelGateway, request('session.models', { sessionId: 's1' }), options)
assert.deepEqual(refreshed.result.value.current, selected)
const otherSession = await invokeLegacyRpc(modelGateway, request('session.models', { sessionId: 's2' }), options)
assert.deepEqual(otherSession.result.value.current, defaultModel)

for (const method of ['goal.create', 'goal.edit']) {
  const mutation = { sessionId: 's1', objective: 'Keep the user objective', maxGoalRounds: 4, ref: { id: 'g1', revision: 2 } }
  const result = await invokeLegacyRpc({ ...gateway, async invoke(call) {
    assert.equal(call.namespace, 'goals')
    assert.equal(call.args.agentId, 's1')
    assert.deepEqual(call.args.request, { objective: mutation.objective, maxGoalRounds: 4 })
    if (method === 'goal.edit') assert.deepEqual(call.args.ref, mutation.ref)
    return { updated: true }
  } }, request(method, mutation), options)
  assert.equal(result.result.ok, true)
}

for (const method of ['goal.edit', 'goal.pause', 'goal.resume', 'goal.complete']) {
  const reply = await invokeLegacyRpc({ ...gateway, async invoke() { return { id: 'g1', revision: 3, objective: 'retained on projection' } } },
    request(method, { sessionId: 's1', ref: { id: 'g1', revision: 2 } }), options)
  assert.deepEqual(reply.result.value, { ref: { id: 'g1', revision: 3 } })
}
const cleared = await invokeLegacyRpc({ ...gateway, async invoke() { return { id: 'g1', revision: 4 } } },
  request('goal.clear', { sessionId: 's1', ref: { id: 'g1', revision: 3 } }), options)
assert.deepEqual(cleared.result.value, { cleared: true })
const presetReply = await invokeLegacyRpc({ ...gateway, async invoke() { return 'standard' } },
  request('agentPreset.select', { sessionId: 's1', agentPreset: 'standard' }), options)
assert.deepEqual(presetReply.result.value, { agentPreset: 'standard' })

const mkdirRace = Object.assign(new Error("session persistence listing failed: ENOENT: no such file or directory, scandir 'E:\\isolated\\sessions\\.dsh-mkdir-123456'"), {
  code: 'SESSION_QUERY_PERSISTENCE_FAILED',
})
let attempts = 0
const racingGateway = { ...gateway, async invoke() {
  if (++attempts < 3) throw mkdirRace
  return { items: [] }
} }
const recovered = await invokeLegacyRpc(racingGateway, request('session.list'), options)
assert.equal(recovered.result.ok, true)
assert.equal(attempts, 3)
attempts = 0
await invokeLegacyRpc(racingGateway, request('session.create'), options)
assert.equal(attempts, 1, 'mutations must never be retried')
attempts = 0
const failedListing = await invokeLegacyRpc({ ...gateway, async invoke() { attempts++; throw mkdirRace } }, request('session.list'), options)
assert.equal(attempts, 3, 'persistent errors stop after bounded retries')
assert.equal(failedListing.result.error.code, mkdirRace.code)
attempts = 0
await invokeLegacyRpc({ ...gateway, async invoke() {
  attempts++
  throw Object.assign(new Error('EACCES: scandir session storage'), { code: mkdirRace.code })
} }, request('session.list'), options)
assert.equal(attempts, 1, 'unrelated persistence errors must not be hidden')

// Released mini clients must keep working without a permission-specific release.
const permissionRequest = (text, extra = {}) => request('session.prompt', {
  sessionId: 's1', mode: 'queue', content: [{ type: 'text', text }], ...extra,
})
for (const text of ['explain /permission read-only', '/permissions', '`/permission read-only`']) {
  assert.equal(planLegacyRpc(permissionRequest(text)).kind, 'invoke', 'ordinary text is not a permission command')
}
for (const mutation of [
  permissionRequest('/permission read-only\nthen do something'),
  permissionRequest('/permission read-only', { sessionId: '' }),
  permissionRequest('/permission read-only', { content: [{ type: 'text', text: '/permission read-only' }, { type: 'image', data: 'unused' }] }),
]) {
  const rejected = await invokeLegacyRpc({ async invoke() { assert.fail('invalid command executed') } }, mutation, options)
  assert.equal(rejected.result.error.code, 'adapter/invalid-permission-command')
}
let permissionCalls = 0
let permissionCurrent = 'workspace-write'
const permissionGateway = {
  async invoke({ namespace, method, args }) {
    permissionCalls++
    assert.equal(namespace, 'commands')
    assert.equal(method, 'execute')
    assert.equal(args.agentId, 's1')
    assert.deepEqual(args.images, [])
    const next = args.line.split(' ')[1]
    if (next) permissionCurrent = next
    return { commandId: 'command-1', result: { kind: 'success', text: 'preset ' + permissionCurrent } }
  },
  async stream({ namespace, method, args }) {
    assert.equal(namespace, 'session')
    assert.equal(method, 'follow')
    assert.equal(args.request.address.sessionId, 's1')
    return (async function* () {
      yield { type: 'snapshot', cursor: 1, records: [], projections: { values: { permissions: { currentValue: permissionCurrent } } } }
    })()
  },
}
// All preset labels are covered by fake gateways only, not real user sessions.
for (const preset of ['read-only', 'danger-full-access', 'workspace-write']) {
  const changed = await invokeLegacyRpc(permissionGateway, permissionRequest('/permission ' + preset), options)
  assert.deepEqual(changed.result, { ok: true, value: { accepted: true, command: true, permission: preset, commandId: 'command-1' } })
}
assert.equal(permissionCalls, 3, 'mutating commands are not retried')
assert.equal((await invokeLegacyRpc(permissionGateway, permissionRequest('/permission'), options)).result.value.permission, 'workspace-write')
for (const response of [undefined, {}, { result: { kind: 'error', text: 'unknown preset' } }]) {
  const failed = await invokeLegacyRpc({ ...permissionGateway, async invoke() { return response } }, permissionRequest('/permission read-only'), options)
  assert.equal(failed.result.error.code, 'adapter/command-failed')
}
const notApplied = await invokeLegacyRpc({ ...permissionGateway, async invoke() {
  return { commandId: 'lying-ack', result: { kind: 'success' } }
} }, permissionRequest('/permission read-only'), options)
assert.equal(notApplied.result.error.code, 'adapter/permission-not-applied')
const cancelled = await invokeLegacyRpc(permissionGateway, permissionRequest('/permission read-only'), {
  ...options, signal: AbortSignal.abort(new Error('cancelled')),
})
assert.equal(cancelled.result.ok, false)
assert.equal(permissionCalls, 4, 'aborted commands do not mutate permissions')
let flushed = false
const durable = await invokeLegacyRpc({ ...permissionGateway, async stream(call) {
  assert.equal(flushed, true, 'readback follows the durability barrier')
  return permissionGateway.stream(call)
} }, permissionRequest('/permission read-only'), { ...options, async flushPermission(id) {
  assert.equal(id, 's1'); flushed = true
} })
assert.equal(durable.result.ok, true)
const diskFailure = await invokeLegacyRpc(permissionGateway, permissionRequest('/permission workspace-write'), {
  ...options, async flushPermission() { throw Object.assign(new Error('storage unavailable'), { code: 'storage/failed' }) },
})
assert.equal(diskFailure.result.error.code, 'storage/failed', 'failed persistence never produces a success receipt')

console.log('DSH protocol compatibility tests passed')
