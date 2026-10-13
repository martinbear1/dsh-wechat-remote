/** Opt-in integration of the actual published Web update button backend.
 * node script DSH_CLI OLD_CORE_TGZ CANDIDATE_CORE_TGZ NEW_ROOT [normal|background-write] [process|systemd]
 * Uses a fresh Linux fixture home and the unmodified old check/start/worker.
 * Only the unpublished release download URL is mapped to local artifact bytes.
 * No fake PluginManager, receipts, health responses, hashes, or version changes.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const [cliArg, baselineArg, candidateArg, rootArg, scenario = 'normal', manager = 'process'] = process.argv.slice(2)
const fault = scenario === 'background-write'
assert.equal(process.platform, 'linux', 'this real-host runner currently validates Linux Web only')
assert(cliArg && baselineArg && candidateArg && rootArg, 'DSH_CLI OLD_CORE_TGZ CANDIDATE_CORE_TGZ NEW_ROOT required')
assert(['normal', 'background-write'].includes(scenario))
assert(['process', 'systemd'].includes(manager))
const cli = fs.realpathSync(cliArg), baseline = fs.realpathSync(baselineArg), candidate = fs.realpathSync(candidateArg)
const root = path.resolve(rootArg)
assert(path.basename(root).startsWith('dsh-legacy-button-'), 'fixture root must start dsh-legacy-button-')
assert(!fs.existsSync(root), 'refusing to reuse any existing directory')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const tarFile = (file, member) => {
  const result = spawnSync('tar', ['-xOf', file, member], { encoding: null })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}
const oldManifest = JSON.parse(tarFile(baseline, 'package/package.json'))
const nextManifest = JSON.parse(tarFile(candidate, 'package/package.json'))
const owner = '@harness-remote/dsh-wechat-remote'
assert.equal(oldManifest.name, owner); assert.equal(nextManifest.name, owner)
const frozen = {
  '1.7.10': '5eb3b67760f15f3d468b5c85d84c595e9ba7b9c94bfb70eec8c0f5476e64a2dc',
  '1.7.13': '1438dcfff4b1684d68d1b3088e0b402714cef3d0676dd03bafbcd76932c3e813',
}
assert(frozen[oldManifest.version], 'use a verified published historical baseline')
assert.equal(sha(tarFile(baseline, 'package/lib/update-worker.js')), frozen[oldManifest.version])
const dsh = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json')))
assert.equal(dsh.name, '@deepseek-ai/dsh')
const candidateBytes = fs.readFileSync(candidate)
const releaseUrl = `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${nextManifest.version}/harness-remote-dsh-wechat-remote-${nextManifest.version}.tgz`
const report = { scope: 'frozen published Web check/start/worker against real official DSH',
  fixture: root, dsh: dsh.version, from: oldManifest.version, to: nextManifest.version,
  baselineSha256: sha(fs.readFileSync(baseline)), candidateSha256: sha(candidateBytes), frozenWorkerSha256: frozen[oldManifest.version],
  scenario, manager, checks: [], ok: false }
fs.mkdirSync(root, { recursive: true, mode: 0o700 })
const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web')
const manifestFile = path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote/package.json')
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
fs.mkdirSync(home)
json(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
const catalog = path.join(root, 'catalog.json')
json(catalog, { schemaVersion: 1, revision: 'isolated-frozen-button', issuedAt: Date.now() - 1000,
  expiresAt: Date.now() + 3600000, releases: [{ version: nextManifest.version, channel: 'preview',
    dsh: [dsh.version], platforms: ['linux'], architectures: [process.arch],
    asset: { url: releaseUrl, bytes: candidateBytes.length, sha256: sha(candidateBytes) } }], blocked: [], retiredDsh: [] })
const transport = path.join(root, 'transport.mjs')
fs.writeFileSync(transport, `import fs from 'node:fs';
const original = globalThis.fetch;
globalThis.fetch = (url, options) => String(url) === ${JSON.stringify(releaseUrl)}
  ? Promise.resolve(new Response(fs.readFileSync(${JSON.stringify(candidate)}))) : original(url, options);
`)
const tools = path.join(root, 'tool-payload'); fs.mkdirSync(tools)
const extracted = spawnSync('tar', ['-xzf', baseline, '-C', tools], { encoding: 'utf8' })
assert.equal(extracted.status, 0, extracted.stderr)
const pnpm = path.join(tools, 'package/node_modules/pnpm/bin/pnpm.cjs')
assert(fs.existsSync(pnpm))
const bin = path.join(root, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 0o700 })
const env = { ...process.env }
const inheritedPath = env.PATH || ''
for (const key of Object.keys(env)) if (/^(?:DSH_|WECHAT_GATE_|HARNESS_REMOTE_|DEEPSEEK_API_KEY$|NODE_OPTIONS$|INVOCATION_ID$|SYSTEMD_EXEC_PID$)/.test(key)) delete env[key]
Object.assign(env, { DSH_HOME: home, PATH: bin + ':' + inheritedPath,
  HARNESS_INSTALL_NODE: process.execPath, HARNESS_INSTALL_PNPM: pnpm, CI: 'true',
  COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false',
  HARNESS_REMOTE_UPDATE_CATALOG: catalog, HARNESS_REMOTE_UPDATE_CHANNEL: 'preview',
  NODE_OPTIONS: `--import=${pathToFileURL(transport).href}` })
let port
for (let candidatePort = 6910; candidatePort < 7500; candidatePort += 4) {
  try {
    for (const value of [candidatePort, candidatePort + 1, candidatePort + 2, candidatePort + 3]) await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject); server.listen(value, '0.0.0.0', () => server.close(resolve))
    })
    port = candidatePort; break
  } catch {}
}
assert(port, 'no free fixture ports')
Object.assign(env, { DSH_PORT: String(port), WECHAT_GATE_PORT: String(port + 2), WECHAT_GATE_LOCAL_PORT: String(port + 3) })
const probeToken = randomUUID(), probe = path.join(root, 'probe.mjs'), faultMarker = path.join(root, 'background-write.json')
const sessionId = 'session-frozen-upgrade-fixture', backgroundTitle = 'Native background write during legacy verification'
// Fixture-only diagnostics and a public native rename fault. Never replace any
// production health or update endpoint; the worker cannot use this server.
fs.writeFileSync(probe, `import fs from 'node:fs'; import http from 'node:http';
export const inject = ['sessionController', 'agentPresets', 'pluginManager'];
export async function apply(ctx) {
  if (${JSON.stringify(fault)}
      && JSON.parse(fs.readFileSync(${JSON.stringify(manifestFile)})).version === ${JSON.stringify(nextManifest.version)}
      && !fs.existsSync(${JSON.stringify(faultMarker)})) {
    const renamed = await ctx.get('sessionController').rename({ sessionId: ${JSON.stringify(sessionId)}, title: ${JSON.stringify(backgroundTitle)} });
    fs.writeFileSync(${JSON.stringify(faultMarker)}, JSON.stringify({ renamed, pid: process.pid }), { mode: 0o600 });
  }
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== ${JSON.stringify('Bearer ' + probeToken)}) { res.writeHead(403); res.end(); return; }
    try {
      let value;
      if (req.url === '/snapshot') {
        const host = ctx.get('wechatHost');
        value = { pid: process.pid, version: JSON.parse(fs.readFileSync(${JSON.stringify(manifestFile)})).version,
          described: host ? await host.describe({}, AbortSignal.timeout(5000)) : null,
          bundles: await ctx.get('pluginManager').listBundles(),
          entries: [...ctx.get('loader').entries()].map(e => ({ id: e.options.id, state: e.fiber?.state })),
          sessions: await ctx.get('sessionController').list({}, AbortSignal.timeout(10000)) };
      } else if (req.url === '/inspect') {
        value = await ctx.get('sessionController').inspect(${JSON.stringify(sessionId)}, AbortSignal.timeout(10000));
      } else if (req.url === '/seed') {
        value = await ctx.get('sessionController').create({ cwd: ${JSON.stringify(root)}, sessionId: ${JSON.stringify(sessionId)}, agentPreset: 'standard' });
        const session = ctx.get('sessions').get(value.sessionId);
        if (!session || !await ctx.get('sessions').flush(session)) throw Error('fixture session not persisted');
      } else if (req.url === '/exit') {
        value = { stopping: true }; setTimeout(() => ctx.get('appExit')(0), 20);
      } else throw Error('unknown fixture request');
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(error.stack || error) })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(${port + 1}, '127.0.0.1', resolve); });
  ctx.effect(() => () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
}
`)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let child, jobDirectory, fixtureUnit, fixtureUnitLink
async function probeCall(operation) {
  const response = await fetch(`http://127.0.0.1:${port + 1}/${operation}`, {
    headers: { authorization: 'Bearer ' + probeToken }, signal: AbortSignal.timeout(12000) })
  const value = await response.json()
  assert(response.ok, value.error || `fixture HTTP ${response.status}`)
  return value
}
async function ready(expected) {
  for (let i = 0; i < 180; i++) {
    try {
      const result = await probeCall('snapshot')
      if (result.described?.value?.pluginVersion === expected) return result
    } catch {}
    await pause(500)
  }
  throw Error(`fixture ${expected} not ready; inspect runtime/restart logs`)
}
async function updateCall(route, body) {
  const response = await fetch(`http://127.0.0.1:${port + 3}/gate/update${route}`, {
    method: body ? 'POST' : 'GET', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) })
  const value = await response.json(); assert(response.ok, value.error || `update HTTP ${response.status}`); return value
}
function savedFiles() {
  const files = {}
  const walk = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) files[path.relative(home, file)] = sha(fs.readFileSync(file))
    }
  }
  walk(path.join(home, 'sessions'))
  files['fixture-user-settings.json'] = sha(fs.readFileSync(path.join(home, 'fixture-user-settings.json')))
  return files
}
async function nativeInstall() {
  const log = fs.openSync(path.join(root, 'baseline-install.log'), 'a', 0o600)
  const install = spawn(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', `file:${baseline}`,
    '--ignore-scripts', '--config.frozen-lockfile=false', '--reporter=append-only'], { cwd: root, env, stdio: ['ignore', log, log] })
  fs.closeSync(log)
  assert.equal(await new Promise((resolve, reject) => { install.once('error', reject); install.once('exit', resolve) }), 0)
}
try {
  await nativeInstall()
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'session-title-llm', disabled: true }, { insert: [{ id: 'fixture-frozen-update', name: pathToFileURL(probe).href }] },
  ], null, 2))
  json(path.join(home, 'fixture-user-settings.json'), { fixture: randomUUID(), theme: 'dark' })
  const hostArgs = [cli, '--profile', 'web', '--port', String(port), '--no-open']
  if (manager === 'systemd') {
    fixtureUnit = `dsh-legacy-button-fixture-${randomUUID()}.service`
    const environment = Object.entries(env).filter(([key]) => /^(DSH_|WECHAT_GATE_|HARNESS_|NODE_OPTIONS$|PATH$|CI$|COREPACK_|npm_config_)/.test(key))
      .map(([key, value]) => `${key}=${value}`)
    const quote = value => JSON.stringify(value).replaceAll('%', '%%')
    const unitFile = path.join(root, fixtureUnit)
    // A restartable fixture needs a persistent definition. A transient unit is
    // unloaded on stop and cannot model a real managed Web service rollback.
    fs.writeFileSync(unitFile, `[Unit]\nDescription=Isolated legacy upgrade fixture\n[Service]\nType=exec\nKillMode=control-group\nWorkingDirectory=${root}\nExecStart=:/usr/bin/env ${environment.concat(process.execPath, hostArgs).map(quote).join(' ')}\nStandardOutput=append:${path.join(root, 'runtime.log')}\nStandardError=append:${path.join(root, 'runtime.log')}\n`, { flag: 'wx', mode: 0o600 })
    const unitDirectory = path.join(os.homedir(), '.config/systemd/user')
    fs.mkdirSync(unitDirectory, { recursive: true })
    fixtureUnitLink = path.join(unitDirectory, fixtureUnit)
    fs.symlinkSync(unitFile, fixtureUnitLink)
    const reloaded = spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' })
    assert.equal(reloaded.status, 0, reloaded.stderr)
    const started = spawnSync('systemctl', ['--user', 'start', fixtureUnit], { encoding: 'utf8' })
    assert.equal(started.status, 0, started.stderr)
  } else {
    const log = fs.openSync(path.join(root, 'runtime.log'), 'a', 0o600)
    child = spawn(process.execPath, hostArgs, { cwd: root, env, stdio: ['ignore', log, log] })
    fs.closeSync(log)
  }
  const original = await ready(oldManifest.version)
  await probeCall('seed')
  const beforeFiles = savedFiles()
  const check = await updateCall('/check')
  report.checks.push({ stage: 'original-button-check', canInstall: check.canInstall, reason: check.reason, targetVersion: check.advice?.targetVersion })
  assert.equal(check.canInstall, true, check.reason)
  assert(check.ticket)
  const started = await updateCall('/start', { ticket: check.ticket })
  assert.match(started.jobId, /^[a-f0-9]{32}$/)
  jobDirectory = path.join(home, 'harness-remote-updates', started.jobId)
  assert.equal(sha(fs.readFileSync(path.join(jobDirectory, 'update-worker.js'))), frozen[oldManifest.version])
  assert.equal(sha(fs.readFileSync(path.join(jobDirectory, 'release.tgz'))), report.candidateSha256)
  const job = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'job.json')))
  assert.equal(job.home, home); assert.equal(job.profile, profile); assert.equal(job.previousVersion, oldManifest.version)
  assert.equal(job.manager.kind, manager)
  if (fixtureUnit) assert.equal(job.manager.unit, fixtureUnit)
  const binding = () => {
    const state = JSON.parse(fs.readFileSync(job.stateFile))
    return sha(Buffer.from(JSON.stringify([state.token, state.publicIdentityNodeId])))
  }
  const beforeBinding = binding()
  let result, lastPhase
  for (let i = 0; i < 1800; i++) {
    try { result = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'result.json'))) } catch {}
    if (result?.phase && result.phase !== lastPhase) {
      lastPhase = result.phase; console.log(JSON.stringify({ version: oldManifest.version, scenario: report.scenario, phase: lastPhase }))
    }
    if (result?.terminal) break
    await pause(500)
  }
  assert(result?.terminal, 'frozen worker did not finish within fixture deadline')
  report.result = result
  report.receiptExists = fs.existsSync(path.join(jobDirectory, 'verification-complete.json'))
  report.checks.push({ stage: 'frozen-worker-terminal', ...result })
  if (fault) {
    assert(fs.existsSync(faultMarker), 'native background write was not injected; scenario is invalid')
    const snapshot = await probeCall('snapshot')
    assert.equal(snapshot.version, oldManifest.version, 'fault case must inspect the genuinely restored old profile')
    const persisted = await probeCall('inspect')
    const titleEvent = persisted.events.find(event => event.type === 'session/title' && event.data?.title === backgroundTitle)
    assert(titleEvent, 'the legitimate native background write was lost')
    report.backgroundWritePreserved = true
    report.nativeBackgroundOutcome = { version: snapshot.version, titleEvent }
    assert.equal(result.phase, 'attention', 'historical rollback risk changed; review real outcome')
    const failed = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'failure.json')))
    const rollbackFailed = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'rollback-failure.json')))
    assert.match(failed.message, /数据校验不一致/, 'failure must be the genuine unchanged-byte check')
    assert.match(rollbackFailed.message, /数据校验不一致/, 'rollback must fail for the preserved new bytes, not another failure')
    report.backgroundFailure = { failure: failed.message, rollback: rollbackFailed.message }
    // The unchanged worker truthfully rejected its byte-identical assertion.
    // A separate bounded recovery verifies that old bytes are an exact prefix,
    // that the original host is actually usable, and releases maintenance only.
    // It must never rewrite the worker result to claim an upgrade succeeded.
    let recovery
    for (let i = 0; i < 120; i++) {
      try { recovery = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'maintenance-recovery.json'))) } catch {}
      if (recovery?.outcome === 'rollback-recovered' && recovery.maintenanceReleased === true) break
      await pause(500)
    }
    assert.equal(recovery?.outcome, 'rollback-recovered', JSON.stringify(recovery))
    assert.equal(recovery.maintenanceReleased, true, 'rollback recovery did not finish releasing maintenance')
    report.recovery = recovery
    const release = JSON.parse(fs.readFileSync(path.join(jobDirectory, 'verification-complete.json')))
    assert.equal(release.id, job.id)
    assert.equal(release.outcome, 'rollback-recovered')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(jobDirectory, 'result.json'))), result,
      'recovery must not replace the original failed upgrade result')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(jobDirectory, 'failure.json'))), failed)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(jobDirectory, 'rollback-failure.json'))), rollbackFailed)
    assert.equal(binding(), beforeBinding)
    assert(!fs.existsSync(path.join(profile, '.harness-remote-update.lock')), 'recovered transaction lock was retained')
    report.receiptExists = true
    report.faultMechanism = 'Fixture plugin calls the public in-process native sessionController.rename during candidate boot; no external HTTP request or guard bypass.'
    report.legacyRollbackFence = []
    for (const [channel, gatePort] of [['web', port], ['public', port + 2], ['local', port + 3]]) {
      try {
        const response = await fetch(`http://127.0.0.1:${gatePort}/gate/status`, { signal: AbortSignal.timeout(5000) })
        report.legacyRollbackFence.push({ channel, port: gatePort, status: response.status, body: await response.text() })
      } catch (error) { report.legacyRollbackFence.push({ channel, port: gatePort, error: String(error) }) }
    }
    report.legacyRollbackStillFenced = report.legacyRollbackFence.every(item => item.status === 503)
    assert(report.legacyRollbackFence.every(item => Number.isInteger(item.status) && item.status !== 503),
      'the restored old host must release all three maintenance fences')
    const retry = await updateCall('/check')
    assert.equal(retry.canInstall, true, retry.reason)
    report.retryAvailable = true
    report.ok = true
  } else {
    assert.equal(result.ok, true, result.message)
    assert.equal(result.phase, 'complete')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(jobDirectory, 'verification-complete.json'))), { id: job.id })
    const after = await ready(nextManifest.version)
    assert.notEqual(after.pid, original.pid)
    const owners = after.bundles.filter(bundle => [owner, 'dsh-wechat-remote'].includes(bundle.name) && bundle.installed)
    assert.equal(owners.length, 1); assert.equal(owners[0].name, owner)
    assert.equal(owners[0].version, nextManifest.version)
    assert(after.sessions.items.some(item => item.sessionId === sessionId))
    for (const id of ['gate', 'wechat-clawbot', 'harness-group-assistants', 'harness-resource-library']) {
      assert(after.entries.some(entry => entry.id === id && entry.state === 2), `component inactive after handoff: ${id}`)
    }
    const afterFiles = savedFiles()
    for (const [file, digest] of Object.entries(beforeFiles)) assert.equal(afterFiles[file], digest, `existing fixture file changed: ${file}`)
    assert.equal(binding(), beforeBinding)
    const gateResponse = await fetch(`http://127.0.0.1:${job.localPort}/gate/status`, { signal: AbortSignal.timeout(5000) })
    const gateStatus = await gateResponse.json()
    assert.equal(gateStatus.gate.management, 'authenticated-rpc')
    assert.equal(gateStatus.gate.updates, 'native-v1', 'upgraded Web must advertise the actual native manager')
    const response = await fetch(`http://127.0.0.1:${port}/gate/status`, { signal: AbortSignal.timeout(5000) })
    assert.notEqual(response.status, 503, 'temporary native route was not released')
    assert(!fs.existsSync(path.join(profile, '.harness-remote-update.lock')), 'old worker lock was not released')
    report.checks.push({ stage: 'fully-restarted', actualVersion: after.described.value.pluginVersion,
      oneOwner: true, sixComponentsActive: true, sessionFilesUnchanged: true, pairingUnchanged: true, temporaryRouteReleased: true,
      nativeUpdates: gateStatus.gate.updates })
    report.ok = true
  }
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  // The diagnostic server belongs only to this fresh fixture. Use native appExit
  // even when the frozen legacy Web HTTP fence survives a failed rollback.
  try { await probeCall('exit') } catch {}
  if (fixtureUnit) {
    assert.match(fixtureUnit, /^dsh-legacy-button-fixture-[a-f0-9-]+\.service$/)
    spawnSync('systemctl', ['--user', 'stop', fixtureUnit], { encoding: 'utf8', timeout: 15000 })
    if (fixtureUnitLink && fs.existsSync(fixtureUnitLink)) {
      assert.equal(fs.readlinkSync(fixtureUnitLink), path.join(root, fixtureUnit))
      fs.unlinkSync(fixtureUnitLink)
      spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8', timeout: 15000 })
    }
  }
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  json(path.join(root, 'result.json'), report)
}
console.log(JSON.stringify(report, null, 2))
