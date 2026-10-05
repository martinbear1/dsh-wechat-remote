import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash, verify } from 'node:crypto'
import { WorkflowReplica, REPLICA_MAX_BYTES, WORKFLOW_DRAFT_TTL_MS, WORKFLOW_SOURCE_GRANT_TTL_MS } from '../lib/human-workflow/replica.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { mkdtemp, unlink, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WorkflowHttpTransport, workflowErrorMessage } from '../lib/human-workflow/transport.js'
import { HUMAN_CARD_REQUEST_MAX_BYTES, HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES } from '../lib/human-tools/capacity.js'
import { registerHumanWorkflowSkill, HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'

const nodeId = 'n'.repeat(32), now = 200000, signal = () => new AbortController().signal
const binding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: 'owner', accountInstance: 'account-v1', generation: 'binding-v1' }
const scope = { nodeId, sessionId: 's1', sessionGeneration: '10' }
const task = (id, sessionId = 's1', generation = '10') => ({ kind: 'task', key: id, value: { taskRef: { schema: 'human.task.ref.v1', taskId: id, deliveryId: `d-${id}` },
  origin: { scope: sessionId, sessionGeneration: generation }, binding, revision: 1, title: id } })
const participant = (id, member, role = 'participant') => ({ kind: 'participant', key: `${id}:${member}`, value: { taskRef: task(id).value.taskRef, participantRef: member, role } })
const snap = (records, extra = {}) => ({ schema: 'human.workflow.sync.v1', mode: 'snapshot', binding, snapshotId: 'snap-one', cursor: 4, watermark: 4,
  records, nextOffset: null, hasMore: false, asOf: now, expiresAt: now + 300000, ...extra })
const events = (list = [], extra = {}) => ({ schema: 'human.workflow.sync.v1', mode: 'events', binding, cursor: 4, watermark: 4, events: list, hasMore: false, asOf: now, ...extra })
const store = () => ({ data: undefined, writes: [], async load() { return structuredClone(this.data) }, async save(value) { this.data = structuredClone(value); this.writes.push(this.data) } })
function transport(pages) { return { nodeId, assertIdentity() {}, async request(op, body) { assert.equal(op, 'sync'); const response = pages.shift(); if (response instanceof Error) throw response; return response ?? events() } } }

test('startup discovers first offline-published task from an empty ledger after restart and continues the standard timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = now, calls = 0
  const tick = async ms => { clock += ms; t.mock.timers.tick(ms); await new Promise(resolve => setImmediate(resolve)) }
  const disk = store(), original = await WorkflowReplica.open(disk, transport([]), () => clock)
  original.discover(); await original.close() // Exit before first task reaches the local ledger.
  assert.equal(disk.data, undefined)
  const client = { nodeId, assertIdentity() {}, async request(op, input) {
    calls++; assert.equal(op, 'sync')
    return input.mode === 'snapshot' ? snap([{ ...task('first'), value: { ...task('first').value, lifecycleRevision: 1 } }]) : events([], { asOf: clock })
  } }
  const recovered = await WorkflowReplica.open(disk, client, () => clock), delivered = []
  recovered.onSynchronized((_binding, tasks) => delivered.push(tasks))
  t.after(() => recovered.close())
  recovered.start(); recovered.start()
  await tick(1000)
  assert.equal(calls, 1); assert.equal(delivered[0][0].lifecycleRevision, 1)
  assert.equal(disk.data.records[0].value.taskRef.taskId, 'first')
  await tick(30_000); assert.equal(calls, 2, 'discovered tasks continue the standard existing timer')
  await recovered.close(); recovered.start(); await tick(120_000)
  assert.equal(calls, 2, 'disposed instance cannot restart or access the backend')
})

