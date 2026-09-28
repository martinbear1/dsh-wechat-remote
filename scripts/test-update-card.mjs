// Actual shared updater + component handlers, using synthetic HTTP responses.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
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
    h.click('更新并重启'); await settle()
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
    h.click('更新并重启'); await settle()
    assert.equal(h.store.getSnapshot().progress.terminal, false)
    assert.equal(h.store.getSnapshot().check.canInstall, false)
    await h.store.install(); assert.equal(starts, 1)
  } finally { h.store.dispose() }
})
test('lost reply without known worker stays unknown and ignores earlier success', async () => {
  const h = await harness(async url => { if (url.endsWith('/start')) throw TypeError('fetch failed'); return new Response(JSON.stringify({ activeJob: null, lastResult: { terminal: true, ok: true, progress: 100 } })) })
  try {
    h.click('更新并重启'); await settle()
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
    assert.equal(h.elements().some(n => n.type === 'button' && n.props.children === '更新并重启'), false)
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
