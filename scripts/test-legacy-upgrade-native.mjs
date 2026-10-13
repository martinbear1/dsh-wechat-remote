/** Opt-in real native Web host upgrade from an unmodified historical core.
 * node test-legacy-upgrade-native.mjs DSH_CLI OLD_CORE_TGZ NEW_CORE_TGZ [NEW_ROOT]
 * Only a freshly created fixture home is used. The actual public PluginManager
 * installs the same owner, then a cold fixture restart verifies activation.
 * This does NOT exercise the frozen old Web update worker or Desktop Electron.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const [cliArg, oldArg, candidateArg, rootArg] = process.argv.slice(2)
assert(cliArg && oldArg && candidateArg, 'DSH_CLI OLD_CORE_TGZ NEW_CORE_TGZ required')
const cli = fs.realpathSync(cliArg), baseline = fs.realpathSync(oldArg), candidate = fs.realpathSync(candidateArg)
const root = rootArg ? path.resolve(rootArg) : path.join(fs.realpathSync(os.tmpdir()), `dsh-legacy-native-${randomUUID()}`)
assert(path.basename(root).startsWith('dsh-legacy-native-'), 'fixture root must start dsh-legacy-native-')
assert(!fs.existsSync(root), 'refusing to reuse any existing directory')
const manifestOf = file => {
  const value = spawnSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8', windowsHide: true })
  assert.equal(value.status, 0, value.stderr)
  return JSON.parse(value.stdout)
}
const oldManifest = manifestOf(baseline), nextManifest = manifestOf(candidate)
const owner = '@harness-remote/dsh-wechat-remote'
assert.equal(oldManifest.name, owner); assert.equal(nextManifest.name, owner)
assert(['1.7.10', '1.7.13'].includes(oldManifest.version), 'use a published historical baseline')
const dshRoot = path.resolve(cli, '../..'), dshManifest = JSON.parse(fs.readFileSync(path.join(dshRoot, 'package.json')))
assert.equal(dshManifest.name, '@deepseek-ai/dsh')
assert(fs.existsSync(path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-plugin-manager/package.json')),
  'this official host must ship the native PluginManager; an older CLI is not native-updater coverage')
fs.mkdirSync(root, { recursive: true, mode: 0o700 })
const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = { scope: 'real native Web same-owner upgrade; not old-worker or Desktop acceptance',
  fixture: root, dsh: dshManifest.version, from: oldManifest.version, to: nextManifest.version, checks: [], ok: false }
const tools = path.join(root, 'tool-payload'); fs.mkdirSync(tools)
const extraction = spawnSync('tar', ['-xzf', baseline, '-C', tools], { encoding: 'utf8', windowsHide: true })
assert.equal(extraction.status, 0, extraction.stderr)
const pnpm = path.join(tools, 'package/node_modules/pnpm/bin/pnpm.cjs')
assert(fs.existsSync(pnpm), 'historical archive must provide its bundled pnpm')
const bin = path.join(root, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'), process.platform === 'win32'
  ? '@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%HARNESS_INSTALL_NODE%" "%HARNESS_INSTALL_PNPM%" %*\r\n'
  : '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 0o700 })
const env = { ...process.env }
const previousPath = Object.keys(env).find(key => key.toLowerCase() === 'path')
const inheritedPath = previousPath ? env[previousPath] : ''
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' || /^(?:DSH_|WECHAT_GATE_|HARNESS_REMOTE_|DEEPSEEK_API_KEY$|NODE_OPTIONS$)/.test(key)) delete env[key]
Object.assign(env, { DSH_HOME: home, PATH: bin + path.delimiter + inheritedPath,
  HARNESS_INSTALL_NODE: process.execPath, HARNESS_INSTALL_PNPM: pnpm, CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0',
  npm_config_manage_package_manager_versions: 'false' })
fs.mkdirSync(home)
write(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
write(path.join(root, 'catalog.json'), { schemaVersion: 1, revision: 'isolated-native-upgrade-fixture',
  issuedAt: Date.now() - 1000, expiresAt: Date.now() + 86400000, releases: [], blocked: [], retiredDsh: [] })
env.HARNESS_REMOTE_UPDATE_CATALOG = path.join(root, 'catalog.json')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let child, sequence = 0
const waiting = new Map()
async function run(args, name) {
  const fd = fs.openSync(path.join(root, `${name}.log`), 'a', 0o600)
  const processHandle = spawn(process.execPath, [cli, ...args], { cwd: root, env, stdio: ['ignore', fd, fd], windowsHide: true })
  fs.closeSync(fd)
  const code = await new Promise((resolve, reject) => { processHandle.once('error', reject); processHandle.once('exit', resolve) })
  assert.equal(code, 0, `${name} failed; see fixture log`)
}
const probe = path.join(root, 'probe.mjs')
fs.writeFileSync(probe, `
export const inject = ['pluginManager', 'sessionController', 'agentPresets'];
export function apply(ctx) {
  const signal = () => AbortSignal.timeout(20000);
  const receive = async message => {
    if (!message || message.fixture !== 'native-upgrade' || !message.id) return;
    try {
      let value;
      if (message.op === 'snapshot') {
        const host = ctx.get('wechatHost');
        if (!host) throw Error('waiting for wechatHost');
        const described = await host.describe({}, signal());
        const bundles = await ctx.get('pluginManager').listBundles();
        const presets = await ctx.get('agentPresets').list();
        const entries = [...ctx.get('loader').entries()].map(entry => ({ id: entry.options.id, name: entry.options.name, state: entry.fiber?.state }));
        value = { described, bundles, presets, entries, sessions: await ctx.get('sessionController').list({}, signal()) };
      } else if (message.op === 'seed') {
        const created = await ctx.get('sessionController').create({ cwd: message.cwd, sessionId: 'session-upgrade-fixture', agentPreset: 'standard' });
        const session = ctx.get('sessions').get(created.sessionId);
        if (!session || !await ctx.get('sessions').flush(session)) throw Error('fixture session was not persisted');
        value = created;
      } else if (message.op === 'install') {
        value = await ctx.get('pluginManager').installBundle(message.spec, { enabled: true, requestId: message.requestId });
      } else if (message.op === 'inspect') {
        value = await ctx.get('pluginManager').inspect(message.spec);
      } else throw Error('unsupported fixture operation');
      process.send?.({ fixture: 'native-upgrade', id: message.id, value });
    } catch (error) { process.send?.({ fixture: 'native-upgrade', id: message.id, error: String(error?.stack || error) }); }
  };
  process.on('message', receive);
  ctx.effect(() => () => process.off('message', receive));
  process.send?.({ fixture: 'native-upgrade', ready: true });
}
`)
let webPort
for (let port = 6410; port < 6900; port += 4) {
  try {
    for (const value of [port, port + 2, port + 3]) await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject); server.listen(value, '0.0.0.0', () => server.close(resolve))
    })
    webPort = port; break
  } catch {}
}
assert(webPort, 'no free fixture ports')
Object.assign(env, { DSH_PORT: String(webPort), WECHAT_GATE_PORT: String(webPort + 2), WECHAT_GATE_LOCAL_PORT: String(webPort + 3) })
async function launch(label) {
  const fd = fs.openSync(path.join(root, `${label}.log`), 'a', 0o600)
  child = spawn(process.execPath, [cli, '--profile', 'web', '--port', String(webPort), '--no-open'],
    { cwd: root, env, stdio: ['ignore', fd, fd, 'ipc'], windowsHide: true })
  fs.closeSync(fd)
  child.on('message', message => {
    if (message?.fixture !== 'native-upgrade' || !message.id) return
    const request = waiting.get(message.id)
    if (!request) return
    waiting.delete(message.id); clearTimeout(request.timer)
    message.error ? request.reject(Error(message.error)) : request.resolve(message.value)
  })
  child.on('exit', (code, signal) => {
    for (const [id, request] of waiting) { waiting.delete(id); clearTimeout(request.timer); request.reject(Error(`fixture exited: ${code ?? signal}`)) }
  })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error(`${label} startup failed; see fixture log`)
    try { return await call('snapshot', {}, 1500) } catch {}
    await pause(500)
  }
  throw Error(`${label} startup timeout; see fixture log`)
}
function call(op, fields = {}, timeout = 180000) {
  const id = String(++sequence)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(Error(`fixture ${op} timeout`)) }, timeout)
    waiting.set(id, { resolve, reject, timer })
    child.send({ fixture: 'native-upgrade', id, op, ...fields }, error => {
      if (error) { clearTimeout(timer); waiting.delete(id); reject(error) }
    })
  })
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const processHandle = child
  processHandle.kill('SIGTERM')
  for (let attempt = 0; attempt < 300; attempt++) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) return
    await pause(100)
  }
  throw Error('fixture did not finish normal shutdown; evidence retained, no other process was stopped')
}
const savedFiles = () => {
  const result = {}
  const walk = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) result[path.relative(home, file)] = sha(fs.readFileSync(file))
    }
  }
  walk(path.join(home, 'sessions'))
  result['fixture-user-settings.json'] = sha(fs.readFileSync(path.join(home, 'fixture-user-settings.json')))
  return result
}
const bindings = () => {
  const result = []
  const walk = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory() && !['profiles', 'harness-remote-updates'].includes(entry.name)) walk(file)
      else if (entry.isFile() && /(?:gate-wechat-state|identity).*\.json$/.test(entry.name)) {
        const value = JSON.parse(fs.readFileSync(file))
        if (value.token) result.push(sha(Buffer.from(JSON.stringify([value.token, value.publicIdentityNodeId ?? null]))))
        if (value.privateKeyPem) result.push(sha(Buffer.from(JSON.stringify([value.nodeId, value.privateKeyPem, value.publicKeyPem]))))
      }
    }
  }
  walk(home)
  return [...new Set(result)].sort()
}
try {
  await run(['plugin', '--profile', 'web', 'add', `file:${baseline}`, '--ignore-scripts', '--config.frozen-lockfile=false', '--reporter=append-only'], 'baseline-install')
  const initial = JSON.parse(fs.readFileSync(path.join(profile, 'package.json')))
  assert.deepEqual(initial.dsh.profile.bundles.filter(name => [owner, 'dsh-wechat-remote'].includes(name)), [owner])
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'session-title-llm', disabled: true },
    { insert: [{ id: 'fixture-native-upgrade', name: pathToFileURL(probe).href }] },
  ], null, 2))
  write(path.join(home, 'fixture-user-settings.json'), { fixture: 'preserve exact settings bytes', id: randomUUID() })
  const before = await launch('before')
  assert.equal(before.described.value.pluginVersion, oldManifest.version)
  await call('seed', { cwd: root })
  const beforeFiles = savedFiles(), beforeBindings = bindings()
  assert(beforeBindings.length, 'actual isolated gate must create a synthetic pairing identity')
  const outcome = await call('install', { spec: candidate, requestId: randomUUID() }, 600000)
  assert.equal(outcome.bundle, owner)
  assert.equal(outcome.error, undefined, JSON.stringify(outcome))
  assert.equal(outcome.application, 'restart-required')
  report.checks.push({ stage: 'actual-manager-same-owner-install', application: outcome.application, bundle: outcome.bundle })
  await stop()
  const after = await launch('after')
  assert.equal(after.described.value.pluginVersion, nextManifest.version)
  const owners = after.bundles.filter(bundle => [owner, 'dsh-wechat-remote'].includes(bundle.name) && bundle.installed)
  assert.equal(owners.length, 1)
  assert.equal(owners[0].name, owner); assert.equal(owners[0].version, nextManifest.version)
  assert(after.sessions.items.some(session => session.sessionId === 'session-upgrade-fixture'))
  assert(after.presets.some(preset => preset.id === 'standard'), 'native standard preset must remain available')
  // This fixture has no real account or beta grant. Component activation must
  // not silently turn into entitlement, so collaboration presets stay absent.
  for (const id of ['harness-teacher', 'harness-project', 'harness-customizer']) assert(!after.presets.some(preset => preset.id === id), `ungranted preset activated: ${id}`)
  for (const id of ['gate', 'wechat-clawbot', 'harness-group-assistants', 'harness-resource-library']) {
    const entry = after.entries.find(entry => entry.id === id)
    assert(entry && entry.state === 2, `native component not active: ${id}`)
  }
  const afterFiles = savedFiles()
  for (const [file, digest] of Object.entries(beforeFiles)) assert.equal(afterFiles[file], digest, `preexisting fixture data changed: ${file}`)
  assert.deepEqual(bindings(), beforeBindings, 'synthetic pairing/identity changed')
  const finalManifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json')))
  assert.deepEqual(finalManifest.dsh.profile.bundles.filter(name => [owner, 'dsh-wechat-remote'].includes(name)), [owner])
  report.checks.push({ stage: 'cold-restart', runtimeVersion: after.described.value.pluginVersion, singleOwner: true,
    nativeStandardPresetPreserved: true, ungrantedCollaborationPresetsRemainAbsent: true, nativeComponentsActive: true,
    nativeFixtureSessionPreserved: true, fixtureFileHashesPreserved: true, syntheticPairingPreserved: true })
  report.ok = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  try { await stop() } catch (error) { report.stopError = error.message; report.ok = false; process.exitCode = 1 }
  write(path.join(root, 'result.json'), report)
}
console.log(JSON.stringify(report, null, 2))