test('startup discovery is bounded for absent backend and stops immediately when unpaired or revoked', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = now
  const tick = async ms => { clock += ms; t.mock.timers.tick(ms); await new Promise(resolve => setImmediate(resolve)) }
  for (const code of ['workflow-unavailable', 'binding_revoked']) {
    let calls = 0
    const disk = store(), replica = await WorkflowReplica.open(disk, { nodeId, assertIdentity() {}, async request(op) {
      assert.equal(op, 'sync'); calls++; throw Object.assign(new Error('controlled unavailable'), { code })
    } }, () => clock)
    replica.start(); replica.start()
    await tick(1000); await tick(60_000); await tick(120_000); await tick(120_000); await tick(3600_000)
    assert.equal(calls, code === 'binding_revoked' ? 1 : 3)
    replica.start(); await tick(3600_000)
    assert.equal(calls, code === 'binding_revoked' ? 1 : 3, 'duplicate start cannot renew discovery forever')
    if (code === 'binding_revoked') assert.deepEqual(disk.data.records, [])
    await replica.close()
  }
})

test('startup fences identity changes and unload aborts pending discovery without publishing stale tasks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, valid = true, clock = now
  const tick = async ms => { clock += ms; t.mock.timers.tick(ms); await new Promise(resolve => setImmediate(resolve)) }
  const disk = store(), stale = await WorkflowReplica.open(disk, { nodeId,
    assertIdentity() { if (!valid) throw Object.assign(new Error('changed identity'), { code: 'binding_revoked' }) },
    async request() { calls++; return snap([task('stale')]) } }, () => clock)
  stale.start(); valid = false; await tick(1000); await tick(120_000)
  assert.equal(calls, 0); assert.deepEqual(disk.data.records, []); await stale.close()
  let pendingSignal, released, published = 0
  const pending = await WorkflowReplica.open(store(), { nodeId, assertIdentity() {}, async request(_op, _body, active) {
    calls++; pendingSignal = active
    await new Promise(resolve => { released = resolve })
    return snap([task('late')], { expiresAt: clock + 60_000 })
  } }, () => clock)
  pending.onSynchronized(() => published++)
  pending.start(); await tick(1000)
  let closed = false
  const closing = pending.close().then(() => { closed = true })
  assert.equal(pendingSignal.aborted, true); assert.equal(closed, false)
  released(); await closing
  assert.equal(published, 0); await tick(3600_000); assert.equal(calls, 1)
})

test('grant intent survives restart and a first publication after five minutes but inside the full grant-plus-draft horizon', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = now, published = false, calls = 0
  const deadline = now + WORKFLOW_SOURCE_GRANT_TTL_MS + WORKFLOW_DRAFT_TTL_MS
  const tick = async ms => { clock += ms; t.mock.timers.tick(ms); await new Promise(resolve => setImmediate(resolve)) }
  const disk = store(), before = await WorkflowReplica.open(disk, transport([]), () => clock)
  await before.keepDiscovering(deadline, signal()); await before.close()
  assert.equal(disk.data.discoveryUntil, deadline); assert.deepEqual(disk.data.records, [])
  const client = { nodeId, assertIdentity() {}, async request(_op, input) {
    calls++
    if (input.mode === 'snapshot') return snap([], { asOf: clock, expiresAt: clock + 300000 })
    return published ? events([{ schema: 'human.workflow.event.v1', eventId: 'published-late', cursor: 5, aggregateVersion: 1, record: task('late') }],
      { cursor: 5, watermark: 5, asOf: clock }) : events([], { asOf: clock })
  } }
  const after = await WorkflowReplica.open(disk, client, () => clock), observed = []
  t.after(() => after.close()); after.onSynchronized((_binding, tasks) => observed.push(tasks)); after.start()
  await tick(1000); await tick(6 * 60_000)
  assert.equal(calls, 2, 'empty snapshot does not discard intent when the initial short window expires')
  assert.equal(disk.data.discoveryUntil, deadline)
  published = true; await tick(30_000)
  assert.equal(calls, 3); assert.equal(observed.at(-1)[0].taskRef.taskId, 'late')
})

