import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, rename } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceDirectory } from '../lib/human-workflow/workspace-directory.js'
import { workspaceTools } from '../lib/human-workflow/workspace-tools.js'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'

const signal = new AbortController().signal
const nodeId = 'workspace_node_1234567890'
const A = { nodeId, sessionId: 'source-session', sessionGeneration: '100' }
const B = { nodeId, sessionId: 'colleague-session', sessionGeneration: '200' }
const C = { nodeId, sessionId: 'other-workspace-session', sessionGeneration: '300' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 'T'.repeat(24), deliveryId: 'D'.repeat(24) }
const surfaceId = 'a'.repeat(32), groupRef = hash('group'), snapshot = 'b'.repeat(64)
function hash(s) { return createHash('sha256').update(s).digest('base64url') }
function memory() { let data, writes = 0; return { async load() { return structuredClone(data) }, async save(v) { data = structuredClone(v); writes++ },
  get data() { return structuredClone(data) }, get writes() { return writes }, set data(v) { data = structuredClone(v) } } }
function member(index) {
  const ref = ('member_' + index + '_').padEnd(28, 'x')
  return { identity: { schema: 'human.member.identity.v1', groupRef, memberRef: hash('member:' + index) },
    recipientRef: { schema: 'human.recipient.ref.v1', taskId: taskRef.taskId, deliveryId: taskRef.deliveryId, source: 'selection', ref, revision: 1 },
    participantRef: null, sources: ['selection'], observedAt: null, confirmedAt: null, identityVerifiedAt: null, canTarget: true,
    unavailableReason: null, submissionFacts: null }
}
async function fixture(t, count = 25) {
  const root = await mkdtemp(path.join(tmpdir(), 'human-workspace-test-')), one = path.join(root, 'one'), two = path.join(root, 'two')
  await mkdir(one); await mkdir(two)
  let directory, binding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: 'owner', accountInstance: 'account', generation: 'binding-generation' }
  t.after(async () => { await directory?.close(); assert.equal(path.dirname(root), path.resolve(tmpdir())); assert(path.basename(root).startsWith('human-workspace-test-')); await rm(root, { recursive: true, force: true }) })
  const headers = new Map([[A.sessionId, { id: A.sessionId, createdAt: 100, cwd: one }], [B.sessionId, { id: B.sessionId, createdAt: 200, cwd: one }], [C.sessionId, { id: C.sessionId, createdAt: 300, cwd: two }]])
  const archived = [], registrations = new Map(), requests = [], store = memory()
  let mutate, calls = 0, failRegister = false, offline = false
  const host = { async header(id) { return structuredClone(headers.get(id)) }, archived: () => archived,
    workspaces: () => [{ id: 'workspace-one', path: one, sessionIds: [A.sessionId, B.sessionId] }, { id: 'workspace-two', path: two, sessionIds: [C.sessionId] }] }
  const transport = { nodeId, assertIdentity() { if (offline) throw Object.assign(Error('revoked'), { code: 'binding_revoked' }) },
    async request(operation, body) {
      this.assertIdentity(); requests.push({ operation, body: structuredClone(body) }); calls++
      const bind = receiverBinding(binding, nodeId), common = { binding: structuredClone(binding), bindingKey: bind.bindingKey }
      if (operation === 'sync') { assert.deepEqual(body, { mode: 'binding' }); return { schema: 'human.workflow.binding.v1', ...common, asOf: 1000 } }
      const key = (scope, generation) => `${bind.bindingKey}:${scope}:${generation}`
      if (operation === 'workspace' && body.operation === 'register-session') {
        if (failRegister) throw Object.assign(Error('cloud not upgraded'), { code: 'workspace-unavailable' })
        const previous = registrations.get(key(body.scope, body.sessionGeneration))
        if (previous && previous !== body.workspaceRef.ref) throw Object.assign(Error('different workspace'), { code: 'workspace-conflict' })
        registrations.set(key(body.scope, body.sessionGeneration), body.workspaceRef.ref)
        return { schema: 'human.workspace.registration.v1', ...common, workspaceRef: body.workspaceRef, scope: body.scope, sessionGeneration: body.sessionGeneration, registeredAt: 1000 }
      }
      const current = registrations.get(key(body.scope, body.sessionGeneration)), original = registrations.get(key(A.sessionId, A.sessionGeneration))
      assert(current && current === original && current === body.workspaceRef?.ref, 'cloud requires BOTH registered sessions under the current binding')
      assert.deepEqual(body.taskRef, taskRef)
      const origin = { scope: A.sessionId, sessionGeneration: A.sessionGeneration }
      if (operation === 'workspace' && body.operation === 'task-identity') return { schema: 'human.workspace.task.identity.v1', ...common,
        taskRef, origin, workspaceRef: body.workspaceRef, groupRef, asOf: 1000 }
      if (operation === 'lifecycle' && body.operation === 'recipients') {
        if (body.offset > 0) assert.equal(body.snapshot, snapshot)
        const result = { schema: 'human.recipient.facts.v1', ...common, origin, taskRef, roundId: null, revision: 1, asOf: 1000, snapshot,
          nextOffset: body.offset + 20 < count ? body.offset + 20 : null,
          coverage: { kind: 'known-task-members', completeGroupRoster: false, totalKnown: count, roundScoped: false, excludedOwner: true },
          recipients: Array.from({ length: count }, (_, i) => member(i)).slice(body.offset, body.offset + 20) }
        return mutate ? mutate(result) : result
      }
      throw Error('unexpected operation ' + operation)
    } }
  const options = { transport, host, published(scope, id) { assert.deepEqual(scope, A); assert.equal(id, surfaceId); return { origin: A, taskRef, title: '团队资料收集' } }, now: () => 1200 }
  directory = await WorkspaceDirectory.open(store, options)
  return { get directory() { return directory }, store, headers, archived, transport, requests, one, two, root, host,
    async reload() { await directory.close(); directory = await WorkspaceDirectory.open(store, options) },
    rotate() { binding = { ...binding, accountInstance: 'different-account' } }, revoke() { offline = true },
    mutate(value) { mutate = value }, unsupported() { failRegister = true }, get calls() { return calls },
    sync: () => directory.sync(A, { sourceSurfaceId: surfaceId, expectedRevision: 0 }, signal) }
}

