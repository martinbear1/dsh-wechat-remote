/** Isolated contract fixtures; never loads a profile, real session or model. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/dsh-host.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' })
const { DshClawbotHost, DshClawbotHostError } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'))
const signal = () => new AbortController().signal
const input = (sessionId = 's1', requestId = 'r1') => ({ sessionId, requestId, text: 'my request', expectedGeneration: 100 })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture() {
  const listeners = new Map(), nativeCalls = [], started = deferred(), sessions = new Map(), agents = new Map()
  const session = (id, createdAt = 100) => ({ id, header: { id, createdAt, cwd: 'fixture-workspace' }, seq: 40 })
  sessions.set('s1', session('s1')); sessions.set('other', session('other'))
  const metadata = new Map([...sessions].map(([id, s]) => [id, { header: s.header, cursor: s.seq - 1 }]))
  const h = {
    rows: [{ sessionId: 's1', cwd: 'fixture-workspace', projections: { values: { title: 'Target' } } }],
    archived: [], observersDisposed: 0, prompt: async () => ({ accepted: true }),
    emit(name, ...args) { for (const listener of [...listeners.get(name) ?? []]) listener(...args) },
    event(type, data, id = 's1') { const s = sessions.get(id); h.emit('session/event', s, { seq: s.seq++, type, data }) },
    turn(turn = 3, requestId = 'r1') {
      h.event('turn/start', { turn })
      h.event('user/message', { id: 'm-' + requestId, source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: 'my request' }] })
    },
    assistant(text = 'the answer', turn = 3, extra = []) {
      h.event('assistant/message', { turn, step: 1, message: { content: [{ type: 'text', text }, ...extra] } })
    },
    end(turn = 3, kind = 'completed') { h.event('turn/end', { turn, reason: { kind } }) },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    nativeCalls, sessions, agents, metadata, started: started.promise,
  }
  const services = {
    workspaceRegistry: { get archivedSessionIds() { return h.archived } },
    sessions: { get: id => sessions.get(id) }, agents: { get: id => agents.get(id) },
    sessionQuery: { async observeSession(id, options) {
      assert.ok(['none', 'all'].includes(options.projectionMode))
      return { ...metadata.get(id), get events() { throw Error('Historical body must never be accessed') },
        [Symbol.dispose]() { h.observersDisposed++ } }
    } },
    typertGateway: { async invoke(request) {
      nativeCalls.push(request)
      if (request.namespace === 'session' && request.method === 'list') return { items: h.rows }
      assert.equal(request.namespace, 'session'); assert.equal(request.method, 'prompt')
      started.resolve(request)
      return h.prompt(request)
    } },
  }
  h.services = services
  h.ctx = {
    get: name => services[name],
    on(name, listener, options) {
      assert.equal(options.global, true)
      assert.ok(['session/event', 'session/disposed'].includes(name), 'ClawBot is an observer, never a native question/approval answerer')
      assert.equal(options.prepend, undefined)
      const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set)
      return () => set.delete(listener)
    },
  }
  h.host = new DshClawbotHost(h.ctx)
  h.calls = () => nativeCalls.filter(c => c.method === 'prompt')
  return h
}
const failure = (code, submission) => error => {
  assert(error instanceof DshClawbotHostError)
  assert.equal(error.code, 'clawbot-host/' + code)
  if (submission) assert.equal(error.submission, submission)
  return true
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64')
const fileRef = (name, data) => ({ name, bytes: data.byteLength, attachmentId: 'sha256:' + createHash('sha256').update(data).digest('hex') })
const imageRef = name => ({ name, attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/webp', bytes: 46, width: 1, height: 1 })
function mediaTurn(h, content, requestId = 'r1') {
  h.event('turn/start', { turn: 3 })
  h.event('user/message', { source: { kind: 'user', rpcId: requestId }, content })
  h.assistant(); h.end()
}

test('mixed media uses native image admission and opaque session-scoped file receipts in original order', async () => {
  const h = fixture(), data = Buffer.from('synthetic file'), saved = fileRef('notes.txt', data), writes = []
  h.services.fileUploads = { async uploadStream(request) {
    const chunks = []; for await (const chunk of request.data) chunks.push(chunk)
    writes.push({ sessionId: request.sessionId, name: request.name, data: Buffer.concat(chunks) })
    return { receiptId: 'native-file-receipt', file: saved }
  } }
  const promise = h.host.run({ ...input(), attachments: [
    { kind: 'image', name: 'picture.png', data: png }, { kind: 'file', name: 'notes.txt', data },
  ] }, signal())
  const { args: { request } } = await h.started
  assert.deepEqual(request.content, [{ type: 'text', text: 'my request' },
    { type: 'image', name: 'picture.png', mediaType: 'image/png', data: png.toString('base64') },
    { type: 'file', receiptId: 'native-file-receipt' }])
  assert.deepEqual(writes, [{ sessionId: 's1', name: 'notes.txt', data }])
  // Native image normalization legitimately changes bytes, MIME and digest.
  mediaTurn(h, [{ type: 'text', text: 'my request' }, { type: 'image', attachment: imageRef('picture.png') }, { type: 'file', attachment: saved }])
  assert.deepEqual(await promise, { text: 'the answer' }); assert.equal(h.calls().length, 1)
})

for (const kind of ['file', 'voice', 'video']) test(`attachment-only ${kind} uses native generic file without invented transcript`, async () => {
  const h = fixture(), data = Buffer.from('synthetic media'), saved = fileRef('media.bin', data)
  h.services.fileUploads = { async uploadStream() { return { receiptId: 'receipt', file: saved } } }
  const promise = h.host.run({ ...input(), text: '', attachments: [{ kind, name: 'media.bin', data }] }, signal())
  assert.deepEqual((await h.started).args.request.content, [{ type: 'file', receiptId: 'receipt' }])
  mediaTurn(h, [{ type: 'file', attachment: saved }]); assert.deepEqual(await promise, { text: 'the answer' })
})

test('cold attachment stages through native resolver, then observes that same native session', async () => {
  const h = fixture(), session = h.sessions.get('s1'), data = Buffer.from('cold file'), saved = fileRef('cold.txt', data)
  h.sessions.delete('s1')
  h.services.fileUploads = { async uploadStream(request) {
    assert.equal(request.sessionId, 's1'); h.sessions.set('s1', session)
    h.agents.set('s1', { status: 'idle', session }); return { receiptId: 'cold-receipt', file: saved }
  } }
  const promise = h.host.run({ ...input(), text: '', attachments: [{ kind: 'file', name: 'cold.txt', data }] }, signal())
  await h.started; mediaTurn(h, [{ type: 'file', attachment: saved }])
  assert.deepEqual(await promise, { text: 'the answer' }); assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

for (const corruption of ['extra', 'name', 'digest', 'order', 'inline']) test(`media correlation rejects ${corruption} content despite a matching request id`, async () => {
  const h = fixture(), data = Buffer.from('file'), saved = fileRef('one.txt', data)
  h.services.fileUploads = { async uploadStream() { return { receiptId: 'receipt', file: saved } } }
  const promise = h.host.run({ ...input(), attachments: [{ kind: 'image', name: 'one.png', data: png }, { kind: 'file', name: 'one.txt', data }] }, signal())
  const rejected = assert.rejects(promise, failure('ambiguous-turn'))
  await h.started
  const content = [{ type: 'text', text: 'my request' }, { type: 'image', attachment: imageRef('one.png') }, { type: 'file', attachment: { ...saved } }]
  if (corruption === 'extra') content.push({ type: 'text', text: 'private extra' })
  if (corruption === 'name') content[1].attachment.name = 'other.png'
  if (corruption === 'digest') content[2].attachment.attachmentId = 'sha256:' + 'b'.repeat(64)
  if (corruption === 'order') content.reverse()
  if (corruption === 'inline') content[1] = { type: 'image', name: 'one.png', data: png.toString('base64'), mediaType: 'image/png' }
  mediaTurn(h, content); await rejected; assert.equal(h.listenerCount(), 0)
})

for (const change of ['pause', 'access', 'archive', 'reset', 'replace', 'busy', 'abort']) test(`attachment preparation revalidates ${change} before sending, without deleting native files`, async () => {
  const h = fixture(), prepared = deferred(), release = deferred(), controller = new AbortController(), data = Buffer.from('file'), saved = fileRef('one.txt', data)
  let allowed = true, access = true, writes = 0
  h.host = new DshClawbotHost(h.ctx, () => { if (!access) throw Error('access revoked') })
  h.services.fileUploads = { async uploadStream() { writes++; prepared.resolve(); await release.promise; return { receiptId: 'receipt', file: saved } },
    delete() { assert.fail('native shared store must not be deleted') } }
  const promise = h.host.run({ ...input(), attachments: [{ kind: 'file', name: 'one.txt', data }],
    checkAdmission() { if (!allowed) throw Error('paused') } }, controller.signal)
  const rejected = assert.rejects(promise)
  await prepared.promise
  if (change === 'pause') allowed = false
  if (change === 'access') access = false
  if (change === 'archive') h.archived.push('s1')
  if (change === 'reset') h.sessions.get('s1').header.createdAt++
  if (change === 'replace') h.sessions.set('s1', { ...h.sessions.get('s1') })
  if (change === 'busy') h.agents.set('s1', { status: 'running' })
  if (change === 'abort') controller.abort()
  release.resolve(); await rejected
  assert.equal(writes, 1); assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
})

test('invalid media shape, content and limits reject before any native access', async () => {
  const media = (changes = {}) => ({ kind: 'file', name: 'one.txt', data: Buffer.from('file'), ...changes })
  for (const attachments of [[media({ name: '../one.txt' })], [media({ name: 'a\\one.txt' })], [media({ data: new Uint8Array() })],
    [media({ data: new Uint8Array(10 * 1024 * 1024 + 1) })], Array(7).fill(media()), [media({ kind: 'audio' })],
    [media({ kind: 'image' })], Array(4).fill(media({ data: new Uint8Array(8 * 1024 * 1024) }))]) {
    const h = fixture()
    await assert.rejects(h.host.run({ ...input(), attachments }, signal()), failure('invalid-input', 'not-submitted'))
    assert.equal(h.nativeCalls.length, 0)
  }
})

test('unavailable or mismatched native upload receipt never falls back to local file writes or plain text', async () => {
  const data = Buffer.from('file')
  for (const upload of [undefined, async () => { throw Error('private path') }, async () => ({ receiptId: 'r', file: fileRef('one.txt', Buffer.from('other')) })]) {
    const h = fixture(); if (upload) h.services.fileUploads = { uploadStream: upload }
    await assert.rejects(h.host.run({ ...input(), attachments: [{ kind: 'file', name: 'one.txt', data }] }, signal()), error => {
      assert.equal(error.submission, 'not-submitted'); assert(!error.message.includes('private path')); return true
    })
    assert.equal(h.calls().length, 0)
  }
})

test('native model image rejection sends no replacement, never changes selected model or preset', async () => {
  const h = fixture(); h.prompt = async () => { throw Object.assign(Error('text-only model'), { code: 'session/attachment-invalid' }) }
  await assert.rejects(h.host.run({ ...input(), attachments: [{ kind: 'image', name: 'one.png', data: png }] }, signal()), failure('attachment-rejected', 'not-submitted'))
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt']); assert.equal(h.listenerCount(), 0)
})

test('native input accepts safe 240-byte names without truncating extensions and rejects overlong UTF-8 names', async () => {
  const name = 'a'.repeat(236) + '.pdf', data = Buffer.from('file'), h = fixture(), ref = fileRef(name, data)
  h.services.fileUploads = { async uploadStream(request) { assert.equal(request.name, name); return { receiptId: 'receipt', file: ref } } }
  const promise = h.host.run({ ...input(), text: '', attachments: [{ kind: 'file', name, data }] }, signal())
  await h.started; mediaTurn(h, [{ type: 'file', attachment: ref }]); await promise
  for (const name of ['a'.repeat(237) + '.pdf', '字'.repeat(80) + '.txt']) {
    const h = fixture()
    await assert.rejects(h.host.run({ ...input(), attachments: [{ kind: 'file', name, data }] }, signal()), failure('invalid-input', 'not-submitted'))
    assert.equal(h.nativeCalls.length, 0)
  }
})

test('pause during native cold resolver stops byte delivery before the native store consumes it', async () => {
  const h = fixture(), data = Buffer.from('file'); let allowed = true, consumed = 0
  h.services.fileUploads = { async uploadStream(request) {
    // Native uploadStream first awaits cold Agent resolution, then pulls data.
    allowed = false
    for await (const chunk of request.data) consumed += chunk.byteLength
    assert.fail('paused channel must not supply bytes')
  } }
  await assert.rejects(h.host.run({ ...input(), attachments: [{ kind: 'file', name: 'one.txt', data }],
    checkAdmission() { if (!allowed) throw Error('paused') } }, signal()), failure('attachment-unavailable', 'not-submitted'))
  assert.equal(consumed, 0); assert.equal(h.calls().length, 0)
})

function resourceFixture(h, files) {
  const calls = [], transfers = new Map(), reply = value => ({ ok: true, valueJson: JSON.stringify(value) })
  h.services.agentResources = {
    async resolve(request) {
      calls.push(['resolve', request]); assert.equal(request.scope, 's1')
      const file = files.get(request.reference); if (!file) return { ok: false }
      return reply({ kind: 'file', id: request.reference, bytes: file.data.length, name: file.name })
    },
    async prepare(request) {
      calls.push(['prepare', request]); assert.equal(request.scope, 's1'); assert.equal(request.delivery, 'chunks')
      const file = files.get(request.id), transferId = 'snapshot-' + transfers.size
      transfers.set(transferId, file)
      return reply({ transferId, delivery: 'chunks', bytes: file.data.length, name: file.name, chunkBytes: 3,
        sha256: createHash('sha256').update(file.data).digest('hex') })
    },
    async chunk(request) {
      calls.push(['chunk', request]); assert.equal(request.scope, 's1')
      const file = transfers.get(request.transferId)
      return reply({ offset: request.offset, data: file.data.subarray(request.offset, request.offset + 3).toString('base64') })
    },
    async release(request) { calls.push(['release', request]); transfers.delete(request.transferId); return { ok: true } },
  }
  return { calls, transfers }
}
const presented = (h, paths, turn = 3, sessionId = 's1') => h.event('deliverables/presented', {
  turn, callId: 'native-present', files: paths.map(path => ({ path })),
}, sessionId)

test('only matched-turn native present declarations return bounded attachments, not paths in prose or tool reads', async () => {
  const h = fixture(), doc = Buffer.from('synthetic PDF'), resources = resourceFixture(h, new Map([
    ['results/one.pdf', { name: 'one.pdf', data: doc }], ['results/image.png', { name: 'image.png', data: png }],
  ]))
  const promise = h.host.run(input(), signal()); await h.started
  presented(h, ['foreign.pdf'], 2, 'other'); h.turn()
  presented(h, ['previous.pdf'], 2)
  h.event('tool/result', { turn: 3, message: { content: [{ type: 'text', text: 'secret.txt' }, { type: 'image', attachment: imageRef('private.png') }] } })
  presented(h, ['results/one.pdf', 'results/one.pdf', 'results/image.png'])
  assert.equal(resources.calls.length, 0, 'files are read only after successful native completion')
  h.assistant('See result. Also mention unrelated secret.txt'); h.end()
  assert.deepEqual(await promise, { text: 'See result. Also mention unrelated secret.txt', attachments: [
    { kind: 'file', name: 'one.pdf', data: doc }, { kind: 'image', name: 'image.png', data: png },
  ] })
  assert.deepEqual(resources.calls.filter(c => c[0] === 'resolve').map(c => c[1].reference), ['results/one.pdf', 'results/image.png'])
  assert.equal(resources.transfers.size, 0); assert.equal(h.calls().length, 1)
})

test('native presented artifact-only completion works without inventing a second prompt', async () => {
  const h = fixture(), data = Buffer.from('empty final text but real artifact')
  resourceFixture(h, new Map([['result.txt', { name: 'result.txt', data }]]))
  const promise = h.host.run(input(), signal()); await h.started; h.turn(); presented(h, ['result.txt']); h.end()
  assert.deepEqual(await promise, { text: '已生成文件。', attachments: [{ kind: 'file', name: 'result.txt', data }] })
  assert.equal(h.calls().length, 1)
})

for (const problem of ['missing-service', 'missing-file', 'oversize', 'corrupt-chunk', 'session-reset', 'access', 'abort']) test(`unavailable ${problem} artifact preserves final text and releases snapshot without native task mutation`, async () => {
  const h = fixture(), data = problem === 'oversize' ? Buffer.alloc(10 * 1024 * 1024 + 1) : Buffer.from('result'), controller = new AbortController()
  const resources = resourceFixture(h, new Map(problem === 'missing-file' ? [] : [['result.txt', { name: 'result.txt', data }]]))
  let access = true
  h.host = new DshClawbotHost(h.ctx, () => { if (!access) throw Error('revoked') })
  const service = h.services.agentResources, originalChunk = service.chunk
  service.chunk = async request => {
    if (problem === 'session-reset') h.sessions.get('s1').header.createdAt++
    if (problem === 'access') access = false
    if (problem === 'abort') controller.abort()
    if (problem === 'corrupt-chunk') return { ok: true, valueJson: JSON.stringify({ offset: request.offset, data: 'AAAA' }) }
    return originalChunk(request)
  }
  if (problem === 'missing-service') delete h.services.agentResources
  const promise = h.host.run(input(), controller.signal); await h.started; h.turn(); presented(h, ['result.txt']); h.assistant('Final answer'); h.end()
  const result = await promise
  assert(result.text.startsWith('Final answer')); assert(result.text.includes('文件未能回传'))
  assert.equal(result.attachments, undefined); assert.equal(resources.transfers.size, 0)
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('failed native turn never exports previously presented files', async () => {
  const h = fixture(), resources = resourceFixture(h, new Map([['one.txt', { name: 'one.txt', data: Buffer.from('secret') }]]))
  const promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('interrupted'))
  await h.started; h.turn(); presented(h, ['one.txt']); h.assistant('partial'); h.end(3, 'cancelled')
  await rejected; assert.equal(resources.calls.length, 0)
})

test('final native durable image is verified by its stored digest; tool images never leak', async () => {
  const h = fixture(), ref = { ...imageRef('answer.png'), attachmentId: 'sha256:' + createHash('sha256').update(png).digest('hex'), bytes: png.length, mediaType: 'image/png' }
  let reads = 0
  h.services.attachments = { async readImage(value) { reads++; assert.deepEqual(value, ref); return { data: png } } }
  const promise = h.host.run(input(), signal()); await h.started; h.turn()
  h.event('tool/result', { turn: 3, message: { content: [{ type: 'image', attachment: imageRef('private.png') }] } })
  h.assistant('Image ready', 3, [{ type: 'image', attachment: ref }]); h.end()
  assert.deepEqual(await promise, { text: 'Image ready', attachments: [{ kind: 'image', name: 'answer.png', data: png }] })
  assert.equal(reads, 1)
})

test('pause does not interrupt original task observation but prevents any new output read', async () => {
  const h = fixture(), data = Buffer.from('complete'), media = resourceFixture(h, new Map([['one.txt', { name: 'one.txt', data }]]))
  let admission = true
  const promise = h.host.run({ ...input(), checkAdmission() { assert.equal(admission, true) } }, signal())
  await h.started; admission = false; h.turn(); presented(h, ['one.txt']); h.assistant(); h.end()
  const result = await promise
  assert(result.text.startsWith('the answer')); assert(result.text.includes('文件未能回传'))
  assert.equal(result.attachments, undefined); assert.equal(media.calls.length, 0)
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('directory includes ordinary cold/fork sessions, excludes archive/subagent and does no mutation', async () => {
  const h = fixture()
  h.rows.push({ sessionId: 'cold', cwd: 'fixture', agentAvailable: false },
    { sessionId: 'fork', cwd: 'fixture', parentSessionId: 'parent', projections: { values: { title: 'Fork' } } },
    { sessionId: 'child', cwd: 'fixture', origin: 'subagent' }, { sessionId: 'archived', cwd: 'fixture' }, { sessionId: 'no-workspace' })
  h.archived.push('archived')
  assert.deepEqual(await h.host.listSessions(signal()), [
    { id: 's1', title: 'Target' }, { id: 'cold', title: '未命名会话' }, { id: 'fork', title: 'Fork' },
  ])
  assert.equal(h.nativeCalls.length, 1); assert.equal(h.nativeCalls[0].method, 'list')
  assert.equal(h.listenerCount(), 0)
})

test('session picker grouping uses registered workspace membership and never exposes the directory path', async () => {
  const h = fixture(), registry = h.ctx.get('workspaceRegistry')
  registry.list = () => [{id:'workspace-1',name:'Project',path:'C:/private/Project',sessionIds:['s1']}]
  assert.deepEqual(await h.host.listSessions(signal()),[{id:'s1',title:'Target',workspaceId:'workspace-1',workspaceTitle:'Project'}])
  registry.list = () => [{id:'workspace-1',path:'C:/private/Project',sessionIds:['s1']}]
  assert.equal((await h.host.listSessions(signal()))[0].workspaceTitle,'Project')
  assert.equal(h.calls().length,0)
})

test('accepted is not completion; correlate exact request and return only final durable text', async () => {
  const h = fixture(), promise = h.host.run(input(), signal())
  let done = false; promise.finally(() => { done = true })
  const request = await h.started
  await Promise.resolve()
  assert.equal(done, false)
  assert.deepEqual(request.args, { request: { sessionId: 's1', requestId: 'r1', mode: 'queue', content: [{ type: 'text', text: 'my request' }] } })
  h.event('assistant/message', { turn: 2, message: { content: [{ type: 'text', text: 'other session secret' }] } }, 'other')
  h.emit('session/event', h.sessions.get('s1'), { seq: 2, type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'historical secret' }] } } })
  h.turn()
  h.event('assistant/chunk', { chunk: { type: 'reasoning-delta', text: 'thinking' } })
  h.assistant('tool preface', 3, [{ type: 'tool-call', name: 'read' }])
  h.event('tool/result', { turn: 3, message: { content: [{ type: 'text', text: 'tool secret' }] } })
  h.assistant('final answer', 3, [{ type: 'reasoning', text: 'reasoning secret' }])
  h.end()
  assert.deepEqual(await promise, { text: 'final answer' })
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0); assert.equal(h.observersDisposed, 1)
})

test('selection snapshots native generation without accessing historical bodies or activating an Agent', async () => {
  const h = fixture(); h.sessions.delete('s1')
  assert.deepEqual(await h.host.describeSession('s1', signal()), { id: 's1', title: 'Target', generation: 100 })
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list'])
  assert.equal(h.observersDisposed, 1); assert.equal(h.listenerCount(), 0)
})

test('old queued selection is rejected before native admission after same-id reset', async () => {
  const h = fixture(); h.metadata.get('s1').header.createdAt++
  await assert.rejects(h.host.run(input(), signal()), failure('session-changed', 'not-submitted'))
  assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
})

test('hot generation is checked immediately before dispatch even if observed metadata became stale', async () => {
  const h = fixture(); h.sessions.set('s1', { id: 's1', header: { ...h.metadata.get('s1').header, createdAt: 101 }, seq: 40 })
  await assert.rejects(h.host.run(input(), signal()), failure('session-changed', 'not-submitted'))
  assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
})

test('legacy inputs without a generation are not silently rebound', async () => {
  const h = fixture(), legacy = input(); delete legacy.expectedGeneration
  await assert.rejects(h.host.run(legacy, signal()), failure('invalid-input', 'not-submitted'))
  assert.equal(h.nativeCalls.length, 0)
})

test('cold session is resumed only by native prompt; no history or custom Agent construction', async () => {
  const h = fixture(), s = h.sessions.get('s1'); h.sessions.delete('s1')
  h.prompt = async () => { h.sessions.set('s1', s); h.turn(); h.assistant(); h.end(); return { accepted: true } }
  assert.deepEqual(await h.host.run(input(), signal()), { text: 'the answer' })
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('completion may race acknowledgement without absorbing a later user turn', async () => {
  const h = fixture(), receipt = deferred()
  h.prompt = () => receipt.promise
  const promise = h.host.run(input(), signal()); await h.started
  h.turn(); h.assistant('mine'); h.end()
  h.turn(4, 'someone-else'); h.assistant('later secret', 4); h.end(4)
  receipt.resolve({ accepted: true })
  assert.deepEqual(await promise, { text: 'mine' })
})

test('unmatched turns never become the requested reply', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()); await h.started
  h.turn(3, 'not-r1'); h.assistant('another request'); h.end()
  h.turn(4); h.assistant('mine', 4); h.end(4)
  assert.deepEqual(await promise, { text: 'mine' })
})

for (const before of [true, false]) test(`foreign input ${before ? 'before' : 'after'} target in same turn fails closed`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('ambiguous-turn'))
  await h.started
  if (before) h.turn(3, 'foreign'); else h.turn()
  h.event('user/message', { id: 'second', source: { kind: 'user', rpcId: before ? 'r1' : 'foreign' }, content: [{ type: 'text', text: 'my request' }] })
  h.assistant('mixed private reply'); h.end()
  await rejected; assert.equal(h.listenerCount(), 0); assert.equal(h.calls().length, 1)
})

for (const [type, data, code] of [
  ['approval/asked', { id: 'approval-1', toolName: 'shell' }, 'approval-required'],
  ['tool/call', { name: 'ask_user_question', turn: 3 }, 'question-required'],
]) test(`${code} hands off without native approval or cancellation`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure(code))
  await h.started; h.turn(); h.event(type, data)
  await rejected; assert.equal(h.listenerCount(), 0); assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('native questions and approval remain pending until owner answers; same turn final reply continues', async () => {
  const h = fixture(), notices = [], promise = h.host.run(input(), signal(), kind => notices.push(kind))
  let settled = false; void promise.then(() => { settled = true })
  await h.started; h.turn()
  h.event('tool/call', { name: 'ask_user_question', turn: 3 })
  h.event('tool/call', { name: 'ask_user_question', turn: 3 })
  h.event('approval/asked', { id: 'a', toolName: 'shell' })
  assert.deepEqual(notices, ['question', 'approval'])
  await Promise.resolve(); assert.equal(settled, false)
  h.event('approval/decided', { id: 'a', approved: true })
  h.event('tool/result', { turn: 3, message: { content: [{ type: 'text', text: 'owner answered' }] } })
  h.assistant('completed after owner action'); h.end()
  assert.deepEqual(await promise, { text: 'completed after owner action' })
  assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt']); assert.equal(h.listenerCount(), 0)
})

test('unrelated interaction is not forwarded and handoff does not weaken foreign input fence', async () => {
  const h = fixture(), notices = [], promise = h.host.run(input(), signal(), kind => notices.push(kind))
  const rejected = assert.rejects(promise, failure('ambiguous-turn'))
  await h.started; h.turn()
  h.event('approval/asked', { id: 'other', toolName: 'shell' }, 'other')
  assert.deepEqual(notices, [])
  h.event('tool/call', { name: 'ask_user_question', turn: 3 })
  h.event('user/message', { source: { kind: 'user', rpcId: 'other-input' }, content: [{ type: 'text', text: 'another task' }] })
  h.assistant('must not forward mixed task'); h.end()
  await rejected; assert.equal(h.listenerCount(), 0); assert.equal(h.calls().length, 1)
})

test('waiting for a native answer stays bounded and timeout never cancels or resubmits the task', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = fixture(), notices = [], promise = h.host.run(input(), signal(), kind => notices.push(kind))
  const rejected = assert.rejects(promise, failure('observation-timeout', 'accepted'))
  await h.started; await new Promise(setImmediate); h.turn()
  h.event('tool/call', { name: 'ask_user_question', turn: 3 })
  t.mock.timers.tick(15 * 60 * 1000)
  await rejected
  h.assistant('late result stays in native session'); h.end()
  assert.deepEqual(notices, ['question']); assert.equal(h.listenerCount(), 0)
  assert.deepEqual(h.nativeCalls.map(call => call.method), ['list', 'prompt'])
})

test('notice persistence failure detaches observation without throwing into native session events', async () => {
  const h = fixture(), promise = h.host.run(input(), signal(), () => { throw Error('private disk path') })
  const rejected = assert.rejects(promise, failure('attention-unavailable'))
  await h.started; h.turn()
  assert.doesNotThrow(() => h.event('approval/asked', { id: 'a', toolName: 'shell' }))
  await rejected; assert.equal(h.listenerCount(), 0); assert.equal(h.calls().length, 1)
})

test('cold missing current preset fails before route selection or prompt, never uses old header preset', async () => {
  const h = fixture(), resolved = []
  h.metadata.get('s1').header.agentPreset = 'standard'
  h.metadata.get('s1').projections = { values: { agentPreset: 'harness-teacher' } }
  h.services.agentPresets = { async resolve(preset) {
    resolved.push(preset); throw Object.assign(Error('private path'), { code: 'agent-preset/not-found' })
  } }
  await assert.rejects(h.host.describeSession('s1', signal()), failure('preset-unavailable', 'not-submitted'))
  await assert.rejects(h.host.run(input(), signal()), failure('preset-unavailable', 'not-submitted'))
  assert.deepEqual(resolved, ['harness-teacher', 'harness-teacher']); assert.equal(h.calls().length, 0)
})

test('a live native Agent may keep its retired preset revision', async () => {
  const h = fixture()
  h.agents.set('s1', { status: 'idle' })
  h.services.agentPresets = { resolve() { assert.fail('live composition is owned by DSH') } }
  const promise = h.host.run(input(), signal()); await h.started
  h.turn(); h.assistant(); h.end()
  assert.deepEqual(await promise, { text: 'the answer' })
})

test('preexisting running/queued Agent is busy and sends nothing', async () => {
  for (const state of [{ status: 'running' }, { inbox: { nextTurn: [{}], nextStep: [] } }]) {
    const h = fixture(); h.agents.set('s1', state)
    await assert.rejects(h.host.run(input(), signal()), failure('busy', 'not-submitted'))
    assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
  }
})

test('native work starting during the awaited preset check cannot receive a late ClawBot prompt', async () => {
  for (const busy of [{ status: 'running' }, { status: 'idle', inbox: { hasPending: true } },
    { status: 'idle', inbox: { nextTurn: [{}] } }, { status: 'idle', inbox: { nextStep: [{}] } }]) {
    const h = fixture(), checking = deferred(), checked = deferred()
    h.metadata.get('s1').header.agentPreset = 'standard'
    h.metadata.get('s1').projections = { values: { agentPreset: 'standard' } }
    h.services.agentPresets = { resolve() { checking.resolve(); return checked.promise } }
    const run = h.host.run(input(), signal()), rejected = assert.rejects(run, failure('busy', 'not-submitted'))
    await checking.promise
    h.agents.set('s1', busy); checked.resolve({})
    await rejected
    assert.equal(h.calls().length, 0); assert.equal(h.listenerCount(), 0)
  }
})

test('native writer conflict is identifiable and never retried', async () => {
  const h = fixture(); h.prompt = async () => { throw Object.assign(Error('private diagnostic'), { code: 'session/writer-held' }) }
  await assert.rejects(h.host.run(input(), signal()), error => {
    failure('busy', 'unknown')(error); assert(!error.message.includes('private diagnostic')); return true
  })
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('external abort detaches observer but never aborts native admission or cancels task', async () => {
  const h = fixture(), receipt = deferred(), controller = new AbortController()
  h.prompt = () => receipt.promise
  const promise = h.host.run(input(), controller.signal), rejected = assert.rejects(promise, failure('observation-stopped', 'unknown'))
  const request = await h.started; controller.abort(); await rejected
  assert.equal(request.signal.aborted, false); assert.equal(h.listenerCount(), 0)
  h.turn(); h.assistant('late reply'); h.end(); receipt.resolve({ accepted: true })
  await Promise.resolve(); assert.deepEqual(h.nativeCalls.map(c => c.method), ['list', 'prompt'])
})

test('unknown receipt fails without resend or historical fallback', async () => {
  const h = fixture(); h.prompt = async () => ({ ok: true })
  await assert.rejects(h.host.run(input(), signal()), failure('delivery-unknown', 'unknown'))
  assert.equal(h.calls().length, 1); assert.equal(h.listenerCount(), 0)
})

test('changed session generation prevents disclosure', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('session-changed'))
  await h.started; h.sessions.get('s1').header.createdAt++
  h.turn(); h.assistant('new session secret'); h.end(); await rejected
  assert.equal(h.listenerCount(), 0)
})

for (const kind of ['cancelled', 'blocked', 'error', 'max-tokens']) test(`${kind} is not successful completion`, async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('interrupted'))
  await h.started; h.turn(); h.assistant('partial text'); h.end(3, kind); await rejected
})

test('tool-call and reasoning-only messages are never returned as a final answer', async () => {
  const h = fixture(), promise = h.host.run(input(), signal()), rejected = assert.rejects(promise, failure('output-unavailable'))
  await h.started; h.turn(); h.assistant('not final', 3, [{ type: 'tool-call', name: 'done' }]); h.end(); await rejected
})

test('invalid, missing, archived and subagent selections never dispatch', async () => {
  for (const mutate of [h => { h.rows = [] }, h => { h.archived = ['s1'] }, h => { h.rows[0].origin = 'subagent' }]) {
    const h = fixture(); mutate(h)
    await assert.rejects(h.host.run(input(), signal()), failure('not-found'))
    assert.equal(h.calls().length, 0)
  }
  const h = fixture()
  await assert.rejects(h.host.run({ ...input(), text: ' ' }, signal()), failure('invalid-input'))
  assert.equal(h.nativeCalls.length, 0)
})

test('installed native prompt schema, SessionController and AgentLoop preserve request/turn correlation',
  { skip: !process.env.HARNESS_DSH_ASAR }, async () => {
    // Deliberately requires an explicit archive; no live profile discovery or
    // installed SDK imports through the repository's older development SDK.
    const archive = process.env.HARNESS_DSH_ASAR
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbot-native-host-'))
    const fd = fs.openSync(archive, 'r')
    let ctx
    try {
      const prefix = Buffer.alloc(16); fs.readSync(fd, prefix, 0, 16, 0)
      const bytes = Buffer.alloc(prefix.readUInt32LE(12)); fs.readSync(fd, bytes, 0, bytes.length, 16)
      const tree = JSON.parse(bytes), dataStart = 8 + prefix.readUInt32LE(4)
      function materialize(entry, relative) {
        const target = path.resolve(work, relative)
        assert(target.startsWith(work + path.sep)); assert(!entry.link)
        if (entry.files) {
          for (const [name, child] of Object.entries(entry.files)) materialize(child, path.join(relative, name))
        } else if (/\.(?:[mc]?js|json|node|wasm|ya?ml)$/.test(relative)) {
          fs.mkdirSync(path.dirname(target), { recursive: true })
          if (entry.unpacked) fs.copyFileSync(path.join(archive + '.unpacked', relative), target)
          else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, data.length, dataStart + Number(entry.offset)); fs.writeFileSync(target, data) }
        }
      }
      materialize(tree.files.dsh, 'dsh')
      const anchor = path.join(work, 'dsh/node_modules/@deepseek-ai/dsh/package.json')
      const require = createRequire(anchor), load = name => import(pathToFileURL(require.resolve(name)).href)
      const { Context } = await load('@deepseek-ai/cordis')
      const { SessionStore } = await load('@deepseek-ai/dsh-session')
      const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
      const { AgentLoop } = await load('@deepseek-ai/dsh-agent-loop')
      const { ToolRuntime } = await load('@deepseek-ai/dsh-tools')
      const { SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
      const { default: Projections } = await load('@deepseek-ai/dsh-session-projection')
      const { SessionController } = await load('@deepseek-ai/dsh-api-session-controller')
      const { TYPERT } = await load('@deepseek-ai/dsh-api-session-controller/typert')
      const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry')
      const schema = TYPERT.invocations.find(v => v.namespace === 'session' && v.method === 'prompt').parameters[0].codec.create()
      // No generation CAS exists: its generated Zod object strips this unknown
      // field instead of conveying it to the native admission implementation.
      assert.equal(schema.parse({ sessionId: 'fixture', requestId: 'r', mode: 'queue',
        content: [{ type: 'text', text: 'fixture' }], expectedGeneration: 123 }).expectedGeneration, undefined)
      ctx = new Context()
      new SystemPrompt(ctx, {}); new SessionStore(ctx); new Projections(ctx); new AgentRegistry(ctx)
      new ToolRuntime(ctx, { mode: 'native' }); new Typert(ctx)
      const model = { provider: 'fixture', model: 'no-network' }
      let modelCalls = 0, nativePrompts = 0
      ctx.provide('llm', { listProviders: () => [{ id: 'fixture' }], resolveCallConfig: async v => v,
        resolveModelInfo: async () => ({ inputModalities: ['text'] }),
        async prepareCall(config) { return { config, stream: request => this.stream(request) } },
        async *stream() { modelCalls++; yield { type: 'reasoning-delta', index: 0, text: 'private reasoning' }
          yield { type: 'text-delta', index: 1, text: 'native final reply' }; yield { type: 'finish', reason: 'stop' } } })
      ctx.provide('agentDefaultModel', { currentSelection: () => model })
      ctx.provide('attachments', { admitPromptContent: async v => structuredClone(v) })
      ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => { throw Error('no files') },
        bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }) })
      ctx.provide('workspaceRegistry', { archivedSessionIds: [], list: () => [], get: () => undefined })
      ctx.provide('fs', { resolve() { throw Error('no filesystem tools') } })
      let agent
      ctx.provide('sessionQuery', { listSessions: async () => agent ? [{ header: agent.session.header }] : [],
        async observeSession(sessionId) { assert.equal(sessionId, agent.id); return { header: agent.session.header,
          cursor: agent.session.seq - 1, get events() { throw Error('no old transcript reads') }, [Symbol.dispose]() {} } } })
      const loop = new AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
      const controller = new SessionController(ctx)
      agent = await loop.create('clawbot-native-fixture', model, { cwd: work })
      ctx.systemPrompt.context({ name: 'fixture-context', order: 1, text: () => 'Native runtime context, not user input.' })
      ctx.provide('typertGateway', { invoke({ namespace, method, args, signal }) {
        assert.equal(namespace, 'session')
        if (method === 'list') return controller.list(args._request, signal)
        assert.equal(method, 'prompt'); nativePrompts++
        return controller.prompt(schema.parse(args.request), signal)
      } })
      const host = new DshClawbotHost(ctx), beforeTools = JSON.stringify(ctx.tools.schemas(agent))
      const target = await host.describeSession(agent.id, AbortSignal.timeout(5000))
      const result = await host.run({ sessionId: agent.id, requestId: 'clawbot-native-request', text: 'fixture request', expectedGeneration: target.generation }, AbortSignal.timeout(5000))
      await agent.whenIdle()
      assert.deepEqual(result, { text: 'native final reply' })
      assert.equal(nativePrompts, 1); assert.equal(modelCalls, 1)
      assert.equal(JSON.stringify(ctx.tools.schemas(agent)), beforeTools)
      const events = agent.session.snapshotEvents()
      assert.equal(events.find(e => e.type === 'user/message' && e.data.source.kind === 'user').data.source.rpcId, 'clawbot-native-request')
      assert(events.some(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context'))
      assert.equal(events.at(-1).type, 'turn/end')
      assert.equal(events.at(-1).data.reason.kind, 'completed')
    } finally {
      await ctx?.fiber.dispose(); fs.closeSync(fd)
      assert.equal(path.dirname(path.resolve(work)), path.resolve(os.tmpdir()))
      assert(path.basename(work).startsWith('clawbot-native-host-'))
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  })
