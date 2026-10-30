// Product modules, synthetic data, isolated controller receipts. No live profiles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { parseImportSource } from '../lib/history-import/parse.js'
import { parseHistorySource } from '../lib/history-import/source.js'
import { readPublicShare, MAX_SHARE_BYTES, MAX_IMPORT_BYTES } from '../lib/history-import/share.js'
import { buildNativeImportSeed, buildNativeImportSeedScheduled, NativeImportPreflightError } from '../lib/history-import/native.js'
import { HistoryImportController, importError } from '../lib/history-import/controller.js'
import { ImportReceipts } from '../lib/history-import/receipts.js'
import { MAX_MESSAGES, MAX_SEED_BYTES } from '../lib/history-import/limits.js'
import { largeShareFixture, fragmentedShareFixture } from './history-import-large-fixture.mjs'

const signal = () => new AbortController().signal
const bytes = Buffer.from(JSON.stringify({ title: 'Synthetic', messages: [{ message_id: 1, parent_id: null, role: 'USER', fragments: [{ type: 'REQUEST', content: 'synthetic' }] }] }))
async function fixture(t, extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'large-share-contract-')), receipts = new ImportReceipts(path.join(dir, 'receipts'))
  const controller = new HistoryImportController({ capabilities: async () => ({ supported: true }), authorize: async () => ({ owner: 'synthetic-owner', assertCurrent() {} }),
    owner: async () => 'synthetic-owner', share: async () => bytes, parse: parseImportSource,
    commit: async () => {}, inspect: async r => ({ ...r, state: 'succeeded' }), receipts, ...extra })
  t.after(async () => { controller.dispose(); await Promise.all([...controller.jobs.values()]); await fs.rm(dir, { recursive: true, force: true }) })
  const call = (action, input = {}) => controller.control(action, input, signal())
  return { controller, receipts, call }
}
test('48 MiB raw share reader admits a 47 MiB 3500-round share; file/ZIP limit stays unchanged', async () => {
  const data = largeShareFixture(47, 3500)
  assert(data.length > MAX_IMPORT_BYTES && data.length < MAX_SHARE_BYTES)
  const result = await readPublicShare('https://chat.deepseek.com/share/SyntheticReadTest20261021', signal(), async () => new Response(data))
  assert(result.equals(data))
  await assert.rejects(parseImportSource(result, signal()), /source-too-large/)
  const parsed = await parseImportSource(result, signal(), 'share')
  assert.equal(parsed.source.conversations[0].messages.length, 7000)
})
test('all streamed/declaration share oversize paths return a specific error and cancel the reader', async () => {
  for (const declared of [false, true]) {
    let cancelled = false
    await assert.rejects(readPublicShare('https://chat.deepseek.com/share/SyntheticLimit20261021', signal(), async () => new Response(new ReadableStream({
      start(c) { c.enqueue(new Uint8Array(MAX_SHARE_BYTES + 1)) }, cancel() { cancelled = true },
    }), { headers: declared ? { 'content-length': String(MAX_SHARE_BYTES + 1) } : {} })), e => importError(e).code === 'history-import/share-too-large')
    assert.equal(cancelled, true)
  }
})
test('1386-round expanded history passes preview and scheduled seed without truncation or digest changes', async t => {
  const data = largeShareFixture(13), f = await fixture(t, { share: async () => data })
  const src = await f.call('share.preview', { url: 'synthetic-fixture' })
  assert.equal(src.entries[0].messages, 2772); assert.equal(src.entries[0].turnCount, 1386)
  const preview = await f.call('preview', { sourceId: src.sourceId, conversationId: src.entries[0].id })
  assert.equal(preview.summary.turnCount, 1386)
  const parsed = await parseImportSource(data, signal(), 'share'), conversation = parsed.source.conversations[0]
  const request = { sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'fixture', sourceHash: parsed.source.sourceHash, conversation }
  const seed = await buildNativeImportSeedScheduled(request, signal(), 1000)
  assert.deepEqual(seed, buildNativeImportSeed(request, 1000))
  assert.equal(seed.at(-1).data.prefixHash, createHash('sha256').update(JSON.stringify(seed.slice(0, -1))).digest('hex'))
  const records = seed.filter(e => e.type.endsWith('/record'))
  assert.equal(records.length, 2772)
  for (const [index, message] of conversation.messages.entries()) assert.deepEqual(records[index].data.fragments, message.fragments)
})
test('scheduled construction yields to IO and checks cancellation before producing a seed', async () => {
  const parsed = await parseImportSource(largeShareFixture(13), signal(), 'share')
  const request = { sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'fixture', sourceHash: parsed.source.sourceHash, conversation: parsed.source.conversations[0] }
  let callbacks = 0
  const timer = setInterval(() => { callbacks++ }, 0)
  try { await buildNativeImportSeedScheduled(request, signal(), 1000) } finally { clearInterval(timer) }
  assert(callbacks > 0)
  const abort = new AbortController(); setImmediate(() => abort.abort())
  await assert.rejects(buildNativeImportSeedScheduled(request, abort.signal, 1000))
})

