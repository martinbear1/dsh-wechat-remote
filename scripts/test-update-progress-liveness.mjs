import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PluginUpdateService } from '../lib/update-service.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
const job = { jobId: 'a'.repeat(32), statusOrigin: 'http://127.0.0.1:54321', statusToken: 'b'.repeat(48) }
const status = { jobId: job.jobId, terminal: false, phase: 'verifying', progress: 80, message: '验证中' }
test('old nonterminal journal is attention, not progress, and never removes the lock or result', async t => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-progress-proof-')))
  t.after(() => { assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir())); assert(path.basename(home).startsWith('dsh-progress-proof-')); fs.rmSync(home, { recursive: true, force: true }) })
  const ctx = { get: key => key === 'profileContext' ? { name: 'web', home, dir: path.join(home, 'profiles/web'), installAnchor: path.join(home, 'runtime/package.json') } : undefined }
  const service = new PluginUpdateService(ctx, { web: 3080, gate: 3092, local: 3093 })
  const root = path.join(home, 'harness-remote-updates'), dir = path.join(root, job.jobId)
  fs.mkdirSync(dir, { recursive: true })
  const index = path.join(root, `profile-${createHash('sha256').update('web').digest('hex').slice(0, 24)}.json`)
  fs.writeFileSync(index, JSON.stringify({ ...job, statusOrigin: 'invalid-old-reference' }))
  const raw = JSON.stringify({ phase: 'installing', progress: 60, message: '旧进度', terminal: false })
  fs.writeFileSync(path.join(dir, 'result.json'), raw)
  const lockPath = path.join(home, 'profiles/web/.harness-remote-update.lock')
  fs.mkdirSync(path.dirname(lockPath), { recursive: true }); fs.writeFileSync(lockPath, job.jobId)
  const oldFetch = globalThis.fetch
  globalThis.fetch = () => assert.fail('historical records must not contact a worker')
  t.after(() => { globalThis.fetch = oldFetch })
  const value = await service.recovery()
  assert.equal(value.activeJob, null); assert.equal(value.unresolvedJob, true)
  assert.equal(value.lastResult.phase, 'attention'); assert.equal(value.lastResult.terminal, true)
  assert.equal(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'), raw)
  assert.equal(fs.readFileSync(lockPath, 'utf8'), job.jobId)
  // A truncated receipt or index is not permission to start a second job.
  fs.writeFileSync(path.join(dir, 'result.json'), '{')
  assert.equal((await service.recovery()).unresolvedJob, true)
  fs.writeFileSync(index, '{')
  assert.equal((await service.recovery()).unresolvedJob, true)
  assert.equal(fs.readFileSync(lockPath, 'utf8'), job.jobId)
})
