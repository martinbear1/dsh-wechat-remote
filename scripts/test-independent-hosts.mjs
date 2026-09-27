import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dshProfileFacts, hostRuntimeVersion } from '../lib/dsh-host-context.js'
import { agentDshHome, agentProfileScope, defaultGateStatePath, defaultAgentIdentityPath,
  defaultRelayConfigPath, loadAgentDescriptor } from '../lib/agent-metadata.js'
import { loadOrCreateAgentIdentity, loadPublicRelayConfig } from '../lib/public-relay-agent.js'
import { openHostEvents, workspaceReadArguments } from '../lib/dsh-host-contract.js'
import { updateAction, PluginUpdateService } from '../lib/update-service.js'
import { createInstallControl } from '../lib/install-control.js'
import { installProfile } from '../lib/install-profile.js'
import { install } from '../installer/bin/setup.mjs'
import { resolveDshWebRuntime } from '../lib/dsh-runtime.js'
import { prepareNodeStorage, nodeStorageDirectory } from '../lib/node-storage.js'

function context(home, name, version = '0.1.7-rc.2') {
  const dir = path.join(home, 'profiles', name)
  const installAnchor = path.join(home, 'bundled-runtime', version, 'package.json')
  mkdirSync(path.dirname(installAnchor), { recursive: true })
  writeFileSync(installAnchor, JSON.stringify({ name: '@deepseek-ai/dsh', version }))
  const facts = { name, home, dir, installAnchor }
  const ctx = { get: key => key === 'profileContext' ? facts : undefined }
  ctx.root = ctx
  return ctx
}
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-independent-hosts-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

