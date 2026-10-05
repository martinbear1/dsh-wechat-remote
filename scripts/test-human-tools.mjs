import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { Inbox } from '@deepseek-ai/dsh-agent'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { HumanToolsCore, HUMAN_RETENTION_MS, HUMAN_MAX_RECORDS, HUMAN_CONTEXT_LIMIT } from '../lib/human-tools/core.js'
import { HumanFileStore } from '../lib/human-tools/store.js'
import { humanSurface, humanTaskRef, humanSelectionRef, humanReminderTitle, humanReceiptData, HUMAN_ACTION_FAILURE_REASONS, HUMAN_TOOL_NAME, HUMAN_MEMBERS_TOOL_NAME, HUMAN_REMIND_TOOL_NAME } from '../lib/human-tools/protocol.js'
import { humanShareTool, humanMembersTool, humanRemindTool, registerHumanContext, HUMAN_CONTEXT_NAME } from '../lib/human-tools/dsh.js'
import { HumanToolsService } from '../lib/human-tools/service.js'
import { WechatHistoryService } from '../lib/history-service.js'
import { toolRecordPresentation } from '../lib/tool-record-presentation.js'
import { DshRealtimeCompatibility } from '../lib/dsh-realtime-compat.js'
import { TYPERT } from '../lib/typert.host.js'
import { defaultGateStatePath } from '../lib/agent-metadata.js'

const signal = new AbortController().signal
const origin = { scope: 'session-test', generation: '100', callId: 'call-1', rootCallId: 'call-1' }
const input = { title: '公开测试卡片', body: '仅验证原生分享，不含文件、成员或主人凭据。' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 'task_test_1234567890abcdef', deliveryId: 'delivery_test_1234567890ab' }
const selectionRef = { ...taskRef, schema: 'human.members.ref.v1', revision: 1, memberRefs: ['member_alpha_1234567890ab', 'member_bravo_1234567890ab'] }
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
function memory() {
  let saved = { schemaVersion: 1, records: [] }, serial = 0, writes = 0
  return { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); writes++ }, get writes() { return writes },
    id: () => (++serial).toString(16).padStart(32, '0') }
}
function request(surface, attemptId = 'attempt_1234567890') {
  return { scope: origin.scope, surfaceId: surface.id, revision: 1, actionId: surface.actions[0].id, attemptId }
}
async function fresh(now) {
  const store = memory(), core = await HumanToolsCore.open(store, store.id, now)
  const surface = await core.create(origin, input.title, input.body, signal)
  return { store, core, surface }
}
function resultEvent(callId, meta) {
  return { seq: 4, time: 100, type: 'tool/result', data: { turn: 1, step: 1,
    message: { id: 'result-1', role: 'user', source: { kind: 'tool', callId }, content: [{ type: 'text', text: 'ready' }] },
    ...(meta ? { meta } : {}) } }
}
async function until(predicate) {
  for (let n = 0; n < 100; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)) }
  assert.fail('expected asynchronous native event was not observed')
}

test('strict small protocol rejects new versions, arbitrary actions/routes and extra payload', async () => {
  const { surface } = await fresh()
  assert.deepEqual(humanSurface(surface), surface)
  for (const value of [{ ...surface, schemaVersion: 2 }, { ...surface, revision: 2 },
    { ...surface, title: 'x'.repeat(81) }, { ...surface, body: 'x'.repeat(1001) }, { ...surface, url: 'https://example.com' },
    { ...surface, actions: [{ ...surface.actions[0], path: '/private' }] }, { ...surface, actions: [{ ...surface.actions[0], type: 'exec' }] },
    { ...surface, id: '../x' }, { ...surface, actions: [] }]) assert.equal(humanSurface(value), undefined)
})

async function selectionFlow(now) {
  const flow = await fresh(now), shareReq = request(flow.surface)
  await flow.core.claim(shareReq, signal)
  await flow.core.ack({ ...shareReq, outcome: 'success', taskRef }, signal)
  const members = await flow.core.createMembers({ ...origin, rootCallId: 'members-root' }, flow.surface.id, signal)
  const membersReq = request(members)
  await flow.core.claim(membersReq, signal)
  const selected = await flow.core.ack({ ...membersReq, outcome: 'success', selectionRef }, signal)
  return { ...flow, members, membersReq, selected }
}

test('member selection offers exact all-or-subset reminder guidance instead of implicitly filtering participation', async t => {
  const { core, members } = await selectionFlow()
  t.after(() => core.close())
  const selection = humanMembersTool(core), legacy = humanRemindTool(core)
  assert.match(selection.description, /ALL selected people or an explicit subset/)
  assert.match(selection.description, /does not imply a pending-only request/)
  const text = selection.output.render({}, { surface: members }).map(item => item.text).join('\n')
  assert.match(text, /condition=none/)
  assert.match(text, /不必先打开或提交/)
  assert(!text.includes('human_task_remind'), 'a completed selection must not be routed to the legacy pending-only tool')
  assert.match(legacy.description, /only when the user explicitly wants that participation filter/)
  assert.match(legacy.description, /ALL selected people or an explicit subset regardless/)
  const reminder = await core.createReminder({ ...origin, rootCallId: 'legacy-compatible' }, members.id, '请确认', signal)
  assert.deepEqual(reminder.selectionRef, selectionRef, 'existing legacy surfaces keep their approved semantics')
})

test('successful selection runtime evidence exposes the exact continuation only when the actual tools exist', async t => {
  const host = sdk(), { core, members } = await selectionFlow()
  t.after(async () => { await core.close(); await host.ctx.fiber.dispose() })
  registerHumanContext(host.ctx, core)
  const context = async () => renderContextSections(await host.ctx.get('systemPrompt').assemble({ agent: host.agent, scope: host.agent }))
    .find(section => section.name === HUMAN_CONTEXT_NAME).text
  assert(!(await context()).includes('condition=none'), 'no nonexistent generic tools are advertised')
  for (const name of ['human_task_recipients', 'human_task_prepare_reminder']) host.tools.register({ name,
    description: 'Read-only test registration for available contract discovery', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    output: { schema: { type: 'object' }, render: () => [] }, execute: () => assert.fail('context assembly must never execute a tool') })
  const before = structuredClone(host.session.events), observed = await context()
  assert.match(observed, /全部所选人或其中明确几人/)
  assert.match(observed, /recipientSource=exact-references、condition=none/)
  assert.match(observed, /原始微信ID不向模型公开不等于系统未取得或未保存/)
  const facts = JSON.parse(observed.slice(observed.indexOf('\n') + 1))
  assert.deepEqual(facts.receipts.find(receipt => receipt.surfaceId === members.id).selectionRef, selectionRef)
  assert.deepEqual(host.session.events, before)
  assert.equal(host.sent.length, 0)
})

test('failed member/reminder diagnostics are strictly whitelisted, outcome-scoped and compatible with no-pending cancellation', async t => {
  assert.deepEqual(HUMAN_ACTION_FAILURE_REASONS, ['native_unavailable', 'member_preview_unavailable', 'reminder_mismatch',
    'lease_expiry_missing', 'action_preparation_failed', 'native_gesture_required', 'native_call_failed', 'result_capacity', 'group_identity_unavailable'])
  const { core, surface: share, members } = await selectionFlow()
  t.after(() => core.close())
  const remind = await core.createReminder({ ...origin, rootCallId: 'diagnostic-remind' }, members.id, '请确认', signal)
  const workflow = async kind => core.createWorkflow({ ...origin, rootCallId: 'diagnostic-' + kind }, taskRef,
    { schema: 'human.lifecycle.draft.ref.v1', draftId: kind.padEnd(24, 'x'), version: 1, kind, digest: 'a'.repeat(64) }, signal)
  const generic = await workflow('reminder'), round = await workflow('round'), review = await workflow('review')
  for (const reason of HUMAN_ACTION_FAILURE_REASONS) {
    for (const surface of [members, remind, generic]) {
      assert.equal(humanReceiptData(surface, { outcome: 'failed', reason }), true)
      for (const outcome of ['success', 'unknown', 'cancelled']) assert.equal(humanReceiptData(surface, { outcome, reason }), false)
    }
    for (const surface of [share, round, review]) assert.equal(humanReceiptData(surface, { outcome: 'failed', reason }), false)
  }
  for (const reason of [null, undefined, '', 'native_unavailable\n', 'wx.notifyGroupMembers:fail token=private',
    'roomid-private', { code: 'native_unavailable' }, ['native_unavailable'], 1])
    for (const surface of [members, remind, generic]) assert.equal(humanReceiptData(surface, { outcome: 'failed', reason }), false)
  assert.equal(humanReceiptData(remind, { outcome: 'cancelled', reason: 'no_pending_members' }), true)
  assert.equal(humanReceiptData(remind, { outcome: 'failed', reason: 'no_pending_members' }), false)
  for (const surface of [share, members, generic, round, review])
    assert.equal(humanReceiptData(surface, { outcome: 'cancelled', reason: 'no_pending_members' }), false)
})

test('every failed diagnostic survives ACK replay and durable reload without overwriting evidence or leaking new fields', async t => {
  for (const reason of HUMAN_ACTION_FAILURE_REASONS) {
    const { core, surface: share, members, store } = await selectionFlow()
    const nextMembers = await core.createMembers({ ...origin, rootCallId: 'failure-members' }, share.id, signal)
    const reminder = await core.createReminder({ ...origin, rootCallId: 'failure-remind' }, members.id, '请参与', signal)
    const generic = await core.createWorkflow({ ...origin, rootCallId: 'failure-generic' }, taskRef,
      { schema: 'human.lifecycle.draft.ref.v1', draftId: 'd'.repeat(24), version: 1, kind: 'reminder', digest: 'a'.repeat(64) }, signal)
    const receipts = []
    for (const surface of [nextMembers, reminder, generic]) {
      const req = request(surface), ack = { ...req, outcome: 'failed', reason }
      await core.claim(req, signal)
      const receipt = await core.ack(ack, signal)
      assert.equal(receipt.reason, reason); assert.equal(receipt.outcome, 'failed')
      assert.deepEqual(await core.ack(ack, signal), receipt)
      await assert.rejects(core.ack({ ...ack, reason: HUMAN_ACTION_FAILURE_REASONS.find(value => value !== reason) }, signal), { code: 'human-receipt-conflict' })
      receipts.push(receipt)
    }
    await core.close()
    const reopened = await HumanToolsCore.open(store, store.id)
    t.after(() => reopened.close())
    for (const receipt of receipts) assert.deepEqual(reopened.contextSnapshot(origin.scope, origin.generation).find(item => item.receiptId === receipt.receiptId), receipt)
    const corrupt = await store.load()
    corrupt.records.at(-1).attempts[0].receipt.reason = 'unbounded provider message'
    await assert.rejects(HumanToolsCore.open({ load: async () => corrupt, save: store.save }, store.id), { code: 'human-store-invalid' })
  }
})

