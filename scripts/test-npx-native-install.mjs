/** Opt-in cross-platform end-to-end test. Uses a NEW home/cache and actual npx commands.
 * No models, credentials, production nodes or transport mocks. The optional
 * update uses the already published RC, enabled only in this isolated home.
 * node scripts/test-npx-native-install.mjs INSTALLER_TGZ [--with-update]
 */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

assert(['win32', 'darwin', 'linux'].includes(process.platform))
const installer = fs.realpathSync(process.argv[2])
const payloadVersion = JSON.parse(execFileSync('tar', ['-xOf', installer, 'package/assets/release.json'], { encoding: 'utf8' })).version
const root = fs.realpathSync(fs.mkdtempSync(path.resolve('..', 'compat-artifacts', 'npx-native-proof-')))
const home = path.join(root, '独立数据')
const cache = process.env.DSH_INSTALLER_TEST_CACHE ? fs.realpathSync(process.env.DSH_INSTALLER_TEST_CACHE) : path.join(root, 'npm cache')
if (process.env.DSH_INSTALLER_TEST_CACHE) assert(path.basename(path.dirname(cache)).startsWith('npx-native-proof-') && path.basename(cache) === 'npm cache')
const profile = path.join(home, 'profiles/web'), catalogFile = path.join(root, 'catalog.json')
fs.mkdirSync(home)
const expectedPayload = path.join(root, 'expected-plugin.tgz')
fs.writeFileSync(expectedPayload, execFileSync('tar', ['-xOf', installer, 'package/assets/plugin.tgz'], { maxBuffer: 32 * 1024 * 1024 }))
const expectedFiles = ['lib/update-policy.js', 'lib/update-download.js', 'lib/update-service.js', 'lib/update-worker.js'].map(file => [file,
  createHash('sha256').update(execFileSync('tar', ['-xOf', expectedPayload, 'package/' + file], { maxBuffer: 1024 * 1024 })).digest('hex')])
