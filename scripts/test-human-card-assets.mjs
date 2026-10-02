import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { CardCoverAssets, cardCoverSource } from '../lib/human-tools/card-cover-assets.js'
import { humanCardAsset } from '../lib/human-tools/card-cover.js'
import { coverTransfer, uploadCardCover } from '../lib/human-tools/card-cover-upload.js'
import { cardCoverTool } from '../lib/human-tools/card-cover-tools.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { humanShareTool } from '../lib/human-tools/dsh.js'
import { HumanToolsService } from '../lib/human-tools/service.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { AgentResourcesService } from '../lib/agent-resources.js'
import { WorkflowHttpTransport } from '../lib/human-workflow/transport.js'
import WechatAttachmentService from '../lib/attachment-service.js'

const signal = new AbortController().signal, nodeId = 'node_cover_' + 'a'.repeat(24)
const scope = { nodeId, sessionId: 'cover_asset_session', sessionGeneration: '100' }
const rejectedTemplate = { kind: 'template', template: { schema: 'human.card.cover.v1', theme: 'blue', icon: 'calendar', heading: '公开封面' } }
const source = { kind: 'workspace', reference: 'art/public-card.png' }, bytes = Buffer.from('fixture-validated-raster')
const image = { data: bytes, mediaType: 'image/png', width: 500, height: 400 }
const sha = value => createHash('sha256').update(value).digest('hex')
const md5 = value => createHash('md5').update(value).digest('base64')
const publicAsset = () => ({ schema: 'human.card.asset.v1', assetRef: 'a'.repeat(32), sha256: sha(bytes), bytes: bytes.length, mediaType: 'image/png', width: 500, height: 400 })
const ticket = (asset = publicAsset(), method = 'PUT') => ({ url: `https://objects-sh.xyxfood.xyz/human-tasks/${asset.assetRef}.bin?signature=fixture`, expiresIn: 300,
  headers: method === 'GET' ? {} : { 'content-type': asset.mediaType, 'content-length': String(asset.bytes), 'content-md5': md5(bytes), 'x-oss-forbid-overwrite': 'true' } })
function memory(initial) { let value = structuredClone(initial); return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next) }, get value() { return structuredClone(value) } } }
function defer() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
async function fixture(options = {}) {
  const store = options.store || memory(), expire = Date.now() + 86400000
  let reads = 0, puts = 0, revocation = false, exists = false, loseFinalize = false, latestPrepare, afterRead
  const requests = [], transport = { nodeId, assertIdentity() { if (revocation) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) },
    async request(operation, body, current) {
      current.throwIfAborted(); requests.push({ operation, body: structuredClone(body) })
      if (operation === 'cover-assets/prepare') {
        latestPrepare = structuredClone(body)
        return { asset: publicAsset(), state: exists ? 'ready' : 'prepared', expiresAt: expire, ...(exists ? {} : { upload: ticket() }) }
      }
      if (operation === 'cover-assets/finalize') {
        if (!exists) throw Object.assign(new Error('missing'), { code: 'cover_upload_missing' })
        if (loseFinalize) { loseFinalize = false; throw new Error('lost finalize') }
        return { asset: publicAsset(), state: 'ready', expiresAt: expire }
      }
      if (operation === 'cover-assets/download') return { asset: publicAsset(), download: ticket(publicAsset(), 'GET'), expiresAt: expire }
      throw new Error('unexpected operation ' + operation)
    } }
  const config = { store, transport, read: async () => { reads++; if (afterRead) await afterRead(); return image },
    upload: async (_ticket, actual) => { puts++; assert.deepEqual(Buffer.from(actual.data), bytes); assert.equal((await store.load()).records[0].state, 'prepared', 'durable bytes and asset before PUT'); exists = true } }
  let runtime = await CardCoverAssets.open(config)
  return { store, config, transport, requests, get runtime() { return runtime }, get reads() { return reads }, get puts() { return puts }, get prepare() { return latestPrepare },
    loseFinalize() { loseFinalize = true }, revoke() { revocation = true }, delayRead(callback) { afterRead = callback },
    async reopen() { await runtime.close(); runtime = await CardCoverAssets.open(config) },
    async seed() { return runtime.prepare(scope, source, 'prepare_call', signal) } }
}

