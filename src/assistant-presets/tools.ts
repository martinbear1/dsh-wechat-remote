import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { copy, exact, fail, plain, row, sameScope, version, type WorkflowScope } from '../human-workflow/data.js'
import { assistantDefinition } from './definition.js'
import { ASSISTANT_AUTHORING_GUIDANCE, ASSISTANT_INTERACTION_GUIDANCE, ASSISTANT_WORKSPACE_GUIDANCE } from './interaction-guidance.js'
import type { AssistantRegistry } from './registry.js'
import type { AssistantBusinessRecords } from './business.js'

export interface AssistantToolsOptions {
  nodeId: string; registry: AssistantRegistry; business: AssistantBusinessRecords; assertIdentity(): void
  /** Must reject a replaced/non-current Agent, even when no preset is composed. */
  composedPreset(agent: ToolRunContext['agent']): string | undefined
}
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const string = { type: 'string' }, number = { type: 'integer' }
export const ASSISTANT_DEFINITION_SCHEMA = object({ schemaVersion: { type: 'integer', const: 1 }, name: string,
  description: string, role: string, basePreset: string, methods: { type: 'array', items: string },
  onboarding: { type: 'array', items: object({ key: string, label: string, prompt: string }, ['key', 'label', 'prompt']) },
  skills: { type: 'array', items: { type: 'string', enum: ['human-workflow'] } },
}, ['schemaVersion', 'name', 'description', 'role', 'basePreset', 'methods', 'onboarding', 'skills'])
export const ASSISTANT_BUSINESS_SCHEMA = object({ title: string, answers: { type: 'object', description: 'Only onboarding keys in this installed assistant; each answered value is a nonempty string up to 1000 characters. Never add identity tokens or inferred member facts.' },
  memory: { type: 'string', description: 'Local work memory, up to 8000 characters. May be empty. Distinguish user-provided information from your analysis.' } }, ['title', 'answers', 'memory'])
