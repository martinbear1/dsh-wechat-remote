import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ASSISTANT_INTERACTION_GUIDANCE, ASSISTANT_AUTHORING_GUIDANCE, HUMAN_TASK_CONTENT_GUIDANCE } from '../lib/assistant-presets/interaction-guidance.js'
import { assistantDefinition, assistantGuidance } from '../lib/assistant-presets/definition.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'
import { assistantTools, registerAssistantContext } from '../lib/assistant-presets/tools.js'
import { createNativeAssistantAdapter } from '../lib/assistant-presets/native-adapter.js'
import { HUMAN_WORKFLOW_SKILL, registerHumanWorkflowSkill } from '../lib/human-workflow/dsh-skill.js'
import { lifecycleTools } from '../lib/human-workflow/lifecycle-tools.js'
import { HUMAN_MEMBER_FORM_SCHEMA } from '../lib/human-workflow/member-form-schema.js'
import { humanShareTool } from '../lib/human-tools/dsh.js'
import { humanForm, humanInitialRound } from '../lib/human-tools/form.js'
import { humanSurface } from '../lib/human-tools/protocol.js'

// Prompt/rule wiring contracts only. These tests neither invoke an LLM nor
// establish conversational quality, WeChat behavior, or real user approval.
const signal = new AbortController().signal
const unreachable = () => assert.fail('this contract test must not execute an external operation')
const definition = () => ({ schemaVersion: 1, name: '项目协作助理', description: '协助梳理项目工作',
  role: '按用户目标梳理项目风险', basePreset: 'standard', methods: ['先整理已确认的里程碑'],
  onboarding: [{ key: 'project', label: '项目', prompt: '当前先处理哪项工作？' }], skills: ['human-workflow'] })
const minimalForm = (schema = 'human.form.v2') => ({ schema,
  fields: [{ key: 'reply', label: '答复', kind: 'short-text', required: true, maxLength: 80 }], attachment: null })
const initialRound = () => ({ title: '本次答复', instructions: '填写你的答复。', form: minimalForm(), closesAt: null, recipientRefs: null })
const surface = () => ({ schemaVersion: 1, kind: 'human.surface', id: 'a'.repeat(32), revision: 1,
  title: '资料收集', body: '请填写本次答复。', initialRound: initialRound(), actions: [{ id: 'share', type: 'wechat.share', label: '发送群卡' }] })
const lifecycle = () => lifecycleTools({ nodeId: 'test_node', lifecycle: {}, core: {}, assertAgent: unreachable })
const includesOnce = (text, part) => { assert(text.includes(part)); assert.equal(text.split(part).length - 1, 1) }

test('interaction guidance asks only consequential missing facts and never turns business options into approval', () => {
  const text = ASSISTANT_INTERACTION_GUIDANCE
  assert.match(text, /先利用本会话已确认的资料和工作记忆/)
  assert.match(text, /未回答的引导问题是候选/)
  assert.match(text, /只问最少的问题/)
  assert.match(text, /自由补充空间/)
  assert.match(text, /按它的实际 schema 使用/)
  assert.match(text, /不伪造可点击按钮/)
  assert.match(text, /不要默认替用户选择/)
  assert.match(text, /或把业务选项当作发送、发布和自动处理的批准/)
})

test('brevity guidance retains material risks, actual state and user-requested explanations', () => {
  const text = ASSISTANT_INTERACTION_GUIDANCE
  assert.match(text, /用户要求解释或任务确实复杂时再展开/)
  assert.match(text, /不机械限定字数/)
  assert.match(text, /访问范围、隐私、费用、不可逆操作和能力不足/)
  assert.match(text, /不隐藏或作虚假保证/)
  assert.match(text, /准备完成、已经发送、已经提交、电脑已收到、已经处理是不同事实/)
  assert.match(text, /只报工具证实的状态/)
  assert.match(text, /不为省事跳过确认/)
})