test('generated RPC forwards safe failure reasons, rejects native detail text, and runtime explains diagnostics without auto-retry', async t => {
  const host = sdk(), store = memory()
  t.after(() => host.ctx.fiber.dispose())
  const registry = new TypertRegistry(host.ctx); registry.register(TYPERT)
  const gateway = new TypertGatewayService(host.ctx), service = new HumanToolsService(host.ctx, { enabled: true, store })
  assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, true)
  const invoke = (method, req) => gateway.invoke({ namespace: 'humanTools', method, args: { request: req }, signal })
  const prepare = async (name, args, callId) => {
    const result = await host.tools.execute({ name, arguments: args, callId, agent: host.agent, signal })
    assert.equal(result.isError, false, JSON.stringify(result)); return result.meta.humanSurface
  }
  const share = await prepare(HUMAN_TOOL_NAME, input, 'diag-share')
  await invoke('claim', request(share)); await invoke('ack', { ...request(share), outcome: 'success', taskRef })
  const members = await prepare(HUMAN_MEMBERS_TOOL_NAME, { sourceSurfaceId: share.id }, 'diag-members')
  await invoke('claim', request(members))
  const before = structuredClone(host.session.events)
  assert.equal((await invoke('ack', { ...request(members), outcome: 'failed', reason: 'wx raw identity failure' })).ok, false)
  assert.equal((await invoke('ack', { ...request(members), outcome: 'failed', reason: 'native_unavailable' })).ok, true)
  const context = renderContextSections(await host.ctx.get('systemPrompt').assemble({ agent: host.agent, scope: host.agent }))
    .find(section => section.name === HUMAN_CONTEXT_NAME).text
  assert.match(context, /客户端本次前置检查或原生调用的分类诊断/)
  assert.match(context, /不是微信平台永久不支持/)
  const receipt = JSON.parse(context.slice(context.indexOf('\n') + 1)).receipts.find(item => item.surfaceId === members.id)
  assert.equal(receipt.reason, 'native_unavailable'); assert.equal(receipt.outcome, 'failed')
  assert.deepEqual(host.session.events, before); assert.equal(host.sent.length, 0)
})

test('member references and weighted reminder titles enforce exact bounded protocol', async () => {
  assert(humanSelectionRef(selectionRef))
  const bad = [null, {}, [], { ...selectionRef, schema: 'human.task.ref.v1' }, { ...selectionRef, revision: 0 },
    { ...selectionRef, revision: 1.1 }, { ...selectionRef, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...selectionRef, memberRefs: [] }, { ...selectionRef, memberRefs: Array(1) }, { ...selectionRef, memberRefs: [selectionRef.memberRefs[0], selectionRef.memberRefs[0]] },
    { ...selectionRef, memberRefs: ['short'] }, { ...selectionRef, memberRefs: ['a'.repeat(24) + '\n'] },
    { ...selectionRef, memberRefs: Array.from({ length: 21 }, (_, i) => String(i).padStart(24, 'a')) },
    ...['roomid', 'group_openid', 'token', 'groupName'].map(key => ({ ...selectionRef, [key]: 'forbidden' }))]
  bad.forEach(value => assert.equal(humanSelectionRef(value), undefined))
  for (const value of ['中'.repeat(15), 'a'.repeat(30), '中'.repeat(14) + 'AB']) assert(humanReminderTitle(value))
  for (const value of ['', '中'.repeat(16), 'a'.repeat(31), '中'.repeat(15) + 'A', 'hello world', 'a\n', '确认!', '👋', 'A_B']) assert.equal(humanReminderTitle(value), false)
  const { core, members } = await selectionFlow()
  assert.deepEqual(humanSurface(members), members)
  const reminder = await core.createReminder({ ...origin, rootCallId: 'reminder' }, members.id, '请确认', signal)
  assert.deepEqual(humanSurface(reminder), reminder)
  for (const value of [{ ...members, targetTaskRef: undefined }, { ...members, selectionRef },
    { ...reminder, reminder: { title: 'ok', type: 'participate' } }, { ...reminder, reminder: { title: 'ok', type: 'complete', path: '/evil' } },
    { ...reminder, selectionRef: { ...selectionRef, taskId: 'b'.repeat(24) } },
    { ...reminder, targetTaskRef: { ...taskRef, deliveryId: 'c'.repeat(24) } },
    { ...reminder, actions: [{ id: 'remind', type: 'wechat.share', label: '提醒已选未完成人员' }] }]) assert.equal(humanSurface(value), undefined)
})

test('member-selection and reminder sources are scoped, generation-bound, expiring and type-safe', async () => {
  let now = 100
  const { core, surface, members } = await selectionFlow(() => now)
  const candidate = { ...origin, rootCallId: 'new-action' }
  for (const changed of [{ ...candidate, scope: 'other' }, { ...candidate, generation: '200' }]) {
    await assert.rejects(core.createMembers(changed, surface.id, signal))
    await assert.rejects(core.createReminder(changed, members.id, '确认', signal))
  }
  await assert.rejects(core.createMembers(candidate, members.id, signal), { code: 'human-source-unavailable' })
  await assert.rejects(core.createReminder(candidate, surface.id, '确认', signal), { code: 'human-source-unavailable' })
  await assert.rejects(core.createMembers(candidate, 'f'.repeat(32), signal))
  const noReceipt = await core.create({ ...origin, rootCallId: 'unpublished' }, 'a', 'b', signal)
  await assert.rejects(core.createMembers(candidate, noReceipt.id, signal), { code: 'human-source-unavailable' })
  await core.claim(request(noReceipt), signal)
  await core.ack({ ...request(noReceipt), outcome: 'failed' }, signal)
  await assert.rejects(core.createMembers(candidate, noReceipt.id, signal), { code: 'human-source-unavailable' })
  const unselected = await core.createMembers({ ...origin, rootCallId: 'unselected' }, surface.id, signal)
  await assert.rejects(core.createReminder(candidate, unselected.id, '确认', signal), { code: 'human-source-unavailable' })
  now += HUMAN_RETENTION_MS
  await assert.rejects(core.createMembers(candidate, surface.id, signal), { code: 'human-surface-unavailable' })
  await assert.rejects(core.createReminder(candidate, members.id, '确认', signal), { code: 'human-surface-unavailable' })
})

test('reminder freezes the entire approved native selection and title; no unidentifiable subset', async () => {
  const { core, surface, members } = await selectionFlow()
  const candidate = { ...origin, rootCallId: 'reminder' }, complete = [...selectionRef.memberRefs].reverse()
  const card = await core.createReminder(candidate, members.id, '本次确认', signal, complete)
  complete[0] = 'z'.repeat(24)
  assert.deepEqual(card.selectionRef.memberRefs, selectionRef.memberRefs, 'even equivalent explicit full sets use the original native order')
  assert(card.body.includes('全部2位成员中尚未确认者') && card.body.includes('本次确认') && card.body.includes('点击可能直接发送'))
  assert(!card.body.includes(selectionRef.taskId) && !card.body.includes('selectionRef'))
  assert.deepEqual(await core.createReminder(candidate, members.id, '本次确认', signal), card)
  await assert.rejects(core.createReminder(candidate, members.id, '其他标题', signal), { code: 'human-target-conflict' })
  await assert.rejects(core.createMembers(candidate, surface.id, signal), { code: 'human-target-conflict' })
  for (const refs of [[], ['z'.repeat(24)], [selectionRef.memberRefs[0]], [selectionRef.memberRefs[1]], [selectionRef.memberRefs[0], selectionRef.memberRefs[0]]])
    await assert.rejects(core.createReminder({ ...candidate, rootCallId: 'invalid' }, members.id, '确认', signal, refs))
  const all = await core.createReminder({ ...candidate, rootCallId: 'all' }, members.id, '确认', signal)
  assert.deepEqual(all.selectionRef, selectionRef)
  const claim = await core.claim(request(card), signal)
  assert.deepEqual(claim.action, card.actions[0])
  await assert.rejects(core.claim({ ...request(card), actionId: 'share' }, signal), { code: 'human-action-invalid' })
})

test('ACK cannot inject member/target references or false no-pending success into another action', async () => {
  const { core, surface, members } = await selectionFlow()
  const reminder = await core.createReminder({ ...origin, rootCallId: 'remind-invalid' }, members.id, '确认', signal)
  const shareReq = request(surface, 'share_new_123456789'), membersReq = request(members, 'select_new_123456789'), remindReq = request(reminder)
  for (const req of [shareReq, membersReq, remindReq]) await core.claim(req, signal)
  for (const outcome of ['cancelled', 'failed', 'unknown'])
    await assert.rejects(core.ack({ ...membersReq, outcome, selectionRef }, signal), { code: 'human-action-invalid' })
  for (const ack of [{ ...shareReq, outcome: 'success', selectionRef }, { ...membersReq, outcome: 'success', taskRef },
    { ...remindReq, outcome: 'success', taskRef }, { ...remindReq, outcome: 'success', selectionRef },
    { ...membersReq, outcome: 'success', selectionRef: { ...selectionRef, taskId: 'z'.repeat(24) } },
    { ...membersReq, outcome: 'success', selectionRef: { ...selectionRef, deliveryId: 'z'.repeat(24) } },
    { ...membersReq, outcome: 'success', selectionRef: { ...selectionRef, token: 'bad' } },
    ...[shareReq, membersReq].map(req => ({ ...req, outcome: 'cancelled', reason: 'no_pending_members' })),
    ...['success', 'failed', 'unknown'].map(outcome => ({ ...remindReq, outcome, reason: 'no_pending_members' })),
    { ...remindReq, outcome: 'cancelled', reason: 'anything' }])
    await assert.rejects(core.ack(ack, signal), { code: 'human-action-invalid' })
  const receipt = await core.ack({ ...remindReq, outcome: 'cancelled', reason: 'no_pending_members' }, signal)
  assert.equal(receipt.outcome, 'cancelled')
  assert.equal(receipt.reason, 'no_pending_members')
  await assert.rejects(core.ack({ ...remindReq, outcome: 'cancelled' }, signal), { code: 'human-receipt-conflict' })
})