const assertCandidateBytes = () => {
  for (const [file, hash] of expectedFiles) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote', file))).digest('hex'), hash, 'installed bytes must match this candidate, not a same-version npm cache')
}
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
json(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
const nodeDir = path.dirname(process.execPath)
const npx = [path.join(nodeDir, 'node_modules/npm/bin/npx-cli.js'),
  path.join(nodeDir, '../lib/node_modules/npm/bin/npx-cli.js'),
  '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
  '/usr/share/nodejs/npm/bin/npx-cli.js'].find(file => fs.existsSync(file))
assert(fs.existsSync(npx))
const port = 7280, gatePort = 7292, localPort = 7293
const origin = `http://127.0.0.1:${port}`, update = `http://127.0.0.1:${localPort}/gate/update`
const env = { ...process.env, DSH_HOME: home, DSH_PORT: String(port), WECHAT_GATE_PORT: String(gatePort),
  WECHAT_GATE_LOCAL_PORT: String(localPort), npm_config_cache: cache,
  npm_config_prefix: path.join(root, 'empty npm global'),
  HARNESS_REMOTE_UPDATE_CATALOG: catalogFile, HARNESS_REMOTE_UPDATE_CHANNEL: 'preview',
  PATH: process.platform === 'win32'
    ? [nodeDir, path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot,
      path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0')].join(path.delimiter)
    : [path.join(root, 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
}
if (process.platform !== 'win32') {
  fs.mkdirSync(path.join(root, 'bin'))
  fs.symlinkSync(process.execPath, path.join(root, 'bin/node'))
}
for (const key of ['HARNESS_REMOTE_UPDATE_JOB', 'DEEPSEEK_API_KEY', 'DSH_COMPAT_MODEL_KEY', 'NODE_OPTIONS']) delete env[key]
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = { root, platform: process.platform, node: process.version, dsh: '0.1.5-rc.1', checks: [], ok: false }
const children = []
const step = name => { report.checks.push(name); console.log('PASS ' + name) }
const version = () => JSON.parse(fs.readFileSync(path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote/package.json'))).version
function startNpx(args, name) {
  const log = fs.openSync(path.join(root, name + '.log'), 'a', 0o600)
  const child = spawn(process.execPath, [npx, '-y', ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] })
  fs.closeSync(log); children.push(child)
  return child
}
async function runInstaller(name, args = []) {
  // Explicit package/bin avoids npm treating an absolute .tgz path with spaces
  // as a shell executable. Published users simply use the registry package name.
  const child = startNpx(['--package=' + installer, 'dsh-wechat-remote', ...args], name)
  let timer
  try {
    const code = await Promise.race([
      new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Installer timed out; inspect private test log.')), 600000) }),
    ])
    assert.equal(code, 0, `${name} failed; inspect ${path.join(root, name + '.log')}`)
  } finally { clearTimeout(timer) }
}
async function waitReady(predicate, timeout = 900000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) })
      // A fresh official DSH protects its WebUI with a token. 401 is a live
      // surface, not failed startup; the loopback gate status verifies the
      // installed plugin without reviving the retired plaintext LAN RPC.
      if ((response.ok || response.status === 401) && (!predicate || await predicate())) return
    } catch {}
    await pause(500)
  }
  throw new Error('Fixture did not become ready; inspect private test logs: ' + root)
}
async function call(route, body) {
  const r = await fetch(update + route, { method: body ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(360000) })
  const value = await r.json(); assert(r.ok, value.error || String(r.status)); return value
}
async function gateStatus() {
  const response = await fetch(`http://127.0.0.1:${localPort}/gate/status`, { signal: AbortSignal.timeout(1000) })
  assert(response.ok, `Gate status failed: ${response.status}`)
  const value = await response.json()
  assert(value?.gate && value?.lan?.port === gatePort, 'Gate status did not describe the isolated fixture')
  return value
}
function bindingDigest() {
  const state = JSON.parse(fs.readFileSync(path.join(home, 'gate-wechat-state.json')))
  return createHash('sha256').update(JSON.stringify([state.token, state.publicIdentityNodeId])).digest('hex')
}
function fixtureHosts() {
  const output = process.platform === 'win32' ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"],
  { windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 })
    : execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 })
  const processes = process.platform === 'win32' ? [JSON.parse(output || '[]')].flat()
    : output.split('\n').flatMap(line => {
      const match = line.match(/^\s*(\d+)\s+(.+)$/)
      return match ? [{ ProcessId: Number(match[1]), CommandLine: match[2] }] : []
    })
  return processes.filter(p => p.CommandLine?.includes(cache) && p.CommandLine.includes(`--port ${port}`)
    && /(?:[/\\]dsh[/\\]lib[/\\]bin\.js|\/node_modules\/\.bin\/dsh)(?:["'\s]|$)/.test(p.CommandLine))
}
function stopFixtureHosts() {
  for (const p of fixtureHosts()) {
    // Re-read the exact PID immediately; never stop a guessed/reused process.
    const command = process.platform === 'win32' ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(p.ProcessId)}').CommandLine`],
    { windowsHide: true, encoding: 'utf8', timeout: 15000 })
      : execFileSync('/bin/ps', ['-p', String(p.ProcessId), '-o', 'command='], { encoding: 'utf8', timeout: 15000 })
    if (command.trim() === p.CommandLine.trim()) process.kill(p.ProcessId, 'SIGTERM')
  }
}
console.log('Isolated npx proof directory: ' + root)
try {
  // Refuse any existing listener: do not mistake the user's service for ours.
  for (const p of [port, gatePort, localPort]) {
    const net = await import('node:net')
    await new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(p, '0.0.0.0', () => s.close(resolve)) })
  }
  startNpx(['@deepseek-ai/dsh@0.1.5-rc.1', 'web', '--port', String(port), '--no-open'], 'dsh-first')
  await waitReady(() => fs.existsSync(path.join(profile, 'package.json')))
  const hosts = fixtureHosts()
  assert.equal(hosts.length, 1, 'Exactly one isolated npx DSH process must exist')
  const actualHost = hosts[0]
  assert(actualHost.CommandLine.includes(cache), 'npx must use its isolated cache, never an available global installation')
  assert(!fs.existsSync(path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote/package.json')))
  step('actual npx DSH starts with no global DSH on child PATH and an empty home')
  const beforePatch = fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8')
  await runInstaller('installer-first')
  await waitReady(async () => version() === payloadVersion && Boolean((await gateStatus()).gate))
  assertCandidateBytes()
  assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), beforePatch)
  const jobs = path.join(home, 'harness-remote-updates')
  const installedJob = fs.readdirSync(jobs).filter(id => /^[a-f0-9]{32}$/.test(id))
    .map(id => path.join(jobs, id, 'job.json')).filter(file => fs.existsSync(file)).map(file => JSON.parse(fs.readFileSync(file))).at(-1)
  assert(installedJob.cli.startsWith(cache + path.sep) && installedJob.cli.includes('_npx'))
  assert.equal(installedJob.home, home)
  report.realNpxCli = installedJob.cli
  step(`packed npm installer discovers live npx host, natively installs ${payloadVersion}, restores patch and restarts correct CLI`)
  const binding = bindingDigest()
  // A separate ordinary terminal can have a global DSH on PATH. Its presence
  // must not override the authenticated live npx host on a different port.
  const isolatedPath = env.PATH
  env.PATH = [nodeDir, process.env.PATH || ''].join(path.delimiter)
  try { await runInstaller('installer-repeat') } finally { env.PATH = isolatedPath }
  await waitReady(async () => version() === payloadVersion && Boolean((await gateStatus()).gate))
  assert.equal(bindingDigest(), binding)
  step('repeat install from ordinary PATH is a no-op and preserves token/bindings')
  await runInstaller('installer-repair', ['--repair'])
  await waitReady(async () => version() === payloadVersion && Boolean((await gateStatus()).gate))
  assertCandidateBytes()
  assert.equal(bindingDigest(), binding)
  assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), beforePatch)
  step('explicit same-version repair reinstalls the final payload and preserves configuration/token/bindings')
  if (process.argv.includes('--with-update')) {
    assert.equal(payloadVersion, '1.7.5', 'The published RC forward-update proof starts from stable 1.7.5; use test-real-update-forward for newer candidates')
    const version = '1.7.6-rc.1'
    assert.equal(process.arch, 'x64', 'Unmodified stable WebUI updater still restricts automatic restart to x64')
    const release = { version, channel: 'preview', dsh: ['0.1.5-rc.1'],
      platforms: [{ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]], architectures: ['x64'],
      asset: { url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/harness-remote-dsh-wechat-remote-${version}.tgz`,
        sha256: '15f7a085bca98068d25c7fe2a1a139d69dbc2a56c090644f938131a28777d97b', bytes: 9547344 } }
    json(catalogFile, { schemaVersion: 1, revision: 'isolated-npx-update', issuedAt: Date.now() - 1000,
      expiresAt: Date.now() + 3600000, releases: [release], blocked: [], retiredDsh: [] })
    const check = await call('/check')
    assert(check.canInstall && check.ticket, check.reason || 'Updater did not offer the isolated RC target')
    const started = await call('/start', { ticket: check.ticket })
    let result, last
    for (let i = 0; i < 1200; i++) {
      try { result = JSON.parse(fs.readFileSync(path.join(jobs, started.jobId, 'result.json'))) } catch {}
      if (result?.phase && result.phase !== last) { last = result.phase; console.log('Update phase: ' + last) }
      if (result?.terminal) break
      await pause(500)
    }
    assert(result?.ok, result?.message || 'Updater did not complete')
    assert.equal(bindingDigest(), binding)
    const updateJob = JSON.parse(fs.readFileSync(path.join(jobs, started.jobId, 'job.json')))
    assert.equal(updateJob.cli, installedJob.cli)
    step('unmodified stable plugin WebUI updater downloads published RC and restarts the original npx CLI')
  }
  stopFixtureHosts()
  await pause(1000)
  startNpx(['@deepseek-ai/dsh@0.1.5-rc.1', 'web', '--port', String(port), '--no-open'], 'dsh-next-start')
  await waitReady(async () => Boolean((await gateStatus()).gate))
  assert.equal(version(), process.argv.includes('--with-update') ? '1.7.6-rc.1' : payloadVersion)
  if (!process.argv.includes('--with-update')) assertCandidateBytes()
  assert.equal(bindingDigest(), binding)
  step('a later normal npx startup loads the installed plugin and preserves token/bindings')
  report.ok = true
} catch (error) { report.error = error.message; process.exitCode = 1 }
finally {
  try { stopFixtureHosts() } catch { report.cleanupNeedsCheck = true }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  json(path.join(root, 'result.json'), report)
}
console.log(JSON.stringify(report, null, 2))
