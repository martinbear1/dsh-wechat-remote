import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime, assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { humanCardAsset, HUMAN_CARD_ASSET_SCHEMA } from '../lib/human-tools/card-cover.js'
import { HUMAN_FORM_THEMES, HUMAN_FORM_ICONS } from '../lib/human-tools/form-v2.js'
import { humanSurface, HUMAN_MEMBERS_ACTION, HUMAN_WORKFLOW_ACTION } from '../lib/human-tools/protocol.js'
import { humanInitialRound } from '../lib/human-tools/form.js'
import { HumanToolsCore } from '../lib/human-tools/core.js'
import { HumanFileStore } from '../lib/human-tools/store.js'
import { humanShareTool } from '../lib/human-tools/dsh.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'
import { workflowCapabilityContracts } from '../lib/human-workflow/capability-contracts.js'
import { createCapabilityManifest } from '../lib/human-workflow/capabilities.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'

const signal = new AbortController().signal
const scope = { nodeId: 'cover_node', sessionId: 'cover_session', sessionGeneration: '100' }
const origin = { scope: scope.sessionId, generation: '100', callId: 'cover_call', rootCallId: 'cover_call' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const cover = () => ({ schema: 'human.card.asset.v1', assetRef: 'a'.repeat(32), sha256: 'b'.repeat(64), bytes: 100, mediaType: 'image/png', width: 500, height: 400 })
// Core contract tests inject authority; real persistent provenance is exercised
// by test-human-card-assets, including forged-but-well-shaped rejection.
const authority = (_origin, asset) => assert(humanCardAsset(asset))
const initial = () => ({ title: '计划', instructions: '填写日期', form: { schema: 'human.form.v1', fields: [{ key: 'note', label: '说明', kind: 'short-text', required: false, maxLength: 100 }], attachment: null }, closesAt: null, recipientRefs: null })
const id = () => randomBytes(16).toString('hex')
function memory(initial) { let value = structuredClone(initial); return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next) } } }
async function core() { return HumanToolsCore.open(memory({ schemaVersion: 1, records: [] }), id, Date.now, authority) }
async function lifecycle() {
  const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'owner', accountInstance: 'account', generation: 'generation' }
  const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
  let calls = 0, draft, transform = value => value
  const runtime = await WorkflowLifecycle.open({ store: memory(), coverAuthority: authority, keys: { ensure: async () => ({ keyId: 'key', publicKey: 'fixture' }) }, transport: {
    nodeId: scope.nodeId, assertIdentity() {}, async request(operation, payload) {
      calls++
      if (operation === 'receiver-key') return { binding, bindingKey, key: payload.key }
      if (operation === 'sync') return { schema: 'human.workflow.sync.v1', binding }
      if (payload.operation === 'get') return { binding, bindingKey, taskRef, origin: { scope: scope.sessionId, sessionGeneration: '100' }, revision: 1, rounds: [], submissions: [], participants: [], drafts: draft ? [draft] : [], nextOffset: null }
      const kind = payload.operation.replace('-draft', '')
      const content = structuredClone(payload.content)
      draft = { taskRef, expectedRevision: 1, content, expiresAt: Date.now() + 60000, state: 'draft', draftRef: {
        schema: 'human.lifecycle.draft.ref.v1', draftId: 'r'.repeat(24), version: 1, kind,
        digest: sha256(canonicalSubmission({ taskRef, kind, expectedRevision: 1, content })) } }
      return { draft: transform(structuredClone(draft)) }
    },
  } })
  return { runtime, get calls() { return calls }, set transform(value) { transform = value }, get draft() { return draft } }
}

test('cover strict schema accepts only prepared raster metadata, never template or executable recipes', () => {
  for (const mediaType of ['image/png', 'image/jpeg']) assert.deepEqual(humanCardAsset({ ...cover(), mediaType }), { ...cover(), mediaType })
  for (const value of [null, [], { schema: 'human.card.cover.v1', theme: 'blue', icon: 'calendar', heading: '旧模板' },
    { ...cover(), schema: 'human.card.asset.v2' }, { ...cover(), width: 0 }, { ...cover(), width: 501 },
    { ...cover(), bytes: 2097153 }, { ...cover(), mediaType: 'image/svg+xml' }]) assert.equal(humanCardAsset(value), undefined)
  for (const key of ['theme', 'icon', 'heading', 'subtitle', 'url', 'imageUrl', 'path', 'html', 'css', 'script', 'aspectRatio', 'privateImage'])
    assert.equal(humanCardAsset({ ...cover(), [key]: 'untrusted' }), undefined)
})

