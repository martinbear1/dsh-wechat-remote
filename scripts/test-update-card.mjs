// Actual shared updater + component handlers, using synthetic HTTP responses.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const bundle = async name => (await build({ entryPoints: [fileURLToPath(new URL('../src/client/' + name, import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css'], logLevel: 'silent' })).outputFiles[0].text
const code = await bundle('web-update-store.ts'), view = await bundle('PluginUpdateCard.tsx')
const initial = { canInstall: true, mode: 'automatic', ticket: 'ticket', reason: '', advice: { label: '可更新', message: '', severity: 'info', targetVersion: '1.7.9', current: { agentVersion: '0.1.5', pluginVersion: '1.7.8' } } }
async function harness(fetcher) {
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, fetch, AbortSignal, URL, Date, setTimeout, clearTimeout })
  const store = new module.exports.WebUpdateStore('http://127.0.0.1:3183', async (url, options) => {
    if (url.endsWith('/check')) return new Response(JSON.stringify(initial))
    return fetcher(url, options)
  })
  await store.refresh()
  const component = { exports: {} }
  vm.runInNewContext(view, { module: component, exports: component.exports, require(id) {
    if (id === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
    if (id.endsWith('.css')) return {}
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
    throw Error(id)
  } })
  function all(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(all); return [tree, ...all(tree.props?.children)] }
  const elements = () => all(component.exports.PluginUpdateCard({ store }))
  function click(label) { const button = elements().find(n => n.type === 'button' && n.props.children === label); assert(button && !button.props.disabled, label); button.props.onClick() }
  return { store, click, elements }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }

test('confirmed rejection shows failure without 100% and consumes shared single-use ticket', async () => {
  const h = await harness(async () => new Response(JSON.stringify({ error: '下载失败' }), { status: 409 }))
  try {
    h.click('更新 Web 并重启'); await settle()
    const value = h.store.getSnapshot()
    assert.equal(value.progress.phase, 'failed'); assert.equal(value.progress.progress, 0)
    assert.equal(value.check.canInstall, false); assert.equal(value.check.ticket, '')
    assert.equal(h.elements().some(n => n.type === 'progress'), false)
  } finally { h.store.dispose() }
})
test('lost start reply recovers known worker instead of admitting a second install', async () => {
  const job = { jobId: 'abc', statusOrigin: 'http://127.0.0.1:10001', statusToken: 'test' }; let starts = 0
  const h = await harness(async url => {
    if (url.endsWith('/start')) { starts++; throw TypeError('fetch failed') }
    return new Response(JSON.stringify(url.startsWith(job.statusOrigin)
      ? { jobId: 'abc', terminal: false, phase: 'installing', progress: 50, message: 'fixture' } : { activeJob: job }))
  })
  try {
    h.click('更新 Web 并重启'); await settle()
    assert.equal(h.store.getSnapshot().progress.terminal, false)
    assert.equal(h.store.getSnapshot().check.canInstall, false)
    await h.store.install(); assert.equal(starts, 1)
  } finally { h.store.dispose() }
})
test('lost reply without known worker stays unknown and ignores earlier success', async () => {
  const h = await harness(async url => { if (url.endsWith('/start')) throw TypeError('fetch failed'); return new Response(JSON.stringify({ activeJob: null, lastResult: { terminal: true, ok: true, progress: 100 } })) })
  try {
    h.click('更新 Web 并重启'); await settle()
    assert.equal(h.store.getSnapshot().progress.phase, 'unknown')
    assert.equal(h.elements().some(n => n.type === 'progress'), false)
  } finally { h.store.dispose() }
})
test('simultaneous entry clicks create exactly one transaction and both see the same progress', async () => {
  let starts = 0, release
  const h = await harness(async () => { starts++; await new Promise(resolve => { release = resolve }); return new Response(JSON.stringify({ error: 'fixture rejection' }), { status: 409 }) })
  try {
    const promise = h.store.install(), second = h.store.install()
    assert.equal(starts, 1)
    assert.equal(h.store.getSnapshot().progress.phase, 'download')
    assert.equal(h.elements().some(n => n.type === 'button' && n.props.children === '更新 Web 并重启'), false)
    release(); await Promise.all([promise, second])
    assert.equal(h.store.getSnapshot().progress.phase, 'failed')
  } finally { h.store.dispose() }
})
test('preparation does not render an earlier successful job; two check requests are folded', async () => {
  const module = { exports: {} }; let calls = 0
  vm.runInNewContext(code, { module, exports: module.exports, fetch, AbortSignal, URL, Date, setTimeout, clearTimeout })
  const store = new module.exports.WebUpdateStore('http://127.0.0.1:3183', async () => { calls++; return new Response(JSON.stringify({ ...initial, mode: 'busy', canInstall: false, lastResult: { terminal: true, ok: true, progress: 100 } })) })
  try {
    await Promise.all([store.refresh(), store.refresh()])
    assert.equal(calls, 1); assert.equal(store.getSnapshot().progress.phase, 'preparing')
    assert.equal(store.getSnapshot().check.canInstall, false)
  } finally { store.dispose() }
})

