/** Official alpha Connection, WebServer and authentication plugins on isolated
 * loopback listeners. No installed profile, credentials or cloud is touched. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'

const runtime = process.env.HARNESS_DSH_ROOT
assert(runtime, 'HARNESS_DSH_ROOT must identify an isolated official alpha runtime')
const requireHost = createRequire(resolve(runtime, 'package.json'))
const native = name => import(pathToFileURL(requireHost.resolve('@deepseek-ai/' + name)).href)
const [{ Context }, Web, Connection, Token] = await Promise.all([
  native('cordis'), native('dsh-host-webserver'), native('dsh-client-connection'),
  native('dsh-host-authentication-token'),
])
const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE is needed for the official Desktop-only provider')
const desktopBuild = await build({ entryPoints: [resolve(source, 'packages/host/authentication-desktop/src/index.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm' })
const Desktop = await import('data:text/javascript;base64,' + Buffer.from(desktopBuild.outputFiles[0].contents).toString('base64'))
let mountPairingManagement, observePairingManagement
if (process.env.HARNESS_PAIRING_BASELINE_MODULE) {
  ;({ mountPairingManagement, observePairingManagement } = await import(pathToFileURL(resolve(process.env.HARNESS_PAIRING_BASELINE_MODULE)).href))
} else {
  const compiled = await build({ entryPoints: ['src/pairing-management.ts'], bundle: true,
    write: false, platform: 'node', format: 'esm' })
  ;({ mountPairingManagement, observePairingManagement } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')))
}
const roots = []
async function settle(fiber) { await fiber.await(); assert.equal(fiber.error, undefined) }
async function host(kind) {
  const ctx = new Context(); roots.push(ctx)
  const web = ctx.plugin(Web.default, { host: '127.0.0.1', port: 0 }); await settle(web)
  const connection = ctx.plugin(Connection); await settle(connection)
  let record
  const credentials = ctx.plugin({ name: 'isolated-test-credentials', apply(owner) {
    owner.provide('credentials', { async modifyRecord(_key, modify) {
      record = await modify(record) ?? record; return record
    } })
  } }); await settle(credentials)
  const secret = randomBytes(32).toString('base64url')
  const authentication = kind === 'desktop' ? ctx.plugin(Desktop, { readSecret: () => secret })
    : ctx.plugin(Token, { cookieMaxAgeDays: 1 })
  await settle(authentication)
  const origin = 'http://127.0.0.1:' + ctx.get('webServer').port
  let mounted, calls = 0
  const gate = ctx.plugin({ name: 'isolated-wechat-management', apply(owner) {
    const observe = observePairingManagement ?? ((ctx, listener) => ctx.inject(['connection', 'webServer'], listener))
    observe(owner, (inner) => {
      mounted = mountPairingManagement(inner, { unavailable: () => false, status: () => ({ kind }),
        pairCode: async () => { calls++; return { ticket: 'synthetic-' + kind } } })
      const current = mounted
      return () => current?.dispose()
    })
  } }); await settle(gate)
  for (let attempt = 0; attempt < 100 && !mounted; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  assert(mounted, 'alpha must mount the native authenticated management route')
  let cookie
  if (kind === 'desktop') cookie = 'dsh-desktop-session=' + secret
  else {
    const entries = []
    ctx.emit(ctx.get('webServer'), 'webserver/entry-url', origin, entries)
    assert.equal(entries.length, 1)
    const response = await fetch(entries[0].url, { redirect: 'manual' })
    assert.equal(response.status, 303)
    cookie = response.headers.get('set-cookie').split(';', 1)[0]
  }
  return { ctx, origin, cookie, gate, authentication, get calls() { return calls } }
}
const envelope = (method = 'pair-code', payload = {}) => JSON.stringify({ type: 'client-request', rpcId: 'native-test', method, payload })
const post = (host, cookie = host.cookie, origin = host.origin, body = envelope(), endpoint = 'pair-code') =>
  fetch(host.origin + '/wechat-remote-management/' + endpoint, { method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json' }, body })
try {
  const web = await host('web'), desktop = await host('desktop')
  for (const target of [web, desktop]) {
    assert.equal((await post(target, '')).status, 401)
    assert.equal((await post(target, target === web ? desktop.cookie : web.cookie)).status, 401)
    assert.equal((await post(target, target.cookie, 'https://untrusted.invalid')).status, 403)
    assert.equal((await post(target, target.cookie, target.origin, 'x'.repeat(5000))).status, 400)
    assert.equal(target.calls, 0)
    const accepted = await post(target)
    assert.equal(accepted.status, 200)
    assert.equal((await accepted.json()).result.value.ticket, 'synthetic-' + (target === web ? 'web' : 'desktop'))
    assert.equal(target.calls, 1)
  }
  let sharedChecks = 0, singleChecks = 0
  const shared = web.ctx.plugin({ name: 'isolated-shared-provider', inject: ['connection', 'connection.authentication'], apply(owner) {
    const peer = owner.connection.createPeer({ principal: { kind: 'session', sessionId: 'synthetic-session' } })
    const operator = owner.connection.createPeer({ principal: { kind: 'owner' } })
    owner.connection.authentication.register({ authenticate: request => {
      if (request.headers.cookie === 'fixture-shared') return ++sharedChecks === 1 ? peer : operator
      if (request.headers.cookie === 'fixture-once') return ++singleChecks === 1 ? operator : undefined
    } })
  } }); await settle(shared)
  assert.equal((await post(web, 'fixture-shared')).status, 403)
  assert.equal(sharedChecks, 1, 'a shared caller is never upgraded by reauthentication')
  assert.equal(web.calls, 1, 'shared authentication never grants pairing authority')
  assert.equal((await post(web, 'fixture-once')).status, 200)
  assert.equal(singleChecks, 1, 'use the same native admission even for a single-use provider')
  await shared.dispose()
  await desktop.authentication.dispose()
  assert.equal((await post(desktop)).status, 401, 'withdrawing the native provider revokes its credential')
  assert.equal((await post(web)).status, 200, 'another host remains available')
  await web.gate.dispose()
  assert.equal((await post(web)).status, 404, 'plugin disposal unregisters its management route')
  console.log('PASS official alpha Web/Desktop token providers: mount, valid login, cross-host/cross-origin/anonymous/shared rejection, body bounds, credential revocation and route disposal')
} finally { await Promise.all(roots.map(ctx => ctx.fiber.dispose())) }
