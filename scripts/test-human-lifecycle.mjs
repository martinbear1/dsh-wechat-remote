import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, rename, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import nacl from 'tweetnacl'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { SubmissionReceiver } from '../lib/human-workflow/receiver.js'
import { downloadSubmission } from '../lib/human-workflow/receiver-download.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { canonicalSubmission, sha256, sha512, decryptSubmission } from '../lib/human-workflow/submission-crypto.js'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { humanSurface } from '../lib/human-tools/protocol.js'
import { humanForm } from '../lib/human-tools/form.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_web_123456789', sessionId: 'session_a', sessionGeneration: '100' }
const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'owner', accountInstance: 'account-instance', generation: 'generation' }
const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const form = () => ({ schema: 'human.form.v1', fields: [{ key: 'name', label: '业务称呼（自报）', kind: 'short-text', required: true, maxLength: 80 }],
  attachment: { kind: 'image', required: true, maxBytes: 1024, mediaTypes: ['image/png'] } })
const initial = () => ({ title: '资料收集', instructions: '提交一张图片', form: form(), closesAt: null, recipientRefs: null })
function memory(initial) { let value = structuredClone(initial), writes = 0; return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next); writes++ }, get value() { return structuredClone(value) }, get writes() { return writes } } }
function defer() { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
function seal(key, changes = {}) {
  const context = { schema: 'human.submission.context.v1', bindingKey, taskRef, roundId: 'r'.repeat(24), participantRef: 'p'.repeat(24), submissionId: 's'.repeat(24), version: 1, objectId: 'o'.repeat(24), keyId: key.keyId, ...changes }
  const manifest = { schema: 'human.submission.manifest.v1', context, answers: { name: '甲' }, file: { mediaType: 'image/png', plainBytes: image.length, plainDigest: sha512(image) } }
  const text = Buffer.from(canonicalSubmission(manifest)), clear = Buffer.alloc(4 + text.length + image.length)
  clear.writeUInt32BE(text.length); text.copy(clear, 4); image.copy(clear, text.length + 4)
  const ephemeral = nacl.box.keyPair(), nonce = randomBytes(24), cipher = nacl.box(clear, nonce, Buffer.from(key.publicKey, 'base64'), ephemeral.secretKey)
  const envelope = { schema: 'human.submission.box.v1', keyId: key.keyId, ephemeralPublicKey: Buffer.from(ephemeral.publicKey).toString('base64'), nonce: nonce.toString('base64'),
    cipherBytes: cipher.length, cipherDigest: sha512(cipher), manifestDigest: sha512(text) }
  return { context, manifest, cipher, envelope, delivery: { claimId: 'c'.repeat(24), leaseExpiresAt: Date.now() + 120000, submissionId: context.submissionId, version: context.version, context, envelope, values: manifest.answers, download: {} } }
}
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workflow-receiver-')), root = path.join(directory, 'received'), store = new WorkflowFileStore(path.join(directory, 'keys.json'))
  const keys = await ReceiverKeyring.open(store, scope.nodeId), key = await keys.ensure(bindingKey, signal), sealed = seal(key)
  let downloads = 0, acks = 0, valid = true
  const options = { root, nodeId: scope.nodeId, keys, assertIdentity() { if (!valid) throw Object.assign(new Error('revoked'), { code: 'binding_revoked' }) },
    download: async () => { downloads++; return sealed.cipher }, validateImage: async (bytes, type) => { assert.deepEqual(Buffer.from(bytes), image); assert.equal(type, 'image/png') },
    ack: async (_scope, _ref, delivery) => { acks++; const entries = await readdir(root); assert(entries.some(entry => /^[a-f0-9]{64}$/.test(entry)), 'ACK requires committed directory')
      return { delivery: { state: 'received', submissionId: delivery.submissionId, version: delivery.version, manifestDigest: delivery.envelope.manifestDigest, cipherDigest: delivery.envelope.cipherDigest } } }, ...overrides }
  const receiver = await SubmissionReceiver.open(options)
  t.after(async () => { await receiver.close(); await keys.close(); await rm(directory, { recursive: true, force: true }) })
  return { directory, root, keys, key, store, sealed, receiver, options, get downloads() { return downloads }, get acks() { return acks }, set valid(value) { valid = value } }
}

