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
import { canonicalSubmission, sha256, sha512, decryptSubmission, submissionAnswers } from '../lib/human-workflow/submission-crypto.js'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { humanSurface } from '../lib/human-tools/protocol.js'
import { humanForm, humanInitialRound } from '../lib/human-tools/form.js'
import { HUMAN_FORM_MAX_BYTES, HUMAN_ROUND_MAX_BYTES, HUMAN_SURFACE_MAX_BYTES } from '../lib/human-tools/capacity.js'
import { HumanFileStore } from '../lib/human-tools/store.js'
import { humanDate, humanTime } from '../lib/human-tools/form-v2.js'

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

async function bindingFixture(t, { change, afterRequest } = {}) {
  const keyStore = memory(), ledger = memory(), requests = [], keys = await ReceiverKeyring.open(keyStore, scope.nodeId)
  let current = binding, denied = false
  const transport = { nodeId: scope.nodeId, assertIdentity() { if (denied) throw Object.assign(new Error('binding revoked'), { code: 'binding_revoked' }) },
    async request(route, input) {
      requests.push(structuredClone({ route, input }))
      if (route === 'sync') {
        assert.deepEqual(input, { mode: 'binding' }, 'preflight must never allocate a snapshot or borrow event facts')
        const result = { schema: 'human.workflow.binding.v1', binding: current, bindingKey: receiverBinding(current, scope.nodeId).bindingKey, asOf: 100 }
        change?.(result); afterRequest?.(); return result
      }
      assert.equal(route, 'receiver-key')
      return { binding: current, bindingKey: receiverBinding(current, scope.nodeId).bindingKey, key: input.key }
    } }
  const lifecycle = await WorkflowLifecycle.open({ transport, keys, store: ledger })
  t.after(async () => { await lifecycle.close(); await keys.close() })
  return { lifecycle, requests, keyStore, ledger, set binding(value) { current = value }, revoke() { denied = true } }
}

test('new task preflight reads fresh binding each time without allocating any snapshot slots', async t => {
  const f = await bindingFixture(t)
  for (let n = 0; n < 8; n++) await f.lifecycle.prepareInitial(signal, false)
  assert.equal(f.requests.filter(item => item.route === 'sync').length, 8)
  assert.equal(f.requests.filter(item => item.route === 'receiver-key').length, 1)
  assert.equal(f.keyStore.writes, 1); assert.equal(f.ledger.writes, 0)
  assert.equal(f.lifecycle.available, true)
})

test('new task preflight observes binding/account replacement and never falls back to a previously authorized binding', async t => {
  const f = await bindingFixture(t)
  await f.lifecycle.prepareInitial(signal, false)
  f.binding = { ...binding, ownerSubject: 'new-owner', accountInstance: 'new-account', generation: 'new-generation' }
  await f.lifecycle.prepareInitial(signal, false)
  const registrations = f.requests.filter(item => item.route === 'receiver-key')
  assert.equal(registrations.length, 2); assert.notEqual(registrations[0].input.key.keyId, registrations[1].input.key.keyId)
  assert.equal(f.keyStore.value.keys.length, 2, 'retain old receipt keys without reusing their authority')
  const before = f.requests.length; f.revoke()
  await assert.rejects(f.lifecycle.prepareInitial(signal, false), { code: 'binding_revoked' })
  assert.equal(f.requests.length, before); assert.equal(f.keyStore.writes, 2)
})

test('binding-only preflight rejects malformed or old snapshot responses before key creation', async t => {
  for (const change of [value => { value.schema = 'human.workflow.sync.v1' }, value => { value.bindingKey = '0'.repeat(64) },
    value => { value.asOf = '100' }, value => { delete value.asOf }, value => { value.binding = { ...binding, nodeId: 'foreign-node' } }]) {
    const f = await bindingFixture(t, { change })
    await assert.rejects(f.lifecycle.prepareInitial(signal, false), { code: 'lifecycle-binding-invalid' })
    assert.equal(f.keyStore.writes, 0); assert.equal(f.requests.length, 1); assert.equal(f.lifecycle.available, false)
  }
})

