import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync } from 'node:child_process'
import { prepareNodeStorage, nodeStorageDirectory, writeNodeState, installedNodeStatePaths } from '../lib/node-storage.js'
import { durableSnapshot } from '../lib/update-worker.js'
import { loadOrCreateAgentIdentity } from '../lib/public-relay-agent.js'
import { loadGateState, saveGateState } from '../lib/gate-state.js'

const read = file => JSON.parse(readFileSync(file, 'utf8'))
const put = (file, value) => writeFileSync(file, JSON.stringify(value))
function fixture(t, legacy = true) {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-node-migrate-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const dir = nodeStorageDirectory(home, 'web')
  const oldId = path.join(home, 'harness-remote-public-identity.json')
  const oldGate = path.join(home, 'gate-wechat-state.json')
  let id
  if (legacy) {
    id = loadOrCreateAgentIdentity(oldId)
    saveGateState(oldGate, { token: 'x'.repeat(43), publicIdentityNodeId: id.nodeId })
    put(path.join(home, 'harness-remote-public.json'), { enabled: false })
  }
  return { home, dir, oldId, oldGate, id, currentId: path.join(dir, 'identity.json'), currentGate: path.join(dir, 'gate-wechat-state.json') }
}
test('old Web migrates once with exact node/key/token, idempotent install, default alias and rollback files', t => {
  const f = fixture(t), oldBytes = readFileSync(f.oldId)
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(read(f.currentId), f.id)
  assert.deepEqual(read(f.currentGate), read(f.oldGate))
  assert.deepEqual(readFileSync(f.oldId), oldBytes)
  assert.equal(nodeStorageDirectory(f.home, 'default'), f.dir)
  const layout = readFileSync(path.join(f.dir, 'storage-layout.json'))
  prepareNodeStorage(f.home, 'default')
  assert.deepEqual(readFileSync(path.join(f.dir, 'storage-layout.json')), layout)
})
test('fresh Web starts scoped and creates working rollback identity and grant', t => {
  const f = fixture(t, false)
  prepareNodeStorage(f.home, 'web')
  const state = loadGateState(f.currentGate)
  assert(state.persistent)
  const id = loadOrCreateAgentIdentity(f.currentId)
  assert.deepEqual(read(f.oldId), id)
  assert.equal(read(f.oldGate).token, state.state.token)
  saveGateState(f.currentGate, { ...state.state, publicIdentityNodeId: id.nodeId })
  assert.deepEqual(read(f.currentGate), read(f.oldGate))
})
test('Desktop-first/second never imports or mutates Web; isolated custom home', t => {
  const f = fixture(t)
  const before = readFileSync(f.oldId)
  prepareNodeStorage(f.home, 'desktop')
  const desktop = nodeStorageDirectory(f.home, 'desktop')
  assert.equal(existsSync(desktop), false)
  const id = loadOrCreateAgentIdentity(path.join(desktop, 'identity.json'))
  assert.notEqual(id.nodeId, f.id.nodeId)
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(readFileSync(f.oldId), before)
  assert.deepEqual(read(path.join(desktop, 'identity.json')), id)
})
test('downgrade can read mirrored state and re-upgrade imports old-version changes without losing binding', t => {
  const f = fixture(t)
  prepareNodeStorage(f.home, 'web')
  saveGateState(f.currentGate, { token: 'y'.repeat(43), publicIdentityNodeId: f.id.nodeId })
  assert.equal(loadGateState(f.oldGate).state.token, 'y'.repeat(43))
  saveGateState(f.oldGate, { token: 'z'.repeat(43), publicIdentityNodeId: f.id.nodeId })
  assert.throws(() => saveGateState(f.currentGate, { token: 'w'.repeat(43) }), /冲突/)
  prepareNodeStorage(f.home, 'web')
  assert.equal(read(f.currentGate).token, 'z'.repeat(43))
  assert.deepEqual(read(f.currentId), f.id)
})
test('divergent or missing authority is never overwritten or regenerated', t => {
  const f = fixture(t)
  prepareNodeStorage(f.home, 'web')
  put(f.oldGate, { token: 'a'.repeat(43) })
  put(f.currentGate, { token: 'b'.repeat(43) })
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  assert.equal(read(f.oldGate).token, 'a'.repeat(43))
  assert.equal(read(f.currentGate).token, 'b'.repeat(43))
  rmSync(f.currentGate)
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  assert.equal(existsSync(f.currentGate), false)
})
test('corrupt or mismatched old private keys do not open a new identity', t => {
  const f = fixture(t)
  const other = loadOrCreateAgentIdentity(path.join(f.home, 'other.json'))
  put(f.oldId, { ...f.id, privateKeyPem: other.privateKeyPem })
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  assert.equal(existsSync(f.currentId), false)
  assert.equal(read(f.oldId).privateKeyPem, other.privateKeyPem)
})
test('interrupted journal resumes either half; foreign third value refuses recovery', t => {
  const f = fixture(t)
  prepareNodeStorage(f.home, 'web')
  const names = ['identity.json', 'gate-wechat-state.json', 'public.json']
  const baseline = read(path.join(f.dir, 'storage-layout.json')).hashes
  const values = Object.fromEntries(names.map(n => [n, read(path.join(f.dir, n))]))
  values['gate-wechat-state.json'] = { token: 'r'.repeat(43), publicIdentityNodeId: f.id.nodeId }
  const journal = { version: 1, before: Object.fromEntries(names.map(n => [n, { current: baseline[n], legacy: baseline[n] }])), values }
  put(path.join(f.dir, 'storage-transaction.json'), journal)
  put(f.currentGate, values['gate-wechat-state.json'])
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(read(f.oldGate), values['gate-wechat-state.json'])
  assert.equal(existsSync(path.join(f.dir, 'storage-transaction.json')), false)
  put(path.join(f.dir, 'storage-transaction.json'), journal)
  put(f.oldGate, { token: 'third'.repeat(10) })
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  assert.equal(read(f.oldGate).token, 'third'.repeat(10))
})
test('active migration owner cannot be stolen; a known dead writer is recovered', t => {
  const f = fixture(t), lock = path.join(f.dir, '.storage-lock')
  mkdirSync(lock, { recursive: true })
  put(path.join(lock, 'owner.json'), { pid: process.pid })
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  // OS rejects this out-of-range PID as ESRCH on supported Node platforms.
  put(path.join(lock, 'owner.json'), { pid: 2147483647 })
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(read(f.currentId), f.id)
})