test('keyring retains keys through reload and rotation, never substitutes corrupt or foreign identity', async () => {
  const store = memory(), keys = await ReceiverKeyring.open(store, scope.nodeId), key = await keys.ensure(bindingKey, signal)
  assert.deepEqual(await keys.ensure(bindingKey, signal), key); assert.equal(store.writes, 1)
  const oldSecret = keys.secret(key.keyId, bindingKey), rotated = await keys.ensure('b'.repeat(64), signal)
  assert.notEqual(rotated.keyId, key.keyId); await keys.close()
  const restored = await ReceiverKeyring.open(store, scope.nodeId)
  assert.deepEqual(restored.secret(key.keyId, bindingKey), oldSecret); await restored.close()
  await assert.rejects(ReceiverKeyring.open(store, 'other_node'), { code: 'receiver-key-invalid' })
  const bad = store.value; bad.keys[0].publicKey = Buffer.alloc(32, 1).toString('base64')
  await assert.rejects(ReceiverKeyring.open(memory(bad), scope.nodeId), { code: 'receiver-key-invalid' })
})

test('envelope rejects corruption, context substitution, answer replacement and low-order public keys', async t => {
  const f = await fixture(t), s = f.sealed, secret = f.keys.secret(f.key.keyId, bindingKey)
  assert.deepEqual(Buffer.from(decryptSubmission(s.cipher, s.envelope, secret, s.context, s.manifest.answers).image), image)
  const corrupt = new Uint8Array(s.cipher); corrupt[25] ^= 1
  assert.throws(() => decryptSubmission(corrupt, s.envelope, secret, s.context, s.manifest.answers))
  for (const changes of [{ bindingKey: 'b'.repeat(64) }, { version: 2 }, { submissionId: 'x'.repeat(24) }, { participantRef: 'x'.repeat(24) }, { taskRef: { ...taskRef, taskId: 'x'.repeat(24) } }])
    assert.throws(() => decryptSubmission(s.cipher, s.envelope, secret, { ...s.context, ...changes }, s.manifest.answers), { code: 'submission-context-invalid' })
  assert.throws(() => decryptSubmission(s.cipher, s.envelope, secret, s.context, { name: '乙' }), { code: 'submission-context-invalid' })
  assert.throws(() => decryptSubmission(s.cipher, { ...s.envelope, ephemeralPublicKey: Buffer.alloc(32).toString('base64') }, secret, s.context, s.manifest.answers), { code: 'submission-integrity-invalid' })
})

test('durable encrypted receipt precedes ACK; lost ACK reload retries only confirmation', async t => {
  const f = await fixture(t), acknowledge = f.options.ack; let lost = true
  f.options.ack = async (...args) => { const answer = await acknowledge(...args); if (lost) { lost = false; throw new Error('lost response') } return answer }
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal))
  assert.equal(f.downloads, 1); assert.equal(f.acks, 1)
  await f.receiver.close()
  const restored = await SubmissionReceiver.open(f.options)
  try {
    assert.equal((await restored.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)).state, 'received')
    assert.equal(f.downloads, 1); assert.equal(f.acks, 2)
    const result = await restored.read(scope, f.sealed.context.submissionId, bindingKey, signal)
    assert.deepEqual(Buffer.from(result.image), image)
    const names = await readdir(path.join(f.root, result.artifactRef)); assert.deepEqual(names.sort(), ['payload.box', 'receipt.json'])
    assert.notDeepEqual(await readFile(path.join(f.root, result.artifactRef, 'payload.box')), image)
    await assert.rejects(restored.read({ ...scope, sessionGeneration: '200' }, f.sealed.context.submissionId, bindingKey, signal), { code: 'submission-not-received' })
  } finally { await restored.close() }
})

