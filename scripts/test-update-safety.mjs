import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { auditArchive, boundedFetch } from '../lib/update-download.js'
import { acceptsUpdateRequest, PluginUpdateService } from '../lib/update-service.js'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { validateJob, healthy } from '../lib/update-worker.js'
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
await test('maintenance fence persists idle sessions, rejects busy race and restores original WebUI', async () => {
  let running = false, flushed = 0
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(req.url === '/api/session.list' ? { result: { ok: true, value: { items: [{ sessionId: 'test', running }] } } } : { ok: true }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const sessions = { list: () => [{}], get: () => ({}), flush: async () => { flushed++; return true } }
  const service = new PluginUpdateService({ get: name => name === 'webServer' ? { server, upgradedSockets: new Set() } : name === 'sessions' ? sessions : null }, { web: port, gate: port + 2, local: port + 3 })
  try {
    await service.quiesce()
    assert.equal(flushed, 1); assert(service.isMaintaining())
    assert.equal((await fetch(`http://127.0.0.1:${port}/some-write`, { method: 'POST' })).status, 503)
    service.restoreFence()
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
    running = true
    await assert.rejects(service.quiesce())
    assert(!service.isMaintaining()); assert.equal(flushed, 1)
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
  } finally { service.dispose(); await new Promise(resolve => server.close(resolve)) }
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
await test('old worker completion cannot clear a newer job or its owned lock', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-lock-test-')))
  const lock = path.join(root, 'lock')
  const service = new PluginUpdateService({ get: () => null }, { web: 1000, gate: 1002, local: 1003 })
  try {
    const old = new EventEmitter(), next = new EventEmitter()
    service.child = old; service.watchWorker(old, lock, 'old')
    service.child = next; service.busy = true; let restored = false
    service.restoreFence = () => { restored = true }
    fs.writeFileSync(lock, 'next')
    old.emit('message', { type: 'finished' }); old.emit('exit', 0)
    assert(service.busy); assert(!restored); assert.equal(fs.readFileSync(lock, 'utf8'), 'next')
    service.watchWorker(next, lock, 'next'); next.emit('message', { type: 'finished' })
    assert(!service.busy); assert(restored); assert(!fs.existsSync(lock))
  } finally {
    service.dispose()
    assert(path.basename(root).startsWith('harness-update-lock-test-') && path.dirname(root) === fs.realpathSync(os.tmpdir()))
    fs.rmSync(root, { recursive: true })
  }
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
  for (const file of ['update-worker.js', 'secure-file.js']) fs.copyFileSync(fileURLToPath(new URL('../lib/' + file, import.meta.url)), path.join(directory, file))
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
console.log(JSON.stringify({ ok: true, cases }))