test('explicit workspace sources survive restart and share known identities/Agent notes, not credentials or full roster', async t => {
  const f = await fixture(t)
  assert.equal(f.store.writes, 0, 'mounting and capability discovery do not bootstrap a shared record')
  const empty = await f.directory.query(B, {}, signal); assert.deepEqual(empty.groups, []); assert.equal(f.store.writes, 0)
  const source = await f.sync(); assert.equal(source.knownMembers, 25); assert.equal(source.completeGroupRoster, false)
  const groups = await f.directory.query(B, {}, signal); assert.equal(groups.groups.length, 1); assert.equal(groups.groups[0].groupRef, groupRef)
  const first = await f.directory.query(B, { workspaceSourceId: source.workspaceSourceId }, signal)
  assert.equal(first.members.length, 20); assert.equal(first.nextOffset, 20); assert.equal(first.cached, true)
  const second = await f.directory.query(B, { groupRef, offset: 20 }, signal); assert.equal(second.members.length, 5)
  assert.equal(first.members[0].observations[0].recipient.participantRef, null, 'selected people need not open before sharing')
  assert.equal(first.members[0].observations[0].recipient.observedAt, null)
  const input = { groupRef, memberRef: member(0).identity.memberRef, expectedRevision: 0,
    value: { displayName: '业务联系人', aliases: ['用户确认称呼'], notes: '来自用户口头说明：项目联络人；不是原生身份认证。' } }
  const note = await f.directory.note(B, input, signal)
  assert.equal(note.verifiedIdentity, false); assert.equal(note.revision, 1)
  await f.reload()
  const after = await f.directory.query(A, { groupRef }, signal)
  assert.equal(after.members[0].note.value.displayName, '业务联系人')
  const access = await f.directory.resolveSource(B, source.workspaceSourceId, signal)
  assert.deepEqual(access.taskRef, taskRef); assert.deepEqual(access.sourceScope, A)
  const json = JSON.stringify(after)
  for (const forbidden of [f.one, f.two, 'ownerSubject', 'accountInstance', 'bindingKey', 'workspaceRef', 'source-session', 'secret', 'roomid', 'group_openid']) assert(!json.includes(forbidden), forbidden)
})

