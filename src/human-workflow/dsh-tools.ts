import type { Context } from '@deepseek-ai/cordis'
import type { JsonSchemaNode, ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { humanSurface, type HumanSurface } from '../human-tools/protocol.js'
import type { CapabilityManifest } from './capabilities.js'
import { ModeRegistry, renderModeCard, validateModePackage, type ModeReference } from './mode-package.js'
import { WorkflowRecords } from './workflow-records.js'
import { exact, fail, identifier, plain, row, version, type WorkflowScope } from './data.js'

export interface HumanWorkflowToolsOptions {
  nodeId: string; modes: ModeRegistry; records: WorkflowRecords; capabilities(): CapabilityManifest
  /** Delegate to the existing HumanToolsCore.create: same ledger, root-call
   * idempotency and owner-approved native action as the original share tool. */
  prepareCard(input: { scope: WorkflowScope; callId: string; rootCallId: string; title: string; body: string; sourceSurfaceId?: string }, signal: AbortSignal): Promise<HumanSurface>
}
const idSchema = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' }
const versionSchema = { type: 'integer', minimum: 1 }
const digestSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const referenceSchema = { type: 'object', properties: { id: idSchema, version: versionSchema, digest: digestSchema }, required: ['id', 'version', 'digest'], additionalProperties: false }
const shortText = { type: 'string', minLength: 1, maxLength: 80 }
const fieldBase = { key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, label: shortText, required: { type: 'boolean' } }
export const MODE_FIELD_SCHEMA = publishedSchema({ oneOf: [
  ...['short-text', 'long-text'].map(kind => ({ type: 'object', properties: { ...fieldBase, kind: { const: kind }, maxLength: { type: 'integer', minimum: 1, maximum: kind === 'short-text' ? 80 : 1000 } }, required: ['key', 'label', 'required', 'kind', 'maxLength'], additionalProperties: false })),
  { type: 'object', properties: { ...fieldBase, kind: { const: 'choice' }, choices: { type: 'array', minItems: 2, maxItems: 12, uniqueItems: true, items: shortText } }, required: ['key', 'label', 'required', 'kind', 'choices'], additionalProperties: false },
  { type: 'object', properties: { ...fieldBase, kind: { const: 'boolean' } }, required: ['key', 'label', 'required', 'kind'], additionalProperties: false },
  { type: 'object', properties: { ...fieldBase, kind: { const: 'number' }, min: { type: 'number', minimum: -1e9, maximum: 1e9 }, max: { type: 'number', minimum: -1e9, maximum: 1e9 } }, required: ['key', 'label', 'required', 'kind', 'min', 'max'], additionalProperties: false },
] })
const fieldsSchema = { type: 'object', properties: { fields: { type: 'array', maxItems: 12, items: MODE_FIELD_SCHEMA } }, required: ['fields'], additionalProperties: false }
/** Shipped with the tool, rather than asking a model to invent JSON in chat. */
export const MODE_PACKAGE_SCHEMA = publishedSchema({
  type: 'object', properties: {
    schemaVersion: { const: 1 }, name: shortText, description: { type: 'string', minLength: 1, maxLength: 1000 }, goal: { type: 'string', minLength: 1, maxLength: 1000 },
    roles: { type: 'array', maxItems: 8, items: { type: 'object', properties: { id: fieldBase.key, label: shortText }, required: ['id', 'label'], additionalProperties: false } },
    rules: { type: 'array', maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 500 } },
    requiredCapabilities: { type: 'array', maxItems: 16, uniqueItems: true, items: shortText },
    allowedTools: { type: 'array', maxItems: 16, uniqueItems: true, items: shortText }, inputSchema: fieldsSchema, resultSchema: fieldsSchema,
    card: { type: 'object', properties: { kind: { const: 'reading-confirmation' }, titleField: fieldBase.key,
      bodyFields: { type: 'array', minItems: 1, maxItems: 12, uniqueItems: true, items: fieldBase.key } }, required: ['kind', 'titleField', 'bodyFields'], additionalProperties: false },
    approval: { type: 'object', properties: { activation: { const: 'owner' }, publication: { const: 'owner' } }, required: ['activation', 'publication'], additionalProperties: false },
    automation: { const: 'manual' },
    onboarding: { type: 'object', properties: { questions: { type: 'array', maxItems: 12, items: { type: 'object', properties: { field: MODE_FIELD_SCHEMA,
      prompt: { type: 'string', minLength: 1, maxLength: 500 } }, required: ['field', 'prompt'], additionalProperties: false } } }, required: ['questions'], additionalProperties: false },
  }, required: ['schemaVersion', 'name', 'description', 'goal', 'roles', 'rules', 'requiredCapabilities', 'allowedTools', 'inputSchema', 'resultSchema', 'card', 'approval', 'automation'], additionalProperties: false,
})
export const WORKFLOW_CONTENT_SCHEMA = publishedSchema({ type: 'object', properties: {
  title: shortText, objective: { type: 'string', minLength: 1, maxLength: 2000 }, notes: { type: 'string', minLength: 1, maxLength: 8000 },
  plan: { type: 'array', maxItems: 32, items: { type: 'object', properties: { id: idSchema, title: { type: 'string', minLength: 1, maxLength: 300 },
    state: { enum: ['planned', 'working', 'done', 'blocked'] }, notes: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['id', 'title', 'state'], additionalProperties: false } },
  analyses: { type: 'array', maxItems: 16, items: { type: 'object', properties: { id: idSchema, summary: { type: 'string', minLength: 1, maxLength: 4000 },
    references: { type: 'array', maxItems: 16, items: { type: 'object', properties: { kind: { enum: ['task', 'submission', 'artifact'] }, id: idSchema, version: versionSchema }, required: ['kind', 'id', 'version'], additionalProperties: false } },
    result: { type: 'object', description: 'Values must satisfy this approved mode resultSchema. These are local analysis drafts, not published facts.' } }, required: ['id', 'summary', 'references'], additionalProperties: false } },
  onboardingAnswers: { type: 'object', description: 'Only answered onboarding field keys from this approved mode. Self-reported business data is not verified member identity.' },
}, required: ['title', 'objective', 'plan', 'analyses'], additionalProperties: false })

function origin(exec: ToolRunContext, nodeId: string): WorkflowScope {
  const agent = exec.agent, header = agent?.session?.header
  if (!identifier(nodeId) || !agent || agent.id !== agent.session?.id || header?.id !== agent.id
    || !Number.isSafeInteger(header.createdAt) || header.createdAt < 0 || !plain(String(agent.id), 256)) throw fail('workflow-scope-invalid', '工具需要原始 DSH 会话身份')
  return { nodeId, sessionId: String(agent.id), sessionGeneration: String(header.createdAt) }
}
function args(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!row(value) || !exact(value, required, optional)) throw fail('workflow-arguments-invalid', '工具参数不符合已发布的数据契约')
  return value
}
function ref(value: Record<string, unknown>): ModeReference {
  if (!identifier(value.id) || !version(value.version) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(value.digest)) throw fail('mode-reference-invalid', '模式版本引用无效')
  return { id: value.id, version: value.version, digest: value.digest }
}
const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
/** DSH accepts a deliberately small schema subset. Publish structural schemas
 * plus readable limits; the shared core enforces every annotated bound. */