if (process.argv[2] === '--identity-worker') {
  const home = process.argv[3], name = process.argv[4]
  // The parent creates the shared runtime fixture before spawning competitors.
  const ctx = { get: key => key === 'profileContext' ? { name, home,
    dir: path.join(home, 'profiles', name), installAnchor: path.join(home, 'bundled-runtime/0.1.7-rc.2/package.json') } : undefined }
  process.stdout.write(JSON.stringify(loadAgentDescriptor(ctx)))
} else {
  test('launcher identity wins without relying on argv, cwd, package location or default port', t => {
    const home = fixture(t), desktop = context(home, 'desktop')
    assert.equal(agentProfileScope(desktop), 'desktop')
    assert.equal(agentDshHome(desktop), home)
    assert.equal(dshProfileFacts(desktop).dir, path.join(home, 'profiles/desktop'))
    assert.equal(hostRuntimeVersion(desktop, '/not-the-running-cli'), '0.1.7-rc.2')
    assert.equal(loadAgentDescriptor(desktop).agentVersion, '0.1.7-rc.2')
  })
  test('Desktop missing backend port cannot inherit another Web runtime', t => {
    const ctx = context(fixture(t), 'desktop')
    assert.throws(() => resolveDshWebRuntime(ctx, { DSH_PORT: '3080' }), /未使用 Web/)
    const get = ctx.get
    ctx.get = key => key === 'webServer' ? { port: 32001 } : get(key)
    assert.deepEqual(resolveDshWebRuntime(ctx, { DSH_PORT: '3080' }), { port: 32001, source: 'web-server' })
  })
  test('existing Web binding bytes and nodeId stay in place; Desktop never imports them', t => {
    const home = fixture(t), web = context(home, 'web'), desktop = context(home, 'desktop')
    const webIdentity = defaultAgentIdentityPath(web), webState = defaultGateStatePath(web)
    prepareNodeStorage(home, 'web')
    assert.equal(webIdentity, path.join(nodeStorageDirectory(home, 'web'), 'identity.json'))
    assert.equal(webState, path.join(nodeStorageDirectory(home, 'web'), 'gate-wechat-state.json'))
    const before = loadOrCreateAgentIdentity(webIdentity)
    writeFileSync(webState, JSON.stringify({ version: 1, token: 'fixture-existing-binding' }))
    const keyBytes = readFileSync(webIdentity), stateBytes = readFileSync(webState)
    writeFileSync(defaultRelayConfigPath(web), JSON.stringify({ enabled: false }))
    const desktopId = loadOrCreateAgentIdentity(defaultAgentIdentityPath(desktop))
    assert.notEqual(desktopId.nodeId, before.nodeId)
    assert.notEqual(defaultGateStatePath(desktop), webState)
    assert.equal(existsSync(defaultGateStatePath(desktop)), false, 'no automatic binding copy')
    assert.deepEqual(readFileSync(webIdentity), keyBytes)
    assert.deepEqual(readFileSync(webState), stateBytes)
    assert.equal(loadPublicRelayConfig(defaultRelayConfigPath(web)), null)
    assert.equal(loadPublicRelayConfig(defaultRelayConfigPath(desktop)).enabled, true)
    const a = loadAgentDescriptor(web), b = loadAgentDescriptor(desktop)
    assert.equal(a.hostId, b.hostId, 'same machine metadata is not node authority')
    assert.notEqual(a.agentInstanceId, b.agentInstanceId)
    assert.equal(loadOrCreateAgentIdentity(defaultAgentIdentityPath(context(home, 'desktop'))).nodeId, desktopId.nodeId)
    assert.equal(loadOrCreateAgentIdentity(webIdentity).nodeId, before.nodeId)
  })
  test('fresh concurrent hosts converge on host metadata but keep separate agent identities', async t => {
    const home = fixture(t)
    context(home, 'web')
    const descriptors = await Promise.all(['web', 'desktop', 'extra-a', 'extra-b'].map(name => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--identity-worker', home, name], { windowsHide: true })
      let stdout = '', stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.once('error', reject)
      child.once('exit', code => {
        if (code !== 0) return reject(Error(stderr || `worker ${code}`))
        try { resolve(JSON.parse(stdout)) } catch (e) { reject(e) }
      })
    })))
    assert.equal(new Set(descriptors.map(d => d.hostId)).size, 1)
    assert.equal(new Set(descriptors.map(d => d.agentInstanceId)).size, 4)
  })
  test('bad launcher facts or bundled version fail closed before creating identities', t => {
    const home = fixture(t), base = context(home, 'desktop').get('profileContext')
    for (const patch of [{ name: '../web' }, { home: 'relative' }, { installAnchor: 'missing' }, { dir: null }]) {
      const ctx = { get: key => key === 'profileContext' ? { ...base, ...patch } : undefined }
      assert.throws(() => loadAgentDescriptor(ctx), /运行实例/)
    }
    const ctx = { get: key => key === 'profileContext' ? { ...base, installAnchor: path.join(home, 'missing.json') } : undefined }
    assert.throws(() => loadAgentDescriptor(ctx), /运行版本/)
    assert.equal(existsSync(path.join(home, 'harness-remote')), false)
    assert.equal(dshProfileFacts({ get: () => undefined }), undefined, 'legacy missing service is supported')
  })
  test('host event carrier uses bundled version even when Desktop entry is not the CLI', async t => {
    const home = fixture(t), signal = new AbortController().signal
    for (const [version, count] of [['0.1.5-rc.1', 3], ['0.1.5-rc.2', 3], ['0.1.6-alpha.2', 3], ['0.1.7-rc.1', 5], ['0.1.7-rc.2', 5]]) {
      const ctx = context(home, 'desktop', version), calls = []
      const gateway = { wireStream: { open: (...args) => { calls.push(args); return Promise.resolve([]) } } }
      await openHostEvents(gateway, 'events', {}, signal, ctx)
      assert.equal(calls.length, 1)
      assert.equal(calls[0].length, count)
      assert.equal(calls[0].at(-1), signal)
    }
  })
  test('native file fallback follows current host, not another installed CLI', t => {
    const home = fixture(t), args = { path: 'a.png', range: { offset: 0, length: 1 } }
    assert.deepEqual(workspaceReadArguments(context(home, 'desktop'), args), { path: 'a.png', options: { range: args.range } })
    assert.equal(workspaceReadArguments(context(home, 'web', '0.1.5-rc.2'), args), args)
  })
  test('Desktop cannot start CLI restart controller or offer a misleading npx --profile desktop command', async t => {
    const home = fixture(t), ctx = context(home, 'desktop')
    const release = { version: '1.7.20', channel: 'stable', asset: { url: 'https://github.com/martinbear1/dsh-wechat-remote/releases/download/v1.7.20/plugin.tgz', bytes: 100, sha256: 'a'.repeat(64) } }
    const advice = { targetVersion: release.version, severity: 'recommended', expiresAt: Date.now() + 60000 }
    const action = updateAction(advice, release, { eligible: true, reason: '' }, false, ctx)
    assert.equal(action.canInstall, false)
    assert.equal(action.manualCommand, '')
    assert.match(action.reason, /桌面应用的插件管理/)
    await assert.rejects(createInstallControl(ctx, {}), /未停止节点/)
    const missingHome = path.join(home, 'must-not-create')
    await assert.rejects(install({ home: missingHome, profileName: 'desktop' }), /未修改 Desktop 或 Web 配置/)
    assert.equal(existsSync(missingHome), false)
    for (const name of ['desktop', 'Desktop']) {
      await assert.rejects(installProfile({ profile: path.join(missingHome, 'profiles', name) }), /不能使用 CLI 修改/)
      assert.equal(existsSync(missingHome), false, 'native installer must not stage into the Desktop profile')
    }
    const old = process.env.HARNESS_REMOTE_UPDATE_JOB
    process.env.HARNESS_REMOTE_UPDATE_JOB = path.join(home, 'must-not-read-web-job')
    try {
      const service = new PluginUpdateService(ctx, { web: 19387, gate: 40000, local: 40001 })
      assert.equal(service.isMaintaining(), false)
    } finally {
      if (old === undefined) delete process.env.HARNESS_REMOTE_UPDATE_JOB
      else process.env.HARNESS_REMOTE_UPDATE_JOB = old
    }
  })
}