test('real assistant guidance includes shared rules once without replacing profession-specific methods', () => {
  const templates = assistantTemplates()
  assert.deepEqual(templates.map(item => item.id), ['teacher', 'project', 'sales', 'general'])
  assert.equal(new Set(templates.map(item => item.definition.role)).size, 4)
  for (const template of templates) {
    const d = assistantDefinition(template.definition), text = assistantGuidance(d)
    includesOnce(text, ASSISTANT_INTERACTION_GUIDANCE)
    assert(text.includes(d.role))
    for (const method of d.methods) assert(text.includes(method))
    assert.match(text, /候选问题按需询问，缺项不阻挡无关任务/)
    assert.match(text, /发布、提醒、私评与自动处理仍以真实工具和主人相应批准为准/)
    assert.match(text, /同工作区文件遵循 DSH 原生共享/)
  }
  const custom = { ...definition(), role: '协助策展，不套用教师流程', methods: ['用户要求时详细解释作品取舍'], onboarding: [] }
  assert(assistantGuidance(custom).includes(custom.role))
  assert(assistantGuidance(custom).includes(custom.methods[0]))
  assert.deepEqual(assistantDefinition(custom).onboarding, [])
})

test('native preview really appends new interaction guidance and retains inherited safety without installing', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'assistant-interaction-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const anchor = path.join(directory, 'installation.json')
  await writeFile(anchor, '{}')
  const base = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Inherited native policy', suffix: 'Inherited safety suffix' } },
    { id: 'skill', name: '@deepseek-ai/dsh-tool-skill' }]
  const services = {
    agentPresets: { defaultId: 'standard', list: async () => [{ id: 'standard', name: 'Standard' }],
      readDocument: async id => ({ agentPreset: id, content: JSON.stringify(base) }), compositionInventory: async () => [] },
    pluginManager: { listBundles: async () => [], installBundle: unreachable, cancelInstall: unreachable, waitForInstall: unreachable },
    profileContext: { dir: directory, installAnchor: anchor },
    skills: { get: async name => name === HUMAN_WORKFLOW_SKILL.name ? HUMAN_WORKFLOW_SKILL : undefined },
  }
  const adapter = createNativeAssistantAdapter({ get: name => services[name] }, { codec: { load: JSON.parse } })
  try {
    const d = definition(), preview = await adapter.preview({ presetId: 'assistant-project-contract', definition: d }, signal)
    const plugins = JSON.parse(preview.patch)[0].insert[0].config.plugins
    assert.equal(plugins[0].config.prefix, 'Inherited native policy\n\n' + assistantGuidance(d))
    includesOnce(plugins[0].config.prefix, ASSISTANT_INTERACTION_GUIDANCE)
    assert.equal(plugins[0].config.suffix, 'Inherited safety suffix')
    assert.equal(plugins[0].config.complete, false)
    assert.equal(plugins[0].config.includeRuntimeContext, true)
    assert.deepEqual(plugins.slice(1), base.slice(1))
    assert.equal(base[0].config.prefix, 'Inherited native policy')
    assert.deepEqual(await readdir(directory), ['installation.json'])
  } finally { await adapter.close() }
})

test('registered workflow skill carries deduplication and round meaning, not a mandatory profession pipeline', () => {
  let registered, disposed = false
  const dispose = registerHumanWorkflowSkill({ get: name => name === 'skills' ? { register: skill => {
    registered = skill; return () => { disposed = true }
  } } : undefined })
  assert.equal(registered, HUMAN_WORKFLOW_SKILL)
  includesOnce(registered.content, HUMAN_TASK_CONTENT_GUIDANCE)
  assert.match(registered.content, /不要在正文、要求、字段帮助和 presentation.blocks 四处重复/)
  assert.match(registered.content, /展示块可省略/)
  assert.match(registered.content, /round 是同一任务中的一次收集或订正阶段，不是聊天轮数/)
  assert.match(registered.content, /不要求学生再交时不要添加 correction/)
  assert.match(registered.content, /不限教师，也不要求每项任务先建立模式、收图片、自动分析或生成反馈/)
  assert.match(registered.content, /同一已完整展示并批准的内容不要再要求重复审核/)
  assert.match(registered.content, /内容、范围或权限实质改变时需要相应的新授权/)
  assert.match(registered.content, /次数和时限不是 token 或费用硬上限/)
  dispose(); assert.equal(disposed, true)
})

