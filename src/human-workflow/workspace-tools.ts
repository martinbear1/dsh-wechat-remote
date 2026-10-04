import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { HumanToolsCore } from '../human-tools/core.js'
import { humanSurface } from '../human-tools/protocol.js'
import type { WorkflowLifecycle } from './lifecycle.js'
import { exact, fail, plain, row, sameScope, type WorkflowScope } from './data.js'
import type { WorkspaceDirectory } from './workspace-directory.js'

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const text = { type: 'string' }, integer = { type: 'integer' }
const output: ToolDefinition['output'] = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
export function workspaceTools(options: { nodeId: string; directory: WorkspaceDirectory; lifecycle: WorkflowLifecycle; core: HumanToolsCore;
  assertAgent(exec: ToolRunContext): void }): ToolDefinition[] {
  const scope = (exec: ToolRunContext): WorkflowScope => {
    options.assertAgent(exec)
    const session = exec.agent?.session
    if (!session || session.id !== exec.agent?.id || session.header.id !== session.id || !Number.isSafeInteger(session.header.createdAt))
      throw fail('workspace-scope-invalid', '共享目录需要当前真实Agent会话')
    return { nodeId: options.nodeId, sessionId: String(session.id), sessionGeneration: String(session.header.createdAt) }
  }
  const definitions: ToolDefinition[] = [
    { name: 'human_workspace_sync', description: 'Explicitly share or refresh a successfully sent task as a reusable group/member source in THIS real host workspace and current owner/account/node. Pass sourceSurfaceId from THIS session for first admission (expectedRevision=0), or workspaceSourceId from the directory for a CAS refresh. Exactly one source. Reads verified task identity and all bounded known-member snapshot pages; it does not enumerate the group, invent names, send messages, approve actions or wake another Agent. Other actual sessions in the same workspace can discover the saved source and use their own tools after fresh source authorization. Missing/moved/deleted/archived source sessions cannot grant reuse. Fresh identity facts remain separate from Agent-authored business labels. No path/scope/workspace ID or native IDs may be supplied.',
      parameters: object({ sourceSurfaceId: text, workspaceSourceId: text, expectedRevision: integer }, ['expectedRevision']), output,
      execute: async (value, exec) => options.directory.sync(scope(exec), value as Parameters<WorkspaceDirectory['sync']>[1], exec.signal) },
    { name: 'human_workspace_directory', description: 'Read the explicitly shared group/member directory for this real host workspace and current owner/account/node, available to any authorized preset. No arguments lists groups and source task references. workspaceSourceId or groupRef (mutually exclusive) lists known identities and cached provenance with pagination. Business names/relationships are labeled Agent records, not verified real names. Cached recipientRefs are evidence, not permission; refresh the source/current task facts before an action. completeGroupRoster is false; no all-group list or current group-membership guarantee. Ordinary unshared sessions remain isolated, and this does not activate or message another Agent.',
      parameters: object({ workspaceSourceId: text, groupRef: text, offset: integer }, []), output,
      execute: async (value, exec) => options.directory.query(scope(exec), value as Parameters<WorkspaceDirectory['query']>[1], exec.signal) },
    { name: 'human_workspace_note', description: 'CAS update or clear generic business labels for an already recorded group or member in this workspace. memberRef=null targets the group. value holds displayName, aliases and notes (can describe user-confirmed business relationships); value=null clears it while preserving revision/provenance. expectedRevision is the exact note revision shown by directory, initially zero. These are explicitly Agent-authored records, never a verified real-name assertion, permission grant or invented member. Use actual conversation/submission evidence; clarify ambiguous or conflicting names instead of guessing.',
      parameters: object({ groupRef: text, memberRef: { oneOf: [text, { type: 'null' }] }, expectedRevision: integer,
        value: { oneOf: [{ type: 'null' }, object({ displayName: text, aliases: { type: 'array', items: text }, notes: text })] } }), output,
      execute: async (value, exec) => options.directory.note(scope(exec), value as Parameters<WorkspaceDirectory['note']>[1], exec.signal) },
    { name: 'human_task_reshare', description: 'Prepare a REAL owner action to send the original entry of an existing task again, without creating another task or changing requirements, participation or submissions. Exactly one successful sourceSurfaceId from this session OR explicitly shared workspaceSourceId. Optional roundId=null/default keeps the original entry; a specific round must be published and public, never private feedback/correction. The current server supplies the public title/summary, not Agent-written replacements. Reuses the original verified group; owner still confirms the native send. This is not an @ mention or reminder; use a separate reminder action if requested. Missing/currently revoked source authority blocks instead of choosing another group.',
      parameters: object({ sourceSurfaceId: text, workspaceSourceId: text, roundId: { oneOf: [text, { type: 'null' }] } }, []),
      output: { schema: { type: 'object' }, render(_args, value) {
        const surface = row(value) && humanSurface(value.surface)
        if (!surface) throw fail('human-surface-invalid', '原任务分享入口无效')
        return [{ type: 'text', text: '原任务的再次发送入口已准备好，尚未发送。用一句业务说明引导主人点击；不会另建任务，也没有自动提醒任何人。' }]
      }, presentationMeta(_args, value) {
        const surface = row(value) && humanSurface(value.surface)
        if (!surface) throw fail('human-surface-invalid', '原任务分享入口无效')
        return { humanSurface: surface as unknown as import('@deepseek-ai/dsh-tools').JsonValue }
      } }, execute: async (value, exec) => {
        const origin = scope(exec)
        if (!row(value) || !exact(value, [], ['sourceSurfaceId', 'workspaceSourceId', 'roundId'])
          || Object.hasOwn(value, 'sourceSurfaceId') === Object.hasOwn(value, 'workspaceSourceId')
          || !plain(exec.callId, 256) || !plain(exec.rootCallId, 256)) throw fail('workspace-input-invalid', '请提供一个准确的原任务来源')
        const target = value.workspaceSourceId !== undefined
          ? await options.directory.resolveSource(origin, String(value.workspaceSourceId), exec.signal)
          : options.core.publishedEvidence(origin, String(value.sourceSurfaceId))
        const roundId = value.roundId === undefined ? null : value.roundId
        if (roundId !== null && !plain(roundId, 128)) throw fail('workspace-input-invalid', '公开提交要求引用无效')
        const content = await options.lifecycle.reshare(origin, target.taskRef, roundId, exec.signal)
        return { surface: await options.core.createReshare({ scope: origin.sessionId, generation: origin.sessionGeneration,
          callId: String(exec.callId), rootCallId: String(exec.rootCallId) }, target.taskRef, roundId, content.title, content.body, exec.signal) }
      } },
  ]
  return definitions.map(tool => ({ ...tool, execute: async (value, exec) => {
    const before = scope(exec), result = await tool.execute(value, exec)
    exec.signal.throwIfAborted()
    if (!sameScope(before, scope(exec))) throw fail('workspace-scope-invalid', '操作期间真实Agent会话已变化')
    return result
  } }))
}
