/** Host non-interference regression. Every file belongs to a new temporary
 * fixture, the HTTP server is an EventEmitter, and no process/server/profile
 * outside that fixture is started, contacted, stopped, or modified. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { PluginUpdateService } from '../lib/update-service.js'

function fixture(t, { phase = 'verifying', terminal = false, explicit = false, completed = false, malformed = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'startup-update-fence-')))
  const id = 'a'.repeat(32), directory = path.join(root, 'harness-remote-updates', id)
  const profile = path.join(root, 'profiles', 'web'), file = path.join(root, 'fixture-runtime')
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(file, 'fixture; never executed')
  const job = { id, directory, home: root, profile, stateFile: file, cli: file, argv: [file], execArgv: [],
    executable: file, cwd: root, pnpm: file, parentPid: 987654, webPort: 3080, gatePort: 3092, localPort: 3093,
    targetVersion: '1.7.14-rc.24', previousVersion: '1.7.13', dshVersion: '0.2.0-rc.1', statusToken: 'b'.repeat(48) }
  const index = path.join(root, 'harness-remote-updates', `profile-${createHash('sha256').update('web').digest('hex').slice(0, 24)}.json`)
  // No worker exists. A journal or a syntactically valid loopback address is
  // not proof that this host belongs to an ongoing authorized transaction.
  fs.writeFileSync(index, JSON.stringify({ jobId: id, statusOrigin: 'http://127.0.0.1:1', statusToken: job.statusToken }))
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ phase, terminal }))
  fs.writeFileSync(path.join(directory, 'job.json'), malformed ? '{' : JSON.stringify(job))
  if (completed) fs.writeFileSync(path.join(directory, 'verification-complete.json'), JSON.stringify({ id }))
  const oldMarker = process.env.HARNESS_REMOTE_UPDATE_JOB
  if (explicit) process.env.HARNESS_REMOTE_UPDATE_JOB = directory
  else delete process.env.HARNESS_REMOTE_UPDATE_JOB
  const services = [], server = new EventEmitter()
  const nativeRequest = (_req, res) => { res.writeHead(200); res.end('native') }
  const nativeUpgrade = () => {}
  server.on('request', nativeRequest); server.on('upgrade', nativeUpgrade)
  const originalRequests = server.listeners('request'), originalUpgrades = server.listeners('upgrade')
  const facts = { name: 'web', home: root, dir: profile, installAnchor: path.join(root, 'package.json') }
  const ctx = { get: key => key === 'profileContext' ? facts : key === 'webServer' ? { server } : undefined }
  t.after(() => {
    for (const service of services) service.dispose()
    if (oldMarker === undefined) delete process.env.HARNESS_REMOTE_UPDATE_JOB
    else process.env.HARNESS_REMOTE_UPDATE_JOB = oldMarker
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()))
    assert(path.basename(root).startsWith('startup-update-fence-'))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { server, originalRequests, originalUpgrades,
    start() { const value = new PluginUpdateService(ctx, { web: 3080, gate: 3092, local: 3093 }); services.push(value); return value },
    get() {
      const replies = []
      server.emit('request', { method: 'GET', url: '/', headers: {}, socket: { remoteAddress: '127.0.0.1' } },
        { writeHead(status) { replies.push({ status }) }, end(body) { replies.at(-1).body = body } })
      return replies
    },
    assertNative() {
      assert(server.listeners('request').includes(nativeRequest), 'the native request handler must not be removed')
      assert(server.listeners('upgrade').includes(nativeUpgrade), 'the native WebSocket handler must not be removed')
      assert.deepEqual(this.get(), [{ status: 200, body: 'native' }])
    },
  }
}

for (const phase of ['restarting', 'verifying', 'rolling-back']) {
  test(`ordinary startup ignores abandoned ${phase} journal instead of fencing the native host`, t => {
    const h = fixture(t, { phase }), service = h.start()
    h.assertNative()
  })
}

test('terminal failed update does not turn an ordinary launch into maintenance', t => {
  const h = fixture(t, { phase: 'failed', terminal: true }), service = h.start()
  h.assertNative()
})

test('a stale inherited launch marker without an authenticated live worker cannot fence native HTTP', t => {
  const h = fixture(t, { explicit: true }), service = h.start()
  h.assertNative()
})

test('an already verified explicit candidate leaves native listeners intact', t => {
  const h = fixture(t, { explicit: true, completed: true }), service = h.start()
  h.assertNative()
  service.dispose()
  assert.deepEqual(h.server.listeners('request'), h.originalRequests)
  assert.deepEqual(h.server.listeners('upgrade'), h.originalUpgrades)
})

test('startup journal parse failure is isolated and cannot leak the updater observer', t => {
  const h = fixture(t, { explicit: true, malformed: true })
  try { h.start() } catch { /* An optional component may refuse to mount. */ }
  h.assertNative()
  assert.deepEqual(h.server.listeners('request'), h.originalRequests)
  assert.deepEqual(h.server.listeners('upgrade'), h.originalUpgrades)
})

test('disposing one updater restores original listeners once and preserves later foreign listeners', t => {
  const h = fixture(t, { explicit: true }), service = h.start()
  const later = () => {}, laterUpgrade = () => {}
  h.server.on('request', later); h.server.on('upgrade', laterUpgrade)
  service.dispose(); service.dispose()
  assert.equal(h.server.listeners('request').filter(fn => fn === later).length, 1)
  assert.equal(h.server.listeners('upgrade').filter(fn => fn === laterUpgrade).length, 1)
  assert.equal(h.server.listeners('request').length, h.originalRequests.length + 1)
  assert.equal(h.server.listeners('upgrade').length, h.originalUpgrades.length + 1)
  h.assertNative()
})

for (const order of [[0, 1], [1, 0]]) {
  test(`overlapping optional updater disposal ${order.join(' then ')} cannot resurrect a disposed fence`, t => {
    const h = fixture(t, { explicit: true }), instances = [h.start(), h.start()]
    for (const index of order) instances[index].dispose()
    h.assertNative()
    assert.deepEqual(h.server.listeners('request'), h.originalRequests)
    assert.deepEqual(h.server.listeners('upgrade'), h.originalUpgrades)
  })
}
