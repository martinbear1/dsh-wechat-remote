import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { lifecycleReminderContent, WorkflowLifecycle, receiverBinding } from '../lib/human-workflow/lifecycle.js'
import { ReceiverKeyring } from '../lib/human-workflow/receiver-keyring.js'
import { canonicalSubmission, sha256 } from '../lib/human-workflow/submission-crypto.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { workflowCapabilityContracts } from '../lib/human-workflow/capability-contracts.js'
import { HUMAN_WORKFLOW_SKILL } from '../lib/human-workflow/dsh-skill.js'

const signal = new AbortController().signal
const scope = { nodeId: 'node_audience_123456789', sessionId: 'session_a', sessionGeneration: '100' }
const taskRef = { schema: 'human.task.ref.v1', taskId: 't'.repeat(24), deliveryId: 'd'.repeat(24) }
const binding = { schema: 'human.node.binding.v1', nodeId: scope.nodeId, ownerSubject: 'owner', accountInstance: 'instance', generation: 'generation' }
const bindingKey = receiverBinding(binding, scope.nodeId).bindingKey
const content = () => ({ roundId: 'r'.repeat(24), title: '请完成作业', condition: 'pending-submission', recipientSource: 'task-audience' })
const legacy = () => ({ roundId: 'r'.repeat(24), title: '请查看反馈', condition: 'result-published', participantRefs: ['p'.repeat(24)] })
function store() { let value; return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next) } } }
async function fixture(t, { recipients = null, responseChange, rejectDraft = false } = {}) {
  const calls = [], keys = await ReceiverKeyring.open(store(), scope.nodeId)
  const transport = { nodeId: scope.nodeId, assertIdentity() {}, async request(endpoint, input) {
    calls.push(structuredClone({ endpoint, input }))
    if (endpoint === 'receiver-key') return { bindingKey, binding, key: input.key }
    if (endpoint === 'lifecycle' && input.operation === 'get') return { taskRef, origin: { scope: scope.sessionId, sessionGeneration: scope.sessionGeneration },
      binding, bindingKey, revision: 1, rounds: [{ id: content().roundId, number: 1, title: '本次要求', recipientRefs: recipients }],
      participants: [], submissions: [], drafts: [], nextOffset: null }
    if (endpoint === 'lifecycle' && input.operation === 'reminder-draft') {
      if (rejectDraft) throw Object.assign(new Error('No supported immutable audience'), { code: 'reminder_audience_unavailable' })
      const draft = { taskRef, expectedRevision: 1, content: structuredClone(input.content), state: 'draft', expiresAt: 2000,
        context: { taskTitle: '独立任务', roundTitle: '本次要求', reminderTargetCount: 2 },
        draftRef: { schema: 'human.lifecycle.draft.ref.v1', draftId: 'a'.repeat(24), kind: 'reminder', version: 1,
          digest: sha256(canonicalSubmission({ taskRef, kind: 'reminder', expectedRevision: 1, content: input.content })) } }
      responseChange?.(draft)
      return { draft }
    }
    assert.fail('Unexpected request')
  } }
  const runtime = await WorkflowLifecycle.open({ transport, keys, store: store() })
  t.after(async () => { await runtime.close(); await keys.close() })
  return { calls, runtime, prepare: value => runtime.prepare(scope, taskRef, 'reminder', 1, value, 'request_1234567890', signal) }
}

test('reminder source choices are mutually exclusive and preserve old exact content bytes', () => {
  const old = legacy()
  assert.equal(JSON.stringify(lifecycleReminderContent(old)), JSON.stringify(old))
  assert.deepEqual(lifecycleReminderContent(content()), content())
  for (const bad of [
    { ...content(), participantRefs: [] }, { ...content(), participantRefs: undefined }, { ...content(), recipientSource: 'all-group' },
    { ...content(), condition: 'result-published' }, { ...content(), openIds: ['forged'] },
    { ...legacy(), recipientSource: 'task-audience' }, { ...legacy(), participantRefs: [] },
    { ...legacy(), participantRefs: ['p'.repeat(24), 'p'.repeat(24)] }, { ...legacy(), participantRefs: ['guessed'] },
  ]) assert.equal(lifecycleReminderContent(bad), undefined)
})

