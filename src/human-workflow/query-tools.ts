import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { exact, fail, plain, row, type WorkflowScope } from './data.js'
import type { WorkflowReplica } from './replica.js'

export function workflowQueryTools(nodeId: string, replica: WorkflowReplica): ToolDefinition[] {
  const scope = (exec: ToolRunContext): WorkflowScope => {
    const agent = exec.agent, header = agent?.session?.header
    if (!agent || agent.id !== agent.session?.id || header?.id !== agent.id || !Number.isSafeInteger(header.createdAt) || header.createdAt < 0)
      throw fail('workflow-scope-invalid', '查询需要真实会话身份')
    return { nodeId, sessionId: String(agent.id), sessionGeneration: String(header.createdAt) }
  }
  return ['list', 'get', 'participants'].map(kind => ({
    name: `human_task_${kind}`,
    description: `Read ${kind === 'list' ? 'tasks' : kind === 'get' ? 'one task' : 'observed participants of one task'} from the authenticated current-node/current-session projection. `
      + 'Inspect freshness before interpreting facts; stale data is not current status. Explain a relevant stale/offline limitation in business language, but do not recite freshness enums, internal IDs or diagnostic metadata in every answer. Counts cover observed participants only, not the whole group. '
      + 'Owner is excluded from participant counts. This is read-only; it never sends, changes task facts or wakes an Agent. No cross-session access.',
    parameters: { type: 'object', properties: { ...(kind !== 'list' ? { taskId: { type: 'string', description: 'Existing task ID, 1 to 128 characters.' } } : {}),
      offset: { type: 'integer', description: 'Nonnegative page offset.' }, limit: { type: 'integer', description: 'Page size from 1 to 50.' } },
      required: kind === 'list' ? [] : ['taskId'], additionalProperties: false },
    output: { schema: { type: 'object' }, render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }] } },
    async execute(value: unknown, exec: ToolRunContext) {
      if (!row(value) || !exact(value, kind === 'list' ? [] : ['taskId'], ['offset', 'limit'])
        || kind !== 'list' && !plain(value.taskId, 128)) throw fail('workflow-query-invalid', '任务查询参数无效')
      return replica.query(scope(exec), { ...(value as { taskId?: string; offset?: number; limit?: number }), participants: kind === 'participants' }, exec.signal)
    },
  }))
}