test('source and public-asset codecs reject authority, paths, malformed sizes and non-5:4 metadata', () => {
  assert(cardCoverSource(source)); assert(cardCoverSource({ kind: 'workspace', reference: 'art/card.png' })); assert(cardCoverSource({ kind: 'attachment', attachmentId: 'observed_ref' }))
  for (const reference of ['../x', '/secret.png', 'C:\\secret.png', '\\\\host\\secret', 'https://host/a.png', 'a/../x', 'a//b']) assert.equal(cardCoverSource({ kind: 'workspace', reference }), undefined)
  for (const value of [{ ...source, secret: 'x' }, { kind: 'file', path: 'x' }, rejectedTemplate,
    { ...source, template: rejectedTemplate.template }]) assert.equal(cardCoverSource(value), undefined)
  assert(humanCardAsset(publicAsset()))
  for (const patch of [{ width: 400 }, { height: 0 }, { bytes: 2097153 }, { sha256: 'bad' }, { mediaType: 'image/svg+xml' }, { url: 'https://host' }, { assetRef: 'a'.repeat(32) + '\n' }]) assert.equal(humanCardAsset({ ...publicAsset(), ...patch }), undefined)
})

test('persistent assets bind exact bytes, scope/generation and root call before upload; opaque metadata is not authority', async () => {
  const f = await fixture()
  try {
    const asset = await f.seed(); assert.deepEqual(asset, publicAsset()); assert.equal(f.puts, 1)
    assert.equal(f.prepare.sha256, sha(bytes)); assert.equal(f.prepare.md5, md5(bytes))
    f.runtime.assertAsset(scope, asset)
    for (const foreign of [{ ...scope, sessionId: 'other' }, { ...scope, sessionGeneration: '101' }, { ...scope, nodeId: 'other' }]) assert.throws(() => f.runtime.assertAsset(foreign, asset))
    assert.throws(() => f.runtime.assertAsset(scope, { ...asset, sha256: 'f'.repeat(64) }), { code: 'cover-asset-unavailable' })
    await f.reopen(); assert.deepEqual(await f.seed(), asset); assert.equal(f.reads, 1); assert.equal(f.puts, 1)
    await assert.rejects(f.runtime.prepare(scope, { ...source, reference: 'art/replacement.png' }, 'prepare_call', signal), { code: 'cover-source-conflict' })
    f.revoke(); assert.throws(() => f.runtime.assertAsset(scope, asset), { code: 'binding_revoked' })
  } finally { await f.runtime.close() }
})

test('lost finalize and restart reconcile the original object without reading, changing image or issuing another PUT', async () => {
  const f = await fixture(); f.loseFinalize()
  try {
    await assert.rejects(f.seed(), /lost finalize/); assert.equal(f.store.value.records[0].state, 'prepared')
    const count = f.requests.length; await f.reopen(); assert.deepEqual(await f.seed(), publicAsset())
    assert.deepEqual(f.requests.slice(count).map(item => item.operation), ['cover-assets/finalize'])
    assert.equal(f.reads, 1); assert.equal(f.puts, 1)
  } finally { await f.runtime.close() }
})

test('real file recovery rejects corrupt bytes and cross-node ledgers, keeps prepare unknown request stable', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'human-cover-assets-')), store = new WorkflowFileStore(path.join(directory, 'assets.json'))
  const f = await fixture({ store }), request = f.transport.request
  let lost = true
  f.transport.request = async (...args) => { const value = await request(...args); if (args[0] === 'cover-assets/prepare' && lost) { lost = false; throw new Error('lost prepare') }; return value }
  try {
    await assert.rejects(f.seed(), /lost prepare/); const originalId = f.prepare.requestId
    await f.reopen(); assert.deepEqual(await f.seed(), publicAsset()); assert.equal(f.prepare.requestId, originalId); assert.equal(f.reads, 1)
    const raw = await store.load(); raw.records[0].data = Buffer.from('corrupt').toString('base64')
    await assert.rejects(CardCoverAssets.open({ ...f.config, store: memory(raw) }), { code: 'cover-store-invalid' })
    await assert.rejects(CardCoverAssets.open({ ...f.config, transport: { ...f.transport, nodeId: 'other' } }), { code: 'cover-store-invalid' })
  } finally { await f.runtime.close(); await rm(directory, { recursive: true, force: true }) }
})

test('cancel/dispose during read or durable save never returns usable asset or starts upload', async () => {
  const f = await fixture(), started = defer(), release = defer()
  f.delayRead(async () => { started.resolve(); await release.promise })
  const pending = f.seed(), rejected = assert.rejects(pending, { code: 'cover-disabled' })
  await started.promise; const closing = f.runtime.close(); release.resolve(); await closing; await rejected
  assert.equal(f.puts, 0); assert.equal(f.requests.length, 0)
  const saved = memory(), saving = defer(), finish = defer(), g = await fixture({ store: { load: saved.load, async save(value) { saving.resolve(); await finish.promise; await saved.save(value) } } })
  const run = g.seed(), refused = assert.rejects(run, { code: 'cover-disabled' }); await saving.promise
  const stopped = g.runtime.close(); finish.resolve(); await stopped; await refused
  assert.equal(saved.value.records[0].state, 'local'); assert.equal(g.puts, 0)
})

