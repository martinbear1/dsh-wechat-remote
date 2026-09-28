import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { legacyPermissionValue, withPresentationProjections } from '../lib/session-presentation.js'
import { invokeLegacyRpc, resolveTypertGateway } from '../lib/dsh-protocol-compat.js'
import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'

// Captured field shapes from child DSH 0.1.5-rc.2 / 0.1.7-rc.2, no credentials.
const choices = ['read-only', 'workspace-write', 'danger-full-access'].map(value => ({ value, name: value }))
const catalog = { options: choices, defaultPreset: 'workspace-write' }
const selection = { currentValue: 'workspace-write' }
const options = { signal: new AbortController().signal, describeHost: () => ({}) }
const request = (method, payload) => ({ type: 'client-request', rpcId: 'controls', method, payload })
const tick = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)) }

test('modern catalog joins only the legacy value, without changing current permission or native history', () => {
  const block = { asOfSeq: 22, values: { permissions: selection } }
  const result = withPresentationProjections(block, catalog)
  assert.deepEqual(result.values.permissions, { currentValue: 'workspace-write', options: choices })
  assert.deepEqual(block, { asOfSeq: 22, values: { permissions: selection } })
  assert.equal(result.asOfSeq, 22)
  assert.deepEqual(withPresentationProjections({ values: {} }, catalog), { values: {} }, 'no permission service means no control')
  assert.equal(legacyPermissionValue(null, catalog), null)
})

test('old Web options survive; missing and malformed catalogs never invent choices', () => {
  const old = { ...selection, options: choices }
  assert.equal(legacyPermissionValue(old, undefined), old)
  assert.equal(legacyPermissionValue(old, { options: [choices[0]] }), old,
    'an older host already owns its complete per-session choices; do not replace them with a process catalog')
  for (const invalid of [null, {}, { options: [{ value: 'auto' }] }, { options: [choices[0], choices[0]] }]) {
    assert.equal(legacyPermissionValue(selection, invalid), selection)
  }
  assert.deepEqual(legacyPermissionValue({ currentValue: 'custom' }, { options: [] }), { currentValue: 'custom', options: [] })
  const custom = { value: 'site-review', name: 'Site review', description: 'Custom native policy', private: 'not a presentation field' }
  assert.deepEqual(legacyPermissionValue(selection, { options: [custom] }).options,
    [{ value: 'site-review', name: 'Site review', description: 'Custom native policy' }])
})

test('history and compact page readers obtain the active process catalog without promoting a cold session', async () => {
  let liveCatalog = catalog
  const nativeSnapshot = { type: 'snapshot', cursor: 22, records: [], projections: { asOfSeq: 22, values: { permissions: selection } } }
  const gateway = {
    async invoke({ method }) { assert.equal(method, 'list'); return { items: [{ sessionId: 'cold' }] } },
    readSnapshot: async () => nativeSnapshot,
    stream: async () => assert.fail('history must not acquire a writer'),
    permissionCatalog: () => liveCatalog,
  }
  const first = await invokeLegacyRpc(gateway, request('session.history', { sessionId: 'cold', maxMessages: 1 }), options)
  assert.equal(first.result.ok, true)
  assert.deepEqual(first.result.value.projections.values.permissions.options, choices)
  liveCatalog = { options: [choices[0]] }
  const second = await invokeLegacyRpc(gateway, request('session.history', { sessionId: 'cold' }), options)
  assert.deepEqual(second.result.value.projections.values.permissions.options, [choices[0]])
  assert.deepEqual(nativeSnapshot.projections.values.permissions, selection)
})

test('catalog reader follows hot replacement, contains failures, and stays scoped to the current host', () => {
  const gateway = { invoke: async () => {}, stream: async () => {} }
  let service = { catalog: () => catalog }
  const desktop = resolveTypertGateway({ get: key => key === 'typertGateway' ? gateway : key === 'permissionPresets' ? service : undefined })
  const web = resolveTypertGateway({ get: key => key === 'typertGateway' ? gateway : undefined })
  assert.deepEqual(desktop.permissionCatalog(), catalog)
  assert.equal(web.permissionCatalog(), undefined)
  service = { catalog: () => { throw Error('temporarily unavailable') } }
  assert.equal(desktop.permissionCatalog(), undefined)
  service = undefined
  assert.equal(desktop.permissionCatalog(), undefined)
  service = { catalog: () => ({ options: [] }) }
  assert.deepEqual(desktop.permissionCatalog(), { options: [] })
})

