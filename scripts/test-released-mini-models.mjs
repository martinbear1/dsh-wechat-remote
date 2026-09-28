/** Optional cross-repo audit: loads immutable released Mini source from Git,
 * never edits/builds/uploads the Mini. The simulated host makes no network call.
 * Known cache/race cases are reproductions, NOT claims that they are repaired. */
import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { invokeLegacyRpc } from '../lib/dsh-protocol-compat.js'

const root = process.env.HARNESS_MINI_SOURCE
assert(root, 'HARNESS_MINI_SOURCE required')
const ref = '33bbf60'
const sha = execFileSync('git', ['-C', root, 'rev-parse', ref], { encoding: 'utf8' }).trim()
const read = relative => execFileSync('git', ['-C', root, 'show', `${sha}:${relative}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
const wxml = read('pages/index/index.wxml')
assert(wxml.includes('currentModel && currentModel.model === m.id'), 'released picker assumption changed')
assert(wxml.includes('data-provider="{{item.id}}" data-model="{{m.id}}"'), 'released dispatch assumption changed')

const calls = [], writes = [], sends = [], modules = new Map(), storage = new Map(), timers = new Map()
let serial = 0, current = { provider: 'api', model: 'same', reasoningEffort: 'high' }, releaseSelection, holdSelection = false
const groups = ['api', 'account'].map(id => ({ id, name: id, models: [{ id: 'same', name: 'Same Model',
  reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }] } }] }))
const gateway = {
  async invoke({ method, args }) {
    if (method === 'list') return { items: [{ sessionId: 's' }] }
    if (method === 'modelCatalog') return { groups, default: { provider: 'api', model: 'same' } }
    if (method === 'selectModel') {
      if (holdSelection) await new Promise(resolve => { releaseSelection = resolve })
      const { sessionId, ...selection } = args.request
      assert.equal(sessionId, 's'); current = selection; writes.push(selection)
      return { selected: selection }
    }
    if (method === 'prompt') { sends.push({ payload: args.request, used: current }); return { accepted: true } }
    assert.fail(method)
  },
  async readSnapshot() { return { type: 'snapshot', projections: { values: { modelSelection: { next: current } } } } },
}
const request = {
  configure() {},
  callRemote: async () => ({ ok: false, error: { code: 'invocation-unavailable' } }),
  async call(method, payload) {
    calls.push({ method, payload })
    if (method === 'subagent.list') return { ok: true, value: { entries: [] } }
    const response = await invokeLegacyRpc(gateway, { type: 'client-request', rpcId: 'released-mini', method, payload },
      { signal: new AbortController().signal, describeHost: () => ({}) })
    return response.result
  },
}
const wx = { getStorageSync: key => storage.get(key) || {}, setStorageSync: (key, value) => storage.set(key, value) }
function load(relative) {
  if (relative === 'utils/request.js') return request
  if (relative === 'utils/socket.js') return { stop() {} }
  if (modules.has(relative)) return modules.get(relative).exports
  assert(!relative.startsWith('../') && !path.isAbsolute(relative))
  const module = { exports: {} }; modules.set(relative, module)
  let code = read(relative)
  if (relative === 'utils/store.js') code += '\nmodule.exports.receiveForAudit = handleFrame; module.exports.enableForAudit = () => { requestCarrierReady = true };'
  vm.runInNewContext(code, { module, exports: module.exports, console, wx,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id }, clearTimeout(id) { timers.delete(id) },
    require(specifier) {
      assert(specifier.startsWith('.'), `unexpected external Mini dependency ${specifier}`)
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier))
      if (!target.endsWith('.js')) target += '.js'
      return load(target)
    },
  }, { filename: `${sha}/${relative}` })
  return module.exports
}
const store = load('utils/store.js')
store.enableForAudit(); store.state.connected = true; store.state.sessionListState = 'ready'
store.state.activeSessionId = 's'; store.state.sessions.push({ sessionId: 's', running: false })
const session = store.sessionState('s'); session.loadState = 'ready'; session.lastSeq = 0; session.syncedAt = Date.now()
assert.equal((await store.fetchModels('s')).ok, true)
const checked = () => {
  const menu = store.state.sessionModels.s
  return menu.groups.flatMap(g => g.models.filter(m => menu.current.model === m.id).map(() => g.id))
}
assert.deepEqual(checked(), ['api'])
const phoneModel = store.state.sessionModels.s.groups[1].models[0].id
assert.equal((await store.selectModel('s', 'account', phoneModel, 'low')).ok, true)
assert.deepEqual(checked(), ['account'])
await store.sendPromptParts('s', [{ type: 'text', text: 'audit fixture' }])
assert.equal(sends.at(-1).used.provider, 'account')
assert.equal(sends.at(-1).used.model, 'same', 'alias cannot reach the actual provider')
assert.equal(sends.at(-1).used.reasoningEffort, 'low')

// Known issue: another composer changes native selection after phone's fetch.
current = { provider: 'api', model: 'same', reasoningEffort: 'high' }
store.receiveForAudit({ type: 'server-event', payload: { type: 'session/projection', sessionId: 's',
  key: 'modelSelection', seq: 100, value: { next: current, lastUsed: null } } })
assert.equal(session.projections.modelSelection.value.next.provider, 'api')
assert.equal(store.state.sessionModels.s.current.provider, 'account', 'KNOWN ISSUE: cached menu remains stale')
await store.sendPromptParts('s', [{ type: 'text', text: 'stale display audit' }])
assert.equal(sends.at(-1).used.provider, 'api', 'actual host choice, not stale displayed account')
assert(!Object.hasOwn(sends.at(-1).payload, 'model'), 'released prompt does not transmit a model intent')

// Known issue: optimistic selection is not awaited by the released Send action.
holdSelection = true
const pending = store.selectModel('s', 'account', phoneModel, 'low')
for (let i = 0; i < 30 && !releaseSelection; i++) await Promise.resolve()
assert.equal(typeof releaseSelection, 'function')
await store.sendPromptParts('s', [{ type: 'text', text: 'before select receipt' }])
assert.equal(sends.at(-1).used.provider, 'api', 'KNOWN ISSUE: rapid Send can precede select acknowledgement')
releaseSelection(); assert.equal((await pending).ok, true)
await store.sendPromptParts('s', [{ type: 'text', text: 'after select receipt' }])
assert.equal(sends.at(-1).used.provider, 'account')
console.log(`PASS immutable Mini ${sha}: legacy picker/selection/refresh round-trip; native model on send after accepted selection`)
console.log('REPRODUCED (not fixed): stale cache after desktop projection; Send before selection receipt is not serialized')
