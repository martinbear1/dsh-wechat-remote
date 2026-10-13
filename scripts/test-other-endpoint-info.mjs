import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { build } from 'esbuild'

const backend = (await build({ entryPoints: ['src/other-endpoint-info.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm' })).outputFiles[0].text
const { readOtherEndpointInfo, otherEndpointStableUpdate } = await import('data:text/javascript;base64,' + Buffer.from(backend).toString('base64'))
const client = (await build({ entryPoints: ['src/client/OtherEndpointSummary.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '*.css', '@deepseek-ai/dsh-client-ui-primitives'] })).outputFiles[0].text
const now = Date.now()
const release = (version, channel = 'stable') => ({ version, channel, dsh: ['0.2.0'], platforms: ['linux'], architectures: ['x64'] })
const catalog = (patch = {}) => ({ schemaVersion: 1, revision: 'display-test', issuedAt: now - 1000,
  expiresAt: now + 86400000, releases: [release('1.7.13'), release('1.7.14'), release('1.8.0-rc.99', 'preview')],
  blocked: [], retiredDsh: [], ...patch })
const signal = () => new AbortController().signal
async function put(root, file, value) {
  const target = path.join(root, file)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(value))
}
async function snapshot(root) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
  return Promise.all(files.map(async entry => [path.relative(root, path.join(entry.parentPath, entry.name)),
    (await readFile(path.join(entry.parentPath, entry.name))).toString('base64')]))
}
async function fixture(scope, owner, action) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-other-display-'))
  try {
    const peer = scope === 'desktop' ? 'web' : 'desktop'
    await put(home, `profiles/${peer}/package.json`, { dependencies: { [owner]: '1.7.13' }, dsh: { profile: { bundles: [owner] } } })
    await put(home, `profiles/${peer}/node_modules/${owner}/package.json`, { name: owner, version: '1.7.13' })
    await put(home, `profiles/${peer}/pairing-sentinel.json`, { secret: 'never-read-or-change' })
    await action(home, peer)
  } finally { await rm(home, { recursive: true, force: true }) }
}

test('both standard profiles and package owners: fixed production catalog, stable-only, no disk changes', async () => {
  for (const scope of ['web', 'desktop']) for (const owner of ['dsh-wechat-remote', '@harness-remote/dsh-wechat-remote']) {
    await fixture(scope, owner, async (home, peer) => {
      const before = await snapshot(home), urls = []
      const result = await readOtherEndpointInfo({ home, scope, signal: signal(), platform: 'linux', fetcher: async (url, init) => {
        urls.push(url); assert.equal(init.redirect, 'manual'); return new Response(JSON.stringify(catalog()))
      } })
      assert.deepEqual(result, { scope: peer, state: 'available', pluginState: 'installed', pluginVersion: '1.7.13',
        update: { state: 'available', targetVersion: '1.7.14' } })
      assert.deepEqual(urls, ['https://relay.xyxfood.xyz/v1/update-policy'])
      assert.deepEqual(await snapshot(home), before)
      assert.doesNotMatch(JSON.stringify(result), /secret|sentinel|profiles|node_modules|rc\.99/)
    })
  }
})

test('missing, incomplete and ambiguous profiles do not become a false no-update or trigger network', async () => {
  await fixture('desktop', 'dsh-wechat-remote', async home => {
    const fetcher = () => assert.fail('unknown ownership must not fetch')
    const read = () => readOtherEndpointInfo({ home, scope: 'desktop', signal: signal(), fetcher })
    await put(home, 'profiles/web/package.json', { dependencies: {} })
    assert.equal((await read()).pluginState, 'not-installed')
    await put(home, 'profiles/web/package.json', { dependencies: { 'dsh-wechat-remote': '1', '@harness-remote/dsh-wechat-remote': '1' } })
    assert.equal((await read()).pluginState, 'unknown')
    await put(home, 'profiles/web/package.json', { dependencies: [] })
    assert.equal((await read()).state, 'unknown')
    await rm(path.join(home, 'profiles/web/package.json'))
    assert.equal((await read()).state, 'not-found')
    assert.equal((await readOtherEndpointInfo({ home, scope: 'custom', signal: signal(), fetcher })).state, 'unknown')
  })
})

test('DSH version is never inferred from current process, dependency spec or an unreferenced package', async () => {
  await fixture('desktop', 'dsh-wechat-remote', async home => {
    const fetcher = async () => new Response(JSON.stringify(catalog()))
    const read = () => readOtherEndpointInfo({ home, scope: 'desktop', signal: signal(), fetcher })
    await put(home, 'profiles/web/node_modules/@deepseek-ai/dsh/package.json', { name: '@deepseek-ai/dsh', version: '0.2.0' })
    assert.equal((await read()).dshVersion, undefined)
    await put(home, 'profiles/web/package.json', { dependencies: { 'dsh-wechat-remote': 'latest', '@deepseek-ai/dsh': 'latest' } })
    assert.equal((await read()).dshVersion, '0.2.0')
    await put(home, 'profiles/web/node_modules/@deepseek-ai/dsh/package.json', [])
    const result = await read()
    assert.equal(result.dshVersion, undefined); assert.equal(result.pluginVersion, '1.7.13')
  })
})

test('stable comparison ignores previews; stale, failed and uncertain restrictions stay unknown', () => {
  assert.deepEqual(otherEndpointStableUpdate(catalog(), '1.7.14-rc.59', undefined, 'linux', now), { state: 'available', targetVersion: '1.7.14' })
  assert.deepEqual(otherEndpointStableUpdate(catalog(), '1.7.14', undefined, 'linux', now), { state: 'none' })
  assert.deepEqual(otherEndpointStableUpdate(catalog({ expiresAt: now - 1 }), '1.7.13', undefined, 'linux', now), { state: 'unknown' })
  assert.deepEqual(otherEndpointStableUpdate(catalog({ blocked: [{ pluginVersion: '1.7.14', dsh: ['0.2.0'], reason: 'known failure' }] }), '1.7.13', undefined, 'linux', now), { state: 'unknown' })
  assert.deepEqual(otherEndpointStableUpdate(catalog({ releases: [release('1.8.0-rc.99', 'preview')] }), '1.7.13', undefined, 'linux', now), { state: 'none' })
  assert.deepEqual(otherEndpointStableUpdate({}, '1.7.13', undefined, 'linux', now), { state: 'unknown' })
})

test('failed network preserves installed information; cancellation propagates without swallowing', async () => {
  await fixture('desktop', 'dsh-wechat-remote', async home => {
    const result = await readOtherEndpointInfo({ home, scope: 'desktop', signal: signal(), fetcher: async () => { throw Error('offline') } })
    assert.equal(result.pluginVersion, '1.7.13'); assert.equal(result.update.state, 'unknown')
    const controller = new AbortController(); controller.abort()
    await assert.rejects(readOtherEndpointInfo({ home, scope: 'desktop', signal: controller.signal }))
  })
})

const settle = () => new Promise(resolve => setImmediate(resolve))
const elements = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(elements) : [tree, ...elements(tree.props?.children)]
function harness() {
  const states = [], refs = [], dependencies = [], effects = [], cleanups = []
  let stateIndex = 0, refIndex = 0, effectIndex = 0
  const module = { exports: {} }
  vm.runInNewContext(client, { module, exports: module.exports, AbortController, require(id) {
    if (id === 'react') return {
      useState(value) { const key = stateIndex++; if (!(key in states)) states[key] = value; return [states[key], next => { states[key] = typeof next === 'function' ? next(states[key]) : next }] },
      useRef(value) { const key = refIndex++; return refs[key] ??= { current: value } },
      useEffect(fn, deps) { const key = effectIndex++; if (!dependencies[key] || deps.some((dep, i) => dep !== dependencies[key][i])) { dependencies[key] = deps; effects.push(() => { cleanups[key]?.(); cleanups[key] = fn() }) } },
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    }
    if (id === 'react/jsx-runtime') return { Fragment: 'fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (id.endsWith('.css')) return {}
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Button: 'button', StateDot: 'dot' }
    throw Error(id)
  }, setTimeout: () => assert.fail('other endpoint summary cannot poll') })
  return {
    render(props) { stateIndex = 0; refIndex = 0; effectIndex = 0; return module.exports.OtherEndpointSummary(props) },
    flush() { effects.splice(0).forEach(fn => fn()) },
    unmount() { cleanups.forEach(fn => fn?.()) },
  }
}
const available = { state: 'available', scope: 'web', pluginState: 'installed', pluginVersion: '1.7.13', update: { state: 'available', targetVersion: '1.7.14' } }

test('collapsed summary performs no work; explicit open reads once, no update/install actions', async () => {
  const h = harness(); let reads = 0
  const props = { readOtherEndpoint: async () => { reads++; return available } }
  let tree = h.render(props); h.flush(); await settle(); assert.equal(reads, 0)
  tree.props.onToggle({ currentTarget: { open: true } }); await settle()
  tree = h.render(props); h.flush(); assert.equal(reads, 1)
  assert.match(JSON.stringify(tree), /1\.7\.13/); assert.match(JSON.stringify(tree), /1\.7\.14/)
  tree.props.onToggle({ currentTarget: { open: false } }); tree.props.onToggle({ currentTarget: { open: true } }); await settle()
  assert.equal(reads, 1)
  assert.deepEqual(elements(tree).filter(node => typeof node.props?.onClick === 'function').map(node => node.props.children), ['刷新'])
  h.unmount()
})

test('late node result is fenced; reset never automatically queries the new node', async () => {
  const h = harness(); let generation = 0, finish, reads = 0, requestSignal
  const props = { connection: { subscribe: () => () => {}, getSnapshot: () => generation },
    readOtherEndpoint: async value => { reads++; requestSignal = value; return new Promise(resolve => { finish = resolve }) } }
  const tree = h.render(props); h.flush(); tree.props.onToggle({ currentTarget: { open: true } })
  generation++; h.render(props); h.flush()
  assert.equal(requestSignal.aborted, true)
  finish(available); await settle()
  assert.doesNotMatch(JSON.stringify(h.render(props)), /1\.7\.13/)
  assert.equal(reads, 1); h.unmount()
})

test('read-only implementation has no secondary transport, package manager, timer, install or write', async () => {
  const source = await readFile('src/other-endpoint-info.ts', 'utf8')
  assert.doesNotMatch(source, /(?:writeFile|mkdir|rename|unlink|spawn|execFile|setInterval|setTimeout|installBundle|process\.env|child_process|net\.connect)/)
  const host = await readFile('src/host-info-service.ts', 'utf8')
  assert.match(host, /@Remote\('otherEndpoint'\)/)
})