test('a catalog provider lookup failure cannot make session history unreadable', () => {
  const gateway = { invoke: async () => {}, stream: async () => {} }
  const adapter = resolveTypertGateway({ get(key) {
    if (key === 'typertGateway') return gateway
    if (key === 'permissionPresets') throw Error('service is being replaced')
  } })
  assert.equal(adapter.permissionCatalog(), undefined)
})

test('model selection fallback preserves the host choice even when its provider is unavailable', async () => {
  const defaultModel = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' }
  const lastUsed = { provider: 'unavailable-provider', model: 'retired-model', reasoningEffort: 'low' }
  for (const [projection, expected] of [[undefined, defaultModel], [{ next: null, lastUsed }, lastUsed]]) {
    const gateway = {
      async invoke({ method }) { return method === 'list' ? { items: [{ sessionId: 's' }] }
        : { groups: [], default: defaultModel } },
      async readSnapshot() { return { type: 'snapshot', projections: { values: {
        ...(projection === undefined ? {} : { modelSelection: projection }),
      } } } },
    }
    const result = await invokeLegacyRpc(gateway, request('session.models', { sessionId: 's' }), options)
    assert.equal(result.result.ok, true)
    assert.deepEqual(result.result.value.current, expected)
    assert.deepEqual(result.result.value.groups, [], 'do not invent or switch to a working provider')
  }
})

function realtime(t) {
  const sources = new Map()
  const open = (key, signal) => {
    const stream = new Readable({ objectMode: true, read() {} })
    const abort = () => stream.destroy()
    signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => signal.removeEventListener('abort', abort))
    sources.set(key, stream)
    return stream
  }
  const gateway = {
    invoke: async () => assert.fail('a menu refresh cannot write or activate a session'),
    stream: async ({ namespace, method, signal }) => open(namespace + '/' + method, signal),
    wireStream: { open: async (_endpoint, _payload, signal) => open('$events', signal) },
  }
  const f = { catalog }
  const adapter = new DshRealtimeCompatibility({ get: key => key === 'typertGateway' ? gateway
    : key === 'permissionPresets' ? { catalog: () => f.catalog } : undefined })
  const peer = { readyState: 1, bufferedAmount: 0, frames: [], closes: [],
    send(raw) { this.frames.push(JSON.parse(raw).payload) }, close(...args) { this.closes.push(args) } }
  const detach = adapter.connect('/api/events.mux', peer)
  t.after(() => adapter.dispose())
  return Object.assign(f, { adapter, sources, peer, detach })
}
const permissions = peer => peer.frames.filter(f => f.type === 'session/projection' && f.key === 'permissions')

test('baseline, live selection and catalog changes all feed the unchanged phone permission reader', async t => {
  const f = realtime(t)
  const baseline = { type: 'baseline', value: { projections: { s: { asOfSeq: 20, values: { permissions: selection } } } } }
  f.sources.get('session/control').push(baseline)
  await tick()
  assert.deepEqual(permissions(f.peer).at(-1).value, { ...selection, options: choices })
  f.sources.get('session/control').push({ type: 'projection', sessionId: 's', key: 'permissions', seq: 21, value: { currentValue: 'read-only' } })
  await tick()
  f.catalog = { options: [choices[0], { value: 'auto', name: 'Auto' }] }
  f.sources.get('$events').push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.deepEqual(permissions(f.peer).at(-1), { type: 'session/projection', sessionId: 's', key: 'permissions', seq: 21,
    value: { currentValue: 'read-only', options: f.catalog.options } })
  assert.deepEqual(baseline.value.projections.s.values.permissions, selection)
  assert.deepEqual(f.peer.closes, [])
  f.catalog = { options: [] }
  f.sources.get('$events').push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.deepEqual(permissions(f.peer).at(-1).value.options, [], 'withdrawn choices cannot stay cached')
})

