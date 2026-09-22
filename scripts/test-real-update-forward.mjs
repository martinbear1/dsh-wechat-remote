/** Opt-in native updater integration. Only creates a NEW isolated fixture home.
 * Uses real installed DSH read-only, with a test-only download transport for
 * unpublished synthetic releases. No model calls, public relay, or user data.
 * node script NEW_ROOT DSH_CLI PLUGIN_TGZ INSTALLER_ROOT OLD_PLUGIN_TGZ
 */
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
const [rootArg, cliArg, candidateArg, installerArg, baselineArg] = process.argv.slice(2)
assert(rootArg && /compat-forward-/.test(path.basename(rootArg)), 'new compat-forward-* root required')
const root = path.resolve(rootArg)
assert(!fs.existsSync(root), 'refusing an existing directory')
const cli = fs.realpathSync(cliArg), candidate = fs.realpathSync(candidateArg)
const installer = fs.realpathSync(installerArg), baseline = fs.realpathSync(baselineArg)
const dsh = JSON.parse(fs.readFileSync(path.resolve(cli, '../../package.json')))
assert.equal(dsh.name, '@deepseek-ai/dsh')
fs.mkdirSync(root, { recursive: true, mode: 0o700 })
const home = path.join(root, 'home'), profile = path.join(home, 'profiles/web')
const plugin = path.join(profile, 'node_modules/@harness-remote/dsh-wechat-remote')
fs.mkdirSync(plugin, { recursive: true })
const json = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2), { mode: 0o600 })
const pause = ms => new Promise(r => setTimeout(r, ms))
const sha = b => createHash('sha256').update(b).digest('hex')
const report = { platform: process.platform, arch: process.arch, dsh: dsh.version, checks: [], ok: false }
json(path.join(home, '.harness-remote-compat-fixture'), { purpose: 'forward updater', root })
json(path.join(home, 'harness-remote-public.json'), { enabled: false, relayOrigin: 'https://relay.xyxfood.xyz' })
json(path.join(profile, 'package.json'), { name: 'isolated-update-profile', private: true,
  dependencies: { '@harness-remote/dsh-wechat-remote': 'file:baseline.tgz' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@harness-remote/dsh-wechat-remote'], patchReload: 'live' } } })
fs.copyFileSync(baseline, path.join(profile, 'baseline.tgz'))
fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), '# Isolated updater fixture\n- id: session-title-llm\n  disabled: true\n')
const extracted = spawnSync('tar', ['-xzf', baseline, '-C', plugin, '--strip-components=1'], { windowsHide: true, encoding: 'utf8' })
assert.equal(extracted.status, 0, extracted.stderr)
const candidateBytes = fs.readFileSync(candidate)
const candidateVersion = JSON.parse(spawnSync('tar', ['-xOf', candidate, 'package/package.json'], { encoding: 'utf8' }).stdout).version
const baselineVersion = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'))).version
const [major, minor, patch] = candidateVersion.split('-')[0].split('.').map(Number)
const nextVersion = `${major}.${minor}.${patch + 1}-test.1`, brokenVersion = `${major}.${minor}.${patch + 1}-test.2`
const release = (version, bytes) => ({ version, channel: version.includes('-') ? 'preview' : 'stable', dsh: [dsh.version],
  platforms: [{ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]], architectures: [process.arch], asset: {
    url: `https://github.com/martinbear1/dsh-wechat-remote/releases/download/v${version}/harness-remote-dsh-wechat-remote-${version}.tgz`,
    sha256: sha(bytes), bytes: bytes.length } })
const catalog = (rel, revision) => ({ schemaVersion: 1, revision, issuedAt: Date.now() - 1000,
  expiresAt: Date.now() + 3600000, releases: [rel], blocked: [], retiredDsh: [] })
const assets = path.join(root, 'assets'); fs.mkdirSync(assets)
fs.writeFileSync(path.join(assets, 'plugin.tgz'), candidateBytes)
json(path.join(assets, 'release.json'), { version: candidateVersion, catalog: catalog(release(candidateVersion, candidateBytes), 'bridge') })
function synthetic(version, broken = false) {
  const tar = gunzipSync(candidateBytes), chunks = []
  for (let off = 0; off + 512 <= tar.length;) {
    const header = Buffer.from(tar.subarray(off, off + 512)); if (header.every(b => b === 0)) break
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '')
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8)
    let data = tar.subarray(off + 512, off + 512 + size)
    if (name === 'package/package.json') data = Buffer.from(JSON.stringify({ ...JSON.parse(data), version }))
    if (broken && name === 'package/lib/index.js') data = Buffer.from('throw Error("Synthetic startup failure; fixture only")\n')
    header.fill(0, 124, 136); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124)
    header.fill(32, 148, 156); header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
    off += 512 + Math.ceil(size / 512) * 512
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
const nextBytes = synthetic(nextVersion), brokenBytes = synthetic(brokenVersion, true)
fs.writeFileSync(path.join(root, 'next.tgz'), nextBytes)
fs.writeFileSync(path.join(root, 'broken.tgz'), brokenBytes)
const catalogFile = path.join(root, 'catalog.json')
const manifestFile = path.join(plugin, 'package.json')
const version = () => JSON.parse(fs.readFileSync(manifestFile)).version
// Operator-owned transport shim ONLY in this fixture. Production archive code
// and all allowlist/hash/tar audits remain unchanged. Never intercept other URLs.
const transport = path.join(root, 'fixture-transport.mjs')
fs.writeFileSync(transport, `import fs from 'node:fs'; const real = globalThis.fetch; const map = ${JSON.stringify({
  [release(nextVersion, nextBytes).asset.url]: path.join(root, 'next.tgz'),
  [release(brokenVersion, brokenBytes).asset.url]: path.join(root, 'broken.tgz'),
})}; globalThis.fetch = (url, init) => map[String(url)] ? Promise.resolve(new Response(fs.readFileSync(map[String(url)]))) : real(url, init);\n`)
let port = 6180
for (; port < 6400; port += 4) {
  try {
    for (const p of [port, port + 2, port + 3]) await new Promise((resolve, reject) => {
      const s = net.createServer(); s.once('error', reject); s.listen(p, '0.0.0.0', () => s.close(resolve))
    })
    break
  } catch {}
}
assert(port < 6400)
const env = { ...process.env, DSH_HOME: home, DSH_PORT: String(port), WECHAT_GATE_PORT: String(port + 2),
  WECHAT_GATE_LOCAL_PORT: String(port + 3), HARNESS_REMOTE_UPDATE_CATALOG: catalogFile,
  HARNESS_REMOTE_UPDATE_CHANNEL: 'preview',
  NODE_OPTIONS: `--import=${pathToFileURL(transport).href}` }