test('actual assistant draft tool embeds authoring guidance but exposes no Agent install/approve shortcut', () => {
  const tools = assistantTools({ nodeId: 'test_node', registry: {}, business: {}, assertIdentity: unreachable, composedPreset: unreachable })
  const draft = tools.find(item => item.name === 'human_assistant_draft')
  includesOnce(draft.description, ASSISTANT_AUTHORING_GUIDANCE)
  assert.match(draft.description, /no Agent approval\/install tool/)
  assert.match(draft.description, /methods 1\.\.16/)
  assert.match(draft.description, /onboarding<=12/)
  assert.match(draft.description, /不要求用户编写提示词/)
  assert.match(draft.description, /不是锁死所有职业的业务流程/)
  assert(!tools.some(item => /approve|install/.test(item.name)))
  assert.deepEqual(draft.parameters.properties.definition.required,
    ['schemaVersion', 'name', 'description', 'role', 'basePreset', 'methods', 'onboarding', 'skills'])
})

test('registered current-agent context asks on demand and keeps memory separate from facts and authority', () => {
  let context
  const agent = { id: 'session-test', session: { id: 'session-test', header: { id: 'session-test', createdAt: 100 } } }
  const services = { agents: { get: () => agent }, systemPrompt: { context: value => { context = value; return () => {} } } }
  registerAssistantContext({ get: name => services[name] }, { nodeId: 'test_node', assertIdentity() {}, composedPreset: () => 'assistant-project',
    registry: { installedForPreset: () => ({}) }, business: { get: () => ({ revision: 2, memory: 'PRIVATE_MEMORY_DO_NOT_INLINE' }) } })
  const text = context.text({ agent, scope: agent })
  includesOnce(text, ASSISTANT_INTERACTION_GUIDANCE)
  assert.match(text, /未回答的问题只在影响当前工作时问/)
  assert.match(text, /适合时提供业务选项，不强制填完问卷/)
  assert.match(text, /不要作为开场白或逐条对用户复述/)
  assert.match(text, /记忆与自报答案不是群成员事实或授权/)
  assert(!text.includes('PRIVATE_MEMORY_DO_NOT_INLINE'))
  assert.equal(context.text({ agent, scope: {} }), '')
  assert.equal(context.text({ agent: { ...agent }, scope: agent }), '')
  const staleAgent = { ...agent }
  assert.equal(context.text({ agent: staleAgent, scope: staleAgent }), '')
})

test('real lifecycle tool schema separates short summary, complete instructions and optional presentation', () => {
  const tool = lifecycle().find(item => item.name === 'human_task_create')
  assert.match(tool.description, /owner reviews the exact form/)
  assert.match(tool.description, /It is not sent yet/)
  assert.match(tool.parameters.properties.body.description, /do not repeat/)
  assert.match(tool.parameters.properties.initialRound.properties.instructions.description, /include all materially needed requirements/)
  assert.deepEqual(tool.parameters.required, ['title', 'body', 'initialRound'])
  assert.equal(tool.parameters.properties.audience, undefined)
  assert.deepEqual(tool.parameters.properties.initialRound.properties.audience.enum, ['all-group', 'owner-select'])
  const schema = tool.parameters.properties.initialRound.properties.form
  assert.equal(schema, HUMAN_MEMBER_FORM_SCHEMA)
  assert.deepEqual(schema.required, ['schema', 'fields', 'attachment'])
  assert.deepEqual(schema.properties.fields.items.required, ['key', 'label', 'kind', 'required'])
  assert.match(schema.properties.fields.items.properties.label.description, /required\/type are rendered separately/)
  assert.match(schema.properties.fields.items.properties.description.description, /optional help only when needed/)
  assert.match(schema.properties.presentation.properties.blocks.description, /Omit when task instructions suffice/)
  assert.match(schema.properties.presentation.description, /not proof that the Agent has processed/)
  assert.match(schema.properties.fields.description, /At most 12 fields/)
  assert.match(schema.properties.attachment.description, /ONE JPEG\/PNG <=10MiB/)
})