test('a second stale-lock recovery cannot delete the replacement generation', t => {
  const f = fixture(t), lock = path.join(f.dir, '.storage-lock')
  mkdirSync(lock, { recursive: true })
  const stale = path.join(lock, 'owner-2147483647-' + 'a'.repeat(32) + '.json')
  const replacement = path.join(lock, `owner-${process.pid}-` + 'b'.repeat(32) + '.json')
  put(stale, { pid: 2147483647 })
  const original = fs.rmSync
  let raced = false
  fs.rmSync = (file, ...args) => {
    if (file === stale && !raced) {
      raced = true
      // Another contender reclaimed the dead owner and acquired the lock
      // after we read the PID but before we tried to remove that generation.
      original(stale)
      fs.rmdirSync(lock); fs.mkdirSync(lock)
      put(replacement, { pid: process.pid })
    }
    return original(file, ...args)
  }
  syncBuiltinESMExports()
  try {
    assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
    assert(raced)
    assert.equal(read(replacement).pid, process.pid)
    assert.equal(existsSync(f.currentId), false, 'no concurrent migration was admitted')
  } finally { fs.rmSync = original; syncBuiltinESMExports() }
})

test('crash before lock publication leaves no ownerless lock and next startup migrates', t => {
  const f = fixture(t)
  const code = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    import { prepareNodeStorage } from ${JSON.stringify(new URL('../lib/node-storage.js', import.meta.url).href)};
    const rename = fs.renameSync;
    fs.renameSync = (from, to, ...args) => {
      if (path.basename(to) === '.storage-lock') {
        const files = fs.readdirSync(from);
        if (files.length !== 1 || JSON.parse(fs.readFileSync(path.join(from, files[0]), 'utf8')).pid !== process.pid) process.exit(72);
        process.exit(71);
      }
      return rename(from, to, ...args);
    };
    syncBuiltinESMExports();
    prepareNodeStorage(${JSON.stringify(f.home)}, 'web');
  `
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(child.status, 71, child.stderr)
  assert.equal(existsSync(path.join(f.dir, '.storage-lock')), false)
  assert.equal(existsSync(f.currentId), false)
  const pending = fs.readdirSync(f.dir).filter(n => n.startsWith('.storage-lock-pending-'))
  assert.equal(pending.length, 1)
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(read(f.currentId), f.id)
  assert(!Object.keys(durableSnapshot({ home: f.home, stateFile: f.currentGate, identityFile: f.currentId }))
    .some(key => key.includes('.storage-lock-pending-')))
})

test('atomic publication cannot replace another live generation that wins the race', t => {
  const f = fixture(t), lock = path.join(f.dir, '.storage-lock')
  const replacement = path.join(lock, `owner-${process.pid}-` + 'c'.repeat(32) + '.json')
  const original = fs.renameSync
  let raced = false
  fs.renameSync = (from, to, ...args) => {
    if (to === lock && !raced) {
      raced = true
      mkdirSync(lock)
      put(replacement, { pid: process.pid })
    }
    return original(from, to, ...args)
  }
  syncBuiltinESMExports()
  try {
    assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
    assert(raced)
    assert.equal(read(replacement).pid, process.pid)
    assert.equal(existsSync(f.currentId), false)
    assert(!fs.readdirSync(f.dir).some(n => n.startsWith('.storage-lock-pending-')))
  } finally { fs.renameSync = original; syncBuiltinESMExports() }
})

test('pre-existing ambiguous lock is not stolen or silently removed', t => {
  const f = fixture(t), lock = path.join(f.dir, '.storage-lock')
  mkdirSync(lock, { recursive: true })
  assert.throws(() => prepareNodeStorage(f.home, 'web'), /冲突/)
  assert(existsSync(lock))
  assert.equal(existsSync(f.currentId), false)
  assert(!fs.readdirSync(f.dir).some(n => n.startsWith('.storage-lock-pending-')))
})

test('update controller reads old credentials until startup performs the migration', t => {
  const f = fixture(t)
  assert.deepEqual(installedNodeStatePaths(f.home, 'web'), { stateFile: f.oldGate, identityFile: f.oldId })
  prepareNodeStorage(f.home, 'web')
  assert.deepEqual(installedNodeStatePaths(f.home, 'web'), { stateFile: f.currentGate, identityFile: f.currentId })
  assert.notEqual(installedNodeStatePaths(f.home, 'desktop').identityFile, f.oldId)
})

test('custom CLI keeps its previous public override once; fresh nodes and Desktop do not inherit it', t => {
  const f = fixture(t), custom = nodeStorageDirectory(f.home, 'work')
  const identity = loadOrCreateAgentIdentity(path.join(custom, 'identity.json'))
  prepareNodeStorage(f.home, 'work')
  assert.equal(read(path.join(custom, 'public.json')).enabled, false)
  put(path.join(f.home, 'harness-remote-public.json'), { enabled: true })
  prepareNodeStorage(f.home, 'work')
  assert.equal(read(path.join(custom, 'public.json')).enabled, false)
  assert.deepEqual(read(path.join(custom, 'identity.json')), identity)
  for (const name of ['fresh', 'desktop']) {
    prepareNodeStorage(f.home, name)
    assert.equal(existsSync(path.join(nodeStorageDirectory(f.home, name), 'public.json')), false)
  }
})

test('upgrade preservation ignores migration/coordination bookkeeping but still protects binding and identity', t => {
  const f = fixture(t), job = { home: f.home, stateFile: f.oldGate, identityFile: f.oldId }
  const before = durableSnapshot(job)
  prepareNodeStorage(f.home, 'web')
  const offers = path.join(f.home, 'harness-remote/installation-offers')
  mkdirSync(offers, { recursive: true }); put(path.join(offers, 'web.json'), { fixture: true })
  const after = durableSnapshot(job)
  for (const [key, value] of Object.entries(before)) assert.equal(after[key], value, key)
  assert(!Object.keys(after).some(key => /storage-layout|installation-offers|gate-wechat/.test(key)))
  const baseline = after.$binding
  saveGateState(f.currentGate, { ...read(f.currentGate), token: 'rotated'.repeat(8) })
  assert.notEqual(durableSnapshot(job).$binding, baseline)
  assert(Object.keys(after).some(key => key.endsWith('identity.json')), 'scoped identity stays protected')
})
