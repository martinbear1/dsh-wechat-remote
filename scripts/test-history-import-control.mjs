// Synthetic data and isolated receipt directories only. Never opens a real DSH profile.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function module(name) {
  const out = await build({ stdin: { contents: `export * from './${name}.ts'; ${name === 'controller' ? "export { NativeImportPreflightError } from './native.ts';" : ''}`,
    resolveDir: fileURLToPath(new URL('../src/history-import/', import.meta.url)), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { HistoryImportController, NativeImportPreflightError } = await module('controller')
const { ImportReceipts } = await module('receipts')
const { parseHistorySource } = await module('source')
const { readPublicShare, shareIdentifier, IMPORT_CHUNK_BYTES, MAX_IMPORT_BYTES } = await module('share')
const signal = () => new AbortController().signal
const sourceBytes = (suffix = '') => Buffer.from(JSON.stringify({ title: '合成网页会话' + suffix, messages: [
  { message_id: 1, parent_id: null, role: 'USER', fragments: [{ type: 'REQUEST', content: '我是测试角色' }] },
  { message_id: 2, parent_id: 1, role: 'ASSISTANT', fragments: [{ type: 'THINK', content: '公开思考' }, { type: 'RESPONSE', content: '测试答复' }] },
] }))
async function fixture(t, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-import-control-'))
  let commits = 0, inspections = 0, clock = Date.now()
  const receipts = new ImportReceipts(path.join(dir, 'receipts'))
  const ports = {
    capabilities: async () => ({ supported: true }),
    parse: async data => { const source = await parseHistorySource(data); return { source, bytes: Buffer.byteLength(JSON.stringify(source)) } },
    share: async () => sourceBytes(), receipts,
    commit: async () => { commits++ },
    inspect: async identity => { inspections++; return { ...identity, state: 'succeeded' } },
    now: () => clock, ...overrides,
  }
  const controller = new HistoryImportController(ports)
  const call = (action, value = {}, abort = signal()) => controller.control(action, value, abort)
  t.after(async () => { controller.dispose(); await Promise.all([...controller.jobs.values()]); await fs.rm(dir, { recursive: true, force: true }) })
  return { dir, controller, receipts, call, ports, tick: value => { clock += value }, commits: () => commits, inspections: () => inspections,
    wait: () => Promise.all([...controller.jobs.values()]),
    preview: async () => { const catalog = await call('share.preview', { url: 'unused-by-fixture' }); return call('preview', { sourceId: catalog.sourceId, conversationId: catalog.entries[0].id }) } }
}
test('construction and capability checks never read/write receipts or invoke native import', async t => {
  const f = await fixture(t)
  assert.deepEqual(await fs.readdir(f.dir), [])
  assert.equal((await f.call('capabilities')).schema, 'wechat.history-import.v1')
  assert.deepEqual(await fs.readdir(f.dir), []); assert.equal(f.commits(), 0); assert.equal(f.inspections(), 0)
})
test('share fetch is HTTPS exact-origin, no credentials, redirects or arbitrary URLs', async () => {
  for (const value of ['http://chat.deepseek.com/share/abcdefgh', 'https://chat.deepseek.com.attacker.test/share/abcdefgh',
    'https://u:p@chat.deepseek.com/share/abcdefgh', 'https://chat.deepseek.com:444/share/abcdefgh',
    'https://chat.deepseek.com/share/abcdefgh?next=x', 'https://chat.deepseek.com/share/abcdefgh#x',
    'file:///tmp/a', 'https://chat.deepseek.com/api/v0/user', 'https://127.0.0.1/share/abcdefgh']) assert.throws(() => shareIdentifier(value))
  let requested
  const result = await readPublicShare('https://chat.deepseek.com/share/abcdefgh', signal(), async (url, options) => {
    requested = { url, options }; return new Response(sourceBytes())
  })
  assert(result.equals(sourceBytes())); assert.equal(requested.url, 'https://chat.deepseek.com/api/v0/share/content?share_id=abcdefgh')
  assert.equal(requested.options.credentials, 'omit'); assert.equal(requested.options.redirect, 'error')
  assert.deepEqual(requested.options.headers, { accept: 'application/json' })
})
test('share reader cancels oversize and already aborted reads', async () => {
  let fetched = 0, cancelled = false
  const abort = new AbortController(); abort.abort()
  await assert.rejects(readPublicShare('https://chat.deepseek.com/share/abcdefgh', abort.signal, async () => { fetched++ }))
  assert.equal(fetched, 0)
  await assert.rejects(readPublicShare('https://chat.deepseek.com/share/abcdefgh', signal(), async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_IMPORT_BYTES + 1)) }, cancel() { cancelled = true },
  }))))
  assert.equal(cancelled, true)
})
test('one preview represents one selected conversation and includes bounded snippets/limitations', async t => {
  const f = await fixture(t), preview = await f.preview()
  assert.equal(preview.summary.messages, 2); assert.equal(preview.summary.publicReasoning, 1)
  assert(preview.warnings.some(s => s.includes('系统提示词')))
  assert.equal(preview.snippets[0].text, '我是测试角色'); assert.equal(f.commits(), 0)
})
test('exports are catalogued, paginated and searched without creating any conversation', async t => {
  const conversations = Array.from({ length: 65 }, (_, i) => ({ id: 'chat-' + i, title: '测试' + i, mapping: {
    root: { id: 'root', parent: null, children: ['u'], message: null },
    u: { id: 'u', parent: 'root', children: [], message: { fragments: [{ type: 'REQUEST', content: 'test ' + i }] } },
  } }))
  const f = await fixture(t, { share: async () => Buffer.from(JSON.stringify(conversations)) })
  const a = await f.call('share.preview', {})
  assert.equal(a.total, 65); assert.equal(a.entries.length, 40); assert.equal(a.nextCursor, 40)
  const b = await f.call('source.list', { sourceId: a.sourceId, cursor: 40 })
  assert.equal(b.entries.length, 25); assert.equal(b.nextCursor, null)
  const c = await f.call('source.list', { sourceId: a.sourceId, query: '测试64' })
  assert.equal(c.entries.length, 1)
  assert.equal((await f.call('source.list', { sourceId: a.sourceId, query: '' })).total, 65)
  const preview = await f.call('preview', { sourceId: a.sourceId, conversationId: c.entries[0].id })
  assert.equal(preview.summary.messages, 1); assert.equal(preview.snippets[0].text, 'test 64'); assert.equal(f.commits(), 0)
})
test('multiple branches require explicit choice; no implicit flattening or batch import', async t => {
  const data = JSON.parse(sourceBytes()); data.messages.push({ message_id: 3, parent_id: 1, role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: '另一分支' }] })
  const f = await fixture(t, { share: async () => Buffer.from(JSON.stringify(data)) })
  const source = await f.call('share.preview', {}), args = { sourceId: source.sourceId, conversationId: source.entries[0].id }
  const branch = await f.call('preview', args)
  assert.equal(branch.selectionRequired, true); assert.equal(branch.previewId, undefined); assert.equal(branch.branches.length, 2)
  const selected = await f.call('preview', { ...args, branchId: '3' })
  assert.equal(selected.summary.messages, 2); assert.equal(selected.snippets[1].text, '另一分支')
})
test('upload is bounded sequential chunks, permits identical chunk retransmission but rejects conflicting data', async t => {
  const f = await fixture(t), data = sourceBytes(), up = await f.call('upload.start', { name: 'chat.json', size: data.length })
  await assert.rejects(f.call('upload.finish', { uploadId: up.uploadId }), /upload-incomplete/)
  const args = { uploadId: up.uploadId, offset: 0, data: data.toString('base64') }
  assert.equal((await f.call('upload.chunk', args)).offset, data.length)
  assert.equal((await f.call('upload.chunk', args)).offset, data.length)
  await assert.rejects(f.call('upload.chunk', { ...args, data: Buffer.alloc(data.length).toString('base64') }), /invalid-chunk/)
  const source = await f.call('upload.finish', { uploadId: up.uploadId }); assert.equal(source.total, 1)
  await assert.rejects(f.call('upload.start', { name: 'x.zip', size: MAX_IMPORT_BYTES + 1 }))
  await assert.rejects(f.call('upload.start', { name: 'x.exe', size: 100 }))
  assert.equal(IMPORT_CHUNK_BYTES, 192 * 1024)
})
test('expired/released preview cannot create sessions and aborting a read cannot populate cache', async t => {
  const f = await fixture(t), preview = await f.preview()
  f.tick(15 * 60_000 + 1)
  await assert.rejects(f.call('commit', { previewId: preview.previewId, operationId: randomUUID(), workspaceId: 'w' }), /expired/)
  assert.equal(f.commits(), 0)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(f.call('share.preview', {}, abort.signal)); assert.equal(f.controller.sources.size, 0)
})
test('commit durably claims exactly one native session; request cancellation does not replay or cancel accepted work', async t => {
  let finish, started = 0
  const f = await fixture(t, { commit: async () => { started++; await new Promise(resolve => { finish = resolve }) } })
  const preview = await f.preview(), operationId = randomUUID(), args = { previewId: preview.previewId, operationId, workspaceId: 'workspace-a', presetId: 'standard' }
  const abort = new AbortController()
  const result = await f.call('commit', args, abort.signal)
  abort.abort(); assert.equal(result.state, 'pending'); assert.equal(started, 1)
  assert.equal((await f.receipts.read(operationId)).sessionId, 'session-dsimport-' + operationId)
  assert.equal((await f.call('commit', args)).state, 'pending'); assert.equal(started, 1)
  await assert.rejects(f.call('commit', { ...args, workspaceId: 'other-workspace' }), /operation-conflict/)
  await assert.rejects(f.call('commit', { ...args, presetId: 'other-preset' }), /operation-conflict/)
  await assert.rejects(f.call('commit', { ...args, operationId: randomUUID() }), /operation-conflict/)
  finish(); await f.wait()
  assert.equal((await f.call('status', { operationId })).state, 'succeeded'); assert.equal(started, 1)
})
test('missing/corrupt/uncertain receipts never trigger a new native create', async t => {
  const f = await fixture(t, { commit: async () => { throw new Error('simulated failure after possible write') } })
  assert.equal((await f.call('status', { operationId: randomUUID() })).state, 'not-found')
  const preview = await f.preview(), operationId = randomUUID(), args = { previewId: preview.previewId, operationId, workspaceId: 'w' }
  await f.call('commit', args); await f.wait()
  assert.equal((await f.receipts.read(operationId)).state, 'uncertain')
  f.ports.inspect = async identity => ({ ...identity, state: 'not-found' })
  assert.equal((await f.call('commit', args)).state, 'uncertain')
  const corrupt = randomUUID(); await fs.writeFile(path.join(f.dir, 'receipts', corrupt + '.json'), '{')
  await assert.rejects(f.call('status', { operationId: corrupt }), /receipt-unavailable/)
  await assert.rejects(f.call('commit', { ...args, operationId: corrupt }), /receipt-unavailable/)
})
test('restart recovers by inspecting original import identity only, never resubmitting', async t => {
  const f = await fixture(t), preview = await f.preview(), operationId = randomUUID()
  await f.call('commit', { previewId: preview.previewId, operationId, workspaceId: 'w' }); await f.wait()
  f.controller.dispose()
  const next = new HistoryImportController(f.ports)
  t.after(() => next.dispose())
  assert.equal((await next.control('status', { operationId }, signal())).state, 'succeeded')
  assert.equal(f.commits(), 1)
  f.ports.inspect = async identity => ({ ...identity, state: 'not-found' })
  assert.equal((await next.control('status', { operationId }, signal())).state, 'uncertain')
  assert.equal(f.commits(), 1)
})
test('receipt exclusive claim prevents cross-controller replay, contains no conversation body', async t => {
  const f = await fixture(t), operationId = randomUUID()
  const receipt = { schema: 1, operationId, sessionId: 'session-dsimport-' + operationId, workspaceId: 'w',
    sourceHash: '1'.repeat(64), conversationId: 'c', branchId: 'm', state: 'pending', createdAt: Date.now() }
  const results = await Promise.all([f.receipts.claim(receipt), f.receipts.claim(receipt)])
  assert.equal(results.filter(Boolean).length, 1)
  assert.deepEqual(await f.receipts.read(operationId), receipt)
  assert(!Object.hasOwn(receipt, 'messages'))
  await assert.rejects(f.receipts.read('../elsewhere'))
})

