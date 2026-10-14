/** Client-only lifecycle regressions. No real installs or production connections.
 * The retained RC68 integration test is explicit about its optional local artifact;
 * all other cases run from current source and need no compiled lib output.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import ts from 'typescript'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'package.json'))
const storeCode = await build({ entryPoints: [path.join(repo, 'src/client/native-update-store.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' })
const cardCode = await build({ entryPoints: [path.join(repo, 'src/client/NativeUpdateCard.tsx')], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })
const cardModule = { exports: {} }
vm.runInNewContext(cardCode.outputFiles[0].text, { module: cardModule, exports: cardModule.exports, require(id) {
  if (id === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  if (id.endsWith('.css')) return {}
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'NativeModal' }
  throw Error(id)
} })
const OLD = '1.7.14-rc.68', TARGET = '1.7.14-rc.69'
const result = (phase, jobId = 'a'.repeat(32)) => ({ phase, jobId, targetVersion: TARGET, previousVersion: OLD, message: phase })
const offer = () => ({ advice: { label: '插件可更新', targetVersion: TARGET, current: { pluginVersion: OLD, agentVersion: '0.2.1-alpha.3' } },
  status: { phase: 'idle', message: '' }, canInstall: true, ticket: 'a'.repeat(48), channel: 'preview', reason: '' })
const completed = () => ({ ...offer(), status: result('complete'), canInstall: false, ticket: '',
  advice: { ...offer().advice, label: '已是最新版', current: { pluginVersion: TARGET, agentVersion: '0.2.1-alpha.3' } } })
function bench(call) {
  const timers = new Map(); let id = 0
  const module = { exports: {} }
  vm.runInNewContext(storeCode.outputFiles[0].text, { module, exports: module.exports, Error,
    setTimeout: fn => { timers.set(++id, fn); return id }, clearTimeout: key => timers.delete(key) })
  const calls = [], store = new module.exports.NativeUpdateStore(async (...args) => { calls.push(args[0]); return call(...args) })
  return { store, calls, timers, async tick() {
    const next = timers.entries().next().value
    assert(next, 'expected one active status poll')
    timers.delete(next[0]); await next[1]()
  } }
}
function mount(t, b) { const off = b.store.subscribe(() => {}); t.after(() => { off(); b.store.dispose() }) }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
async function until(predicate) { for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve(); assert(predicate()) }
const tree = b => JSON.stringify(cardModule.exports.NativeUpdateCard({ store: b.store }))
const render = b => cardModule.exports.NativeUpdateCard({ store: b.store })
const childrenText = node => Array.isArray(node) ? node.map(childrenText).join('')
  : node && typeof node === 'object' ? childrenText(node.props?.children) : typeof node === 'string' ? node : ''
function nodes(node) {
  return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object'
    ? [node, ...nodes(node.props?.children)] : []
}
const updateButton = b => nodes(render(b)).find(node => node.type === 'button' && childrenText(node) === '更新 Desktop 插件')

test('update guidance is conditional before installation, explicit only when restart is required, and absent after hot completion', () => {
  for (const scope of ['desktop', 'web']) for (const embedded of [false, true]) {
    const checked = offer()
    let snapshot = { check: checked, status: checked.status, checking: false, starting: false, error: null }
    const store = { getSnapshot: () => snapshot }
    const view = () => cardModule.exports.NativeUpdateCard({ store, scope, embedded })
    const before = childrenText(view())
    assert(before.includes('仅更新当前端，保留配对与会话'))
    assert(before.includes('若提示需要重启，再'))
    assert(!before.includes('完成后需'))
    if (scope === 'web') assert(before.includes('刷新网页不能替代服务重启'))
    assert(nodes(view()).some(node => node.type === 'button' && childrenText(node) === `更新 ${scope === 'desktop' ? 'Desktop' : 'Web'} 插件`))

    const pending = result('restart-required')
    snapshot = { ...snapshot, check: { ...checked, status: pending, canInstall: false, ticket: '' }, status: pending }
    const required = childrenText(view())
    assert(!required.includes('若提示需要重启'), 'a confirmed restart requirement must not become tentative')
    assert(required.includes('无需重新配对'))
    assert.match(required, scope === 'desktop' ? /应用.*退出/ : /停止并重新启动 DSH Web 服务/)
    assert(!nodes(view()).some(node => node.type === 'button' && childrenText(node).startsWith('更新 ')))

    const done = completed()
    snapshot = { ...snapshot, check: done, status: done.status }
    const complete = childrenText(view())
    assert(complete.includes('更新已生效'))
    assert(!/重启|重新打开|退出/.test(complete), 'hot completion must not demand a restart')
  }
})

test('confirmed completion rechecks once, updates running snapshot, shares read across views and never resubmits', async t => {
  let reads = 0
  const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : completed()
    : endpoint === 'update-start' ? result('preparing') : result('complete'))
  mount(t, b); const off = b.store.subscribe(() => {}); t.after(off)
  await b.store.refresh(); await b.store.install(); await b.tick()
  assert.equal(reads, 2); assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.store.getSnapshot().check.advice.current.pluginVersion, TARGET)
  assert.equal(b.timers.size, 0); await b.store.install()
  assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
  const remount = b.store.subscribe(() => {}); remount()
  assert.equal(reads, 2, 'complete does not create an automatic check loop on remount')
  assert(tree(b).includes('更新已生效')); assert(!tree(b).includes(`"children":"${OLD}"`))
})

test('failed completion recheck preserves confirmed terminal and rendered runtime, with manual recovery only', async t => {
  let reads = 0, fail = true
  const gate = deferred()
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') { reads++; return reads === 1 ? offer() : fail ? gate.promise : completed() }
    return endpoint === 'update-start' ? result('installing') : result('complete')
  })
  mount(t, b); await b.store.refresh(); await b.store.install()
  const before = b.store.getSnapshot().check, ticking = b.tick()
  await until(() => reads === 2)
  assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert(tree(b).includes(`"children":"${TARGET}"`)); assert(!tree(b).includes(`"children":"${OLD}"`), 'old advice cannot contradict proven runtime')
  await b.store.install(); gate.reject(Error('catalog unavailable')); await ticking
  assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.store.getSnapshot().check, before)
  assert.match(b.store.getSnapshot().error, /更新已生效/)
  assert.equal(b.timers.size, 0); assert.equal(b.calls.includes('status'), false, 'no legacy probe after confirmed success')
  assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
  fail = false; await b.store.refresh()
  assert.equal(reads, 3); assert.equal(b.store.getSnapshot().error, null)
  assert.equal(b.store.getSnapshot().check.advice.current.pluginVersion, TARGET)
})

test('malformed completion advice preserves completion and does not retry automatically', async t => {
  for (const invalid of [{}, { ...completed(), status: { phase: 'invalid' } }]) {
    let reads = 0
    const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : invalid
      : endpoint === 'update-start' ? result('preparing') : result('complete'))
    mount(t, b); await b.store.refresh(); await b.store.install(); await b.tick()
    assert.equal(b.store.getSnapshot().status.phase, 'complete')
    assert.equal(reads, 2); assert.equal(b.timers.size, 0)
    assert.match(b.store.getSnapshot().error, /更新已生效/)
  }
})

test('completion overtaking an older check fences that snapshot and performs one current read', async t => {
  let reads = 0
  const stale = deferred()
  const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : reads === 2 ? stale.promise : completed()
    : endpoint === 'update-start' ? result('installing') : result('complete'))
  mount(t, b); await b.store.refresh(); await b.store.install()
  const checking = b.store.refresh(), ticking = b.tick()
  await until(() => b.store.getSnapshot().status.phase === 'complete')
  stale.resolve({ ...offer(), status: result('installing') })
  await Promise.all([checking, ticking])
  assert.equal(reads, 3); assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.store.getSnapshot().check.advice.current.pluginVersion, TARGET)
  assert.equal(b.timers.size, 0)
})

test('late status poll cannot overwrite a newer explicit check', async t => {
  let reads = 0
  const stale = deferred()
  const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : completed()
    : endpoint === 'update-start' ? result('installing') : stale.promise)
  mount(t, b); await b.store.refresh(); await b.store.install()
  const ticking = b.tick(); await b.store.refresh()
  stale.resolve(result('installing')); await ticking
  assert.equal(b.store.getSnapshot().status.phase, 'complete'); assert.equal(b.timers.size, 0)
  assert.equal(reads, 2)
})

test('disposal fences completion recheck result and failure without further calls', async t => {
  for (const failure of [false, true]) {
    const gate = deferred(); let reads = 0
    const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : gate.promise
      : endpoint === 'update-start' ? result('preparing') : result('complete'))
    mount(t, b); await b.store.refresh(); await b.store.install()
    const ticking = b.tick(); await until(() => reads === 2)
    const last = b.store.getSnapshot(); b.store.dispose()
    if (failure) gate.reject(Error('closed')); else gate.resolve(completed())
    await ticking
    assert.equal(b.store.getSnapshot(), last); assert.equal(b.timers.size, 0)
    assert.equal(reads, 2); assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
  }
})

test('another-tab rejection reads existing job once, then follows it without a second start or popup', async t => {
  let phase = 'installing', reads = 0
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return ++reads === 1 ? offer() : completed()
    if (endpoint === 'update-start') throw Object.assign(Error('another tab started'), { code: 'update/not-started' })
    return result(phase)
  })
  mount(t, b); await b.store.refresh(); await b.store.install()
  assert.equal(b.store.getSnapshot().status.phase, 'installing'); assert.equal(b.timers.size, 1)
  assert.equal(reads, 1, 'recovery does not ask for a fresh confirmation ticket')
  phase = 'restart-required'; await b.tick(); assert.equal(b.store.takeRestartNotice(), undefined)
  phase = 'complete'; await b.tick()
  assert.equal(reads, 2); assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.calls.filter(x => x === 'update-start').length, 1); assert.equal(b.timers.size, 0)
})

test('definite rejection with idle or unreadable status keeps rejection and consumes its ticket', async t => {
  for (const recovery of ['idle', 'network', 'malformed']) {
    const b = bench(async endpoint => {
      if (endpoint === 'update-check') return offer()
      if (endpoint === 'update-start') throw Object.assign(Error('confirmation expired'), { code: 'update/not-started' })
      if (recovery === 'network') throw Error('offline')
      return { phase: recovery, message: recovery }
    })
    mount(t, b); await b.store.refresh(); await b.store.install(); await b.store.install()
    assert.equal(b.store.getSnapshot().status.phase, 'failed')
    assert.equal(b.store.getSnapshot().status.message, 'confirmation expired')
    assert.equal(b.store.getSnapshot().check.canInstall, false)
    assert.equal(b.calls.filter(x => x === 'update-status').length, 1)
    assert.equal(b.calls.filter(x => x === 'update-start').length, 1); assert.equal(b.timers.size, 0)
  }
})

test('lost start reply recovers completion by reads only and refreshes actual version', async t => {
  let reads = 0, phase = 'unknown'
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return ++reads === 1 ? offer() : completed()
    if (endpoint === 'update-start') throw Error('accepted response lost')
    return result(phase)
  })
  mount(t, b); await b.store.refresh(); await b.store.install(); await b.tick()
  assert.equal(b.store.getSnapshot().status.phase, 'unknown')
  phase = 'complete'; await b.tick(); await b.store.install()
  assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.store.getSnapshot().check.advice.current.pluginVersion, TARGET)
  assert.equal(reads, 2); assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
})

test('rejected new attempt cannot borrow an already-known terminal job as its result', async t => {
  for (const phase of ['complete', 'failed']) {
    const previous = result(phase, 'b'.repeat(32)), b = bench(async endpoint => {
      if (endpoint === 'update-check') return { ...offer(), status: previous }
      if (endpoint === 'update-start') throw Object.assign(Error('confirmation expired'), { code: 'update/not-started' })
      return { ...previous }
    })
    mount(t, b); await b.store.refresh(); await b.store.install()
    assert.equal(b.store.getSnapshot().status.phase, 'failed')
    assert.equal(b.store.getSnapshot().status.message, 'confirmation expired')
    assert.equal(b.calls.filter(x => x === 'update-check').length, 1)
    assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
    assert.equal(b.timers.size, 0)
  }
})

test('rejected attempt follows a newly confirmed different job, not a freshly issued ticket', async t => {
  let reads = 0
  const previous = result('complete', 'b'.repeat(32)), b = bench(async endpoint => {
    if (endpoint === 'update-check') return ++reads === 1 ? { ...offer(), status: previous } : completed()
    if (endpoint === 'update-start') throw Object.assign(Error('another tab finished'), { code: 'update/not-started' })
    return result('complete')
  })
  mount(t, b); await b.store.refresh(); await b.store.install()
  assert.equal(b.store.getSnapshot().status.phase, 'complete')
  assert.equal(b.store.getSnapshot().status.jobId, 'a'.repeat(32))
  assert.equal(reads, 2, 'one snapshot read after the new confirmed completion')
  assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
  assert.equal(b.timers.size, 0)
})

test('direct completed start reply only refreshes a mounted page and never resubmits', async t => {
  let reads = 0
  const b = bench(async endpoint => endpoint === 'update-check' ? ++reads === 1 ? offer() : completed() : result('complete'))
  mount(t, b); await b.store.refresh(); await b.store.install()
  assert.equal(reads, 2); assert.equal(b.timers.size, 0)
  assert.equal(b.calls.filter(x => x === 'update-start').length, 1)
})

test('manual check failure after a confirmed completed snapshot preserves known success', async t => {
  let reads = 0
  const b = bench(async endpoint => { assert.equal(endpoint, 'update-check'); if (++reads === 1) return completed(); throw Error('offline') })
  mount(t, b); await b.store.refresh(); const before = b.store.getSnapshot()
  await b.store.refresh()
  assert.equal(b.store.getSnapshot().status, before.status); assert.equal(b.store.getSnapshot().check, before.check)
  assert.match(b.store.getSnapshot().error, /更新已生效/); assert.equal(reads, 2); assert.equal(b.timers.size, 0)
})

test('native failed/cancelled receipts are terminal even from an older unknown-phase provider', async t => {
  for (const application of ['failed', 'cancelled']) for (const changed of [true, false, undefined]) {
    let reads = 0
    const terminal = { ...result('unknown'), message: '原生启用失败；未自动回退，请核对。', nativeResult: { application, changed } }
    const b = bench(async endpoint => {
      if (endpoint === 'update-check') { reads++; return offer() }
      return endpoint === 'update-start' ? result('installing') : terminal
    })
    mount(t, b); await b.store.refresh(); await b.store.install(); await b.tick()
    const snapshot = b.store.getSnapshot()
    assert.equal(snapshot.status.phase, 'failed')
    assert.equal(snapshot.status.message, terminal.message)
    assert.equal(snapshot.status.nativeResult.changed, changed)
    assert.equal(b.timers.size, 0); assert.equal(reads, 1, 'failure does not acquire a new ticket')
    assert.equal(b.store.takeRestartNotice(), undefined)
    assert.equal(updateButton(b), undefined)
    assert(childrenText(render(b)).includes('更新未完成'))
    assert(childrenText(render(b)).includes(terminal.message))
    assert(!childrenText(render(b)).includes('更新已生效'))
    assert.equal(nodes(render(b)).some(node => node.type === 'progress'), false)
    await b.store.install()
    assert.equal(b.calls.filter(endpoint => endpoint === 'update-start').length, 1)
  }
})

test('initial terminal receipt cancels pending polling and only a new explicit check exposes the next update action', async t => {
  const terminal = { ...result('unknown'), message: '安装文件已经改变，启用失败；未回退。', nativeResult: { application: 'failed', changed: true } }
  let reads = 0
  const submitted = deferred()
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return ++reads === 1
      ? { ...offer(), status: result('unknown'), canInstall: false, ticket: '' }
      : { ...offer(), status: terminal, advice: { ...offer().advice, targetVersion: '1.7.14-rc.70' } }
    if (endpoint === 'update-start') return submitted.promise
    assert.fail('new definitive check must cancel the old pending timer')
  })
  mount(t, b); await b.store.refresh(); assert.equal(b.timers.size, 1)
  await b.store.refresh()
  assert.equal(b.store.getSnapshot().status.phase, 'failed'); assert.equal(b.timers.size, 0)
  const button = updateButton(b)
  assert(button); assert.equal(button.props.disabled, false)
  assert(childrenText(render(b)).includes(terminal.message))
  assert(childrenText(render(b)).includes('1.7.14-rc.70'))
  assert.equal(b.calls.includes('update-start'), false)
  button.props.onClick(); button.props.onClick()
  assert.equal(b.calls.filter(endpoint => endpoint === 'update-start').length, 1, 'repeated clicks cannot resubmit')
  assert.equal(b.store.getSnapshot().starting, true); assert.equal(updateButton(b), undefined)
  submitted.resolve({ ...result('preparing', 'c'.repeat(32)), targetVersion: '1.7.14-rc.70' })
  await until(() => !b.store.getSnapshot().starting)
  assert.equal(b.store.getSnapshot().status.phase, 'preparing'); assert.equal(b.timers.size, 1)
  await b.store.install(); assert.equal(b.calls.filter(endpoint => endpoint === 'update-start').length, 1)
})

test('unconfirmed old job remains unknown, but a fresh backend-approved different release is an explicit user action', async t => {
  let reads = 0
  const unknown = { ...result('unknown'), message: '旧更新结果未确认；未重复安装。' }
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return { ...offer(), status: { ...unknown }, canInstall: ++reads > 1,
      ticket: reads > 1 ? 'c'.repeat(48) : '', advice: { ...offer().advice, targetVersion: '1.7.14-rc.70' } }
    if (endpoint === 'update-start') return { ...result('preparing', 'c'.repeat(32)), targetVersion: '1.7.14-rc.70' }
    assert.fail('a fresh explicitly allowed check needs no polling of the old unknown result')
  })
  mount(t, b); await b.store.refresh()
  assert.equal(updateButton(b), undefined); assert.equal(b.timers.size, 1)
  await b.store.refresh()
  assert.equal(b.store.getSnapshot().status.phase, 'unknown', 'permission to start a new release is not old-job success')
  assert.equal(b.timers.size, 0); assert.equal(b.calls.includes('update-start'), false)
  assert(childrenText(render(b)).includes(unknown.message)); assert(childrenText(render(b)).includes('更新结果待核对'))
  const button = updateButton(b); assert(button); assert.equal(button.props.disabled, false)
  button.props.onClick(); await until(() => !b.store.getSnapshot().starting)
  assert.equal(b.calls.filter(endpoint => endpoint === 'update-start').length, 1)
  assert.equal(b.store.getSnapshot().status.jobId, 'c'.repeat(32))
})

test('a checked active native installation never exposes or admits a second start even if advice is stale', async t => {
  for (const phase of ['preparing', 'installing', 'restart-required']) {
    const b = bench(async endpoint => { assert.equal(endpoint, 'update-check'); return { ...offer(), status: result(phase) } })
    mount(t, b); await b.store.refresh(); await b.store.install()
    assert.equal(updateButton(b), undefined)
    assert.equal(b.calls.includes('update-start'), false)
  }
})

test('failure receipt returned directly from start is terminal and never produces restart or success UI', async t => {
  const terminal = { ...result('unknown'), message: '取消了安装，文件已改变。', nativeResult: { application: 'cancelled', changed: true } }
  const b = bench(async endpoint => endpoint === 'update-check' ? offer() : terminal)
  mount(t, b); await b.store.refresh(); await b.store.install()
  assert.equal(b.store.getSnapshot().status.phase, 'failed'); assert.equal(b.timers.size, 0)
  assert.equal(b.store.takeRestartNotice(), undefined)
  assert.equal(b.calls.filter(endpoint => endpoint === 'update-check').length, 1)
  assert(childrenText(render(b)).includes(terminal.message))
})

test('finishing an old poll cannot clear or duplicate a newly submitted job polling timer', async t => {
  let reads = 0, starts = 0, clicked = false
  const nextOffer = { ...completed(), canInstall: true, ticket: 'c'.repeat(48),
    advice: { ...completed().advice, targetVersion: '1.7.14-rc.70' } }
  const b = bench(async endpoint => {
    if (endpoint === 'update-check') return ++reads === 1 ? offer() : nextOffer
    if (endpoint === 'update-start') return ++starts === 1 ? result('installing') : result('preparing', 'c'.repeat(32))
    return result('complete')
  })
  mount(t, b); await b.store.refresh(); await b.store.install()
  const off = b.store.subscribe(() => {
    if (!clicked && !b.store.getSnapshot().checking && b.store.getSnapshot().check?.ticket === 'c'.repeat(48)) {
      clicked = true; updateButton(b).props.onClick()
    }
  })
  t.after(off)
  await b.tick(); await until(() => !b.store.getSnapshot().starting)
  assert.equal(starts, 2, 'two deliberately clicked distinct releases, not a retry')
  assert.equal(b.timers.size, 1)
  assert.equal(b.store.getSnapshot().status.jobId, 'c'.repeat(32))
})

const archive = process.env.HARNESS_RC68_UPDATE_ARCHIVE || path.join(repo, '../backups/native-scheduled-ui-20261014-rc50/harness-remote-dsh-wechat-remote-1.7.14-rc.68.tgz')
test('actual retained RC68 service/handler plus NEW client: two tabs and lost start acknowledgement recover without repeated installation',
  { skip: !fs.existsSync(archive) && 'set HARNESS_RC68_UPDATE_ARCHIVE to the retained verified RC68 core package' }, async t => {
    const bytes = fs.readFileSync(archive)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), 'a5e8b858a927a255604c9501e89a79dd3d7e5d968077de49f6b9bd1eb617fab8')
    const files = new Map(), tar = gunzipSync(bytes)
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512), name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
      if (!name) break
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0
      files.set(name, tar.subarray(offset + 512, offset + 512 + size).toString()); offset += 512 + Math.ceil(size / 512) * 512
    }
    assert.equal(JSON.parse(files.get('package/package.json')).version, OLD)
    const cache = new Map()
    function load(file) {
      if (cache.has(file)) return cache.get(file)
      if (file.endsWith('/update-download.js')) return { auditArchive: () => assert.fail('no archive operation'), downloadRelease: () => assert.fail('no network') }
      assert(files.has(file), file)
      const module = { exports: {} }, output = ts.transpileModule(files.get(file), { fileName: file,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
      vm.runInNewContext(output, { module, exports: module.exports, Error, AbortController, AbortSignal,
        structuredClone, URL, Buffer, process, setTimeout, clearTimeout, fetch: () => assert.fail('no network'),
        require: id => id.startsWith('./') ? load(path.posix.join(path.posix.dirname(file), id)) : require(id) })
      cache.set(file, module.exports); return module.exports
    }
    const { NativeUpdateService } = load('package/lib/native-update-service.js'), { createPairingHandler } = load('package/lib/pairing-management.js')
    for (const loseReply of [false, true]) await t.test(`lost first reply: ${loseReply}`, async t => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-client-recovery-regression-'))
      let version = OLD, runtime = OLD, installs = 0, handler
      const outcome = deferred(), services = []
      const manager = { listBundles: async () => [{ name: 'dsh-wechat-remote', installed: true, enabled: true, version }],
        installBundle: async () => { installs++; await outcome.promise; version = TARGET; return { application: 'restart-required', bundle: 'dsh-wechat-remote' } } }
      const service = runningVersion => {
        const instance = new NativeUpdateService({ home, scope: 'desktop', runningVersion, manager: () => manager,
          sessions: () => ({ list: async () => ({ items: [] }) }), release: async () => ({ ...offer(),
            advice: { ...offer().advice, revision: 'fixture', component: 'plugin', current: { pluginVersion: runtime } },
            release: { version: TARGET, channel: 'preview', dsh: [], platforms: [], architectures: [],
              npmInstaller: { version: TARGET, url: `https://registry.npmjs.org/dsh-wechat-remote/-/dsh-wechat-remote-${TARGET}.tgz`, sha256: 'a'.repeat(64), bytes: 100 } } }) })
        services.push(instance); return instance
      }
      let host = service(OLD)
      const route = () => { handler?.stop(); handler = createPairingHandler({ unavailable: () => false, status: () => ({ plugin: {} }),
        pairCode: async () => ({}), updateCheck: host.check, updateStart: host.start, updateStatus: host.status }) }
      route()
      t.after(() => { handler.stop(); for (const item of services) item.dispose()
        assert.equal(path.dirname(path.resolve(home)), path.resolve(os.tmpdir())); assert(path.basename(home).startsWith('dsh-client-recovery-regression-'))
        fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
      const call = lose => async (endpoint, payload = {}) => {
        const response = await handler.call(endpoint, payload, new AbortController().signal)
        if (!response.ok) throw Object.assign(Error(response.error.message), { code: response.error.code })
        if (lose && endpoint === 'update-start') throw Error('accepted response lost')
        return JSON.parse(JSON.stringify(response.value))
      }
      const a = bench(call(loseReply)), b = bench(call(false)); mount(t, a); mount(t, b)
      await Promise.all([a.store.refresh(), b.store.refresh()]); await Promise.all([a.store.install(), b.store.install()])
      await until(() => installs === 1)
      assert(['preparing', 'unknown'].includes(a.store.getSnapshot().status.phase))
      assert(['preparing', 'installing'].includes(b.store.getSnapshot().status.phase), 'rejected tab recovers actual RC68 in-flight job')
      await b.tick(); assert.equal(b.store.getSnapshot().status.phase, 'installing')
      outcome.resolve(); await until(() => !host.isBusy())
      await Promise.all([a.tick(), b.tick()]); assert.equal(b.store.getSnapshot().status.phase, 'restart-required')
      host.dispose(); runtime = TARGET; host = service(TARGET); route()
      await Promise.all([a.tick(), b.tick()])
      for (const ui of [a, b]) {
        assert.equal(ui.store.getSnapshot().status.phase, 'complete')
        assert.equal(ui.store.getSnapshot().check.advice.current.pluginVersion, TARGET)
        assert.equal(ui.timers.size, 0); assert.equal(ui.calls.filter(x => x === 'update-start').length, 1)
      }
      assert.equal(installs, 1)
    })
  })