test('binding-only preflight rechecks current identity and cancellation after the fresh response before key writes', async t => {
  let revoke
  const changed = await bindingFixture(t, { afterRequest: () => revoke() }); revoke = () => changed.revoke()
  await assert.rejects(changed.lifecycle.prepareInitial(signal, false), { code: 'binding_revoked' })
  assert.equal(changed.keyStore.writes, 0); assert.equal(changed.requests.length, 1)
  const abort = new AbortController(), cancelled = await bindingFixture(t, { afterRequest: () => abort.abort() })
  await assert.rejects(cancelled.lifecycle.prepareInitial(abort.signal, false), { name: 'AbortError' })
  assert.equal(cancelled.keyStore.writes, 0); assert.equal(cancelled.requests.length, 1)
  const missing = await bindingFixture(t)
  await assert.rejects(missing.lifecycle.prepareInitial(signal, true), { code: 'receiver-unavailable' })
  assert.equal(missing.requests.length, 0)
})
function seal(key, changes = {}, answers = { name: '甲' }) {
  const context = { schema: 'human.submission.context.v1', bindingKey, taskRef, roundId: 'r'.repeat(24), participantRef: 'p'.repeat(24), submissionId: 's'.repeat(24), version: 1, objectId: 'o'.repeat(24), keyId: key.keyId, ...changes }
  const manifest = { schema: 'human.submission.manifest.v1', context, answers, file: { mediaType: 'image/png', plainBytes: image.length, plainDigest: sha512(image) } }
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

test('invalid document receipt blocks durably without repeated download or false delivery and is not a blind retry', async t => {
  const disk = memory(), entry = { id: 's'.repeat(24), roundId: 'r'.repeat(24), state: 'accepted', delivery: 'pending', version: 1, values: {} }
  const f = await lifecycleFixture(t, { store: disk, page: { submissions: [entry], nextOffset: null }, onReceive() {
    throw Object.assign(new Error('untrusted detail must not escape'), { code: 'submission-file-invalid' })
  } })
  await f.runtime.synced(binding, [f.tasks[0]], signal); await f.runtime.synced(binding, [f.tasks[0]], signal)
  assert.equal(f.claims.length, 1)
  const status = await f.runtime.receiptStatus(scope, taskRef, signal)
  assert.equal(status.items[0].state, 'blocked'); assert.equal(status.items[0].retryable, false)
  assert.match(status.items[0].message, /未确认送达/); assert(!JSON.stringify(status).includes('untrusted detail'))
  await assert.rejects(f.runtime.retryReceipt(scope, taskRef, { submissionId: entry.id, submissionVersion: 1, expectedRevision: status.items[0].revision }, signal), { code: 'receipt-version-conflict' })
  await f.runtime.close(); const restored = await WorkflowLifecycle.open(f.settings); t.after(() => restored.close())
  await restored.synced(binding, [f.tasks[0]], signal); assert.equal(f.claims.length, 1)
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

test('published reminder plans expose real delivery facts without routing secrets, including old-server unknown', async t => {
  const content = { roundId: 'r'.repeat(24), participantRefs: ['p'.repeat(24)], title: '请交资料', condition: 'pending-submission' }
  const ref = { schema: 'human.lifecycle.draft.ref.v1', draftId: 'a'.repeat(24), kind: 'reminder', version: 1,
    digest: sha256(canonicalSubmission({ taskRef, kind: 'reminder', expectedRevision: 1, content })) }
  const draft = { draftRef: ref, taskRef, expectedRevision: 1, content, expiresAt: Date.now() + 60000, state: 'published',
    context: { taskTitle: '项目资料', roundTitle: '补充资料' },
    result: { operationId: 'o'.repeat(24), taskId: taskRef.taskId, deliveryId: taskRef.deliveryId, route: { roomid: 'never-to-model' } } }
  const page = { drafts: [draft], submissions: [], nextOffset: null }, f = await lifecycleFixture(t, { page })
  const effects = async () => (await f.runtime.query(scope, taskRef, signal)).drafts[0].effects
  assert.equal((await effects()).notificationState, 'unknown')
  for (const [phase, outcome, reason, expected] of [
    ['prepared', null, null, 'not-started'], ['invoked', null, null, 'pending'],
    ['settled', 'failed', null, 'failed'], ['settled', 'cancelled', null, 'cancelled'],
    ['settled', 'unknown', null, 'unknown'], ['settled', 'success', null, 'succeeded'],
    ['settled', 'cancelled', 'no_pending_members', 'not-needed'],
  ]) {
    draft.execution = { operationId: 'o'.repeat(24), phase, outcome, reason }
    assert.equal((await effects()).notificationState, expected)
    assert.equal((await effects()).groupCardState, 'not-sent-by-this-action')
    assert(!JSON.stringify(await f.runtime.query(scope, taskRef, signal)).includes('never-to-model'))
  }
  draft.execution.operationId = 'foreign-operation'
  await assert.rejects(effects(), { code: 'lifecycle-response-invalid' })
  delete draft.execution; draft.context.submissionCreatedAt = -1
  await assert.rejects(effects(), { code: 'lifecycle-response-invalid' })
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

test('optional attachments and first native member selection preserve old snapshots without guessed participant IDs', () => {
  const old = initial()
  assert.deepEqual(humanInitialRound(old), old)
  assert.equal(Object.hasOwn(humanInitialRound(old), 'audience'), false, 'legacy digests must not gain a new default field')
  const selected = { ...initial(), audience: 'owner-select' }
  selected.form.attachment.required = false
  assert.deepEqual(humanInitialRound(selected), selected)
  assert.deepEqual(humanInitialRound({ ...initial(), audience: 'all-group' }), { ...initial(), audience: 'all-group' })
  assert.equal(humanInitialRound({ ...selected, recipientRefs: ['guessed-native-id'] }), undefined)
  for (const audience of ['everyone', '', null, 1]) assert.equal(humanInitialRound({ ...initial(), audience }), undefined)
  for (const required of ['false', null, 0]) {
    const candidate = form(); candidate.attachment.required = required
    assert.equal(humanForm(candidate), undefined)
  }
})

test('real DSH registry accepts lifecycle schemas, emits native image and real initial-form metadata, with no approve tool', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const core = await HumanToolsCore.open(memory({ schemaVersion: 1, records: [] }), () => randomBytes(16).toString('hex'))
  const attachment = { attachmentId: 'a'.repeat(64), mediaType: 'image/png', bytes: image.length, width: 1, height: 1 }
  const imageSource = { taskRef, roundId: 'r'.repeat(24), participantRef: 'p'.repeat(24), submissionId: 's'.repeat(24), version: 1 }
  const runtime = { prepareInitial: async () => {}, readImage: async () => ({ image, manifest: { context: imageSource, file: { mediaType: 'image/png' } }, receivedAt: 1 }) }
  const definitions = lifecycleTools({ nodeId: scope.nodeId, lifecycle: runtime, core, assertAgent: exec => assert.equal(exec.agent, agent), saveImage: async bytes => { assert.deepEqual(Buffer.from(bytes), image); return attachment } })
  for (const tool of definitions) { assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema); tools.register(tool) }
  assert(!definitions.some(tool => /approve|install|run_agent/.test(tool.name)))
  t.after(async () => { await core.close(); await ctx.fiber.dispose() })
  const result = await tools.execute({ name: 'human_submission_image', arguments: { taskRef, submissionId: 's'.repeat(24) }, agent, callId: 'image_1', signal })
  assert.equal(result.isError, false); assert.deepEqual(result.content.find(block => block.type === 'image').attachment, attachment)
  const imageText = result.content.find(block => block.type === 'text').text
  assert(imageText.includes(JSON.stringify({ ...imageSource, receivedAt: 1 }))); assert(!imageText.includes('group_openid'))
  const created = await tools.execute({ name: 'human_task_create', arguments: { title: '任务', body: '公开要求', initialRound: initial() }, agent, callId: 'create_1', signal })
  assert.equal(created.isError, false); assert(created.meta.humanSurface.initialRound)
  assert.equal(core.forResult(scope.sessionId, 'create_1', '100').actions[0].id, 'share')
  const selected = initial(); selected.audience = 'owner-select'; selected.form.attachment.required = false
  const selective = await tools.execute({ name: 'human_task_create', arguments: { title: '指定参与者', body: '主人选群后通过原生选择器选人', initialRound: selected }, agent, callId: 'create_selected', signal })
  assert.equal(selective.isError, false)
  assert.equal(selective.meta.humanSurface.initialRound.audience, 'owner-select')
  assert.equal(selective.meta.humanSurface.initialRound.form.attachment.required, false)
  assert.equal(selective.meta.humanSurface.initialRound.recipientRefs, null)
  const customized = await tools.execute({ name: 'human_task_create', arguments: { title: '项目排期', body: '选择分工及参与时间',
    initialRound: { ...initial(), form: customizedForm() } }, agent, callId: 'create_customized', signal })
  assert.equal(customized.isError, false, JSON.stringify(customized))
  assert.deepEqual(customized.meta.humanSurface.initialRound.form, customizedForm())
})

test('cards formerly over 12000 bytes now survive creation, durable reload and exact source grant', async () => {
  const origin = { scope: scope.sessionId, generation: scope.sessionGeneration, callId: 'large', rootCallId: 'large' }
  const round = { ...initial(), instructions: 'a'.repeat(2000), form: { schema: 'human.form.v1', attachment: null,
    fields: Array.from({ length: 4 }, (_, n) => ({ key: 'f' + n, label: '选项', kind: 'choice', required: false,
      choices: Array.from({ length: 10 }, (_, i) => '文'.repeat(70) + i) })) } }
  assert(humanInitialRound(round), 'individual round is valid')
  const store = memory({ schemaVersion: 1, records: [] })
  const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
  const large = await core.createCollection(origin, '任务', '字'.repeat(1000), round, signal)
  assert.equal(store.writes, 1)
  assert(Buffer.byteLength(JSON.stringify(large)) > 12000)
  assert(Buffer.byteLength(JSON.stringify(large)) <= HUMAN_SURFACE_MAX_BYTES)
  await core.close()
  const legacy = store.value
  assert(humanSurface(legacy.records[0].surface), 'historical data is still parseable')
  const old = await HumanToolsCore.open(memory(legacy), () => randomBytes(16).toString('hex'))
  assert(old.forResult(scope.sessionId, 'large', scope.sessionGeneration))
  const action = { scope: scope.sessionId, surfaceId: large.id, revision: 1, actionId: 'share', attemptId: 'attempt_large_123456' }
  await old.claim(action, signal)
  assert.deepEqual(old.grantSource(action).surface, large)
  await old.create({ ...origin, callId: 'normal', rootCallId: 'normal' }, '正常任务', '不影响其他卡', signal)
  await old.close()
})

function wideForm() {
  return { schema: 'human.form.v1', attachment: null, fields: Array.from({ length: 12 }, (_, field) => ({
    key: 'f' + field, label: '字段'.repeat(40), kind: 'choice', required: false,
    choices: Array.from({ length: 20 }, (_, option) => '文'.repeat(78) + String(option).padStart(2, '0')),
  })) }
}
function budgetForm(bytes) {
  const comparisons = Array.from({ length: 14 }, () => ({ op: 'eq', field: 'source', value: '' }))
  const value = { schema: 'human.form.v1', attachment: null, fields: [
    { key: 'source', label: '条件来源', kind: 'long-text', required: false, maxLength: 2000 },
    { key: 'target', label: '目标', kind: 'boolean', required: false, when: { op: 'all', items: [
      { op: 'all', items: comparisons.slice(0, 7) }, { op: 'all', items: comparisons.slice(7) },
    ] } },
  ] }
  let remaining = bytes - Buffer.byteLength(JSON.stringify(value))
  for (const comparison of comparisons) {
    const count = Math.min(remaining, 6000), full = Math.floor(count / 3)
    comparison.value = '文'.repeat(full) + 'a'.repeat(count % 3)
    remaining -= count
  }
  assert.equal(remaining, 0); assert.equal(Buffer.byteLength(JSON.stringify(value)), bytes)
  return value
}

test('form byte boundary is inclusive, UTF-8 aware, and invalid oversized cards do not write', async () => {
  assert(humanForm(budgetForm(HUMAN_FORM_MAX_BYTES)))
  assert.equal(humanForm(budgetForm(HUMAN_FORM_MAX_BYTES + 1)), undefined)
  const store = memory({ schemaVersion: 1, records: [] })
  const core = await HumanToolsCore.open(store, () => randomBytes(16).toString('hex'))
  try {
    const origin = { scope: scope.sessionId, generation: scope.sessionGeneration, callId: 'boundary', rootCallId: 'boundary' }
    await assert.rejects(core.createCollection(origin, '任务', '说明', { ...initial(), form: budgetForm(HUMAN_FORM_MAX_BYTES + 1) }, signal))
    assert.equal(store.writes, 0)
    const round = { ...initial(), instructions: '文'.repeat(2000), form: budgetForm(HUMAN_FORM_MAX_BYTES) }
    assert(Buffer.byteLength(JSON.stringify(round)) < HUMAN_ROUND_MAX_BYTES)
    const surface = await core.createCollection(origin, '题'.repeat(80), '字'.repeat(1000), round, signal)
    assert(Buffer.byteLength(JSON.stringify(surface)) < HUMAN_SURFACE_MAX_BYTES)
  } finally { await core.close() }
})

test('wide Chinese forms fit without truncation and multiple large cards survive the file ledger', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'human-card-capacity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const filename = path.join(directory, 'cards.json')
  const round = { ...initial(), form: wideForm(), instructions: '说'.repeat(2000) }
  assert(humanForm(round.form)); assert(humanInitialRound(round))
  const core = await HumanToolsCore.open(new HumanFileStore(filename), () => randomBytes(16).toString('hex'))
  let last
  try {
    for (let index = 0; index < 18; index++) last = await core.createCollection({ scope: scope.sessionId,
      generation: scope.sessionGeneration, callId: 'wide_' + index, rootCallId: 'wide_' + index }, '题'.repeat(80), '字'.repeat(1000), round, signal)
  } finally { await core.close() }
  assert((await readFile(filename)).length > 1024 * 1024, 'former ledger ceiling would have rejected these valid cards')
  const reopened = await HumanToolsCore.open(new HumanFileStore(filename), () => randomBytes(16).toString('hex'))
  try { assert.deepEqual(reopened.forResult(scope.sessionId, 'wide_17', scope.sessionGeneration), last) }
  finally { await reopened.close() }
})

function customizedForm() {
  return { schema: 'human.form.v2', attachment: null, fields: [
    { key: 'roles', label: '可承担的工作', kind: 'multi-choice', required: true, choices: ['设计', '审核', '实施'], minSelected: 1, maxSelected: 2,
      section: '参与安排', description: '可以选择一项或两项' },
    { key: 'day', label: '参与日期', kind: 'date', required: true, start: '2026-10-03', end: '2026-12-31' },
    { key: 'at', label: '参与时间', kind: 'time', required: false, start: '09:00', end: '18:30' },
    { key: 'notes', label: '实施说明', kind: 'long-text', required: true, maxLength: 2000, when: { op: 'contains', field: 'roles', value: '实施' } },
  ], presentation: { theme: 'green', icon: 'briefcase', layout: 'compact', submitLabel: '提交安排', completionText: '已登记，请等待后续安排', blocks: [
    { type: 'paragraph', text: '请填写你本人的安排。' }, { type: 'list', items: ['日期只表示日历日期', '填写内容仅按本任务权限查看'] },
    { type: 'notice', tone: 'info', text: '提交不等于负责人已批准。' },
  ] } }
}

test('v2 forms compose native fields and presentation without changing v1 or granting execution', () => {
  assert.deepEqual(humanForm(customizedForm()), customizedForm())
  const legacy = { ...customizedForm(), schema: 'human.form.v1' }
  assert.equal(humanForm(legacy), undefined)
  for (const mutate of [
    x => { x.presentation.url = 'https://example.com' },
    x => { x.presentation.css = 'position:fixed' },
    x => { x.presentation.blocks[0].type = 'html' },
    x => { x.presentation.blocks[2].tone = 'execute' },
    x => { x.presentation.theme = '#00ff00' },
    x => { x.fields[0].maxSelected = 0 },
    x => { x.fields[0].minSelected = 3 },
    x => { x.fields[0].choices.push('设计') },
    x => { x.fields[1].start = '2026-02-30' },
    x => { x.fields[1].start = '2027-01-01' },
    x => { x.fields[2].end = '24:00' },
    x => { x.fields[3].when.op = 'eq' },
    x => { x.fields[3].when.value = '不存在' },
    x => { x.fields[0].when = { op: 'contains', field: 'roles', value: '设计' } },
  ]) {
    const candidate = customizedForm(); mutate(candidate)
    assert.equal(humanForm(candidate), undefined, JSON.stringify(candidate))
  }
  for (const value of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) assert(humanDate(value))
  for (const value of ['0000-01-01', '1900-02-29', '2026-02-29', '2026-04-31', '2026-1-01', '2026-01-01Z', '2026-01-01\n']) assert(!humanDate(value))
  for (const value of ['00:00', '23:59']) assert(humanTime(value))
  for (const value of ['24:00', '09:60', '9:00', '09:00Z', '09:30\n']) assert(!humanTime(value))
})

test('multi-choice answers survive authenticated image envelope and reject nested/unbounded values', async () => {
  const keys = await ReceiverKeyring.open(memory(), scope.nodeId)
  try {
    const key = await keys.ensure(bindingKey, signal), answers = { roles: ['设计', '审核'], date: '2026-10-03', at: '09:00' }
    const sealed = seal(key, {}, answers)
    assert.deepEqual(decryptSubmission(sealed.cipher, sealed.envelope, keys.secret(key.keyId, bindingKey), sealed.context, answers).manifest.answers, answers)
    assert.throws(() => decryptSubmission(sealed.cipher, sealed.envelope, keys.secret(key.keyId, bindingKey), sealed.context, { ...answers, roles: ['实施'] }))
    for (const roles of [['设计', '设计'], ['x'.repeat(81)], [[1]], [{ role: '设计' }], Array.from({ length: 21 }, (_, index) => String(index))]) {
      assert.throws(() => submissionAnswers({ roles }))
    }
    assert.deepEqual(submissionAnswers({ roles: [] }), { roles: [] })
  } finally { await keys.close() }
})
