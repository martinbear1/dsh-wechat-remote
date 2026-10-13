import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
const compiled = await build({ entryPoints: ['src/client/native-update-store.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' })
const bench = (call) => {
  const timers = new Map(); let id = 0
  const module = { exports: {} }
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, Error,
    setTimeout: fn => { timers.set(++id, fn); return id }, clearTimeout: key => timers.delete(key) })
  const store = new module.exports.NativeUpdateStore(call)
  return { store, timers, async tick() { const [key, fn] = timers.entries().next().value || []; if (fn) { timers.delete(key); await fn() } } }
}
const check = () => ({ advice: { label: 'update', current: {} }, status: { phase: 'idle', message: '' }, canInstall: true, ticket: 'a'.repeat(48), channel: 'stable' })

test('pending native installation overrides stale update advice on both shared views', async () => {
  const code = await build({ entryPoints: ['src/client/NativeUpdateCard.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
  const module = { exports: {} }
  vm.runInNewContext(code.outputFiles[0].text, { module, exports: module.exports, require(id) {
    if (id === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'NativeModal' }
    throw Error(id)
  } })
  for (const phase of ['installing', 'restart-required', 'unknown']) {
    const value = { check: { ...check(), advice: { label: '插件可更新', current: {}, targetVersion: '1.7.13', checkedAt: Date.now() } }, status: { phase, targetVersion: '1.7.13', message: phase } }
    const rendered = module.exports.NativeUpdateCard({ store: { getSnapshot: () => value } })
    const tree = JSON.stringify(rendered)
    assert(!tree.includes('插件可更新'), 'pending state must not show stale advice')
    assert(!tree.includes('可更新至'), 'already installed is not an available-update state')
    assert(!tree.includes('"children":"更新 Desktop 插件"'), 'pending job must not offer another install')
    if (phase === 'restart-required') {
      assert(tree.includes('待重新打开 Desktop'))
      assert(tree.includes('"data-severity":"info"'), 'restart-required is not a green success state')
    }
  }
})
test('two visible pages share one read and submission, preserve progress across unmount/remount', async () => {
  let reads = 0, installs = 0, phase = 'installing'
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') { reads++; return check() }
    if (endpoint === 'update-start') { installs++; return { phase } }
    return { phase }
  })
  const a = b.store.subscribe(() => {}), c = b.store.subscribe(() => {})
  await Promise.all([b.store.refresh(), b.store.refresh()]); assert.equal(reads, 1)
  await Promise.all([b.store.install(), b.store.install()]); assert.equal(installs, 1)
  assert.equal(b.timers.size, 1)
  a(); c(); assert.equal(b.timers.size, 0)
  const off = b.store.subscribe(() => {}); assert.equal(b.timers.size, 1)
  phase = 'restart-required'; await b.tick(); assert.equal(b.store.getSnapshot().status.phase, phase)
  phase = 'complete'; await b.tick(); assert.equal(b.store.getSnapshot().status.phase, phase)
  assert.equal(b.timers.size, 0); assert.equal(installs, 1)
  off(); b.store.dispose()
})
test('lost start response only polls status, never reposts installation', async () => {
  let installs = 0
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return check()
    if (endpoint === 'update-start') { installs++; throw Error('offline') }
    return { phase: 'restart-required', message: 'installed; restart' }
  })
  const off = b.store.subscribe(() => {}); await b.store.refresh()
  await b.store.install(); assert.equal(b.store.getSnapshot().status.phase, 'unknown')
  await b.tick(); assert.equal(b.store.getSnapshot().status.phase, 'restart-required')
  await b.store.install(); assert.equal(installs, 1)
  off(); b.store.dispose()
})
test('explicit rejection is shown and consumes the ticket until a fresh check', async () => {
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return check()
    throw Object.assign(Error('busy task'), { code: 'update/not-started' })
  })
  await b.store.refresh(); await b.store.install()
  assert.equal(b.store.getSnapshot().status.phase, 'failed')
  assert.equal(b.store.getSnapshot().status.message, 'busy task')
  assert.equal(b.store.getSnapshot().check.canInstall, false)
  assert.equal(b.timers.size, 0); b.store.dispose()
})

