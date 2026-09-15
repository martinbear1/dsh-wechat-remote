import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { auditArchive, boundedFetch } from '../lib/update-download.js'
import { acceptsUpdateRequest, PluginUpdateService } from '../lib/update-service.js'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { quiesceNativeHost } from '../lib/install-control.js'
import { validateJob, healthy, stopRestarted, captureCandidateLock, retireCandidateLock, releaseOwnedUpdateLock, migrateLegacyGrantOwner } from '../lib/update-worker.js'
const files = [ ['package/package.json', JSON.stringify({ name: '@harness-remote/dsh-wechat-remote', version: '1.7.0' })], ['package/lib/index.js', ''], ['package/lib/client.js', ''] ]
function pack(entries) {
  const chunks = []
  for (const [name, content, type = '0'] of entries) {
    const data = Buffer.from(content), h = Buffer.alloc(512)
    h.write(name); h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write(type, 156)
    h.fill(32, 148, 156); h.write([...h].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(h, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
const releaseFor = archive => ({ version: '1.7.0', asset: { bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex') } })
let cases = 0
const test = async (label, fn) => { await fn(); cases++; console.log('PASS ' + label) }
await test('valid npm tarball accepted before package manager', () => { const a = pack(files); auditArchive(a, releaseFor(a)) })
await test('tampered SHA, size, manifest version rejected', () => {
  const a = pack(files)
  assert.throws(() => auditArchive(a, { ...releaseFor(a), version: '2.0.0' }))
  assert.throws(() => auditArchive(a, { version: '1.7.0', asset: { bytes: a.length, sha256: '0'.repeat(64) } }))
})
await test('traversal symlink hardlink case collision Windows device paths rejected', () => {
  for (const entry of [['package/../evil', ''], ['package/link', 'target', '2'], ['package/link', '', '1'], ['package/LIB/index.js', ''], ['package/CON.txt', ''], ['package/lib/a.js:stream', ''], ['package/foo\\bar', ''], ['package/foo. ', '']]) {
    const a = pack([...files, entry]); assert.throws(() => auditArchive(a, releaseFor(a)), entry[0])
  }
})
await test('untrusted redirected URL rejected before network', async () => {
  let calls = 0
  await assert.rejects(boundedFetch('https://github.com/a', 10, async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }) }))
  assert.equal(calls, 1)
})
await test('streaming response capped without Content-Length', async () => {
  await assert.rejects(boundedFetch('https://github.com/a', 10, async () => new Response('a'.repeat(11))))
})
await test('valid bounded HTTPS body accepted', async () => assert.equal((await boundedFetch('https://github.com/a', 10, async () => new Response('abc'))).toString(), 'abc'))
await test('updater requires exact Origin Host loopback and no proxy headers', () => {
  const req = { headers: { host: '127.0.0.1:3183', origin: 'http://localhost:3180' }, socket: { remoteAddress: '127.0.0.1' } }
  assert(acceptsUpdateRequest(req, 3180, 3183))
  for (const change of [{ origin: 'https://evil.test' }, { origin: 'null' }, { origin: '' }, { host: 'evil.test:3183' }, { 'x-forwarded-for': '127.0.0.1' }, { origin: 'http://127.0.0.1:4180' }]) assert(!acceptsUpdateRequest({ ...req, headers: { ...req.headers, ...change } }, 3180, 3183))
  assert(!acceptsUpdateRequest({ ...req, socket: { remoteAddress: '192.168.1.2' } }, 3180, 3183))
})
await test('malformed and broad updater filesystem targets rejected', () => {
  assert.throws(() => validateJob({ id: '../bad', directory: '/', profile: '/', home: '/' }))
})
await test('native disposal flushes idle sessions and rejects a busy race before shutdown', async () => {
  let running = false, flushed = 0, disposed = 0, raced = false
  const ctx = { get: () => ({ list: () => [{}], flush: async () => { flushed++; if (raced) running = true; return true } }),
    fiber: { dispose: async () => { disposed++ } } }
  const read = async () => ({ items: [{ running }] })
  await quiesceNativeHost(ctx, read, () => {})
  assert.equal(flushed, 1); assert.equal(disposed, 1)
  running = true
  await assert.rejects(quiesceNativeHost(ctx, read, () => {}))
  assert.equal(flushed, 1); assert.equal(disposed, 1)
  running = false; raced = true
  await assert.rejects(quiesceNativeHost(ctx, read, () => {}))
  assert.equal(flushed, 2); assert.equal(disposed, 1)
})
await test('failed save or unreadable sessions never disposes the native host', async () => {
  let disposed = false
  const ctx = { get: () => ({ list: () => [{}], flush: async () => false }),
    fiber: { dispose: async () => { disposed = true } } }
  await assert.rejects(quiesceNativeHost(ctx, async () => ({ items: [{ running: false }] }), () => {}), /保存未完成/)
  await assert.rejects(quiesceNativeHost(ctx, async () => { throw Error('unreadable session state') }, () => {}))
  assert.equal(disposed, false)
})
await test('silent HTTP peer cannot multiply the overall restart health deadline', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-deadline-test-')))
  const stateFile = path.join(root, 'state.json'); fs.writeFileSync(stateFile, '{"token":"synthetic"}')
  const server = http.createServer(() => {})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const started = Date.now()
  try {
    await assert.rejects(healthy({ stateFile, gatePort: server.address().port }, '1.7.0', 100))
    assert(Date.now() - started < 1500, 'health timeout must be wall-clock bounded')
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    assert(path.basename(root).startsWith('harness-update-deadline-test-') && path.dirname(root) === fs.realpathSync(os.tmpdir()))
    fs.rmSync(root, { recursive: true })
  }
})
await test('old job cannot remove a newer owned lock', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-lock-test-')))
  const lock = path.join(root, 'lock')
  try {
    fs.writeFileSync(lock, 'next'); releaseOwnedUpdateLock(lock, 'old')
    assert.equal(fs.readFileSync(lock, 'utf8'), 'next')
    releaseOwnedUpdateLock(lock, 'next'); assert(!fs.existsSync(lock))
  } finally { fs.rmSync(root, { recursive: true }) }
})
await test('restart stop waits for a slow owned child without forced termination', async () => {
  const signals = []
  const child = { exitCode: null, signalCode: null, kill: signal => { signals.push(signal); return true } }
  const timer = setTimeout(() => { child.exitCode = 0 }, 240)
  try {
    await stopRestarted(child, 1000)
    assert.deepEqual(signals, ['SIGTERM'])
  } finally { clearTimeout(timer) }
})
await test('restart stop is bounded and never kills a reused or already exited PID', async () => {
  const signals = []
  const child = { exitCode: null, signalCode: null, kill: signal => { signals.push(signal); return true } }
  const started = Date.now()
  await assert.rejects(stopRestarted(child, 80, 80), /未按时停止/)
  assert(Date.now() - started < 1000)
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  await stopRestarted({ exitCode: 0, signalCode: null, kill: () => { throw Error('exited handle must not be killed') } })
  await stopRestarted({ exitCode: null, signalCode: 'SIGTERM', kill: () => { throw Error('signalled handle must not be killed') } })
})
await test('hung candidate can be stopped through its owned handle to permit rollback', async () => {
  const signals = []
  const child = { exitCode: null, signalCode: null, kill(signal) {
    signals.push(signal)
    if (signal === 'SIGKILL') this.signalCode = signal
    return true
  } }
  await stopRestarted(child, 30, 30)
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
})
await test('native lock recovery requires exact candidate ownership and confirmed exit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-native-lock-test-'))
  const lockPath = path.join(root, '.credentials.yaml.lock')
  const child = { pid: process.pid, exitCode: null, signalCode: null }
  const saved = path.join(root, 'candidate-credentials-lock.before-rollback')
  try {
    fs.writeFileSync(lockPath, `${process.pid}\n`)
    const owned = captureCandidateLock(root, child)
    assert(owned)
    retireCandidateLock(owned, child, root)
    assert(fs.existsSync(lockPath), 'a live writer must never lose its lock')
    retireCandidateLock(owned, { ...child, exitCode: 0 }, root)
    assert(!fs.existsSync(lockPath)); assert.equal(fs.readFileSync(saved, 'utf8'), `${process.pid}\n`)
    fs.writeFileSync(lockPath, '99999999\n')
    assert.equal(captureCandidateLock(root, child), undefined)
    retireCandidateLock(owned, { ...child, exitCode: 0 }, root)
    assert.equal(fs.readFileSync(lockPath, 'utf8'), '99999999\n')
    fs.writeFileSync(lockPath, '')
    assert.equal(captureCandidateLock(root, child), undefined, 'an empty lock without owner descriptor is not proof')
    if (process.platform === 'linux') {
      const fd = fs.openSync(lockPath, 'r+')
      try { assert(captureCandidateLock(root, child), 'open candidate FD proves ownership even before PID write') }
      finally { fs.closeSync(fd) }
    }
    assert.equal(captureCandidateLock(root, { ...child, exitCode: 0 }), undefined)
  } finally { fs.rmSync(root, { recursive: true }) }
})
await test('ready helper does not mutate without explicit initiating-parent start authorization', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-handshake-test-')))
  const id = 'a'.repeat(32), directory = path.join(root, 'harness-remote-updates', id), profile = path.join(root, 'profiles/web')
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(profile, { recursive: true })
  const stateFile = path.join(root, 'state.json'); fs.writeFileSync(stateFile, '{}')
  const job = { id, directory, profile, home: root, stateFile, cli: process.execPath, argv: [process.execPath, 'web'], execArgv: [],
    executable: process.execPath, cwd: root, pnpm: process.execPath, parentPid: process.pid, webPort: 1000, gatePort: 1002, localPort: 1003,
    targetVersion: '1.7.0', previousVersion: '1.6.0', dshVersion: '0.1.2-rc.1', statusToken: 'b'.repeat(48) }
  fs.writeFileSync(path.join(directory, 'job.json'), JSON.stringify(job)); fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
  for (const file of ['update-worker.js', 'secure-file.js', 'install-profile.js', 'install-runtime.js', 'install-lifecycle.js']) fs.copyFileSync(fileURLToPath(new URL('../lib/' + file, import.meta.url)), path.join(directory, file))
  const child = spawn(process.execPath, [path.join(directory, 'update-worker.js'), path.join(directory, 'job.json')], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('helper not ready')), 5000)
      child.once('error', reject); child.on('message', m => { if (m.type === 'ready') { clearTimeout(timer); resolve() } })
    })
    child.send({ type: 'start', id: 'wrong' })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert(!fs.existsSync(path.join(directory, 'profile-staged')))
    child.disconnect()
    const timer = setTimeout(() => child.kill(), 5000)
    assert.equal(await exited, 1); clearTimeout(timer)
    assert(!fs.existsSync(path.join(directory, 'profile-staged')))
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
    assert(path.basename(root).startsWith('harness-update-handshake-test-') && path.dirname(root) === fs.realpathSync(os.tmpdir()))
    fs.rmSync(root, { recursive: true })
  }
})
await test('legacy grant migration preserves tokens and refuses mismatched private/public identity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-grant-proof-'))
  const stateFile = path.join(directory, 'state.json'), identityFile = path.join(directory, 'identity.json')
  const keys = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519')
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' })
  const nodeId = createHash('sha256').update(publicKey).digest().subarray(0, 18).toString('base64url')
  const identity = { nodeId, privateKeyPem: keys.privateKey.export({format:'pem',type:'pkcs8'}), publicKeyPem: keys.publicKey.export({format:'pem',type:'spki'}) }
  const original = { token: 'synthetic-lan-token', wechatBindings: ['synthetic-binding'] }
  try {
    fs.writeFileSync(stateFile, JSON.stringify(original)); fs.writeFileSync(identityFile, JSON.stringify(identity))
    migrateLegacyGrantOwner({ previousVersion: '1.5.5', stateFile, identityFile })
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)), { ...original, publicIdentityNodeId: nodeId })
    fs.writeFileSync(stateFile, JSON.stringify(original))
    fs.writeFileSync(identityFile, JSON.stringify({ ...identity, publicKeyPem: other.publicKey.export({format:'pem',type:'spki'}) }))
    assert.throws(() => migrateLegacyGrantOwner({ previousVersion: '1.5.5', stateFile, identityFile }))
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)), original)
  } finally {
    assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('legacy-grant-proof-'))
    fs.rmSync(directory, { recursive: true })
  }
})
console.log(JSON.stringify({ ok: true, cases }))
