/** Real installed DSH code, synthetic sibling providers and intercepted fetch.
 * No real profile, account, session, model or external network is accessed. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const archive = process.env.HARNESS_DSH_ASAR
const childStage = process.env.HARNESS_RESOURCE_PROVIDER_STAGE
const repo = fileURLToPath(new URL('..', import.meta.url))

if (!childStage) {
  test('actual DSH sibling provider → resource service → refresh/install/update/offline lifecycle', {
    skip: !archive && 'HARNESS_DSH_ASAR not set; actual installed archive provider test not run', timeout: 60000,
  }, () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'private-resource-provider-native-'))
    const fd = fs.openSync(archive, 'r'), prefix = Buffer.alloc(16)
    fs.readSync(fd, prefix, 0, 16, 0)
    const json = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16)
    const header = JSON.parse(json), start = 8 + prefix.readUInt32LE(4)
    try {
      const extract = (entry, relative) => {
        const target = path.resolve(work, relative)
        assert(target.startsWith(work + path.sep)); assert(!entry.link, 'archive links require review')
        if (entry.files) { for (const [name, value] of Object.entries(entry.files)) extract(value, path.join(relative, name)); return }
        if (!/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) return
        fs.mkdirSync(path.dirname(target), { recursive: true })
        if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
        else { const bytes = Buffer.alloc(entry.size); fs.readSync(fd, bytes, 0, bytes.length, start + Number(entry.offset)); fs.writeFileSync(target, bytes) }
      }
      extract(header.files.dsh, 'dsh')
      // Preserve emitted module paths and the real package self-reference used
      // by ownPromptModule; bundling native.ts into a fixture masks this seam.
      const packageDirectory = path.join(work, 'dsh/node_modules/dsh-wechat-remote')
      fs.mkdirSync(packageDirectory, { recursive: true })
      fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({ name: 'dsh-wechat-remote', type: 'module', exports: {
        './resource-library': './native/lib/resource-library-component.js',
        './private-resource-prompt': './native/lib/private-resources/native.js',
      } }))
      execFileSync(process.execPath, [path.join(repo, 'node_modules/typescript/bin/tsc'), '-p', path.join(repo, 'tsconfig.json'),
        '--outDir', path.join(packageDirectory, 'native/lib'), '--declaration', 'false', '--sourceMap', 'false'],
      { cwd: repo, windowsHide: true, timeout: 20000, encoding: 'utf8' })
      const result = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
        env: { ...process.env, HARNESS_RESOURCE_PROVIDER_STAGE: work }, windowsHide: true, timeout: 20000, encoding: 'utf8',
      })
      process.stdout.write(result)
    } finally {
      fs.closeSync(fd)
      assert.equal(path.dirname(work), os.tmpdir()); assert(path.basename(work).startsWith('private-resource-provider-native-'))
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  })
} else {
  const work = path.resolve(childStage)
  assert.equal(path.dirname(work), os.tmpdir()); assert(path.basename(work).startsWith('private-resource-provider-native-'))
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Projection } = await load('@deepseek-ai/dsh-session-projection')
  const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const componentPath = require.resolve('dsh-wechat-remote/resource-library')
  const { WechatResourcesService } = await import(pathToFileURL(path.join(path.dirname(componentPath), 'private-resources/service.js')).href)
  const { NativeResourceRegistry } = await import(pathToFileURL(path.join(path.dirname(componentPath), 'private-resources/native.js')).href)
  const { parseResourcePreset } = await import(pathToFileURL(path.join(path.dirname(componentPath), 'private-resources/contract.js')).href)
  const { nativeAssistantCodec, parseNativeAssistantBase } = await import(pathToFileURL(path.join(path.dirname(componentPath), 'assistant-presets/native-adapter.js')).href)
  const fromBytes = bytes => {
    const value = parseResourcePreset(bytes)
    return { value, bytes, release: { resourceId: value.resourceId, version: value.version, kind: 'preset', name: value.name, description: value.description,
      sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } }
  }
  // These are the actual delivery files, not independently reconstructed test
  // prompts. An incorrect base ID in a released JSON must fail this regression.
  const v1 = fromBytes(fs.readFileSync(path.join(repo, 'tests/fixtures/private-resources/demo-creative-companion-1.0.1.json')))
  const v2 = fromBytes(fs.readFileSync(path.join(repo, 'tests/fixtures/private-resources/demo-creative-companion-1.1.1.json')))
  const nativeCodec = await nativeAssistantCodec(anchor)
  const standardSource = fs.readFileSync(require.resolve('@deepseek-ai/dsh-web-app/presets/standard.patch.yml'), 'utf8')
  const nativeStandardDefinition = nativeCodec.load(standardSource)[0].insert[0].config
  assert.equal(nativeStandardDefinition.id, 'standard')
  assert.equal(v1.value.basePreset, nativeStandardDefinition.id)
  assert.equal(v2.value.basePreset, nativeStandardDefinition.id)
  const fullDocument = { agentPreset: nativeStandardDefinition.id, content: JSON.stringify(nativeStandardDefinition.plugins) }
  const fullStandard = parseNativeAssistantBase(nativeCodec, fullDocument, nativeStandardDefinition.id)
  const beforeStandard = structuredClone(fullStandard)
  // Preserve the complete shipped declaration, including groups and !!js
  // expressions. This recorder checks transformation, not full host boot: the
  // runtime below mounts the original persona, without executing native tools.
  for (const resource of [v1, v2]) {
    let captured, disposed = false
    const recordedRegistry = {
      list: async () => [{ id: nativeStandardDefinition.id }],
      resolve: async id => {
        assert(id === nativeStandardDefinition.id || id === captured?.id)
        return { id }
      },
      readDocument: async id => { assert.equal(id, nativeStandardDefinition.id); return fullDocument },
      register: async definition => { captured = definition; return async () => { disposed = true } },
    }
    const recorder = new NativeResourceRegistry({ get: name => name === 'agentPresets' ? recordedRegistry : name === 'profileContext' ? { installAnchor: anchor } : undefined })
    try {
      await recorder.register(resource.value)
      assert.equal(captured.plugins.length, fullStandard.length + 1)
      for (let index = 0; index < fullStandard.length; index++) {
        const original = fullStandard[index]
        assert.deepEqual(captured.plugins[index], original.name === '@deepseek-ai/dsh-persona'
          ? { ...original, config: { ...original.config, prefix: '{{harness_private_resource_prompt}}' } }
          : original, `complete native standard declaration is preserved: ${original.id}`)
      }
      assert.deepEqual(captured.plugins.at(-1), { id: 'harness-private-resource-data', name: 'dsh-wechat-remote/private-resource-prompt', config: { text: resource.value.systemPrompt } })
      assert.deepEqual(fullStandard, beforeStandard)
    } finally { await recorder.close() }
    assert.equal(disposed, true)
  }
  const root = new Context(); root.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
  const leases = [], gates = []
  let resourceFiber, disposeStandard
  const timeoutSignal = () => AbortSignal.timeout(5000)
  const tick = () => new Promise(resolve => setTimeout(resolve, 5))
  const bounded = (promise, label) => {
    let timer
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), 5000) })]).finally(() => clearTimeout(timer))
  }
  try {
    await root.plugin(Loader); await root.plugin(Projection); await root.plugin(SystemPrompt, {})
    await root.plugin(AgentPresets, { default: 'standard' })
    const home = path.join(work, 'synthetic-home')
    root.provide('profileContext', { name: 'fixture', home, dir: path.join(home, 'profile'), installAnchor: anchor })
    root.provide('typertGateway', {})
    const nativePersona = fullStandard.find(row => row.name === '@deepseek-ai/dsh-persona')
    assert(nativePersona)
    root.systemPrompt.variable('cwd', () => '/synthetic-workspace')
    disposeStandard = await root.agentPresets.register({ id: nativeStandardDefinition.id, name: 'Standard', plugins: [structuredClone(nativePersona)] })
    await assert.rejects(root.agentPresets.resolve('agent'), error => error.code === 'agent-preset/not-found',
      'agent is a host service entry ID, not a shipped native preset ID')
    assert.equal((await root.agentPresets.resolve('standard')).broken, undefined)
    const nativeSuffix = nativePersona.config.suffix.replace('{{cwd}}', '/synthetic-workspace')
    const globalPrompt = renderPrompt(await root.systemPrompt.assemble())
    const pair = generateKeyPairSync('ed25519')
    const identity = { nodeId: 'synthetic-resource-node', publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
    const origin = 'https://relay.example.test', objectOrigin = 'https://objects.example.test'
    const unsupported = fromBytes(fs.readFileSync(path.join(repo, 'tests/fixtures/private-resources/demo-creative-companion-1.0.0-invalid.json')))
    assert.equal(unsupported.release.sha256, '89e2715fcc07774747c5f3d80ed3607ebd9a5bc0cd5ae3f1071368feaef5332b',
      'invalid fixture preserves the exact original released bytes, including whitespace')
    const releases = new Map([v1, v2, unsupported].map(resource => [resource.value.version, resource]))
    let available = [v1.release], currentCalls = 0
    const requests = []
    const connection = { identity, origin, objectOrigins: [objectOrigin], fetchImpl: async (address, options) => {
      const url = new URL(address); requests.push({ pathname: url.pathname, method: options.method, origin: url.origin })
      assert.equal(options.redirect, 'error')
      if (url.origin === objectOrigin) {
        assert.equal(options.headers, undefined, 'node proof is not forwarded to OSS')
        assert.equal(options.method, 'GET')
        const version = url.pathname.split('/').at(-1).replace('.json', '')
        assert(releases.has(version)); return new Response(releases.get(version).bytes)
      }
      assert.equal(url.origin, origin, 'all fetch calls stay intercepted on synthetic origins')
      assert.equal(options.headers['x-hr-proof-version'], '2')
      if (url.pathname.endsWith('/library')) {
        assert.equal(options.method, 'GET')
        return Response.json({ schemaVersion: 1, nodeId: identity.nodeId, accountInstance: 'synthetic-account', items: available })
      }
      assert.equal(options.method, 'POST'); assert.equal(options.body, '{}')
      const version = url.pathname.split('/').at(-2), resource = releases.get(version)
      assert(resource)
      return Response.json({ schemaVersion: 1, nodeId: identity.nodeId, accountInstance: 'synthetic-account', release: resource.release,
        download: { url: `${objectOrigin}/resource-delivery/${version}.json?fixture=only`, expiresIn: 300 } })
    } }
    const startGate = async id => {
      root.loader.builtins[id] = { name: id, apply(ctx) { ctx.provide('wechatResourceSource', { current() { currentCalls++; return connection } }) } }
      await root.loader.root.create({ id, name: `cordis:${id}` })
      const fiber = root.loader.resolve(id).fiber
      await fiber.await(); gates.push(fiber); return fiber
    }
    const firstGate = await startGate('gateFixtureOne')
    let oldReader, optionalReader
    const oldProbe = await root.plugin(ctx => {
      oldReader = () => ctx.wechatResourceSource.current()
      optionalReader = () => ctx.get('wechatResourceSource')?.current()
    })
    assert.throws(oldReader, /cannot get property "wechatResourceSource" without inject/,
      'the previous service access fails on the actual native sibling-provider boundary')
    assert.equal(currentCalls, 0, 'the missing inject check fails before source.current or fetch')
    assert.equal(optionalReader().identity.nodeId, identity.nodeId)
    await oldProbe.dispose()
    const initialCurrentCalls = currentCalls
    await root.loader.root.create({ id: 'resourceFixture', name: 'dsh-wechat-remote/resource-library' })
    resourceFiber = root.loader.resolve('resourceFixture').fiber
    await bounded(root.loader.await(), 'native resource component startup must settle')
    const service = root.get('wechatResources')
    assert(service, 'actual resource Service should be mounted')
    let state
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await service.control({ op: 'status' }, timeoutSignal())
      assert.equal(result.ok, true)
      state = result.value
      if (!state.notice) break
      await tick()
    }
    assert.equal(state.notice, undefined, 'local readiness settles without a cloud request')
    assert.deepEqual(state.items, []); assert.equal(requests.length, 0); assert.equal(currentCalls, initialCurrentCalls)
    const ownedServiceFiber = [...root.registry.get(WechatResourcesService).fibers][0]
    const control = async request => {
      const result = await bounded(service.control(request, timeoutSignal()), `${request.op} must not hang`)
      assert.equal(result.ok, true, JSON.stringify(result))
      return result.value
    }
    const firstCatalog = await control({ op: 'refresh' })
    assert.equal(firstCatalog.items.length, 1); assert.equal(firstCatalog.items[0].state, 'available')
    assert.equal(requests.length, 1, 'one explicit refresh performs exactly one catalog HTTP request')
    const installedOne = (await control({ op: 'install', resourceId: v1.release.resourceId, version: v1.value.version })).items[0]
    assert.equal(installedOne.state, 'installed', installedOne.message)
    assert.equal((await root.agentPresets.resolve(installedOne.presetId)).broken, undefined)
    const oldScope = await root.agentPresets.acquireScope(installedOne.presetId); leases.push(oldScope)
    assert.equal(renderPrompt(await root.systemPrompt.assemble({ scope: oldScope.key })), [globalPrompt, v1.value.systemPrompt, nativeSuffix].filter(Boolean).join('\n\n'))
    available = [v1.release, v2.release]
    await control({ op: 'refresh' })
    const updated = await control({ op: 'install', resourceId: v2.release.resourceId, version: v2.value.version })
    const installedTwo = updated.items.find(item => item.version === v2.value.version)
    assert.equal(installedTwo.state, 'installed', installedTwo.message)
    assert.notEqual(installedTwo.presetId, installedOne.presetId)
    const newScope = await root.agentPresets.acquireScope(installedTwo.presetId); leases.push(newScope)
    assert.equal(renderPrompt(await root.systemPrompt.assemble({ scope: newScope.key })), [globalPrompt, v2.value.systemPrompt, nativeSuffix].filter(Boolean).join('\n\n'))
    assert.equal(renderPrompt(await root.systemPrompt.assemble({ scope: oldScope.key })), [globalPrompt, v1.value.systemPrompt, nativeSuffix].filter(Boolean).join('\n\n'))
    assert.equal((await root.agentPresets.list()).filter(item => [installedOne.presetId, installedTwo.presetId].includes(item.id) && item.broken === undefined).length, 2)
    available = [v1.release, v2.release, unsupported.release]
    await control({ op: 'refresh' })
    const invalid = (await control({ op: 'install', resourceId: unsupported.value.resourceId, version: unsupported.value.version })).items.find(item => item.version === unsupported.value.version)
    assert.equal(invalid.state, 'unavailable')
    assert.match(invalid.message, /基础模式/)
    await assert.rejects(root.agentPresets.resolve(invalid.presetId), error => error.code === 'agent-preset/not-found')
    available = [v1.release, v2.release]
    const deliveredRequests = requests.length
    await bounded(firstGate.dispose(), 'sibling gate disposal must not block on the resource library')
    assert.equal(ownedServiceFiber.state, 2)
    assert([...root.registry.get(WechatResourcesService).fibers].includes(ownedServiceFiber), 'provider loss does not recreate the resource service')
    assert.equal((await control({ op: 'status' })).items.filter(item => item.state === 'installed').length, 2)
    const offline = await service.control({ op: 'refresh' }, timeoutSignal())
    assert.equal(offline.ok, false); assert.equal(offline.error.code, 'resources-unavailable')
    assert.equal(requests.length, deliveredRequests, 'missing provider has no fallback network request')
    assert.equal((await root.agentPresets.resolve(installedOne.presetId)).broken, undefined)
    assert.equal((await root.agentPresets.resolve(installedTwo.presetId)).broken, undefined)
    await startGate('gateFixtureTwo')
    assert.equal((await control({ op: 'refresh' })).items.filter(item => item.state === 'installed').length, 2)
    assert.equal(requests.length, deliveredRequests + 1, 'a resumed sibling provider works without recreating local resources')
    assert([...root.registry.get(WechatResourcesService).fibers].includes(ownedServiceFiber))
    await resourceFiber.dispose()
    assert(!(await root.agentPresets.list()).some(item => item.id === installedOne.presetId || item.id === installedTwo.presetId))
    console.log(JSON.stringify({ passed: true, nativeVersion: JSON.parse(fs.readFileSync(anchor, 'utf8')).version,
      checks: ['old direct ctx property access fails without sibling inject', 'optional ctx.get resolves only on explicit resource operations',
        'actual service refresh reaches synthetic HTTP catalog', 'actual service install/update hot-registers both immutable native versions',
        'actual delivery JSON matches shipped standard preset ID and full declaration shape',
        'actual native persona renders delivered prompts unchanged; full native tool execution is outside this fixture',
        'unsupported agent base saves unavailable and never enters the native roster', 'provider loss preserves resource service and local native definitions',
        'provider recovery allows refresh without recreating the library', 'resource owner disposal unregisters only owned versions'],
      interceptedRequests: requests.length, externalNetworkRequests: 0, liveProfileTouched: false, modelCalls: 0 }))
  } finally {
    await bounded(resourceFiber?.dispose() ?? Promise.resolve(), 'resource fixture teardown must settle')
    for (const lease of leases) await bounded(lease[Symbol.asyncDispose](), 'native fixture lease disposal must settle')
    await disposeStandard?.()
    for (const gate of gates) await bounded(gate.dispose(), 'gate fixture teardown must settle')
    await bounded(root.fiber.dispose(), 'native fixture root disposal must settle')
  }
}
