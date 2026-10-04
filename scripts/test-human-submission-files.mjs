import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import nacl from 'tweetnacl'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { humanForm } from '../lib/human-tools/form.js'
import { HUMAN_MEMBER_FORM_SCHEMA } from '../lib/human-workflow/member-form-schema.js'
import { SUBMISSION_FILE_TYPES, SUBMISSION_FILE_MAX, SUBMISSION_RECEIVE_FORMATS, safeSubmissionName } from '../lib/human-workflow/submission-file-contract.js'
import { validateSubmissionFile } from '../lib/human-workflow/submission-file.js'
import { canonicalSubmission, sha512, decryptSubmission, submissionManifest } from '../lib/human-workflow/submission-crypto.js'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { SubmissionReceiver } from '../lib/human-workflow/receiver.js'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { submissionFileTool } from '../lib/human-workflow/submission-file-tools.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_files_fixture', sessionId: 'session_files', sessionGeneration: '100' }
const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'fixture-owner', accountInstance: 'fixture-account', generation: '1' }
const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const docx = SUBMISSION_FILE_TYPES[3], xlsx = SUBMISSION_FILE_TYPES[4], pptx = SUBMISSION_FILE_TYPES[5]
function memory(initial) { let data = structuredClone(initial); return { async load() { return structuredClone(data) }, async save(value) { data = structuredClone(value) } } }
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0 })
function crc32(data) { let c = 0xffffffff; for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function zip(entries, compressed = true) {
  const local = [], central = []; let offset = 0
  for (const [name, content, tweaks = {}] of entries) {
    const n = Buffer.from(name), clear = Buffer.from(content), packed = compressed ? deflateRawSync(clear) : clear, crc = crc32(clear)
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6)
    h.writeUInt16LE(compressed ? 8 : 0, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(clear.length, 22); h.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8)
    c.writeUInt16LE(compressed ? 8 : 0, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(clear.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
    if (tweaks.crc) { c.writeUInt32LE(123, 16); h.writeUInt32LE(123, 14) }
    if (tweaks.encrypted) { c.writeUInt16LE(0x801, 8); h.writeUInt16LE(0x801, 6) }
    if (tweaks.symlink) c.writeUInt32LE(0xa0000000, 38)
    local.push(h, n, packed); central.push(c, n); offset += h.length + n.length + packed.length
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, index, end])
}
function parts(mediaType = docx) {
  const [main, root, type] = mediaType === docx ? ['word/document.xml', 'document', 'wordprocessingml.document']
    : mediaType === xlsx ? ['xl/workbook.xml', 'workbook', 'spreadsheetml.sheet'] : ['ppt/presentation.xml', 'presentation', 'presentationml.presentation']
  return [
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${type}.main+xml"/></Types>`],
    ['_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`],
    [main, `<d:${root} xmlns:d="http://schemas.openxmlformats.org/${type.split('.')[0]}/2006/main"><d:body>Inert fixture content</d:body></d:${root}>`],
  ]
}
function seal(key, bytes = zip(parts()), mediaType = docx, schema = 'human.submission.manifest.v2', edit = () => {}) {
  const context = { schema: 'human.submission.context.v1', bindingKey, taskRef, roundId: 'r'.repeat(24), participantRef: 'p'.repeat(24), submissionId: 's'.repeat(24), version: 1, objectId: 'o'.repeat(24), keyId: key.keyId }
  const manifest = { schema, context, answers: { name: 'fixture' }, file: { mediaType, plainBytes: bytes.length, plainDigest: sha512(bytes), ...(schema.endsWith('.v2') ? { displayName: safeSubmissionName('../../材料.docx', mediaType) } : {}) } }
  edit(manifest)
  const text = Buffer.from(canonicalSubmission(manifest)), clear = Buffer.alloc(4 + text.length + bytes.length); clear.writeUInt32BE(text.length); text.copy(clear, 4); bytes.copy(clear, 4 + text.length)
  const ephemeral = nacl.box.keyPair(), nonce = randomBytes(24), cipher = nacl.box(clear, nonce, Buffer.from(key.publicKey, 'base64'), ephemeral.secretKey)
  const envelope = { schema: 'human.submission.box.v1', keyId: key.keyId, ephemeralPublicKey: Buffer.from(ephemeral.publicKey).toString('base64'), nonce: nonce.toString('base64'), cipherBytes: cipher.length, cipherDigest: sha512(cipher), manifestDigest: sha512(text) }
  return { bytes, cipher, context, manifest, envelope, delivery: { claimId: 'c'.repeat(24), leaseExpiresAt: Date.now() + 120000, submissionId: context.submissionId, version: 1, context, envelope, values: manifest.answers, download: {}, ...(schema.endsWith('.v2') ? { attachment: { kind: 'file', mediaType, plainBytes: bytes.length } } : {}) } }
}
async function fixture(t, bytes, mediaType, schema) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'submission-file-')), root = path.join(directory, 'received'), keyStore = memory()
  const keys = await ReceiverKeyring.open(keyStore, scope.nodeId), key = await keys.ensure(bindingKey, signal), sealed = seal(key, bytes, mediaType, schema)
  const count = { downloads: 0, acks: 0, imageDecodes: 0 }, options = { root, nodeId: scope.nodeId, keys, assertIdentity() {},
    async download() { count.downloads++; return sealed.cipher }, async validateImage(data, type) { count.imageDecodes++; assert.equal(type, 'image/png'); assert.deepEqual(Buffer.from(data), png) },
    async ack(_scope, _task, delivery) { count.acks++; const names = await readdir(root); assert(names.some(n => /^[a-f0-9]{64}$/.test(n)), 'durable folder before ACK')
      return { delivery: { state: 'received', submissionId: delivery.submissionId, version: delivery.version, manifestDigest: delivery.envelope.manifestDigest, cipherDigest: delivery.envelope.cipherDigest } } },
  }
  const receiver = await SubmissionReceiver.open(options)
  t.after(async () => { await receiver.close(); await keys.close(); await rm(directory, { recursive: true, force: true }) })
  return { directory, root, keys, key, keyStore, sealed, receiver, options, count }
}