test('share-only surface location rejects cover on approval/selection and inside initialRound', async () => {
  const c = await core()
  try {
    const surface = await c.create(origin, '标题', '正文', signal, undefined, cover())
    assert.deepEqual(humanSurface(surface), surface)
    assert.equal(humanSurface({ ...surface, targetTaskRef: taskRef, actions: [HUMAN_MEMBERS_ACTION] }), undefined)
    assert.equal(humanSurface({ ...surface, targetTaskRef: taskRef, workflowRef: { schema: 'human.lifecycle.draft.ref.v1', draftId: 'r'.repeat(24), version: 1, digest: 'a'.repeat(64), kind: 'round' }, actions: [HUMAN_WORKFLOW_ACTION] }), undefined)
    assert.equal(humanInitialRound({ ...initial(), cover: cover() }), undefined)
    assert.equal(humanSurface({ ...surface, initialRound: { ...initial(), cover: cover() } }), undefined)
  } finally { await c.close() }
})

test('file ledger reload, claim, source grant and presentation preserve exact cover; clones cannot mutate it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'human-cover-'))
  const store = new HumanFileStore(path.join(directory, 'cards.json')); let c = await HumanToolsCore.open(store, id, Date.now, authority)
  try {
    const input = cover(), surface = await c.createCollection(origin, '标题', '正文', initial(), signal, undefined, input)
    input.sha256 = 'c'.repeat(64); surface.cover.sha256 = 'd'.repeat(64)
    await c.close(); c = await HumanToolsCore.open(store, id, Date.now, authority)
    const request = { scope: scope.sessionId, surfaceId: surface.id, revision: 1, actionId: 'share', attemptId: 'attempt_cover_123456' }
    assert.deepEqual((await c.claim(request, signal)).surface.cover, cover())
    const grant = c.grantSource(request); assert.deepEqual(grant.surface.cover, cover())
    const digest = sha256(canonicalSubmission(grant.surface)); grant.surface.cover.sha256 = 'e'.repeat(64)
    assert.notEqual(sha256(canonicalSubmission(grant.surface)), digest)
    assert.equal(sha256(canonicalSubmission(c.grantSource(request).surface)), digest)
    assert.deepEqual(c.forResult(scope.sessionId, origin.rootCallId, '100').cover, cover())
    assert.throws(() => c.assertGeneration(scope.sessionId, surface.id, '101'), { code: 'human-origin-conflict' })
  } finally { await c.close(); await rm(directory, { recursive: true, force: true }) }
})

test('changed cover cannot reuse a root call, including changing an absent legacy cover', async () => {
  const c = await core()
  try {
    const surface = await c.create(origin, '标题', '正文', signal, undefined, cover())
    assert.deepEqual(await c.create(origin, '标题', '正文', signal, undefined, { ...cover() }), surface)
    for (const next of [undefined, { ...cover(), sha256: 'c'.repeat(64) }, { ...cover(), assetRef: 'd'.repeat(32) }, { ...cover(), bytes: 101 }])
      await assert.rejects(c.create(origin, '标题', '正文', signal, undefined, next), { code: 'human-target-conflict' })
    const legacy = { ...origin, rootCallId: 'legacy' }, old = await c.create(legacy, '标题', '正文', signal)
    assert.equal(Object.hasOwn(humanSurface(old), 'cover'), false)
    assert.equal(canonicalSubmission(humanSurface(old)), canonicalSubmission(old))
    await assert.rejects(c.create(legacy, '标题', '正文', signal, undefined, cover()), { code: 'human-target-conflict' })
  } finally { await c.close() }
})

test('public round cover survives digest-bound draft and exact preview without entering public approval locator', async () => {
  const f = await lifecycle(), c = await core()
  try {
    const content = { ...initial(), cover: cover() }
    const draft = await f.runtime.prepare(scope, taskRef, 'round', 1, content, 'idempotency_cover_123', signal)
    assert.deepEqual(draft.content, content)
    assert.deepEqual((await f.runtime.preview(scope, taskRef, draft.draftRef, signal)).draft.content.cover, cover())
    const surface = await c.createWorkflow(origin, taskRef, draft.draftRef, signal)
    assert.equal(Object.hasOwn(surface, 'cover'), false)
    assert(!JSON.stringify(surface).includes('项目计划'))
    f.transform = value => { value.content.cover.sha256 = 'e'.repeat(64); return value }
    await assert.rejects(f.runtime.prepare(scope, taskRef, 'round', 1, content, 'idempotency_cover_124', signal), { code: 'lifecycle-response-invalid' })
  } finally { await c.close(); await f.runtime.close() }
})

