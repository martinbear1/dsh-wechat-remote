/** Isolated protocol/lifecycle audit, not a frozen-worker upgrade acceptance.
 * Uses current compiled module, real Cordis effects, temporary fixtures, and
 * loopback-only listeners. Does not start DSH or touch any user profile.
 * Run after build: node --test scripts/test-legacy-handoff.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import ts from 'typescript'
import { legacyUpdateHandoff } from '../lib/update-legacy-handoff.js'
import { PLUGIN_VERSION } from '../lib/plugin-version.js'

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})
const close = server => new Promise(resolve => {
  server.closeAllConnections(); server.close(() => resolve())
})
async function freePort() { const server = http.createServer(); const port = await listen(server); await close(server); return port }
async function waitFor(predicate, message, timeout = 1500) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await delay(10) }
  assert.fail(message)
}
const statusCode = async (port, url = '/gate/status', options) => {
  try { const res = await fetch(`http://127.0.0.1:${port}${url}`, { ...options, signal: AbortSignal.timeout(500) }); await res.text(); return res.status }
  catch { return undefined }
}

async function fixture(t, { scope = 'web', candidate = true, phase = 'verifying', delayedWorker = false, previousVersion = '1.7.13' } = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-handoff-unit-')))
  const profile = path.join(home, 'profiles', scope), id = randomBytes(16).toString('hex')
  const directory = path.join(home, 'harness-remote-updates', id), anchor = path.join(home, 'official/package.json')
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(path.dirname(anchor))
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value))
  write(anchor, { name: '@deepseek-ai/dsh', version: '0.2.0-rc.2' })
  const ports = new Set()
  while (ports.size < 3) ports.add(await freePort())
  const [webPort, gatePort, localPort] = [...ports]
  const stateFile = path.join(home, 'gate-wechat-state.json'), token = randomBytes(16).toString('hex')
  write(stateFile, { token })
  const job = { id, directory, home, profile, stateFile, webPort, gatePort, localPort,
    statusToken: randomBytes(24).toString('hex'), targetVersion: PLUGIN_VERSION,
    previousVersion, dshVersion: '0.2.0-rc.2' }
  const state = { requests: 0, phase, terminal: false, jobId: id, pendingResponses: [], mounts: [], releases: 0, disposals: 0 }
  const worker = http.createServer((req, res) => {
    state.requests++
    assert.equal(req.url, '/status')
    assert.equal(req.headers.origin, `http://127.0.0.1:${webPort}`)
    assert.equal(req.headers.authorization, `Bearer ${job.statusToken}`)
    if (delayedWorker) { state.pendingResponses.push(res); return }
    res.setHeader('content-type', 'application/json')
    // Published 1.7.10 workerMain stores exactly these four status fields; it
    // predates the echoed jobId. The unique authenticated worker token remains.
    res.end(JSON.stringify({ jobId: state.jobId, phase: state.phase, progress: 85,
      message: '检查插件版本、节点身份和会话', terminal: state.terminal }))
  })
  const workerPort = await listen(worker)
  if (candidate) {
    write(path.join(directory, 'job.json'), job)
    write(path.join(directory, 'authorized.json'), { id })
    write(path.join(directory, 'worker-ready.json'), { id, origin: `http://127.0.0.1:${workerPort}` })
    fs.writeFileSync(path.join(profile, '.harness-remote-update.lock'), id)
    write(path.join(home, 'harness-remote-updates', `profile-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}.json`), { jobId: id })
  }
  // Explicit discovery path is deliberately absent, to test the service-restart
  // path too. Restore the caller's environment exactly after every fixture.
  const oldMarker = process.env.HARNESS_REMOTE_UPDATE_JOB
  delete process.env.HARNESS_REMOTE_UPDATE_JOB
  const routes = new Map(), ctx = new Context()
  ctx.provide('profileContext', { name: scope, home, dir: profile, installAnchor: anchor })
  ctx.provide('webServer', { port: webPort, register(route) {
    assert(!routes.has(route.path), `duplicate fixture route ${route.path}`)
    routes.set(route.path, route)
    return () => { routes.delete(route.path) }
  } })
  ctx.provide('appReady', { onReady() { return () => {} } })
  const list = { items: [{ sessionId: 'retained-session', running: false }] }
  ctx.provide('sessionController', { async list() { return list } })
  const doors = new Map(), closing = []
  ctx.provide('wechatHost', { describe() { return { ok: true, value: {
    agentVersion: job.dshVersion, pluginVersion: PLUGIN_VERSION,
    gate: { publicDoor: { port: gatePort, state: doors.get('public')?.listening ? 'listening' : 'starting' },
      localDoor: { port: localPort, state: doors.get('local')?.listening ? 'listening' : 'starting' } },
  } } } })
  // This mount is deliberately a transport fixture, not mountWechatGate. The
  // actual gate, children, identity migrations and frozen worker require the
  // separate native first-hop acceptance test.
  const mount = startup => {
    state.mounts.push({ guarded: Boolean(startup) })
    const normal = (_req, res) => { res.writeHead(200); res.end('normal fixture transport') }
    for (const [door, port] of [['public', gatePort], ['local', localPort]]) {
      const server = http.createServer()
      doors.set(door, server)
      if (startup) startup.bindDoor(server, normal, door, port)
      else server.on('request', normal)
      server.listen(port, '127.0.0.1')
    }
    startup?.onRelease(() => { state.releases++ })
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true; state.disposals++
      for (const server of doors.values()) closing.push(close(server))
    }
  }
  const receipt = () => write(path.join(directory, 'verification-complete.json'), { id })
  const pending = []
  const track = promise => { if (promise) { pending.push(promise); promise.catch(() => {}) } return promise }
  t.after(async () => {
    // Only the synthetic fixture creates its own receipt for cleanup. This is
    // not a claim that a historical worker accepted this candidate.
    receipt()
    await close(worker)
    await Promise.allSettled(pending)
    await ctx.fiber.dispose()
    for (const server of doors.values()) await close(server)
    await Promise.all(closing)
    if (oldMarker === undefined) delete process.env.HARNESS_REMOTE_UPDATE_JOB
    else process.env.HARNESS_REMOTE_UPDATE_JOB = oldMarker
    assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()))
    assert(path.basename(home).startsWith('harness-handoff-unit-'))
    fs.rmSync(home, { recursive: true, force: true })
  })
  const probe = (method, override = {}) => fetch(`http://127.0.0.1:${gatePort}/api/${method}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-harness-update-probe': job.statusToken },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fixture', method, payload: {} }),
    ...override, signal: AbortSignal.timeout(1000),
  })
  return { ctx, routes, job, state, worker, list, receipt, track, probe, home, mount }
}

test('ordinary startup and Desktop do not acquire handoff resources', async t => {
  for (const options of [{ candidate: false }, { scope: 'desktop' }]) {
    await t.test(JSON.stringify(options), async t => {
      const f = await fixture(t, options), effects = f.ctx.fiber.getEffects().length
      assert.equal(legacyUpdateHandoff(f.ctx, f.mount), undefined)
      assert.equal(f.ctx.fiber.getEffects().length, effects)
      assert.equal(f.routes.size, 0); assert.equal(f.state.requests, 0)
    })
  }
})

test('a journal without live matching worker authority does not enter maintenance', async t => {
  for (const mismatch of ['wrong-job', 'terminal', 'phase', 'offline']) {
    await t.test(mismatch, async t => {
      const f = await fixture(t), effects = f.ctx.fiber.getEffects().length
      if (mismatch === 'wrong-job') f.state.jobId = 'other-transaction'
      if (mismatch === 'terminal') f.state.terminal = true
      if (mismatch === 'phase') f.state.phase = 'installing'
      if (mismatch === 'offline') await close(f.worker)
      const dispose = await f.track(legacyUpdateHandoff(f.ctx, f.mount))
      assert.equal(f.routes.size, 0)
      assert.equal(f.ctx.fiber.getEffects().length, effects)
      assert.deepEqual(f.state.mounts, [{ guarded: false }])
      dispose()
    })
  }
})

test('candidate identity/host/authorization mismatches do not even contact the worker', async t => {
  for (const field of ['targetVersion', 'previousVersion', 'dshVersion', 'webPort', 'stateFile', 'authorization']) {
    await t.test(field, async t => {
      const f = await fixture(t)
      if (field === 'authorization') fs.writeFileSync(path.join(f.job.directory, 'authorized.json'), JSON.stringify({ id: 'wrong' }))
      else {
        const changed = { ...f.job, [field]: field === 'webPort' ? 0 : field === 'stateFile' ? path.join(os.tmpdir(), 'outside') : 'mismatch' }
        fs.writeFileSync(path.join(f.job.directory, 'job.json'), JSON.stringify(changed))
      }
      assert.equal(legacyUpdateHandoff(f.ctx, f.mount), undefined)
      assert.equal(f.state.requests, 0); assert.equal(f.state.mounts.length, 0)
      assert.equal(f.routes.size, 0)
    })
  }
})

test('published 1.7.10 status shape without echoed jobId completes the same authenticated handoff', async t => {
  const f = await fixture(t, { previousVersion: '1.7.10' })
  f.state.jobId = undefined
  const pending = f.track(legacyUpdateHandoff(f.ctx, f.mount))
  await waitFor(() => statusCode(f.job.gatePort).then(status => status === 503), '1.7.10 handoff did not start')
  assert.deepEqual(f.state.mounts, [{ guarded: true }])
  assert.equal((await f.probe('wechatHost/describe')).status, 200)
  // Exercise the repeated live proof as well as first admission.
  await waitFor(() => f.state.requests >= 2, '1.7.10 worker was not rechecked')
  f.receipt()
  const dispose = await pending
  assert.equal(f.state.releases, 1)
  dispose()
})

test('the 1.7.10 exception never accepts a conflicting ID or a newer worker missing its ID', async t => {
  for (const [previousVersion, jobId] of [['1.7.10', 'conflict'], ['1.7.10', null], ['1.7.13', undefined]]) {
    await t.test(`${previousVersion}: ${String(jobId)}`, async t => {
      const f = await fixture(t, { previousVersion })
      f.state.jobId = jobId
      const dispose = await f.track(legacyUpdateHandoff(f.ctx, f.mount))
      assert.deepEqual(f.state.mounts, [{ guarded: false }])
      assert.equal(f.routes.size, 0)
      assert.equal(f.state.releases, 0)
      dispose()
    })
  }
})

test('authenticated read-only probes and receipt remove temporary routes/listeners', async t => {
  const f = await fixture(t), effects = f.ctx.fiber.getEffects().length
  const pending = f.track(legacyUpdateHandoff(f.ctx, f.mount))
  assert(pending instanceof Promise)
  await waitFor(() => statusCode(f.job.gatePort).then(status => status === 503), 'gate probe did not open')
  assert.equal(await statusCode(f.job.localPort), 503)
  assert(f.routes.has('/gate/status'))
  let nextCalled = false, replyCode
  await f.ctx.waterfall('connection/request', {}, { writeHead(code) { replyCode = code }, end() {} }, () => { nextCalled = true })
  assert.equal(replyCode, 503); assert.equal(nextCalled, false)
  assert.equal((await f.probe('session.list', { headers: {} })).status, 403)
  assert.equal((await f.probe('session.prompt')).status, 403)
  const res = await f.probe('session.list')
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).result.value, f.list)
  const describe = await f.probe('wechatHost/describe')
  assert.equal(describe.status, 200)
  assert.equal((await describe.json()).result.value.value.pluginVersion, PLUGIN_VERSION)
  const healthyHost = f.ctx.get('wechatHost')
  f.ctx.set('wechatHost', undefined)
  assert.equal((await f.probe('wechatHost/describe')).status, 503, 'no host service means no fabricated healthy version')
  f.ctx.set('wechatHost', { describe() { return { ok: true, value: { gate: {
    publicDoor: { port: f.job.gatePort, state: 'starting' }, localDoor: { port: f.job.localPort, state: 'listening' },
  } } } } })
  assert.equal((await f.probe('wechatHost/describe')).status, 503, 'binding has to be listening, not merely scheduled')
  f.ctx.set('wechatHost', healthyHost)
  assert.equal((await f.probe('session.history')).status, 503, 'missing real history service must not fabricate a readable session')
  f.receipt(); const dispose = await pending
  assert.equal(f.routes.size, 0)
  assert.equal(f.ctx.fiber.getEffects().length, effects)
  assert.equal(f.state.releases, 1)
  assert.equal(await statusCode(f.job.gatePort), 200, 'verified real transport stays mounted')
  await f.ctx.waterfall('connection/request', {}, {}, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  dispose()
  await waitFor(() => statusCode(f.job.gatePort).then(status => status === undefined), 'fixture gate did not close')
})

test('mount failure cannot leave HTTP admission guarded or complete verification', async t => {
  const f = await fixture(t), effects = f.ctx.fiber.getEffects().length
  const pending = f.track(legacyUpdateHandoff(f.ctx, () => { throw Error('fixture mount failure') }))
  await assert.rejects(pending, /fixture mount failure/)
  assert.equal(f.routes.size, 0)
  assert.equal(f.ctx.fiber.getEffects().length, effects)
  assert.equal(fs.existsSync(path.join(f.job.directory, 'verification-complete.json')), false)
  assert.equal(f.state.releases, 0)
})

test('a disposed handoff must not report normal completion to the mount continuation', async t => {
  const f = await fixture(t, { delayedWorker: true })
  const pending = f.track(legacyUpdateHandoff(f.ctx, f.mount))
  await waitFor(() => f.state.requests === 1, 'live worker request did not start')
  await f.ctx.fiber.dispose()
  await assert.rejects(pending, 'disposal must propagate abort instead of allowing index.ts to mount on a disposed context')
})

test('real Cordis async apply must release verification listeners promptly on disposal', async t => {
  const f = await fixture(t)
  let continuation = false
  const fiber = f.ctx.plugin({ name: 'legacy-handoff-test', apply(owner) {
    const handoff = f.track(legacyUpdateHandoff(owner, f.mount))
    return handoff?.then(dispose => { continuation = true; return dispose })
  } })
  await waitFor(() => statusCode(f.job.localPort).then(status => status === 503), 'handoff did not start')
  let disposed = false
  const disposal = Promise.resolve(fiber.dispose()).then(() => { disposed = true })
  f.track(disposal)
  await delay(200)
  assert.equal(disposed, true, 'async apply must not defer its own abort effect until receipt/210s timeout')
  assert.equal(continuation, false, 'disposing a loading fiber must not run the mount continuation')
  assert.equal(await statusCode(f.job.localPort), undefined)
})

test('worker exit after initial proof must not leave maintenance until the 210s deadline', async t => {
  const f = await fixture(t)
  let settled = false
  const pending = f.track(legacyUpdateHandoff(f.ctx, f.mount))
  pending.then(() => { settled = true }, () => { settled = true })
  await waitFor(() => statusCode(f.job.localPort).then(status => status === 503), 'handoff did not start')
  await close(f.worker)
  await delay(1800)
  assert.equal(settled, true, 'live worker must be rechecked while guarded; dead workers cannot leave a long maintenance window')
  assert.equal(f.routes.size, 0)
  assert.equal(f.state.releases, 0)
  assert.equal(f.state.disposals, 1)
})

test('a worker terminal/failure transition cleans up without releasing normal transports', async t => {
  const f = await fixture(t)
  const pending = f.track(legacyUpdateHandoff(f.ctx, f.mount))
  await waitFor(() => statusCode(f.job.localPort).then(status => status === 503), 'handoff did not start')
  f.state.phase = 'failed'; f.state.terminal = true
  await assert.rejects(pending, /停止验收/)
  assert.equal(f.routes.size, 0)
  assert.equal(f.state.releases, 0)
  assert.equal(f.state.disposals, 1)
  assert.equal(fs.existsSync(path.join(f.job.directory, 'verification-complete.json')), false)
})

test('gate source defers optional writers only within explicit handoff, with unchanged ordinary startup', () => {
  const source = ts.createSourceFile('gate-runtime.ts', fs.readFileSync(new URL('../src/gate-runtime.ts', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const nodes = []
  const collect = node => { nodes.push(node); ts.forEachChild(node, collect) }
  collect(source)
  const identifier = (node, value) => node && ts.isIdentifier(node) && node.text === value
  const called = (node, name) => ts.isCallExpression(node) && identifier(node.expression, name)
  for (const [start, label, service] of [
    ['startFeatures', 'features', 'WechatFeaturesService'], ['startHumanTools', 'human-tools', 'HumanToolsService'],
  ]) {
    const declarations = nodes.filter(node => ts.isVariableDeclaration(node) && identifier(node.name, start))
    assert.equal(declarations.length, 1, `one ${start} owner`)
    const initializer = declarations[0].initializer
    assert(ts.isArrowFunction(initializer) && called(initializer.body, 'mountChild'))
    assert.equal(initializer.body.arguments[0].text, label)
    assert(identifier(initializer.body.arguments[1], service))
    const mounts = nodes.filter(node => called(node, 'mountChild') && node.arguments[0]?.text === label)
    assert.equal(mounts.length, 1, `${label} has no early duplicate mount`)
    const branches = nodes.filter(node => ts.isIfStatement(node) && identifier(node.expression, 'startup')
      && node.thenStatement.getText(source) === `startup.onRelease(${start})`
      && node.elseStatement?.getText(source) === `${start}()`)
    assert.equal(branches.length, 1, `${label} must wait only in handoff and run directly otherwise`)
    assert.equal(nodes.filter(node => called(node, start)).length, 1, `${label} cannot also start unconditionally`)
  }
  const notification = nodes.find(node => ts.isVariableDeclaration(node) && identifier(node.name, 'startNotifications'))
  assert(notification && ts.isArrowFunction(notification.initializer))
  assert(ts.isBlock(notification.initializer.body) && notification.initializer.body.statements.some(ts.isTryStatement),
    'optional notification activation failure stays isolated after receipt')
  const component = fs.readFileSync(new URL('../src/clawbot-component.ts', import.meta.url), 'utf8')
  assert.match(component, /export const inject = \[[^\]]*'wechatFeatures'/, 'ClawBot must still depend on delayed provider')
})