test('v3 is a generic optional one-file alternative; legacy form wire representation unchanged', () => {
  assertSupportedJsonSchema(HUMAN_MEMBER_FORM_SCHEMA)
  for (const schema of ['human.form.v1', 'human.form.v2', 'human.form.v3']) {
    const form = { schema, fields: [], attachment: { kind: 'image', required: true, maxBytes: 1024, mediaTypes: ['image/png'] } }
    assert.deepEqual(humanForm(form), form)
    form.attachment.kind = 'file'; assert.equal(!!humanForm(form), schema.endsWith('.v3'))
  }
  const v3 = { schema: 'human.form.v3', fields: [{ key: 'day', label: '日期', kind: 'date', required: true }], attachment: { kind: 'file', required: false, maxBytes: SUBMISSION_FILE_MAX, mediaTypes: [...SUBMISSION_FILE_TYPES] }, presentation: { submitLabel: '提交' } }
  assert.deepEqual(humanForm(v3), v3)
  for (const mediaTypes of [[], ['application/msword'], ['image/png', 'image/png'], ['application/zip']]) assert.equal(humanForm({ ...v3, attachment: { ...v3.attachment, mediaTypes } }), undefined)
  assert.equal(humanForm({ ...v3, attachment: { ...v3.attachment, maxBytes: SUBMISSION_FILE_MAX + 1 } }), undefined)
})
test('bounded admission accepts JPEG/PNG, PDF, UTF8 TXT/CSV and distinct DOCX/XLSX/PPTX containers', () => {
  validateSubmissionFile(png, 'image/png'); validateSubmissionFile(Buffer.from([255, 216, 255, 217]), 'image/jpeg')
  validateSubmissionFile(Buffer.from('%PDF-1.7\nfixture\n%%EOF\n'), 'application/pdf')
  validateSubmissionFile(Buffer.from('中文文本\n'), 'text/plain'); validateSubmissionFile(Buffer.from('name,value\nfixture,=1+1\n'), 'text/csv')
  for (const mime of [docx, xlsx, pptx]) { validateSubmissionFile(zip(parts(mime)), mime); validateSubmissionFile(zip(parts(mime), false), mime) }
  for (const [bytes, mime] of [[Buffer.from('not pdf'), 'application/pdf'], [Buffer.from([0xff]), 'text/plain'], [Buffer.from('bad\u0000text'), 'text/csv'], [zip(parts()), xlsx]])
    assert.throws(() => validateSubmissionFile(bytes, mime))
})
test('Office rejects malformed, bomb, active, encrypted, traversal, duplicate and disguised archives', () => {
  for (const extra of [['../escape.txt', 'x'], ['/absolute.txt', 'x'], ['word/../escape.txt', 'x'], ['word/vbaProject.bin', 'x'], ['word/embeddings/data.bin', 'x'], ['word/activeX/a.bin', 'x'], ['run.ps1', 'x'], ['word/document.xml', 'duplicate'], ['part.bin', 'x', { crc: true }], ['part.bin', 'x', { encrypted: true }], ['part.bin', 'x', { symlink: true }], ['bomb.bin', Buffer.alloc(1024 * 1024)]])
    assert.throws(() => validateSubmissionFile(zip([...parts(), extra]), docx), { code: 'submission-file-invalid' })
  const changes = [
    p => { p[2][1] = '<!DOCTYPE document [<!ENTITY leak SYSTEM "file:///secret">]><document/>' },
    p => { p[0][1] = p[0][1].replace('wordprocessingml.document.main+xml', 'macroEnabled.main+xml') },
    p => { p[0][1] = p[0][1].replace('PartName="/word/document.xml"', 'PartName="/word/other.xml"') },
    p => { p[1][1] = p[1][1].replace('Target="word/document.xml"', 'Target="https://bad.example/" TargetMode="External"') },
    p => { p[2][1] = '<workbook>wrong root</workbook>' },
    p => { p[2][1] = p[2][1].replace('</d:document>', '</d:workbook>') },
    p => { p[2][1] = p[2][1].replace('</d:document>', '') },
    p => { p[2][1] = p[2][1].replace('wordprocessingml/2006/main', 'arbitrary-namespace') },
    p => { p[2][1] = p[2][1].replace('Inert fixture content', '&external_entity;') },
  ]
  for (const edit of changes) { const p = parts(); edit(p); assert.throws(() => validateSubmissionFile(zip(p), docx)) }
  const truncated = zip(parts()).subarray(0, 100); assert.throws(() => validateSubmissionFile(truncated, docx))
})
test('v2 manifest authenticates context, answers, sanitized encrypted name, MIME, size and digest', async t => {
  const f = await fixture(t), s = f.sealed, secret = f.keys.secret(f.key.keyId, bindingKey)
  assert.deepEqual(Buffer.from(decryptSubmission(s.cipher, s.envelope, secret, s.context, s.manifest.answers).data), s.bytes)
  assert(!Buffer.from(s.cipher).includes(Buffer.from('材料.docx')))
  assert.equal(safeSubmissionName('C:\\secret\\bad\u202ename?.docx', docx), 'bad_name_.docx')
  for (const edit of [m => { m.file.displayName = '../bad.docx' }, m => { m.file.mediaType = 'application/msword' }, m => { m.file.plainBytes++ }, m => { m.file.plainDigest = '0'.repeat(128) }]) {
    const malformed = seal(f.key, s.bytes, docx, 'human.submission.manifest.v2', edit)
    assert.throws(() => decryptSubmission(malformed.cipher, malformed.envelope, secret, malformed.context, malformed.manifest.answers))
  }
  assert.throws(() => decryptSubmission(s.cipher, s.envelope, secret, { ...s.context, version: 2 }, s.manifest.answers), { code: 'submission-context-invalid' })
  assert.throws(() => decryptSubmission(s.cipher, s.envelope, secret, s.context, { name: 'replacement' }), { code: 'submission-context-invalid' })
  assert.throws(() => submissionManifest({ ...s.manifest, schema: 'human.submission.manifest.v1' }))
})
test('file delivery declaration must exactly match v2; malformed file is never ACKed', async t => {
  const f = await fixture(t)
  for (const attachment of [undefined, { kind: 'file', mediaType: 'image/png', plainBytes: f.sealed.bytes.length }, { ...f.sealed.delivery.attachment, plainBytes: 1 }, { ...f.sealed.delivery.attachment, extra: true }])
    await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, { ...f.sealed.delivery, attachment }, signal), { code: 'receiver-file-mismatch' })
  assert.equal(f.count.acks, 0); assert.deepEqual(await readdir(f.root), [])
  const malicious = seal(f.key, zip([...parts(), ['../bad', 'x']]))
  Object.assign(f.sealed, malicious)
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, malicious.delivery, signal), { code: 'submission-file-invalid' }); assert.equal(f.count.acks, 0)
})
test('document persists before ACK, survives restart/lost ACK, exports only fixed inert path and refuses tampered plaintext', async t => {
  const f = await fixture(t), acknowledge = f.options.ack; let lost = true
  f.options.ack = async (...args) => { const answer = await acknowledge(...args); if (lost) { lost = false; throw new Error('lost ACK') }; return answer }
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)); assert.equal(f.count.downloads, 1)
  await f.receiver.close(); const restored = await SubmissionReceiver.open(f.options)
  try {
    await restored.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal); assert.equal(f.count.downloads, 1); assert.equal(f.count.acks, 2); assert.equal(f.count.imageDecodes, 0)
    const exported = await restored.exportFile(scope, f.sealed.context.submissionId, bindingKey, signal)
    assert.equal(path.basename(exported.path), 'original.docx'); assert.equal(exported.displayName, '材料.docx'); assert(exported.path.startsWith(f.root + path.sep))
    assert.deepEqual(await readFile(exported.path), f.sealed.bytes)
    await assert.rejects(restored.exportFile({ ...scope, sessionGeneration: '200' }, f.sealed.context.submissionId, bindingKey, signal), { code: 'submission-not-received' })
    await writeFile(exported.path, 'changed'); await assert.rejects(restored.exportFile(scope, f.sealed.context.submissionId, bindingKey, signal), { code: 'receiver-file-invalid' })
  } finally { await restored.close() }
})
test('file receipt-only renewal recovers delivery without another download and revalidates ciphertext', async t => {
  const f = await fixture(t), acknowledge = f.options.ack
  f.options.ack = async () => { throw new Error('offline') }
  await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)); f.options.ack = acknowledge
  let claims = 0
  const claim = async proof => { claims++; return { delivery: { state: 'receipt-only', submissionId: f.sealed.context.submissionId, version: 1,
    ...proof, leaseExpiresAt: Date.now() + 10000 } } }
  assert.equal(await f.receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, claim, signal), true)
  assert.equal(f.count.downloads, 1); assert.equal(claims, 1)
  const names = await readdir(f.root), file = path.join(f.root, names[0], 'payload.box'); await writeFile(file, Buffer.alloc(f.sealed.cipher.length))
  await assert.rejects(f.receiver.recoverReceipt(scope, taskRef, bindingKey, f.sealed.context.submissionId, 1, claim, signal)); assert.equal(claims, 1)
})
test('v2 image keeps full native decoder and v1 legacy image remains readable', async t => {
  for (const schema of ['human.submission.manifest.v1', 'human.submission.manifest.v2']) {
    const f = await fixture(t, png, 'image/png', schema)
    await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
    await f.receiver.read(scope, f.sealed.context.submissionId, bindingKey, signal); assert.equal(f.count.imageDecodes, 2)
    f.options.validateImage = async () => { throw new Error('native decoder rejects') }
    await assert.rejects(f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)); assert.equal(f.count.acks, 1)
  }
})
test('lifecycle capability negotiation, file/image routing, fresh scope and automatic analysis guard', async t => {
  const f = await fixture(t); await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
  const calls = [], item = { id: f.sealed.context.submissionId, version: 1, roundId: f.sealed.context.roundId, participantRef: f.sealed.context.participantRef, state: 'accepted', delivery: 'received', acceptedAt: 1, values: f.sealed.manifest.answers }
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(route, value) {
    calls.push([route, value])
    if (route === 'sync') { assert.deepEqual(value, { mode: 'binding' }); return { schema: 'human.workflow.binding.v1', binding, bindingKey, asOf: 1 } }
    if (route === 'receiver-key') return { binding, bindingKey, key: value.key, receiveFormats: value.receiveFormats }
    return { taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration }, binding, bindingKey, revision: 1, asOf: 1, rounds: [], submissions: [item], drafts: [], participants: [], nextOffset: null }
  } }
  const lifecycle = await WorkflowLifecycle.open({ transport, receiver: f.receiver, keys: f.keys, store: memory() }); t.after(() => lifecycle.close())
  await lifecycle.prepareInitial(signal, true, true); assert.deepEqual(calls.find(([route]) => route === 'receiver-key')[1].receiveFormats, SUBMISSION_RECEIVE_FORMATS)
  await assert.rejects(lifecycle.readImage(scope, taskRef, item.id, signal), { code: 'submission-not-image' })
  await assert.rejects(lifecycle.readyAutomation(scope, taskRef, item, signal), { code: 'automation-document-reading-unavailable' })
  const tool = submissionFileTool({ nodeId: scope.nodeId, lifecycle, assertAgent() {} }); assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema)
  const agent = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }, exec = { agent, signal }
  const result = await tool.execute({ taskRef, submissionId: item.id }, exec); assert.equal(result.state, 'received-not-reviewed'); assert.equal(result.mediaType, docx)
  assert.deepEqual(result.taskRef, taskRef); assert.equal(result.roundId, f.sealed.context.roundId)
  assert.equal(result.participantRef, f.sealed.context.participantRef); assert.equal(result.submissionVersion, f.sealed.context.version)
  assert.equal(result.manifest, undefined); assert.equal(result.bindingKey, undefined); assert.equal(result.trust, 'untrusted-participant-file')
  await assert.rejects(tool.execute({ taskRef, submissionId: item.id, path: 'C:/arbitrary' }, exec))
  const old = await WorkflowLifecycle.open({ transport: { ...transport, async request(route, value) { const reply = await transport.request(route, value); delete reply.receiveFormats; return reply } }, receiver: f.receiver, keys: f.keys, store: memory() }); t.after(() => old.close())
  await old.prepareInitial(signal, true)
  await assert.rejects(old.prepareInitial(signal, true, true), { code: 'receiver-file-unavailable' })
})

