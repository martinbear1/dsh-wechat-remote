/** Actual store and TSX with local deterministic RPC/hooks; no account, DSH profile or network. */
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const storeBuild = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/my-resources-store.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22',
})
const { MyResourcesStore, resourceKey, isResourceUpdate } = await import('data:text/javascript;base64,' + Buffer.from(storeBuild.outputFiles[0].text).toString('base64'))
const panelBuild = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/MyResourcesPanel.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'css-fixture', setup(api) {
    api.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
  } }],
})
const clean = value => JSON.parse(JSON.stringify(value))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const item = (extra = {}) => ({ resourceId: 'story', version: '1.2.0', name: '故事伙伴', description: '陪伴式故事预设', state: 'available', ...extra })
const state = (items = [item()], extra = {}) => ({ supported: true, items, ...extra })
const ok = value => ({ ok: true, value })
const fail = code => ({ ok: false, error: { code, message: 'raw provider /private/secrets/account.json failure' } })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
test('update label uses exact SemVer precedence and requires an older installed version of the same resource', () => {
  for (const [older, newer] of [
    ['1.9.0', '1.10.0'], ['1.0.0-alpha', '1.0.0-alpha.1'], ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'], ['1.0.0-rc.1', '1.0.0'], ['1.0.0', '2.0.0-rc.1'],
    ['999999999999999999.1.0', '1000000000000000000.0.0'],
  ]) {
    assert(isResourceUpdate(item({ version: newer }), [item({ version: older, state: 'installed' })]))
    assert(!isResourceUpdate(item({ version: older }), [item({ version: newer, state: 'installed' })]))
  }
  for (const old of [item(), item({ resourceId: 'other', version: '1.0.0', state: 'installed' }), item({ state: 'installed' })])
    assert(!isResourceUpdate(item(), [old]))
  for (const bad of ['1.0.0-01', '1.0', '01.0.0', '1.0.0+build', '*'])
    assert(!isResourceUpdate(item({ version: '2.0.0' }), [item({ version: bad, state: 'installed' })]))
})
function storeFixture() {
  const calls = []
  const store = new MyResourcesStore(request => {
    const reply = deferred(); calls.push({ request, ...reply }); return reply.promise
  })
  return { store, calls, async load(value = state()) {
    const pending = store.load(); await flush(); calls.at(-1).resolve(ok(value)); await pending
  } }
}

test('store construction/subscription do no IO; first load is local status and cloud refresh is explicit', async () => {
  const f = storeFixture(); const unsubscribe = f.store.subscribe(() => {})
  await flush(); assert.equal(f.calls.length, 0)
  await f.load(); assert.deepEqual(f.calls.map(c => c.request), [{ op: 'status' }])
  await flush(); assert.equal(f.calls.length, 1)
  const pending = f.store.refresh(); await flush()
  assert.deepEqual(f.calls[1].request, { op: 'refresh' })
  f.calls[1].resolve(ok(state())); await pending
  assert.equal(f.calls.length, 2, 'loading and refreshing a catalog must never install')
  unsubscribe(); f.store.dispose()
})

test('all foreground requests are singleflight, including reentrant busy-state subscriptions', async () => {
  const f = storeFixture(); let reentrant
  f.store.subscribe(() => { if (f.store.getSnapshot().busy) reentrant = f.store.refresh() })
  const first = f.store.load(); assert.equal(reentrant, first)
  assert.equal(f.store.refresh(), first)
  await flush(); assert.equal(f.calls.length, 1)
  f.calls[0].resolve(ok(state([item(), item({ resourceId: 'other', name: '另一资源' })]))); await first
  const install = f.store.install('story', '1.2.0')
  assert.equal(f.store.install('story', '1.2.0'), install)
  assert.equal(f.store.install('other', '1.2.0'), install)
  assert.equal(f.store.refresh(), install)
  await flush(); assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls[1].request, { op: 'install', resourceId: 'story', version: '1.2.0' })
  f.calls[1].resolve(ok(state([item({ state: 'installed', installedVersion: '1.2.0' })]))); await install
  assert.equal(f.store.getSnapshot().data.items[0].state, 'installed')
  assert.equal(f.store.getSnapshot().busy, false)
  f.store.dispose()
})