test('receipt-only renewal after expired download validates original and acknowledges without another ticket or download', async t => {
  const f = await fixture(t), ack = f.options.ack
  f.options.ack = async () => { throw new Error('offline before ACK') }
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal))
  const dirs = await readdir(f.root), receiptPath = path.join(f.root, dirs.find(n => /^[a-f0-9]{64}$/.test(n)), 'receipt.json')
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).claimId, f.sealed.delivery.claimId)
  f.options.ack = ack; await f.receiver.close(); const receiver = await SubmissionReceiver.open(f.options)
  try {
    let claims = 0
    const claim = async proof => { claims++; assert.deepEqual(proof, { claimId: f.sealed.delivery.claimId, version: 1,
      cipherDigest: f.sealed.envelope.cipherDigest, manifestDigest: f.sealed.envelope.manifestDigest })
      return { delivery: { ...proof, submissionId: f.sealed.context.submissionId, state: 'receipt-only', leaseExpiresAt: Date.now() + 60000 } } }
    assert.equal(await receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, claim, signal), true)
    assert.equal(claims, 1); assert.equal(f.downloads, 1); assert.equal(f.acks, 1)
    await writeFile(path.join(f.root, dirs[0], 'payload.box'), Buffer.alloc(f.sealed.cipher.length))
    await assert.rejects(receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, claim, signal), { code: 'submission-integrity-invalid' })
    assert.equal(claims, 1)
  } finally { await receiver.close() }
})

test('old receipt without claim proof and changed lease cannot forge receipt-only authority', async t => {
  const f = await fixture(t); await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
  const claim = async proof => ({ delivery: { ...proof, claimId: 'other', submissionId: f.sealed.context.submissionId, state: 'receipt-only', leaseExpiresAt: Date.now() + 60000 } })
  await assert.rejects(f.receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, claim, signal), { code: 'receiver-ack-invalid' })
  const receiptPath = path.join(f.root, (await readdir(f.root))[0], 'receipt.json'), legacy = JSON.parse(await readFile(receiptPath, 'utf8')); delete legacy.claimId
  await writeFile(receiptPath, JSON.stringify(legacy))
  assert.equal(await f.receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, () => { throw new Error('must not call') }, signal), false)
})

test('corrupt/missing retained object, different manifest and unauthorized binding never ACK', async t => {
  const f = await fixture(t), received = await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
  await writeFile(path.join(f.root, received.artifactRef, 'payload.box'), Buffer.alloc(f.sealed.cipher.length))
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal), { code: 'submission-integrity-invalid' })
  assert.equal(f.acks, 1)
  await assert.rejects(f.receiver.receive(scope, taskRef, 'b'.repeat(64), f.sealed.delivery, signal), { code: 'receiver-claim-invalid' })
  const changed = structuredClone(f.sealed.delivery); changed.context.submissionId = '../escape'
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, changed, signal), { code: 'submission-context-invalid' })
  f.valid = false; await assert.rejects(f.receiver.read(scope, f.sealed.context.submissionId, bindingKey, signal), { code: 'binding_revoked' })
})

test('image decoder failure and disk budget refuse ACK, cancellation drains owned work', async t => {
  const invalid = await fixture(t, { validateImage: async () => { throw new Error('raster invalid') } })
  await assert.rejects(invalid.receiver.receive(scope, taskRef, bindingKey, invalid.sealed.delivery, signal)); assert.equal(invalid.acks, 0)
  const quota = await fixture(t, { maxBytes: 1 })
  await assert.rejects(quota.receiver.receive(scope, taskRef, bindingKey, quota.sealed.delivery, signal), { code: 'receiver-capacity' }); assert.equal(quota.downloads, 0)
  const entered = defer(), release = defer(), f = await fixture(t, { validateImage: async () => { entered.resolve(); await release.promise } })
  const pending = f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal).catch(e => e)
  await entered.promise; let done = false; const closing = f.receiver.close().then(() => { done = true })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false)
  release.resolve(); await closing; assert((await pending) instanceof Error); assert.equal(f.acks, 0)
})

