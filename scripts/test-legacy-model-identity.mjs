import assert from 'node:assert/strict'
import test from 'node:test'
import { invokeLegacyRpc } from '../lib/dsh-protocol-compat.js'
import { legacyModelAlias, presentModelCatalog, resolveModelAlias } from '../lib/legacy-model-identity.js'

const model = { id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 1000000,
  reasoning: { efforts: ['off', 'low', 'high', 'max'].map(id => ({ id, name: id })), defaultEffort: 'high' } }
const groups = ['deepseek', 'deepseek-account'].map(id => ({ id, name: id, models: [structuredClone(model)] }))
const initial = { provider: 'deepseek', model: model.id, reasoningEffort: 'high' }
function host() {
  const f = { catalog: { groups: structuredClone(groups), default: { ...initial } }, current: { ...initial }, calls: [], error: null }
  f.gateway = {
    async invoke(call) {
      f.calls.push(call)
      if (call.method === 'list') return { items: [{ sessionId: 's' }] }
      if (call.method === 'modelCatalog') return f.catalog
      if (call.method === 'selectModel') {
        if (f.error) throw Object.assign(Error('native rejection'), { code: f.error })
        const { sessionId, ...selection } = call.args.request
        assert.equal(sessionId, 's')
        f.current = selection
        return { selected: { ...selection } }
      }
      if (call.method === 'prompt') return { accepted: true }
      assert.fail(call.method)
    },
    async readSnapshot() { return { type: 'snapshot', projections: { values: { modelSelection: { next: f.current, lastUsed: initial } } } } },
  }
  f.rpc = (method, payload = {}, signal = new AbortController().signal) => invokeLegacyRpc(f.gateway,
    { type: 'client-request', rpcId: 'identity', method, payload: { sessionId: 's', ...payload } },
    { signal, describeHost: () => ({}) })
  f.menu = async (payload) => {
    const res = await f.rpc('session.models', payload)
    assert.equal(res.result.ok, true, JSON.stringify(res))
    return res.result.value
  }
  f.writes = () => f.calls.filter(c => c.method === 'selectModel')
  return f
}

test('unchanged released Mini equality checks exactly one provider; catalog/native state not mutated', async () => {
  const f = host(), before = structuredClone(f.catalog), menu = await f.menu()
  const checked = menu.groups.flatMap(g => g.models.filter(m => menu.current.model === m.id).map(m => [g.id, m.id]))
  assert.deepEqual(checked, [['deepseek', 'deepseek · deepseek-flash']])
  assert.equal(menu.groups[1].models[0].name, 'deepseek-account · DeepSeek Flash')
  assert.equal(menu.groups[1].models[0].nativeModel, model.id)
  assert.deepEqual(menu.groups[1].models[0].reasoning, model.reasoning)
  assert.equal(menu.groups[1].models[0].contextWindow, model.contextWindow)
  assert.deepEqual(menu.default, menu.current)
  assert.equal(menu.modelIdentity.format, 'legacy-provider-model-v1')
  assert.deepEqual(f.catalog, before)
  assert.deepEqual(f.current, initial)
  assert.equal(f.writes().length, 0)
})

test('both providers and every effort round-trip to exactly one native mutation, then authoritative refresh', async () => {
  const f = host(), menu = await f.menu()
  for (const group of menu.groups) for (const effort of [undefined, 'off', 'low', 'high', 'max']) {
    const before = f.writes().length
    const selection = { provider: group.id, model: group.models[0].id,
      ...(effort === undefined ? {} : { reasoningEffort: effort }) }
    const result = await f.rpc('session.selectModel', selection)
    assert.equal(result.result.ok, true)
    assert.deepEqual(f.writes().at(-1).args.request, { sessionId: 's', ...selection, model: model.id })
    assert.equal(f.writes().length, before + 1)
    const refreshed = await f.menu()
    assert.equal(refreshed.current.model, selection.model)
    assert.deepEqual(result.result.value.selected, refreshed.current)
    assert.equal(refreshed.groups.flatMap(g => g.models).filter(m => m.id === refreshed.current.model).length, 1)
  }
})

test('native negotiation and slash endpoints retain native IDs, no protocol fields enter DSH', async () => {
  const f = host(), native = await f.menu({ modelIdentity: 'native-v1' })
  assert.deepEqual(native.groups, groups)
  assert.deepEqual(native.current, initial)
  assert.equal(native.modelIdentity.format, 'native-v1')
  const next = { provider: 'deepseek-account', model: model.id }
  await f.rpc('session.selectModel', { ...next, modelIdentity: 'native-v1' })
  assert.deepEqual(f.writes().at(-1).args.request, { sessionId: 's', ...next })
  const slash = await f.rpc('session/modelCatalog', { args: {} })
  assert.deepEqual(slash.result.value, f.catalog)
  await f.rpc('session/selectModel', { args: { request: { sessionId: 's', ...initial } } })
  assert.deepEqual(f.current, initial)
})

