/** Current-host public inventory fixtures and real component lifecycle; no
 * installation, user profile, restart or external package request. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { build } from 'esbuild'
const compile = async name => (await build({ entryPoints: ['src/client/' + name], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })).outputFiles[0].text
const compiled = await compile('installation-state.ts'), ui = await compile('InstallationResultPanel.tsx')
const module = { exports: {} }; vm.runInNewContext(compiled, { module, exports: module.exports })
const { readInstallationState, manualRestartInstruction } = module.exports
const owners = ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']
const current = JSON.parse(fs.readFileSync('package.json', 'utf8')).version, old = '1.7.13'
function fixture(scope, owner, running = current) {
  const calls = [], host = { pluginVersion: running, gate: { profileScope: scope } }
  const own = { name: owner, installed: true, enabled: true, version: current, rows: [{ entryId: 'gate' }, { entryId: 'mode' }] }
  const entries = [{ entryId: 'gate', enabled: true, fiberPhase: 'active' }, { entryId: 'mode', enabled: true, fiberPhase: 'active' }]
  const bundles = [own], manager = {
    async listBundles() { calls.push('bundles'); return { ok: true, value: bundles } },
    async listPlugins() { calls.push('plugins'); return { ok: true, value: entries } },
  }
  return { calls, host, own, entries, bundles, manager,
    read: () => readInstallationState(name => { assert.equal(name, 'remote.pluginManager'); return manager }, async () => { calls.push('describe'); return host }, owner) }
}
for (const scope of ['web', 'desktop']) for (const owner of owners) {
  test(`${scope} ${owner}: warm old runtime requires only manual restart, cold runtime is ready`, async () => {
    const f = fixture(scope, owner, old)
    let state = await f.read()
    assert.equal(state.phase, 'restart-required'); assert.equal(state.scope, scope)
    assert.equal(state.runningVersion, old); assert.equal(state.installedVersion, current)
    assert.deepEqual(f.calls.sort(), ['bundles', 'describe', 'plugins'])
    f.host.pluginVersion = current; state = await f.read(); assert.equal(state.phase, 'ready')
    assert.match(manualRestartInstruction(scope), scope === 'web' ? /重启|重新启动 DSH Web 服务/ : /应用 → 退出/)
    if (scope === 'web') assert.doesNotMatch(manualRestartInstruction(scope), /应用 → 退出/)
  })
}
test('inventory errors, failed/pending/missing components never become success; deliberately disabled components stay disabled', async () => {
  const f = fixture('web', owners[0])
  for (const phase of ['failed', 'pending', 'loading', 'unloading', null]) {
    f.entries[1].fiberPhase = phase; assert.equal((await f.read()).phase, 'incomplete')
  }
  f.entries[1].enabled = false; assert.equal((await f.read()).phase, 'ready')
  f.entries.pop(); assert.equal((await f.read()).phase, 'incomplete')
  f.own.error = { code: 'invalid-package' }; assert.equal((await f.read()).phase, 'incomplete')
  f.own.enabled = false; assert.equal((await f.read()).phase, 'disabled')
})
test('ambiguous/absent/wrong owner and unavailable providers do not claim a successful install', async () => {
  const f = fixture('desktop', owners[0])
  f.bundles.push({ ...f.own, name: owners[1] }); assert.equal((await f.read()).phase, 'unknown')
  f.bundles.shift(); assert.equal((await f.read()).phase, 'unknown')
  f.bundles.pop(); assert.equal((await f.read()).phase, 'unknown')
  assert.equal((await readInstallationState(() => undefined, async () => f.host, owners[0])).phase, 'unknown')
  assert.equal((await readInstallationState(() => ({}), async () => f.host, owners[0])).phase, 'unknown')
  assert.equal((await readInstallationState(() => assert.fail('unrelated package'), async () => assert.fail(), 'unrelated')).phase, 'unknown')
})
test('native inventory can confirm pending restart even when older host has no new status/update endpoints', async () => {
  const f = fixture('web', owners[0], old)
  f.host.installedPluginVersion = old // Stale host metadata must not outweigh the native owner.
  delete f.manager.listPlugins
  assert.equal((await f.read()).phase, 'restart-required')
  f.host.pluginVersion = undefined
  assert.equal((await f.read()).phase, 'unknown')
})

test('withdrawn host definition with active components and installed package remains unconfirmed, not a made-up mismatch or success', async () => {
  const f = fixture('web', owners[0])
  const state = await readInstallationState(() => f.manager, async () => { throw Object.assign(new Error('strict definition withdrawn'), { code: 'gateway/definition-unavailable' }) }, owners[0])
  assert.equal(state.phase, 'unknown'); assert.equal(state.installedVersion, current)
  assert.equal(state.runningVersion, undefined)
})

function viewHarness(readInstallation) {
  const states = [], dependencies = [], effects = [], cleanups = []; let index = 0, effectIndex = 0, writes = 0, dismissals = 0, opens = 0
  const module = { exports: {} }
  vm.runInNewContext(ui, { module, exports: module.exports, require(id) {
    if (id === 'react') return {
      useState(value) { const key = index++; if (!(key in states)) states[key] = value; return [states[key], next => { writes++; states[key] = typeof next === 'function' ? next(states[key]) : next }] },
      useEffect(fn, deps) { const key = effectIndex++; if (!dependencies[key] || deps.some((dep, i) => dep !== dependencies[key][i])) { dependencies[key] = deps; effects.push(() => { cleanups[key]?.(); cleanups[key] = fn() }) } },
    }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'NativeModal' }
    throw Error(id)
  } })
  const props = { packageName: owners[0], readInstallation, onDismiss: () => dismissals++, onOpenDetails: () => opens++ }
  const all = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(all) : [tree, ...all(tree.props?.children)]
  return { props, render() { index = 0; effectIndex = 0; return module.exports.InstallationResultPanel(props) },
    flush() { effects.splice(0).forEach(fn => fn()) }, unmount() { cleanups.forEach(fn => fn?.()) },
    elements: all, get writes() { return writes }, get dismissals() { return dismissals }, get opens() { return opens } }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
test('native activation guide performs one read on mount, no poll/update; ready does not demand restart', async () => {
  let reads = 0
  const h = viewHarness(async () => { reads++; return { phase: 'ready', scope: 'web', installedVersion: current, runningVersion: current } })
  let tree = h.render(); assert.equal(tree.type, 'NativeModal'); assert.equal(tree.props.title, '微信连接 · 安装结果')
  assert.equal(reads, 0); h.flush(); await settle(); tree = h.render(); h.flush()
  assert.equal(reads, 1); assert.match(JSON.stringify(tree), /无需重启/)
  assert.doesNotMatch(JSON.stringify(tree), /另一端|联动|更新 Web|更新 Desktop|立即重启/)
  const button = h.elements(tree).find(n => n.type === 'button' && n.props.children === '知道了')
  button.props.onClick(); assert.equal(h.dismissals, 1); assert.equal(reads, 1)
  h.unmount()
})
test('pending guide gives current-endpoint manual steps and no fake restart or upgrade action', async () => {
  for (const scope of ['web', 'desktop']) {
    const h = viewHarness(async () => ({ phase: 'restart-required', scope, runningVersion: old, installedVersion: current }))
    h.render(); h.flush(); await settle(); const tree = h.render(), text = JSON.stringify(tree)
    assert.match(text, /已安装，需重启当前 DSH/); assert.match(text, /无需重新配对/)
    assert.match(text, scope === 'web' ? /仅关闭标签页或刷新网页不会生效/ : /应用 → 退出/)
    assert.doesNotMatch(text, /另一端|联动|确认更新|立即重启/)
    h.elements(tree).find(n => n.type === 'button' && n.props.children === '查看插件').props.onClick()
    assert.equal(h.dismissals, 1); assert.equal(h.opens, 1); h.unmount()
  }
})
test('failed reads require explicit retry; dismissal fences late results', async () => {
  let reads = 0, release
  const h = viewHarness(async () => { if (++reads === 1) throw Error('disconnected'); return new Promise(resolve => { release = resolve }) })
  h.render(); h.flush(); await settle(); let tree = h.render()
  assert.match(JSON.stringify(tree), /安装状态暂未确认/)
  assert.match(JSON.stringify(tree), /若刚安装或更新后页面不可用/)
  assert.match(JSON.stringify(tree), /Web 需要重启实际服务，仅刷新网页不会生效/)
  assert.doesNotMatch(JSON.stringify(tree), /已安装，需重启当前 DSH 才能生效|安装已生效|立即重启/)
  h.elements(tree).find(n => n.type === 'button' && n.props.children === '重新核对').props.onClick()
  h.render(); h.flush(); h.unmount(); const before = h.writes
  release({ phase: 'ready' }); await settle(); assert.equal(h.writes, before); assert.equal(reads, 2)
})
test('removed peer-update runtime cannot be reintroduced by slots, transport or package lists', () => {
  for (const file of ['src/companion-updates.ts', 'src/client/CompanionPanel.tsx', 'src/client/CompanionUpdateCard.tsx']) assert.equal(fs.existsSync(file), false)
  for (const file of ['src/gate-runtime.ts', 'src/pairing-management.ts', 'src/pairing-http.ts', 'src/client/index.ts', 'src/client/remote-page-store.ts', 'src/client/native-update-store.ts', 'src/native-update-service.ts', 'src/client/HarnessRemoteSettings.tsx', 'src/client/HarnessRemoteSettings.module.css', 'package.json', 'scripts/build-installer.mjs', 'scripts/generate-typert.mjs']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /companion|Companion|otherBusy|联动更新|companion-decision/, file)
  }
  assert.doesNotMatch(fs.readFileSync('src/client/installation-state.ts', 'utf8'), /installBundle\(|fetch\(|setInterval\(|node:fs|app\.relaunch|AppExit/)
})