test('real sync passes receiveFormats into claim and commits document before delivery acknowledgement', async t => {
  const f = await fixture(t), disk = memory(), routes = []
  const item = { id: f.sealed.context.submissionId, version: 1, roundId: f.sealed.context.roundId, state: 'accepted', delivery: 'pending', acceptedAt: 1, values: f.sealed.manifest.answers }
  const ack = f.options.ack
  f.options.ack = async (...args) => { const result = await ack(...args); item.delivery = 'received'; return result }
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(route, value) {
    routes.push(route)
    if (route === 'receiver-key') { assert.deepEqual(value.receiveFormats, SUBMISSION_RECEIVE_FORMATS); return { binding, bindingKey, key: value.key, receiveFormats: value.receiveFormats } }
    if (route === 'objects/claim') { assert.deepEqual(value.receiveFormats, SUBMISSION_RECEIVE_FORMATS); return { delivery: f.sealed.delivery } }
    return { taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration }, binding, bindingKey, revision: 1, asOf: 1, rounds: [], submissions: [item], drafts: [], participants: [], nextOffset: null }
  } }
  const settings = { transport, receiver: f.receiver, keys: f.keys, store: disk }, lifecycle = await WorkflowLifecycle.open(settings); t.after(() => lifecycle.close())
  const tasks = [{ taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration }, lifecycleRevision: 1 }]
  await lifecycle.synced(binding, tasks, signal); await lifecycle.synced(binding, tasks, signal)
  assert.equal(item.delivery, 'received'); assert.equal(f.count.downloads, 1); assert.equal(f.count.acks, 1)
  assert.equal((await lifecycle.receiptStatus(scope, taskRef, signal)).items[0].state, 'received')
  await lifecycle.close(); const restored = await WorkflowLifecycle.open(settings); t.after(() => restored.close())
  assert.equal((await restored.receiptStatus(scope, taskRef, signal)).items[0].state, 'received'); assert.equal(f.count.downloads, 1)
})

