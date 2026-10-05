import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { HumanToolsCore, HUMAN_RETENTION_MS } from '../lib/human-tools/core.js'
import { HUMAN_WORKFLOW_ACTION, humanSurface } from '../lib/human-tools/protocol.js'
import { registerHumanContext, humanShareTool, humanMembersTool, humanRemindTool } from '../lib/human-tools/dsh.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'
import { createCapabilityManifest } from '../lib/human-workflow/capabilities.js'
import { workflowQueryTools } from '../lib/human-workflow/query-tools.js'

// Local protocol/prompt wiring only: no LLM invocation, WeChat operation,
// production state, or claim of real-user conversational acceptance.
const signal = new AbortController().signal
const origin = { scope: 'business-session', generation: '100', callId: 'call', rootCallId: 'root' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const draft = kind => ({ schema: 'human.lifecycle.draft.ref.v1', kind, draftId: kind.padEnd(24, 'x'), version: 1, digest: 'a'.repeat(64) })
const initial = () => ({ title: '收集答复', instructions: '填写本次答复。', closesAt: null, recipientRefs: null,
  form: { schema: 'human.form.v2', fields: [{ key: 'reply', label: '答复', kind: 'short-text', required: true, maxLength: 80 }], attachment: null } })
function memory(value = { schemaVersion: 1, records: [] }) {
  let state = structuredClone(value), writes = 0
  return { load: async () => structuredClone(state), save: async value => { state = structuredClone(value); writes++ },
    get value() { return structuredClone(state) }, get writes() { return writes } }
}
const id = () => randomBytes(16).toString('hex')
function request(surface) {
  return { scope: origin.scope, surfaceId: surface.id, revision: 1, actionId: surface.actions[0].id, attemptId: 'attempt_1234567890' }
}
async function fixture(t, store = memory(), now) {
  const core = await HumanToolsCore.open(store, id, now)
  t.after(() => core.close())
  return { core, store }
}

test('workflow surfaces describe business effects while retaining the exact legacy authorization action', async t => {
  const { core } = await fixture(t)
  const expected = {
    round: { title: '补充提交要求', body: /更新原任务页面，不会另建任务或自动发群/ },
    review: { title: '给提交者的反馈', body: /仅你和对应成员可在任务页查看，不会自动通知/ },
    reminder: { title: '提醒参与者', body: /提醒还没发出/ },
  }
  for (const [kind, copy] of Object.entries(expected)) {
    const ref = draft(kind), surface = await core.createWorkflow({ ...origin, rootCallId: kind }, taskRef, ref, signal)
    assert.equal(surface.title, copy.title)
    assert.match(surface.body, copy.body)
    assert(!/审核|批准版本|第.*轮/.test(surface.title + surface.body))
    assert.deepEqual(surface.actions, [HUMAN_WORKFLOW_ACTION], 'only display semantics change, not the signed action contract')
    assert.equal(surface.actions[0].label, '审核任务方案', 'historical wire label remains readable by existing peers')
    assert.deepEqual(surface.workflowRef, ref)
    assert.deepEqual(surface.targetTaskRef, taskRef)
    assert.deepEqual(humanSurface(surface), surface)
    assert(!JSON.stringify(surface).includes('private-evaluation-text'))
  }
})

test('historical workflow cards retain their stored copy and digest on reopen or repeated invocation', async t => {
  const ref = draft('review'), oldSurface = { schemaVersion: 1, kind: 'human.surface', id: '1'.repeat(32), revision: 1,
    title: '审核个人反馈', body: '方案尚未批准。请核对准确内容、对象与版本。', targetTaskRef: taskRef, workflowRef: ref,
    actions: [HUMAN_WORKFLOW_ACTION] }
  const store = memory({ schemaVersion: 1, records: [{ surface: oldSurface, origin, createdAt: 100, attempts: [] }] })
  const { core } = await fixture(t, store, () => 200)
  const before = store.value
  assert.deepEqual(core.forResult(origin.scope, origin.rootCallId, origin.generation), oldSurface)
  assert.deepEqual(await core.createWorkflow(origin, taskRef, ref, signal), oldSurface)
  assert.deepEqual(store.value, before)
  assert.equal(store.writes, 0)
  await assert.rejects(core.createWorkflow(origin, taskRef, { ...ref, digest: 'b'.repeat(64) }, signal), { code: 'human-target-conflict' })
  assert.equal(humanSurface({ ...oldSurface, actions: [{ ...HUMAN_WORKFLOW_ACTION, label: '我替你批准' }] }), undefined)
})

test('context action semantics derive from saved surfaces without mutating wire receipts or granting authority', async t => {
  let now = 100
  const { core, store } = await fixture(t, memory(), () => now)
  const surface = await core.createWorkflow(origin, taskRef, draft('review'), signal), action = request(surface)
  await core.claim(action, signal)
  const receipt = await core.ack({ ...action, outcome: 'success' }, signal)
  const before = store.value, writes = store.writes
  assert.deepEqual(core.contextSnapshot(origin.scope, origin.generation), [receipt], 'existing receipt API is unchanged')
  assert.deepEqual(core.contextActionSnapshot(origin.scope, origin.generation), [{ ...receipt, actionId: 'workflow-approve', workflowKind: 'review' }])
  assert(!Object.hasOwn(receipt, 'actionId'))
  assert(!Object.hasOwn(receipt, 'taskRef'), 'workflow receipt cannot mint share authority')
  assert.deepEqual(core.contextActionSnapshot('other', origin.generation), [])
  assert.deepEqual(core.contextActionSnapshot(origin.scope, '200'), [])
  assert.deepEqual(store.value, before)
  assert.equal(store.writes, writes)
  now += HUMAN_RETENTION_MS
  assert.deepEqual(core.contextActionSnapshot(origin.scope, origin.generation), [])
})

test('runtime context distinguishes workflow confirmation from group delivery and never interpolates user copy', async t => {
  const { core } = await fixture(t)
  const surface = await core.createWorkflow(origin, taskRef, draft('round'), signal), action = request(surface)
  await core.claim(action, signal); await core.ack({ ...action, outcome: 'success' }, signal)
  const noisy = await core.create({ ...origin, rootCallId: 'untrusted-title' }, 'PRIVATE_TITLE_NOT_CONTEXT', 'PRIVATE_BODY_NOT_CONTEXT', signal)
  await core.claim(request(noisy), signal); await core.ack({ ...request(noisy), outcome: 'failed' }, signal)
  let context
  const agent = { id: origin.scope, session: { id: origin.scope, header: { createdAt: 100 } } }
  const services = { agents: { get: () => agent }, systemPrompt: { context: value => { context = value; return () => {} } } }
  registerHumanContext({ get: name => services[name] }, core)
  const text = context.text({ agent, scope: agent }), payload = JSON.parse(text.slice(text.indexOf('\n') + 1))
  assert.match(text, /workflow-approve 的 success 是确认流程的客户端回执，不是微信发送成功/)
  assert.match(text, /drafts\[\]\.effects/)
  assert.match(text, /published 本身也不代表通知已发出/)
  assert.match(text, /不承诺持续盯进度/)
  assert(!text.includes('PRIVATE_TITLE_NOT_CONTEXT')); assert(!text.includes('PRIVATE_BODY_NOT_CONTEXT'))
  assert.deepEqual(payload.receipts.map(item => [item.actionId, item.workflowKind]), [['workflow-approve', 'round'], ['share', undefined]])
  assert.equal(context.text({ agent, scope: {} }), '')
})

test('tools distinguish a new assignment, an existing-task update, private feedback and an actual notice', async t => {
  const { core } = await fixture(t)
  const tools = lifecycleTools({ nodeId: 'test_node', core, lifecycle: {}, assertAgent() {} })
  const byName = name => tools.find(tool => tool.name === name)
  const create = byName('human_task_create'), round = byName('human_task_prepare_round'), review = byName('human_task_prepare_review'), reminder = byName('human_task_prepare_reminder')
  assert.match(create.description, /multiple independent tasks can coexist/)
  assert.match(create.description, /NEW task, not a new round or replacement of the source task/)
  assert.match(create.description, /Either source option alone only reuses the source group and does not select members/)
  assert.equal(create.parameters.properties.initialRound.properties.recipientRefs.type, 'null')
  assert.match(round.description, /independent matter or a separately assigned new task uses human_task_create/)
  assert.match(review.description, /NOT a message or notification/)
  assert.match(reminder.description, /Preparing or approving is not sending/)
  assert.match(byName('human_task_lifecycle').description, /drafts\[\]\.effects/)
  for (const [kind, tool] of [['round', round], ['review', review], ['reminder', reminder]]) {
    const surface = await core.createWorkflow({ ...origin, rootCallId: kind }, taskRef, draft(kind), signal)
    const result = tool.output.render({}, { surface })[0].text
    assert.match(result, /尚未生效，也未发送微信群消息/)
    assert.match(result, /不把页面更新说成已通知/)
    assert(!result.includes(taskRef.taskId)); assert(!result.includes(draft(kind).draftId))
    assert.deepEqual(tool.output.presentationMeta({}, { surface }).humanSurface, surface)
  }
  assert.match(humanRemindTool(core).description, /private feedback\/page update is not a reminder/)
  assert.match(humanMembersTool(core).description, /not a notification or a new assignment/)
  assert.match(humanShareTool(core).description, /profession|professional language/)
})

test('separate assignments in one conversation preserve independent surfaces rather than appending a round', async t => {
  const { core, store } = await fixture(t)
  const first = await core.createCollection(origin, '本周进展', '请提交本周进展。', initial(), signal)
  const secondOrigin = { ...origin, callId: 'second', rootCallId: 'second' }
  const second = await core.createCollection(secondOrigin, '下周安排', '请提交下周安排。', initial(), signal)
  assert.notEqual(first.id, second.id)
  assert.equal(first.workflowRef, undefined); assert.equal(second.workflowRef, undefined)
  assert.deepEqual(store.value.records.map(record => record.surface.id), [first.id, second.id])
  assert.deepEqual(await core.createCollection(secondOrigin, '下周安排', '请提交下周安排。', initial(), signal), second)
})

test('skill decision guidance keeps notification facts, user intent and unsupported preselection separate', () => {
  const text = HUMAN_WORKFLOW_SKILL.content
  assert.match(text, /同一会话可以并存多项独立任务/)
  assert.match(text, /用户另布置一项、要求单独发一份或提出独立事项时，用 human_task_create/)
  assert.match(text, /只有延续原事项、确实要求重新提交或补充资料时，才用 human_task_prepare_round/)
  assert.match(text, /不能只更新页面就说已通知/)
  assert.match(text, /不是原生成员选择器预选/)
  assert.match(text, /drafts\[\]\.effects/)
  assert.match(text, /记忆与回复都不能把它或 surface success 改写成“已提醒”/)
  assert.match(text, /旧服务缺少执行状态时保持未知/)
  assert.match(text, /没有已批准且实际运行的处理规则或通知机制，不承诺/)
})

test('private publication offers trusted conversation confirmation without granting an Agent self-approval or native sending', () => {
  const tools = lifecycleTools({ nodeId: 'test_node', core: {}, lifecycle: {}, assertAgent() {} })
  assert(!tools.some(tool => /publish|approve/.test(tool.name)), 'a language claim must not introduce a node-side owner impersonation tool')
  for (const name of ['human_task_prepare_review', 'human_task_prepare_round']) {
    const tool = tools.find(tool => tool.name === name)
    assert.match(tool.description, /trusted client performs the SAME owner-authenticated approval/)
    assert.match(tool.description, /确认更新/)
    assert.match(tool.description, /query human_task_lifecycle to verify publication/)
    assert(!Object.hasOwn(tool.parameters.properties, 'approved'))
  }
  assert.match(tools.find(tool => tool.name === 'human_task_prepare_reminder').description, /real native send tap/)
  const skill = HUMAN_WORKFLOW_SKILL.content
  assert.match(skill, /可信客户端重新核对准确版本、主人身份和当前会话/)
  assert.match(skill, /原生问答工具的回答、引用、附件、含糊答复或夹带内容修改不能代替/)
  assert.match(skill, /产品入口限制，不声称主人从未授权/)
  assert.match(skill, /不能将本次确认升级为以后无人值守发布/)
  assert.match(skill, /结果未知只查询原草稿/)
  assert.match(skill, /不再重复问“要不要提醒”，也不自动发送/)
})

test('generic collection results preserve project context instead of assigning a teacher identity', async t => {
  const { core } = await fixture(t)
  const surface = await core.createCollection(origin, '项目本周进展', '请提交进展。', initial(), signal)
  const create = lifecycleTools({ nodeId: 'test_node', core, lifecycle: {}, assertAgent() {} }).find(tool => tool.name === 'human_task_create')
  const before = structuredClone(surface), result = create.output.render({}, { surface })[0].text
  assert.match(result, /保持当前助理的职业身份/)
  assert.match(result, /不因使用本工具改称用户的职业或替换任务语境/)
  assert(!/老师|教师|班级|学生/.test(result))
  assert.match(result, /尚未发布/)
  assert.deepEqual(create.output.presentationMeta({}, { surface }).humanSurface, before)
})

test('participation reminders and collection reminders are discoverably different optional operations', () => {
  assert.match(humanRemindTool({}).description, /NOT an unsubmitted form in a particular round/)
  assert.match(humanRemindTool({}).description, /human_task_prepare_reminder with the appropriate condition/)
  const capability = createCapabilityManifest('test_node').capabilities.find(item => item.id === 'action.remind-selected-pending')
  assert.match(capability.description, /参与确认不是表单提交/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /这个分支判断的是参与确认，不是某次表单是否提交/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /已掌握准确引用时无须为组合这些工具再次选人/)
})

test('optional rule-package memory does not become a mandatory replacement for the profession assistant work instance', () => {
  assert.match(HUMAN_WORKFLOW_SKILL.content, /仅在本次明确使用已启用的 human_mode 规则包时/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /普通单次任务不必为了记忆先创建或启用规则包/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /若当前预设实际提供 human_assistant_work_start\/get\/save/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /不要拿 human_workflow_save 代替它/)
})

test('query guidance checks freshness without making every user answer a diagnostic report', async () => {
  const seen = [], result = { freshness: { state: 'stale' }, tasks: [] }
  const tools = workflowQueryTools('test_node', { query: async (...args) => { seen.push(args); return result } })
  for (const tool of tools) {
    assert.match(tool.description, /Inspect freshness before interpreting facts; stale data is not current status/)
    assert.match(tool.description, /do not recite freshness enums/)
    assert(!tool.description.includes('Always report freshness'))
  }
  const exec = { agent: { id: origin.scope, session: { id: origin.scope, header: { id: origin.scope, createdAt: 100 } } }, signal }
  assert.deepEqual(await tools[0].execute({}, exec), result)
  assert.equal(seen.length, 1)
  assert.equal(seen[0][0].sessionId, origin.scope)
  assert.equal(JSON.parse(tools[0].output.render({}, result)[0].text).freshness.state, 'stale', 'model retains exact stale evidence')
})

test('current production errors are not labelled as test cards while stable error codes remain intact', async t => {
  const { core } = await fixture(t)
  assert.throws(() => core.assertGeneration(origin.scope, 'f'.repeat(32), origin.generation), cause => cause.code === 'human-surface-unavailable' && !cause.message.includes('测试'))
  await core.close()
  await assert.rejects(core.create(origin, '事项', '说明', signal), cause => cause.code === 'human-tools-disabled' && cause.message === '群任务功能已关闭')
  assert.throws(() => humanShareTool(core).output.render({}, {}), { message: '无效的任务卡片结果' })
})