test('a new-task reminder can prepare before anyone opens without inventing participants or changing its content digest', async t => {
  const f = await fixture(t), request = content(), original = structuredClone(request)
  const result = await f.prepare(request)
  assert.deepEqual(request, original)
  assert.deepEqual(result.content, original)
  assert.equal(result.context.reminderTargetCount, 2)
  assert.equal(result.draftRef.digest, sha256(canonicalSubmission({ taskRef, kind: 'reminder', expectedRevision: 1, content: original })))
  assert.equal(f.calls.filter(call => call.input.operation === 'reminder-draft').length, 1)
  assert(f.calls.every(call => ['lifecycle', 'receiver-key'].includes(call.endpoint)))
  assert(!JSON.stringify(result.content).includes('participantRefs'))
  assert(!f.calls.some(call => /claim|notify|publish|share/.test(call.endpoint + call.input.operation)))
})

test('invalid scope choices fail before drafting and cloud audience denial is never widened or retried', async t => {
  const f = await fixture(t)
  await assert.rejects(f.prepare({ ...content(), condition: 'result-published' }), { code: 'lifecycle-reminder-invalid' })
  assert.equal(f.calls.length, 0)
  const privateRound = await fixture(t, { recipients: ['p'.repeat(24)] })
  await assert.rejects(privateRound.prepare(content()), { code: 'lifecycle-reminder-invalid' })
  assert(!privateRound.calls.some(call => call.input.operation === 'reminder-draft'))
  const cloud = await fixture(t, { rejectDraft: true })
  await assert.rejects(cloud.prepare(content()), { code: 'reminder_audience_unavailable' })
  assert.equal(cloud.calls.filter(call => call.input.operation === 'reminder-draft').length, 1)
})

test('display target counts are bounded metadata and cannot replace exact reminder approval content', async t => {
  for (const reminderTargetCount of [-1, 21, 1.5, '2']) {
    const f = await fixture(t, { responseChange: draft => { draft.context.reminderTargetCount = reminderTargetCount } })
    await assert.rejects(f.prepare(content()), { code: 'lifecycle-response-invalid' })
  }
  const changed = await fixture(t, { responseChange: draft => { draft.content.title = '被替换' } })
  await assert.rejects(changed.prepare(content()), { code: 'lifecycle-response-invalid' })
  for (const reminderTargetCount of [0, 20]) {
    const f = await fixture(t, { responseChange: draft => { draft.context.reminderTargetCount = reminderTargetCount } })
    assert.equal((await f.prepare(content())).context.reminderTargetCount, reminderTargetCount)
  }
})

test('native tool schema and discovery expose a separately clicked reminder, not implicit all-group or joint share authority', () => {
  const tool = lifecycleTools({ nodeId: scope.nodeId, lifecycle: {}, core: {}, assertAgent() {} }).find(item => item.name === 'human_task_prepare_reminder')
  assertSupportedJsonSchema(tool.parameters)
  const variants = tool.parameters.properties.content.oneOf
  assert.equal(variants.length, 4)
  assert(variants[0].required.includes('participantRefs'))
  assert.equal(variants[0].properties.recipientSource, undefined)
  assert(variants[1].required.includes('recipientSource'))
  assert.equal(variants[1].properties.participantRefs, undefined)
  assert.equal(variants[1].properties.condition.const, 'pending-submission')
  assert.equal(variants[2].properties.recipientSource.const, 'selected-members')
  assert(variants[2].required.includes('selectionRef'))
  assert.equal(variants[3].properties.recipientSource.const, 'exact-references')
  assert.equal(variants[3].properties.condition.const, 'none')
  assert.deepEqual(tool.parameters.properties.preview.enum, ['inline', 'page'])
  assert.match(tool.description, /separate native @ and original-task-link message/)
  assert.match(tool.description, /native target preview and real send tap/)
  const contract = workflowCapabilityContracts().reminders
  assert.equal(contract.taskAudience.beforeMemberFirstOpen, true)
  assert.equal(contract.taskAudience.createsParticipantRecords, false)
  assert.equal(contract.taskAudience.rosterEnumeration, false)
  assert.equal(contract.taskAudience.eligibility, 'rechecked-at-execution')
  assert.equal(contract.taskAudience.previewCount, 'informational-not-authorization')
  assert.equal(contract.automaticAfterShare, false)
  assert.equal(contract.singleGestureCombination.status, 'unverified')
  assert.equal(contract.singleGestureCombination.toolExposed, false)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /只发卡、只提醒已有任务、或发卡后另行提醒/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /全员任务不等于有全群可@名单/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /已发布指定任务的完整受众中排除已提交者/)
  assert.match(HUMAN_WORKFLOW_SKILL.content, /准备方案或确认对象不等于提醒已发出/)
})