test('new client plus pre-update backend reports unsupported runtime, not network loss or latest version', async () => {
  const calls = []
  const b = bench(async endpoint => { calls.push(endpoint); if (endpoint === 'status') return { gate: { profileScope: 'desktop' } }; throw Error('404') })
  await b.store.refresh()
  assert.match(b.store.getSnapshot().error, /正常重启当前 DSH/)
  assert.equal(b.store.getSnapshot().check, null)
  assert.deepEqual(calls, ['update-check', 'status'])
  b.store.dispose()
})

test('disposal fences late check success/failure without starting another request', async () => {
  for (const fail of [false, true]) {
    let release, reads = 0
    const b = bench(async endpoint => {
      assert.equal(endpoint, 'update-check'); reads++
      return new Promise((resolve, reject) => { release = () => fail ? reject(Error('offline')) : resolve(check()) })
    })
    const off = b.store.subscribe(() => {}), pending = b.store.refresh()
    b.store.dispose(); release(); await pending
    assert.equal(reads, 1); assert.equal(b.store.getSnapshot().check, null)
    assert.equal(b.timers.size, 0); off()
  }
})
test('an explicit fresh check recovers from failure without automatic catalog retry', async () => {
  let fail = true, reads = 0
  const b = bench(async endpoint => {
    if (endpoint === 'status') return { plugin: { runningVersion: '1.7.14' } }
    assert.equal(endpoint, 'update-check'); reads++
    if (fail) throw Error('offline')
    return check()
  })
  await b.store.refresh(); assert.match(b.store.getSnapshot().error, /检查未完成/)
  assert.equal(reads, 1); assert.equal(b.timers.size, 0)
  fail = false; await b.store.refresh()
  assert.equal(reads, 2); assert.equal(b.store.getSnapshot().check.canInstall, true)
  b.store.dispose()
})