test('expired intent keeps one backed-off timer across long outage and restart until a complete server-time confirmation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = now, calls = 0, online = false, serverTime = now
  const deadline = now + WORKFLOW_SOURCE_GRANT_TTL_MS + WORKFLOW_DRAFT_TTL_MS
  const tick = async ms => { clock += ms; t.mock.timers.tick(ms); await new Promise(resolve => setImmediate(resolve)) }
  const disk = store(), client = { nodeId, assertIdentity() {}, async request(_op, input) {
    calls++; if (!online) throw Error('offline')
    return input.mode === 'snapshot' ? snap([], { asOf: serverTime, expiresAt: clock + 300000 }) : events([], { asOf: serverTime })
  } }
  let replica = await WorkflowReplica.open(disk, client, () => clock)
  t.after(() => replica.close())
  await replica.keepDiscovering(deadline, signal()); replica.start(); await tick(1000)
  await tick(60_000); await tick(120_000); await tick(2 * 3600_000)
  assert.equal(calls, 4, 'long downtime never replays a burst of missed ticks')
  assert.equal(disk.data.discoveryUntil, deadline)
  await replica.close(); replica = await WorkflowReplica.open(disk, client, () => clock); replica.start()
  await tick(1000); assert.equal(calls, 5)
  online = true; serverTime = deadline - 1; await tick(60_000)
  assert.equal(disk.data.discoveryUntil, deadline, 'local wall-clock expiry is not authoritative absence')
  serverTime = deadline + 1; await tick(30_000)
  assert.equal(disk.data.discoveryUntil, undefined)
  await tick(6 * 60_000); const settledCalls = calls; await tick(3600_000)
  assert.equal(calls, settledCalls, 'confirmed empty state becomes quiescent after its finite startup window')
})

test('partial event scans and snapshot rebuild failures cannot retire persisted discovery intent', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const deadline = now + 1000, disk = store(), rebuild = Object.assign(Error('rebuild'), { code: 'snapshot_required' })
  const pages = [snap([], { asOf: now }), events([{ schema: 'human.workflow.event.v1', eventId: 'e5', cursor: 5,
    aggregateVersion: 1, record: task('in-progress') }], { asOf: deadline + 1, cursor: 5, watermark: 6, hasMore: true }), Error('page two offline'),
    rebuild, Error('snapshot offline'), snap([], { asOf: deadline + 2 })]
  const replica = await WorkflowReplica.open(disk, transport(pages), () => now)
  t.after(() => replica.close())
  await replica.keepDiscovering(deadline, signal()); await replica.refresh(signal())
  await assert.rejects(replica.refresh(signal()), /page two/)
  assert.equal(disk.data.asOf, deadline + 1); assert.equal(disk.data.discoveryUntil, deadline)
  await assert.rejects(replica.refresh(signal()), /snapshot offline/)
  assert.equal(disk.data.binding, null); assert.equal(disk.data.discoveryUntil, deadline)
  await replica.refresh(signal()); assert.equal(disk.data.discoveryUntil, undefined)
})

test('discovery remains backward compatible, coalesces deadlines and clears on revocation or binding replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const disk = store(), revoked = Object.assign(Error('revoked'), { code: 'binding_revoked' })
  disk.data = { schema: 'human.replica.v1', nodeId, binding: null, cursor: 0, asOf: 0, records: [] }
  const replica = await WorkflowReplica.open(disk, transport([snap([]), revoked]), () => now)
  await replica.keepDiscovering(now + 2000, signal()); const writes = disk.writes.length
  await replica.keepDiscovering(now + 1000, signal()); assert.equal(disk.writes.length, writes)
  await replica.refresh(signal()); await assert.rejects(replica.refresh(signal()), /revoked/)
  assert.equal(disk.data.discoveryUntil, undefined); assert.equal(disk.data.binding, null); await replica.close()
  const newer = { ...binding, generation: 'new-binding' }, again = await WorkflowReplica.open(disk,
    transport([snap([]), events([], { binding: newer }), snap([], { binding: newer })]), () => now)
  await again.keepDiscovering(now + 2000, signal()); await again.refresh(signal()); await again.refresh(signal())
  assert.equal(disk.data.discoveryUntil, undefined); assert.equal(disk.data.binding.generation, newer.generation); await again.close()
  disk.data.discoveryUntil = 'not-a-time'
  await assert.rejects(WorkflowReplica.open(disk, transport([]), () => now), { code: 'workflow-store-invalid' })
})