test('install only targets a known exact version and never runs for installed, pending or unsupported items', async () => {
  for (const [value, resourceId, version] of [
    [state(), 'unknown', '1.2.0'], [state(), 'story', '1.1.0'],
    [state([item({ state: 'installed' })]), 'story', '1.2.0'],
    [state([item({ state: 'installing' })]), 'story', '1.2.0'],
    [state([item()], { supported: false }), 'story', '1.2.0'],
  ]) {
    const f = storeFixture(); await f.load(value)
    await f.store.install(resourceId, version); assert.equal(f.calls.length, 1)
    f.store.dispose()
  }
})

test('failed refresh preserves native installed facts and maps errors without displaying paths', async () => {
  for (const failure of [fail('resources-network'), fail('__proto__'), new Error('raw /private/account/token')]) {
    const f = storeFixture(); await f.load(state([item({ state: 'installed', installedVersion: '1.2.0' })]))
    const before = f.store.getSnapshot().data
    const pending = f.store.refresh(); await flush()
    if (failure instanceof Error) f.calls[1].reject(failure); else f.calls[1].resolve(failure)
    await pending
    assert.equal(f.store.getSnapshot().data, before)
    assert.equal(f.store.getSnapshot().data.items[0].state, 'installed')
    assert.equal(typeof f.store.getSnapshot().error, 'string')
    assert(!/raw|private|account|token/.test(f.store.getSnapshot().error))
    assert(f.store.getSnapshot().error); assert.equal(f.store.getSnapshot().busy, false)
    f.store.dispose()
  }
})

test('confirmed identity change drops stale delivery catalog without removing local installations', async () => {
  for (const code of ['resources-unbound', 'resources-forbidden', 'resources-closed']) {
    const f = storeFixture(); await f.load(state([
      item({ version: '1.0.0', state: 'installed', enabled: false }),
      item({ version: '1.1.0', state: 'unavailable', presetId: 'native-local', message: '本地资源暂不可用' }), item(),
    ]))
    const pending = f.store.refresh(); await flush(); f.calls[1].resolve(fail(code)); await pending
    assert.deepEqual(f.store.getSnapshot().data.items.map(i => i.version), ['1.0.0', '1.1.0'])
    assert.equal(f.calls.length, 2, 'identity handling must not trigger another status request')
    await f.store.install('story', '1.2.0'); assert.equal(f.calls.length, 2)
    f.store.dispose()
  }
})

test('installation denial clears delivery cards and retains installed or locally unavailable resources', async () => {
  for (const code of ['resources-unbound', 'resources-forbidden', 'resources-closed']) {
    const local = [item({ version: '0.9.0', state: 'installed', enabled: false }),
      item({ version: '1.0.0', state: 'unavailable', presetId: 'local-preset' }),
      item({ version: '1.1.0', state: 'unavailable', enabled: true })]
    const f = storeFixture(); await f.load(state([...local, item(), item({ resourceId: 'other' })]))
    const pending = f.store.install('story', '1.2.0'); await flush(); f.calls[1].resolve(fail(code)); await pending
    assert.deepEqual(f.store.getSnapshot().data.items, local)
    assert(f.store.getSnapshot().error, 'denied card removal must keep the explanation visible')
    assert.deepEqual(f.store.getSnapshot().itemErrors, {})
    await f.store.install('story', '1.2.0'); assert.equal(f.calls.length, 2)
    f.store.dispose()
  }
})

test('download acknowledgements, malformed data and still-available replies are not native install success', async () => {
  for (const reply of [ok({ downloaded: true }), ok(state()), ok(state([item({ resourceId: 'other' })]))]) {
    const f = storeFixture(); await f.load()
    const pending = f.store.install('story', '1.2.0'); await flush(); f.calls[1].resolve(reply); await pending
    assert(!f.store.getSnapshot().data.items.some(i => i.resourceId === 'story' && i.state === 'installed'))
    assert(f.store.getSnapshot().itemErrors[resourceKey('story', '1.2.0')])
    f.store.dispose()
  }
})

test('install failure preserves the old installed version and retry is a new explicit action', async () => {
  const f = storeFixture(); await f.load(state([item({ installedVersion: '1.1.0' })]))
  let pending = f.store.install('story', '1.2.0'); await flush(); f.calls[1].resolve(fail('resources-install-failed')); await pending
  assert.equal(f.store.getSnapshot().data.items[0].installedVersion, '1.1.0')
  assert.equal(f.store.getSnapshot().itemErrors[resourceKey('story', '1.2.0')], '安装未完成，请重试。')
  await flush(); assert.equal(f.calls.length, 2)
  pending = f.store.install('story', '1.2.0'); await flush()
  assert.equal(f.store.getSnapshot().itemErrors[resourceKey('story', '1.2.0')], undefined)
  f.calls[2].resolve(ok(state([item({ state: 'installed', installedVersion: '1.2.0' })]))); await pending
  assert.deepEqual(f.store.getSnapshot().itemErrors, {})
  assert.equal(f.store.getSnapshot().data.items[0].installedVersion, '1.2.0')
  f.store.dispose()
})