test('selection ACK lost responses/reopen are exactly idempotent and immutable in bounded context', async () => {
  const { core, members, membersReq, selected, store } = await selectionFlow()
  const reopened = await HumanToolsCore.open(store, store.id), writes = store.writes
  const replies = await Promise.all([1, 2, 3].map(() => reopened.ack({ ...membersReq, outcome: 'success', selectionRef }, signal)))
  replies.forEach(reply => assert.deepEqual(reply, selected)); assert.equal(store.writes, writes)
  for (const ref of [undefined, { ...selectionRef, revision: 2 }, { ...selectionRef, memberRefs: [...selectionRef.memberRefs].reverse() }])
    await assert.rejects(reopened.ack({ ...membersReq, outcome: 'success', ...(ref ? { selectionRef: ref } : {}) }, signal), { code: 'human-receipt-conflict' })
  replies[0].selectionRef.memberRefs[0] = 'z'.repeat(24)
  assert.deepEqual(reopened.contextSnapshot(origin.scope, origin.generation).at(-1).selectionRef, selectionRef)
  assert.deepEqual(reopened.contextSnapshot('other', origin.generation), [])
  assert.deepEqual(reopened.contextSnapshot(origin.scope, 'other'), [])
  await assert.rejects(reopened.ack({ ...membersReq, scope: 'other', outcome: 'success', selectionRef }, signal))
  const reminder = await core.createReminder({ ...origin, rootCallId: 'no-pending' }, members.id, '确认', signal)
  await core.claim(request(reminder), signal)
  await core.ack({ ...request(reminder), outcome: 'cancelled', reason: 'no_pending_members' }, signal)
  const restored = await HumanToolsCore.open(store, store.id)
  assert.equal(restored.contextSnapshot(origin.scope, origin.generation).at(-1).reason, 'no_pending_members')
  const corrupted = await store.load()
  corrupted.records.find(row => row.surface.id === members.id).attempts[0].receipt.selectionRef.roomid = 'forbidden'
  await assert.rejects(HumanToolsCore.open({ load: async () => corrupted, save: store.save }, store.id), { code: 'human-store-invalid' })
})

test('real SDK and generated gateway execute all actions, preserve strict selection wire data, never Inbox/wakeup', async t => {
  const host = sdk(), store = memory()
  t.after(() => host.ctx.fiber.dispose())
  const registry = new TypertRegistry(host.ctx); registry.register(TYPERT)
  const gateway = new TypertGatewayService(host.ctx), service = new HumanToolsService(host.ctx, { enabled: true, store })
  const capability = JSON.parse((await service.capabilities({ scope: origin.scope }, signal)).valueJson)
  assert.equal(capability.members, true); assert.equal(capability.remind, true)
  const invoke = (method, req) => gateway.invoke({ namespace: 'humanTools', method, args: { request: req }, signal })
  const execute = async (name, args, callId) => {
    const result = await host.tools.execute({ name, arguments: args, callId, agent: host.agent, signal })
    assert.equal(result.isError, false, JSON.stringify(result)); return result.meta.humanSurface
  }
  const share = await execute(HUMAN_TOOL_NAME, input, 'sdk-share')
  await invoke('claim', request(share)); await invoke('ack', { ...request(share), outcome: 'success', taskRef })
  const members = await execute(HUMAN_MEMBERS_TOOL_NAME, { sourceSurfaceId: share.id }, 'sdk-members')
  assert.equal((await invoke('claim', request(members))).ok, true)
  for (const key of ['roomid', 'group_openid', 'token', 'name']) {
    const result = await invoke('ack', { ...request(members), outcome: 'success', selectionRef: { ...selectionRef, [key]: 'forbidden' } })
    assert.equal(result.ok, false); assert.equal(result.error.code, 'human-action-invalid')
  }
  assert.equal((await invoke('ack', { ...request(members), outcome: 'success', selectionRef })).ok, true)
  const reminder = await execute(HUMAN_REMIND_TOOL_NAME, { sourceSurfaceId: members.id, title: '确认' }, 'sdk-remind')
  assert.equal(reminder.actions[0].id, 'remind')
  assert.deepEqual(reminder.selectionRef.memberRefs, selectionRef.memberRefs)
  await invoke('claim', request(reminder))
  const eventsBefore = structuredClone(host.session.events)
  assert.equal((await invoke('ack', { ...request(reminder), outcome: 'cancelled', reason: 'no_pending_members' })).ok, true)
  const context = renderContextSections(await host.ctx.get('systemPrompt').assemble({ agent: host.agent, scope: host.agent })).find(section => section.name === HUMAN_CONTEXT_NAME)
  const receipts = JSON.parse(context.text.slice(context.text.indexOf('\n') + 1)).receipts
  assert.deepEqual(receipts.find(receipt => receipt.surfaceId === members.id).selectionRef, selectionRef)
  assert.equal(receipts.find(receipt => receipt.surfaceId === reminder.id).reason, 'no_pending_members')
  assert.deepEqual(host.session.events, eventsBefore); assert.equal(host.sent.length, 0)
  assert.equal(host.agent.inbox.nextTurn.length, 0); assert.equal(host.agent.inbox.nextStep.length, 0)
  for (const [name, args] of [[HUMAN_MEMBERS_TOOL_NAME, { sourceSurfaceId: share.id, taskId: taskRef.taskId }],
    [HUMAN_REMIND_TOOL_NAME, { sourceSurfaceId: members.id, title: '确认', roomid: 'forbidden' }],
    [HUMAN_REMIND_TOOL_NAME, { sourceSurfaceId: members.id, title: '确认', memberRefs: ['z'.repeat(24)] }],
    [HUMAN_REMIND_TOOL_NAME, { sourceSurfaceId: members.id, title: '确认', memberRefs: [selectionRef.memberRefs[0]] }],
    [HUMAN_REMIND_TOOL_NAME, { sourceSurfaceId: members.id, title: '确认', memberRefs: selectionRef.memberRefs }]]) {
    const result = await host.tools.execute({ name, arguments: args, callId: 'invalid', agent: host.agent, signal })
    assert.equal(result.isError, true)
  }
  await host.ctx.fiber.dispose()
  for (const name of [HUMAN_TOOL_NAME, HUMAN_MEMBERS_TOOL_NAME, HUMAN_REMIND_TOOL_NAME]) assert.equal(host.tools.get(name), undefined)
})

test('partial multi-tool registration conflict rolls back only this service registrations', async t => {
  const host = sdk(), { core } = await fresh()
  t.after(() => host.ctx.fiber.dispose())
  const existing = humanMembersTool(core)
  host.tools.register(existing)
  const service = new HumanToolsService(host.ctx, { enabled: true, store: memory() })
  assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, false)
  assert.equal(host.tools.get(HUMAN_TOOL_NAME), undefined)
  assert.equal(host.tools.get(HUMAN_REMIND_TOOL_NAME), undefined)
  assert(host.tools.get(HUMAN_MEMBERS_TOOL_NAME))
})

test('core claim is scoped/versioned/idempotent, ack records once without a live delivery target', async () => {
  const { core, surface, store } = await fresh()
  const req = request(surface)
  const claim = await core.claim(req, signal)
  assert.deepEqual(await core.claim(req, signal), claim)
  for (const patch of [{ scope: 'other' }, { surfaceId: 'f'.repeat(32) }, { revision: 2 }, { actionId: 'delete' }, { attemptId: 'short' }])
    await assert.rejects(core.claim({ ...req, ...patch }, signal))
  await assert.rejects(core.claim({ ...req, attemptId: 'another_123456789' }, signal), /待确认/)
  const receipt = await core.ack({ ...req, outcome: 'success' }, signal)
  assert.equal(receipt.delivery, 'recorded')
  assert.equal(store.writes, 3, 'create, claim and one ACK commit, no delivery two-phase writes')
  const persisted = await store.load()
  const reopened = await HumanToolsCore.open(store, store.id)
  assert.deepEqual(await reopened.ack({ ...req, outcome: 'success' }, signal), receipt)
  assert.deepEqual(await store.load(), persisted)
  assert.equal(store.writes, 3, 'duplicate ACK must not fsync again')
  assert.deepEqual(reopened.forResult(origin.scope, origin.rootCallId), surface)
  await assert.rejects(reopened.ack({ ...req, outcome: 'cancelled' }, signal), /不同回执/)
  assert.equal(reopened.status(origin.scope, surface.id).receipts[0].delivery, 'recorded')
})

test('task reference is exact, URL-safe, success-only and never accepts identity or authority fields', async () => {
  const { core, surface, store } = await fresh(), req = request(surface)
  await core.claim(req, signal)
  const before = await store.load()
  const bad = [null, [], {}, { ...taskRef, schema: 'human.task.ref.v2' }, { ...taskRef, taskId: 'a'.repeat(23) },
    { ...taskRef, taskId: 'a'.repeat(65) }, { ...taskRef, taskId: 'a'.repeat(24) + '\n' }, { ...taskRef, deliveryId: '../' + 'a'.repeat(24) },
    ...['roomid', 'memberID', 'token', 'url', 'execute'].map(key => ({ ...taskRef, [key]: 'forbidden' }))]
  for (const value of bad) {
    assert.equal(humanTaskRef(value), undefined)
    await assert.rejects(core.ack({ ...req, outcome: 'success', taskRef: value }, signal), { code: 'human-action-invalid' })
  }
  for (const outcome of ['unknown', 'failed', 'cancelled'])
    await assert.rejects(core.ack({ ...req, outcome, taskRef }, signal), { code: 'human-action-invalid' })
  for (const length of [24, 64]) assert(humanTaskRef({ ...taskRef, taskId: 'a'.repeat(length), deliveryId: '_'.repeat(length) }))
  assert.deepEqual(await store.load(), before)
})

test('task reference ACK lost replies, concurrent retries and reopen retain one immutable receipt', async () => {
  const { core, surface, store } = await fresh(), req = request(surface)
  await core.claim(req, signal)
  const ack = { ...req, outcome: 'success', taskRef: structuredClone(taskRef) }
  const first = await core.ack(ack, signal) // caller loses this reply; never repeat native share
  const reopened = await HumanToolsCore.open(store, store.id)
  const replies = await Promise.all([1, 2, 3].map(() => reopened.ack(ack, signal)))
  replies.forEach(reply => assert.deepEqual(reply, first))
  assert.equal(store.writes, 3)
  for (const changed of [undefined, { ...taskRef, taskId: 'b'.repeat(24) }, { ...taskRef, deliveryId: 'c'.repeat(24) }]) {
    const next = { ...req, outcome: 'success', ...(changed ? { taskRef: changed } : {}) }
    await assert.rejects(reopened.ack(next, signal), { code: 'human-receipt-conflict' })
  }
  ack.taskRef.taskId = 'd'.repeat(24)
  replies[0].taskRef.taskId = 'e'.repeat(24)
  reopened.status(origin.scope, surface.id).receipts[0].taskRef.taskId = 'f'.repeat(24)
  assert.deepEqual(reopened.contextSnapshot(origin.scope, origin.generation)[0].taskRef, taskRef)
  assert.equal(store.writes, 3)
  await assert.rejects(reopened.ack({ ...req, scope: 'other', outcome: 'success', taskRef }, signal), { code: 'human-surface-unavailable' })
  await assert.rejects(reopened.ack({ ...req, attemptId: 'unclaimed_12345678', outcome: 'success', taskRef }, signal), { code: 'human-action-not-claimed' })
})