test('fully fsynced pre-rename stage recovers while symlinked retained payload is refused', async t => {
  const f = await fixture(t), received = await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
  await f.receiver.close()
  const committed = path.join(f.root, received.artifactRef), stage = path.join(f.root, `.stage-${received.artifactRef}-${'a'.repeat(24)}`)
  await rename(committed, stage)
  const recovered = await SubmissionReceiver.open(f.options)
  try { assert.deepEqual(Buffer.from((await recovered.read(scope, f.sealed.context.submissionId, bindingKey, signal)).image), image) }
  finally { await recovered.close() }
  const original = path.join(f.directory, 'outside.box'); await rename(path.join(committed, 'payload.box'), original)
  try { await symlink(original, path.join(committed, 'payload.box'), 'file') }
  catch (e) { if (e.code === 'EPERM') return; throw e }
  const guarded = await SubmissionReceiver.open(f.options)
  try { await assert.rejects(guarded.read(scope, f.sealed.context.submissionId, bindingKey, signal), { code: 'receiver-store-invalid' }) }
  finally { await guarded.close() }
})

test('signed download only accepts fixed HTTPS same-object origins, no redirects, headers or overrun', async () => {
  const origin = 'https://objects.example', ticket = { url: origin + '/human-tasks/' + 'o'.repeat(24) + '.bin?signature=x', expiresIn: 30 }
  let calls = 0
  const fetcher = async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response(new Uint8Array(21)) }
  assert.equal((await downloadSubmission(ticket, 21, signal, fetcher, [origin])).length, 21)
  for (const value of [{ ...ticket, url: 'http://objects.example/same' }, { ...ticket, url: 'https://attacker.example/same' }, { ...ticket, headers: { authorization: 'secret' } },
    { ...ticket, alternatives: [{ ...ticket, url: origin + '/human-tasks/' + 'x'.repeat(24) + '.bin' }] },
    { ...ticket, url: origin + '/objects/' + 'o'.repeat(24) + '.bin' }, { ...ticket, url: origin + '/human-tasks/short.bin' },
    { ...ticket, url: origin + '/human-tasks/' + 'o'.repeat(97) + '.bin' }, { ...ticket, alternatives: {} },
    { ...ticket, alternatives: [{ ...ticket, alternatives: [] }] }]) await assert.rejects(downloadSubmission(value, 21, signal, fetcher, [origin]), { code: 'receiver-ticket-invalid' })
  assert.equal(calls, 1)
  await assert.rejects(downloadSubmission(ticket, 21, signal, async () => new Response(new Uint8Array(22)), [origin]), { code: 'receiver-download-invalid' })
})

async function lifecycleFixture(t, options = {}) {
  const keys = await ReceiverKeyring.open(memory(), scope.nodeId), claims = [], received = [], offsets = []
  const tasks = [taskRef, { ...taskRef, taskId: 'u'.repeat(24) }].map(ref => ({ taskRef: ref, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration }, lifecycleRevision: 1 }))
  const entries = Array.from({ length: 30 }, (_, index) => ({ id: String(index).padStart(24, '0'), state: 'accepted', delivery: 'pending', version: 1, roundId: 'r'.repeat(24), values: { name: '甲' } }))
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(operation, input, active) {
    active.throwIfAborted()
    if (operation === 'receiver-key') return { binding, bindingKey, key: input.key }
    if (operation === 'lifecycle') {
      const offset = input.offset ?? 0; offsets.push([input.taskRef.taskId, offset])
      return { binding, bindingKey, taskRef: input.taskRef, origin: tasks[0].origin, revision: 1, asOf: 100, rounds: [], participants: [], drafts: [],
        submissions: entries.slice(offset, offset + 20), nextOffset: offset + 20 < entries.length ? offset + 20 : null, ...options.page }
    }
    assert.equal(operation, 'objects/claim'); claims.push([input.taskRef.taskId, input.submissionId]); await options.onClaim?.(input); return { delivery: { submissionId: input.submissionId } }
  } }
  const receiver = { async receive(_scope, _taskRef, _bindingKey, delivery, active) { active.throwIfAborted(); received.push(delivery.submissionId); await options.onReceive?.(active) } }
  const settings = { transport, receiver, keys, store: options.store ?? memory(), ...(options.now ? { now: options.now } : {}) }
  const runtime = await WorkflowLifecycle.open(settings)
  t.after(async () => { await runtime.close(); await keys.close() })
  return { runtime, tasks, claims, received, offsets, settings }
}