test('workspace, binding, source generation, moved/deleted/archived sessions are checked freshly and fail closed', async t => {
  const f = await fixture(t), source = await f.sync()
  assert.deepEqual((await f.directory.query(C, {}, signal)).groups, [])
  await assert.rejects(f.directory.resolveSource(C, source.workspaceSourceId, signal), { code: 'workspace-source-unavailable' })
  f.archived.push(A.sessionId)
  await assert.rejects(f.directory.resolveSource(B, source.workspaceSourceId, signal), { code: 'workspace-source-unavailable' })
  f.archived.length = 0
  f.headers.get(A.sessionId).createdAt = 101
  await assert.rejects(f.directory.resolveSource(B, source.workspaceSourceId, signal), { code: 'workspace-source-unavailable' })
  f.headers.get(A.sessionId).createdAt = 100; f.headers.get(A.sessionId).cwd = f.two
  await assert.rejects(f.directory.resolveSource(B, source.workspaceSourceId, signal))
  f.headers.delete(A.sessionId)
  await assert.rejects(f.directory.resolveSource(B, source.workspaceSourceId, signal), { code: 'workspace-source-unavailable' })
  f.headers.set(A.sessionId, { id: A.sessionId, createdAt: 100, cwd: f.one })
  f.rotate()
  assert.deepEqual((await f.directory.query(B, {}, signal)).groups, [])
  await assert.rejects(f.directory.resolveSource(B, source.workspaceSourceId, signal), { code: 'workspace-source-unavailable' })
  f.revoke(); await assert.rejects(f.directory.query(B, {}, signal), { code: 'binding_revoked' })
})

test('source refresh and name correction use CAS, tombstones survive and fabricated people/parameters reject', async t => {
  const f = await fixture(t), source = await f.sync()
  const refresh = { workspaceSourceId: source.workspaceSourceId, expectedRevision: 1 }
  const result = await Promise.allSettled([f.directory.sync(B, refresh, signal), f.directory.sync(B, refresh, signal)])
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(result.find(r => r.status === 'rejected').reason.code, 'workspace-version-conflict')
  const input = { groupRef, memberRef: null, expectedRevision: 0, value: { displayName: '用户确认群名', aliases: [], notes: '' } }
  const notes = await Promise.allSettled([f.directory.note(A, input, signal), f.directory.note(B, input, signal)])
  assert.equal(notes.filter(r => r.status === 'fulfilled').length, 1)
  await f.directory.note(B, { ...input, expectedRevision: 1, value: null }, signal)
  await assert.rejects(f.directory.note(A, input, signal), { code: 'workspace-version-conflict' })
  await f.reload(); assert.deepEqual((await f.directory.query(B, {}, signal)).groups[0].note.value, null)
  await assert.rejects(f.directory.note(A, { ...input, memberRef: hash('invented') }, signal), { code: 'workspace-member-unavailable' })
  await assert.rejects(f.directory.sync(A, { sourceSurfaceId: surfaceId, workspaceSourceId: source.workspaceSourceId, expectedRevision: 0 }, signal), { code: 'workspace-input-invalid' })
  for (const input of [{ cwd: f.one }, { workspaceRef: hash('fake') }, { scope: A.sessionId }, { groupRef, workspaceSourceId: source.workspaceSourceId }])
    await assert.rejects(f.directory.query(B, input, signal), { code: 'workspace-input-invalid' })
})

test('snapshot changes and forged group/member facts never partially overwrite the shared directory', async t => {
  const f = await fixture(t), source = await f.sync(), baseline = f.store.data
  for (const mutate of [r => ({ ...r, snapshot: r.recipients[0]?.recipientRef.ref.includes('member_20') ? 'c'.repeat(64) : r.snapshot }),
    r => ({ ...r, recipients: r.recipients.map(m => ({ ...m, identity: { ...m.identity, groupRef: hash('other-group') } })) }),
    r => ({ ...r, origin: { scope: 'fake-source', sessionGeneration: '100' } }),
    r => ({ ...r, recipients: r.recipients.map(m => ({ ...m, roomid: 'forbidden' })) })]) {
    f.mutate(mutate)
    await assert.rejects(f.directory.sync(B, { workspaceSourceId: source.workspaceSourceId, expectedRevision: 1 }, signal))
    assert.deepEqual(f.store.data, baseline)
  }
})