const beforeVersion = '1.7.13', targetVersion = '1.7.14'
const offered = () => ({ ...check(), advice: { targetVersion, current: { pluginVersion: beforeVersion } } })
const result = (phase = 'restart-required', jobId = 'fresh-job') => ({ phase, jobId, targetVersion, previousVersion: beforeVersion, message: '' })
test('a fresh one-click restart notice is taken once across views, not on check/reopen; dismissal never makes a request', async () => {
  const calls = [], b = bench(async endpoint => {
    calls.push(endpoint)
    if (endpoint === 'update-check') return offered()
    return result()
  })
  const a = b.store.subscribe(() => {}), c = b.store.subscribe(() => {})
  await b.store.refresh(); assert.equal(b.store.takeRestartNotice(), undefined)
  await b.store.install()
  const first = b.store.takeRestartNotice()
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { jobId: 'fresh-job', installedVersion: targetVersion, runningVersion: beforeVersion })
  assert.equal(b.store.takeRestartNotice(), undefined, 'another view cannot claim a second popup')
  const before = calls.length
  for (let i = 0; i < 3; i++) assert.equal(b.store.takeRestartNotice(), undefined)
  assert.equal(calls.length, before, 'notice consumption/dismissal is local only')
  await b.tick(); assert.equal(b.store.takeRestartNotice(), undefined)
  a(); c()
  const again = b.store.subscribe(() => {}); await b.tick()
  assert.equal(b.store.takeRestartNotice(), undefined)
  assert.equal(calls.filter(x => x === 'update-start').length, 1)
  again(); b.store.dispose()
})
test('historical pending or ready checks never produce a new completion popup', async () => {
  for (const phase of ['restart-required', 'complete', 'failed', 'unknown']) {
    const b = bench(async () => ({ ...offered(), status: result(phase, 'historical'), canInstall: false }))
    await b.store.refresh(); assert.equal(b.store.takeRestartNotice(), undefined)
    await b.store.install(); assert.equal(b.store.takeRestartNotice(), undefined)
    b.store.dispose()
  }
})
test('lost reply only confirms a new matching job; failed/unknown/old/wrong targets do not masquerade as completion', async () => {
  let status = result('unknown'), installs = 0
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return { ...offered(), status: result('idle', 'historical') }
    if (endpoint === 'update-start') { installs++; throw Error('lost reply') }
    return status
  })
  const off = b.store.subscribe(() => {}); await b.store.refresh(); await b.store.install()
  for (const value of [result('unknown'), result('restart-required', 'historical'), { ...result(), targetVersion: 'unrelated' }]) {
    status = value; await b.tick(); assert.equal(b.store.takeRestartNotice(), undefined)
  }
  status = result(); await b.tick(); assert.equal(b.store.takeRestartNotice().jobId, 'fresh-job')
  assert.equal(installs, 1); off(); b.store.dispose()
})
test('unsupported/malformed presentation metadata and notice failures cannot veto updates or add reads', async () => {
  for (const response of [
    { phase: 'restart-required', message: '' },
    { ...result(), get targetVersion() { throw Error('UI metadata unavailable') } },
    result('complete'), result('failed'),
  ]) {
    const calls = [], b = bench(async endpoint => { calls.push(endpoint); return endpoint === 'update-check' ? offered() : response })
    await b.store.refresh(); await b.store.install()
    assert.equal(b.store.getSnapshot().status, response)
    assert.equal(b.store.getSnapshot().error, null)
    assert.equal(b.store.takeRestartNotice(), undefined)
    assert.deepEqual(calls, ['update-check', 'update-start'])
    b.store.dispose()
  }
})
test('accepted-job identity refuses unrelated completion only for presentation, not update status', async () => {
  let status = result('restart-required', 'another-job')
  const b = bench(async endpoint => endpoint === 'update-check' ? offered() : endpoint === 'update-start' ? result('installing') : status)
  const off = b.store.subscribe(() => {}); await b.store.refresh(); await b.store.install()
  await b.tick(); assert.equal(b.store.takeRestartNotice(), undefined)
  assert.equal(b.store.getSnapshot().status, status, 'display matching cannot veto a backend result')
  status = result(); await b.tick(); assert.equal(b.store.takeRestartNotice().jobId, 'fresh-job')
  off(); b.store.dispose()
})

test('unavailable presentation fields cannot prevent a submission or alter its accepted result', async () => {
  for (const field of ['target', 'job']) {
    const offer = offered(), response = result(), calls = []
    if (field === 'target') Object.defineProperty(offer.advice, 'targetVersion', { get() { throw Error('display metadata') } })
    else Object.defineProperty(response, 'jobId', { get() { throw Error('display metadata') } })
    const b = bench(async endpoint => { calls.push(endpoint); return endpoint === 'update-check' ? offer : response })
    await b.store.refresh(); await b.store.install()
    assert.equal(b.store.getSnapshot().status, response); assert.equal(b.store.takeRestartNotice(), undefined)
    assert.deepEqual(calls, ['update-check', 'update-start']); b.store.dispose()
  }
})

test('disposal fences late results without an auxiliary read', async () => {
  let release, status = result(), calls = []
  const b = bench(async endpoint => {
    calls.push(endpoint)
    if (endpoint === 'update-check') return offered()
    if (endpoint === 'update-start') return new Promise(resolve => { release = resolve })
    return status
  })
  const off = b.store.subscribe(() => {}); await b.store.refresh()
  const installing = b.store.install(); b.store.dispose(); release(result()); await installing
  assert.equal(b.store.takeRestartNotice(), undefined); assert.equal(b.timers.size, 0)
  assert.deepEqual(calls, ['update-check', 'update-start']); off()
})