test('native activation controls one installed version only, without optimistic state or implicit reinstallation', async () => {
  const old = item({ version: '1.1.0', state: 'installed', enabled: true })
  const latest = item({ state: 'installed', enabled: false })
  const f = storeFixture(); await f.load(state([old, latest]))
  const pending = f.store.setEnabled('story', '1.1.0', false)
  assert.equal(f.store.getSnapshot().toggling, 'story@1.1.0')
  assert.equal(f.store.getSnapshot().data.items[0].enabled, true, 'actual state changes only after native result')
  assert.equal(f.store.setEnabled('story', '1.2.0', true), pending)
  await flush(); assert.deepEqual(f.calls[1].request, { op: 'setEnabled', resourceId: 'story', version: '1.1.0', enabled: false })
  f.calls[1].resolve(ok(state([{ ...old, enabled: false }, latest]))); await pending
  assert.deepEqual(f.store.getSnapshot().data.items.map(i => i.enabled), [false, false])
  assert.equal(f.store.getSnapshot().toggling, null)
  assert.deepEqual(f.store.getSnapshot().itemErrors, {})
  await f.store.setEnabled('story', '1.1.0', false); await f.store.setEnabled('story', '0.9.0', true)
  assert.equal(f.calls.length, 2)
  f.store.dispose()
})

test('unconfirmed toggle result is not presented as success; failures remain scoped to the exact version', async () => {
  const f = storeFixture(); const value = state([
    item({ version: '1.1.0', state: 'installed', enabled: false }), item({ state: 'installed', enabled: true }),
  ])
  await f.load(value)
  let pending = f.store.setEnabled('story', '1.1.0', true); await flush(); f.calls[1].resolve(ok(value)); await pending
  assert.equal(f.store.getSnapshot().data.items[0].enabled, false)
  assert.equal(f.store.getSnapshot().itemErrors['story@1.1.0'], '启停结果尚未确认，请刷新后查看。')
  assert.equal(f.store.getSnapshot().itemErrors['story@1.2.0'], undefined)
  pending = f.store.setEnabled('story', '1.1.0', true); await flush(); f.calls[2].reject(new Error('native /private/path')); await pending
  assert.equal(f.store.getSnapshot().itemErrors['story@1.1.0'], '暂时无法确认启停结果，请刷新后查看。')
  assert.equal(f.store.getSnapshot().data.items[1].enabled, true)
  f.store.dispose()
})

test('unknown activation state, available items and unsupported host never send activation commands', async () => {
  for (const value of [state([item()]), state([item({ state: 'installed' })]), state([item({ state: 'installed', enabled: false })], { supported: false })]) {
    const f = storeFixture(); await f.load(value); await f.store.setEnabled('story', '1.2.0', true)
    assert.equal(f.calls.length, 1); f.store.dispose()
  }
})

test('unavailable local activation can retry the same true intent or stop without redownloading', async () => {
  for (const enabled of [true, false]) {
    const local = item({ state: 'unavailable', presetId: 'local-preset', enabled: true, message: '基础模式暂不可用。' })
    const f = storeFixture(); await f.load(state([local]))
    await f.store.install('story', '1.2.0'); assert.equal(f.calls.length, 1, 'local activation retry is never a new download')
    const pending = f.store.setEnabled('story', '1.2.0', enabled); await flush()
    assert.deepEqual(f.calls[1].request, { op: 'setEnabled', resourceId: 'story', version: '1.2.0', enabled })
    f.calls[1].resolve(ok(state([{ ...local, state: 'installed', enabled, message: undefined }]))); await pending
    assert.equal(f.store.getSnapshot().data.items[0].enabled, enabled)
    assert.deepEqual(f.store.getSnapshot().itemErrors, {})
    f.store.dispose()
  }
})

