import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, stat, rm, open, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseHistorySource, selectHistoryBranch } from '../lib/history-import/source.js'
import { parseImportArchive, parseImportConversation, parseImportSource } from '../lib/history-import/parse.js'
import { buildNativeImportSeed } from '../lib/history-import/native.js'
import { HistoryImportController } from '../lib/history-import/controller.js'
import { ImportReceipts } from '../lib/history-import/receipts.js'
import { StagedArchive } from '../lib/history-import/staging.js'
import { MAX_ARCHIVE_BYTES, ARCHIVE_OBJECT_PART_BYTES } from '../lib/history-import/limits.js'
import { entries, zip, message, conversation, largeZipFile } from './history-import-v3-fixture.mjs'
import { assertArchiveRemoved } from './archive-cleanup-fixture.mjs'

const signal = () => new AbortController().signal
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'history-v3-test-')); let clock = Date.now(), writes = 0
  const ports = { capabilities: async () => ({ supported: true }), authorize: async () => ({ owner: 'owner', assertCurrent() {} }),
    owner: async () => 'owner', now: () => clock, receipts: new ImportReceipts(path.join(root, 'receipts')), stagingDirectory: path.join(root, 'spool'),
    parse: parseImportSource, parseArchive: parseImportArchive, readConversation: parseImportConversation,
    share: async () => Buffer.alloc(0), commit: async () => { writes++ }, inspect: async request => ({ ...request, state: 'succeeded' }), ...overrides }
  const controller = new HistoryImportController(ports), call = (action, input = {}, abort = signal()) => controller.control(action, input, abort)
  t.after(async () => { controller.dispose(); await Promise.all([...controller.jobs.values()]); await new Promise(r => setTimeout(r, 30)); await rm(root, { recursive: true, force: true }) })
  return { root, controller, ports, call, writes: () => writes, tick: n => { clock += n } }
}
test('v3 ZIP retains explicit branch selection, current branch, public reasoning and native completed seed', async () => {
  const source = await parseHistorySource(zip(entries())), row = source.conversations[0]
  assert.deepEqual(row.leafIds, ['2', '3']); assert.equal(row.currentMessageId, '2')
  assert.throws(() => selectHistoryBranch(row), /branch-required/)
  const selected = selectHistoryBranch(row, '2')
  assert.equal(selected.messages[1].text, '已记录七号。'); assert.equal(selected.messages[1].reasoning, '公开思考七号')
  const seed = buildNativeImportSeed({ sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'workspace', sourceHash: source.sourceHash, conversation: selected })
  assert.equal(seed.filter(e => e.type === 'user/message').length, 1); assert.equal(seed.filter(e => e.type === 'assistant/message').length, 1)
  assert(seed.some(e => e.type === 'system/message' && e.data.message.content.length === 0))
})
test('v3 withdrawn turns and unfinished/template replies follow official context exclusion', async () => {
  const value = conversation(); value.messages = [message(1, null, 'USER', [{ type: 'REQUEST', content: 'withdrawn user' }]),
    message(2, 1, 'ASSISTANT', [{ type: 'RESPONSE', content: 'withdrawn answer' }], 'CONTENT_FILTER'),
    message(3, 2, 'USER', [{ type: 'REQUEST', content: 'retained user' }]), message(4, 3, 'ASSISTANT', [{ type: 'RESPONSE', content: 'partial answer' }], 'WIP')]; value.current_message_id = 4
  const source = await parseHistorySource(zip(entries(value))), selected = selectHistoryBranch(source.conversations[0])
  const seed = buildNativeImportSeed({ sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'workspace', sourceHash: source.sourceHash, conversation: selected })
  assert.equal(seed.filter(e => e.type === 'user/message').length, 1); assert.equal(seed.filter(e => e.type === 'assistant/message').length, 0)
  assert.equal(seed.find(e => e.type === 'turn/end').data.reason.kind, 'error')
  assert(!seed.some(e => e.surfaceOp && JSON.stringify(e).includes('withdrawn')))
})
test('v3 parser rejects unsupported manifest, missing entries, traversal, duplicates and corrupt selected bytes', async () => {
  for (const values of [entries().map(([n,v]) => [n,n === 'manifest.json' ? '{"export_format_version":4}' : v]), entries().slice(0,2),
    [...entries(), ['../outside', 'bad']], [...entries(), ['manifest.json','{}']]]) await assert.rejects(parseHistorySource(zip(values)))
  const broken = zip(entries(), { compress: false }); broken[broken.indexOf(Buffer.from('已记录七号。'))] ^= 1
  await assert.rejects(parseHistorySource(broken), /invalid-zip/)
})
test('legacy capability stays 20MiB, archive limit is separately negotiated and admission precedes IO', async t => {
  const f = await fixture(t), capability = await f.call('capabilities')
  assert.equal(capability.maxFileBytes, 20 * 1024 * 1024); assert.equal(capability.archiveUpload.maxFileBytes, MAX_ARCHIVE_BYTES)
  await assert.rejects(f.call('archive.start', { name: 'bad.zip', size: MAX_ARCHIVE_BYTES + 1 }), /invalid-request/)
  await assert.rejects(f.call('archive.start', { name: '../bad.zip', size: 8 }), /invalid-request/)
  assert.deepEqual(await readdir(f.root), [])
})
test('staged parts compare replay bytes, reject reorder, and cleanup only their own spool', async t => {
  const f = await fixture(t), staged = await StagedArchive.create(8, path.join(f.root, 'spool')), file = staged.file
  assert.equal(await staged.append(0, Buffer.from('1234')), 4); assert.equal(await staged.append(0, Buffer.from('1234')), 4)
  await assert.rejects(staged.append(0, Buffer.from('1244')), /invalid-chunk/); await assert.rejects(staged.append(6, Buffer.from('78')), /invalid-chunk/)
  await staged.append(4, Buffer.from('5678')); assert.equal(await staged.finish(), file); assert.equal((await readFile(file)).toString(), '12345678')
  await staged.dispose(); await assert.rejects(stat(file), { code: 'ENOENT' })
})
test('archive expiry, release and owner changes stop transfers without native writes', async t => {
  const f = await fixture(t), started = await f.call('archive.start', { name: 'sample.zip', size: 1024 }), staged = f.controller.archives.get(started.uploadId).archive
  f.ports.owner = async () => 'other'; await assert.rejects(f.call('release', { uploadId: started.uploadId }), /owner-changed/)
  f.ports.owner = async () => 'owner'; await f.call('release', { uploadId: started.uploadId }); await assert.rejects(staged.finish(), /upload-incomplete/)
  const second = await f.call('archive.start', { name: 'sample.zip', size: 1024 }); f.tick(16 * 60000)
  await assert.rejects(f.call('archive.chunk', { uploadId: second.uploadId, offset: 0, data: Buffer.alloc(1024).toString('base64') }), /expired/)
  assert.equal(f.writes(), 0)
})