test('native settings puts both endpoints inside one update block, with read-only rendering', async () => {
  const source = (await build({ entryPoints: [fileURLToPath(new URL('../src/client/HarnessRemoteSettings.tsx', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'], logLevel: 'silent' })).outputFiles[0].text
  const module = { exports: {} }, require = createRequire(import.meta.url)
  vm.runInNewContext(source, { module, exports: module.exports, require(id) {
    if (id.endsWith('.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key })
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { FishLogo: () => null, Modal: 'div' }
    return require(id)
  } })
  const noAction = () => assert.fail('render must not refresh, install, approve, or generate a QR')
  const passive = value => ({ getSnapshot: () => value, subscribe: noAction, refresh: noAction, install: noAction })
  for (const current of ['desktop', 'web']) {
    const peer = current === 'desktop' ? 'web' : 'desktop'
    const runtime = { profileScope: current, publicDoor: { state: 'listening' } }
    const snapshot = { loadState: 'ready', qrState: 'idle', runtime, localOrigin: current === 'web' ? 'http://localhost' : null,
      error: null, decisionError: null, deciding: false,
      status: { plugin: { runningVersion: '1.7.12', installedVersion: '1.7.12' }, lan: { ip: '127.0.0.1' },
        companionUpdate: { state: 'confirmation-required', message: `${peer} update`, offerId: 'immutable-offer',
          target: { scope: peer, fromVersion: '1.7.10', version: '1.7.12' },
          versions: { current, running: '1.7.12', installed: '1.7.12', peer, peerInstalled: '1.7.10' } } } }
    const store = { ...passive(snapshot), decide: noAction, generateQr: noAction, diagnose: noAction, cancelDiagnostic: noAction, subscribeDiagnostics: noAction,
      nativeUpdates: current === 'desktop' ? passive({ check: { ...initial, advice: { ...initial.advice, severity: 'none', label: '暂无可用更新' }, canInstall: false }, status: { phase: 'idle', message: '' } }) : undefined,
      updates: current === 'web' ? passive({ check: { ...initial, canInstall: false }, progress: null, error: '', checking: false }) : undefined }
    const html = renderToStaticMarkup(createElement(module.exports.HarnessRemoteSettings, { store, describeHost: noAction, callManagement: noAction }))
    assert.equal((html.match(/aria-label="插件更新"/g) || []).length, 1)
    const updateBlock = html.match(/<section[^>]*aria-label="插件更新"[^>]*>([\s\S]*?)<\/section>/)?.[0]
    assert(updateBlock, 'the unified update block is present')
    assert.equal((updateBlock.match(/class="updateCard"/g) || []).length, 1, 'current and peer have no nested card borders')
    assert.match(html, /当前端/)
    assert.match(html, /同一主机/)
    assert.match(html, new RegExp(`确认更新 ${peer === 'web' ? 'Web' : 'Desktop'}`))
    assert(!html.includes('另一端插件</h4>'))
    assert.match(html, /<summary>连接帮助<\/summary><\/details><\/section>$/, 'quiet help is the last page entry')
    assert.doesNotMatch(html, /<details[^>]*\bopen[=> ]/, 'help does not default to expanded')
    assert(!html.includes('aria-label="连接诊断"'), 'closed help does not mount or observe diagnostic content')
    assert(!html.includes('检查连接'), 'diagnostic controls are hidden by default')
    snapshot.diagnosticState = 'error'
    snapshot.loadState = 'error'
    snapshot.error = '普通连接请求失败'
    const failedConnectionHtml = renderToStaticMarkup(createElement(module.exports.HarnessRemoteSettings, { store, describeHost: noAction, callManagement: noAction }))
    assert(failedConnectionHtml.includes('普通连接请求失败'))
    assert.match(failedConnectionHtml, /<summary>连接帮助<\/summary><\/details><\/section>$/)
    assert(!failedConnectionHtml.includes('检查连接'), 'normal errors never open diagnostics automatically')
    snapshot.loadState = 'ready'; snapshot.error = null
    if (current === 'desktop') {
      snapshot.status.plugin.installedVersion = '1.7.13'
      snapshot.status.companionUpdate = { state: 'self-restart-required', message: '等待当前 Desktop 重启，Web 未更新。',
        versions: { current, running: '1.7.12', installed: '1.7.13', peer, peerInstalled: '1.7.10' } }
      store.nativeUpdates = passive({ check: { ...initial, canInstall: false }, status: { phase: 'restart-required', targetVersion: '1.7.13', message: 'Desktop 需要重启' } })
      const pendingHtml = renderToStaticMarkup(createElement(module.exports.HarnessRemoteSettings, { store, describeHost: noAction, callManagement: noAction }))
      assert.equal((pendingHtml.match(/应用 → 退出/g) || []).length, 1, 'one restart instruction in the unified update block')
      assert(!pendingHtml.includes('新版插件尚未生效，请完整重启 Desktop'), 'removed duplicate hero notice')
      assert(pendingHtml.includes('已安装，待重新打开 Desktop'))
      assert(pendingHtml.indexOf('应用 → 退出') > pendingHtml.indexOf('aria-label="插件更新"'))
      assert(pendingHtml.includes('Web 不受影响'))
      store.nativeUpdates = passive({ check: { ...initial, canInstall: false }, status: { phase: 'failed', message: '安装失败，请核对' } })
      const failedHtml = renderToStaticMarkup(createElement(module.exports.HarnessRemoteSettings, { store, describeHost: noAction, callManagement: noAction }))
      assert(failedHtml.includes('更新未完成')); assert(failedHtml.includes('安装失败，请核对'))
    }
  }
})
