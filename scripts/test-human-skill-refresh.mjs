import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt, renderContextSections } from '@deepseek-ai/dsh-system-prompt'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import * as nativeSkillTool from '@deepseek-ai/dsh-tool-skill'
import { registerHumanContext, HUMAN_CONTEXT_NAME } from '../lib/human-tools/dsh.js'
import { HUMAN_WORKFLOW_SKILL, HUMAN_WORKFLOW_SKILL_REVISION, registerHumanWorkflowSkill } from '../lib/human-workflow/dsh-skill.js'
import { assistantGuidance } from '../lib/assistant-presets/definition.js'
import { assistantTemplates } from '../lib/assistant-presets/catalog.js'

// Real published Cordis/DSH registry, skill consumer and prompt assembly. The
// Agent identity is an in-memory fixture; no model/provider/profile is used.
const signal = new AbortController().signal
const oldDescription = '为当前工作设计群任务规则、逐步收集工作资料、准备需要主人确认的群卡，并查询成员参与事实。'
async function fixture(t) {
  const ctx = new Context(), prompt = new SystemPrompt(ctx, {}), tools = new ToolRuntime(ctx, { mode: 'native' })
  const skills = new SkillRegistry(ctx), sessions = new SessionStore(ctx)
  const session = sessions.create(SessionId('skill_refresh_session'), { meta: { createdAt: 100 } })
  const never = () => assert.fail('Skill discovery/reload must not wake or run an Agent')
  const agent = { id: session.id, session, ctx, status: 'idle', send: never, inject: never, followup: never }
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined })
  ctx.on('session/flush', async () => {})
  const consumer = await ctx.plugin(nativeSkillTool)
  t.after(async () => { await ctx.fiber.dispose() })
  const step = () => agentEvents(ctx, agent).waterfall('agent/pre-step', { messages: [], turn: 1, step: 1, signal },
    async () => ({ kind: 'enter', messages: [] }))
  const persist = decision => { for (const message of decision.messages) session.append('user/message', message, { surfaceOp: 'append' }) }
  const load = () => tools.execute({ name: 'skill', arguments: { name: 'human-workflow' }, callId: 'load-human-workflow', agent, signal })
  return { ctx, prompt, tools, skills, session, agent, consumer, step, persist, load }
}

test('native catalog detects the semantic revision and loads current instructions without modifying the approved V3 persona', async t => {
  const f = await fixture(t), definition = assistantTemplates().find(item => item.id === 'teacher').definition
  const persona = assistantGuidance(definition)
  assert.match(persona, /使用原生 human-workflow skill/)
  assert(!persona.includes(HUMAN_WORKFLOW_SKILL_REVISION), 'approved persona is a stable reference, not a frozen skill-body copy')
  const removeOld = f.skills.register({ ...HUMAN_WORKFLOW_SKILL, description: oldDescription, content: 'OLD_SKILL_BODY' })
  const first = await f.step()
  assert.equal(first.messages.length, 1)
  assert.equal(first.messages[0].source.kind, 'skill-catalog')
  f.persist(first)
  const previousMessage = structuredClone(first.messages[0]), oldLoad = await f.load()
  assert.equal(oldLoad.isError, false)
  assert(oldLoad.content[0].text.includes('OLD_SKILL_BODY'))
  removeOld()
  const dispose = registerHumanWorkflowSkill(f.ctx)
  assert.equal(typeof dispose, 'function')
  const replacement = await f.step()
  assert.equal(replacement.messages.length, 1)
  assert.equal(replacement.messages[0].source.kind, 'skill-catalog')
  assert.notDeepEqual(replacement.messages[0].source.entries, previousMessage.source.entries)
  assert(replacement.messages[0].content[0].text.includes('replaces every earlier'))
  assert(replacement.messages[0].content[0].text.includes(HUMAN_WORKFLOW_SKILL_REVISION))
  assert(!replacement.messages[0].content[0].text.includes('initialRound.sourceParticipantRefs'), 'catalog stays a summary')
  f.persist(replacement)
  assert.equal((await f.step()).messages.length, 0, 'unchanged revision does not republish every step')
  const tool = f.tools.get('skill', f.agent)
  assert.equal(tool.parameters.properties.name.type, 'string')
  assert(tool.parameters.required.includes('name'))
  const loaded = await f.load()
  assert.equal(loaded.isError, false)
  assert(loaded.content[0].text.includes(HUMAN_WORKFLOW_SKILL_REVISION))
  assert(loaded.content[0].text.includes("recipientSource:'task-audience'"))
  assert(loaded.content[0].text.includes('不是新的固定流程'))
  assert(!loaded.content[0].text.includes('OLD_SKILL_BODY'))
  assert.deepEqual(first.messages[0], previousMessage, 'old catalog and loaded historical text are never rewritten')
  assert(oldLoad.content[0].text.includes('OLD_SKILL_BODY'))
  assert.equal(assistantGuidance(definition), persona)
  dispose()
})