test('slow part, catalog and preview reads renew natural expiry but never restore revoked authority', async t => {
  for (const phase of ['object', 'catalog', 'preview']) for (const revoked of [false, true]) {
    let leaseValid = true, invalidated = false, renewed = 0
    const bytes = zip(entries()), expire = () => { leaseValid = false; invalidated = revoked }
    const f = await fixture(t, { authorize: async () => ({ owner: 'owner', assertCurrent() { if (!leaseValid) throw Error('expired-lease') },
      async revalidate(signal) { signal.throwIfAborted(); if (invalidated) throw Error('revoked-intent'); leaseValid = true; renewed++ } }),
      loadObject: async () => { if (phase === 'object') expire(); return bytes },
      parseArchive: async (...args) => { if (phase === 'catalog') expire(); return parseImportArchive(...args) },
      readConversation: async (...args) => { if (phase === 'preview') expire(); return parseImportConversation(...args) } })
    const descriptor = { v: 1, scheme: 'xsalsa20-poly1305-chunks-v1', contentKind: 'artifact', objectId: 'fixtureObjectId0123456789012345',
      key: Buffer.alloc(32, 1).toString('base64url'), noncePrefix: Buffer.alloc(16, 2).toString('base64url'),
      plainBytes: bytes.length, cipherBytes: bytes.length + 20, chunkBytes: 256 * 1024 }
    const started = await f.call('archive.start', { name: 'lease.zip', size: bytes.length })
    const steps = async () => {
      await f.call('archive.object', { uploadId: started.uploadId, offset: 0, descriptor })
      const catalog = await f.call('archive.finish', { uploadId: started.uploadId })
      return f.call('preview', { sourceId: catalog.sourceId, conversationId: 'synthetic-v3' })
    }
    if (revoked) await assert.rejects(steps(), /revoked-intent/)
    else { assert.equal((await steps()).selectionRequired, true); assert.equal(renewed, 3) }
    assert.equal(f.writes(), 0)
  }
})
test('300MiB archive transfers to disk in bounded OSS parts and parses only chosen conversation', { timeout: 120000 }, async t => {
  let sourceHandle, maximumPart = 0, fetches = 0
  const f = await fixture(t, { loadObject: async descriptor => {
    maximumPart = Math.max(maximumPart, descriptor.plainBytes); const data = Buffer.alloc(descriptor.plainBytes)
    await sourceHandle.read(data, 0, data.length, fetches++ * ARCHIVE_OBJECT_PART_BYTES); return data
  } })
  const sourceFile = path.join(f.root, 'large.zip'), size = await largeZipFile(sourceFile, 300), rssBefore = process.memoryUsage().rss
  let peakRss = rssBefore; const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 10)
  sourceHandle = await open(sourceFile, 'r'); t.after(async () => { clearInterval(timer); await sourceHandle.close() })
  const started = await f.call('archive.start', { name: 'large.zip', size })
  for (let offset = 0; offset < size; offset += ARCHIVE_OBJECT_PART_BYTES) {
    const count = Math.min(ARCHIVE_OBJECT_PART_BYTES, size - offset)
    const descriptor = { v: 1, scheme: 'xsalsa20-poly1305-chunks-v1', contentKind: 'artifact', objectId: 'fixtureObjectId0123456789012345',
      key: Buffer.alloc(32,1).toString('base64url'), noncePrefix: Buffer.alloc(16,2).toString('base64url'), plainBytes: count, cipherBytes: count + 20 * Math.ceil(count / (256 * 1024)), chunkBytes: 256 * 1024 }
    assert.equal((await f.call('archive.object', { uploadId: started.uploadId, offset, descriptor })).offset, offset + count)
  }
  const catalog = await f.call('archive.finish', { uploadId: started.uploadId })
  assert.equal(catalog.entries[0].title, '合成 v3 会话'); assert.equal(f.controller.sources.get(catalog.sourceId).value.conversations[0].messages.length, 0)
  const branches = await f.call('preview', { sourceId: catalog.sourceId, conversationId: 'synthetic-v3' }); assert.equal(branches.selectionRequired, true)
  const preview = await f.call('preview', { sourceId: catalog.sourceId, conversationId: 'synthetic-v3', branchId: '2' })
  assert.equal(preview.snippets[1].text, '已记录七号。'); assert.equal(preview.summary.publicReasoning, 1)
  assert(maximumPart <= ARCHIVE_OBJECT_PART_BYTES); assert(f.controller.sources.get(catalog.sourceId).bytes < 16384)
  assert.equal(f.writes(), 0)
  const staged = f.controller.sources.get(catalog.sourceId).archive.file
  await f.call('release', { sourceId: catalog.sourceId }); const cleanupMs = await assertArchiveRemoved(staged)
  clearInterval(timer)
  console.log(JSON.stringify({ archiveBytes: size, parts: fetches, maximumPart, rssBefore, peakRss, rssGrowth: peakRss - rssBefore, cleanupMs }))
  assert(peakRss - rssBefore < 192 * 1024 * 1024, 'whole archive must not be retained or copied into the host/worker')
})