test('legacy success does not acquire task capability; invalid persisted references fail closed', async () => {
  const { core, surface, store } = await fresh(), req = request(surface)
  await core.claim(req, signal); await core.ack({ ...req, outcome: 'success' }, signal)
  const ledger = await store.load()
  assert.equal(Object.hasOwn(core.contextSnapshot(origin.scope, origin.generation)[0], 'taskRef'), false)
  await assert.rejects(core.ack({ ...req, outcome: 'success', taskRef }, signal), { code: 'human-receipt-conflict' })
  await assert.rejects(core.create({ ...origin, rootCallId: 'reuse-legacy' }, 'a', 'b', signal, surface.id), { code: 'human-source-unavailable' })
  for (const changed of [{ taskRef: { ...taskRef, roomid: 'forbidden' } }, { taskRef, outcome: 'failed' }]) {
    const damaged = structuredClone(ledger)
    Object.assign(damaged.records[0].attempts[0].receipt, changed)
    await assert.rejects(HumanToolsCore.open({ load: async () => damaged, save: store.save }, store.id), { code: 'human-store-invalid' })
  }
  assert.deepEqual(await store.load(), ledger)
})

test('same-group surface derives only the latest successful reference in its current scope and generation', async () => {
  let now = 100
  const { core, surface, store } = await fresh(() => now), req = request(surface)
  await core.claim(req, signal); await core.ack({ ...req, outcome: 'success', taskRef }, signal)
  const nextRef = { ...taskRef, deliveryId: 'new_delivery_1234567890ab' }
  const next = request(surface, 'next_attempt_12345')
  await core.claim(next, signal); await core.ack({ ...next, outcome: 'success', taskRef: nextRef }, signal)
  const nextOrigin = { ...origin, callId: 'second-card', rootCallId: 'second-card' }
  const reused = await core.create(nextOrigin, '再发到原群', 'b', signal, surface.id)
  assert.deepEqual(reused.targetTaskRef, nextRef)
  assert.deepEqual(humanSurface(reused), reused)
  assert.equal(humanSurface({ ...reused, targetTaskRef: { ...nextRef, memberID: 'forbidden' } }), undefined)
  assert.deepEqual(await core.create(nextOrigin, 'ignored title', 'ignored body', signal, surface.id), reused)
  await assert.rejects(core.create(nextOrigin, 'a', 'b', signal), { code: 'human-target-conflict' })
  await assert.rejects(core.create({ ...nextOrigin, scope: 'other' }, 'a', 'b', signal, surface.id), { code: 'human-surface-unavailable' })
  await assert.rejects(core.create({ ...nextOrigin, generation: '200' }, 'a', 'b', signal, surface.id), { code: 'human-origin-conflict' })
  assert.deepEqual(core.contextSnapshot(origin.scope, '200'), [])
  const reopened = await HumanToolsCore.open(store, store.id, () => now)
  assert.deepEqual(reopened.forResult(origin.scope, nextOrigin.rootCallId, origin.generation), reused)
  now += HUMAN_RETENTION_MS
  await assert.rejects(reopened.create({ ...origin, rootCallId: 'expired' }, 'a', 'b', signal, surface.id), { code: 'human-surface-unavailable' })
  assert.deepEqual(reopened.contextSnapshot(origin.scope, origin.generation), [])
})

test('unpublished, failed, unknown and cancelled source surfaces cannot select a group', async () => {
  for (const outcome of [undefined, 'failed', 'unknown', 'cancelled']) {
    const { core, surface } = await fresh()
    if (outcome) { await core.claim(request(surface), signal); await core.ack({ ...request(surface), outcome }, signal) }
    await assert.rejects(core.create({ ...origin, rootCallId: 'reuse' }, 'a', 'b', signal, surface.id), { code: 'human-source-unavailable' })
  }
})

test('legacy receipt states remain readable without Inbox replay; pending can become recorded', async () => {
  const { core, surface, store } = await fresh()
  const req = request(surface)
  await core.claim(req, signal)
  const receipt = await core.ack({ ...req, outcome: 'unknown' }, signal)
  for (const delivery of ['pending', 'queued', 'dispatching', 'uncertain']) {
    const legacy = await store.load()
    legacy.records[0].attempts[0].receipt = { ...receipt, delivery }
    await store.save(legacy)
    const reopened = await HumanToolsCore.open(store, store.id)
    const expected = delivery === 'dispatching' ? 'uncertain' : delivery
    assert.equal(reopened.status(origin.scope, surface.id).receipts[0].delivery, expected)
    const result = await reopened.ack({ ...req, outcome: 'unknown' }, signal)
    assert.equal(result.delivery, delivery === 'pending' ? 'recorded' : expected)
    assert.equal(result.receiptId, receipt.receiptId)
  }
})

test('bounded ledger, expiry, abort, duplicate root and close do not mutate mature host state', async () => {
  let now = 100
  const { core, surface, store } = await fresh(() => now)
  assert.deepEqual(await core.create({ ...origin, callId: 'nested-2' }, 'different', 'different', signal), surface)
  await assert.rejects(core.create({ ...origin, generation: '200' }, 'a', 'b', signal), /会话身份已变化/)
  assert.equal(core.forResult(origin.scope, origin.rootCallId, '200'), undefined)
  assert.equal(core.forResult('other', origin.rootCallId), undefined)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(core.claim(request(surface), abort.signal))
  for (let n = 1; n < HUMAN_MAX_RECORDS; n++) await core.create({ ...origin, rootCallId: `root-${n}` }, 'a', 'b', signal)
  await assert.rejects(core.create({ ...origin, rootCallId: 'overflow' }, 'a', 'b', signal), /数量已达上限/)
  now += HUMAN_RETENTION_MS
  assert.equal(core.forResult(origin.scope, origin.rootCallId), undefined)
  await assert.rejects(core.claim(request(surface), signal), /过期/)
  await core.create({ ...origin, rootCallId: 'new' }, 'a', 'b', signal)
  assert.equal((await store.load()).records.length, 1)
  core.close()
  await assert.rejects(core.create(origin, 'a', 'b', signal), /关闭/)
})

test('store failure fails closed before card is returned or receipt is sent', async () => {
  const store = memory()
  const core = await HumanToolsCore.open({ load: store.load, save: async () => { throw Error('disk full') } }, store.id)
  await assert.rejects(core.create(origin, 'a', 'b', signal), /disk full/)
  await assert.rejects(core.create(origin, 'a', 'b', signal), /关闭/)
  await assert.rejects(HumanToolsCore.open({ load: async () => ({ schemaVersion: 2, records: [] }), save: store.save }, store.id), /格式/)
})

test('failed ACK persistence never advertises an unsaved receipt or modifies the old ledger', async () => {
  const { core, surface, store } = await fresh()
  const req = request(surface)
  await core.claim(req, signal)
  const before = await store.load()
  const reopened = await HumanToolsCore.open({ load: store.load, save: async () => { throw Error('disk full') } }, store.id)
  await assert.rejects(reopened.ack({ ...req, outcome: 'success' }, signal), /disk full/)
  assert.deepEqual(reopened.contextSnapshot(origin.scope, origin.generation), [])
  assert.deepEqual(await store.load(), before)
  const retry = await HumanToolsCore.open(store, store.id)
  assert.equal((await retry.ack({ ...req, outcome: 'success' }, signal)).delivery, 'recorded')
})

test('real filesystem ledger survives restart, stays bounded and never resets corrupt data', async () => {
  const dir = await mkdtemp(path.join(root, '.human-tools-test-'))
  assert(path.resolve(dir).startsWith(root + path.sep + '.human-tools-test-'))
  try {
    const file = path.join(dir, 'ledger.json'), store = new HumanFileStore(file), ids = memory()
    const core = await HumanToolsCore.open(store, ids.id)
    const surface = await core.create(origin, 'a', 'b', signal)
    await core.claim(request(surface), signal)
    const reopened = await HumanToolsCore.open(new HumanFileStore(file), ids.id)
    assert.deepEqual(reopened.forResult(origin.scope, origin.rootCallId), surface)
    await reopened.ack({ ...request(surface), outcome: 'cancelled' }, signal)
    assert.equal(JSON.parse(await readFile(file, 'utf8')).records[0].attempts[0].receipt.outcome, 'cancelled')
    const second = request(surface, 'disk_attempt_12345')
    await reopened.claim(second, signal)
    const received = await reopened.ack({ ...second, outcome: 'success', taskRef }, signal)
    const recovered = await HumanToolsCore.open(new HumanFileStore(file), ids.id)
    assert.deepEqual(await recovered.ack({ ...second, outcome: 'success', taskRef }, signal), received)
    assert.deepEqual(recovered.contextSnapshot(origin.scope, origin.generation)[0].taskRef, taskRef)
    const members = await recovered.createMembers({ ...origin, rootCallId: 'disk-members' }, surface.id, signal)
    await recovered.claim(request(members), signal)
    const membersReceipt = await recovered.ack({ ...request(members), outcome: 'success', selectionRef }, signal)
    const selected = await HumanToolsCore.open(new HumanFileStore(file), ids.id)
    assert.deepEqual(await selected.ack({ ...request(members), outcome: 'success', selectionRef }, signal), membersReceipt)
    const reminder = await selected.createReminder({ ...origin, rootCallId: 'disk-reminder' }, members.id, '确认', signal)
    await selected.claim(request(reminder), signal)
    await selected.ack({ ...request(reminder), outcome: 'cancelled', reason: 'no_pending_members' }, signal)
    const final = await HumanToolsCore.open(new HumanFileStore(file), ids.id)
    assert.deepEqual(final.forResult(origin.scope, 'disk-reminder'), reminder)
    assert.equal(final.contextSnapshot(origin.scope, origin.generation).at(-1).reason, 'no_pending_members')
    await writeFile(file, '{bad')
    await assert.rejects(HumanToolsCore.open(new HumanFileStore(file), ids.id))
    assert.equal(await readFile(file, 'utf8'), '{bad')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

function sdk(mode = 'native', live = true) {
  const ctx = new Context()
  new SystemPrompt(ctx, {})
  const tools = new ToolRuntime(ctx, { mode })
  const sessions = new SessionStore(ctx)
  const session = sessions[live ? 'create' : 'prepare'](SessionId(origin.scope), { meta: { cwd: root, createdAt: 100 } })
  const inbox = new Inbox(session, { inserted() {}, discarded() {}, claimed() {} })
  const sent = []
  const agent = { id: session.id, session, inbox, ctx, status: 'idle', send(message, target, wakeup) {
    sent.push({ message, target, wakeup }); inbox.append(target, message)
  } }
  ctx.provide('agents', { get: id => live && id === agent.id ? agent : undefined })
  ctx.on('session/flush', async () => {})
  return { ctx, tools, session, agent, sent }
}

test('default persistent ledger follows the actual host profile and isolates Web/Desktop across restart', async t => {
  const home = await mkdtemp(path.join(root, 'human-profile-test-'))
  const active = []
  t.after(async () => { for (const host of active) await host.ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  async function boot(name) {
    const host = sdk()
    host.ctx.provide('profileContext', { name, home, dir: path.join(home, 'profiles', name), installAnchor: path.join(home, 'host-package.json') })
    active.push(host)
    const service = new HumanToolsService(host.ctx, { enabled: true })
    assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, true)
    return { host, service, ledger: path.join(path.dirname(defaultGateStatePath(host.ctx)), 'human-tools-v1.json') }
  }
  const web = await boot('web'), desktop = await boot('desktop')
  assert.notEqual(web.ledger, desktop.ledger)
  const wr = await web.host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'same-call', agent: web.host.agent, signal })
  const dr = await desktop.host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'same-call', agent: desktop.host.agent, signal })
  const ws = wr.meta.humanSurface, ds = dr.meta.humanSurface
  assert.notEqual(ws.id, ds.id)
  assert.equal((await desktop.service.claim(request(ws), signal)).ok, false)
  assert.equal((await web.service.claim(request(ds), signal)).ok, false)
  assert.equal((await web.service.claim(request(ws), signal)).ok, true)
  assert.equal((await web.service.ack({ ...request(ws), outcome: 'success' }, signal)).ok, true)
  const desktopBytes = await readFile(desktop.ledger)
  await web.host.ctx.fiber.dispose()
  const reopened = await boot('web')
  assert.deepEqual(reopened.service.present(origin.scope, 'same-call'), ws)
  assert.deepEqual(desktop.service.present(origin.scope, 'same-call'), ds)
  assert.deepEqual(await readFile(desktop.ledger), desktopBytes)
  assert.notDeepEqual(await readFile(reopened.ledger), desktopBytes)
})