test('expired ticket parks durable intent; only explicit owner CAS retry rotates requestId and never starts an Agent', async t => {
  const requestIds = [], disk = memory()
  const entry = { id: 's'.repeat(24), roundId: 'r'.repeat(24), state: 'accepted', delivery: 'pending', version: 1, values: {} }
  let expires = true
  const f = await lifecycleFixture(t, { store: disk, page: { submissions: [entry], nextOffset: null }, onClaim(input) {
    requestIds.push(input.requestId); if (expires) throw Object.assign(new Error('provider secret should not escape'), { code: 'download_ticket_expired' })
  } })
  await f.runtime.synced(binding, [f.tasks[0]], signal); await f.runtime.synced(binding, [f.tasks[0]], signal)
  assert.equal(requestIds.length, 1)
  const status = await f.runtime.receiptStatus(scope, taskRef, signal)
  assert.equal(status.items[0].state, 'blocked'); assert.equal(status.items[0].retryable, true)
  assert(!JSON.stringify(status).includes('provider secret'))
  await f.runtime.close(); const restored = await WorkflowLifecycle.open(f.settings)
  t.after(() => restored.close()); await restored.synced(binding, [f.tasks[0]], signal); assert.equal(requestIds.length, 1)
  const request = { submissionId: entry.id, submissionVersion: 1, expectedRevision: status.items[0].revision }
  const result = await restored.retryReceipt(scope, taskRef, request, signal); assert.equal(result.state, 'pending')
  await assert.rejects(restored.retryReceipt(scope, taskRef, request, signal), { code: 'receipt-version-conflict' })
  expires = false; await restored.synced(binding, [f.tasks[0]], signal)
  assert.equal(requestIds.length, 2); assert.notEqual(requestIds[0], requestIds[1]); assert.equal(disk.value.receipts[0].state, 'received')
  await assert.rejects(restored.receiptStatus(scope, taskRef, signal, -1), { code: 'lifecycle-query-invalid' })
})

test('background receiver limits each sync to four attempts, resumes mid-page and rotates across tasks without invoking an Agent', async t => {
  const f = await lifecycleFixture(t)
  await f.runtime.synced(binding, f.tasks, signal)
  assert.equal(f.received.length, 4); assert(f.claims.every(([id]) => id === taskRef.taskId))
  await f.runtime.synced(binding, f.tasks, signal)
  assert.equal(f.received.length, 8); assert(f.claims.slice(4).every(([id]) => id === f.tasks[1].taskRef.taskId))
  await f.runtime.synced(binding, f.tasks, signal)
  assert.equal(f.received.length, 12); assert.deepEqual(f.offsets, [[taskRef.taskId, 0], [f.tasks[1].taskRef.taskId, 0], [taskRef.taskId, 4]])
  assert.equal(f.claims[8][1], String(4).padStart(24, '0'))
})

test('background receiver enforces total time budget and preserves cancellation, not per-object multi-hour work', async t => {
  let now = 0
  const f = await lifecycleFixture(t, { now: () => now, onReceive() { now += 120_001 } })
  await f.runtime.synced(binding, f.tasks.slice(0, 1), signal)
  assert.equal(f.received.length, 1)
  await f.runtime.synced(binding, f.tasks.slice(0, 1), signal)
  assert.equal(f.received.length, 2); assert.deepEqual(f.offsets.map(item => item[1]), [0, 1])
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(f.runtime.synced(binding, f.tasks, cancelled.signal), { name: 'AbortError' })
  assert.equal(f.received.length, 2)
})