test('out-of-order projection cannot become the catalog-refresh baseline; disposal stops delivery', async t => {
  const f = realtime(t), control = f.sources.get('session/control')
  control.push({ type: 'projection', sessionId: 's', key: 'permissions', seq: 21, value: { currentValue: 'read-only' } })
  control.push({ type: 'projection', sessionId: 's', key: 'permissions', seq: 20, value: selection })
  await tick()
  f.sources.get('$events').push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.equal(permissions(f.peer).at(-1).value.currentValue, 'read-only')
  const count = f.peer.frames.length
  f.detach()
  await tick()
  assert.equal(f.peer.frames.length, count)
})

test('permission refresh is bounded and forgets removed sessions and replaced baselines', async t => {
  const f = realtime(t), control = f.sources.get('session/control'), events = f.sources.get('$events')
  for (let i = 0; i < 66; i++) control.push({ type: 'projection', sessionId: 's' + i, key: 'permissions', seq: 20, value: selection })
  await tick()
  f.peer.frames.length = 0
  events.push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.equal(permissions(f.peer).length, 64)
  assert(!permissions(f.peer).some(p => p.sessionId === 's0'))
  events.push({ type: 'emit', event: 'api-session/removed', args: ['s2'] })
  await tick()
  f.peer.frames.length = 0
  events.push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.equal(permissions(f.peer).length, 63)
  control.push({ type: 'baseline', value: { projections: {} } })
  await tick()
  f.peer.frames.length = 0
  events.push({ type: 'emit', event: 'permission-presets/catalog-changed', args: [] })
  await tick()
  assert.equal(permissions(f.peer).length, 0)
})

const groups = ['deepseek-official', 'deepseek-account'].map(id => ({ id, name: id,
  models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning: {
    efforts: ['off', 'low', 'high', 'max'].map(id => ({ id, name: id })), defaultEffort: 'high',
  } }] }))

test('native model format preserves provider identity and all reasoning choices', async () => {
  const current = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' }
  const gateway = {
    async invoke({ method }) { return method === 'list' ? { items: [{ sessionId: 's' }] }
      : { groups, default: { provider: 'deepseek-official', model: 'deepseek-flash' } } },
    async readSnapshot() { return { type: 'snapshot', projections: { values: {
      modelSelection: { next: current, lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' } },
    } } } },
  }
  const result = await invokeLegacyRpc(gateway, request('session.models', { sessionId: 's', modelIdentity: 'native-v1' }), options)
  assert.equal(result.result.ok, true)
  assert.deepEqual(result.result.value.groups, groups)
  assert.deepEqual(result.result.value.current, current, 'pending intent wins over the last completed request')
})

test('selecting either provider and every effort calls native once with the exact tuple', async () => {
  for (const provider of ['deepseek-official', 'deepseek-account']) {
    for (const effort of [undefined, 'off', 'low', 'high', 'max']) {
      const payload = { sessionId: 's', provider, model: 'deepseek-flash', ...(effort === undefined ? {} : { reasoningEffort: effort }) }
      let calls = 0
      const result = await invokeLegacyRpc({ async invoke(call) {
        calls++
        assert.equal(call.namespace, 'session'); assert.equal(call.method, 'selectModel')
        assert.deepEqual(call.args.request, payload)
        return { selected: payload }
      } }, request('session.selectModel', payload), options)
      assert.equal(result.result.ok, true)
      assert.equal(calls, 1)
    }
  }
})

test('real write conflicts and model/effort validation errors are never filtered or retried', async () => {
  for (const code of ['session/writer-held', 'session/model-unavailable']) {
    let calls = 0
    const result = await invokeLegacyRpc({ async invoke() { calls++; throw Object.assign(new Error('native rejection'), { code }) } },
      request('session.selectModel', { sessionId: 's', provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'invalid' }), options)
    assert.equal(result.result.ok, false)
    assert.equal(result.result.error.code, code)
    assert.equal(calls, 1)
  }
})
