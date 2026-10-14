/** Native BasicCompactionEngine extension: only the documented summarize hook
 * changes. Region selection, pricing, cancellation, checkpoints, retention,
 * overflow recovery and persistence remain owned by the installed DSH. */
import { resourceError, resourcePromptValid } from './contract.js'

type Row = Record<string, any>
type NativeEngine = new (...args: any[]) => { ctx: Row; config: Row }

/** Separate authored data from native configuration. Native defaults and
 * exact-route model policies still go through the installed engine's strict
 * validator; no unknown resource field is silently accepted by this wrapper. */
export function chatCompactionConfig(value: unknown): { instruction: string; native: Row } {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['instruction', 'native'].includes(key))
    || !Object.hasOwn(value, 'instruction') || !resourcePromptValid((value as Row).instruction)
    || ((value as Row).native !== undefined && (!(value as Row).native || typeof (value as Row).native !== 'object' || Array.isArray((value as Row).native))))
    throw resourceError('resource-prompt-invalid', 'Chat 摘要配置无效。')
  return { instruction: (value as Row).instruction, native: { ...((value as Row).native ?? {}) } }
}

/** Modules are supplied by the host, not bundled private copies. The factory
 * also allows contract tests without a live model or real session. */
export function createChatCompactionPlugin(native: { BasicCompactionEngine: NativeEngine }, llm: Row, instruction: string) {
  if (!resourcePromptValid(instruction)) throw resourceError('resource-prompt-invalid', 'Chat 摘要正文无效。')
  return class ChatCompaction extends native.BasicCompactionEngine {
    async summarize(input: { messages: readonly Row[]; tools?: readonly Row[] }, agent: Row, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const latest = agent.session.requestHeader()?.config
      const routed = latest?.provider && latest?.model ? latest : agent.options
      const override = this.config.modelPolicies.find((policy: Row) => policy.provider === routed.provider && policy.model === routed.model)
      // Match native exact-route summary policy; the inherited engine already
      // resolved and validated all defaults and model-specific overrides.
      const provider = override?.summarizationProvider ?? this.config.summarizationProvider
      const model = override?.summarizationModel ?? this.config.summarizationModel
      const maxTokens = override?.maxTokens ?? this.config.maxTokens
      const target = provider ? { provider, model } : routed
      if (!target?.provider || !target?.model) throw new Error('No provider/model available for conversation compaction')
      const checkpointRequest = Object.freeze({ role: 'user', content: Object.freeze([
        Object.freeze({ type: 'text', text: instruction }),
      ]) })
      const options = {
        provider: target.provider, model: target.model,
        messages: [...input.messages, checkpointRequest],
        toolHistory: agent.session.toolHistory(),
        ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
        maxTokens, sessionId: agent.session.id, purpose: 'compaction',
        ...(signal === undefined ? {} : { signal }),
      }
      const assembler = new llm.BlockAssembler()
      for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
      signal?.throwIfAborted()
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted')
        throw new llm.LlmError(finish.failure.message, finish.failure.code, finish.failure)
      if (finish.kind === 'max-tokens')
        throw Object.assign(new Error('Conversation checkpoint was truncated'), { code: 'MAX_TOKENS' })
      const rawOutput: Row[] = assembler.blocks()
      // A summary call must never manufacture a tool result or execute a tool.
      if (rawOutput.some(block => !['text', 'reasoning'].includes(block.type)))
        throw new llm.LlmError('Conversation checkpoint must contain text only', 'UNSUPPORTED_CONTENT')
      const summary = rawOutput.filter(block => block.type === 'text')
      if (!summary.some(block => block.text.trim())) throw new Error('Conversation checkpoint contained no text')
      return { summary, rawOutput, llmStreamCall: true as const,
        provider: options.provider, model: options.model, maxTokens,
        ...(assembler.usage === undefined ? {} : { usage: assembler.usage }) }
    }
  }
}

export default async function chatCompaction(ctx: Row, config: unknown) {
  const { instruction, native: nativeConfig } = chatCompactionConfig(config)
  const moduleName = (name: string) => `@deepseek-ai/dsh-${name}`
  const [native, llm] = await Promise.all([import(moduleName('compaction-basic')), import(moduleName('llm'))])
  ctx.plugin(createChatCompactionPlugin(native as { BasicCompactionEngine: NativeEngine }, llm, instruction), nativeConfig)
}