test('a competing claim must match source, branch and destination, not just the operation ID', async t => {
  const f = await fixture(t), operationId = randomUUID(), firstHash = (await parseHistorySource(sourceBytes())).sourceHash
  let arrived = 0, release
  const bothReading = new Promise(resolve => { release = resolve })
  const shared = {
    read: async id => {
      if (arrived < 2) { arrived++; if (arrived === 2) release(); await bothReading; return undefined }
      return f.receipts.read(id)
    },
    claim: async value => {
      // Wait for the first claimant to finish writing before returning false.
      // The production exclusive file may also be incomplete; that safely
      // reports receipt-unavailable rather than success for the wrong source.
      if (value.sourceHash !== firstHash) { await claimed; return false }
      const result = await f.receipts.claim(value); claimedResolve(); return result
    },
    save: value => f.receipts.save(value),
  }
  let claimedResolve
  const claimed = new Promise(resolve => { claimedResolve = resolve })
  const one = new HistoryImportController({ ...f.ports, receipts: shared })
  const two = new HistoryImportController({ ...f.ports, receipts: shared, share: async () => sourceBytes('另一份') })
  t.after(async () => { one.dispose(); two.dispose(); await Promise.all([...one.jobs.values(), ...two.jobs.values()]) })
  const prepare = async controller => {
    const catalog = await controller.control('share.preview', {}, signal())
    return controller.control('preview', { sourceId: catalog.sourceId, conversationId: catalog.entries[0].id }, signal())
  }
  const [a, b] = await Promise.all([prepare(one), prepare(two)])
  const results = await Promise.allSettled([
    one.control('commit', { previewId: a.previewId, operationId, workspaceId: 'workspace-a' }, signal()),
    two.control('commit', { previewId: b.previewId, operationId, workspaceId: 'workspace-a' }, signal()),
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /operation-conflict/)
  await Promise.all([...one.jobs.values(), ...two.jobs.values()])
  assert.equal(f.commits(), 1); assert.equal((await f.receipts.read(operationId)).workspaceId, 'workspace-a')
})

test('simultaneous status reads share one bounded native inspection and never create', async t => {
  const f = await fixture(t), preview = await f.preview(), operationId = randomUUID()
  await f.call('commit', { previewId: preview.previewId, operationId, workspaceId: 'w' }); await f.wait()
  const stored = await f.receipts.read(operationId), otherId = randomUUID()
  // Immediate read makes the overlap deterministic; inspection remains pending.
  f.ports.receipts = { read: async id => id === operationId ? stored : { ...stored, operationId: otherId, sessionId: 'session-dsimport-' + otherId } }
  let finish, inspections = 0, started
  const ready = new Promise(resolve => { started = resolve })
  f.ports.inspect = async identity => { inspections++; started(); await new Promise(resolve => { finish = resolve }); return { ...identity, state: 'succeeded' } }
  const cancelled = new AbortController()
  const a = f.call('status', { operationId }, cancelled.signal)
  await ready
  await assert.rejects(f.call('status', { operationId: otherId }), /busy/)
  const b = f.call('status', { operationId })
  await Promise.resolve()
  cancelled.abort(); finish()
  await assert.rejects(a)
  assert.equal((await b).state, 'succeeded'); assert.equal(inspections, 1); assert.equal(f.commits(), 1)
})

test('verified pre-create rejection is failed, but collision or a forged error remains uncertain', async t => {
  for (const [error, expected] of [
    [new NativeImportPreflightError('preset-unavailable'), 'failed'],
    [new NativeImportPreflightError('session-exists'), 'uncertain'],
    [Object.assign(new Error('not a trusted native preflight'), { rejectedBeforeCreate: true, code: 'preset-unavailable' }), 'uncertain'],
  ]) {
    const f = await fixture(t, { commit: async () => { throw error }, inspect: async () => { throw Error('must not inspect a failed preflight') } })
    const preview = await f.preview(), operationId = randomUUID()
    await f.call('commit', { previewId: preview.previewId, operationId, workspaceId: 'w' }); await f.wait()
    assert.equal((await f.receipts.read(operationId)).state, expected)
    if (expected === 'failed') assert.equal((await f.call('status', { operationId })).state, 'failed')
  }
})