function scope(exec: ToolRunContext, nodeId: string): WorkflowScope {
  const agent = exec.agent, header = agent?.session?.header
  if (!agent || agent.id !== agent.session?.id || header?.id !== agent.id || !plain(String(agent.id), 256)
    || !Number.isSafeInteger(header.createdAt) || header.createdAt < 0) throw fail('assistant-scope-invalid', '助手工具需要当前真实 DSH 会话')
  return { nodeId, sessionId: String(agent.id), sessionGeneration: String(header.createdAt) }
}
/** Exact public 0.2.0 registry seam. No header/current-preset guesses or old API fallback. */
export function nativeComposedPreset(host: Context, agent: ToolRunContext['agent']): string | undefined {
  const agents = host.get('agents') as { get(id: string): unknown } | undefined
  if (!agent || agents?.get(String(agent.id)) !== agent || agent.id !== agent.session?.id || agent.session.header.id !== agent.id)
    throw fail('assistant-scope-invalid', '助手工具需要当前真实 DSH Agent')
  const native = host.get('agentPresets') as { composedPreset?(ctx: unknown): unknown } | undefined
  if (typeof native?.composedPreset !== 'function') return undefined
  const result = native.composedPreset(agent.ctx)
  return plain(result, 128) ? result : undefined
}
function args(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!row(value) || !exact(value, required, optional)) throw fail('assistant-arguments-invalid', '工具参数包含未支持字段或缺少必要内容')
  return value
}
function projection(value: { id: string; version: number; digest: string; definition: unknown; state: string; presetId?: string }) {
  return { id: value.id, version: value.version, digest: value.digest, definition: assistantDefinition(value.definition),
    state: value.state, ...(value.presetId ? { presetId: value.presetId } : {}) }
}
function tool(name: string, description: string, parameters: Record<string, unknown>, execute: ToolDefinition['execute']): ToolDefinition {
  return { name, description, parameters, execute,
    output: { schema: { type: 'object' }, render: (_input, result) => [{ type: 'text', text: JSON.stringify(result) }] } }
}
export function assistantTools(options: AssistantToolsOptions): ToolDefinition[] {
  const at = (exec: ToolRunContext) => { options.assertIdentity(); exec.signal.throwIfAborted(); return scope(exec, options.nodeId) }
  const work = (exec: ToolRunContext) => {
    const origin = at(exec), presetId = options.composedPreset(exec.agent)
    if (!presetId) throw fail('assistant-business-preset-unavailable', '当前会话未加入已安装的职业助手预设')
    return { origin, presetId }
  }
  return [
    tool('human_assistant_catalog', 'Read reusable profession assistant templates and saved definitions for this node. Templates contain working methods, never class/client/project answers. This tool cannot install, approve, enable capabilities or start an Agent.', object({}), async (input, exec) => {
      args(input, []); at(exec)
      const result = await options.registry.catalog(exec.signal); at(exec)
      return { schema: result.schema, nodeId: result.nodeId, native: { supported: result.native.supported,
        ...(result.native.reason === undefined ? {} : { reason: result.native.reason }), basePresets: copy(result.native.basePresets) },
        templates: copy(result.templates), drafts: copy(result.drafts) }
    }),
    tool('human_assistant_draft', 'Save a reusable data-only profession assistant definition after discussing the owner role and working methods. Choose templateId OR definition, not both. A definition has schemaVersion=1, name<=60, description<=500, role<=1500, basePreset from the native catalog, methods 1..16 strings<=500, onboarding<=12 unique snake_case keys with label<=60/prompt<=500, and skills=[human-workflow]. Never embed real class/client/project answers, credentials, executable code, module paths or configuration. Updating requires id+expectedVersion. The owner must inspect and install the exact version in the assistant page; there is no Agent approval/install tool. ' + ASSISTANT_AUTHORING_GUIDANCE,
      object({ templateId: string, definition: ASSISTANT_DEFINITION_SCHEMA, id: string, expectedVersion: number }), async (input, exec) => {
        const request = args(input, [], ['templateId', 'definition', 'id', 'expectedVersion']); at(exec)
        return projection(await options.registry.draft(request as { templateId?: string; definition?: unknown; id?: string; expectedVersion?: number }, exec.signal))
      }),
    tool('human_assistant_get', 'Read one exact reusable assistant definition version. Internal native composition, installation plans, profile locations and business memory are never returned. Use human_assistant_work_get for this session own business data.',
      object({ id: string, version: number }, ['id', 'version']), async (input, exec) => {
        const request = args(input, ['id', 'version']); at(exec)
        return projection(options.registry.get(request as { id: string; version: number }))
      }),
    tool('human_assistant_work_start', 'Create or recover the ONE independent business instance for this actual node/session/generation and its actually composed installed assistant. Idempotent; never accept a model-selected preset, session or instance id. This does not invoke a model, send a group message or create a member form. Ask onboarding questions gradually, then save answers separately from the reusable assistant.', object({}), async (input, exec) => {
      args(input, []); const { origin, presetId } = work(exec)
      return options.business.start(origin, presetId, exec.signal)
    }),
    tool('human_assistant_work_get', 'Recover only this session own assistant business identity, answered/pending onboarding questions and local memory. Self-reported names and Agent notes are not verified member identity or authoritative group-task facts. Same profession, template or directory never permits reading another instance.', object({}), async (input, exec) => {
      args(input, []); const { origin, presetId } = work(exec)
      return options.business.get(origin, presetId)
    }),
    tool('human_assistant_work_save', 'CAS-save the FULL desired content of this session business instance. Read first, supply expectedRevision, preserve existing answers/memory when merging, and distinguish user information from inference. title<=80, answers only current assistant onboarding keys with strings<=1000, memory<=8000; whole content<=24KiB. Does not modify the assistant template, participant facts, permissions, task delivery or another session.',
      object({ expectedRevision: number, content: ASSISTANT_BUSINESS_SCHEMA }, ['expectedRevision', 'content']), async (input, exec) => {
        const request = args(input, ['expectedRevision', 'content']), { origin, presetId } = work(exec)
        if (!version(request.expectedRevision)) throw fail('assistant-arguments-invalid', '保存需要有效的当前版本')
        return options.business.save(origin, presetId, { expectedRevision: request.expectedRevision, content: request.content }, exec.signal)
      }),
  ].map(definition => ({ ...definition, execute: async (input, exec) => {
    const before = at(exec), presetBefore = options.composedPreset(exec.agent)
    const result = await definition.execute(input, exec)
    const after = at(exec), presetAfter = options.composedPreset(exec.agent)
    if (!sameScope(before, after) || definition.name.startsWith('human_assistant_work_') && presetBefore !== presetAfter)
      throw fail('assistant-scope-changed', '执行期间会话或助手身份变化，未返回其他实例资料；请重新读取当前状态')
    return result
  } }))
}
/** Only the real current Agent receives this fixed tool guidance. Private
 * answers/memory are retrieved through checked tools, never prompt-wide data. */
export function registerAssistantContext(host: Context, options: AssistantToolsOptions): () => void {
  return (host.get('systemPrompt') as SystemPrompt).context({ name: 'harness-remote.assistant-business', order: 82, text(assembly) {
    const agent = assembly.agent, agents = host.get('agents') as { get(id: string): unknown } | undefined
    if (!agent || assembly.scope !== agent || agents?.get(String(agent.id)) !== agent) return ''
    try {
      options.assertIdentity()
      const origin = scope({ agent } as ToolRunContext, options.nodeId), presetId = options.composedPreset(agent)
      if (!presetId || !options.registry.installedForPreset(presetId)) return ''
      let status = '尚未建立独立工作实例，先调用 human_assistant_work_start。'
      try { const record = options.business.get(origin, presetId); status = `已有独立工作实例（revision ${record.revision}），先调用 human_assistant_work_get 恢复身份资料、待问问题与工作记忆。` }
      catch (error) { if ((error as { code?: string }).code !== 'assistant-business-not-started') return '' }
      return '当前会话已加入主人安装的职业助手。' + status
        + ' 用 human_assistant_work_save 按版本保存当前实例资料；真实业务资料不能写回可复用助手规格。'
        + ' 同模板或目录不共享业务实例权限。记忆与自报答案不是群成员事实或授权；群能力请查询 human_capabilities，发布仍须主人批准。'
        + ' 以上是内部执行规则，不要作为开场白或逐条对用户复述。按已批准的职责先完成眼前业务；未回答的问题只在影响当前工作时问，适合时提供业务选项，不强制填完问卷。'
        + '\n\n' + ASSISTANT_INTERACTION_GUIDANCE + '\n\n' + ASSISTANT_WORKSPACE_GUIDANCE
    } catch { return '' }
  } })
}