test('private correction, directed round, reminder and malformed covers are rejected before network', async () => {
  const f = await lifecycle()
  try {
    for (const [kind, content] of [['round', { ...initial(), recipientRefs: ['p'.repeat(24)], cover: cover() }],
      ['round', { ...initial(), cover: { ...cover(), imageUrl: 'https://example.invalid/private' } }],
      ['review', { correction: { ...initial(), cover: cover() } }], ['review', { cover: cover() }], ['reminder', { cover: cover() }]])
      await assert.rejects(f.runtime.prepare(scope, taskRef, kind, 1, content, 'idempotency_cover_125', signal), { code: 'lifecycle-cover-invalid' })
    assert.equal(f.calls, 0)
    const old = await f.runtime.prepare(scope, taskRef, 'round', 1, initial(), 'idempotency_cover_126', signal)
    assert.equal(Object.hasOwn(old.content, 'cover'), false)
  } finally { await f.runtime.close() }
})

test('real native DSH tools validate cover schema and carry full share/collection metadata and round approval', async t => {
  const ctx = new Context(); new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode: 'native' }), sessions = new SessionStore(ctx)
  ctx.on('session/flush', async () => {})
  const session = sessions.create(SessionId(scope.sessionId), { meta: { createdAt: 100 } }), agent = { id: session.id, session, ctx }
  const c = await core(), f = await lifecycle()
  t.after(async () => { await c.close(); await f.runtime.close(); await ctx.fiber.dispose() })
  const definitions = [humanShareTool(c), ...lifecycleTools({ nodeId: scope.nodeId, lifecycle: f.runtime, core: c, assertAgent: exec => assert.equal(exec.agent, agent) })]
  assertSupportedJsonSchema(HUMAN_CARD_ASSET_SCHEMA)
  for (const tool of definitions) {
    // The pre-existing classic tool has annotations outside the SDK subset;
    // register/execute it as production does. All new lifecycle schemas comply.
    if (tool.name !== 'human_surface_share') assertSupportedJsonSchema(tool.parameters)
    assertSupportedJsonSchema(tool.output.schema); tools.register(tool)
  }
  for (const [name, extra] of [['human_surface_share', {}], ['human_task_create', { initialRound: initial() }]]) {
    const result = await tools.execute({ name, arguments: { title: '公开标题', body: '公开说明', cover: cover(), ...extra }, agent, callId: name, signal })
    assert.equal(result.isError, false, JSON.stringify(result)); assert.deepEqual(result.meta.humanSurface.cover, cover())
    assert.deepEqual(c.forResult(scope.sessionId, name, '100').cover, cover())
  }
  const prepared = await tools.execute({ name: 'human_task_prepare_round', arguments: { taskRef, expectedRevision: 1, content: { ...initial(), cover: cover() } }, agent, callId: 'round', signal })
  assert.equal(prepared.isError, false, JSON.stringify(prepared))
  assert.equal(prepared.meta.humanSurface.actions[0].id, 'workflow-approve')
  assert.deepEqual(f.draft.content.cover, cover())
  const before = f.calls
  for (const [name, extra] of [['human_surface_share', {}], ['human_task_create', { initialRound: initial() }]]) {
    const bad = await tools.execute({ name, arguments: { title: '公开标题', body: '公开说明', cover: { ...cover(), url: 'https://invalid' }, ...extra }, agent, callId: `bad_${name}`, signal })
    assert.equal(bad.isError, true)
    assert.equal(c.forResult(scope.sessionId, `bad_${name}`, '100'), undefined)
  }
  assert.equal(f.calls, before)
})

test('capability cover only safely imports finished images; member-page presentation and default cover remain available', () => {
  const contract = workflowCapabilityContracts().presentation.messageCard.cover
  assert.equal(contract.schema, 'human.card.asset.v1'); assert.equal(contract.aspectRatio, '5:4')
  assert.equal(contract.source, 'node-prepared-immutable-image'); assert.equal(contract.default, 'bundled-fixed')
  assert.equal(contract.privateCorrection, false); assert.equal(contract.approval, 'exact-image-sha256-in-source-or-draft-digest')
  assert.deepEqual(contract.sources, ['current-session-attachment', 'explicit-relative-workspace-reference'])
  assert.equal(contract.imageGeneration, false); assert.equal(contract.bundledFonts, false); assert.equal(contract.templateRendering, false)
  assert.equal(Object.hasOwn(contract, 'template'), false); assert.equal(Object.hasOwn(contract, 'renderLocation'), false)
  const page = workflowCapabilityContracts().presentation.taskPage
  assert.deepEqual(page.themes, [...HUMAN_FORM_THEMES]); assert.deepEqual(page.icons, [...HUMAN_FORM_ICONS])
  const manifest = createCapabilityManifest(scope.nodeId)
  assert(!JSON.stringify(manifest).includes('电脑渲染模板'))
  const skill = JSON.stringify(HUMAN_WORKFLOW_SKILL)
  assert.match(skill, /插件不提供字体、绘制引擎、固定模板或生图器/)
  assert(!skill.includes("kind:'template'")); assert(!skill.includes('human.card.cover.v1'))
})
