// Real temporary filesystem + current service source. Native installation and
// release transport are synthetic; no user's profile or cloud is accessed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { NativeUpdateService, nativeReleaseFixture, mockArtifactFetch } from './native-update-fixture.mjs'

function fixture(t, outer = true) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-update-cache-'))
  const directory = path.join(home, 'harness-remote-updates', 'native-web')
  fs.mkdirSync(directory, { recursive: true })
  const artifacts = nativeReleaseFixture(), release = artifacts.release
  const bundle = outer ? 'dsh-wechat-remote' : '@harness-remote/dsh-wechat-remote'
  const key = `${outer ? 'bundle' : 'core'}-${release.version}-${(outer ? release.npmInstaller : release.asset).sha256}`
  const target = path.join(directory, key), file = path.join(target, 'release.tgz')
  const flat = path.join(directory, key + '.tgz'), bytes = outer ? artifacts.outer : artifacts.core
  const installs = [], downloads = mockArtifactFetch(t, artifacts)
  t.mock.method(fs.promises, 'link', async () => assert.fail('archive publication must not require hard links'))
  let version = '1.7.13'
  const manager = { listBundles: async () => [{ name: bundle, version, enabled: true, installed: true }],
    installBundle: async spec => { installs.push(spec); version = release.version; return { application: 'restart-required', bundle, changed: true } } }
  const service = new NativeUpdateService({ home, scope: 'web', runningVersion: '1.7.13',
    manager: () => manager,
    sessions: () => ({ list: async () => ({ items: [] }) }),
    release: async () => ({ advice: { revision: 'cache-test', component: 'plugin', targetVersion: release.version }, release, channel: 'stable' }),
  })
  // The private implementation is callable after TypeScript compilation. This
  // isolates publication races from the separate single-job journal protocol.
  const publish = () => service.installSpec({ bundle, release })
  const run = async () => {
    service.start((await service.check()).ticket)
    for (let i = 0; i < 500 && service.isBusy(); i++) await new Promise(resolve => setTimeout(resolve, 2))
    assert.equal(service.isBusy(), false)
    return service.status()
  }
  const seed = data => { fs.mkdirSync(target); if (data !== undefined) fs.writeFileSync(file, data) }
  t.after(() => { service.dispose(); assert.equal(path.dirname(home), os.tmpdir()); fs.rmSync(home, { recursive: true, force: true }) })
  return { directory, target, file, flat, bytes, installs, downloads, publish, run, seed, service }
}
const ioError = code => Object.assign(new Error(`injected ${code}`), { code })
const noStaging = f => assert(!fs.readdirSync(f.directory).some(name => name.startsWith('.stage-')))

for (const outer of [true, false]) {
  test(`${outer ? 'outer' : 'core'}: complete archive publishes without link support and reaches native installer once`, async t => {
    const f = fixture(t, outer)
    assert.equal((await f.run()).phase, 'restart-required')
    assert.deepEqual(f.installs, [f.file]); assert.deepEqual(fs.readFileSync(f.file), f.bytes)
    assert.equal(f.downloads.length, 1); noStaging(f)
    assert.equal(await f.publish(), f.file); assert.equal(f.downloads.length, 1, 'valid cache needs no download')
  })
  test(`${outer ? 'outer' : 'core'}: old flat cache is reused without moving an existing lockfile source`, async t => {
    const f = fixture(t, outer)
    fs.writeFileSync(f.flat, f.bytes); f.seed('unrelated-invalid-new-cache')
    assert.equal((await f.run()).phase, 'restart-required')
    assert.deepEqual(f.installs, [f.flat]); assert.deepEqual(fs.readFileSync(f.flat), f.bytes)
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'unrelated-invalid-new-cache'); assert.equal(f.downloads.length, 0)
  })
}

