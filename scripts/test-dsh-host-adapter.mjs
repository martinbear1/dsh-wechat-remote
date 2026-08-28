import assert from 'node:assert/strict'
import path from 'node:path'

import { DshHostAdapterRuntime } from '../lib/dsh-host-adapter.js'
import { DshTunnelAgent } from '../lib/dsh-tunnel-agent.js'
import { dshDataHome, profileDataRoot } from '../lib/storage-paths.js'

const calls = []
const connection = {
  fetch: { register() {} },
  requestRejection() { throw new Error('browser authentication must not run in the trusted adapter') },
  createSharedFetchHandler(channel) {
    assert.equal(channel, '/api')
    return {
      async fetch(request) {
        const body = await request.json()
        calls.push({ path: new URL(request.url).pathname, body })
        const endpoint = new URL(request.url).pathname.slice('/api/'.length)
        let value = { acknowledged: true }
        if (endpoint === 'session/list') value = { items: [{ sessionId: 's1', running: false, blank: false }] }
        if (endpoint === '$events/result') value = { accepted: true }
        return Response.json({
          type: 'server-response', rpcId: body.rpcId,
          result: { ok: true, value },
        })
      },
    }
  },
}

const streams = {
  'workspace/follow': [{ type: 'baseline', value: { items: [], archivedSessionIds: [] } }],
  'session/follow': [{
    type: 'snapshot', cursor: 4, hasMore: false,
    records: [{ type: 'event', event: { type: 'user/message', seq: 4, time: 1, data: {} } }],
    projections: { values: {} },
  }],
  'session/control': [],
  '$events': [],
}
const gateway = {
  wireStream: {
    async *open(endpoint) { yield* (streams[endpoint] || []) },
  },
  async invoke({ namespace, method }) {
    if (`${namespace}/${method}` === 'session/list') {
      return { items: [{ sessionId: 's1', running: false, blank: false }] }
    }
    return {}
  },
}
const ctx = {
  inject(_services, callback) { return callback({ connection, typertGateway: gateway }) },
}
const adapter = new DshHostAdapterRuntime(ctx)
assert.equal(adapter.mode, 'modern')
assert.deepEqual((await adapter.call('session.list', {}, new AbortController().signal)).value.items[0], {
  sessionId: 's1', running: false, blank: false,
})
assert.equal(calls[0].path, '/api/session/list')
assert.deepEqual(calls[0].body.payload, { args: { _request: {} } })
assert.deepEqual((await adapter.call('workspace.list', {}, new AbortController().signal)).value, {
  items: [], archivedSessionIds: [],
})
assert.equal((await adapter.call('session.history', {
  sessionId: 's1', maxMessages: 8,
}, new AbortController().signal)).value.events.length, 1)
await adapter.call('agentPreset.select', {
  sessionId: 's1', agentPreset: 'standard',
}, new AbortController().signal)
assert.equal(calls.at(-1).path, '/api/agentPresets/select')
assert.deepEqual(calls.at(-1).body.payload, {
  args: { agentId: 's1', agentPreset: 'standard' },
})
await adapter.call('goal.edit', {
  sessionId: 's1', ref: { id: 'goal-1', revision: 2 }, objective: 'ship it',
}, new AbortController().signal)
assert.equal(calls.at(-1).path, '/api/goals/edit')
assert.deepEqual(calls.at(-1).body.payload, {
  args: {
    agentId: 's1', ref: { id: 'goal-1', revision: 2 },
    request: { objective: 'ship it' },
  },
})
adapter.dispose()

function tunnelFrame(type, streamId, payload = new Uint8Array(), flags = 0) {
  const out = new Uint8Array(8 + payload.length)
  out[0] = 1
  out[1] = type
  new DataView(out.buffer).setUint32(2, streamId)
  out[6] = flags
  out.set(payload, 8)
  return out
}
const encoded = value => new TextEncoder().encode(JSON.stringify(value))
const sent = []
let trustedFetches = 0
const tunnel = new DshTunnelAgent({
  send: frame => { sent.push(new Uint8Array(frame)) },
  fetchDsh: async request => {
    trustedFetches += 1
    assert.equal(request.path, '/api/session.list')
    return Response.json({ result: { ok: true, value: { items: [] } } })
  },
  openDshEvents: async function *(_path, signal) {
    signal.throwIfAborted()
    yield encoded({ rpcId: 'push-1', payload: { type: 'host/session-status', sessionId: 's1', running: true } })
  },
})
tunnel.receive(tunnelFrame(1, 1, encoded({ kind: 'http', path: '/api/session.list', method: 'POST' })))
tunnel.receive(tunnelFrame(3, 1, encoded({ type: 'client-request' }), 2))
tunnel.receive(tunnelFrame(4, 1))
await new Promise(resolve => setTimeout(resolve, 20))
assert.equal(trustedFetches, 1)
assert.ok(sent.some(frame => frame[1] === 2), 'adapter HTTP must accept')
assert.ok(sent.some(frame => frame[1] === 4), 'adapter HTTP must end')
sent.length = 0
tunnel.receive(tunnelFrame(1, 3, encoded({ kind: 'websocket', path: '/api/events.host', headers: {} })))
await new Promise(resolve => setTimeout(resolve, 20))
assert.ok(sent.some(frame => frame[1] === 3), 'adapter realtime must emit data')
tunnel.close()

assert.equal(dshDataHome({ DSH_HOME: path.join('tmp', 'isolated') }), path.resolve('tmp', 'isolated'))
const previous = process.env.DSH_HOME
process.env.DSH_HOME = path.join(process.cwd(), '.tmp-dsh-home')
assert.ok(profileDataRoot('research').startsWith(path.resolve(process.env.DSH_HOME)))
if (previous === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = previous

console.log('dsh host adapter tests passed')
