/** Actual installed DSH manifest/gateway/component boundary in a disposable
 * profile. No existing profile, model, credentials, sockets or pairing calls.
 * Build product lib first. The native archive is mandatory, never silently skipped.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const archive = process.env.HARNESS_DSH_ASAR
assert(archive, 'HARNESS_DSH_ASAR must name the installed app.asar')
const stage = process.env.HARNESS_CLAWBOT_NATIVE_STAGE
const work = stage || fs.mkdtempSync(path.join(os.tmpdir(), 'clawbot-native-boundary-'))
assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
assert(path.basename(work).startsWith('clawbot-native-boundary-'))

if (!stage) {
  const fd = fs.openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
    const header = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, header, 0, header.length, 16)
    const tree = JSON.parse(header), dataStart = 8 + prefix.readUInt32LE(4)
    function materialize(entry, relative) {
      const target = path.resolve(work, relative)
      assert(target.startsWith(work + path.sep)); assert(!entry.link)
      if (entry.files) {
        for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name))
      } else if (/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
        else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
      }
    }
    materialize(tree.files.dsh, 'dsh')
    const product = path.join(work, 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
    fs.mkdirSync(product, { recursive: true })
    fs.copyFileSync(path.join(project, 'package.json'), path.join(product, 'package.json'))
    fs.cpSync(path.join(project, 'lib'), path.join(product, 'lib'), { recursive: true })
    // Product-owned JS only. Never import the checkout's older @deepseek-ai SDK.
    for (const dependency of ['qrcode', 'dijkstrajs', 'pngjs', 'jpeg-js', 'tweetnacl']) {
      fs.cpSync(path.join(project, 'node_modules', dependency), path.join(product, 'node_modules', dependency), { recursive: true })
    }
    assert(fs.existsSync(path.join(product, 'lib/clawbot-component.js')), 'build current product first')
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HARNESS_CLAWBOT_NATIVE_STAGE: work },
      encoding: 'utf8', windowsHide: true, timeout: 60000,
    }))
  } finally {
    fs.closeSync(fd)
    // Only this newly-created, validated test tree; child exits before DLL cleanup.
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
} else await verify()

async function verify() {
  const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
  const { TypertGatewayService } = await load('@deepseek-ai/dsh-api-gateway')
  const { default: Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { default: Projections } = await load('@deepseek-ai/dsh-session-projection')
  const { SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
  const { default: AgentPresets } = await load('@deepseek-ai/dsh-agent-preset-registry')
  const component = await load('@harness-remote/dsh-wechat-remote/clawbot')
  const { TYPERT } = await load('@harness-remote/dsh-wechat-remote/typert')
  const { invokeLegacyRpc } = await load('@harness-remote/dsh-wechat-remote/dsh-protocol-compat')
  const { FeatureAccess } = await load('@harness-remote/dsh-wechat-remote/features')
  const product = path.join(work, 'dsh/node_modules/@harness-remote/dsh-wechat-remote')
  const { nodeStorageDirectory } = await import(pathToFileURL(path.join(product, 'lib/node-storage.js')).href)
  const descriptor = TYPERT.invocations.find(v => v.namespace === 'wechatClawbot' && v.method === 'control')
  assert(descriptor, 'build must contain generated ClawBot manifest')
  assert.equal(descriptor.service, 'wechatClawbot')
  assert.deepEqual(descriptor.parameters.map(p => [p.name, p.wire, p.source, p.codec.mode]), [['request', 'request', 'json', 'strict']])
  assert.equal(descriptor.result.mode, 'strict')
  assert.deepEqual(descriptor.cancellation, { parameter: 'signal' })
  assert.deepEqual(component.inject, ['typertGateway', 'profileContext', 'wechatFeatures'])
  const inputCodec = descriptor.parameters[0].codec.create(), outputCodec = descriptor.result.create()
  assert(inputCodec.safeParse({ action: 'status' }).success)
  assert.equal(inputCodec.parse({ action: 'disconnect', expectedRevision: 1, abandonPending: true }).abandonPending, true,
    'the generated codec must retain explicit pending-message abandonment consent')
  assert(!inputCodec.safeParse({ action: 'disconnect', expectedRevision: 1, abandonPending: 'true' }).success)
  assert(!inputCodec.safeParse({ action: 'approve' }).success)
  assert(!outputCodec.safeParse({ ok: true, value: { supported: true } }).success)

  const profile = { name: 'clawbot-boundary-fixture', home: path.join(work, 'profile-home'), dir: path.join(work, 'profile'), installAnchor: anchor }
  const root = new Context(), checks = [], signal = new AbortController().signal
  const featureAccess = new FeatureAccess({nodeId:()=>'fixture-node',read:async()=>({schemaVersion:1,nodeId:'fixture-node',accountInstance:null,
    checkedAt:1000,expiresAt:61000,features:{group_assistant:{allowed:false,reason:'node_unbound',validUntil:null},clawbot:{allowed:false,reason:'node_unbound',validUntil:null}}})})
  const originalFetch = globalThis.fetch
  let componentFiber, networkCalls = 0
  globalThis.fetch = async () => { networkCalls++; assert.fail('no network or pairing is allowed') }
  try {
    root.baseUrl = pathToFileURL(path.join(work, 'dsh/')).href
    root.provide('profileContext', profile)
    root.provide('wechatFeatures', {access:featureAccess})
    await root.plugin(Loader); new Projections(root); new SystemPrompt(root, {})
    new ToolRuntime(root, { mode: 'native' }); new Typert(root)
    await root.plugin(TypertGatewayService, {})
    await root.plugin(AgentPresets, { default: 'standard' })
    // Native registries with independent existing entries, no preset execution.
    // Full shipped-mode/tool scope coverage is test-collaboration-scope-native.
    await root.agentPresets.register({ id: 'standard', name: 'existing native default', plugins: [] })
    await root.agentPresets.register({ id: 'fixture-custom', name: 'independent custom mode', plugins: [] })
    root.tools.register({ name: 'existing_tool', description: 'Boundary fixture only', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'object' }, render: () => [] }, execute() { assert.fail('no tools may run') } })
    const before = { tools: root.tools.schemas(), presets: await root.agentPresets.list(), defaultId: root.agentPresets.defaultId,
      config: JSON.stringify(root.agentPresets.config) }
    const nativePresetPaths = ['standard', 'ptc', 'minimal', 'cordis'].map(name => path.join(work, 'dsh/node_modules/@deepseek-ai/dsh-web-app/presets', name + '.patch.yml'))
    const nativePresetBytes = nativePresetPaths.map(file => fs.readFileSync(file))
    const absent = ['gate', 'wechatGate', 'webServer', 'connection', 'wechatPublicRelay', 'wechatPublicGateway', 'wechatPrivateInput', 'wechatHumanTools']
    function isolation() {
      for (const service of absent) assert.equal(root.get(service), undefined, 'unrelated dependency: ' + service)
      assert.deepEqual(root.tools.schemas(), before.tools)
      assert.equal(root.agentPresets.defaultId, before.defaultId)
      assert.equal(JSON.stringify(root.agentPresets.config), before.config)
      nativePresetPaths.forEach((file, i) => assert(fs.readFileSync(file).equals(nativePresetBytes[i])))
      assert.equal(networkCalls, 0)
    }
    const unregister = root.typert.register(TYPERT)
    assert.equal(root.typert.local.get('wechatClawbot/control').service, 'wechatClawbot')
    componentFiber = await root.plugin(component)
    assert(root.get('wechatClawbot')?.available(), 'optional channel must initialize without gate, cloud login or phone')
    const gateway = root.typertGateway
    const call = request => gateway.invoke({ namespace: 'wechatClawbot', method: 'control', args: { request }, signal })
    const status = await call({ action: 'status' })
    assert.deepEqual(status, { ok: true, value: { supported: true, revision: 0, enabled: false, state: 'disabled',
      paired: false, bindingState: 'unpaired', target: null, pending: 0, uncertain: 0, message: status.value.message, access:status.value.access } })
    assert.equal(status.value.access.allowed,false); assert.equal(status.value.access.reason,'node_unbound')
    assert(outputCodec.safeParse(status).success)
    const pairingDto = { ok: true, value: { ...status.value, pairing: {
      id: 'synthetic-login', url: 'https://liteapp.weixin.qq.com/q/test-only', qrDataUrl: 'data:image/png;base64,synthetic',
      status: 'wait', expiresAt: 123456,
    } } }
    assert.equal(outputCodec.parse(pairingDto).value.pairing.expiresAt, 123456,
      'generated wire codec retains the shared pairing deadline')
    assert.equal(outputCodec.parse({ ok: true, value: { ...status.value, paired: true, bindingState: 'expired' } }).value.bindingState, 'expired')
    await assert.rejects(gateway.invoke({ namespace: 'wechatClawbot', method: 'control', args: { action: 'status' }, signal }),
      e => e.code === 'gateway/arguments-invalid')
    await assert.rejects(call({ action: 'approve' }), e => e.code === 'gateway/input-invalid')
    // Installed native wire path validates/encodes the generated result as well.
    const wire = await gateway.dispatchRpc('wechatClawbot/control', { args: { request: { action: 'status' } } }, signal)
    assert.deepEqual(wire, { ok: true, value: status })
    checks.push('installed generated manifest validates real input/result and rejects wrong args/unknown action')
    isolation(); assert.deepEqual(await root.agentPresets.list(), before.presets)

    // Real mini modules, carrier wrapper and product generic namespace adapter.
    // Only the authenticated carrier is replaced by an in-process fixture.
    const mini = path.resolve(process.env.HARNESS_REMOTE_MINI_DIR || path.join(project, '../wechat-miniprogram'))
    const miniRequire = createRequire(path.join(mini, 'package.json'))
    const request = miniRequire('./utils/request.js')
    const { createClient } = miniRequire('./utils/clawbot-client.js')
    let carrierCalls = 0
    const carrierRequests = []
    request.configurePublic({ async call(method, payload) {
      carrierCalls++
      assert.equal(method, 'wechatClawbot/control')
      assert(payload.args?.request?.action, 'mini must send args.request, not args.action')
      carrierRequests.push(structuredClone(payload.args.request))
      const response = await invokeLegacyRpc(gateway, { type: 'client-request', rpcId: 'fixture-rpc-' + carrierCalls, method, payload },
        { signal, describeHost() { assert.fail('must not invoke host.describe') } })
      assert.equal(response.rpcId, 'fixture-rpc-' + carrierCalls)
      return response.result
    } })
    const miniClient = createClient({ store: { activeAgentKey: () => 'fixture-node',
      state: { connected: true, streamDown: false, connectionEpoch: 1 } }, request, enabled: () => true })
    const initial = await miniClient.refresh()
    assert.equal(initial.supported, true); assert.equal(initial.enabled, false)
    const paused = await miniClient.control('enabled', { enabled: false, expectedRevision: initial.revision })
    assert.equal(paused.enabled, false)
    const disconnected = await miniClient.control('disconnect', { expectedRevision: paused.revision, abandonPending: true })
    assert.equal(disconnected.paired, false)
    assert.deepEqual(carrierRequests.at(-1), { action: 'disconnect', expectedRevision: paused.revision, abandonPending: true })
    await assert.rejects(miniClient.control('disconnect', { expectedRevision: initial.revision }), e => e.code === 'clawbot-conflict')
    checks.push('current mini request.callRemote -> invokeLegacyRpc -> installed native gateway -> service, including disconnect revision and abandonPending DTO')
    isolation(); assert.deepEqual(await root.agentPresets.list(), before.presets)

    const lock = path.join(nodeStorageDirectory(profile.home, profile.name), 'clawbot/.owner')
    assert(fs.existsSync(lock))
    await componentFiber.dispose(); componentFiber = undefined
    assert.equal(root.get('wechatClawbot'), undefined)
    assert(!fs.existsSync(lock), 'component disposal releases only its own profile lock')
    await assert.rejects(call({ action: 'status' }), e => e.code === 'gateway/service-unavailable')
    // Package definitions can outlive a disabled component; no fallback service.
    assert(root.typert.local.get('wechatClawbot/control'))
    componentFiber = await root.plugin(component)
    assert(root.get('wechatClawbot')?.available(), 'remount must acquire the released lock')
    assert.equal((await call({ action: 'status' })).value.enabled, false)
    await unregister()
    assert.equal(root.typert.local.get('wechatClawbot/control'), undefined)
    await assert.rejects(call({ action: 'status' }), e => e.code === 'gateway/definition-unavailable')
    isolation(); assert.deepEqual(await root.agentPresets.list(), before.presets)
    checks.push('native component dispose/remount and manifest withdrawal release exact namespace/lock without fallback')
    checks.push('no gate/webServer/phone/cloud login, network, tools, preset/default or shipped mode config changes')
    console.log(JSON.stringify({ ok: true, installedDsh: JSON.parse(fs.readFileSync(anchor, 'utf8')).version, checks }, null, 2))
  } finally {
    featureAccess.close()
    await componentFiber?.dispose()
    await root.fiber.dispose()
    globalThis.fetch = originalFetch
  }
}