test('pending discovery writes are drained on unload, but cancellation/identity change cannot return usable consent', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let release, entered, valid = true
  const reached = new Promise(resolve => { entered = resolve }), disk = store(), save = disk.save.bind(disk)
  disk.save = async value => { entered(); await new Promise(resolve => { release = resolve }); await save(value) }
  const replica = await WorkflowReplica.open(disk, { nodeId, assertIdentity() { if (!valid) throw Object.assign(Error('revoked'), { code: 'binding_revoked' }) } }, () => now)
  const write = replica.keepDiscovering(now + 1000, signal())
  await reached; let closed = false; const closing = replica.close().then(() => { closed = true })
  assert.equal(closed, false); valid = false; release()
  await assert.rejects(write); await closing
  assert.equal(disk.data.discoveryUntil, now + 1000)
  await assert.rejects(replica.keepDiscovering(now + 2000, signal()))
})
test('snapshot commit is atomic across pages; task queries isolate sessions/generation/node and owner counts', async () => {
  const disk = store(), client = transport([snap([task('t1'), task('t2', 'other')], { hasMore: true, nextOffset: 2 }),
    snap([task('t3', 's1', 'old'), participant('t1', 'member'), participant('t1', 'owner', 'owner')])])
  const replica = await WorkflowReplica.open(disk, client, () => now)
  const result = await replica.query(scope, {}, signal())
  assert.deepEqual(result.records.map(r => r.title), ['t1']); assert.equal(disk.writes.length, 1)
  const members = await replica.query(scope, { taskId: 't1', participants: true }, signal())
  assert.deepEqual(members.records.map(r => r.participantRef), ['member']); assert.equal(members.expectedCount, null)
  await assert.rejects(replica.query({ ...scope, nodeId: 'other' }, {}, signal()), /节点/)
  await replica.close()
})
test('partial snapshot failure never makes partial facts visible; restart recovers committed cursor', async () => {
  const disk = store(), replica = await WorkflowReplica.open(disk, transport([snap([task('t1')], { hasMore: true, nextOffset: 1 }), new Error('offline')]), () => now)
  await assert.rejects(replica.query(scope, {}, signal()), /offline/); assert.equal(disk.data, undefined); await replica.close()
  const recovered = await WorkflowReplica.open(disk, transport([snap([task('t1')])]), () => now)
  await recovered.refresh(signal()); assert.equal(disk.data.cursor, 4); await recovered.close()
  const reload = await WorkflowReplica.open(disk, transport([events()]), () => now)
  assert.equal((await reload.query(scope, {}, signal())).records.length, 1); await reload.close()
})
test('event facts and cursor save together; network errors return marked stale data', async () => {
  const disk = store(), event = { schema: 'human.workflow.event.v1', eventId: 'e5', cursor: 5, aggregateVersion: 1, record: task('t2') }
  const replica = await WorkflowReplica.open(disk, transport([snap([task('t1')]), events([event], { cursor: 5, watermark: 5 }), new Error('offline')]), () => now)
  await replica.refresh(signal()); await replica.refresh(signal()); assert.equal(disk.data.cursor, 5); assert.equal(disk.data.records.length, 2)
  const stale = await replica.query(scope, {}, signal()); assert.equal(stale.freshness.fresh, false); assert.equal(stale.records.length, 2)
  await replica.close()
})
test('revoked binding clears cache before rejecting and new generation starts fresh snapshot', async () => {
  const disk = store(), revoked = Object.assign(new Error('revoked'), { code: 'binding_revoked' })
  const replica = await WorkflowReplica.open(disk, transport([snap([task('t1')]), revoked]), () => now)
  await replica.refresh(signal()); await assert.rejects(replica.query(scope, {}, signal()), /revoked/)
  assert.equal(disk.data.binding, null); assert.deepEqual(disk.data.records, []); await replica.close()
  const nextBinding = { ...binding, generation: 'binding-v2' }, next = await WorkflowReplica.open(disk,
    transport([snap([{ ...task('new'), value: { ...task('new').value, binding: nextBinding } }], { binding: nextBinding })]), () => now)
  assert.equal((await next.query(scope, {}, signal())).records[0].title, 'new'); await next.close()
})
test('snapshot mix, malformed page and disk write failure fail closed', async () => {
  const disk = store(), replica = await WorkflowReplica.open(disk, transport([snap([task('t1')], { hasMore: true, nextOffset: 1 }), snap([], { snapshotId: 'different' })]), () => now)
  await assert.rejects(replica.query(scope, {}, signal()), /分页中变化/); assert.equal(disk.data, undefined); await replica.close()
  const badStore = { async load() {}, async save() { throw Error('disk full') } }, stopped = await WorkflowReplica.open(badStore, transport([snap([task('t1')])]), () => now)
  await assert.rejects(stopped.query(scope, {}, signal())); await assert.rejects(stopped.query(scope, {}, signal())); await stopped.close()
})
test('authenticated references require current task revision in exact session', async () => {
  const disk = store(), replica = await WorkflowReplica.open(disk, transport([snap([task('t1')])]), () => now)
  assert.throws(() => replica.validateReferences(scope, [{ kind: 'task', id: 't1', version: 1 }]))
  await replica.refresh(signal()); replica.validateReferences(scope, [{ kind: 'task', id: 't1', version: 1 }])
  assert.throws(() => replica.validateReferences({ ...scope, sessionId: 'other' }, [{ kind: 'task', id: 't1', version: 1 }]))
  assert.throws(() => replica.validateReferences(scope, [{ kind: 'task', id: 't1', version: 2 }]))
  assert.throws(() => replica.validateReferences(scope, [{ kind: 'submission', id: 't1', version: 1 }]))
  await replica.close()
})
test('legal snapshots exceeding the small mode-ledger limit persist and query with bounded pages', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-capacity-')), filename = path.join(dir, 'facts.json')
  const rows = Array.from({ length: 700 }, (_, i) => ({ ...task(`t-${i}`), value: { ...task(`t-${i}`).value, body: '中'.repeat(1000) } }))
  const pages = Array.from({ length: 7 }, (_, index) => snap(rows.slice(index * 100, (index + 1) * 100),
    { hasMore: index < 6, nextOffset: index < 6 ? (index + 1) * 100 : null }))
  const disk = new WorkflowFileStore(filename, REPLICA_MAX_BYTES), replica = await WorkflowReplica.open(disk, transport(pages), () => now)
  try {
    const result = await replica.query(scope, { limit: 50 }, signal())
    assert((await stat(filename)).size > 2 * 1024 * 1024)
    assert(Buffer.byteLength(JSON.stringify(result)) <= 32 * 1024)
    assert(result.nextOffset > 0 && result.nextOffset < 50)
    await replica.close()
    const recovered = await WorkflowReplica.open(disk, transport([events()]), () => now)
    const next = await recovered.query(scope, { offset: result.nextOffset, limit: 50 }, signal())
    assert.notEqual(next.records[0].taskRef.taskId, result.records[0].taskRef.taskId)
    await recovered.close()
  } finally { await replica.close(); await unlink(filename).catch(() => {}); await rmdir(dir) }
})
test('transport uses exact-body v2 proof, fixed audience/path and refuses insecure origins/identity changes', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId: 'n'.repeat(32), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }) }
  let current = identity, calls = 0
  const client = new WorkflowHttpTransport('https://relay.example', () => current, async (url, options) => {
    calls++; assert.equal(url, 'https://relay.example/api/human-tasks/v1/node/grant'); assert.equal(options.redirect, 'error')
    assert.equal(JSON.parse(options.body).audience, 'human.workflow.node.v1')
    const h = options.headers, message = `agent-http-v2\nPOST\n/api/human-tasks/v1/node/grant\n${identity.nodeId}\n${h['x-hr-timestamp']}\n${h['x-hr-nonce']}\n${createHash('sha256').update(options.body).digest('hex')}`
    assert.equal(verify(null, Buffer.from(message), pair.publicKey, Buffer.from(h['x-hr-signature'], 'base64url')), true)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  await client.request('grant', { test: 1 }, signal()); assert.equal(calls, 1)
  for (const bad of ['http://relay.example', 'https://user@relay.example', 'https://relay.example/other']) assert.throws(() => new WorkflowHttpTransport(bad, () => identity))
  current = { ...identity, nodeId: 'other' }; await assert.rejects(client.request('grant', {}, signal()), /身份已变化/); assert.equal(calls, 1)
})
test('transport sanitizes server errors and bounds response body', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  const revoked = new WorkflowHttpTransport('https://relay.example', () => identity, async () => new Response(JSON.stringify({ error: { code: 'node_not_authorized', message: 'secret-content' } }), { status: 403 }))
  await assert.rejects(revoked.request('sync', {}, signal()), e => e.code === 'binding_revoked' && !e.message.includes('secret-content'))
  const oversized = new WorkflowHttpTransport('https://relay.example', () => identity, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)))
  await assert.rejects(oversized.request('sync', {}, signal()), /过大/)
})