test('malformed native profile disables optional tools without falling back to another ledger', async t => {
  const host = sdk(); t.after(() => host.ctx.fiber.dispose())
  host.ctx.provide('profileContext', { name: 'desktop' })
  const service = new HumanToolsService(host.ctx, { enabled: true })
  assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, false)
  assert.equal(host.tools.get(HUMAN_TOOL_NAME), undefined)
  assert(host.ctx.get('sessions'))
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function humanProjectionEntries(entry = { event: resultEvent(origin.rootCallId) }, type = 'tool/code-dispatch') {
  return [{ event: { seq: 3, time: 100, type, data: { rootCallId: origin.rootCallId,
    parentCallId: origin.rootCallId, subCallId: origin.rootCallId + ':code:1', name: HUMAN_TOOL_NAME,
    arguments: input, isError: false, content: [{ type: 'text', text: 'ready' }] } } }, entry]
}
function pageFixture(host, entries, config, onRead = () => {}) {
  // Only the native page source is controlled; use the real history page,
  // read budget, projection and the actual optional service initialization.
  host.ctx.provide('typertGateway', { invoke() { assert.fail('controlled source only') }, stream() {} })
  const history = new WechatHistoryService(host.ctx, config)
  let reads = 0
  history.createPageReader = () => async () => {
    reads++; onRead(reads)
    return { ok: true, value: { events: entries, hasMore: false } }
  }
  return { history, reads: () => reads }
}
async function coldProjection(t) {
  const host = sdk(), seed = await fresh(), load = deferred(), entered = []
  let loads = 0
  const service = new HumanToolsService(host.ctx, { enabled: true,
    store: { load: () => { loads++; return load.promise }, save: seed.store.save } })
  const prepare = service.prepareProjection.bind(service)
  service.prepareProjection = signal => {
    entered.push(signal)
    return prepare(signal)
  }
  t.after(async () => { await host.ctx.fiber.dispose(); load.resolve(await seed.store.load()); seed.core.close() })
  return { host, service, load, seed, loads: () => loads, entered }
}

test('cold Code Mode history waits for the single ledger initialization and includes its card on the first page', async t => {
  const cold = await coldProjection(t), fetched = deferred()
  const entry = { event: resultEvent(origin.rootCallId) }, before = JSON.stringify(entry)
  const fixture = pageFixture(cold.host, humanProjectionEntries(entry), undefined, () => fetched.resolve())
  let finished = false
  const pending = fixture.history.page({ sessionId: origin.scope }, signal).finally(() => { finished = true })
  await fetched.promise
  await Promise.resolve()
  assert.equal(finished, false)
  assert.equal(cold.loads(), 1)
  assert.equal(fixture.reads(), 1)
  cold.load.resolve(await cold.seed.store.load())
  const response = await pending
  assert.equal(response.ok, true, JSON.stringify(response))
  assert.deepEqual(JSON.parse(response.value.payloadJson).events.at(-1).event.data.meta.humanSurface, cold.seed.surface)
  assert.equal(JSON.stringify(entry), before, 'native history is never mutated')
  // Bounded page performs exactly one native fetch; legacy window pagination
  // is separate and therefore needs no per-request "prepared" state here.
  assert.equal(fixture.reads(), 1)
  assert.equal(cold.entered.length, 1)
  assert.equal(cold.loads(), 1)
  await fixture.history.page({ sessionId: origin.scope }, signal)
  assert.equal(cold.loads(), 1, 'warm page reuses the resolved initialization')
})

test('lifecycle draft tools retain the same cold history initialization barrier', async t => {
  for (const name of ['human_task_create', 'human_task_prepare_round', 'human_task_prepare_review', 'human_task_prepare_reminder', 'human_automation_save']) {
    await t.test(name, async t => {
      const cold = await coldProjection(t), fetched = deferred()
      const entries = humanProjectionEntries()
      entries[0].event.data.name = name
      const fixture = pageFixture(cold.host, entries, undefined, () => fetched.resolve())
      let finished = false
      const pending = fixture.history.page({ sessionId: origin.scope }, signal).finally(() => { finished = true })
      await fetched.promise
      await Promise.resolve()
      assert.equal(finished, false, 'workflow approvals must not disappear on a cold first page')
      cold.load.resolve(await cold.seed.store.load())
      const response = await pending
      assert.equal(response.ok, true, JSON.stringify(response))
      assert.deepEqual(JSON.parse(response.value.payloadJson).events.at(-1).event.data.meta.humanSurface, cold.seed.surface)
      assert.equal(cold.entered.length, 1)
      assert.equal(fixture.reads(), 1)
    })
  }
})

test('aborting a waiting history reader releases its slot without cancelling shared initialization', async t => {
  const cold = await coldProjection(t), twoReads = deferred(), thirdRead = deferred()
  const fixture = pageFixture(cold.host, humanProjectionEntries(), undefined,
    count => { if (count === 2) twoReads.resolve(); if (count === 3) thirdRead.resolve() })
  const abort = new AbortController()
  const first = fixture.history.page({ sessionId: origin.scope }, abort.signal)
  const firstRejected = assert.rejects(first, error => error.name === 'AbortError')
  let secondFinished = false
  const second = fixture.history.page({ sessionId: origin.scope }, signal).finally(() => { secondFinished = true })
  await twoReads.promise
  abort.abort()
  await firstRejected
  assert.equal(secondFinished, false)
  const third = fixture.history.page({ sessionId: origin.scope }, signal)
  await thirdRead.promise
  assert.equal(cold.loads(), 1)
  cold.load.resolve(await cold.seed.store.load())
  for (const response of await Promise.all([second, third])) {
    assert.equal(response.ok, true)
    assert.deepEqual(JSON.parse(response.value.payloadJson).events.at(-1).event.data.meta.humanSurface, cold.seed.surface)
  }
  assert.equal(fixture.reads(), 3)
})

test('cold projection obeys the existing history deadline without adding another timer or retry', async t => {
  const cold = await coldProjection(t), fetched = deferred()
  const fixture = pageFixture(cold.host, humanProjectionEntries(), { timeoutMs: 20 }, () => fetched.resolve())
  // AbortSignal.timeout is unref'ed by Node. Keep only this test process alive;
  // production uses the existing request deadline, not this test timer.
  const keepAlive = setTimeout(() => {}, 1000)
  try {
    const pending = fixture.history.page({ sessionId: origin.scope }, signal)
    const rejected = assert.rejects(pending, error => error.name === 'TimeoutError')
    await fetched.promise
    await rejected
    assert.equal(fixture.reads(), 1)
    assert.equal(cold.loads(), 1)
  } finally { clearTimeout(keepAlive) }
})

test('default-off and non-card history remain usable without waiting for optional state', async t => {
  const host = sdk()
  t.after(() => host.ctx.fiber.dispose())
  const entry = { event: resultEvent(origin.rootCallId) }
  const off = pageFixture(host, [entry])
  assert.equal((await off.history.page({ sessionId: origin.scope }, signal)).ok, true)
  let reads = 0
  const disabled = new HumanToolsService(host.ctx, { store: { load: async () => { reads++; throw Error('must not load') }, save: async () => {} } })
  assert.equal(await disabled.prepareProjection(signal), false)
  assert.equal((await off.history.page({ sessionId: origin.scope }, signal)).ok, true)
  assert.equal(reads, 0)

  const cold = await coldProjection(t)
  const assistant = { event: { seq: 1, time: 100, type: 'assistant/message', data: { turn: 1,
    message: { id: 'answer', role: 'assistant', content: [{ type: 'text', text: 'ordinary answer' }] } } } }
  const direct = { event: resultEvent('direct-with-meta', { humanSurface: cold.seed.surface }) }
  const fixture = pageFixture(cold.host, [assistant, direct])
  const response = await fixture.history.page({ sessionId: origin.scope }, signal)
  assert.equal(response.ok, true, JSON.stringify(response))
  assert.deepEqual(JSON.parse(response.value.payloadJson).events[1].event.data.meta.humanSurface, cold.seed.surface)
  assert.equal(fixture.reads(), 1)
  assert.equal(cold.entered.length, 0, 'neither page entered the optional initialization barrier')
})

test('ordinary tools and unidentified partial results never wait for the optional ledger', async t => {
  const cold = await coldProjection(t)
  const result = (seq, callId, meta) => ({ event: { ...resultEvent(callId, meta), seq } })
  const call = (seq, callId, name) => ({ event: { seq, time: 100, type: 'tool/call',
    data: { turn: 1, step: 1, callId, name, arguments: { text: HUMAN_TOOL_NAME } } } })
  const entries = [call(1, 'ordinary-read', 'read_file'), result(2, 'ordinary-read'),
    call(3, 'ordinary-shell', 'shell'), result(4, 'ordinary-shell'),
    { event: { seq: 5, time: 100, type: 'tool/code-dispatch', data: { rootCallId: 'ordinary-code',
      subCallId: 'ordinary-code:code:1', name: 'shell', arguments: {} } } }, result(6, 'ordinary-code'),
    result(7, origin.rootCallId),
    result(8, 'forged-metadata', { name: HUMAN_TOOL_NAME, rootCallId: origin.rootCallId }),
  ]
  const fixture = pageFixture(cold.host, entries, { timeoutMs: 100 })
  const keepAlive = setTimeout(() => {}, 1000)
  try {
    const response = await fixture.history.page({ sessionId: origin.scope }, signal)
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(cold.entered.length, 0, 'ordinary calls, prose and metadata never enter the barrier')
    assert.equal(fixture.reads(), 1, 'no additional history scan to guess an orphan result')
    assert.equal(JSON.parse(response.value.payloadJson).events.find(row => row.event.seq === 7).event.data.meta?.humanSurface, undefined)
    cold.load.resolve(await cold.seed.store.load())
    await cold.service.prepareProjection(signal)
    const warm = await fixture.history.page({ sessionId: origin.scope }, signal)
    assert.deepEqual(JSON.parse(warm.value.payloadJson).events.find(row => row.event.seq === 7).event.data.meta.humanSurface, cold.seed.surface)
  } finally { clearTimeout(keepAlive) }
})

test('native direct calls and legacy PTC dispatch retain the cold projection barrier', async t => {
  for (const type of ['tool/call', 'tool/ptc-dispatch']) await t.test(type, async t => {
    const cold = await coldProjection(t), fetched = deferred()
    const entries = humanProjectionEntries(undefined, type)
    if (type === 'tool/call') entries[0].event.data.callId = origin.rootCallId
    const fixture = pageFixture(cold.host, entries, undefined, () => fetched.resolve())
    let finished = false
    const pending = fixture.history.page({ sessionId: origin.scope }, signal).finally(() => { finished = true })
    await fetched.promise
    await Promise.resolve()
    assert.equal(finished, false)
    assert.equal(cold.entered.length, 1)
    cold.load.resolve(await cold.seed.store.load())
    const response = await pending
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.deepEqual(JSON.parse(response.value.payloadJson).events.at(-1).event.data.meta.humanSurface, cold.seed.surface)
  })
})

test('failed optional initialization preserves ordinary history and never retries a corrupt ledger', async t => {
  const cold = await coldProjection(t), fetched = deferred()
  const fixture = pageFixture(cold.host, humanProjectionEntries(), undefined, () => fetched.resolve())
  const pending = fixture.history.page({ sessionId: origin.scope }, signal)
  await fetched.promise
  cold.load.reject(Error('controlled corrupt ledger'))
  for (const response of [await pending, await fixture.history.page({ sessionId: origin.scope }, signal)]) {
    assert.equal(response.ok, true)
    assert.equal(JSON.parse(response.value.payloadJson).events.at(-1).event.data.meta?.humanSurface, undefined)
  }
  const capabilities = await cold.service.capabilities({ scope: origin.scope }, signal)
  assert.equal(capabilities.ok, false)
  assert.equal(cold.loads(), 1)
  assert.equal(cold.host.tools.get(HUMAN_TOOL_NAME), undefined)
})

test('service disposal ends pending projection and owner waits without late tool registration', async t => {
  const cold = await coldProjection(t)
  const prepared = cold.service.prepareProjection(signal)
  const capability = cold.service.capabilities({ scope: origin.scope }, signal)
  await cold.host.ctx.fiber.dispose()
  assert.equal(await prepared, false)
  const response = await capability
  assert.equal(response.ok, false)
  assert.equal(response.error.code, 'human-tools-disabled')
  cold.load.resolve(await cold.seed.store.load())
  assert.equal(await cold.service.prepareProjection(signal), false)
  assert.equal(cold.host.tools.get(HUMAN_TOOL_NAME), undefined)
})

test('Cordis plugin reload drains an in-flight claim before reopening the ledger', async t => {
  const host = sdk(), seed = await fresh(), entered = deferred(), finishSave = deferred()
  await seed.core.close()
  let delayNextSave = true, disposed = false, loads = 0
  const store = {
    load: async () => { loads++; return seed.store.load() },
    save: async ledger => {
      if (delayNextSave) { delayNextSave = false; entered.resolve(); await finishSave.promise }
      await seed.store.save(ledger)
    },
  }
  t.after(async () => { finishSave.resolve(); await host.ctx.fiber.dispose() })
  const firstFiber = await host.ctx.plugin(HumanToolsService, { enabled: true, store })
  const first = host.ctx.get('humanTools')
  assert.equal((await first.capabilities({ scope: origin.scope }, signal)).ok, true)
  const original = request(seed.surface, 'old_attempt_123456'), next = request(seed.surface, 'new_attempt_123456')
  const pending = first.claim(original, signal)
  await entered.promise
  const disposal = firstFiber.dispose().then(() => { disposed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(disposed, false, 'Cordis disposal must await the durable write')
  assert.equal((await first.claim(next, signal)).error.code, 'human-tools-disabled')
  assert.equal(loads, 1)
  finishSave.resolve()
  await disposal
  const stoppedClaim = await pending
  assert.equal(stoppedClaim.ok, false, 'disposed claim must not permit native execution')
  assert.equal(stoppedClaim.error.code, 'human-tools-disabled')
  const saved = await seed.store.load()
  assert.deepEqual(saved.records[0].attempts, [{ id: original.attemptId }], 'persisted claim survives disposal')

  const secondFiber = await host.ctx.plugin(HumanToolsService, { enabled: true, store })
  const second = host.ctx.get('humanTools')
  assert.equal((await second.capabilities({ scope: origin.scope }, signal)).ok, true)
  assert.equal(loads, 2)
  const duplicate = await second.claim(next, signal)
  assert.equal(duplicate.ok, false)
  assert.equal(duplicate.error.code, 'human-action-in-progress')
  assert.equal((await second.claim(original, signal)).ok, true, 'only the same attempt can recover its lost response')
  assert.deepEqual(await seed.store.load(), saved, 'reopened service cannot overwrite the old claim')
  await secondFiber.dispose()
})

test('official ToolRuntime registration/execution creates structured meta without waiting for a click', async () => {
  const host = sdk(), { core } = await fresh()
  const dispose = host.tools.register(humanShareTool(core))
  assert(host.tools.schemas().some(item => item.name === HUMAN_TOOL_NAME))
  const result = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'direct-1', agent: host.agent, signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert(humanSurface(result.meta?.humanSurface))
  assert.equal(result.concludesTurn, undefined)
  assert.equal(result.additionalContexts, undefined)
  assert.equal(host.sent.length, 0)
  const invalid = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: { ...input, sessionId: 'other' }, callId: 'direct-bad', agent: host.agent, signal })
  assert.equal(invalid.isError, true)
  await assert.rejects(humanShareTool(core).execute(input, { agent: host.agent, signal }), /真实DSH会话上下文/)
  const oversized = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: { ...input, title: 'a'.repeat(81) }, callId: 'too-long', agent: host.agent, signal })
  assert.equal(oversized.isError, true)
  dispose()
  assert(!host.tools.schemas().some(item => item.name === HUMAN_TOOL_NAME))
  await host.ctx.fiber.dispose()
})