test('native skill discovery alone does not reload changed bodies with an unchanged catalog description', async t => {
  const f = await fixture(t)
  const remove = f.skills.register({ ...HUMAN_WORKFLOW_SKILL, description: oldDescription, content: 'FIRST_BODY' })
  f.persist(await f.step())
  remove()
  const second = f.skills.register({ ...HUMAN_WORKFLOW_SKILL, description: oldDescription, content: 'CHANGED_BODY' })
  assert.equal((await f.step()).messages.length, 0, 'this regression explains why body-only edits are insufficient')
  assert((await f.load()).content[0].text.includes('CHANGED_BODY'), 'a new native invocation reads the winning current definition')
  second()
})

test('a session that loaded the preceding composable-targets revision discovers the profession-scope correction', async t => {
  const f = await fixture(t)
  const remove = f.skills.register({ ...HUMAN_WORKFLOW_SKILL,
    description: '修订 2026-10-04-composable-targets-v1：按用户意图组合群任务、新事项/补交、已知对象和单独提醒；用业务语言交互。旧会话参与相关工作时按需重新加载。',
    content: 'PREVIOUS_COMPOSABLE_TARGETS_BODY' })
  f.persist(await f.step())
  remove()
  registerHumanWorkflowSkill(f.ctx)
  const update = await f.step()
  assert.equal(update.messages.length, 1)
  assert(update.messages[0].content[0].text.includes(HUMAN_WORKFLOW_SKILL_REVISION))
  f.persist(update)
  const latest = await f.load()
  assert.equal(latest.isError, false)
  assert.match(latest.content[0].text, /不要拿 human_workflow_save 代替它/)
  assert.match(latest.content[0].text, /参与确认，不是某次表单是否提交/)
  assert(!latest.content[0].text.includes('PREVIOUS_COMPOSABLE_TARGETS_BODY'))
  assert.equal((await f.step()).messages.length, 0)
})

test('native consumer re-establishes its current catalog after actual session compaction hides the earlier catalog', async t => {
  const f = await fixture(t)
  registerHumanWorkflowSkill(f.ctx)
  f.persist(await f.step())
  const initial = f.session.events.find(event => event.type === 'user/message' && event.data.source.kind === 'skill-catalog')
  assert(initial)
  f.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Compacted fixture history, not a skill body.' }],
    source: { kind: 'compact-checkpoint', compactionId: 'skill-refresh-compaction' },
  }), { surfaceOp: { op: 'replace', start: initial.seq, end: initial.seq }, sourceEventSeqs: [initial.seq] })
  assert(!f.session.surface.nodes.includes(initial.seq))
  const restored = await f.step()
  assert.equal(restored.messages.length, 1)
  assert.equal(restored.messages[0].source.kind, 'skill-catalog')
  assert(restored.messages[0].content[0].text.includes(HUMAN_WORKFLOW_SKILL_REVISION))
  assert(!restored.messages[0].content[0].text.includes('initialRound.sourceParticipantRefs'))
  f.persist(restored)
  assert.equal((await f.step()).messages.length, 0)
  assert((await f.load()).content[0].text.includes("recipientSource:'task-audience'"))
})

test('current-agent runtime refresh guidance is short, conditional and only names actually available native tools', async t => {
  const f = await fixture(t)
  registerHumanWorkflowSkill(f.ctx)
  const dispose = registerHumanContext(f.ctx, { contextActionSnapshot: () => [] })
  const view = async assembly => renderContextSections(await f.prompt.assemble(assembly)).filter(item => item.name === HUMAN_CONTEXT_NAME)
  assert.deepEqual(await view({ agent: f.agent, scope: f.agent }), [], 'missing capabilities tool must not promise a refresh path')
  const removeCapability = f.tools.register({ name: 'human_capabilities', description: 'Actual discovery fixture', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    output: { schema: { type: 'object' }, render: () => [] }, execute: () => assert.fail('prompt assembly cannot call tools') })
  const sections = await view({ agent: f.agent, scope: f.agent })
  assert.equal(sections.length, 1)
  assert(sections[0].text.includes(HUMAN_WORKFLOW_SKILL_REVISION))
  assert.match(sections[0].text, /skill\(\{name:"human-workflow"\}\)/)
  assert.match(sections[0].text, /仅当本次涉及群任务或设计相关助理时/)
  assert.match(sections[0].text, /若尚未加载此修订/)
  assert.match(sections[0].text, /已加载不每轮重复，无关聊天无需加载/)
  assert(sections[0].text.length < 300)
  assert(!sections[0].text.includes('sourceParticipantRefs'))
  const before = f.session.events
  assert.deepEqual(await view({ agent: f.agent, scope: f.agent }), sections)
  assert.deepEqual(f.session.events, before, 'assembly contributes context, not synthetic user instructions/events or an Agent turn')
  assert.deepEqual(await view({ agent: f.agent, scope: {} }), [])
  assert.deepEqual(await view({ agent: { ...f.agent }, scope: { ...f.agent } }), [])
  removeCapability()
  assert.deepEqual(await view({ agent: f.agent, scope: f.agent }), [])
  dispose()
})
