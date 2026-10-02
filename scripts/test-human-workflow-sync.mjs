import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash, verify } from 'node:crypto'
import { WorkflowReplica, REPLICA_MAX_BYTES } from '../lib/human-workflow/replica.js'
import { WorkflowFileStore } from '../lib/human-workflow/persistence.js'
import { mkdtemp, unlink, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WorkflowHttpTransport } from '../lib/human-workflow/transport.js'
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
