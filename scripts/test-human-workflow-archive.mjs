import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, readdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkflowArchiveStore } from '../lib/human-workflow/archive-store.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
const nodeId = 'node_archive_test'
async function fixture(t, kind = 'analyses', maxBytes) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-archive-')), root = path.join(directory, 'archive')
  const index = new WorkflowFileStore(path.join(directory, 'index.json')), options = { index, root, nodeId, kind, maxBytes }
  const store = await WorkflowArchiveStore.open(options)
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { store, root, index, options }
}
const analyses = () => ({ schema: 'human.lifecycle.local.v1', nodeId, analyses: Array.from({ length: 140 }, (_, n) => ({ id: n, text: `分析原文${n}`, revision: 1, updatedAt: n })) })
test('archival keeps immutable originals, exact authoritative ledger and legacy compatibility through restart', async t => {
  const f = await fixture(t), value = analyses(); await f.index.save(value)
  assert.deepEqual(await f.store.load(), value); await f.store.save(value)
  const index = await f.index.load(); assert.equal(index.schema, 'human.workflow.archive-index.v1')
  assert.equal(index.ledger.analyses.filter(r => r.archiveRef).length, 12)
  assert.deepEqual(await (await WorkflowArchiveStore.open(f.options)).load(), value)
  const before = await readdir(f.root); value.analyses[0].text = '更新分析但原文仍保留'; value.analyses[0].revision++
  await f.store.save(value); assert.equal((await readdir(f.root)).length, before.length + 1)
  assert.deepEqual(await f.store.load(), value)
})
test('unknown/running jobs never compact and every terminal tuple survives reconstruction', async t => {
  const f = await fixture(t, 'runs'), value = { schema: 'human.automation.ledger.v1', nodeId,
    runs: Array.from({ length: 530 }, (_, n) => ({ id: n, state: n < 10 ? 'unknown' : 'succeeded', messageId: `m${n}`, updatedAt: n })) }
  await f.store.save(value); const index = await f.index.load()
  assert.equal(index.ledger.runs.filter(r => r.archiveRef).length, 8)
  assert.equal(index.ledger.runs.filter(r => r.state === 'unknown').length, 10)
  assert.deepEqual(await f.store.load(), value)
})
test('failed hot-index commit retains original ledger and orphan bytes, then idempotently recovers', async t => {
  const f = await fixture(t), value = analyses(), old = { schema: value.schema, nodeId, analyses: [] }
  await f.index.save(old); const save = f.index.save.bind(f.index)
  f.index.save = async () => { throw new Error('index failure') }
  await assert.rejects(f.store.save(value), /index failure/); assert.deepEqual(await f.store.load(), old)
  assert.equal((await readdir(f.root)).length, 12)
  f.index.save = save; await (await WorkflowArchiveStore.open(f.options)).save(value)
  assert.deepEqual(await f.store.load(), value); assert.equal((await readdir(f.root)).length, 12)
})
test('corruption, wrong node, redirected paths and exhausted capacity fail closed without removing originals', async t => {
  const f = await fixture(t), value = analyses(); await f.store.save(value)
  const files = await readdir(f.root), original = await readFile(path.join(f.root, files[0]))
  await writeFile(path.join(f.root, files[0]), '{}'); await assert.rejects(f.store.load(), { code: 'workflow-archive-invalid' })
  await writeFile(path.join(f.root, files[0]), original)
  await assert.rejects((await WorkflowArchiveStore.open({ ...f.options, nodeId: 'other_node' })).load(), { code: 'workflow-archive-invalid' })
  const small = await fixture(t, 'analyses', 1); await assert.rejects(small.store.save(value), { code: 'workflow-archive-capacity' })
  assert.equal(await small.index.load(), undefined)
  await symlink(f.root, path.join(path.dirname(f.root), 'redirect'), 'junction')
  await assert.rejects(WorkflowArchiveStore.open({ ...f.options, root: path.join(path.dirname(f.root), 'redirect') }), { code: 'workflow-archive-invalid' })
  assert.equal((await readdir(f.root)).length, files.length)
})