test('large card transport budgets include envelopes and do not loosen unrelated endpoints', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  let calls = 0
  const client = new WorkflowHttpTransport('https://relay.example', () => identity, async (_url, options) => {
    calls++; assert(Buffer.byteLength(options.body) <= HUMAN_CARD_REQUEST_MAX_BYTES)
    return new Response('{"ok":true}')
  })
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ data: '', audience: 'human.workflow.node.v1' }))
  const exact = { data: 'a'.repeat(HUMAN_CARD_REQUEST_MAX_BYTES - envelopeBytes) }
  for (const operation of ['grant', 'lifecycle']) {
    await client.request(operation, exact, signal())
    const before = calls
    await assert.rejects(client.request(operation, { data: exact.data + 'a' }, signal()), { code: 'workflow-request-invalid' })
    assert.equal(calls, before, 'oversized requests never leave the node')
  }
  await assert.rejects(client.request('sync', { data: 'a'.repeat(16384) }, signal()), { code: 'workflow-request-invalid' })
  const aggregate = new WorkflowHttpTransport('https://relay.example', () => identity, async () => new Response(JSON.stringify({ data: 'a'.repeat(3 * 1024 * 1024) })))
  assert.equal((await aggregate.request('lifecycle', {}, signal())).data.length, 3 * 1024 * 1024)
  await assert.rejects(aggregate.request('sync', {}, signal()), { code: 'workflow-response-invalid' })
  const excessive = new WorkflowHttpTransport('https://relay.example', () => identity, async () => new Response('x'.repeat(HUMAN_LIFECYCLE_RESPONSE_MAX_BYTES + 1)))
  await assert.rejects(excessive.request('lifecycle', {}, signal()), { code: 'workflow-response-invalid' })
})