test('official run_code dispatch has no subtool meta; authoritative root projection survives restart', async () => {
  const host = sdk('code'), store = memory(), core = await HumanToolsCore.open(store, store.id)
  // Controlled substrate stub only; registration, Code Mode dispatch, subcall
  // identity, output shaping and session log are the actual official runtime.
  host.ctx.provide('codeRuntime', { language: 'typescript', isolation: 'test-fixture', async run(req) {
    const fn = req.bindings[0].functions[HUMAN_TOOL_NAME]
    const first = await fn(input), again = await fn({ title: 'cannot overwrite', body: 'second call' })
    assert.deepEqual(first, again)
    return { value: first, logs: [] }
  } })
  host.tools.register(humanShareTool(core))
  const denied = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'not-code', agent: host.agent, signal })
  assert.equal(denied.isError, true)
  const result = await host.tools.execute({ name: 'run_code', arguments: { code: 'controlled fixture', description: 'test native tool binding' }, callId: 'code-1', agent: host.agent, signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.equal(result.meta, undefined)
  assert.equal(host.session.events.filter(event => event.type === 'tool/code-dispatch').length, 2)
  const reopened = await HumanToolsCore.open(store, store.id)
  const surface = reopened.forResult(origin.scope, 'code-1')
  assert(humanSurface(surface))
  assert.equal(reopened.forResult(origin.scope, 'code-1:code:1'), undefined)
  host.ctx.provide('humanTools', { present: (scope, callId) => reopened.forResult(scope, callId) })
  const history = new WechatHistoryService(host.ctx)
  const event = resultEvent('code-1'), before = JSON.stringify(event)
  assert.deepEqual(history.presentRecord(origin.scope, { event }).event.data.meta.humanSurface, surface)
  assert.equal(history.presentRecord('other', { event }).event.data.meta, undefined)
  assert.equal(JSON.stringify(event), before)
  const large = resultEvent('code-1')
  large.data.message.content[0].text = 'large native Code Mode output '.repeat(10000)
  const preview = history.presentRecord(origin.scope, { event: large })
  assert(preview.detail, 'large native output keeps the existing on-demand detail path')
  assert.deepEqual(preview.event.data.meta.humanSurface, surface)
  assert(Buffer.byteLength(JSON.stringify(preview)) < 10 * 1024)
  await host.ctx.fiber.dispose()
})

