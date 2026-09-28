import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const output = await build({ entryPoints: [fileURLToPath(new URL('../src/client/web-update-store.ts', import.meta.url))],
  bundle: true, write: false, platform: 'browser', format: 'cjs' })
const origin = 'http://127.0.0.1:3093'
const job = { jobId: 'browser-receiver', statusOrigin: 'http://127.0.0.1:41000', statusToken: 'fixture-only' }
const advice = { label: 'fixture', current: { agentVersion: '0.1.5-rc.2', pluginVersion: '1.7.12' } }
const response = value => ({ ok: true, json: async () => value })
function fixture(dispatch, injected = false) {
  const module = { exports: {} }, calls = [], navigations = []
  const context = vm.createContext({ module, exports: module.exports, Date, URL, AbortSignal, setTimeout, clearTimeout,
    window: { location: { origin: 'http://127.0.0.1:3080', replace: url => navigations.push(url) } },
    dispatch: async (...args) => { calls.push(args); return dispatch(...args) } })
  // Node's native fetch and arrow mocks accept the wrong receiver. Model the
  // Window brand check explicitly so this regression also fails outside Chrome.
  vm.runInContext(`globalThis.fetch = function(input, init) {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return dispatch(input, init);
  };`, context)
  vm.runInContext(output.outputFiles[0].text, context)
  const store = injected ? new module.exports.WebUpdateStore(origin, vm.runInContext('fetch', context))
    : new module.exports.WebUpdateStore(origin)
  return { store, calls, navigations }
}
async function settled(predicate) {
  for (let i = 0; i < 40 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve))
  assert(predicate(), 'store did not reach expected state')
}

for (const injected of [false, true]) test(`Web check preserves Window fetch receiver (${injected ? 'injected' : 'default'})`, async () => {
  const f = fixture(url => { assert.equal(url, origin + '/gate/update/check'); return response({ advice, canInstall: false, mode: 'none' }) }, injected)
  try {
    await Promise.all([f.store.refresh(), f.store.refresh()])
    assert.equal(f.store.getSnapshot().error, '')
    assert.equal(f.store.getSnapshot().check.advice.current.pluginVersion, '1.7.12')
    assert.equal(f.calls.length, 1)
  } finally { f.store.dispose() }
})

test('Web start and progress preserve receiver without duplicating admission', async () => {
  let finished = false
  const terminal = { jobId: job.jobId, phase: 'failed', terminal: true, ok: false, message: 'controlled fixture failure' }
  const f = fixture((url, init) => {
    if (url.endsWith('/check')) return response({ advice, canInstall: true, ticket: 'ticket', mode: 'automatic', ...(finished ? { lastResult: terminal } : {}) })
    if (url.endsWith('/start')) { assert.equal(init.method, 'POST'); assert.equal(JSON.parse(init.body).ticket, 'ticket'); return response(job) }
    assert.equal(url, job.statusOrigin + '/status'); assert.equal(init.headers.Authorization, 'Bearer ' + job.statusToken)
    finished = true
    return response(terminal)
  })
  try {
    await f.store.refresh(); assert.equal(f.store.getSnapshot().error, '')
    await Promise.all([f.store.install(), f.store.install()])
    await settled(() => f.store.getSnapshot().progress?.phase === 'failed')
    assert.equal(f.calls.filter(([url]) => url.endsWith('/start')).length, 1)
    assert(f.calls.some(([url]) => url === job.statusOrigin + '/status'))
  } finally { f.store.dispose() }
})

test('Web fallback progress and resume use the same correctly bound fetch', async () => {
  const f = fixture(url => {
    if (url.endsWith('/check')) return response({ advice, activeJob: job, canInstall: false })
    if (url === job.statusOrigin + '/status') throw new Error('worker has exited')
    if (url.endsWith('/gate/update/status')) return response({ lastResult: { jobId: job.jobId, phase: 'complete', terminal: true, ok: true, message: 'complete' } })
    assert.equal(url, origin + '/gate/update/resume?job=' + job.jobId)
    return response({ url: 'http://127.0.0.1:3080/?fixture=resume' })
  })
  try {
    await f.store.refresh(); assert.equal(f.store.getSnapshot().error, '')
    await settled(() => f.navigations.length === 1)
    assert.equal(f.calls.length, 4)
    assert.equal(f.store.getSnapshot().progress.ok, true)
    assert.equal(f.calls.some(([url]) => url.endsWith('/start')), false)
  } finally { f.store.dispose() }
})
