/** Passive UI lifecycle tests. No device, profile, installer or network. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const compile = async entry => (await build({ entryPoints: ['src/client/' + entry], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })).outputFiles[0].text
const noticeCode = await compile('InstallationRestartNotice.tsx'), cardCode = await compile('NativeUpdateCard.tsx')
const settle = () => new Promise(resolve => setImmediate(resolve))
const elements = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(elements) : [tree, ...elements(tree.props?.children)]
function harness(code) {
  const states = [], dependencies = [], effects = [], cleanups = []
  let stateIndex = 0, effectIndex = 0, writes = 0
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react') return {
      useState(value) { const key = stateIndex++; if (!(key in states)) states[key] = value; return [states[key], next => { writes++; states[key] = typeof next === 'function' ? next(states[key]) : next }] },
      useEffect(fn, deps) { const key = effectIndex++; if (!dependencies[key] || deps.some((dep, i) => dep !== dependencies[key][i])) { dependencies[key] = deps; effects.push(() => { cleanups[key]?.(); cleanups[key] = fn() }) } },
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'NativeModal' }
    throw Error(id)
  }, setTimeout: () => assert.fail('auxiliary UI must not create a timer') })
  return { exports: module.exports,
    render(component, props) { stateIndex = 0; effectIndex = 0; return component(props) },
    flush() { effects.splice(0).forEach(fn => fn()) },
    unmount() { cleanups.forEach(fn => fn?.()) }, get writes() { return writes } }
}
const old = '1.7.13', installed = '1.7.14-rc.59'
const baseline = (readInstallation, scope = 'desktop') => ({ readInstallation, runningVersion: old, installedVersion: old, scope, hostIdentity: 'current-node' })

test('detail guidance uses native owner over stale host path, reads once, has no action or gate', async () => {
  for (const scope of ['desktop', 'web']) {
    let reads = 0
    const h = harness(noticeCode), props = baseline(async () => { reads++; return { phase: 'restart-required', installedVersion: installed, runningVersion: old } }, scope)
    const render = () => h.render(h.exports.InstallationRestartNotice, props)
    assert.equal(render(), null); assert.equal(reads, 0, 'rendering cannot make a request')
    h.flush(); await settle()
    const tree = render(), text = JSON.stringify(tree)
    assert.match(text, /已安装，需重启当前 DSH/); assert(text.includes(installed)); assert(text.includes(old))
    assert.equal(tree.props.role, 'status'); assert(!elements(tree).some(n => n.type === 'button'))
    assert.match(text, scope === 'web' ? /仅关闭标签页或刷新网页不会生效/ : /应用 → 退出/)
    assert.doesNotMatch(text, /另一端|联动|立即重启|确认更新/)
    for (let i = 0; i < 4; i++) { render(); h.flush(); await settle() }
    assert.equal(reads, 1, 'normal snapshot rerenders cannot introduce polling')
    h.unmount()
  }
})

test('absent, failed, synchronous-throwing or hanging guidance never fails the view or delays existing version feedback', async () => {
  for (const reader of [undefined, () => { throw Error('unavailable') }, async () => { throw Error('offline') }, () => new Promise(() => {})]) {
    const h = harness(noticeCode), props = baseline(reader)
    assert.equal(h.render(h.exports.InstallationRestartNotice, props), null)
    h.flush(); await settle()
    assert.equal(h.render(h.exports.InstallationRestartNotice, props), null)
    props.installedVersion = installed
    assert.match(JSON.stringify(h.render(h.exports.InstallationRestartNotice, props)), /需重启当前 DSH/)
    h.unmount()
  }
})

test('matching versions, unknown versions and disabled owner never demand a restart', async () => {
  for (const state of [{ phase: 'ready', installedVersion: old }, { phase: 'unknown' }, { phase: 'disabled', installedVersion: installed }]) {
    const h = harness(noticeCode), props = baseline(async () => state)
    h.render(h.exports.InstallationRestartNotice, props); h.flush(); await settle()
    assert.equal(h.render(h.exports.InstallationRestartNotice, props), null); h.unmount()
  }
  const h = harness(noticeCode)
  assert.equal(h.render(h.exports.InstallationRestartNotice, { installedVersion: installed }), null)
  assert.equal(h.render(h.exports.InstallationRestartNotice, { runningVersion: 'not-a-version', installedVersion: installed }), null)
  h.unmount()
})

test('runtime/node changes hide stale guidance immediately and fence late replies; unmount has no late writes', async () => {
  const replies = []
  const h = harness(noticeCode), props = baseline(() => new Promise(resolve => replies.push(resolve)))
  h.render(h.exports.InstallationRestartNotice, props); h.flush(); await settle()
  props.hostIdentity = 'another-node'
  assert.equal(h.render(h.exports.InstallationRestartNotice, props), null); h.flush(); await settle()
  const before = h.writes
  replies[0]({ phase: 'restart-required', installedVersion: installed }); await settle()
  assert.equal(h.writes, before); assert.equal(h.render(h.exports.InstallationRestartNotice, props), null)
  replies[1]({ phase: 'restart-required', installedVersion: installed }); await settle()
  assert.match(JSON.stringify(h.render(h.exports.InstallationRestartNotice, props)), /需重启/)
  props.runningVersion = installed; props.installedVersion = installed
  assert.equal(h.render(h.exports.InstallationRestartNotice, props), null, 'restart clears old mismatch before the next reply')
  h.flush(); await settle(); h.unmount()
  const writes = h.writes
  replies[2]({ phase: 'ready', installedVersion: installed }); await settle(); assert.equal(h.writes, writes)
})

test('one-click notice is current job only; native close/Escape and acknowledge are local, never retry/update/restart', () => {
  for (const scope of ['desktop', 'web']) for (const dismiss of ['close', 'acknowledge']) {
    let remaining = { jobId: 'fresh', installedVersion: installed, runningVersion: old }, takes = 0
    const store = { getSnapshot: () => ({ check: null, status: { phase: 'restart-required', jobId: 'fresh' } }),
      takeRestartNotice() { takes++; const value = remaining; remaining = undefined; return value },
      refresh: () => assert.fail('no request from a notice'), install: () => assert.fail('no update from a notice') }
    const h = harness(cardCode)
    const card = h.exports.NativeUpdateCard({ store, scope })
    const child = elements(card).find(n => n.type?.name === 'UpdateResultNotice')
    assert(child)
    const render = () => h.render(child.type, child.props)
    assert.equal(render(), null); h.flush()
    const modal = render()
    assert.equal(modal.type, 'NativeModal')
    assert.match(JSON.stringify(modal), scope === 'web' ? /重新启动 DSH Web/ : /应用 → 退出/)
    assert.deepEqual(elements(modal).filter(n => n.type === 'button').map(n => n.props.children), ['知道了'])
    if (dismiss === 'close') modal.props.onClose()
    else elements(modal).find(n => n.type === 'button').props.onClick()
    assert.equal(render(), null)
    child.props.status = { ...child.props.status }; render(); h.flush()
    assert.equal(render(), null, 'poll snapshot cannot repeat a dismissed popup')
    assert.equal(takes, 2); h.unmount()
    const second = harness(cardCode)
    const secondChild = elements(second.exports.NativeUpdateCard({ store, scope })).find(n => n.type?.name === 'UpdateResultNotice')
    second.render(secondChild.type, secondChild.props); second.flush()
    assert.equal(second.render(secondChild.type, secondChild.props), null, 'another page/remount has no duplicate popup')
    second.unmount()
  }
})

test('auxiliary notice failure leaves original update controls and progress intact; obsolete job/owner hides a modal', () => {
  const snapshot = { check: { advice: { label: '插件可更新', current: {}, targetVersion: installed }, canInstall: true }, status: { phase: 'idle' } }
  let installs = 0
  const store = { getSnapshot: () => snapshot, install: () => installs++, refresh() {}, takeRestartNotice: () => { throw Error('display unavailable') } }
  const h = harness(cardCode), card = h.exports.NativeUpdateCard({ store })
  elements(card).find(n => n.type === 'button' && [n.props.children].flat().join('') === '更新 Desktop 插件').props.onClick()
  assert.equal(installs, 1)
  const child = elements(card).find(n => n.type?.name === 'UpdateResultNotice')
  h.render(child.type, child.props); h.flush(); assert.equal(h.render(child.type, child.props), null)
  h.unmount()
  const visible = harness(cardCode), owner = { getSnapshot: () => ({ check: null, status: { phase: 'restart-required', jobId: 'fresh' } }), takeRestartNotice: () => ({ jobId: 'fresh', installedVersion: installed, runningVersion: old }) }
  const visibleChild = elements(visible.exports.NativeUpdateCard({ store: owner })).find(n => n.type?.name === 'UpdateResultNotice')
  const props = { store: owner, status: { phase: 'restart-required', jobId: 'fresh' }, scope: 'desktop' }
  visible.render(visibleChild.type, props); visible.flush(); assert.equal(visible.render(visibleChild.type, props).type, 'NativeModal')
  props.status = { phase: 'complete', jobId: 'fresh' }; assert.equal(visible.render(visibleChild.type, props), null)
  props.status = { phase: 'restart-required', jobId: 'another' }; assert.equal(visible.render(visibleChild.type, props), null)
  props.store = { takeRestartNotice: () => undefined }; assert.equal(visible.render(visibleChild.type, props), null)
  visible.unmount()
})