for (const kind of ['flat-corrupt', 'directory-corrupt', 'directory-empty', 'directory-unrelated']) {
  test(`${kind}: existing data is not overwritten and native installation is never submitted`, async t => {
    const f = fixture(t)
    if (kind === 'flat-corrupt') fs.writeFileSync(f.flat, 'preserved')
    else f.seed(kind === 'directory-corrupt' ? 'preserved' : undefined)
    if (kind === 'directory-unrelated') fs.writeFileSync(path.join(f.target, 'keep.txt'), 'preserved')
    assert.equal((await f.run()).phase, 'failed')
    assert.equal(f.installs.length, 0); assert.equal(f.downloads.length, 0); noStaging(f)
    if (kind === 'flat-corrupt') assert.equal(fs.readFileSync(f.flat, 'utf8'), 'preserved')
    if (kind === 'directory-corrupt') assert.equal(fs.readFileSync(f.file, 'utf8'), 'preserved')
    if (kind === 'directory-empty') assert.deepEqual(fs.readdirSync(f.target), [])
    if (kind === 'directory-unrelated') assert.equal(fs.readFileSync(path.join(f.target, 'keep.txt'), 'utf8'), 'preserved')
  })
}

test('two concurrent publications keep one complete source and reuse the verified winner', async t => {
  const f = fixture(t), rename = fs.promises.rename.bind(fs.promises)
  let arrivals = 0, release, collisions = 0
  const barrier = new Promise(resolve => { release = resolve })
  t.mock.method(fs.promises, 'rename', async (from, to) => {
    if (++arrivals === 2) release()
    await barrier
    try { await rename(from, to) } catch (error) { collisions++; throw error }
  })
  assert.deepEqual(await Promise.all([f.publish(), f.publish()]), [f.file, f.file])
  assert.equal(arrivals, 2); assert.equal(collisions, 1)
  assert.deepEqual(fs.readFileSync(f.file), f.bytes); noStaging(f)
})

test('bad competing publisher cannot be overwritten or submitted to native installation', async t => {
  const f = fixture(t), rename = fs.promises.rename.bind(fs.promises)
  t.mock.method(fs.promises, 'rename', async (from, to) => { f.seed('bad-winner'); return rename(from, to) })
  assert.equal((await f.run()).phase, 'failed'); assert.equal(f.installs.length, 0)
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'bad-winner'); noStaging(f)
})

for (const fault of ['write', 'read', 'rename', 'corrupt-write']) {
  test(`${fault} failure leaves earlier release intact and does not call the installer`, async t => {
    const f = fixture(t), old = path.join(f.directory, 'old-release.tgz')
    fs.writeFileSync(old, f.bytes)
    const read = fs.promises.readFile.bind(fs.promises), write = fs.promises.writeFile.bind(fs.promises)
    if (fault === 'write' || fault === 'corrupt-write') t.mock.method(fs.promises, 'writeFile', async (file, bytes, options) => {
      await write(file, bytes.subarray(0, 12), options)
      if (fault === 'write') throw ioError('ENOSPC')
    })
    if (fault === 'read') t.mock.method(fs.promises, 'readFile', async file => {
      if (path.basename(path.dirname(file)).startsWith('.stage-')) throw ioError('EIO')
      return read(file)
    })
    if (fault === 'rename') t.mock.method(fs.promises, 'rename', async () => { throw ioError('EPERM') })
    assert.equal((await f.run()).phase, 'failed'); assert.equal(f.installs.length, 0)
    assert.deepEqual(fs.readFileSync(old), f.bytes); assert(!fs.existsSync(f.target)); noStaging(f)
  })
}

test('unreadable existing archive is not treated as a missing archive', async t => {
  const f = fixture(t), read = fs.promises.readFile.bind(fs.promises)
  f.seed(f.bytes)
  t.mock.method(fs.promises, 'readFile', async file => { if (file === f.file) throw ioError('EACCES'); return read(file) })
  assert.equal((await f.run()).phase, 'failed'); assert.equal(f.installs.length, 0); assert.equal(f.downloads.length, 0)
  assert.deepEqual(fs.readFileSync(f.file), f.bytes); noStaging(f)
})

test('disposal after staging cannot publish or install an old request', async t => {
  const f = fixture(t), write = fs.promises.writeFile.bind(fs.promises)
  t.mock.method(fs.promises, 'writeFile', async (...args) => { await write(...args); f.service.dispose() })
  assert.equal((await f.run()).phase, 'failed'); assert.equal(f.installs.length, 0)
  assert(!fs.existsSync(f.target)); noStaging(f)
})