test('actual validators accept a useful minimal form without extra fields, help, blocks, cover or image', () => {
  for (const version of ['human.form.v1', 'human.form.v2']) {
    const input = minimalForm(version), parsed = humanForm(input)
    assert.deepEqual(parsed, input)
    assert.notEqual(parsed, input)
    assert.equal(parsed.fields.length, 1)
    assert.equal(parsed.attachment, null)
    assert.equal(parsed.presentation, undefined)
    assert.equal(parsed.fields[0].description, undefined)
    assert.equal(parsed.fields[0].section, undefined)
    const round = { ...initialRound(), form: input }
    assert.deepEqual(humanInitialRound(round), round)
  }
  const card = surface()
  assert.deepEqual(humanSurface(card), card)
  assert.equal(card.cover, undefined)
  assert.equal(card.initialRound.audience, undefined)
})

test('concise guidance does not remove required fields, structural bounds or precise first-round approval data', () => {
  const form = minimalForm(), missingRequired = structuredClone(form), missingLimit = structuredClone(form)
  delete missingRequired.fields[0].required
  delete missingLimit.fields[0].maxLength
  assert.equal(humanForm(missingRequired), undefined)
  assert.equal(humanForm(missingLimit), undefined)
  assert.equal(humanForm({ ...form, fields: [{ ...form.fields[0], maxLength: 201 }] }), undefined)
  assert.equal(humanForm({ ...form, fields: Array.from({ length: 13 }, (_, i) => ({ ...form.fields[0], key: 'field_' + i })) }), undefined)
  assert.equal(humanForm({ ...form, attachment: { kind: 'image', required: false, maxBytes: 10 * 1024 * 1024 + 1, mediaTypes: ['image/png'] } }), undefined)
  assert.equal(humanForm({ ...form, presentation: { script: 'not executable' } }), undefined)
  for (const key of ['instructions', 'closesAt', 'recipientRefs']) {
    const round = initialRound(); delete round[key]
    assert.equal(humanInitialRound(round), undefined)
  }
  const round = { ...initialRound(), audience: 'owner-select', closesAt: 2000000000000 }
  assert.deepEqual(humanInitialRound(round), round)
  assert.equal(humanInitialRound({ ...round, audience: 'guessed-members' }), undefined)
  assert.equal(humanSurface({ ...surface(), audience: 'owner-select' }), undefined)
})

test('actual task output is brief and truthful while presentation metadata preserves every approved requirement', () => {
  const tool = lifecycle().find(item => item.name === 'human_task_create'), card = surface()
  card.initialRound.form.fields[0].maxLength = 120
  card.initialRound.closesAt = 2000000000000
  card.initialRound.audience = 'owner-select'
  const value = { surface: card }, rendered = tool.output.render({}, value), metadata = tool.output.presentationMeta({}, value)
  assert.match(rendered[0].text, /已准备好，尚未发布/)
  assert.match(rendered[0].text, /不再另写规格表或重复审核步骤/)
  assert.match(rendered[0].text, /不得声称已经发送/)
  assert.deepEqual(metadata.humanSurface, card)
  assert.equal(metadata.humanSurface.initialRound.form.fields[0].required, true)
  assert.equal(metadata.humanSurface.initialRound.form.fields[0].maxLength, 120)
  assert.equal(metadata.humanSurface.initialRound.audience, 'owner-select')
  const invalid = { ...card, initialRound: { ...card.initialRound, instructions: '' } }
  assert.throws(() => tool.output.render({}, { surface: invalid }))
  assert.throws(() => tool.output.presentationMeta({}, { surface: invalid }))
})

test('reading and review tool exports still distinguish prepared output from actual publication and require owner approval', () => {
  const reading = humanShareTool({}), card = surface(); delete card.initialRound
  assert.match(reading.description, /only then the approved text is published/)
  assert.match(reading.description, /Never claim it was shared or read/)
  assert.match(reading.output.render({}, { surface: card })[0].text, /现在尚未发送/)
  assert.deepEqual(reading.output.presentationMeta({}, { surface: card }).humanSurface, card)
  const review = lifecycle().find(item => item.name === 'human_task_prepare_review')
  assert.match(review.description, /only the owner can approve with fresh WeChat identity/)
  assert.match(review.description, /Never forge JSON buttons, self-approve, announce publication/)
  assert.match(review.description, /No private evaluation goes in public card title\/body/)
  assert.deepEqual(review.parameters.required, ['taskRef', 'expectedRevision', 'content'])
  assert.match(review.parameters.properties.content.properties.correction.description, /Optional new round/)
})