test('lifecycle accepts a bounded large cloud page but projects only current round and a resumable small submission page', async t => {
  const rounds = Array.from({ length: 16 }, (_, index) => ({ id: String(index), number: index, title: '轮次', instructions: 'x'.repeat(32 * 1024) }))
  const submissions = Array.from({ length: 20 }, (_, index) => ({ id: String(index), values: { note: 'x'.repeat(8000) } }))
  const f = await lifecycleFixture(t, { page: { rounds, submissions, nextOffset: 20 } })
  const query = await f.runtime.query(scope, taskRef, signal)
  assert.equal(query.rounds.length, 1); assert.equal(query.roundRefs.length, 16)
  assert(query.submissions.length < 20); assert.equal(query.nextOffset, query.submissions.length)
  assert(Buffer.byteLength(JSON.stringify(query)) < 80 * 1024)
  assert(!Object.hasOwn(query, 'binding')); assert(!Object.hasOwn(query, 'bindingKey'))
})

test('fixed initial forms and approval surfaces reject authority smuggling and remain origin/digest bound', async () => {
  assert(humanForm(form()))
  for (const extra of [{ url: 'https://evil' }, { script: 'run()' }]) assert.equal(humanForm({ ...form(), ...extra }), undefined)
  const conditional = form(); conditional.fields[0].when = { op: 'eq', field: 'future', value: true }; assert.equal(humanForm(conditional), undefined)
  const store = memory({ schemaVersion: 1, records: [] }), core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
  const origin = { scope: scope.sessionId, generation: scope.sessionGeneration, callId: 'call', rootCallId: 'call' }
  const card = await core.createCollection(origin, '任务', '公开要求', initial(), signal)
  assert(humanSurface(card)); assert.equal(card.initialRound.recipientRefs, null)
  assert.equal(humanSurface({ ...card, initialRound: { ...initial(), recipientRefs: ['forged'] } }), undefined)
  const ref = { schema: 'human.lifecycle.draft.ref.v1', draftId: 'f'.repeat(24), version: 1, digest: 'a'.repeat(64), kind: 'review' }
  const approval = await core.createWorkflow({ ...origin, rootCallId: 'review' }, taskRef, ref, signal)
  assert(humanSurface(approval)); assert(!approval.body.includes('private verdict'))
  assert.equal(humanSurface({ ...card, workflowRef: ref }), undefined)
  await assert.rejects(core.createWorkflow({ ...origin, rootCallId: 'review' }, taskRef, { ...ref, digest: 'b'.repeat(64) }, signal), { code: 'human-target-conflict' })
  await core.close(); const restored = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
  assert.equal(restored.forResult(scope.sessionId, 'review', scope.sessionGeneration).workflowRef.digest, ref.digest); await restored.close()
})

test('real DSH registry accepts lifecycle schemas, emits native image and real initial-form metadata, with no approve tool', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const core = await HumanToolsCore.open(memory({ schemaVersion: 1, records: [] }), () => randomBytes(16).toString('hex'))
  const attachment = { attachmentId: 'a'.repeat(64), mediaType: 'image/png', bytes: image.length, width: 1, height: 1 }
  const runtime = { prepareInitial: async () => {}, readImage: async () => ({ image, manifest: { context: { version: 1 }, file: { mediaType: 'image/png' } }, receivedAt: 1 }) }
  const definitions = lifecycleTools({ nodeId: scope.nodeId, lifecycle: runtime, core, assertAgent: exec => assert.equal(exec.agent, agent), saveImage: async bytes => { assert.deepEqual(Buffer.from(bytes), image); return attachment } })
  for (const tool of definitions) { assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema); tools.register(tool) }
  assert(!definitions.some(tool => /approve|install|run_agent/.test(tool.name)))
  t.after(async () => { await core.close(); await ctx.fiber.dispose() })
  const result = await tools.execute({ name: 'human_submission_image', arguments: { taskRef, submissionId: 's'.repeat(24) }, agent, callId: 'image_1', signal })
  assert.equal(result.isError, false); assert.deepEqual(result.content.find(block => block.type === 'image').attachment, attachment)
  const created = await tools.execute({ name: 'human_task_create', arguments: { title: '任务', body: '公开要求', initialRound: initial() }, agent, callId: 'create_1', signal })
  assert.equal(created.isError, false); assert(created.meta.humanSurface.initialRound)
  assert.equal(core.forResult(scope.sessionId, 'create_1', '100').actions[0].id, 'share')
})