test('official dynamic context carries durable receipt without Inbox or session events', async () => {
  const host = sdk(), { core, surface, store } = await fresh()
  const unregister = registerHumanContext(host.ctx, core)
  const prompt = host.ctx.get('systemPrompt')
  const context = { agent: host.agent, scope: host.agent }
  const snapshot = async () => renderContextSections(await prompt.assemble(context)).filter(item => item.name === HUMAN_CONTEXT_NAME)
  assert.deepEqual(await snapshot(), [])
  const before = structuredClone(host.session.events)
  const req = request(surface)
  await core.claim(req, signal)
  const receipt = await core.ack({ ...req, outcome: 'success' }, signal)
  assert.equal(receipt.delivery, 'recorded')
  assert.equal(host.sent.length, 0)
  assert.equal(host.agent.inbox.nextTurn.length, 0)
  assert.equal(host.agent.inbox.nextStep.length, 0)
  const sections = await snapshot()
  assert.equal(sections.length, 1)
  assert(sections[0].text.includes(receipt.receiptId))
  assert(sections[0].text.includes('不证明收件人'))
  const persisted = await store.load()
  assert.deepEqual(await snapshot(), sections, 'repeated assembly must not consume or write receipts')
  assert.deepEqual(await store.load(), persisted)
  assert.deepEqual(host.session.events, before)
  unregister()
  const reopened = await HumanToolsCore.open(store, store.id)
  const again = registerHumanContext(host.ctx, reopened)
  assert.deepEqual(await snapshot(), sections, 'context survives plugin state reload without native Inbox')
  const unsuppress = prompt.suppressRuntimeContext()
  assert.deepEqual(await snapshot(), [])
  unsuppress(); again()
  assert.deepEqual(await snapshot(), [])
  await host.ctx.fiber.dispose()
})

test('disabled/late-disposed service loads no state and never registers a tool', async () => {
  const host = sdk(), store = memory()
  let reads = 0
  const disabled = new HumanToolsService(host.ctx, { store: { load: async () => { reads++; return store.load() }, save: store.save } })
  assert.equal((await disabled.capabilities({ scope: origin.scope }, signal)).ok, false)
  assert.equal(reads, 0)
  assert.equal(host.tools.get(HUMAN_TOOL_NAME), undefined)
  await host.ctx.fiber.dispose()
  const late = sdk()
  let release
  new HumanToolsService(late.ctx, { enabled: true, store: { load: () => new Promise(resolve => { release = resolve }), save: store.save } })
  await late.ctx.fiber.dispose()
  release({ schemaVersion: 1, records: [] })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(late.tools.get(HUMAN_TOOL_NAME), undefined)
})

test('enabled owner RPC registers native tool, validates codec and survives duplicate concurrent ack', async () => {
  const host = sdk(), store = memory(), service = new HumanToolsService(host.ctx, { enabled: true, store })
  assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, true)
  const result = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'rpc-1', agent: host.agent, signal })
  const surface = result.meta.humanSurface, req = request(surface)
  assert.deepEqual(service.present(origin.scope, 'rpc-1'), surface)
  const wrong = await service.claim({ ...req, scope: 'not-this-session' }, signal)
  assert.equal(wrong.ok, false)
  assert.equal(wrong.error.code, 'human-surface-unavailable')
  assert.equal((await service.claim(req, signal)).ok, true)
  const replies = await Promise.all([1, 2, 3].map(() => service.ack({ ...req, outcome: 'success' }, signal)))
  for (const reply of replies) assert.deepEqual(reply, replies[0])
  assert.equal(JSON.parse(replies[0].valueJson).delivery, 'recorded')
  assert.equal(host.sent.length, 0)
  assert.equal((await service.status({ scope: origin.scope, surfaceId: surface.id }, signal)).ok, true)
  const ack = TYPERT.invocations.find(item => item.namespace === 'humanTools' && item.method === 'ack')
  assert(ack, 'generated host contract has the new owner RPC')
  assert(ack.parameters[0].codec.schema.safeParse({ ...req, outcome: 'success' }).success)
  assert(!ack.parameters[0].codec.schema.safeParse({ ...req, outcome: 'read' }).success)
  await host.ctx.fiber.dispose()
  assert.equal((await service.status({ scope: origin.scope, surfaceId: surface.id }, signal)).ok, false)
  assert.equal(host.tools.get(HUMAN_TOOL_NAME), undefined)
})

test('actual generated gateway preserves forbidden reference keys for rejection; native context keeps the valid locator', async t => {
  const host = sdk(), store = memory()
  t.after(() => host.ctx.fiber.dispose())
  const registry = new TypertRegistry(host.ctx)
  registry.register(TYPERT)
  const gateway = new TypertGatewayService(host.ctx)
  const service = new HumanToolsService(host.ctx, { enabled: true, store })
  await service.capabilities({ scope: origin.scope }, signal)
  const invoke = (method, req) => gateway.invoke({ namespace: 'humanTools', method, args: { request: req }, signal })
  const made = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: input, callId: 'gateway-source', agent: host.agent, signal })
  const surface = made.meta.humanSurface, req = request(surface)
  assert.equal((await invoke('claim', req)).ok, true)
  const before = structuredClone(host.session.events)
  for (const key of ['roomid', 'memberID', 'token']) {
    const result = await invoke('ack', { ...req, outcome: 'success', taskRef: { ...taskRef, [key]: 'forbidden' } })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'human-action-invalid')
  }
  const result = await invoke('ack', { ...req, outcome: 'success', taskRef })
  assert.equal(result.ok, true)
  const receipt = JSON.parse(result.valueJson)
  assert.deepEqual(receipt.taskRef, taskRef)
  const contexts = renderContextSections(await host.ctx.get('systemPrompt').assemble({ agent: host.agent, scope: host.agent }))
  const context = contexts.find(section => section.name === HUMAN_CONTEXT_NAME)
  const snapshot = JSON.parse(context.text.slice(context.text.indexOf('\n') + 1))
  assert.deepEqual(snapshot.receipts[0].taskRef, taskRef)
  assert(context.text.includes('不授予群身份'))
  assert.deepEqual(host.session.events, before)
  assert.equal(host.sent.length, 0)
  assert.equal(host.agent.inbox.nextTurn.length, 0)
  assert.equal(host.agent.inbox.nextStep.length, 0)
  assert.deepEqual(host.tools.schemas().filter(tool => tool.name.startsWith('human_')).map(tool => tool.name), [HUMAN_TOOL_NAME, HUMAN_MEMBERS_TOOL_NAME, HUMAN_REMIND_TOOL_NAME])
  const target = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: { ...input, sourceSurfaceId: surface.id },
    callId: 'gateway-target', agent: host.agent, signal })
  assert.equal(target.isError, false)
  assert.deepEqual(target.meta.humanSurface.targetTaskRef, taskRef)
  for (const extra of [{ taskRef }, { targetTaskRef: taskRef }, { taskId: taskRef.taskId }, { roomid: 'forbidden' }]) {
    const denied = await host.tools.execute({ name: HUMAN_TOOL_NAME, arguments: { ...input, ...extra },
      callId: 'forged-target', agent: host.agent, signal })
    assert.equal(denied.isError, true)
  }
})

test('live reused session generation rejects claim but delayed ACK only reconciles its original ledger', async t => {
  const host = sdk(), { core, surface, store } = await fresh(), req = request(surface)
  t.after(() => host.ctx.fiber.dispose())
  await core.claim(req, signal)
  const service = new HumanToolsService(host.ctx, { enabled: true, store })
  await service.capabilities({ scope: origin.scope }, signal)
  const reused = { ...host.agent, session: { id: origin.scope, header: { ...host.session.header, createdAt: 200 } } }
  host.ctx.get('sessions').get = () => reused.session
  host.ctx.get('agents').get = () => reused
  const rejected = await service.claim(req, signal)
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'human-origin-conflict')
  assert.equal((await service.ack({ ...req, outcome: 'success', taskRef }, signal)).ok, true)
  const contexts = renderContextSections(await host.ctx.get('systemPrompt').assemble({ agent: reused, scope: reused }))
  assert.equal(contexts.some(section => section.name === HUMAN_CONTEXT_NAME), false)
  assert.equal(host.sent.length, 0)
  assert.equal(host.agent.inbox.nextTurn.length, 0)
})

test('cold claims use the official read-only query header without activating a Session or Agent', async t => {
  for (const method of ['filterSessions', 'listSessions']) await t.test(method, async t => {
    const host = sdk('native', false), { core, surface, store } = await fresh()
    await core.close()
    t.after(() => host.ctx.fiber.dispose())
    let listed = 0, queried = 0
    host.ctx.provide('sessionPersistence', {
      async list(querySignal) { querySignal.throwIfAborted(); listed++; return [structuredClone(host.session.header)] },
      inspect() { assert.fail('claim must not load the conversation log') },
      restore() { assert.fail('claim must not restore a session') },
    })
    const query = new SessionQueryEngine(host.ctx)
    await new Promise(resolve => setImmediate(resolve))
    if (method === 'listSessions') query.filterSessions = undefined
    const native = query[method].bind(query)
    query[method] = (...args) => {
      queried++
      if (method === 'filterSessions') assert.deepEqual(args[0], [{ kind: 'id', values: [origin.scope] }])
      return native(...args)
    }
    const sessions = host.ctx.get('sessions')
    for (const name of ['create', 'prepare', 'enter']) sessions[name] = () => assert.fail('claim cannot acquire a live session')
    host.ctx.get('agents').get = () => assert.fail('claim cannot load or inspect an Agent')
    const service = new HumanToolsService(host.ctx, { enabled: true, store })
    const response = await service.claim(request(surface), signal)
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(queried, 1)
    assert.equal(listed, 1)
    assert.equal(sessions.get(origin.scope), undefined)
    assert.equal(host.session.events.length, 0)
    assert.equal(host.sent.length, 0)
    assert.equal(host.agent.inbox.nextTurn.length, 0)
  })
})

test('live claims validate their header and do not depend on optional persistence', async t => {
  const host = sdk(), { core, surface, store } = await fresh()
  await core.close()
  t.after(() => host.ctx.fiber.dispose())
  host.ctx.provide('sessionQuery', { filterSessions() { assert.fail('a live header does not need persistence') } })
  host.ctx.get('agents').get = () => assert.fail('claim cannot inspect an Agent')
  const service = new HumanToolsService(host.ctx, { enabled: true, store })
  const req = request(surface), before = await store.load()
  for (const header of [undefined, { createdAt: 100 }, { ...host.session.header, id: 'different-session' },
    { ...host.session.header, createdAt: -1 }, { ...host.session.header, createdAt: 1.5 },
    { ...host.session.header, createdAt: '100' }]) {
    host.ctx.get('sessions').get = () => ({ id: origin.scope, header })
    const response = await service.claim(req, signal)
    assert.equal(response.ok, false)
    assert.equal(response.error.code, 'human-origin-unavailable')
    assert.deepEqual(await store.load(), before)
  }
  host.ctx.get('sessions').get = () => host.session
  assert.equal((await service.claim(req, signal)).ok, true)
})

