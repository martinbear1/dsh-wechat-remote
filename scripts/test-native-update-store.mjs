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
  const code = await build({ entryPoints: ['src/client/NativeUpdateCard.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css'] })
  const module = { exports: {} }
  vm.runInNewContext(code.outputFiles[0].text, { module, exports: module.exports, require(id) {
    if (id === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    throw Error(id)
  } })
  for (const phase of ['installing', 'restart-required', 'unknown']) {
    const value = { check: { ...check(), advice: { label: '插件可更新', current: {}, targetVersion: '1.7.13', checkedAt: Date.now() } }, status: { phase, targetVersion: '1.7.13', message: phase } }
    const tree = JSON.stringify(module.exports.NativeUpdateCard({ store: { getSnapshot: () => value } }))
    assert(!tree.includes('插件可更新'), 'pending state must not show stale advice')
    assert(!tree.includes('可更新至'), 'already installed is not an available-update state')
    assert(!tree.includes('"children":"更新 Desktop 插件"'), 'pending job must not offer another install')
    if (phase === 'restart-required') assert(tree.includes('待重新打开 Desktop'))
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
  assert.match(b.store.getSnapshot().error, /退出并重新打开/)
  assert.equal(b.store.getSnapshot().check, null)
  assert.deepEqual(calls, ['update-check', 'status'])
  b.store.dispose()
})

const settle = () => new Promise(resolve => setImmediate(resolve))
const completeCheck = reason => ({ ...check(), canInstall: false, ticket: '', reason,
  status: { phase: 'complete', message: 'Desktop 插件已更新并生效。', targetVersion: '1.7.12' } })

test('companion invalidation rechecks both shared views without submitting an installation', async () => {
  let busy = true, reads = 0
  const b = bench(async endpoint => {
    assert.equal(endpoint, 'update-check', 'automatic invalidation is read-only')
    reads++; return completeCheck(busy ? '正在处理插件更新，请等待完成' : '')
  })
  const a = b.store.subscribe(() => {}), c = b.store.subscribe(() => {})
  try {
    await b.store.refresh(); busy = false
    b.store.invalidateCheck(); await settle()
    assert.equal(b.store.getSnapshot().check.reason, '')
    assert.equal(b.store.getSnapshot().status.phase, 'complete')
    assert.equal(reads, 2); assert.equal(b.timers.size, 0)
  } finally { a(); c(); b.store.dispose() }
})

test('late check cannot restore a busy hint or ticket; repeated invalidations coalesce', async () => {
  let release, reads = 0
  const b = bench(async endpoint => {
    assert.equal(endpoint, 'update-check')
    if (++reads === 1) return new Promise(resolve => { release = resolve })
    return completeCheck('')
  })
  const off = b.store.subscribe(() => {}), stale = b.store.refresh(), seen = []
  const other = b.store.subscribe(() => seen.push(b.store.getSnapshot().check))
  try {
    b.store.invalidateCheck(); b.store.invalidateCheck()
    release({ ...check(), reason: 'old busy hint' }); await stale; await settle()
    assert.equal(reads, 2)
    assert(seen.every(value => !value || value.reason !== 'old busy hint'))
    assert.equal(b.store.getSnapshot().check.reason, '')
    assert.equal(b.store.getSnapshot().check.ticket, '')
  } finally { off(); other(); b.store.dispose() }
})

test('hidden view remembers invalidation until reopened, with no background check loop', async () => {
  let reads = 0
  const b = bench(async endpoint => { assert.equal(endpoint, 'update-check'); reads++; return completeCheck('') })
  const off = b.store.subscribe(() => {}); await b.store.refresh(); off()
  b.store.invalidateCheck(); b.store.invalidateCheck(); await settle()
  assert.equal(reads, 1); assert.equal(b.timers.size, 0)
  const again = b.store.subscribe(() => {})
  await b.store.refresh(); assert.equal(reads, 2)
  again(); b.store.dispose()
})

test('failed revalidation reports unavailable instead of inventing success or retrying forever', async () => {
  let fail = false, reads = 0
  const b = bench(async endpoint => {
    if (endpoint === 'status') return { plugin: { runningVersion: '1.7.12' } }
    assert.equal(endpoint, 'update-check'); reads++
    if (fail) throw Error('offline')
    return completeCheck('busy')
  })
  const off = b.store.subscribe(() => {})
  try {
    await b.store.refresh(); fail = true; b.store.invalidateCheck(); await settle()
    assert.equal(b.store.getSnapshot().check, null)
    assert.match(b.store.getSnapshot().error, /检查未完成/)
    await settle(); assert.equal(reads, 2); assert.equal(b.timers.size, 0)
  } finally { off(); b.store.dispose() }
})

test('disposal fences late check success/failure and never starts a follow-up read', async () => {
  for (const fail of [false, true]) {
    let release, reads = 0
    const b = bench(async endpoint => {
      assert.equal(endpoint, 'update-check'); reads++
      return new Promise((resolve, reject) => { release = () => fail ? reject(Error('offline')) : resolve(check()) })
    })
    const off = b.store.subscribe(() => {}), pending = b.store.refresh()
    b.store.invalidateCheck(); b.store.dispose(); release(); await pending; await settle()
    assert.equal(reads, 1); assert.equal(b.store.getSnapshot().check, null)
    assert.equal(b.timers.size, 0); off()
  }
})

test('companion invalidation waits for an accepted native job, then rechecks without resubmitting', async () => {
  let reads = 0, installs = 0, releaseStart, phase = 'installing'
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') { reads++; return reads === 1 ? check() : completeCheck('') }
    if (endpoint === 'update-start') { installs++; return new Promise(resolve => { releaseStart = resolve }) }
    assert.equal(endpoint, 'update-status'); return { phase }
  })
  const off = b.store.subscribe(() => {})
  try {
    await b.store.refresh(); const starting = b.store.install()
    b.store.invalidateCheck(); releaseStart({ phase }); await starting; await settle()
    assert.equal(reads, 1); assert.equal(installs, 1)
    phase = 'restart-required'; await b.tick(); assert.equal(reads, 1)
    phase = 'complete'; await b.tick(); await settle()
    assert.equal(reads, 2); assert.equal(installs, 1); assert.equal(b.timers.size, 0)
  } finally { off(); b.store.dispose() }
})