// Do not inherit real-node restart jobs or keys into the fixture.
delete env.HARNESS_REMOTE_UPDATE_JOB
delete env.DEEPSEEK_API_KEY
delete env.DSH_COMPAT_MODEL_KEY
const origin = `http://127.0.0.1:${port}`, base = `http://127.0.0.1:${port + 3}/gate/update`
const fd = fs.openSync(path.join(root, 'runtime.log'), 'a', 0o600)
const child = spawn(process.execPath, [cli, '--profile', 'web', '--port', String(port), '--no-open'], {
  cwd: root, env, stdio: ['ignore', fd, fd], windowsHide: true })
fs.closeSync(fd)
async function ready() {
  for (let i = 0; i < 1200; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port + 3}/gate/status`, { signal: AbortSignal.timeout(800) })).ok
          && Array.isArray((await rpc('session.list')).items)) return
    } catch {}
    await pause(300)
  }
  throw Error('fixture host not ready; inspect private runtime/restart logs')
}
async function call(route, body) {
  const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) })
  const value = await r.json(); assert(r.ok, value.error || String(r.status)); return value
}
let nativeCookie = ''
async function rpc(method, payload = {}) {
  // The frozen baseline has a legacy local API. New releases deliberately
  // remove that business endpoint: use the authenticated native WebUI API
  // after installation, never reopen a retired API merely for this fixture.
  if (version() !== baselineVersion) {
    // Keep the native browser session across updates/rollback, just as WebUI
    // does. A failed update must NOT mint a new login via its success endpoint.
    if (!nativeCookie) {
      const scope = sha(Buffer.from('web')).slice(0, 24)
      const ref = JSON.parse(fs.readFileSync(path.join(home, 'harness-remote-updates', `profile-${scope}.json`)))
      const resumed = await call('/resume?job=' + ref.jobId)
      assert.equal(new URL(resumed.url).origin, origin)
      const exchange = await fetch(resumed.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
      nativeCookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      assert(nativeCookie, 'native host session cookie required')
    }
    const nativeMethod = method === 'session.history' ? 'session/page' : 'session/list'
    assert(['session.history', 'session.list'].includes(method))
    const session = method === 'session.history'
      ? (await rpc('session.list')).items.find(item => item.sessionId === payload.sessionId) : undefined
    if (session) assert(Number.isSafeInteger(session.projections?.asOfSeq), 'native page requires its snapshot cursor')
    const args = method === 'session.history'
      ? { request: { address: { kind: 'session', sessionId: payload.sessionId }, throughSeq: session?.projections?.asOfSeq, maxMessages: payload.maxMessages } }
      : { _request: payload }
    const response = await fetch(origin + '/api/' + nativeMethod, { method: 'POST',
      headers: { origin, cookie: nativeCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'fixture-native', method: nativeMethod, payload: { args } }),
      signal: AbortSignal.timeout(10000) })
    const value = await response.json()
    assert(response.ok && value.result?.ok, 'native fixture RPC failed: ' + nativeMethod)
    return value.result.value
  }
  const token = JSON.parse(fs.readFileSync(path.join(home, 'gate-wechat-state.json'))).token
  const r = await fetch(`http://127.0.0.1:${port + 2}/api/${method}`, { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method, payload }), signal: AbortSignal.timeout(10000) })
  const v = await r.json(); assert(v.result?.ok, 'fixture RPC failed: ' + method + ' ' + JSON.stringify(v.result?.error || v.error || '').slice(0, 500)); return v.result.value
}
try {
  await ready(); assert.equal(version(), baselineVersion)
  json(catalogFile, catalog(release(candidateVersion, candidateBytes), 'baseline-check'))
  const oldCheck = await call('/check')
  if (baselineVersion === '1.7.1' || process.arch === 'arm64') {
    assert.equal(oldCheck.canInstall, false, 'old frozen updater should reproduce the limit')
    if (process.arch === 'arm64') assert.match(oldCheck.reason, /架构/)
  }
  report.checks.push({ stage: 'baseline-check', baselineVersion, reason: oldCheck.reason, canInstall: oldCheck.canInstall })
  // Native, model-free session fixture exercises durable preservation.
  const created = await rpc('session.create', { cwd: root })
  report.createdSession = created.sessionId
  const gateFile = path.join(home, 'gate-wechat-state.json')
  const gate = JSON.parse(fs.readFileSync(gateFile))
  const gateBefore = sha(Buffer.from(JSON.stringify([gate.token, gate.publicIdentityNodeId])))
  const bridge = path.join(root, 'bridge.mjs')
  fs.writeFileSync(bridge, `const { install } = await import(${JSON.stringify(pathToFileURL(path.join(installer, 'bin/setup.mjs')).href)}); const result = await install(${JSON.stringify({ cli, assetsRoot: assets, open: false })}); console.log(JSON.stringify(result));\n`)
  const log = fs.openSync(path.join(root, 'bridge.log'), 'a', 0o600)
  const bridgeChild = spawn(process.execPath, [bridge], { cwd: root, env, stdio: ['ignore', log, log], windowsHide: true }); fs.closeSync(log)
  const code = await new Promise((resolve, reject) => { bridgeChild.on('error', reject); bridgeChild.on('exit', resolve) })
  assert.equal(code, 0, 'independent bridge failed; inspect bridge.log')
  await ready(); assert.equal(version(), candidateVersion); report.checks.push({ stage: 'native-bridge', from: baselineVersion, to: candidateVersion, ok: true })
  console.log(JSON.stringify(report.checks.at(-1)))
  for (const [target, bytes, rollback] of [[nextVersion, nextBytes, false], [brokenVersion, brokenBytes, true]]) {
    const rel = release(target, bytes)
    // Confirm actual known-bad targets are blocked, but missing test evidence is
    // not a whitelist: the real host will update with an unlisted DSH/CPU below.
    json(catalogFile, { ...catalog(rel, 'withdrawn-' + target), blocked: [{ pluginVersion: target, reason: 'Fixture withdrawal' }] })
    assert.equal((await call('/check')).canInstall, false)
    json(catalogFile, catalog({ ...rel, dsh: ['0.0.0-fixture'], architectures: ['unlisted-fixture'] }, 'untested-' + target))
    const check = await call('/check'); assert.equal(check.canInstall, true, check.reason); assert(check.ticket)
    const started = await call('/start', { ticket: check.ticket }); assert(/^[a-f0-9]{32}$/.test(started.jobId))
    let result, last = ''
    for (let i = 0; i < 1800; i++) {
      try { result = JSON.parse(fs.readFileSync(path.join(home, 'harness-remote-updates', started.jobId, 'result.json'))) } catch {}
      if (result?.phase !== last && result?.phase) { last = result.phase; console.log(JSON.stringify({ target, phase: last })) }
      if (result?.terminal) break
      await pause(500)
    }
    assert(result?.terminal, 'update did not finish')
    assert.equal(result.ok, !rollback, result.message)
    if (rollback) assert.equal(result.rollback, true, result.message)
    await ready(); assert.equal(version(), nextVersion)
    const after = JSON.parse(fs.readFileSync(gateFile))
    assert.equal(sha(Buffer.from(JSON.stringify([after.token, after.publicIdentityNodeId]))), gateBefore)
    assert((await rpc('session.list')).items.some(s => s.sessionId === created.sessionId))
    await rpc('session.history', { sessionId: created.sessionId, maxMessages: 1 })
    report.checks.push({ stage: rollback ? 'startup-failure-rollback' : 'webui-forward-update', target, result, dataPreserved: true })
  }
  report.ok = true
} catch (e) { report.error = e.message; process.exitCode = 1 }
finally {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  // Stop only restarted fixture PIDs whose native command and ownership match.
  const jobs = path.join(home, 'harness-remote-updates')
  for (const id of fs.existsSync(jobs) ? fs.readdirSync(jobs).filter(n => /^[a-f0-9]{32}$/.test(n)) : []) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(jobs, id, 'restarted-process.json')))
      assert.equal(p.home, home); assert.equal(p.cli, cli); assert.equal(p.webPort, port)
      if (process.platform === 'linux') {
        assert(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8').split('\0').includes('DSH_HOME=' + home))
      } else if (process.platform === 'darwin') {
        assert.equal(spawnSync('/usr/sbin/lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim(), String(p.pid))
        assert(spawnSync('/bin/ps', ['-p', String(p.pid), '-o', 'args='], { encoding: 'utf8' }).stdout.includes(cli))
      } else {
        const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${p.pid}').CommandLine`], { encoding: 'utf8', windowsHide: true }).stdout
        assert(out.includes(cli) && out.includes(`--port ${port}`))
      }
      process.kill(p.pid, 'SIGTERM')
    } catch { /* no matching live fixture process; never kill a guessed owner */ }
  }
  json(path.join(root, 'result.json'), report)
}
console.log(JSON.stringify(report))
