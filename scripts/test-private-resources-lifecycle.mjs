/** Isolated lifecycle/state regression: no live host, account or network. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Optional actual installed-archive probe. Only public code is extracted; the
// child owns synthetic profile/resource files and never opens a real profile.
if (process.argv.includes('--native-dispose-probe')) {
  const fs = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const { createRequire } = await import('node:module')
  const archive = process.env.HARNESS_DSH_ASAR
  assert(archive, 'HARNESS_DSH_ASAR must identify the public application archive')
  const child = process.env.HARNESS_RESOURCE_LIFECYCLE_STAGE
  const work = child || await mkdtemp(path.join(os.tmpdir(), 'private-resources-lifecycle-native-'))
  if (!child) {
    const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
    fs.readSync(fd, prefix, 0, 16, 0)
    const header = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, header, 0, header.length, 16)
    const tree = JSON.parse(header), start = 8 + prefix.readUInt32LE(4)
    try {
      const extract = (entry, relative) => {
        const target = path.resolve(work, relative)
        assert(target.startsWith(work + path.sep)); assert(!entry.link)
        if (entry.files) { for (const [name, value] of Object.entries(entry.files)) extract(value, path.join(relative, name)); return }
        if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
        fs.mkdirSync(path.dirname(target), { recursive: true })
        if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
        else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, start + Number(entry.offset)); fs.writeFileSync(target, data) }
      }
      extract(tree.files.dsh, 'dsh')
      const source = name => JSON.stringify(fileURLToPath(new URL(`../src/${name}`, import.meta.url)).replaceAll('\\', '/'))
      await build({ stdin: { contents: [
        `export * as component from ${source('resource-library-component.ts')};`,
        `export {ResourceStorage} from ${source('private-resources/storage.ts')};`,
        `export {nodeStorageDirectory} from ${source('node-storage.ts')};`,
      ].join('\n'), resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' }, bundle: true,
      packages: 'external', platform: 'node', target: 'es2022', format: 'esm', outfile: path.join(work, 'dsh/fixture.mjs'), logLevel: 'silent' })
      process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--native-dispose-probe'], {
        env: { ...process.env, HARNESS_RESOURCE_LIFECYCLE_STAGE: work }, encoding: 'utf8', windowsHide: true, timeout: 10000,
      }))
    } finally {
      fs.closeSync(fd)
      assert.equal(path.dirname(work), os.tmpdir()); assert(path.basename(work).startsWith('private-resources-lifecycle-native-'))
      await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  } else {
    assert.equal(path.dirname(work), os.tmpdir()); assert(path.basename(work).startsWith('private-resources-lifecycle-native-'))
    const require = createRequire(path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json'))
    const load = name => import(pathToFileURL(require.resolve(name)).href)
    const { Context } = await load('@deepseek-ai/cordis')
    const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
    const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
    const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
    const { createHash } = await import('node:crypto')
    const { component, ResourceStorage, nodeStorageDirectory } = await import(pathToFileURL(path.join(work, 'dsh/fixture.mjs')).href)
    const ctx = new Context(); ctx.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    await ctx.plugin(Loader); await ctx.plugin(Projection); await ctx.plugin(AgentPresets, { default: 'standard' })
    const home = path.join(work, 'synthetic-home')
    ctx.provide('profileContext', { name: 'fixture', home, dir: path.join(home, 'profile'), installAnchor: path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json') })
    ctx.provide('typertGateway', {})
    class Pending { static inject = ['syntheticMissingProvider']; constructor() {} }
    ctx.loader.builtins.pendingFixture = Pending
    ctx.loader.builtins.resourceFixture = component
    await ctx.agentPresets.register({ id: 'standard', plugins: [{ id: 'pending-fixture', name: 'cordis:pendingFixture' }] })
    const data = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'preset', resourceId: 'race', version: '1.0.0', name: 'Race fixture', description: '', basePreset: 'standard', systemPrompt: 'Fixture only.' }))
    await new ResourceStorage(path.join(nodeStorageDirectory(home, 'fixture'), 'private-resources')).save(data,
      { resourceId: 'race', version: '1.0.0', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
    let enter, release
    const entered = new Promise(resolve => { enter = resolve }), hold = new Promise(resolve => { release = resolve })
    const list = ctx.agentPresets.list.bind(ctx.agentPresets)
    ctx.agentPresets.list = async () => { enter(); await hold; return list() }
    await ctx.loader.root.create({ id: 'resource-fixture', name: 'cordis:resourceFixture' })
    await entered
    const entry = ctx.loader.resolve('resource-fixture')
    let disposed = false
    const disposing = entry.fiber.dispose().then(() => { disposed = true })
    await new Promise(resolve => setImmediate(resolve)); release()
    await Promise.race([disposing, new Promise(resolve => setTimeout(resolve, 300))])
    console.log(JSON.stringify({ nativeAuditDisposeSettled: disposed, entryState: entry.fiber.state, pendingLoaderTasks: ctx.loader.getTasks().length }))
    // No active I/O handles remain. A failed probe intentionally exits instead
    // of awaiting a circular native disposal promise in its isolated child.
    process.exitCode = disposed ? 0 : 1
  }
  process.exit(process.exitCode || 0)
}

const stage = await mkdtemp(path.join(os.tmpdir(), 'private-resources-lifecycle-'))
const source = name => JSON.stringify(fileURLToPath(new URL(`../src/${name}`, import.meta.url)).replaceAll('\\', '/'))
await build({ stdin: { contents: [
  `export {ResourceController} from ${source('private-resources/controller.ts')};`,
  `export {ResourceError} from ${source('private-resources/contract.ts')};`,
  `export {PrivateResourceLibrary} from ${source('private-resources/library.ts')};`,
  `export {MyResourcesStore} from ${source('client/my-resources-store.ts')};`,
  `export * as resourceComponent from ${source('resource-library-component.ts')};`,
  `export {WechatResourcesService} from ${source('private-resources/service.ts')};`,
  `export {Context} from '@deepseek-ai/cordis';`,
].join('\n'), resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
bundle: true, platform: 'node', target: 'es2022', format: 'esm', outfile: path.join(stage, 'fixture.mjs'), logLevel: 'silent' })
const { ResourceController, ResourceError, PrivateResourceLibrary, MyResourcesStore, resourceComponent, WechatResourcesService, Context } = await import(pathToFileURL(path.join(stage, 'fixture.mjs')).href)
test.after(async () => {
  assert.equal(path.dirname(stage), os.tmpdir())
  assert(path.basename(stage).startsWith('private-resources-lifecycle-'))
  await rm(stage, { recursive: true, force: true })
})

const release = { resourceId: 'delivered-only', version: '1.0.0', name: 'Cloud delivery', description: '', kind: 'preset', bytes: 1, sha256: '0'.repeat(64) }
const local = { ...release, resourceId: 'already-local', presetId: 'hr-resource-local', basePreset: 'standard', enabled: true, status: 'installed' }
const catalog = { schemaVersion: 1, nodeId: 'fixture-node', accountInstance: 'former-account', items: [release] }
const signal = () => new AbortController().signal
const turn = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const within = async (promise, message) => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), 1000) })]) }
  finally { clearTimeout(timer) }
}
const fixtureHost = (name, loader) => {
  const ctx = new Context(), home = path.join(stage, name)
  ctx.provide('profileContext', { name, home, dir: path.join(home, 'profile'), installAnchor: path.join(home, 'package.json') })
  ctx.provide('agentPresets', {})
  ctx.provide('typertGateway', {})
  if (loader) ctx.provide('loader', loader)
  return ctx
}

test('local native component loads and survives removal of optional gate/source', async () => {
  const ctx = fixtureHost('independent-local')
  let cloudCalls = 0
  const gate = await ctx.plugin(owner => { owner.provide('wechatResourceSource', { current() { cloudCalls++; throw Error('offline fixture') } }) })
  const component = await ctx.plugin(resourceComponent)
  try {
    await turn()
    const service = ctx.get('wechatResources')
    assert(service, 'resource library must load without using a cloud connection')
    const serviceFiber = [...ctx.registry.get(WechatResourcesService).fibers][0]
    await within(gate.dispose(), 'optional gate disposal must not wait on resource startup')
    await turn()
    assert([...ctx.registry.get(WechatResourcesService).fibers].includes(serviceFiber), 'local resource service must not be recreated or disposed when the optional gate stops')
    assert.equal(serviceFiber.state, 2)
    await within((async () => {
      while ((await service.control({ op: 'status' }, signal())).value.notice) await turn()
    })(), 'offline resource preparation must settle')
    const result = await service.control({ op: 'status' }, signal())
    assert.equal(result.ok, true)
    assert.equal(result.value.items.length, 1)
    assert.equal(result.value.items[0].resourceId, 'chat-mode')
    assert.equal(result.value.items[0].enabled, true)
    assert.equal(result.value.items[0].state, 'unavailable', 'synthetic host without native registry cannot falsely report activation')
    assert.equal(cloudCalls, 0)
  } finally { await component.dispose(); await ctx.fiber.dispose() }
})

test('refresh resolves a sibling gate on demand without coupling local resource lifetime', async () => {
  const ctx = fixtureHost('sibling-source')
  const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
  const identity = { nodeId: 'synthetic-node-for-resources', publicKeyPem: keys.publicKey, privateKeyPem: keys.privateKey }
  let calls = 0
  const provide = owner => owner.provide('wechatResourceSource', { current: () => ({ identity, origin: 'https://delivery.invalid',
    fetchImpl: async (url, options) => {
      calls++
      assert.equal(url, `https://delivery.invalid/v1/resources/agents/${identity.nodeId}/library`)
      assert.equal(options.headers['x-hr-proof-version'], '2')
      return Response.json({ ...catalog, nodeId: identity.nodeId })
    },
  }) })
  let gate = await ctx.plugin(provide)
  const component = await ctx.plugin(resourceComponent)
  try {
    await turn()
    const service = ctx.get('wechatResources')
    const serviceFiber = [...ctx.registry.get(WechatResourcesService).fibers][0]
    assert.equal(calls, 0)
    await within((async () => {
      while ((await service.control({ op: 'status' }, signal())).value.notice) await turn()
    })(), 'local resource startup must settle')
    const refreshed = await service.control({ op: 'refresh' }, signal())
    assert.equal(refreshed.ok, true, JSON.stringify(refreshed))
    assert(refreshed.value.items.some(item => item.resourceId === release.resourceId))
    assert(refreshed.value.items.some(item => item.resourceId === 'chat-mode'))
    assert.equal(calls, 1)
    await gate.dispose()
    assert.equal(serviceFiber.state, 2)
    assert([...ctx.registry.get(WechatResourcesService).fibers].includes(serviceFiber))
    assert.equal((await service.control({ op: 'status' }, signal())).ok, true)
    const offline = await service.control({ op: 'refresh' }, signal())
    assert.equal(offline.ok, false)
    assert.equal(offline.error.code, 'resources-unavailable')
    assert.equal(calls, 1)
    gate = await ctx.plugin(provide)
    assert.equal((await service.control({ op: 'refresh' }, signal())).ok, true)
    assert.equal(calls, 2)
    assert.equal(serviceFiber.state, 2)
    assert([...ctx.registry.get(WechatResourcesService).fibers].includes(serviceFiber))
  } finally { await component.dispose(); await gate.dispose(); await ctx.fiber.dispose() }
})

test('disposing before host readiness cancels the readiness wait', async () => {
  const wait = deferred(), ctx = fixtureHost('cancel-ready', { await: () => wait.promise })
  const component = await ctx.plugin(resourceComponent)
  try {
    assert(ctx.get('wechatResources'))
    await within(component.dispose(), 'disposal cannot await an unrelated host loader forever')
    assert.equal(ctx.get('wechatResources'), undefined)
  } finally { wait.resolve(); await component.dispose(); await ctx.fiber.dispose() }
})

test('closing during native register cleans its late disposer without blocking unload', async () => {
  const registration = deferred(), entered = deferred(), cleaned = deferred()
  const definitions = new Map([['standard', { id: 'standard', plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'stock' } }] }]])
  let holdRegistration = true
  const registry = {
    list: async () => [...definitions.values()],
    resolve: async id => definitions.get(id),
    readDocument: async id => ({ agentPreset: id, content: JSON.stringify(definitions.get(id).plugins) }),
    register: async definition => {
      assert(!definitions.has(definition.id)); definitions.set(definition.id, definition)
      if (holdRegistration) { entered.resolve(); await registration.promise }
      return async () => { definitions.delete(definition.id); cleaned.resolve() }
    },
  }
  const host = { get: name => name === 'agentPresets' ? registry : undefined }
  const create = () => new PrivateResourceLibrary(host, path.join(stage, 'late-registration'), { codec: { load: JSON.parse }, promptModule: 'cordis:privateResourcePrompt' })
  const library = create()
  const content = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'preset', resourceId: 'late', version: '1.0.0', name: 'Late registration', description: '', basePreset: 'standard', systemPrompt: 'literal' }))
  const release = { resourceId: 'late', version: '1.0.0', bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }
  const installing = library.install(content, release)
  await within(entered.promise, 'fixture native register should be reached')
  await within(library.close(), 'closing cannot wait for a native register held by host lifecycle')
  assert.equal((await installing).status, 'unavailable', 'canceled native registration must not be reported installed')
  registration.resolve()
  await within(cleaned.promise, 'a late native registration must dispose itself')
  assert.deepEqual([...definitions.keys()], ['standard'])
  holdRegistration = false
  const restored = create()
  await restored.start()
  assert.equal(restored.list()[0].status, 'installed', 'cancellation preserves the saved resource for next local startup')
  await restored.close()
  assert.deepEqual([...definitions.keys()], ['standard'])
})

test('closing during post-register native diagnostics withdraws the new definition', async () => {
  const diagnostic = deferred(), entered = deferred()
  const definitions = new Map([['standard', { id: 'standard', plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'stock' } }] }]])
  const registry = {
    list: async () => [...definitions.values()],
    resolve: async id => { if (id !== 'standard') { entered.resolve(); await diagnostic.promise }; return definitions.get(id) },
    readDocument: async id => ({ agentPreset: id, content: JSON.stringify(definitions.get(id).plugins) }),
    register: async definition => { definitions.set(definition.id, definition); return async () => { definitions.delete(definition.id) } },
  }
  const library = new PrivateResourceLibrary({ get: name => name === 'agentPresets' ? registry : undefined }, path.join(stage, 'late-diagnostic'),
    { codec: { load: JSON.parse }, promptModule: 'cordis:privateResourcePrompt' })
  const content = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'preset', resourceId: 'diagnostic', version: '1.0.0', name: 'Pending diagnostic', description: '', basePreset: 'standard', systemPrompt: 'literal' }))
  const installing = library.install(content, { resourceId: 'diagnostic', version: '1.0.0', bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') })
  await within(entered.promise, 'fixture diagnostic should be reached')
  await within(library.close(), 'closing cannot join its own host Loader diagnostic')
  assert.equal((await installing).status, 'unavailable')
  assert.deepEqual([...definitions.keys()], ['standard'], 'owned registration is gone even before the old diagnostic returns')
  diagnostic.resolve(); await turn()
  assert.deepEqual([...definitions.keys()], ['standard'], 'late completion cannot restore a closed native owner')
})

test('actual native Loader disposal race', { skip: !process.env.HARNESS_DSH_ASAR && 'HARNESS_DSH_ASAR not set; actual installed archive probe not run' }, () => {
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--native-dispose-probe'], {
    env: process.env, encoding: 'utf8', windowsHide: true, timeout: 60000,
  })
  const result = JSON.parse(output.trim())
  assert.deepEqual(result, { nativeAuditDisposeSettled: true, entryState: 4, pendingLoaderTasks: 0 })
})

test('local status and setEnabled have no cloud dependency', async () => {
  const changes = []
  const controller = new ResourceController({ list: () => [local], issues: () => [],
    setEnabled: async (...args) => { changes.push(args) } }, {
    catalog: () => assert.fail('local status/toggle must not call cloud'),
    download: () => assert.fail('local status/toggle must not download'),
  })
  assert.equal((await controller.control({ op: 'status' }, signal())).items.length, 1)
  await controller.control({ op: 'setEnabled', resourceId: local.resourceId, version: local.version, enabled: false }, signal())
  assert.deepEqual(changes, [[local.resourceId, local.version, false]])
})

test('confirmed install-time revocation clears delivery cards but preserves local facts', async () => {
  for (const failAt of ['catalog', 'download']) {
    let revoked = false
    const controller = new ResourceController({ list: () => [local], issues: () => [] }, {
      catalog: async () => {
        if (revoked && failAt === 'catalog') throw new ResourceError('resources-forbidden', 'revoked')
        return catalog
      },
      download: async () => { throw new ResourceError('resources-closed', 'account changed') },
    })
    assert.equal((await controller.control({ op: 'refresh' }, signal())).items.length, 2)
    revoked = true
    await assert.rejects(controller.control({ op: 'install', resourceId: release.resourceId, version: release.version }, signal()))
    assert.deepEqual(controller.snapshot().items.map(item => item.resourceId), [local.resourceId], failAt)
  }
})

test('client clears known revoked delivery cards on install errors too', async () => {
  const store = new MyResourcesStore(async request => request.op === 'status'
    ? { ok: true, value: { supported: true, items: [{ ...release, state: 'available' }, { ...local, state: 'installed' }] } }
    : { ok: false, error: { code: 'resources-forbidden', message: 'revoked' } })
  await store.load()
  await store.install(release.resourceId, release.version)
  assert.deepEqual(store.getSnapshot().data.items.map(item => item.resourceId), [local.resourceId])
  store.dispose()
})

test('saved unavailable presets can retry activation and disable locally', async () => {
  const requests = []
  const unavailable = { ...local, state: 'unavailable', message: 'Base temporarily unavailable.' }
  const store = new MyResourcesStore(async request => {
    requests.push(request)
    assert.notEqual(request.op, 'install', 'a saved resource must not need another authorized download to recover')
    return { ok: true, value: { supported: true, items: [{ ...unavailable,
      ...(request.op === 'setEnabled' ? { state: 'installed', enabled: request.enabled } : {}) }] } }
  })
  await store.load()
  await store.setEnabled(local.resourceId, local.version, true)
  assert.deepEqual(requests.at(-1), { op: 'setEnabled', resourceId: local.resourceId, version: local.version, enabled: true })
  await store.setEnabled(local.resourceId, local.version, false)
  assert.deepEqual(requests.at(-1), { op: 'setEnabled', resourceId: local.resourceId, version: local.version, enabled: false })
  store.dispose()
})