test('empty known-member set still shares the true original group without inventing participants', async t => {
  const f = await fixture(t, 0), source = await f.sync()
  assert.equal(source.groupRef, groupRef); assert.equal(source.knownMembers, 0)
  assert.equal((await f.directory.query(B, {}, signal)).groups[0].sources.length, 1)
  const view = await f.directory.query(B, { workspaceSourceId: source.workspaceSourceId }, signal)
  assert.deepEqual(view.members, []); assert.equal(view.completeGroupRoster, false)
})

test('workspace source proof is in-process and origin-bound, not an Agent-provided task locator', async t => {
  const f = await fixture(t, 1), source = await f.sync(), resolved = await f.directory.resolveSource(B, source.workspaceSourceId, signal)
  const mem = memory(); mem.data = { schemaVersion: 1, records: [] }; let serial = 0
  const core = await HumanToolsCore.open(mem, () => (++serial).toString(16).padStart(32, '0'))
  t.after(() => core.close())
  const origin = { scope: B.sessionId, generation: B.sessionGeneration, callId: 'create-workspace', rootCallId: 'create-workspace' }
  const round = { title: '独立任务', instructions: '上传本次所需资料', form: { schema: 'human.form.v1', fields: [], attachment: null }, closesAt: null,
    recipientRefs: null, audience: 'known-members', sourceRecipientRefs: [member(0).recipientRef] }
  await assert.rejects(core.createCollection(origin, '独立任务', '按本次要求提交', round, signal, undefined, undefined, JSON.parse(JSON.stringify(resolved.proof))), { code: 'human-source-invalid' })
  await assert.rejects(core.createCollection({ ...origin, scope: C.sessionId }, '独立任务', '按本次要求提交', round, signal, undefined, undefined, resolved.proof), { code: 'human-source-invalid' })
  const card = await core.createCollection(origin, '独立任务', '按本次要求提交', round, signal, undefined, undefined, resolved.proof)
  assert.deepEqual(card.targetTaskRef, taskRef); assert.equal(card.actions[0].id, 'share'); assert.equal(card.initialRound.audience, 'known-members')
  assert(!JSON.stringify(card).includes('workspaceRef')); assert(!JSON.stringify(card).includes('source-session'))
})

test('workspace tools expose structural SDK schemas and never accept caller paths/scopes', async t => {
  const f = await fixture(t, 1), core = { publishedEvidence() {} }, lifecycle = {}
  const tools = workspaceTools({ nodeId, directory: f.directory, lifecycle, core, assertAgent() {} })
  for (const tool of tools) { assertSupportedJsonSchema(tool.parameters); assert.equal(tool.parameters.additionalProperties, false) }
  assert.deepEqual(tools.map(t => t.name), ['human_workspace_sync', 'human_workspace_directory', 'human_workspace_note', 'human_task_reshare'])
  assert(!JSON.stringify(tools.map(t => t.parameters)).includes('cwd'))
  const agent = { id: A.sessionId, session: { id: A.sessionId, header: f.headers.get(A.sessionId) } }
  await assert.rejects(tools[1].execute({ scope: 'invented' }, { agent, signal }), { code: 'workspace-input-invalid' })
})

