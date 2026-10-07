import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { auditArchive, boundedFetch } from '../lib/update-download.js'
import { acceptsUpdateRequest } from '../lib/update-service.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { quiesceNativeHost } from '../lib/install-control.js'
import { executeUpdate, releaseOwnedUpdateLock } from '../lib/update-worker.js'
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
await test('retired live worker rejects before reading job paths, progress or native quiesce', async () => {
  const job = new Proxy({}, { get() { assert.fail('must not inspect historical job') } })
  await assert.rejects(executeUpdate(job, () => assert.fail('no progress side effects'), async () => assert.fail('no quiesce')),
    { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
})
await test('retired installer cannot read, flush or dispose the native host', async () => {
  const ctx = { get: () => assert.fail(), fiber: { dispose: () => assert.fail() } }
  await assert.rejects(quiesceNativeHost(ctx, () => assert.fail(), () => assert.fail()),
    { code: 'NATIVE_MANUAL_UPDATE_REQUIRED' })
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
await test('historical worker executable refuses before files, listeners or parent start handshake', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-retired-worker-')))
  const before = fs.readdirSync(root)
  const file = fileURLToPath(new URL('../lib/update-worker.js', import.meta.url))
  const child = spawn(process.execPath, [file, path.join(root, 'nonexistent-job.json')], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  let error = '', messages = 0
  child.stderr.on('data', bytes => { error += bytes })
  child.on('message', () => messages++)
  try {
    assert.equal(await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) }), 1)
    assert.match(error, /不支持一键在线更新/)
    assert.equal(messages, 0)
    assert.deepEqual(fs.readdirSync(root), before)
  } finally {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()))
    assert(path.basename(root).startsWith('harness-retired-worker-'))
    fs.rmSync(root, { recursive: true })
  }
})
console.log(JSON.stringify({ ok: true, cases }))