test('signed OSS adapter rejects substituted paths/headers/bytes and reconciles ambiguous PUT without another endpoint', async () => {
  const valid = ticket(); assert.equal(coverTransfer(valid, 'PUT', image, md5(bytes)).length, 1)
  for (const next of [{ ...valid, url: valid.url.replace('/human-tasks/', '/chat/') }, { ...valid, url: 'https://evil.invalid/human-tasks/' + 'a'.repeat(32) + '.bin' },
    { ...valid, headers: { ...valid.headers, authorization: 'secret' } }, { ...valid, headers: { ...valid.headers, 'content-length': '2' } }, { ...valid, alternatives: {} }]) assert.throws(() => coverTransfer(next, 'PUT', image, md5(bytes)))
  assert.throws(() => coverTransfer({ ...ticket(publicAsset(), 'GET'), headers: { authorization: 'secret' } }, 'GET'))
  let calls = 0
  await uploadCardCover(valid, image, md5(bytes), signal, async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); assert.deepEqual(init.body, bytes); throw new Error('lost PUT response') })
  assert.equal(calls, 1)
})

test('actual native tool registry prepares asset then shares only the exact locally authorized reference', async t => {
  const f = await fixture(), ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx); ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const c = await HumanToolsCore.open(memory({ schemaVersion: 1, records: [] }), () => randomBytes(16).toString('hex'), Date.now,
    (origin, asset) => f.runtime.assertAsset({ nodeId, sessionId: origin.scope, sessionGeneration: origin.generation }, asset))
  t.after(async () => { await f.runtime.close(); await c.close(); await ctx.fiber.dispose() })
  const definition = cardCoverTool(nodeId, f.runtime, exec => assert.equal(exec.agent, agent)); assertSupportedJsonSchema(definition.parameters); tools.register(definition); tools.register(humanShareTool(c))
  assert.deepEqual(definition.parameters.properties.source.oneOf.map(branch => branch.properties.kind.const), ['attachment', 'workspace'])
  assert.match(definition.description, /supplies no fonts, drawing engine, templates or image generator/)
  const refused = await tools.execute({ name: definition.name, arguments: { source: rejectedTemplate }, callId: 'removed_template', agent, signal })
  assert.equal(refused.isError, true); assert.equal(f.reads, 0); assert.equal(f.puts, 0); assert.equal(f.requests.length, 0)
  const result = await tools.execute({ name: definition.name, arguments: { source }, callId: 'native_cover', agent, signal })
  assert.equal(result.isError, false, JSON.stringify(result)); const output = JSON.parse(result.content[0].text)
  assert.deepEqual(output.asset, publicAsset()); assert(!JSON.stringify(output).includes('https://')); assert(!JSON.stringify(output).includes('md5'))
  const make = asset => tools.execute({ name: 'human_surface_share', arguments: { title: '公开卡', body: '公开说明', cover: asset }, callId: 'native_share', agent, signal })
  assert.equal((await make({ ...output.asset, sha256: 'f'.repeat(64) })).isError, true)
  const share = await make(output.asset); assert.equal(share.isError, false); assert.deepEqual(share.meta.humanSurface.cover, output.asset)
})

test('native workspace source reuses containment/version checks and does not export arbitrary filesystem paths', async t => {
  const ctx = new Context(); let changed = false, escaped = false
  const resources = new AgentResourcesService(ctx, { async invoke(method, args) {
    assert.equal(args.workspaceFileScopeId, scope.sessionId)
    if (method === 'list') { if (args.path.startsWith('/outside')) throw new Error('native containment'); return { path: '', entries: [{ name: 'cover.png', type: 'file', size: bytes.length }] } }
    if (method === 'stat') return { absolutePath: escaped ? '/outside/cover.png' : '/work/cover.png', bytes: bytes.length, version: 'v1' }
    if (method === 'readBytes') return { absolutePath: '/work/cover.png', version: changed ? 'v2' : 'v1', offset: 0, data: bytes.toString('base64') }
  } }); t.after(() => ctx.fiber.dispose())
  assert.deepEqual((await resources.readWorkspaceFile(scope.sessionId, 'cover.png', signal)).data, bytes)
  for (const value of ['/work/cover.png', '../cover.png', 'C:\\cover.png', 'https://host/cover.png']) await assert.rejects(resources.readWorkspaceFile(scope.sessionId, value, signal))
  changed = true; await assert.rejects(resources.readWorkspaceFile(scope.sessionId, 'cover.png', signal), /正在变化/)
  changed = false; escaped = true; await assert.rejects(resources.readWorkspaceFile(scope.sessionId, 'cover.png', signal), /containment/)
})