test('attachment quota and ticket errors expose only safe fixed messages and never masquerade as revocation', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  for (const [code, status] of [['download_ticket_expired', 409], ['attachment_download_quota', 429], ['usage_ledger_capacity', 429], ['metering_unavailable', 503]]) {
    const client = new WorkflowHttpTransport('https://relay.example', () => identity, async () => new Response(JSON.stringify({ error: { code, message: 'secret C:/private/token', balance: 'private' } }), { status }))
    await assert.rejects(client.request('objects/claim', {}, signal()), cause => cause.code === code && cause.code !== 'binding_revoked'
      && !/secret|private|token/.test(cause.message) && cause.message !== '群任务服务暂不可用')
  }
})

test('stale reminder conditions and invalid form errors remain actionable, safe and distinct from service outages', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  for (const [code, fragment] of [['recipients_changed', /提醒条件/], ['invalid_lifecycle', /参数结构/], ['invalid_form', /表单参数/], ['receiver_format_unsupported', /接收电脑/],
    ['lifecycle_conflict', /任务状态已更新/], ['draft_expired', /已过期/], ['draft_changed', /原版本不一致/], ['future_business_error', /操作未完成/]]) {
    let attempts = 0
    const client = new WorkflowHttpTransport('https://relay.example', () => identity, async () => {
      attempts++; return new Response(JSON.stringify({ error: { code, message: 'private-user-content-or-token' } }), { status: 409 })
    })
    await assert.rejects(client.request('lifecycle', {}, signal()), error => {
      assert.equal(error.code, code); assert.equal(error.status, 409); assert.match(error.message, fragment)
      assert(!error.message.includes('private-user-content-or-token')); assert.notEqual(error.message, '群任务服务暂不可用'); return true
    })
    assert.equal(attempts, 1, 'no widening, recipient change, retry, or form downgrade')
  }
})

