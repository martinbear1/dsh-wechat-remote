/** Opt-in full-host proof: original native outer 1.7.13 -> actual familiar NPX
 * command -> optional subsequent native one-click update -> cold restart.
 * Usage: node script FIXTURE_CONFIG_JSON
 * Config fields: cli, old, first, root, optional next (absolute paths).
 * Uses an isolated home/cache and a loopback npm registry, never npm publication.
 * No real account, model task, plugin byte patch, lifecycle takeover or Desktop
 * installation. Other Web hosts must already be stopped, as the product requires.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Keep host and artifact locations together in an auditable test configuration,
// without turning them into alternative flags for the user's NPX command.
const configFile = process.argv[2]
assert(configFile && process.argv.length === 3, 'one FIXTURE_CONFIG_JSON required')
const { cli: cliArg, old: oldArg, first: firstArg, root: rootArg, next: nextArg } = JSON.parse(fs.readFileSync(configFile, 'utf8'))
assert([cliArg, oldArg, firstArg, rootArg].every(value => typeof value === 'string' && path.isAbsolute(value)), 'cli, old, first and root must be absolute paths')
assert(['darwin', 'linux'].includes(process.platform), 'full-host NPX proof currently supports POSIX; do not report a Windows pass')
const cli = fs.realpathSync(cliArg)
// macOS /tmp is a symlink to /private/tmp. The product correctly requires an
// unambiguous destination; canonicalize this fresh fixture before passing it.
const requestedRoot = path.resolve(rootArg)
const root = path.join(fs.realpathSync(path.dirname(requestedRoot)), path.basename(requestedRoot))
assert(path.basename(root).startsWith('dsh-npx-native-transition-'))
assert(!fs.existsSync(root), 'never reuse an existing profile')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const member = (archive, entry) => {
  const result = spawnSync('tar', ['-xOf', archive, entry], { maxBuffer: 64 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout
}
const readArchive = arg => {
  const file = fs.realpathSync(arg), bytes = fs.readFileSync(file)
  return { file, bytes, manifest: JSON.parse(member(file, 'package/package.json')), sha256: sha(bytes) }
}
const old = readArchive(oldArg), first = readArchive(firstArg), next = nextArg ? readArchive(nextArg) : undefined
const owner = 'dsh-wechat-remote', core = '@harness-remote/dsh-wechat-remote'
for (const artifact of [old, first, next].filter(Boolean)) assert.equal(artifact.manifest.name, owner)
assert.equal(old.manifest.version, '1.7.13')
assert.equal(old.sha256, '411bc900c9204aae1a0531761827ac0541af0c0ea763c83679890efe7d429c13', 'baseline must be original published 1.7.13')
assert.notEqual(first.manifest.version, old.manifest.version)
if (next) assert.notEqual(next.manifest.version, first.manifest.version)
const dsh = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json')))
assert.equal(dsh.name, '@deepseek-ai/dsh')
const nodeDir = path.dirname(process.execPath)
const npx = [path.join(nodeDir, 'node_modules/npm/bin/npx-cli.js'),
  path.join(nodeDir, '../lib/node_modules/npm/bin/npx-cli.js'),
  '/usr/local/lib/node_modules/npm/bin/npx-cli.js', '/usr/share/nodejs/npm/bin/npx-cli.js'].find(file => fs.existsSync(file))
assert(npx, 'real npm npx-cli.js is required')
fs.mkdirSync(root, { recursive: true, mode: 0o700 })
const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web'), cache = path.join(root, 'npm-cache')
const catalog = path.join(root, 'catalog.json'), fixtureId = randomUUID(), sessionId = 'npx-native-fixture'
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
fs.mkdirSync(home)
json(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
const report = { fixture: root, platform: process.platform, dsh: dsh.version, command: 'npx -y dsh-wechat-remote@latest',
  from: old.manifest.version, first: first.manifest.version, next: next?.manifest.version,
  firstSha256: first.sha256, nextSha256: next?.sha256,
  scope: 'actual NPX + official full Web host + native operator update; not GUI automation or user acceptance',
  fixtureOverrides: { npmRegistry: 'process-scoped loopback', nativeManagerRegistry: 'fixture profile setting; no public fallback', webPort: 'fixture profile setting' },
  checks: [], ok: false }
const tools = path.join(root, 'tooling'); fs.mkdirSync(tools)
const extracted = spawnSync('tar', ['-xzf', old.file, '-C', tools], { encoding: 'utf8' })
assert.equal(extracted.status, 0, extracted.stderr)
const pnpm = path.join(tools, 'package/node_modules/pnpm/bin/pnpm.cjs')
assert(fs.existsSync(pnpm))
const bin = path.join(root, 'bin'); fs.mkdirSync(bin)
fs.symlinkSync(process.execPath, path.join(bin, 'node'))
fs.symlinkSync(cli, path.join(bin, 'dsh'))
fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexec "$HARNESS_INSTALL_NODE" "$HARNESS_INSTALL_PNPM" "$@"\n', { mode: 0o700 })
const env = { ...process.env }
for (const key of Object.keys(env)) if (/^(DSH_|WECHAT_GATE_|HARNESS_REMOTE_|DEEPSEEK_API_KEY$|NODE_OPTIONS$|npm_config_|NPM_CONFIG_)/.test(key)) delete env[key]
const npmrc = path.join(root, 'npmrc'), globalNpmrc = path.join(root, 'global-npmrc')
fs.writeFileSync(npmrc, '', { mode: 0o600 }); fs.writeFileSync(globalNpmrc, '', { mode: 0o600 })
Object.assign(env, { DSH_HOME: home, PATH: bin + ':' + nodeDir + ':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  HARNESS_INSTALL_NODE: process.execPath, HARNESS_INSTALL_PNPM: pnpm, CI: 'true',
  npm_config_cache: cache, npm_config_prefix: path.join(root, 'npm-global'), npm_config_userconfig: npmrc,
  npm_config_globalconfig: globalNpmrc, npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_store_dir: path.join(root, 'pnpm-store'), COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false',
  HARNESS_REMOTE_UPDATE_CATALOG: catalog, HARNESS_REMOTE_UPDATE_CHANNEL: 'preview' })
let port
for (let firstPort = 7810; firstPort < 8300; firstPort += 4) {
  try {
    for (let value = firstPort; value < firstPort + 4; value++) await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject); server.listen(value, '0.0.0.0', () => server.close(resolve))
    })
    port = firstPort; break
  } catch {}
}
assert(port)
const origin = `http://127.0.0.1:${port}`
Object.assign(env, { DSH_PORT: String(port), WECHAT_GATE_PORT: String(port + 2), WECHAT_GATE_LOCAL_PORT: String(port + 3) })
let registryOrigin, latest = first.manifest.version
const requests = [], artifacts = [old, first, next].filter(Boolean)
const metadata = artifact => ({ ...artifact.manifest, dist: {
  tarball: `${registryOrigin}/${owner}/-/${owner}-${artifact.manifest.version}.tgz`,
  shasum: createHash('sha1').update(artifact.bytes).digest('hex'),
  integrity: `sha512-${createHash('sha512').update(artifact.bytes).digest('base64')}`,
} })
const registry = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname
  requests.push({ method: req.method, route })
  if (req.method === 'POST' && route.startsWith('/-/npm/v1/security/')) { res.setHeader('content-type', 'application/json'); res.end('{}'); return }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
  for (const artifact of artifacts) {
    if (route === `/${owner}/-/${owner}-${artifact.manifest.version}.tgz`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': artifact.bytes.length })
      res.end(req.method === 'HEAD' ? undefined : artifact.bytes); return
    }
    if (route === `/${owner}/${artifact.manifest.version}` || (route === `/${owner}/latest` && artifact.manifest.version === latest)) {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(metadata(artifact))); return
    }
  }
  if (route === `/${owner}`) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ name: owner, 'dist-tags': { latest }, versions: Object.fromEntries(artifacts.map(a => [a.manifest.version, metadata(a)])) })); return
  }
  // Deliberately no public-registry fallback or install script approvals.
  res.writeHead(404); res.end(JSON.stringify({ error: 'not found', route }))
})
await new Promise((resolve, reject) => { registry.once('error', reject); registry.listen(0, '127.0.0.1', resolve) })
registryOrigin = `http://127.0.0.1:${registry.address().port}`
env.npm_config_registry = registryOrigin
const auth = randomUUID(), probe = path.join(root, 'probe.mjs')
fs.copyFileSync(fileURLToPath(new URL('./fixtures/npx-native-transition-probe.mjs', import.meta.url)), probe)
json(path.join(root, 'probe.json'), { root, fixtureId, auth, sessionId, origin, port: port + 1 })
const writeCatalog = artifact => {
  const release = structuredClone(JSON.parse(member(artifact.file, 'package/assets/release.json')).catalog.releases.find(item => item.version === artifact.manifest.version))
  assert(release, 'candidate must contain its release metadata')
  release.npmInstaller = { version: artifact.manifest.version,
    url: `https://registry.npmjs.org/${owner}/-/${owner}-${artifact.manifest.version}.tgz`, sha256: artifact.sha256, bytes: artifact.bytes.length }
  json(catalog, { schemaVersion: 1, revision: 'isolated-npx-' + artifact.manifest.version,
    issuedAt: Date.now() - 1000, expiresAt: Date.now() + 3600000, releases: [release], blocked: [], retiredDsh: [] })
}
writeCatalog(first)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const ownedPids = new Set()
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
async function call(route, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${port + 1}/${route}`, { method,
    headers: { authorization: 'Bearer ' + auth }, signal: AbortSignal.timeout(10000) })
  const value = await response.json(); assert(response.ok, value.error); return value
}
let child, cookie
function start() {
  const log = fs.openSync(path.join(root, 'runtime.log'), 'a', 0o600)
  child = spawn(process.execPath, [cli, '--profile', 'web', '--port', String(port), '--no-open'], { cwd: root, env, stdio: ['ignore', log, log] })
  fs.closeSync(log)
  ownedPids.add(child.pid)
}
async function ready(version, timeout = 90000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const value = await call('snapshot')
      assert.equal(value.fixtureId, fixtureId)
      ownedPids.add(value.pid)
      if (value.described?.value?.pluginVersion === version) return value
    } catch {}
    await pause(500)
  }
  throw Error(`fixture ${version} did not activate; inspect private runtime/installation logs`)
}
async function stop() {
  let snapshot
  try { snapshot = await call('snapshot') } catch {
    if (![...ownedPids].some(alive)) return
    throw Error('owned fixture is alive but diagnostic route unavailable')
  }
  assert.equal(snapshot.fixtureId, fixtureId)
  ownedPids.add(snapshot.pid)
  await call('exit', 'POST')
  for (let n = 0; n < 200 && alive(snapshot.pid); n++) await pause(100)
  assert(!alive(snapshot.pid), 'fixture must exit through official appExit')
  ownedPids.delete(snapshot.pid)
  if (child?.pid === snapshot.pid) {
    assert.equal(child.exitCode, 0, 'native appExit must finish normally')
    assert.equal(child.signalCode, null, 'native appExit must not require a signal')
  }
  child = undefined; cookie = undefined
}
async function run(command, args, name, timeout = 600000) {
  const log = fs.openSync(path.join(root, `${name}.log`), 'a', 0o600)
  const processChild = spawn(command, args, { cwd: root, env, stdio: ['ignore', log, log] })
  fs.closeSync(log)
  let timer
  try {
    const code = await Promise.race([
      new Promise((resolve, reject) => { processChild.once('exit', resolve); processChild.once('error', reject) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${name} timed out; inspect private log`)), timeout) }),
    ])
    assert.equal(code, 0, `${name} failed; inspect ${path.join(root, name + '.log')}`)
  } finally { clearTimeout(timer); if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill('SIGTERM') }
}
async function authenticate() {
  const target = (await call('authenticate', 'POST')).url
  assert.equal(new URL(target).origin, origin)
  const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  assert([302, 303].includes(response.status), 'official token exchange must redirect')
  cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert(cookie, 'official token exchange must supply browser session cookie')
}
async function native(endpoint, payload = {}) {
  if (!cookie) await authenticate()
  const response = await fetch(`${origin}/wechat-remote-management/${endpoint}`, {
    method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload }), signal: AbortSignal.timeout(30000),
  })
  const value = await response.json(); assert(response.ok && value.result?.ok, JSON.stringify(value.result?.error || response.status))
  return value.result.value
}
const preserved = () => {
  const files = {}
  const walk = dir => { if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.isFile()) files[path.relative(home, file)] = sha(fs.readFileSync(file))
    else if (entry.isSymbolicLink()) files[path.relative(home, file)] = `link:${fs.readlinkSync(file)}`
  } }
  walk(path.join(home, 'sessions')); walk(path.join(home, 'profiles/desktop'))
  for (const file of ['fixture-user-settings.json', 'profiles/web/cordis.patch.yml']) files[file] = sha(fs.readFileSync(path.join(home, file)))
  return files
}
const binding = () => {
  const key = sha(Buffer.from('deepseek-harness\0web')).slice(0, 24), scoped = path.join(home, 'harness-remote/instances', key)
  const base = fs.existsSync(path.join(scoped, 'storage-layout.json')) ? scoped : home
  const value = JSON.parse(fs.readFileSync(path.join(base, 'gate-wechat-state.json'), 'utf8'))
  return sha(Buffer.from(JSON.stringify([value.token, value.publicIdentityNodeId])))
}
const assertOwner = (snapshot, version) => {
  const rows = snapshot.bundles.filter(row => [owner, core].includes(row.name))
  assert.equal(rows.length, 1); assert.equal(rows[0].name, owner); assert.equal(rows[0].version, version); assert.equal(rows[0].enabled, true)
  const manifest = JSON.parse(fs.readFileSync(path.join(profile, 'package.json')))
  const ownNames = names => names.filter(name => [owner, core].includes(name))
  assert.deepEqual(ownNames(Object.keys(manifest.dependencies)), [owner]); assert.deepEqual(ownNames(manifest.dsh.profile.bundles), [owner])
  assert(!JSON.stringify(manifest.dependencies).includes(cache), 'installed dependency must not refer to ephemeral NPX cache')
  return manifest
}
const assertRuntime = (snapshot, artifact) => {
  assert.equal(snapshot.described.value.pluginVersion, artifact.manifest.version)
  assert(snapshot.sessions.items.some(item => item.sessionId === sessionId))
  for (const id of ['gate', 'wechat-clawbot', 'harness-assistant-teacher', 'harness-assistant-project', 'harness-assistant-customizer', 'harness-resource-library'])
    assert(snapshot.entries.some(entry => entry.id === id && entry.state === 2), `inactive component ${id}`)
  for (const file of ['native/lib/plugin-version.js', 'native/lib/native-update-service.js', 'native/lib/gate-runtime.js'])
    assert.equal(sha(fs.readFileSync(path.join(profile, 'node_modules', owner, file))), sha(member(artifact.file, 'package/' + file)), `installed bytes differ: ${file}`)
}
try {
  await run(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', `file:${old.file}`, '--ignore-scripts', '--config.frozen-lockfile=false', '--reporter=append-only'], 'baseline-install')
  // A separate synthetic Desktop profile is not started or installed by NPX.
  const desktop = path.join(home, 'profiles/desktop'); fs.mkdirSync(desktop, { recursive: true })
  json(path.join(desktop, 'package.json'), { private: true, dependencies: { [owner]: '1.7.13' }, dsh: { profile: { bundles: [owner] } } })
  json(path.join(desktop, 'cordis.patch.yml'), [{ id: 'desktop-fixture-only', disabled: true }])
  json(path.join(desktop, 'fixture-state.json'), { token: randomUUID(), note: 'synthetic Desktop identity' })
  // The installer uses a normal DSH startup, not this harness's old invocation
  // flags. Persist the fixture's chosen port through official profile config.
  json(path.join(profile, 'cordis.patch.yml'), [
    { id: 'webserver', config: { host: '127.0.0.1', port, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
    // The host deliberately scrubs npm environment variables for package
    // services. Configure its public registry setting in this fixture only.
    { id: 'plugin-manager', config: { registry: registryOrigin, fallbackRegistries: [] } },
    { id: 'session-title-llm', disabled: true },
    { insert: [{ id: 'fixture-npx-transition', name: pathToFileURL(probe).href }] },
  ])
  json(path.join(home, 'fixture-user-settings.json'), { theme: 'dark', fixture: fixtureId })
  start(); const before = await ready(old.manifest.version)
  assert.equal((await call('inspect-latest')).problem, 'already-installed')
  await call('seed', 'POST')
  const saved = preserved(), identity = binding()
  await stop()
  await run(process.execPath, [npx, '-y', 'dsh-wechat-remote@latest'], 'npx-first-hop')
  const firstBoot = await ready(first.manifest.version, 120000)
  assert.notEqual(firstBoot.pid, before.pid)
  assertRuntime(firstBoot, first); assertOwner(firstBoot, first.manifest.version)
  assert.deepEqual(preserved(), saved); assert.equal(binding(), identity)
  assert(requests.some(row => row.method === 'GET' && row.route === `/${owner}/-/${owner}-${first.manifest.version}.tgz`), 'actual NPX must download the new candidate')
  const gateResponse = await fetch(`http://127.0.0.1:${port + 3}/gate/status`, { signal: AbortSignal.timeout(5000) })
  const gate = (await gateResponse.json()).gate
  assert.equal(gate.management, 'authenticated-rpc'); assert.equal(gate.updates, 'native-v1')
  report.checks.push({ stage: 'npx-replacement', running: first.manifest.version, sameCommand: true, actualNpmDownload: true,
    originalPublishedBaseline: true, oneNativeOuterBundle: true, startupByInstaller: true, installedRuntimeMatchesArchive: true,
    noNpxCacheDependency: true, pairingPreserved: true, sessionAndSettingsPreserved: true, separateDesktopPreserved: true })
  if (next) {
    latest = next.manifest.version; writeCatalog(next)
    const check = await native('update-check')
    assert.equal(check.canInstall, true, JSON.stringify({ reason: check.reason, status: check.status }))
    assert.equal(check.advice.targetVersion, next.manifest.version)
    await native('update-start', { ticket: check.ticket })
    let status, deadline = Date.now() + 180000
    do { status = await native('update-status'); if (['restart-required', 'failed', 'unknown'].includes(status.phase)) break; await pause(500) } while (Date.now() < deadline)
    if (status.phase !== 'restart-required') report.nativeFailure = await call('native-result')
    assert.equal(status.phase, 'restart-required', JSON.stringify(status))
    const stillFirst = await ready(first.manifest.version)
    assert.equal(stillFirst.pid, firstBoot.pid, 'native update must not silently restart the host')
    const installed = assertOwner(stillFirst, next.manifest.version)
    assert.equal(installed.dependencies[owner], next.manifest.version, 'next update must use the original native registry owner')
    assert.deepEqual(preserved(), saved); assert.equal(binding(), identity)
    await stop(); start()
    const finalBoot = await ready(next.manifest.version)
    assertRuntime(finalBoot, next); assertOwner(finalBoot, next.manifest.version)
    assert.deepEqual(preserved(), saved); assert.equal(binding(), identity)
    assert.equal((await native('update-status')).phase, 'complete')
    assert(requests.some(row => row.method === 'GET' && row.route === `/${owner}/-/${owner}-${next.manifest.version}.tgz`))
    report.checks.push({ stage: 'following-native-update', actualInstalledOperatorRpc: true, actualBrowserAuthentication: true,
      from: first.manifest.version, to: next.manifest.version, oldRuntimeUntilNormalRestart: true, oneNativeOuterBundle: true,
      exactRegistryDependency: true, allSixComponentsActive: true, pairingAndFixtureDataPreserved: true, separateDesktopPreserved: true, result: 'complete' })
  } else {
    await stop(); start(); const restarted = await ready(first.manifest.version)
    assertRuntime(restarted, first); assertOwner(restarted, first.manifest.version)
    assert.deepEqual(preserved(), saved); assert.equal(binding(), identity)
    report.checks.push({ stage: 'normal-cold-restart', running: first.manifest.version, oneNativeOuterBundle: true, fixtureDataPreserved: true })
  }
  report.ok = true
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1 }
finally {
  try { await stop() } catch (error) { report.ok = false; report.cleanupError = String(error); process.exitCode = 1 }
  // A direct child handle proves current ownership; an old numeric PID alone
  // does not. Do not signal a detached process whose identity cannot be checked.
  if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); report.cleanupNeededSignal = true }
  const remaining = [...ownedPids].filter(alive)
  if (remaining.length) { report.cleanupNeedsCheck = remaining; report.ok = false; process.exitCode = 1 }
  await new Promise(resolve => { registry.close(resolve); registry.closeAllConnections() })
  report.registryRequests = requests
  json(path.join(root, 'result.json'), report)
}
console.log(JSON.stringify(report, null, 2))