test('cross-session lifecycle retains real source origin, freshly revalidates workspace and rejects private reshare', async t => {
  const f = await fixture(t, 1), source = await f.sync(), original = f.transport.request.bind(f.transport)
  const binding = { schema: 'human.node.binding.v1', nodeId, ownerSubject: 'owner', accountInstance: 'account', generation: 'binding-generation' }
  const bind = receiverBinding(binding, nodeId), publicRound = 'r'.repeat(24), privateRound = 'p'.repeat(24), requests = []
  f.transport.request = async (route, body) => {
    if (route === 'receiver-key') return { ...bind, key: body.key }
    if (route !== 'lifecycle' || body.operation !== 'get') return original(route, body)
    requests.push(structuredClone(body))
    assert.equal(body.scope, B.sessionId); assert(body.workspaceRef)
    return { ...bind, taskRef, origin: { scope: A.sessionId, sessionGeneration: A.sessionGeneration }, revision: 1,
      task: { title: '服务器原任务', body: '原公开说明' }, submissions: [], drafts: [], participants: [], nextOffset: null,
      rounds: [{ id: publicRound, number: 1, title: '原公开要求', instructions: '服务器原要求', recipientRefs: null },
        { id: privateRound, number: 2, title: '私人订正', instructions: '个人内容', recipientRefs: ['member'.padEnd(24, 'x')] }] }
  }
  const keys = await ReceiverKeyring.open(memory(), nodeId), lifecycle = await WorkflowLifecycle.open({ transport: f.transport, keys, store: memory(),
    workspaceAccess: (scope, task, active) => f.directory.access(scope, task, active) })
  t.after(async () => { await lifecycle.close(); await keys.close() })
  assert.equal((await lifecycle.query(B, taskRef, signal)).revision, 1)
  assert.deepEqual(await lifecycle.reshare(B, taskRef, null, signal), { title: '服务器原任务', body: '原公开说明' })
  assert.deepEqual(await lifecycle.reshare(B, taskRef, publicRound, signal), { title: '原公开要求', body: '服务器原要求' })
  await assert.rejects(lifecycle.reshare(B, taskRef, privateRound, signal), { code: 'lifecycle-share-invalid' })
  const before = requests.length; f.archived.push(A.sessionId)
  await assert.rejects(lifecycle.query(B, taskRef, signal), { code: 'workspace-source-unavailable' })
  assert.equal(requests.length, before, 'source revocation stops before reading any task data')
})

test('round/review tools bind complete inline data to the saved draft, with explicit page fallback', async t => {
  const store = memory(); store.data = { schemaVersion: 1, records: [] }; let serial = 0
  const core = await HumanToolsCore.open(store, () => (++serial).toString(16).padStart(32, '0'))
  t.after(() => core.close())
  const round = { title: '补充资料', instructions: '补充指定资料', form: { schema: 'human.form.v1', fields: [], attachment: null }, closesAt: null, recipientRefs: null }
  const review = { submissionId: 's'.repeat(24), submissionVersion: 1, title: '反馈', body: '已核对这份资料', correction: null }
  let withContext = true
  const lifecycle = { async prepare(_scope, _task, kind, expectedRevision, content) {
    return { taskRef, expectedRevision, content, state: 'draft', expiresAt: Date.now() + 60_000,
      draftRef: { schema: 'human.lifecycle.draft.ref.v1', draftId: 'd'.repeat(24), version: 1, kind,
        digest: sha256(canonicalSubmission({ taskRef, kind, expectedRevision, content })) },
      ...(withContext ? { context: { taskTitle: '原任务' } } : {}),
      ...(kind === 'review' ? { target: { participantRef: 'p'.repeat(24), submissionId: review.submissionId, submissionVersion: 1 } } : {}) }
  } }
  const definitions = lifecycleTools({ nodeId, core, lifecycle, assertAgent() {} })
  const agent = { id: B.sessionId, session: { id: B.sessionId, header: { id: B.sessionId, createdAt: 200 } } }
  for (const [kind, content] of [['round', round], ['review', review]]) {
    const tool = definitions.find(t => t.name === 'human_task_prepare_' + kind)
    assertSupportedJsonSchema(tool.parameters)
    const exec = { agent, signal, callId: 'inline-' + kind, rootCallId: 'inline-' + kind }
    const result = await tool.execute({ taskRef, expectedRevision: 1, content }, exec)
    assert.deepEqual(result.surface.workflowPreview.content, content)
    assert.equal(result.surface.workflowPreview.kind, kind)
    if (kind === 'review') assert.equal(result.surface.workflowPreview.target.submissionId, review.submissionId)
    const page = await tool.execute({ taskRef, expectedRevision: 1, content, preview: 'page' }, { ...exec, rootCallId: 'page-' + kind })
    assert.equal(page.surface.workflowPreview, undefined)
  }
  withContext = false
  const fallback = await definitions.find(t => t.name === 'human_task_prepare_round').execute({ taskRef, expectedRevision: 1, content: round },
    { agent, signal, callId: 'fallback', rootCallId: 'fallback' })
  assert.equal(fallback.surface.workflowPreview, undefined, 'missing source context cannot approve an invented inline preview')
})