test('fresh attachment read and file export refuse changed participant, round, answers or resubmission version', async t => {
  const f = await fixture(t, png, 'image/png', 'human.submission.manifest.v2')
  await f.receiver.receive(scope, taskRef, bindingKey, f.sealed.delivery, signal)
  const original = { id: f.sealed.context.submissionId, version: 1, roundId: f.sealed.context.roundId,
    participantRef: f.sealed.context.participantRef, state: 'accepted', delivery: 'received', acceptedAt: 1, values: f.sealed.manifest.answers }
  let item = structuredClone(original)
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(route, value) {
    if (route === 'receiver-key') return { binding, bindingKey, key: value.key, receiveFormats: value.receiveFormats }
    return { taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration }, binding, bindingKey,
      revision: 1, asOf: 1, rounds: [], submissions: [item], drafts: [], participants: [], nextOffset: null }
  } }
  const lifecycle = await WorkflowLifecycle.open({ transport, receiver: f.receiver, keys: f.keys, store: memory() }); t.after(() => lifecycle.close())
  for (const method of ['readImage', 'exportFile']) {
    item = structuredClone(original)
    const result = await lifecycle[method](scope, taskRef, original.id, signal)
    assert.equal(result.manifest.context.participantRef, original.participantRef)
    for (const change of [{ participantRef: 'x'.repeat(24) }, { roundId: 'y'.repeat(24) }, { values: { name: '不同的人' } },
      { values: null }, { version: 2 }, { id: 'z'.repeat(24) }]) {
      item = { ...structuredClone(original), ...change }
      await assert.rejects(lifecycle[method](scope, taskRef, original.id, signal), { code: 'submission-unavailable' })
    }
  }
})

test('file tool withholds late path after session replacement or cancellation', async () => {
  const agent = { id: scope.sessionId, session: { id: scope.sessionId, header: { id: scope.sessionId, createdAt: 100 } } }
  const tool = submissionFileTool({ nodeId: scope.nodeId, assertAgent() {}, lifecycle: { async exportFile() { agent.session.header.createdAt = 200; return {} } } })
  await assert.rejects(tool.execute({ taskRef, submissionId: 's'.repeat(24) }, { agent, signal }), { code: 'workflow-scope-invalid' })
  const abort = new AbortController(), cancelled = submissionFileTool({ nodeId: scope.nodeId, assertAgent() {}, lifecycle: { async exportFile() { abort.abort(); return {} } } })
  await assert.rejects(cancelled.execute({ taskRef, submissionId: 's'.repeat(24) }, { agent, signal: abort.signal }), { name: 'AbortError' })
})