test('single-provider old Web remains unchanged; cached raw choices over an upgrade still work', async () => {
  const f = host()
  f.catalog.groups = [structuredClone(groups[0])]
  const menu = await f.menu()
  assert.deepEqual(menu.groups, [groups[0]])
  assert.deepEqual(menu.current, initial)
  f.catalog.groups.push(structuredClone(groups[1]))
  const result = await f.rpc('session.selectModel', initial)
  assert.equal(result.result.ok, true)
  assert.deepEqual(f.current, initial)
})

test('cached alias survives provider removal/restart; removed provider never falls back to same-named model', async () => {
  const old = await host().menu(), f = host()
  f.catalog.groups = [structuredClone(groups[0])]
  assert.equal((await f.rpc('session.selectModel', { provider: old.current.provider, model: old.current.model,
    reasoningEffort: old.current.reasoningEffort })).result.ok, true)
  const rejected = await f.rpc('session.selectModel', { provider: groups[1].id, model: old.groups[1].models[0].id })
  assert.equal(rejected.result.ok, false)
  assert.equal(f.writes().length, 1)
  f.current = { provider: groups[1].id, model: model.id }
  const menu = await f.menu()
  assert.notEqual(menu.current.model, menu.groups[0].models[0].id)
  assert.equal(menu.current.provider, groups[1].id)
})

test('Unicode, separator, percent and control characters have collision-free stable aliases', () => {
  const values = ['a', 'a · b', 'a%B7b', 'a%25', '提供方', '\n', ' a ', '%0A', 'a/b']
  const aliases = new Set()
  for (const provider of values) for (const id of values) {
    const alias = legacyModelAlias(provider, id)
    assert(!aliases.has(alias)); aliases.add(alias)
    assert.deepEqual(resolveModelAlias({ groups: [{ id: provider, models: [{ id }] }] }, { provider, model: alias }), { model: id, aliased: true })
  }
})

test('cross-provider alias, unknown/stale alias and malformed format fail before mutation', async () => {
  const f = host(), a = legacyModelAlias(groups[0].id, model.id)
  for (const choice of [
    { provider: groups[1].id, model: a }, { provider: 'missing', model: a },
    { provider: groups[0].id, model: legacyModelAlias(groups[0].id, 'removed') },
    { ...initial, modelIdentity: 'guessed-future-format' },
  ]) assert.equal((await f.rpc('session.selectModel', choice)).result.ok, false)
  assert.equal((await f.rpc('session.models', { modelIdentity: 'unknown' })).result.ok, false)
  assert.equal(f.writes().length, 0)
})

test('raw native IDs colliding with aliases fail closed; explicit native format remains usable', async () => {
  const f = host(), id = legacyModelAlias('deepseek', model.id)
  f.catalog.groups[0].models.push({ id, name: 'Real native ID happens to look like an alias' })
  assert.equal((await f.rpc('session.selectModel', { provider: 'deepseek', model: id })).result.ok, false)
  assert.equal(f.writes().length, 0)
  assert.equal((await f.rpc('session.selectModel', { provider: 'deepseek', model: id, modelIdentity: 'native-v1' })).result.ok, true)
  assert.equal(f.current.model, id)
})

test('provider label changes do not reroute cached selection; nodes keep independent current models', async () => {
  const web = host(), desktop = host(), menu = await desktop.menu()
  desktop.catalog.groups[1].name = 'renamed label'
  await desktop.rpc('session.selectModel', { provider: groups[1].id, model: menu.groups[1].models[0].id })
  assert.equal(desktop.current.provider, groups[1].id)
  assert.deepEqual(web.current, initial)
  assert.equal(web.writes().length, 0)
})

test('native rejection is preserved and not retried; abort between catalog and write prevents mutation', async () => {
  for (const code of ['session/writer-held', 'session/model-unavailable']) {
    const f = host(); f.error = code
    const result = await f.rpc('session.selectModel', { ...initial, model: legacyModelAlias(initial.provider, initial.model) })
    assert.equal(result.result.error.code, code)
    assert.equal(f.writes().length, 1)
  }
  const f = host(), controller = new AbortController(), invoke = f.gateway.invoke
  f.gateway.invoke = async call => { const result = await invoke(call); controller.abort(); return result }
  const res = await f.rpc('session.selectModel', { ...initial, model: legacyModelAlias(initial.provider, initial.model) }, controller.signal)
  assert.equal(res.result.ok, false)
  assert.equal(f.writes().length, 0)
})

test('invalid catalog never invents identities; native projection is not rewritten by prompt', async () => {
  for (const invalid of [{}, { groups: [groups[0], groups[0]] }, { groups: [{ ...groups[0], models: [model, model] }] }]) {
    assert.throws(() => presentModelCatalog(invalid, initial, 'legacy-provider-model-v1'))
  }
  const f = host()
  await f.menu()
  await f.rpc('session.prompt', { content: [{ type: 'text', text: 'fixture' }], mode: 'queue' })
  const prompt = f.calls.find(c => c.method === 'prompt').args.request
  assert(!Object.hasOwn(prompt, 'provider')); assert(!Object.hasOwn(prompt, 'model'))
  assert.deepEqual(f.current, initial, 'a menu read is not selection intent and must not overwrite desktop changes')
})