test('cold claims reject replaced, deleted, malformed, ambiguous and unavailable directory identities', async t => {
  const cases = [
    { name: 'replaced generation', headers: header => [{ ...header, createdAt: 200 }], code: 'human-origin-conflict' },
    { name: 'deleted session', headers: () => [] },
    { name: 'another session', headers: header => [{ ...header, id: 'other' }] },
    { name: 'ambiguous generation', headers: header => [header, { ...header, createdAt: 200 }] },
    { name: 'invalid createdAt', headers: header => [{ ...header, createdAt: -1 }] },
    { name: 'missing header', rows: [{}] },
    { name: 'invalid directory', rows: { items: [] } },
    { name: 'missing query service', missing: true },
    { name: 'missing read API', query: {} },
    { name: 'query failure', query: { filterSessions: async () => { throw Error('controlled read failure') },
      listSessions: async () => assert.fail('failed preferred query must not fall back') } },
  ]
  for (const fixture of cases) await t.test(fixture.name, async t => {
    const host = sdk('native', false), { core, surface, store } = await fresh()
    await core.close()
    t.after(() => host.ctx.fiber.dispose())
    const before = await store.load()
    if (!fixture.missing) host.ctx.provide('sessionQuery', fixture.query || {
      filterSessions: async () => fixture.headers
        ? fixture.headers(host.session.header).map(header => ({ header, live: false, persisted: true })) : fixture.rows,
    })
    host.ctx.get('agents').get = () => assert.fail('rejection cannot activate an Agent')
    const service = new HumanToolsService(host.ctx, { enabled: true, store })
    const response = await service.claim(request(surface), signal)
    assert.equal(response.ok, false)
    assert.equal(response.error.code, fixture.code || 'human-origin-unavailable')
    assert.deepEqual(await store.load(), before)
    assert.equal(host.ctx.get('sessions').get(origin.scope), undefined)
    assert.equal(host.sent.length, 0)
  })
})

test('cold claim cancellation or disposal cannot persist a late query result', async t => {
  for (const stop of ['cancel', 'dispose']) await t.test(stop, async t => {
    const host = sdk('native', false), { core, surface, store } = await fresh()
    await core.close()
    const entered = deferred(), complete = deferred(), before = await store.load(), abort = new AbortController()
    let querySignal
    t.after(async () => { complete.resolve([]); await host.ctx.fiber.dispose() })
    host.ctx.provide('sessionQuery', { async filterSessions(_filters, receivedSignal) {
      querySignal = receivedSignal; entered.resolve(); return complete.promise
    } })
    const service = new HumanToolsService(host.ctx, { enabled: true, store })
    const pending = service.claim(request(surface), abort.signal)
    await entered.promise
    if (stop === 'cancel') abort.abort(Object.assign(new Error('controlled cancellation'), { code: 'test-cancelled' }))
    else await host.ctx.fiber.dispose()
    const response = await pending
    assert.equal(response.ok, false)
    assert.equal(response.error.code, stop === 'cancel' ? 'test-cancelled' : 'human-tools-disabled')
    assert.equal(querySignal.aborted, true)
    complete.resolve([{ header: structuredClone(host.session.header), live: false, persisted: true }])
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(await store.load(), before)
    assert.equal(host.ctx.get('sessions')?.get(origin.scope), undefined)
    assert.equal(host.sent.length, 0)
  })
})

test('context registration failure rolls back only the optional tool; host context remains intact', async () => {
  const host = sdk(), store = memory()
  const prompt = host.ctx.get('systemPrompt')
  prompt.context({ name: HUMAN_CONTEXT_NAME, order: 80, text: 'existing-owner' })
  const service = new HumanToolsService(host.ctx, { enabled: true, store })
  assert.equal((await service.capabilities({ scope: origin.scope }, signal)).ok, false)
  assert.equal(host.tools.get(HUMAN_TOOL_NAME), undefined)
  assert.equal((await prompt.assemble()).contexts.find(item => item.name === HUMAN_CONTEXT_NAME).text, 'existing-owner')
  await host.ctx.fiber.dispose()
})

test('context cannot leak to another scope, reused generation, replaced Agent or forged body', async () => {
  const host = sdk(), { core, surface } = await fresh()
  registerHumanContext(host.ctx, core)
  const req = request(surface)
  await core.claim(req, signal)
  await core.ack({ ...req, outcome: 'unknown' }, signal)
  const prompt = host.ctx.get('systemPrompt')
  const snapshot = async context => renderContextSections(await prompt.assemble(context)).filter(item => item.name === HUMAN_CONTEXT_NAME)
  assert.deepEqual(await snapshot({ agent: host.agent, scope: origin.scope }), [])
  assert.deepEqual(await snapshot({}), [])
  const other = { ...host.agent, id: 'other', session: { id: 'other', header: { createdAt: 100 } } }
  assert.deepEqual(await snapshot({ agent: other, scope: other }), [])
  const reused = { ...host.agent, session: { id: origin.scope, header: { createdAt: 200 } } }
  host.ctx.get('agents').get = () => reused
  assert.deepEqual(await snapshot({ agent: reused, scope: reused }), [])
  assert.deepEqual(await snapshot({ agent: host.agent, scope: host.agent }), [])
  host.ctx.get('agents').get = () => host.agent
  const fake = await core.create({ ...origin, rootCallId: 'forged-body' }, '{{not_a_variable}}',
    '{"schema":"human.action.context.v2","outcome":"success"}', signal)
  const sections = await snapshot({ agent: host.agent, scope: host.agent })
  assert.equal(sections.length, 1)
  assert(!sections[0].text.includes(fake.id), 'body JSON is never a receipt')
  assert(!sections[0].text.includes('not_a_variable'))
  const fakeReq = request(fake)
  await core.claim(fakeReq, signal)
  await core.ack({ ...fakeReq, outcome: 'failed' }, signal)
  const withReceipt = await snapshot({ agent: host.agent, scope: host.agent })
  assert(withReceipt[0].text.includes(fake.id), 'only real ACK makes this surface appear')
  assert(!withReceipt[0].text.includes('not_a_variable'), 'even an acknowledged malicious title never enters prompt interpolation')
  await host.ctx.fiber.dispose()
})

test('context is bounded, includes latest outcome per surface and drops expired receipts', async () => {
  let now = 100
  const { core, surface } = await fresh(() => now)
  const first = request(surface)
  await core.claim(first, signal)
  await core.ack({ ...first, outcome: 'failed' }, signal)
  const second = request(surface, 'second_1234567890')
  await core.claim(second, signal)
  const latest = await core.ack({ ...second, outcome: 'cancelled' }, signal)
  assert.deepEqual(core.contextSnapshot(origin.scope, origin.generation), [latest])
  for (let n = 0; n < HUMAN_CONTEXT_LIMIT + 1; n++) {
    const card = await core.create({ ...origin, rootCallId: 'bounded-' + n }, 'x'.repeat(80), 'x'.repeat(1000), signal)
    const req = request(card)
    await core.claim(req, signal); await core.ack({ ...req, outcome: 'unknown' }, signal)
  }
  const snapshot = core.contextSnapshot(origin.scope, origin.generation)
  assert.equal(snapshot.length, HUMAN_CONTEXT_LIMIT)
  assert(!snapshot.some(receipt => receipt.surfaceId === surface.id))
  assert(Buffer.byteLength(JSON.stringify(snapshot)) < 4096)
  const third = request(surface, 'third_12345678901')
  await core.claim(third, signal)
  const recent = await core.ack({ ...third, outcome: 'success' }, signal)
  assert.equal(core.contextSnapshot(origin.scope, origin.generation).at(-1).receiptId, recent.receiptId,
    'a newly acknowledged old card must stay in the bounded recent context')
  now += HUMAN_RETENTION_MS
  assert.deepEqual(core.contextSnapshot(origin.scope, origin.generation), [])
})

test('history/live share one bounded projection, arbitrary other metadata remains filtered', async () => {
  const { core, surface } = await fresh()
  const ctx = new Context()
  ctx.provide('humanTools', { present: (scope, id) => core.forResult(scope, id) })
  const history = new WechatHistoryService(ctx)
  const feeds = [], messages = []
  const gateway = { wireStream: { async open(_endpoint, _payload, signal) {
    const feed = new Readable({ objectMode: true, read() {} }); feed.on('error', () => {})
    signal.addEventListener('abort', () => feed.destroy(), { once: true })
    feed.push({ type: 'ready', clientId: 'human-tools-test' }); return feed
  } }, async invoke() { return { items: [{ sessionId: origin.scope }] } }, async stream(plan) {
    const feed = new Readable({ objectMode: true, read() {} }); feed.on('error', () => {})
    plan.signal.addEventListener('abort', () => feed.destroy(), { once: true })
    feeds.push({ feed, plan }); feed.push({ type: 'snapshot', cursor: 1, records: [] }); return feed
  } }
  const realtime = new DshRealtimeCompatibility({ get: name => name === 'typertGateway' ? gateway : name === 'wechatHistory' ? history : undefined })
  const detach = realtime.connect('/api/events.mux', { readyState: 1, bufferedAmount: 0,
    send: message => messages.push(JSON.parse(message)), close() {} })
  realtime.subscribeSession(origin.scope)
  await until(() => feeds.some(item => item.plan.namespace === 'session' && item.plan.method === 'follow'))
  const event = resultEvent(origin.callId, { internalTrace: 'x'.repeat(200000), path: '/allowed' })
  const before = JSON.stringify(event)
  feeds.find(item => item.plan.namespace === 'session' && item.plan.method === 'follow').feed.push({ type: 'event', event })
  await until(() => messages.some(item => item.payload?.event?.seq === 4))
  const live = messages.find(item => item.payload?.event?.seq === 4).payload
  const past = history.presentRecord(origin.scope, { event })
  assert.deepEqual(live.event.data.meta, past.event.data.meta)
  assert.deepEqual(live.event.data.meta, { path: '/allowed', humanSurface: surface })
  assert.equal(JSON.stringify(event), before)
  const bigEvent = resultEvent(origin.callId)
  bigEvent.seq = 5
  bigEvent.data.message.content[0].text = 'large'.repeat(40000)
  feeds.find(item => item.plan.namespace === 'session' && item.plan.method === 'follow').feed.push({ type: 'event', event: bigEvent })
  await until(() => messages.some(item => item.payload?.event?.seq === 5))
  const bigLive = messages.find(item => item.payload?.event?.seq === 5).payload
  assert(bigLive.detail)
  assert.deepEqual(bigLive.event.data.meta.humanSurface, surface)
  assert.deepEqual(history.presentRecord(origin.scope, { event: bigEvent }).event.data, bigLive.event.data)
  const malformed = toolRecordPresentation({ event: resultEvent('other', { humanSurface: { ...surface, command: 'exec' }, private: 'hidden', path: '/allowed' }) })
  assert.deepEqual(malformed.event.data.meta, { path: '/allowed' })
  detach(); realtime.dispose(); await ctx.fiber.dispose()
})