test('unknown or malformed server codes stay neutral while known transport failures keep their precise meaning', async () => {
  const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  for (const code of [null, {}, 'C:/private/token', 'bad\nmessage', 'x'.repeat(81)]) {
    const client = new WorkflowHttpTransport('https://relay.example', () => identity, async () =>
      new Response(JSON.stringify({ error: { code, message: 'private-user-content-or-token' } }), { status: 400 }))
    await assert.rejects(client.request('lifecycle', {}, signal()), error => {
      assert.equal(error.code, 'workflow-request-failed'); assert.match(error.message, /^操作未完成/)
      assert(!/private|token|bad\nmessage/.test(error.message)); return true
    })
  }
  assert.match(workflowErrorMessage('workflow-unavailable'), /服务暂不可用/)
  assert.match(workflowErrorMessage('workflow-network-unavailable'), /网络连接暂不可用/)
  assert.match(workflowErrorMessage('workflow-timeout'), /请求超时/)
  assert.match(workflowErrorMessage('unknown'), /^操作未完成/)
})
test('empty or HTML authentication failures clear the replica instead of returning stale facts', async () => {
  for (const body of [null, 'Forbidden']) for (const status of [401, 403]) {
    const pair = generateKeyPairSync('ed25519'), identity = { nodeId, privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
    const disk = store(); let calls = 0
    const client = new WorkflowHttpTransport('https://relay.example', () => identity, async () => ++calls === 1
      ? new Response(JSON.stringify(snap([task('t1')]))) : new Response(body, { status }))
    const replica = await WorkflowReplica.open(disk, client, () => now)
    await replica.refresh(signal())
    await assert.rejects(replica.query(scope, {}, signal()), e => e.code === 'binding_revoked')
    assert.deepEqual(disk.data.records, []); assert.equal(disk.data.binding, null); await replica.close()
  }
})
test('packaged workflow skill uses the native catalog, cleans up and does not pretend to create native presets', async () => {
  const ctx = new Context(), skills = new SkillRegistry(ctx)
  const dispose = registerHumanWorkflowSkill(ctx)
  assert.equal(typeof dispose, 'function')
  const found = await skills.get(HUMAN_WORKFLOW_SKILL.name)
  assert(found.content.includes('不是创建 DSH preset 的接口'))
  assert(found.content.includes('扁平参数 id、version、digest、values'))
  assert.equal(found.invocation.modelInvocable, true)
  dispose(); assert.equal(await skills.get(HUMAN_WORKFLOW_SKILL.name), undefined)
  assert.equal(registerHumanWorkflowSkill({ get() { return undefined } }), undefined)
})