test('dispose cancels queued invocation and ignores late results without waking subscribers', async () => {
  const queued = storeFixture(); const q = queued.store.load(); queued.store.dispose(); await q
  assert.equal(queued.calls.length, 0)
  const f = storeFixture(); let notifications = 0
  f.store.subscribe(() => notifications++)
  const pending = f.store.load(); await flush(); const before = f.store.getSnapshot()
  f.store.dispose(); const count = notifications
  f.calls[0].resolve(ok(state())); await pending
  assert.equal(notifications, count); assert.equal(f.store.getSnapshot(), before)
  await f.store.refresh(); assert.equal(f.calls.length, 1)
})

function panelHarness() {
  const cells = [], calls = []
  let cursor = 0, dirty = false, tree, effects = [], disposed = false, owner = 0
  const makeCall = owner => request => {
    const reply = deferred(); calls.push({ owner, request: clean(request), ...reply }); return reply.promise
  }
  let call = makeCall(owner)
  const react = {
    useState(initial) {
      const index = cursor++
      if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, next => {
        assert(!disposed, 'late response changed unmounted state')
        cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; dirty = true
      }]
    },
    useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial } },
    useEffect(effect, deps) {
      const index = cursor++, previous = cells[index]
      if (!previous || deps.some((v, i) => !Object.is(v, previous.deps?.[i]))) {
        const cell = cells[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { cell.cleanup?.(); cell.cleanup = effect() })
      }
    },
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  const module = { exports: {} }
  vm.runInNewContext(panelBuild.outputFiles[0].text, {
    module, exports: module.exports,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return jsx; assert.fail('unexpected dependency: ' + name) },
    setInterval() { assert.fail('resource panel must not poll') }, setTimeout() { assert.fail('resource panel must not schedule background work') },
  })
  function render() {
    assert(!disposed); cursor = 0; dirty = false
    tree = module.exports.MyResourcesPanel({ call, nodeName: 'DeepSeek Harness', hostName: '测试节点' })
    const pending = effects; effects = []; pending.forEach(effect => effect())
  }
  function nodes(value = tree) {
    if (Array.isArray(value)) return value.flatMap(node => nodes(node ?? null))
    return value && typeof value === 'object' ? [value, ...nodes(value.props?.children ?? null)] : []
  }
  function text(value = tree) {
    if (Array.isArray(value)) return value.map(node => text(node ?? null)).join('')
    if (value == null || typeof value === 'boolean') return ''
    return typeof value === 'object' ? text(value.props?.children ?? null) : String(value)
  }
  function button(label) {
    const found = nodes().filter(n => n.type === 'button' && (n.props['aria-label'] || text(n)) === label)
    assert.equal(found.length, 1, 'expected one button: ' + label); return found[0]
  }
  async function flushPanel() { for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty && !disposed) render() } }
  render()
  return {
    calls, text, button, nodes, flush: flushPanel,
    async click(label) { const node = button(label); assert(!node.props.disabled); node.props.onClick(); await flushPanel() },
    async resolve(index, reply) { calls[index].resolve(reply); await flushPanel() },
    async reject(index, error) { calls[index].reject(error); await flushPanel() },
    async replaceCall() { call = makeCall(++owner); render(); await flushPanel() },
    unmount() { cells.forEach(cell => cell?.cleanup?.()); disposed = true },
  }
}
async function mounted(value = state()) {
  const h = panelHarness(); await h.flush()
  assert.deepEqual(h.calls.map(c => c.request), [{ op: 'status' }])
  await h.resolve(0, ok(value)); return h
}

test('panel mounts with local status only; catalog refresh and installation each require a click', async () => {
  const h = await mounted(state([])); assert(h.text().includes('点击刷新查看已购资源'))
  await h.flush(); assert.equal(h.calls.length, 1)
  await h.click('刷新'); assert.deepEqual(h.calls[1].request, { op: 'refresh' })
  await h.resolve(1, ok(state())); assert(h.text().includes('故事伙伴'))
  await h.flush(); assert.equal(h.calls.length, 2)
  await h.click('安装 故事伙伴 v1.2.0')
  assert.deepEqual(h.calls[2].request, { op: 'install', resourceId: 'story', version: '1.2.0' })
  assert(h.button('安装中… 故事伙伴 v1.2.0').props.disabled)
  await h.resolve(2, ok(state([item({ state: 'installed', installedVersion: '1.2.0' })])))
  assert(h.button('已安装 故事伙伴 v1.2.0').props.disabled)
  await h.flush(); assert.equal(h.calls.length, 3); h.unmount()
})