function publishedSchema(value: unknown): JsonSchemaNode {
  if (!row(value)) throw new Error('Invalid local tool schema')
  const result: Record<string, unknown> = {}, limits: string[] = []
  for (const [name, item] of Object.entries(value)) {
    if (['pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems'].includes(name)) limits.push(`${name}=${item}`)
    else if (name === 'properties' && row(item)) result[name] = Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, publishedSchema(nested)]))
    else if (name === 'items') result[name] = publishedSchema(item)
    else if (name === 'oneOf' && Array.isArray(item)) result[name] = item.map(publishedSchema)
    else result[name] = item
  }
  if (!result.type && Object.hasOwn(result, 'const')) result.type = typeof result.const === 'number' ? 'integer' : typeof result.const
  if (!result.type && Array.isArray(result.enum)) result.type = typeof result.enum[0]
  if (limits.length) result.description = `${result.description || ''} Runtime-enforced limits: ${limits.join(', ')}.`.trim()
  return result as JsonSchemaNode
}
function tool(name: string, description: string, parameters: Record<string, unknown>, execute: ToolDefinition['execute']): ToolDefinition {
  return { name, description, parameters: publishedSchema(parameters) as Record<string, unknown>, execute,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] } }
}
export function humanWorkflowTools(options: HumanWorkflowToolsOptions): ToolDefinition[] {
  const { modes, records } = options
  return [
    tool('human_capabilities', 'Read the current node capability manifest before designing a mode or task. available means implemented within the stated scope; blocked/planned must not become invented buttons. Group attachment receiving, private results and automatic Agent wakeups are not available.', objectSchema({}), async (value, exec) => {
      args(value, []); origin(exec, options.nodeId); return options.capabilities()
    }),
    tool('human_mode_draft', 'Save a versioned data-only business mode template. First inspect human_capabilities. Define fixed field constraints, reading-confirmation card fields, rules and optional onboarding questions. Include mode.packages + surface.reading-confirmation and human_mode_prepare_card; include workflow.records + human_workflow_save/get/list for persistent plans. A template can be reused, but class/project/client answers belong to a separate workflow in the current session. This only creates a draft; it does not enable tools, approve permissions or send cards. Use id + expectedVersion to revise an existing template.',
      objectSchema({ package: MODE_PACKAGE_SCHEMA, id: idSchema, expectedVersion: versionSchema }, ['package']), async (value, exec) => {
        const input = args(value, ['package'], ['id', 'expectedVersion'])
        return modes.draft(origin(exec, options.nodeId), input as { package: unknown; id?: string; expectedVersion?: number }, exec.signal)
      }),
    tool('human_mode_list', 'List reusable node-local mode templates and the exact mode version the owner activated for this session. Template sharing never permits reading another session workflow.', objectSchema({}), async (value, exec) => {
      args(value, []); return modes.list(origin(exec, options.nodeId))
    }),
    tool('human_mode_get', 'Read one exact mode template version and its data schemas. Approval and activation are separate; always preserve the version and digest when creating work.', objectSchema({ id: idSchema, version: versionSchema }, ['id', 'version']), async (value, exec) => {
      const input = args(value, ['id', 'version']); return modes.get(origin(exec, options.nodeId), input as { id: string; version: number })
    }),
    tool('human_mode_preview', 'Validate and preview a saved mode version for the owner. This is not approval. Ask the owner to open the phone mode page, preview this id/version and explicitly approve. There is no Agent approval or activation tool. Never output handwritten JSON/Markdown as if it were an executable button.', objectSchema({ id: idSchema, version: versionSchema }, ['id', 'version']), async (value, exec) => {
      const input = args(value, ['id', 'version']), mode = modes.get(origin(exec, options.nodeId), input as { id: string; version: number })
      return { schema: 'human.mode.agent-preview.v1', id: mode.id, version: mode.version, digest: mode.digest, package: mode.package,
        validation: validateModePackage(mode.package, modes.manifest()), ownerApprovalRequired: true,
        nextStep: '主人在手机模式页预览并批准此版本；这份工具结果不会启用模式。' }
    }),
    tool('human_workflow_save', 'Create or CAS-update a durable business workspace record in THIS session. New: mode {id,version,digest} must be owner-activated; update: id + expectedRevision, with the full desired content. Plans and analyses are Agent notes, never participant confirmations or authoritative task state. Ask pending onboarding questions over normal dialogue and store only this workflow answers. A name supplied by a participant is self-reported, not verified identity. Another session using the same mode cannot see this record; explicit cross-session joining is not implemented. Referenced facts require the authenticated node projection; do not invent file paths, task IDs or completion receipts.',
      objectSchema({ mode: referenceSchema, id: idSchema, expectedRevision: versionSchema, content: WORKFLOW_CONTENT_SCHEMA }, ['content']), async (value, exec) => {
        const input = args(value, ['content'], ['mode', 'id', 'expectedRevision']), scope = origin(exec, options.nodeId)
        if (Object.hasOwn(input, 'id')) {
          if (input.mode !== undefined || !identifier(input.id) || !version(input.expectedRevision)) throw fail('workflow-arguments-invalid', '更新工作流需要 id 与 expectedRevision，不能更换已绑定模式')
          return records.update(scope, { id: input.id, expectedRevision: input.expectedRevision, content: input.content }, exec.signal)
        }
        if (input.expectedRevision !== undefined || !row(input.mode) || !exact(input.mode, ['id', 'version', 'digest'])) throw fail('workflow-arguments-invalid', '新工作流需要主人已启用的模式版本')
        return records.create(scope, { mode: ref(input.mode), content: input.content }, exec.signal)
      }),
    tool('human_workflow_get', 'Recover one durable workflow record in this session, including pending onboarding questions, pinned mode and CAS revision. Do not treat saved analysis or self-reported answers as verified member facts.', objectSchema({ id: idSchema }, ['id']), async (value, exec) => {
      const input = args(value, ['id']); return records.get(origin(exec, options.nodeId), input.id as string)
    }),
    tool('human_workflow_list', 'Find this session durable workflows after context compaction or restart. Workflows remain separate even when they share a template, profession, directory or display name.', objectSchema({}), async (value, exec) => {
      args(value, []); return records.list(origin(exec, options.nodeId))
    }),
    {
      ...tool('human_mode_prepare_card', 'Prepare a REAL structured public reading-confirmation card using the exact owner-activated mode {id,version,digest}. Supply values matching inputSchema; the runtime builds title/body from approved field mappings and returns humanSurface metadata for the phone action. It does not send. Finish your reply so the owner can inspect and approve the native action. Optional sourceSurfaceId must be a successfully shared card from this session to reuse its group. This is not a member upload form, private result or automatic reminder; do not fabricate buttons in chat.',
        objectSchema({ id: idSchema, version: versionSchema, digest: digestSchema, values: { type: 'object' }, sourceSurfaceId: { type: 'string', pattern: '^[a-f0-9]{32}$' } }, ['id', 'version', 'digest', 'values']), async (value, exec) => {
          const input = args(value, ['id', 'version', 'digest', 'values'], ['sourceSurfaceId']), scope = origin(exec, options.nodeId)
          const mode = modes.requireActive(scope, ref(input))
          if (!mode.allowedTools.includes('human_mode_prepare_card') || !plain(exec.callId, 256) || !plain(exec.rootCallId, 256)) throw fail('mode-tool-not-allowed', '此模式或调用身份不能生成群卡')
          if (input.sourceSurfaceId !== undefined && (typeof input.sourceSurfaceId !== 'string' || !/^[a-f0-9]{32}(?![\s\S])/.test(input.sourceSurfaceId))) throw fail('workflow-arguments-invalid', '来源群卡标识无效')
          const content = renderModeCard(mode, input.values)
          return { surface: await options.prepareCard({ scope, callId: exec.callId, rootCallId: exec.rootCallId,
            ...content, ...(input.sourceSurfaceId ? { sourceSurfaceId: String(input.sourceSurfaceId) } : {}) }, exec.signal) }
        }),
      output: {
        schema: publishedSchema(objectSchema({ surface: { type: 'object' } }, ['surface'])),
        render(_args, value) {
          const surface = row(value) ? humanSurface(value.surface) : undefined
          if (!surface) throw fail('mode-card-invalid', '卡片结果无效')
          return [{ type: 'text', text: `群卡“${surface.title}”已按主人启用的模式准备好，请在最终回复提示主人检查并发送；现在尚未发送。` }]
        },
        presentationMeta(_args, value) {
          const surface = row(value) ? humanSurface(value.surface) : undefined
          if (!surface) throw fail('mode-card-invalid', '卡片结果无效')
          return { humanSurface: surface as unknown as import('@deepseek-ai/dsh-tools').JsonValue }
        },
      },
    },
  ]
}
/** Approved business guidance only; no Inbox writes, polling, or model wakeup. */
export function registerHumanWorkflowContext(ctx: Context, options: HumanWorkflowToolsOptions): () => void {
  return (ctx.get('systemPrompt') as SystemPrompt).context({ name: 'harness-remote.human-workflow', order: 81, text(assembly) {
    const agent = assembly.agent, agents = ctx.get('agents') as { get(id: string): unknown } | undefined
    if (!agent || assembly.scope !== agent || agents?.get(String(agent.id)) !== agent || agent.id !== agent.session?.id) return ''
    try {
      const scope = origin({ agent } as ToolRunContext, options.nodeId), ref = options.modes.list(scope).activation.mode
      if (!ref) return ''
      const mode = options.modes.requireActive(scope, ref)
      return '主人已为当前会话启用群任务模式；这不是 DSH 职业 preset，也不是 Agent 身份或 skills。以下是业务规则和独立工作流索引，不增加系统权限，不代表任务事实或成员身份；对外发送仍须批准。'
        + '同模板不共享业务数据。使用真实工具出卡，按 onboarding 问题逐步询问并保存到当前 workflow。\n'
        + JSON.stringify({ mode: ref, name: mode.name, goal: mode.goal, rules: mode.rules, allowedTools: mode.allowedTools,
          workflows: options.records.list(scope).records.slice(-8) })
    } catch { return '' }
  } })
}