test('1386-round disconnected published selection passes the old RPC preview without dropping messages', async t => {
  const data = fragmentedShareFixture(13), f = await fixture(t, { share: async () => data })
  const raw = JSON.parse(data).data.biz_data.messages
  const src = await f.call('share.preview'), p = await f.call('preview', { sourceId: src.sourceId, conversationId: src.entries[0].id })
  assert.equal(src.entries[0].branches, 1); assert.equal(src.entries[0].messages, raw.length)
  assert.equal(p.summary.messages, 2772); assert.equal(p.summary.turnCount, 1386)
  assert(p.warnings.some(text => text.includes('展示顺序') && text.includes('不补造')))
  const parsed = await parseImportSource(data, signal(), 'share'), c = parsed.source.conversations[0]
  assert(c.publishedOrder.missingParents > 1)
  const seed = await buildNativeImportSeedScheduled({ sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'synthetic',
    sourceHash: parsed.source.sourceHash, conversation: c }, signal(), 1000)
  const records = seed.filter(event => event.type.endsWith('/record'))
  assert.equal(records.length, raw.length)
  assert.deepEqual(records.map(event => event.data.metadata.parent_id), raw.map(message => message.parent_id))
  assert.deepEqual(records.map(event => event.data.fragments.map(part => part.content)), raw.map(message => message.fragments.map(part => part.content)))
  assert.deepEqual(seed[0].data.publishedOrder, c.publishedOrder)
})

test('field diagnostics crossing the worker include only ordinal/count/allowlisted field, never private data', async () => {
  const value = JSON.parse(bytes)
  value.messages[0].message_id = { private: 'do-not-disclose-id' }
  await assert.rejects(parseImportSource(Buffer.from(JSON.stringify(value)), signal(), 'share'), error => {
    const result = importError(error)
    return result.code === 'history-import/invalid-message-id' && /S2/.test(result.message)
      && /第 1\/1 条，message_id/.test(result.message) && !result.message.includes('do-not-disclose')
  })
  const forged = Object.assign(new Error('private body'), { code: 'invalid-message-id', diagnostic: {
    messagePosition: 1, messageCount: 1, field: 'private-body',
  } })
  assert(!importError(forged).message.includes('private'))
  assert(!importError(forged).message.includes('S2'))
})
test('DeepSeek business failure, malformed messages and network failures do not become size warnings', async () => {
  for (const biz_code of [1, 403]) await assert.rejects(parseImportSource(Buffer.from(JSON.stringify({ code: 0, data: { biz_code } })), signal(), 'share'), /share-response-unavailable/)
  await assert.rejects(parseImportSource(Buffer.from(JSON.stringify({ title: 'Synthetic', messages: [{ message_id: {}, parent_id: null, role: 'USER', fragments: [] }] })), signal(), 'share'), /invalid-message-id/)
  await assert.rejects(readPublicShare('https://chat.deepseek.com/share/SyntheticNetwork20261021', signal(), async () => { throw TypeError('private network details') }), e => importError(e).code === 'history-import/share-network')
  assert.equal(importError(new Error('private source body')).code, 'history-import/unavailable')
  assert.equal(importError(new Error('constructor')).code, 'history-import/unavailable')
})
test('share parser cannot treat an account export array or ZIP as a public share', async () => {
  await assert.rejects(parseHistorySource([], 'share'), e => e.code === 'invalid-share')
  await assert.rejects(parseHistorySource(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'share'), e => e.code === 'invalid-share')
})
test('real pre-create failure reason persists, and an ambiguous/forged native failure never becomes failed', async t => {
  for (const [error, state, expected] of [
    [new NativeImportPreflightError('seed-too-large', MAX_SEED_BYTES + 1024 * 1024, MAX_SEED_BYTES), 'failed', /至少 113.0 MiB/],
    [new NativeImportPreflightError('preset-unavailable'), 'failed', /会话模式/],
    [new NativeImportPreflightError('workspace-unavailable'), 'failed', /工作区/],
    [new NativeImportPreflightError('model-unavailable'), 'failed', /默认模型/],
    [new NativeImportPreflightError('session-exists'), 'uncertain', /不会自动重复/],
    [Object.assign(new Error('private detail'), { rejectedBeforeCreate: true, code: 'seed-too-large' }), 'uncertain', /不会自动重复/],
  ]) {
    const f = await fixture(t, { commit: async () => { throw error } }), src = await f.call('share.preview')
    const p = await f.call('preview', { sourceId: src.sourceId, conversationId: src.entries[0].id }), id = randomUUID()
    await f.call('commit', { previewId: p.previewId, operationId: id, workspaceId: 'fixture' })
    await Promise.all([...f.controller.jobs.values()])
    const receipt = await f.receipts.read(id)
    assert.equal(receipt.state, state); assert.match(receipt.message, expected)
    assert(!receipt.message.includes('private detail'))
  }
})

