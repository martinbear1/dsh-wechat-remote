/** Runs unmodified official source over real localhost HTTP, not a fake auth
 * service. Supply HARNESS_DSH_SOURCE pointing at the audited source checkout.
 * Only credential persistence and WebRoute hosting are in-memory fixtures. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { Context } from '@deepseek-ai/cordis'
import { mountPairingManagement } from '../lib/pairing-management.js'

const source = process.env.HARNESS_DSH_SOURCE
assert(source, 'HARNESS_DSH_SOURCE is required; no silently skipped native auth test')
const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const file = value => resolve(source, value).replaceAll('\\', '/')
const result = await build({ stdin: { contents: [
  `export {HostConnectionService} from ${JSON.stringify(file('packages/client/connection/src/rpc-host.ts'))}`,
  `export {BrowserAuth} from ${JSON.stringify(file('packages/client/connection/src/browser-auth.ts'))}`,
  `export {forwardWebRequest,authenticateWebHost} from ${JSON.stringify(file('apps/desktop/src/web-document.ts'))}`,
].join('\n'), resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['@deepseek-ai/cordis', 'zod'], alias: {
    '@deepseek-ai/dsh-scope': file('packages/core/scope/src/index.ts'),
    '@deepseek-ai/dsh-brand': file('packages/util/brand/src/index.ts'),
    '@deepseek-ai/dsh-credentials': file('packages/credentials/credentials/src/index.ts'),
  } })
const module = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { HostConnectionService, BrowserAuth, forwardWebRequest, authenticateWebHost } = module.exports
async function host(id, late = false) {
  const ctx = new Context(), routes = new Map()
  let record, mounted, connection, mountError, calls = 0
  const auth = await BrowserAuth.create(ctx, { modifyRecord: async (_key, modify) => {
    record = await modify(record) ?? record; return record
  } }, 1)
  // Match the real host: webServer belongs to another plugin fiber, not root.
  // A root-provided service masked the official RPC getter's shadow context.
  const webProvider = ctx.plugin({ name: 'native-web-fixture', apply(owner) {
    owner.provide('webServer')
    owner.set('webServer', { register(route) {
      assert.equal(routes.has(route.path), false)
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    } })
  } })
  await webProvider
  assert(ctx.get('webServer'), 'Web fixture must provide an active server')
  const startProvider = async () => {
    const provider = ctx.plugin({ name: 'native-connection-fixture', apply(owner) {
      connection = new HostConnectionService(owner, [], auth)
    } })
    await provider
    return provider
  }
  let provider = late ? undefined : await startProvider()
  const fiber = ctx.plugin({ name: 'native-pairing-fixture', inject: ['webServer'], apply(owner) {
    owner.inject(['connection', 'webServer'], inner => {
      try {
        mounted = mountPairingManagement(inner, { status: () => ({ id }),
          pairCode: async () => { calls++; return { ticket: id } }, unavailable: () => false })
      } catch (error) { mountError = error; throw error }
      const current = mounted
      return () => current.dispose()
    })
  } })
  await fiber
  if (late) {
    assert.equal(mounted, undefined)
    provider = await startProvider()
  }
  for (let attempt = 0; attempt < 100 && !mounted; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  const server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/?token=')) {
        if (connection.authorizeIndex(req, res)) res.end('index')
        return
      }
      const route = [...routes.values()].find(r => req.url.startsWith(r.path + '/'))
      if (!route) { res.writeHead(404); res.end(); return }
      await route.handler(req, res)
    } catch (error) { res.writeHead(500); res.end(String(error)) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  if (mountError) throw mountError
  assert(mounted, 'native mount must occur')
  const origin = 'http://127.0.0.1:' + server.address().port
  return { origin, routes, mounted, get calls() { return calls },
    cookie: () => authenticateWebHost(auth.authenticatedUrl(origin)),
    async reload() {
      const before = mounted
      await provider.dispose()
      assert.equal(routes.size, 0, 'Connection removal must dispose its dependent route')
      provider = await startProvider()
      for (let attempt = 0; attempt < 100 && mounted === before; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
      assert.notEqual(mounted, before)
      assert.equal(routes.size, 1, 'one replacement route, no old listener')
    },
    async close() { await fiber.dispose(); await provider.dispose(); await webProvider.dispose(); await new Promise(resolve => server.close(resolve)); await ctx.fiber.dispose() } }
}
const web = await host('web'), desktop = await host('desktop', true)
const body = endpoint => JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: endpoint, payload: {} })
try {
  const cookies = await Promise.all([web.cookie(), desktop.cookie()])
  const post = (target, cookie, origin) => fetch(target.origin + '/wechat-remote-management/pair-code', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    body: body('pair-code'),
  })
  for (const target of [web, desktop]) {
    assert.equal((await post(target)).status, 401)
    assert.equal((await post(target, 'untrusted')).status, 401)
  }
  assert.equal((await post(desktop, cookies[0])).status, 401, 'Web cookie must not authorize Desktop')
  assert.equal((await post(web, cookies[1])).status, 401)
  assert.equal((await post(desktop, cookies[1], 'https://attacker.invalid')).status, 403)
  assert.equal(desktop.calls, 0)
  const malformed = async (raw, { type = 'application/json', path = 'pair-code' } = {}) =>
    fetch(web.origin + '/wechat-remote-management/' + path, {
      method: 'POST', headers: { cookie: cookies[0], origin: web.origin, 'content-type': type }, body: raw,
    })
  for (const raw of ['{', 'null', '[]', JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'status', payload: {} }),
    JSON.stringify({ type: 'client-request', rpcId: 'x'.repeat(300), method: 'pair-code', payload: {} }), ' '.repeat(5000)]) {
    assert.equal((await malformed(raw)).status, 400)
  }
  assert.equal((await malformed(body('pair-code'), { type: 'text/plain' })).status, 415)
  assert.equal((await malformed(body('pair-code'), { path: 'install' })).status, 404)
  const invalidPayload = await malformed(JSON.stringify({ type: 'client-request', rpcId: 'fixture', method: 'pair-code', payload: { nodeId: 'other' } }))
  assert.equal((await invalidPayload.json()).result.ok, false)
  assert.equal(web.calls, 0, 'invalid requests must not create tickets')
  const status = await malformed(body('status'), { path: 'status' })
  assert.equal(status.headers.get('cache-control'), 'no-store')
  assert.equal((await status.json()).result.value.id, 'web', 'malformed bodies cannot poison subsequent requests')
  const allowed = await post(web, cookies[0], web.origin)
  assert.equal(allowed.status, 200)
  assert.equal((await allowed.json()).result.value.ticket, 'web')
  const request = () => new Request('dsh-app://app/wechat-remote-management/pair-code', {
    method: 'POST', headers: { origin: 'dsh-app://app', cookie: cookies[0], 'content-type': 'application/json' }, body: body('pair-code'),
  })
  const forwarded = await forwardWebRequest(request(), desktop.origin, cookies[1])
  assert.equal(forwarded.status, 200)
  assert.equal((await forwarded.json()).result.value.ticket, 'desktop')
  assert.equal(web.calls, 1, 'Desktop shell never contacts Web')
  assert.equal(desktop.calls, 1)
  await web.reload()
  assert.equal((await post(web, cookies[0])).status, 200, 'service reload preserves browser authentication')
  await desktop.mounted.dispose()
  assert.equal((await forwardWebRequest(request(), desktop.origin, cookies[1])).status, 404)
  assert.equal((await post(web, cookies[0])).status, 200, 'stopping Desktop leaves Web usable')
  console.log('PASS native source ' + sha + ': real HTTP auth, cross-host cookie rejection, cross-origin rejection, official Desktop forwarding, dispose isolation')
} finally { await Promise.all([web.close(), desktop.close()]) }