test('an unsuccessful or pending catalog read is not displayed as an empty resource catalog', async () => {
  const h = await mounted(state([]))
  assert(h.text().includes('暂无资源'))
  await h.click('刷新')
  assert(!h.text().includes('暂无资源'))
  await h.resolve(1, fail('resources-unavailable'))
  assert(h.text().includes('资源服务暂未就绪'))
  assert(!h.text().includes('暂无资源'))
  await h.click('刷新')
  await h.resolve(2, ok(state()))
  assert(h.text().includes('故事伙伴'))
  assert(!h.text().includes('资源服务暂未就绪'))
  h.unmount()
})

test('panel keeps each installed old version manageable beside the authorized new version', async () => {
  const old = item({ version: '1.1.0', state: 'installed', enabled: true })
  const h = await mounted(state([old, item()]))
  assert(h.text().includes('v1.1.0')); assert(h.text().includes('v1.2.0')); assert(h.text().includes('已启用'))
  assert(!h.button('停用 故事伙伴 v1.1.0').props.disabled)
  await h.click('更新 故事伙伴 v1.2.0'); await h.resolve(1, fail('resources-install-failed'))
  assert(h.text().includes('安装未完成，请重试。')); assert(!h.button('停用 故事伙伴 v1.1.0').props.disabled)
  assert(!h.text().includes('/private')); await h.click('重试 故事伙伴 v1.2.0')
  await h.resolve(2, ok(state([old, item({ state: 'installed', enabled: false })])))
  assert(!h.button('启用 故事伙伴 v1.2.0').props.disabled)
  assert(!h.button('停用 故事伙伴 v1.1.0').props.disabled); h.unmount()
})

test('installed activation buttons use exact versions and never install or switch a session', async () => {
  const old = item({ version: '1.1.0', state: 'installed', enabled: true })
  const newer = item({ state: 'installed', enabled: false })
  const h = await mounted(state([old, newer]))
  assert(h.text().includes('已启用')); assert(h.text().includes('已停用'))
  await h.click('停用 故事伙伴 v1.1.0')
  assert.deepEqual(h.calls[1].request, { op: 'setEnabled', resourceId: 'story', version: '1.1.0', enabled: false })
  assert(h.button('处理中… 故事伙伴 v1.1.0').props.disabled)
  assert(h.button('启用 故事伙伴 v1.2.0').props.disabled)
  await h.resolve(1, ok(state([{ ...old, enabled: false }, newer])))
  await h.click('启用 故事伙伴 v1.2.0')
  assert.deepEqual(h.calls[2].request, { op: 'setEnabled', resourceId: 'story', version: '1.2.0', enabled: true })
  await h.resolve(2, ok(state([{ ...old, enabled: false }, { ...newer, enabled: true }])))
  assert(!h.button('启用 故事伙伴 v1.1.0').props.disabled); assert(!h.button('停用 故事伙伴 v1.2.0').props.disabled)
  assert.equal(h.calls.length, 3); h.unmount()
})

test('panel displays unavailable native host, unbound account and temporary cloud errors in Chinese', async () => {
  const unsupported = await mounted(state([item()], { supported: false }))
  assert(unsupported.text().includes('当前 DSH 暂不支持安装资源'))
  assert(unsupported.button('安装 故事伙伴 v1.2.0').props.disabled); assert(!unsupported.button('刷新').props.disabled)
  unsupported.unmount()
  for (const [code, expected] of [
    ['resources-unbound', '请先在小程序中绑定当前节点'],
    ['resources-unavailable', '资源服务暂未就绪'],
    ['resources-network', '已安装资源不受影响'],
    ['resources-closed', '当前节点已变化'],
  ]) {
    const h = panelHarness(); await h.flush(); await h.resolve(0, fail(code))
    assert(h.text().includes(expected)); assert(!h.text().includes('raw provider')); assert(!h.button('刷新').props.disabled)
    h.unmount()
  }
})

test('panel refresh failure leaves installed resources visible; unavailable resource offers explicit retry', async () => {
  const h = await mounted(state([item({ state: 'installed' }), item({ resourceId: 'second', name: '另一个资源', state: 'unavailable', message: '安装未完成，请重试。' })]))
  await h.click('刷新'); await h.reject(1, new Error('/private/secret/request'))
  assert(h.button('已安装 故事伙伴 v1.2.0').props.disabled)
  assert(!h.button('重试 另一个资源 v1.2.0').props.disabled); assert(!h.text().includes('/private'))
  assert.equal(h.calls.length, 2); h.unmount()
})