test('size diagnostics identify stage and numeric bounds without exposing unknown error details', async () => {
  const MiB = 1024 * 1024
  await assert.rejects(readPublicShare('https://chat.deepseek.com/share/SyntheticSize20261021', signal(), async () =>
    new Response('', { headers: { 'content-length': String(49 * MiB) } })), error => {
    const result = importError(error)
    return result.code === 'history-import/share-too-large' && /至少 49.0 MiB/.test(result.message) && /上限 48 MiB/.test(result.message)
  })
  const source = largeShareFixture(49)
  assert(source.length > MAX_SHARE_BYTES)
  await assert.rejects(parseImportSource(source, signal(), 'share'), error => {
    const result = importError(error)
    return result.code === 'history-import/source-too-large' && /至少 49.0 MiB/.test(result.message) && /上限 48 MiB/.test(result.message)
  })
  const invalid = Object.assign(new Error('private details'), { code: 'source-too-large', actualBytes: 'private text', limitBytes: 64 * MiB })
  assert(!importError(invalid).message.includes('private'))
  assert(!importError(invalid).message.includes('至少'))
})

test('3500 rounds pass the actual reader-worker-controller path without losing messages or thinking', async t => {
  const data = fragmentedShareFixture(47, 3500)
  const f = await fixture(t, { share: (_, s) => readPublicShare('https://chat.deepseek.com/share/Synthetic3500Rounds', s, async () => new Response(data)) })
  const small = await f.call('upload.start', { name: 'small.json', size: bytes.length })
  const src = await f.call('share.preview')
  assert.equal(src.entries[0].messages, 7000)
  const preview = await f.call('preview', { sourceId: src.sourceId, conversationId: src.entries[0].id })
  assert.equal(preview.summary.turnCount, 3500)
  assert.equal(preview.summary.publicReasoning, 3500)
  assert.equal(f.controller.uploads.get(small.uploadId).offset, 0, 'existing small upload remains intact')
  await assert.rejects(f.call('share.preview'), /capacity/)
  await f.call('release', { sourceId: src.sourceId, previewId: preview.previewId })
  assert.equal(f.controller.sources.size, 0)
})

test('10000-message boundary is retained; 10001 is rejected explicitly, separately from event limits', async t => {
  const data = largeShareFixture(3, MAX_MESSAGES / 2), f = await fixture(t, { share: async () => data })
  const src = await f.call('share.preview')
  const preview = await f.call('preview', { sourceId: src.sourceId, conversationId: src.entries[0].id })
  assert.equal(preview.summary.messages, 10000)
  const parsed = await parseHistorySource(data, 'share')
  const seed = await buildNativeImportSeedScheduled({ sessionId: 'session-dsimport-' + randomUUID(), workspaceId: 'synthetic',
    sourceHash: parsed.sourceHash, conversation: parsed.conversations[0] }, signal(), 1000)
  assert.equal(seed.filter(e => e.type.endsWith('/record')).length, 10000)
  const over = JSON.parse(data), messages = over.data.biz_data.messages
  messages.push({ ...messages[0], message_id: 10001, parent_id: 10000 })
  await assert.rejects(parseImportSource(Buffer.from(JSON.stringify(over)), signal(), 'share'), e =>
    importError(e).code === 'history-import/message-limit' && importError(e).message.includes('10000'))
  assert.equal(importError(new Error('event-limit')).code, 'history-import/event-limit')
})