test('native attachment source invokes session attachment authorization, never a global attachment lookup', async t => {
  const ctx = new Context(); let calls = 0
  ctx.provide('typertGateway', { async stream() { throw new Error('not used') }, async invoke(request) {
    calls++; assert.equal(request.namespace, 'session'); assert.equal(request.method, 'attachment')
    const input = request.args.request; assert.equal(input.sessionId, scope.sessionId)
    if (input.attachmentId !== 'observed-image') throw new Error('not referenced in session')
    return { attachment: { attachmentId: input.attachmentId, mediaType: 'image/png', bytes: bytes.length }, data: bytes.toString('base64') }
  } })
  const reader = new WechatAttachmentService(ctx); t.after(() => ctx.fiber.dispose())
  assert.deepEqual(Buffer.from((await reader.readSessionImage(scope.sessionId, 'observed-image', signal)).data), bytes)
  await assert.rejects(reader.readSessionImage(scope.sessionId, 'foreign-image', signal)); assert.equal(calls, 2)
})

test('late native tool completion after session generation changes returns no old asset', async () => {
  const f = await fixture(), started = defer(), release = defer(); f.delayRead(async () => { started.resolve(); await release.promise })
  const session = { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } }, agent = { id: scope.sessionId, session }
  const tool = cardCoverTool(nodeId, f.runtime, () => {}), pending = tool.execute({ source }, { agent, rootCallId: 'late', callId: 'late', signal })
  const denied = assert.rejects(pending, { code: 'cover-scope-invalid' }); await started.promise; session.header.createdAt = 101; release.resolve()
  try { await denied; assert.throws(() => f.runtime.assertAsset({ ...scope, sessionGeneration: '101' }, publicAsset())) }
  finally { await f.runtime.close() }
})

test('expired ready asset stays unusable; malformed preview ticket never leaves the owner boundary', async () => {
  const f = await fixture(); await f.seed()
  try {
    const original = f.transport.request
    f.transport.request = async (...args) => { const value = await original(...args); if (args[0] === 'cover-assets/download') value.download.url = value.download.url.replace('/human-tasks/', '/chat/'); return value }
    await assert.rejects(f.runtime.preview(scope, publicAsset(), 'preview_id_123456', signal), { code: 'cover-ticket-invalid' })
    const expired = await CardCoverAssets.open({ ...f.config, now: () => Date.now() + 2 * 86400000 })
    try { assert.throws(() => expired.assertAsset(scope, publicAsset()), { code: 'cover-asset-unavailable' }); await assert.rejects(expired.prepare(scope, source, 'prepare_call', signal), { code: 'cover-asset-unavailable' }) }
    finally { await expired.close() }
  } finally { await f.runtime.close() }
})

test('owner-only preview resolves durable card asset without claim, accepts exact requestId and rejects replacement generations', async t => {
  const f = await fixture(), asset = await f.seed(); await f.runtime.close()
  const ctx = new Context(); new SystemPrompt(ctx, {}); new ToolRuntime(ctx, { mode: 'native' }); const sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined }); ctx.on('session/flush', async () => {})
  const surfaceId = 'c'.repeat(32), coreStore = memory({ schemaVersion: 1, records: [{ surface: { schemaVersion: 1, kind: 'human.surface', id: surfaceId, revision: 1, title: '公开', body: '说明', cover: asset, actions: [{ id: 'share', type: 'wechat.share', label: '发送群卡' }] },
    origin: { scope: scope.sessionId, generation: '100', callId: 'call', rootCallId: 'call' }, createdAt: Date.now(), attempts: [] }] })
  const service = new HumanToolsService(ctx, { enabled: true, assistants: false, store: coreStore, workflow: { transport: f.transport,
    modeStore: memory(), recordStore: memory(), replicaStore: memory(), lifecycleStore: memory(), receiverKeyStore: memory(), automationStore: memory(), coverStore: f.store } })
  t.after(() => ctx.fiber.dispose()); const request = { scope: scope.sessionId, surfaceId, revision: 1, requestId: 'owner:preview:123456' }
  const result = await service.coverPreview(request, signal); assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(JSON.parse(result.valueJson).asset, asset); assert.equal(coreStore.value.records[0].attempts.length, 0)
  assert.equal((await service.coverPreview({ ...request, surfaceId: 'f'.repeat(32) }, signal)).ok, false)
  assert.equal((await service.coverPreview({ ...request, requestId: '../url' }, signal)).ok, false)
  // A different actual generation cannot borrow the old card even with the same ID.
  const replacement = sessions.create(SessionId('other_session'), { meta: { createdAt: 101 } })
  assert.equal((await service.coverPreview({ ...request, scope: String(replacement.id) }, signal)).ok, false)
})