test('unavailable local resource shows retry activation and stop, then ordinary enable after stopping', async () => {
  const local = item({ state: 'unavailable', presetId: 'local-preset', enabled: true, message: '基础模式暂不可用。' })
  const h = await mounted(state([local]))
  assert(h.text().includes('启用未完成')); assert(!h.text().includes('已启用'))
  assert(!h.button('重试启用 故事伙伴 v1.2.0').props.disabled)
  await h.click('重试启用 故事伙伴 v1.2.0')
  assert.deepEqual(h.calls[1].request, { op: 'setEnabled', resourceId: 'story', version: '1.2.0', enabled: true })
  await h.resolve(1, ok(state([local])))
  assert(h.text().includes('基础模式暂不可用。'), 'keep the backend-owned actionable native failure, not a generic unknown-result warning')
  await h.click('停用 故事伙伴 v1.2.0')
  assert.deepEqual(h.calls[2].request, { op: 'setEnabled', resourceId: 'story', version: '1.2.0', enabled: false })
  await h.resolve(2, ok(state([{ ...local, state: 'installed', enabled: false, message: undefined }])))
  assert(h.text().includes('已停用')); assert(!h.text().includes('重试启用'))
  await h.click('启用 故事伙伴 v1.2.0')
  assert.deepEqual(h.calls[3].request, { op: 'setEnabled', resourceId: 'story', version: '1.2.0', enabled: true })
  await h.resolve(3, ok(state([{ ...local, state: 'installed', enabled: true, message: undefined }])))
  assert(h.text().includes('已启用')); assert.deepEqual(h.calls.map(call => call.request.op), ['status', 'setEnabled', 'setEnabled', 'setEnabled'])
  h.unmount()
})

test('installation authorization failure removes stale cloud cards but keeps local controls and a visible reason', async () => {
  const local = item({ version: '1.1.0', state: 'unavailable', presetId: 'local-preset', enabled: true })
  const h = await mounted(state([local, item()]))
  await h.click('安装 故事伙伴 v1.2.0'); await h.resolve(1, fail('resources-forbidden'))
  assert(!h.text().includes('v1.2.0')); assert(h.text().includes('当前账号无法领取'))
  assert(!h.button('重试启用 故事伙伴 v1.1.0').props.disabled)
  assert(!h.button('停用 故事伙伴 v1.1.0').props.disabled); h.unmount()
})

test('replacing the connection discards old items and ignores late old install successes and errors', async () => {
  for (const lateFailure of [false, true]) {
    const h = await mounted()
    await h.click('安装 故事伙伴 v1.2.0'); await h.replaceCall()
    assert.deepEqual(h.calls.map(c => ({ owner: c.owner, op: c.request.op })), [
      { owner: 0, op: 'status' }, { owner: 0, op: 'install' }, { owner: 1, op: 'status' },
    ])
    assert(!h.text().includes('故事伙伴'))
    if (lateFailure) await h.reject(1, new Error('old secret')); else await h.resolve(1, ok(state([item({ state: 'installed' })])))
    assert(!h.text().includes('故事伙伴')); assert(!h.text().includes('old secret'))
    assert(h.button('读取中…').props.disabled, 'old finally cannot release new connection loading state')
    await h.resolve(2, ok(state([], { notice: '请先绑定当前节点。' })))
    assert(h.text().includes('请先绑定当前节点。')); assert(!h.button('刷新').props.disabled)
    h.unmount()
  }
})

test('stale click handlers cannot install or toggle a different node with the same resource IDs', async () => {
  const h = await mounted(state([item(), item({ version: '1.1.0', state: 'installed', enabled: true })]))
  const oldInstall = h.button('更新 故事伙伴 v1.2.0').props.onClick
  const oldToggle = h.button('停用 故事伙伴 v1.1.0').props.onClick
  await h.replaceCall(); await h.resolve(1, ok(state([item(), item({ version: '1.1.0', state: 'installed', enabled: true })])))
  oldInstall(); oldToggle(); await h.flush()
  assert.equal(h.calls.length, 2)
  h.unmount()
})

test('unmount ignores status, refresh and install replies and creates no timer or follow-up request', async () => {
  const h = panelHarness(); await h.flush(); h.unmount(); await h.resolve(0, ok(state()))
  assert.equal(h.calls.length, 1)
  for (const action of ['刷新', '安装 故事伙伴 v1.2.0']) {
    const next = await mounted(); await next.click(action); next.unmount()
    await next.resolve(1, ok(state([item({ state: 'installed' })])))
    await next.flush(); assert.equal(next.calls.length, 2)
  }
})
